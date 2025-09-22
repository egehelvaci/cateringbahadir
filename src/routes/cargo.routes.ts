import { Router, Request, Response } from 'express';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { body, query, param, validationResult } from 'express-validator';

const router = Router();

// Validation middleware
const handleValidationErrors = (req: Request, res: Response, next: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation hatası',
      errors: errors.array()
    });
  }
  return next();
};

/**
 * GET /api/cargos - Yükleri listele
 */
router.get('/', [
  query('status').optional().isIn(['AVAILABLE', 'FIXED', 'CANCELLED']),
  query('laycanFrom').optional().isISO8601(),
  query('laycanTo').optional().isISO8601(),
  query('minQuantity').optional().isNumeric(),
  query('maxQuantity').optional().isNumeric(),
  query('loadPort').optional().isString(),
  query('requirements').optional().isString(), // comma-separated
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('sortBy').optional().isIn(['reference', 'quantity', 'laycanStart', 'createdAt']),
  query('sortOrder').optional().isIn(['asc', 'desc'])
], handleValidationErrors, async (req: Request, res: Response) => {
  try {
    const {
      status,
      laycanFrom,
      laycanTo,
      minQuantity,
      maxQuantity,
      loadPort,
      requirements,
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

    if (minQuantity) {
      where.quantity = { ...where.quantity, gte: parseFloat(minQuantity as string) };
    }

    if (maxQuantity) {
      where.quantity = { ...where.quantity, lte: parseFloat(maxQuantity as string) };
    }

    if (loadPort) {
      where.loadPort = { contains: loadPort, mode: 'insensitive' };
    }

    if (requirements) {
      const requirementList = (requirements as string).split(',').map(r => r.trim());
      where.requirements = { hasEvery: requirementList };
    }

    // Pagination
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const take = parseInt(limit as string);

    // Sorting
    const orderBy: any = {};
    orderBy[sortBy as string] = sortOrder;

    // Query
    const [cargos, totalCount] = await Promise.all([
      prisma.cargo.findMany({
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
              vessel: {
                select: {
                  id: true,
                  name: true,
                  dwt: true,
                  currentPort: true
                }
              }
            }
          }
        }
      }),
      prisma.cargo.count({ where })
    ]);

    const totalPages = Math.ceil(totalCount / take);

    res.json({
      success: true,
      data: {
        cargos,
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
    logger.error('Yük listesi hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Yük listesi alınırken hata oluştu',
      error: error instanceof Error ? error.message : 'Bilinmeyen hata'
    });
  }
});

/**
 * GET /api/cargos/:id - Tek yük detayı
 */
router.get('/:id', [
  param('id').isNumeric()
], handleValidationErrors, async (req: Request, res: Response) => {
  try {
    const cargoId = parseInt(req.params.id);

    const cargo = await prisma.cargo.findUnique({
      where: { id: cargoId },
      include: {
        matches: {
          orderBy: { matchScore: 'desc' },
          include: {
            vessel: true
          }
        }
      }
    });

    if (!cargo) {
      return res.status(404).json({
        success: false,
        message: 'Yük bulunamadı'
      });
    }

    res.json({
      success: true,
      data: cargo
    });

  } catch (error) {
    logger.error('Yük detay hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Yük detayı alınırken hata oluştu',
      error: error instanceof Error ? error.message : 'Bilinmeyen hata'
    });
  }
});

/**
 * POST /api/cargos - Yeni yük oluştur
 */
router.post('/', [
  body('reference').isString().isLength({ min: 1, max: 500 }),
  body('loadPort').isString().isLength({ min: 1, max: 100 }),
  body('laycanStart').isISO8601(),
  body('laycanEnd').isISO8601(),
  body('quantity').isNumeric(),
  body('stowageFactorValue').optional().isNumeric(),
  body('stowageFactorUnit').optional().isIn(['cuft/mt', 'm3/mt', 'cbm/mt']),
  body('brokenStowagePct').optional().isNumeric(),
  body('requirements').optional().isArray(),
  body('status').optional().isIn(['AVAILABLE', 'FIXED', 'CANCELLED'])
], handleValidationErrors, async (req: Request, res: Response) => {
  try {
    const {
      reference,
      loadPort,
      laycanStart,
      laycanEnd,
      quantity,
      stowageFactorValue,
      stowageFactorUnit = 'cuft/mt',
      brokenStowagePct = 5.0,
      requirements = [],
      status = 'AVAILABLE'
    } = req.body;

    // Laycan validation
    const start = new Date(laycanStart);
    const end = new Date(laycanEnd);
    if (start >= end) {
      return res.status(400).json({
        success: false,
        message: 'Laycan başlangıç tarihi bitiş tarihinden önce olmalıdır'
      });
    }

    const cargo = await prisma.cargo.create({
      data: {
        reference: reference.trim(),
        loadPort: loadPort.trim(),
        laycanStart: start,
        laycanEnd: end,
        quantity: parseFloat(quantity),
        stowageFactorValue: stowageFactorValue ? parseFloat(stowageFactorValue) : null,
        stowageFactorUnit,
        brokenStowagePct: parseFloat(brokenStowagePct),
        requirements,
        status
      }
    });

    logger.info(`Yeni yük oluşturuldu: ${cargo.reference} (ID: ${cargo.id})`);

    res.status(201).json({
      success: true,
      message: 'Yük başarıyla oluşturuldu',
      data: cargo
    });

  } catch (error) {
    logger.error('Yük oluşturma hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Yük oluşturulurken hata oluştu',
      error: error instanceof Error ? error.message : 'Bilinmeyen hata'
    });
  }
});

