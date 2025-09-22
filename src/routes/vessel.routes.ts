import { Router } from 'express';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { body, query, param, validationResult } from 'express-validator';

const router = Router();

// Validation middleware
const handleValidationErrors = (req: any, res: any, next: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation hatası',
      errors: errors.array()
    });
  }
  next();
};

/**
 * GET /api/vessels - Gemileri listele
 */
router.get('/', [
  query('status').optional().isIn(['AVAILABLE', 'FIXED', 'INACTIVE']),
  query('laycanFrom').optional().isISO8601(),
  query('laycanTo').optional().isISO8601(),
  query('minDwt').optional().isNumeric(),
  query('maxDwt').optional().isNumeric(),
  query('currentPort').optional().isString(),
  query('features').optional().isString(), // comma-separated
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('sortBy').optional().isIn(['name', 'dwt', 'laycanStart', 'createdAt']),
  query('sortOrder').optional().isIn(['asc', 'desc'])
], handleValidationErrors, async (req, res) => {
  try {
    const {
      status,
      laycanFrom,
      laycanTo,
      minDwt,
      maxDwt,
      currentPort,
      features,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Where clause oluştur
    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (laycanFrom || laycanTo) {
      where.AND = where.AND || [];
      if (laycanFrom) {
        where.AND.push({
          OR: [
            { laycanStart: { gte: new Date(laycanFrom as string) } },
            { laycanEnd: { gte: new Date(laycanFrom as string) } }
          ]
        });
      }
      if (laycanTo) {
        where.AND.push({
          OR: [
            { laycanStart: { lte: new Date(laycanTo as string) } },
            { laycanEnd: { lte: new Date(laycanTo as string) } }
          ]
        });
      }
    }

    if (minDwt) {
      where.dwt = { ...where.dwt, gte: parseFloat(minDwt as string) };
    }

    if (maxDwt) {
      where.dwt = { ...where.dwt, lte: parseFloat(maxDwt as string) };
    }

    if (currentPort) {
      where.currentPort = { contains: currentPort, mode: 'insensitive' };
    }

    if (features) {
      const featureList = (features as string).split(',').map(f => f.trim());
      where.features = { hasEvery: featureList };
    }

    // Pagination
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const take = parseInt(limit as string);

    // Sorting
    const orderBy: any = {};
    orderBy[sortBy as string] = sortOrder;

    // Query
    const [vessels, totalCount] = await Promise.all([
      prisma.vessel.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          matches: {
            where: { status: 'PROPOSED' },
            take: 5,
            orderBy: { matchScore: 'desc' },
            include: {
              cargo: {
                select: {
                  id: true,
                  reference: true,
                  loadPort: true,
                  quantity: true
                }
              }
            }
          }
        }
      }),
      prisma.vessel.count({ where })
    ]);

    const totalPages = Math.ceil(totalCount / take);

    res.json({
      success: true,
      data: {
        vessels,
        pagination: {
          page: parseInt(page as string),
          limit: take,
          totalCount,
          totalPages,
          hasNext: parseInt(page as string) < totalPages,
          hasPrev: parseInt(page as string) > 1
        }
      }
    });

  } catch (error) {
    logger.error('Gemi listesi hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Gemi listesi alınırken hata oluştu',
      error: error instanceof Error ? error.message : 'Bilinmeyen hata'
    });
  }
});

/**
 * GET /api/vessels/:id - Tek gemi detayı
 */
router.get('/:id', [
  param('id').isNumeric()
], handleValidationErrors, async (req, res) => {
  try {
    const vesselId = parseInt(req.params.id);

    const vessel = await prisma.vessel.findUnique({
      where: { id: vesselId },
      include: {
        matches: {
          orderBy: { matchScore: 'desc' },
          include: {
            cargo: true
          }
        }
      }
    });

    if (!vessel) {
      return res.status(404).json({
        success: false,
        message: 'Gemi bulunamadı'
      });
    }

    res.json({
      success: true,
      data: vessel
    });

  } catch (error) {
    logger.error('Gemi detay hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Gemi detayı alınırken hata oluştu',
      error: error instanceof Error ? error.message : 'Bilinmeyen hata'
    });
  }
});

/**
 * POST /api/vessels - Yeni gemi oluştur
 */
