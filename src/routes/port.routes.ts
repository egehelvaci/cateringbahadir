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
 * Haversine formülü ile mesafe hesaplama
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R_nm = 3440.065; // Dünya yarıçapı (nautical miles)
  const lat1Rad = (lat1 * Math.PI) / 180;
  const lon1Rad = (lon1 * Math.PI) / 180;
  const lat2Rad = (lat2 * Math.PI) / 180;
  const lon2Rad = (lon2 * Math.PI) / 180;

  const dlat = lat2Rad - lat1Rad;
  const dlon = lon2Rad - lon1Rad;

  const a = Math.sin(dlat / 2) ** 2 + 
            Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dlon / 2) ** 2;
  const c = 2 * Math.asin(Math.sqrt(a));

  return R_nm * c;
}

/**
 * GET /api/ports - Limanları listele
 */
router.get('/', [
  query('search').optional().isString().isLength({ min: 1, max: 100 }),
  query('country').optional().isString().isLength({ min: 1, max: 50 }),
  query('type').optional().isString(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('sortBy').optional().isIn(['name', 'country', 'type', 'createdAt']),
  query('sortOrder').optional().isIn(['asc', 'desc'])
], handleValidationErrors, async (req, res) => {
  try {
    const {
      search,
      country,
      type,
      page = 1,
      limit = 50,
      sortBy = 'name',
      sortOrder = 'asc'
    } = req.query;

    // Where clause oluştur
    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { alternateNames: { path: '$[*]', string_contains: search } }
      ];
    }

    if (country) {
      where.country = { contains: country, mode: 'insensitive' };
    }

    if (type) {
      where.type = type;
    }

    // Pagination
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const take = parseInt(limit as string);

    // Sorting
    const orderBy: any = {};
    orderBy[sortBy as string] = sortOrder;

    // Query
    const [ports, totalCount] = await Promise.all([
      prisma.port.findMany({
        where,
        skip,
        take,
        orderBy
      }),
      prisma.port.count({ where })
    ]);

    const totalPages = Math.ceil(totalCount / take);

    res.json({
      success: true,
      data: {
        ports,
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
    logger.error('Liman listesi hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Liman listesi alınırken hata oluştu',
      error: error instanceof Error ? error.message : 'Bilinmeyen hata'
    });
  }
});

/**
 * GET /api/ports/:id - Tek liman detayı
 */
router.get('/:id', [
  param('id').isNumeric()
], handleValidationErrors, async (req, res) => {
  try {
    const portId = parseInt(req.params.id);

    const port = await prisma.port.findUnique({
      where: { id: portId }
    });

    if (!port) {
      return res.status(404).json({
        success: false,
        message: 'Liman bulunamadı'
      });
    }

    res.json({
      success: true,
      data: port
    });

  } catch (error) {
    logger.error('Liman detay hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Liman detayı alınırken hata oluştu',
      error: error instanceof Error ? error.message : 'Bilinmeyen hata'
    });
  }
});

/**
 * POST /api/ports - Yeni liman oluştur
 */
router.post('/', [
  body('name').isString().isLength({ min: 1, max: 100 }),
  body('country').isString().isLength({ min: 1, max: 50 }),
  body('latitude').isNumeric({ min: -90, max: 90 }),
  body('longitude').isNumeric({ min: -180, max: 180 }),
  body('alternateNames').optional().isArray(),
  body('type').optional().isString().isLength({ max: 50 })
], handleValidationErrors, async (req, res) => {
  try {
    const {
      name,
      country,
      latitude,
      longitude,
      alternateNames = [],
      type
    } = req.body;

    // Aynı isimde liman var mı kontrol et
    const existingPort = await prisma.port.findUnique({
      where: { name: name.trim() }
    });

    if (existingPort) {
      return res.status(400).json({
        success: false,
        message: 'Bu isimde bir liman zaten mevcut'
      });
    }

    const port = await prisma.port.create({
      data: {
        name: name.trim(),
        country: country.trim(),
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        alternateNames,
        type: type?.trim()
      }
    });

    logger.info(`Yeni liman oluşturuldu: ${port.name} (ID: ${port.id})`);

    res.status(201).json({
      success: true,
      message: 'Liman başarıyla oluşturuldu',
      data: port
    });

  } catch (error) {
    logger.error('Liman oluşturma hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Liman oluşturulurken hata oluştu',
      error: error instanceof Error ? error.message : 'Bilinmeyen hata'
    });
  }
});