/**
 * PUT /api/cargos/:id - Yük güncelle
 */
router.put('/:id', [
  param('id').isNumeric(),
  body('reference').optional().isString().isLength({ min: 1, max: 500 }),
  body('loadPort').optional().isString().isLength({ min: 1, max: 100 }),
  body('laycanStart').optional().isISO8601(),
  body('laycanEnd').optional().isISO8601(),
  body('quantity').optional().isNumeric(),
  body('stowageFactorValue').optional().isNumeric(),
  body('stowageFactorUnit').optional().isIn(['cuft/mt', 'm3/mt', 'cbm/mt']),
  body('brokenStowagePct').optional().isNumeric(),
  body('requirements').optional().isArray(),
  body('status').optional().isIn(['AVAILABLE', 'FIXED', 'CANCELLED'])
], handleValidationErrors, async (req: Request, res: Response) => {
  try {
    const cargoId = parseInt(req.params.id);
    const updateData: any = {};

    // Sadece gönderilen alanları güncelle
    const allowedFields = [
      'reference', 'loadPort', 'laycanStart', 'laycanEnd', 'quantity',
      'stowageFactorValue', 'stowageFactorUnit', 'brokenStowagePct', 
      'requirements', 'status'
    ];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        if (field === 'laycanStart' || field === 'laycanEnd') {
          updateData[field] = new Date(req.body[field]);
        } else if (field === 'reference' || field === 'loadPort') {
          updateData[field] = req.body[field].trim();
        } else if (field === 'quantity' || field === 'stowageFactorValue' || field === 'brokenStowagePct') {
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

    const cargo = await prisma.cargo.update({
      where: { id: cargoId },
      data: updateData
    });

    logger.info(`Yük güncellendi: ${cargo.reference} (ID: ${cargo.id})`);

    res.json({
      success: true,
      message: 'Yük başarıyla güncellendi',
      data: cargo
    });

  } catch (error) {
    if (error instanceof Error && error.message.includes('Record to update not found')) {
      return res.status(404).json({
        success: false,
        message: 'Yük bulunamadı'
      });
    }

    logger.error('Yük güncelleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Yük güncellenirken hata oluştu',
      error: error instanceof Error ? error.message : 'Bilinmeyen hata'
    });
  }
});

/**
 * DELETE /api/cargos/:id - Yük sil
 */
router.delete('/:id', [
  param('id').isNumeric()
], handleValidationErrors, async (req: Request, res: Response) => {
  try {
    const cargoId = parseInt(req.params.id);

    // Önce yükü kontrol et
    const cargo = await prisma.cargo.findUnique({
      where: { id: cargoId },
      include: {
        matches: true
      }
    });

    if (!cargo) {
      return res.status(404).json({
        success: false,
        message: 'Yük bulunamadı'
      });
    }

    // Aktif eşleştirmeleri kontrol et
    const activeMatches = cargo.matches.filter(m => m.status === 'ACCEPTED');
    if (activeMatches.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Aktif eşleştirmeleri olan yük silinemez'
      });
    }

    await prisma.cargo.delete({
      where: { id: cargoId }
    });

    logger.info(`Yük silindi: ${cargo.reference} (ID: ${cargoId})`);

    res.json({
      success: true,
      message: 'Yük başarıyla silindi'
    });

  } catch (error) {
    logger.error('Yük silme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Yük silinirken hata oluştu',
      error: error instanceof Error ? error.message : 'Bilinmeyen hata'
    });
  }
});

/**
 * GET /api/cargos/:id/matches - Yükün eşleştirmelerini getir
 */
router.get('/:id/matches', [
  param('id').isNumeric(),
  query('status').optional().isIn(['PROPOSED', 'ACCEPTED', 'REJECTED', 'EXPIRED']),
  query('minScore').optional().isNumeric()
], handleValidationErrors, async (req: Request, res: Response) => {
  try {
    const cargoId = parseInt(req.params.id);
    const { status, minScore } = req.query;

    const where: any = { cargoId };
    
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
        vessel: true
      }
    });

    res.json({
      success: true,
      data: matches
    });

  } catch (error) {
    logger.error('Yük eşleştirme listesi hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Yük eşleştirmeleri alınırken hata oluştu',
      error: error instanceof Error ? error.message : 'Bilinmeyen hata'
    });
  }
});