router.post('/', [
  body('name').isString().isLength({ min: 1, max: 255 }),
  body('dwt').isNumeric({ min: 0 }),
  body('grainCuft').optional().isNumeric({ min: 0 }),
  body('baleCuft').optional().isNumeric({ min: 0 }),
  body('speedKnots').optional().isNumeric({ min: 1, max: 30 }),
  body('features').optional().isArray(),
  body('currentPort').optional().isString().isLength({ max: 100 }),
  body('laycanStart').optional().isISO8601(),
  body('laycanEnd').optional().isISO8601(),
  body('status').optional().isIn(['AVAILABLE', 'FIXED', 'INACTIVE'])
], handleValidationErrors, async (req, res) => {
  try {
    const {
      name,
      dwt,
      grainCuft,
      baleCuft,
      speedKnots = 12.0,
      features = [],
      currentPort,
      laycanStart,
      laycanEnd,
      status = 'AVAILABLE'
    } = req.body;

    // Laycan validation
    if (laycanStart && laycanEnd) {
      const start = new Date(laycanStart);
      const end = new Date(laycanEnd);
      if (start >= end) {
        return res.status(400).json({
          success: false,
          message: 'Laycan başlangıç tarihi bitiş tarihinden önce olmalıdır'
        });
      }
    }

    const vessel = await prisma.vessel.create({
      data: {
        name: name.trim(),
        dwt: parseFloat(dwt),
        grainCuft: grainCuft ? parseFloat(grainCuft) : null,
        baleCuft: baleCuft ? parseFloat(baleCuft) : null,
        speedKnots: parseFloat(speedKnots),
        features,
        currentPort: currentPort?.trim(),
        laycanStart: laycanStart ? new Date(laycanStart) : null,
        laycanEnd: laycanEnd ? new Date(laycanEnd) : null,
        status
      }
    });

    logger.info(`Yeni gemi oluşturuldu: ${vessel.name} (ID: ${vessel.id})`);

    res.status(201).json({
      success: true,
      message: 'Gemi başarıyla oluşturuldu',
      data: vessel
    });

  } catch (error) {
    logger.error('Gemi oluşturma hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Gemi oluşturulurken hata oluştu',
      error: error instanceof Error ? error.message : 'Bilinmeyen hata'
    });
  }
});

/**
 * PUT /api/vessels/:id - Gemi güncelle
 */
router.put('/:id', [
  param('id').isNumeric(),
  body('name').optional().isString().isLength({ min: 1, max: 255 }),
  body('dwt').optional().isNumeric({ min: 0 }),
  body('grainCuft').optional().isNumeric({ min: 0 }),
  body('baleCuft').optional().isNumeric({ min: 0 }),
  body('speedKnots').optional().isNumeric({ min: 1, max: 30 }),
  body('features').optional().isArray(),
  body('currentPort').optional().isString().isLength({ max: 100 }),
  body('laycanStart').optional().isISO8601(),
  body('laycanEnd').optional().isISO8601(),
  body('status').optional().isIn(['AVAILABLE', 'FIXED', 'INACTIVE'])
], handleValidationErrors, async (req, res) => {
  try {
    const vesselId = parseInt(req.params.id);
    const updateData: any = {};

    // Sadece gönderilen alanları güncelle
    const allowedFields = [
      'name', 'dwt', 'grainCuft', 'baleCuft', 'speedKnots', 
      'features', 'currentPort', 'laycanStart', 'laycanEnd', 'status'
    ];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        if (field === 'laycanStart' || field === 'laycanEnd') {
          updateData[field] = req.body[field] ? new Date(req.body[field]) : null;
        } else if (field === 'name' || field === 'currentPort') {
          updateData[field] = req.body[field]?.trim();
        } else if (field === 'dwt' || field === 'grainCuft' || field === 'baleCuft' || field === 'speedKnots') {
          updateData[field] = parseFloat(req.body[field]);
        } else {
          updateData[field] = req.body[field];
        }
      }
    }

    // Laycan validation
    if (updateData.laycanStart && updateData.laycanEnd) {
      if (updateData.laycanStart >= updateData.laycanEnd) {
        return res.status(400).json({
          success: false,
          message: 'Laycan başlangıç tarihi bitiş tarihinden önce olmalıdır'
        });
      }
    }

    const vessel = await prisma.vessel.update({
      where: { id: vesselId },
      data: updateData
    });

    logger.info(`Gemi güncellendi: ${vessel.name} (ID: ${vessel.id})`);

    res.json({
      success: true,
      message: 'Gemi başarıyla güncellendi',
      data: vessel
    });

  } catch (error) {
    if (error instanceof Error && error.message.includes('Record to update not found')) {
      return res.status(404).json({
        success: false,
        message: 'Gemi bulunamadı'
      });
    }

    logger.error('Gemi güncelleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Gemi güncellenirken hata oluştu',
      error: error instanceof Error ? error.message : 'Bilinmeyen hata'
    });
  }
});