/**
 * PUT /api/ports/:id - Liman güncelle
 */
router.put('/:id', [
  param('id').isNumeric(),
  body('name').optional().isString().isLength({ min: 1, max: 100 }),
  body('country').optional().isString().isLength({ min: 1, max: 50 }),
  body('latitude').optional().isNumeric({ min: -90, max: 90 }),
  body('longitude').optional().isNumeric({ min: -180, max: 180 }),
  body('alternateNames').optional().isArray(),
  body('type').optional().isString().isLength({ max: 50 })
], handleValidationErrors, async (req, res) => {
  try {
    const portId = parseInt(req.params.id);
    const updateData: any = {};

    // Sadece gönderilen alanları güncelle
    const allowedFields = ['name', 'country', 'latitude', 'longitude', 'alternateNames', 'type'];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        if (field === 'name' || field === 'country' || field === 'type') {
          updateData[field] = req.body[field]?.trim();
        } else if (field === 'latitude' || field === 'longitude') {
          updateData[field] = parseFloat(req.body[field]);
        } else {
          updateData[field] = req.body[field];
        }
      }
    }

    // İsim güncelleniyorsa benzersizlik kontrolü
    if (updateData.name) {
      const existingPort = await prisma.port.findFirst({
        where: {
          name: updateData.name,
          id: { not: portId }
        }
      });

      if (existingPort) {
        return res.status(400).json({
          success: false,
          message: 'Bu isimde bir liman zaten mevcut'
        });
      }
    }

    const port = await prisma.port.update({
      where: { id: portId },
      data: updateData
    });

    logger.info(`Liman güncellendi: ${port.name} (ID: ${port.id})`);

    res.json({
      success: true,
      message: 'Liman başarıyla güncellendi',
      data: port
    });

  } catch (error) {
    if (error instanceof Error && error.message.includes('Record to update not found')) {
      return res.status(404).json({
        success: false,
        message: 'Liman bulunamadı'
      });
    }

    logger.error('Liman güncelleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Liman güncellenirken hata oluştu',
      error: error instanceof Error ? error.message : 'Bilinmeyen hata'
    });
  }
});

/**
 * DELETE /api/ports/:id - Liman sil
 */
router.delete('/:id', [
  param('id').isNumeric()
], handleValidationErrors, async (req, res) => {
  try {
    const portId = parseInt(req.params.id);

    const port = await prisma.port.findUnique({
      where: { id: portId }
    });

    if (!port) {
      return res.status(404).json({
        success: false,
        message: 'Liman bulunamadı'
      });
    }

    await prisma.port.delete({
      where: { id: portId }
    });

    logger.info(`Liman silindi: ${port.name} (ID: ${portId})`);

    res.json({
      success: true,
      message: 'Liman başarıyla silindi'
    });

  } catch (error) {
    logger.error('Liman silme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Liman silinirken hata oluştu',
      error: error instanceof Error ? error.message : 'Bilinmeyen hata'
    });
  }
});

/**
 * GET /api/ports/calculate-distance - İki liman arası mesafe hesapla
 */