/**
 * POST /api/cargos/bulk - Toplu yük oluştur
 */
router.post('/bulk', [
  body('cargos').isArray({ min: 1, max: 100 }),
  body('cargos.*.reference').isString().isLength({ min: 1, max: 500 }),
  body('cargos.*.loadPort').isString().isLength({ min: 1, max: 100 }),
  body('cargos.*.laycanStart').isISO8601(),
  body('cargos.*.laycanEnd').isISO8601(),
  body('cargos.*.quantity').isNumeric()
], handleValidationErrors, async (req: Request, res: Response) => {
  try {
    const { cargos } = req.body;
    const createdCargos = [];
    const errors = [];

    for (let i = 0; i < cargos.length; i++) {
      try {
        const cargoData = cargos[i];
        
        // Laycan validation
        const start = new Date(cargoData.laycanStart);
        const end = new Date(cargoData.laycanEnd);
        if (start >= end) {
          errors.push({
            index: i,
            cargo: cargoData.reference,
            error: 'Laycan başlangıç tarihi bitiş tarihinden önce olmalıdır'
          });
          continue;
        }

        const cargo = await prisma.cargo.create({
          data: {
            reference: cargoData.reference.trim(),
            loadPort: cargoData.loadPort.trim(),
            laycanStart: start,
            laycanEnd: end,
            quantity: parseFloat(cargoData.quantity),
            stowageFactorValue: cargoData.stowageFactorValue ? parseFloat(cargoData.stowageFactorValue) : null,
            stowageFactorUnit: cargoData.stowageFactorUnit || 'cuft/mt',
            brokenStowagePct: cargoData.brokenStowagePct ? parseFloat(cargoData.brokenStowagePct) : 5.0,
            requirements: cargoData.requirements || [],
            status: cargoData.status || 'AVAILABLE'
          }
        });
        createdCargos.push(cargo);
      } catch (error) {
        errors.push({
          index: i,
          cargo: cargos[i].reference,
          error: error instanceof Error ? error.message : 'Bilinmeyen hata'
        });
      }
    }

    logger.info(`Toplu yük oluşturma: ${createdCargos.length} başarılı, ${errors.length} hata`);

    res.status(201).json({
      success: true,
      message: `${createdCargos.length} yük oluşturuldu`,
      data: {
        created: createdCargos,
        errors
      }
    });

  } catch (error) {
    logger.error('Toplu yük oluşturma hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Toplu yük oluşturulurken hata oluştu',
      error: error instanceof Error ? error.message : 'Bilinmeyen hata'
    });
  }
});

/**
 * GET /api/cargos/:id/calculate-volume - Yük hacmini hesapla
 */
router.get('/:id/calculate-volume', [
  param('id').isNumeric()
], handleValidationErrors, async (req: Request, res: Response) => {
  try {
    const cargoId = parseInt(req.params.id);

    const cargo = await prisma.cargo.findUnique({
      where: { id: cargoId }
    });

    if (!cargo) {
      return res.status(404).json({
        success: false,
        message: 'Yük bulunamadı'
      });
    }

    let neededVolume = null;
    let calculations = null;

    if (cargo.stowageFactorValue && cargo.quantity) {
      let sfCuft = cargo.stowageFactorValue;
      
      // m3/mt ise cuft'a dönüştür
      if (cargo.stowageFactorUnit === 'm3/mt' || cargo.stowageFactorUnit === 'cbm/mt') {
        sfCuft = cargo.stowageFactorValue * 35.3147;
      }

      const brokenStowage = 1 + (cargo.brokenStowagePct / 100);
      neededVolume = cargo.quantity * sfCuft * brokenStowage;

      calculations = {
        quantity: cargo.quantity,
        stowageFactorOriginal: cargo.stowageFactorValue,
        stowageFactorUnit: cargo.stowageFactorUnit,
        stowageFactorCuft: sfCuft,
        brokenStowagePercent: cargo.brokenStowagePct,
        brokenStowageFactor: brokenStowage,
        neededVolumeCuft: neededVolume,
        neededVolumeM3: neededVolume / 35.3147
      };
    }

    res.json({
      success: true,
      data: {
        cargoId: cargo.id,
        reference: cargo.reference,
        neededVolume,
        calculations
      }
    });

  } catch (error) {
    logger.error('Yük hacim hesaplama hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Yük hacmi hesaplanırken hata oluştu',
      error: error instanceof Error ? error.message : 'Bilinmeyen hata'
    });
  }
});

export default router;