/**
 * DELETE /api/vessels/:id - Gemi sil
 */
router.delete('/:id', [
  param('id').isNumeric()
], handleValidationErrors, async (req, res) => {
  try {
    const vesselId = parseInt(req.params.id);

    // Önce gemiyi kontrol et
    const vessel = await prisma.vessel.findUnique({
      where: { id: vesselId },
      include: {
        matches: true
      }
    });

    if (!vessel) {
      return res.status(404).json({
        success: false,
        message: 'Gemi bulunamadı'
      });
    }

    // Aktif eşleştirmeleri kontrol et
    const activeMatches = vessel.matches.filter(m => m.status === 'ACCEPTED');
    if (activeMatches.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Aktif eşleştirmeleri olan gemi silinemez'
      });
    }

    await prisma.vessel.delete({
      where: { id: vesselId }
    });

    logger.info(`Gemi silindi: ${vessel.name} (ID: ${vesselId})`);

    res.json({
      success: true,
      message: 'Gemi başarıyla silindi'
    });

  } catch (error) {
    logger.error('Gemi silme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Gemi silinirken hata oluştu',
      error: error instanceof Error ? error.message : 'Bilinmeyen hata'
    });
  }
});

/**
 * GET /api/vessels/:id/matches - Geminin eşleştirmelerini getir
 */
router.get('/:id/matches', [
  param('id').isNumeric(),
  query('status').optional().isIn(['PROPOSED', 'ACCEPTED', 'REJECTED', 'EXPIRED']),
  query('minScore').optional().isNumeric({ min: 0, max: 100 })
], handleValidationErrors, async (req, res) => {
  try {
    const vesselId = parseInt(req.params.id);
    const { status, minScore } = req.query;

    const where: any = { vesselId };
    
    if (status) {
      where.status = status;
    }
    
    if (minScore) {
      where.matchScore = { gte: parseFloat(minScore as string) };
    }

    const matches = await prisma.vesselCargoMatch.findMany({
      where,
      orderBy: { matchScore: 'desc' },
      include: {
        cargo: true
      }
    });

    res.json({
      success: true,
      data: matches
    });

  } catch (error) {
    logger.error('Gemi eşleştirme listesi hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Gemi eşleştirmeleri alınırken hata oluştu',
      error: error instanceof Error ? error.message : 'Bilinmeyen hata'
    });
  }
});

/**
 * POST /api/vessels/bulk - Toplu gemi oluştur
 */
router.post('/bulk', [
  body('vessels').isArray({ min: 1, max: 100 }),
  body('vessels.*.name').isString().isLength({ min: 1, max: 255 }),
  body('vessels.*.dwt').isNumeric({ min: 0 })
], handleValidationErrors, async (req, res) => {
  try {
    const { vessels } = req.body;
    const createdVessels = [];
    const errors = [];

    for (let i = 0; i < vessels.length; i++) {
      try {
        const vesselData = vessels[i];
        const vessel = await prisma.vessel.create({
          data: {
            name: vesselData.name.trim(),
            dwt: parseFloat(vesselData.dwt),
            grainCuft: vesselData.grainCuft ? parseFloat(vesselData.grainCuft) : null,
            baleCuft: vesselData.baleCuft ? parseFloat(vesselData.baleCuft) : null,
            speedKnots: vesselData.speedKnots ? parseFloat(vesselData.speedKnots) : 12.0,
            features: vesselData.features || [],
            currentPort: vesselData.currentPort?.trim(),
            laycanStart: vesselData.laycanStart ? new Date(vesselData.laycanStart) : null,
            laycanEnd: vesselData.laycanEnd ? new Date(vesselData.laycanEnd) : null,
            status: vesselData.status || 'AVAILABLE'
          }
        });
        createdVessels.push(vessel);
      } catch (error) {
        errors.push({
          index: i,
          vessel: vessels[i].name,
          error: error instanceof Error ? error.message : 'Bilinmeyen hata'
        });
      }
    }

    logger.info(`Toplu gemi oluşturma: ${createdVessels.length} başarılı, ${errors.length} hata`);

    res.status(201).json({
      success: true,
      message: `${createdVessels.length} gemi oluşturuldu`,
      data: {
        created: createdVessels,
        errors
      }
    });

  } catch (error) {
    logger.error('Toplu gemi oluşturma hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Toplu gemi oluşturulurken hata oluştu',
      error: error instanceof Error ? error.message : 'Bilinmeyen hata'
    });
  }
});

export default router;