router.get('/calculate-distance', [
  query('from').isString().isLength({ min: 1, max: 100 }),
  query('to').isString().isLength({ min: 1, max: 100 }),
  query('routeFactor').optional().isNumeric({ min: 1, max: 2 })
], handleValidationErrors, async (req, res) => {
  try {
    const { from, to, routeFactor = 1.20 } = req.query;

    // Limanları bul
    const [fromPort, toPort] = await Promise.all([
      prisma.port.findFirst({
        where: {
          OR: [
            { name: { contains: from as string, mode: 'insensitive' } },
            { alternateNames: { path: '$[*]', string_contains: from as string } }
          ]
        }
      }),
      prisma.port.findFirst({
        where: {
          OR: [
            { name: { contains: to as string, mode: 'insensitive' } },
            { alternateNames: { path: '$[*]', string_contains: to as string } }
          ]
        }
      })
    ]);

    if (!fromPort) {
      return res.status(404).json({
        success: false,
        message: `Çıkış limanı bulunamadı: ${from}`
      });
    }

    if (!toPort) {
      return res.status(404).json({
        success: false,
        message: `Varış limanı bulunamadı: ${to}`
      });
    }

    // Mesafe hesapla
    const directDistance = calculateDistance(
      fromPort.latitude, fromPort.longitude,
      toPort.latitude, toPort.longitude
    );

    const routeDistance = directDistance * parseFloat(routeFactor as string);

    // Seyir süresi hesapla (12 knots varsayılan hız)
    const sailingTimeHours12kn = routeDistance / 12;
    const sailingDays12kn = sailingTimeHours12kn / 24;

    res.json({
      success: true,
      data: {
        fromPort: {
          id: fromPort.id,
          name: fromPort.name,
          coordinates: [fromPort.latitude, fromPort.longitude]
        },
        toPort: {
          id: toPort.id,
          name: toPort.name,
          coordinates: [toPort.latitude, toPort.longitude]
        },
        distance: {
          directNauticalMiles: Math.round(directDistance * 100) / 100,
          routeNauticalMiles: Math.round(routeDistance * 100) / 100,
          routeFactor: parseFloat(routeFactor as string)
        },
        sailingTime: {
          at12Knots: {
            hours: Math.round(sailingTimeHours12kn * 100) / 100,
            days: Math.round(sailingDays12kn * 100) / 100
          }
        }
      }
    });

  } catch (error) {
    logger.error('Mesafe hesaplama hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Mesafe hesaplanırken hata oluştu',
      error: error instanceof Error ? error.message : 'Bilinmeyen hata'
    });
  }
});

/**
 * POST /api/ports/bulk - Toplu liman oluştur
 */
router.post('/bulk', [
  body('ports').isArray({ min: 1, max: 100 }),
  body('ports.*.name').isString().isLength({ min: 1, max: 100 }),
  body('ports.*.country').isString().isLength({ min: 1, max: 50 }),
  body('ports.*.latitude').isNumeric({ min: -90, max: 90 }),
  body('ports.*.longitude').isNumeric({ min: -180, max: 180 })
], handleValidationErrors, async (req, res) => {
  try {
    const { ports } = req.body;
    const createdPorts = [];
    const errors = [];

    for (let i = 0; i < ports.length; i++) {
      try {
        const portData = ports[i];

        // Aynı isimde liman var mı kontrol et
        const existingPort = await prisma.port.findUnique({
          where: { name: portData.name.trim() }
        });

        if (existingPort) {
          errors.push({
            index: i,
            port: portData.name,
            error: 'Bu isimde bir liman zaten mevcut'
          });
          continue;
        }

        const port = await prisma.port.create({
          data: {
            name: portData.name.trim(),
            country: portData.country.trim(),
            latitude: parseFloat(portData.latitude),
            longitude: parseFloat(portData.longitude),
            alternateNames: portData.alternateNames || [],
            type: portData.type?.trim()
          }
        });
        createdPorts.push(port);
      } catch (error) {
        errors.push({
          index: i,
          port: ports[i].name,
          error: error instanceof Error ? error.message : 'Bilinmeyen hata'
        });
      }
    }

    logger.info(`Toplu liman oluşturma: ${createdPorts.length} başarılı, ${errors.length} hata`);

    res.status(201).json({
      success: true,
      message: `${createdPorts.length} liman oluşturuldu`,
      data: {
        created: createdPorts,
        errors
      }
    });

  } catch (error) {
    logger.error('Toplu liman oluşturma hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Toplu liman oluşturulurken hata oluştu',
      error: error instanceof Error ? error.message : 'Bilinmeyen hata'
    });
  }
});

/**
 * GET /api/ports/search-suggestions - Liman arama önerileri
 */
router.get('/search-suggestions', [
  query('q').isString().isLength({ min: 1, max: 50 }),
  query('limit').optional().isInt({ min: 1, max: 20 })
], handleValidationErrors, async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;

    const ports = await prisma.port.findMany({
      where: {
        OR: [
          { name: { contains: q as string, mode: 'insensitive' } },
          { alternateNames: { path: '$[*]', string_contains: q as string } }
        ]
      },
      select: {
        id: true,
        name: true,
        country: true,
        alternateNames: true
      },
      take: parseInt(limit as string),
      orderBy: { name: 'asc' }
    });

    const suggestions = ports.map(port => ({
      id: port.id,
      name: port.name,
      country: port.country,
      displayName: `${port.name}, ${port.country}`,
      alternateNames: port.alternateNames
    }));

    res.json({
      success: true,
      data: suggestions
    });

  } catch (error) {
    logger.error('Liman arama önerileri hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Liman arama önerileri alınırken hata oluştu',
      error: error instanceof Error ? error.message : 'Bilinmeyen hata'
    });
  }
});

/**
 * POST /api/ports/seed-default - Varsayılan limanları ekle
 */
router.post('/seed-default', async (req, res) => {
  try {
    const defaultPorts = [
      { name: 'Gemlik', country: 'Turkey', latitude: 40.43, longitude: 29.15, type: 'seaport' },
      { name: 'Eleusis', country: 'Greece', latitude: 38.04, longitude: 23.54, type: 'seaport', alternateNames: ['Elefsina'] },
      { name: 'Odessa', country: 'Ukraine', latitude: 46.49, longitude: 30.73, type: 'seaport' },
      { name: 'Batumi', country: 'Georgia', latitude: 41.65, longitude: 41.65, type: 'seaport' },
      { name: 'Constanta', country: 'Romania', latitude: 44.17, longitude: 28.65, type: 'seaport' },
      { name: 'Izmir', country: 'Turkey', latitude: 38.44, longitude: 27.15, type: 'seaport' },
      { name: 'Aliaga', country: 'Turkey', latitude: 38.80, longitude: 26.97, type: 'seaport' },
      { name: 'Iskenderun', country: 'Turkey', latitude: 36.60, longitude: 36.17, type: 'seaport' },
      { name: 'Braila', country: 'Romania', latitude: 45.27, longitude: 27.96, type: 'river' },
      { name: 'Chornomorsk', country: 'Ukraine', latitude: 46.30, longitude: 30.66, type: 'seaport', alternateNames: ['Illichivsk'] },
      { name: 'Varna', country: 'Bulgaria', latitude: 43.20, longitude: 27.92, type: 'seaport' },
      { name: 'Alexandria', country: 'Egypt', latitude: 31.20, longitude: 29.92, type: 'seaport' },
      { name: 'Casablanca', country: 'Morocco', latitude: 33.60, longitude: -7.62, type: 'seaport' },
      { name: 'Novorossiysk', country: 'Russia', latitude: 44.72, longitude: 37.77, type: 'seaport' },
      { name: 'Rijeka', country: 'Croatia', latitude: 45.33, longitude: 14.44, type: 'seaport' },
      { name: 'Tarragona', country: 'Spain', latitude: 41.11, longitude: 1.25, type: 'seaport' },
      { name: 'Monopoli', country: 'Italy', latitude: 40.95, longitude: 17.30, type: 'seaport' },
      { name: 'Volos', country: 'Greece', latitude: 39.36, longitude: 22.95, type: 'seaport' }
    ];

    const createdPorts = [];
    const skippedPorts = [];

    for (const portData of defaultPorts) {
      try {
        // Zaten var mı kontrol et
        const existing = await prisma.port.findUnique({
          where: { name: portData.name }
        });

        if (existing) {
          skippedPorts.push(portData.name);
          continue;
        }

        const port = await prisma.port.create({
          data: portData
        });
        createdPorts.push(port);
      } catch (error) {
        logger.error(`Varsayılan liman oluşturma hatası (${portData.name}):`, error);
      }
    }

    logger.info(`Varsayılan limanlar: ${createdPorts.length} oluşturuldu, ${skippedPorts.length} atlandı`);

    res.json({
      success: true,
      message: `${createdPorts.length} varsayılan liman oluşturuldu`,
      data: {
        created: createdPorts.length,
        skipped: skippedPorts.length,
        skippedPorts
      }
    });

  } catch (error) {
    logger.error('Varsayılan liman oluşturma hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Varsayılan limanlar oluşturulurken hata oluştu',
      error: error instanceof Error ? error.message : 'Bilinmeyen hata'
    });
  }
});

export default router;
