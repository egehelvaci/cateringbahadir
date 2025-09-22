import { Router } from 'express';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { body, query, param, validationResult } from 'express-validator';
import { VesselCargoParsingService } from '../services/vessel-cargo-parsing.service';
import { VesselCargoMatchingService } from '../services/vessel-cargo-matching.service';
import { MailExportService } from '../services/mail-export.service';
import * as path from 'path';
import * as fs from 'fs';

const router = Router();
const parsingService = new VesselCargoParsingService();
const matchingService = new VesselCargoMatchingService();
const mailExportService = new MailExportService();

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
 * POST /api/vessel-cargo/import-mail - Mail dosyasından gemi/yük bilgilerini import et
 */
router.post('/import-mail', [
  body('fileName').isString().isLength({ min: 1, max: 255 }),
  body('processType').optional().isIn(['full', 'incremental'])
], handleValidationErrors, async (req, res) => {
  try {
    const { fileName, processType = 'full' } = req.body;
    const startTime = Date.now();

    // Export dizinindeki dosyayı bul
    const exportsDir = path.join(process.cwd(), 'exports');
    const filePath = path.join(exportsDir, fileName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'Dosya bulunamadı'
      });
    }

    logger.info(`Mail import başlatılıyor: ${fileName}`);

    // Mail dosyasını parse et
    const parseResult = await parsingService.parseMailFile(filePath);

    if (parseResult.errors.length > 0) {
      logger.warn('Parse işleminde hatalar:', parseResult.errors);
    }

    // Veritabanına kaydet
    const { vesselIds, cargoIds } = await parsingService.saveToDatabase(parseResult);

    const processingTime = Date.now() - startTime;

    logger.info(`Mail import tamamlandı: ${vesselIds.length} gemi, ${cargoIds.length} yük (${processingTime}ms)`);

    res.json({
      success: true,
      message: 'Mail başarıyla import edildi',
      data: {
        vesselsFound: vesselIds.length,
        cargosFound: cargoIds.length,
        processingTime,
        errors: parseResult.errors,
        vesselIds: vesselIds.map(id => id.toString()),
        cargoIds: cargoIds.map(id => id.toString())
      }
    });

  } catch (error) {
    logger.error('Mail import hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Mail import edilirken hata oluştu',
      error: error instanceof Error ? error.message : 'Bilinmeyen hata'
    });
  }
});

/**
 * POST /api/vessel-cargo/match - Gemi-yük eşleştirmesi yap
 */
router.post('/match', [
  body('vesselIds').optional().isArray(),
  body('vesselIds.*').optional().isString(),
  body('cargoIds').optional().isArray(),
  body('cargoIds.*').optional().isString(),
  body('criteria').optional().isObject(),
  body('criteria.maxLaycanGapDays').optional().isInt({ min: 0, max: 30 }),
  body('criteria.maxDistanceDays').optional().isNumeric({ min: 0, max: 10 }),
  body('criteria.maxOversizeRatio').optional().isNumeric({ min: 0, max: 1 }),
  body('criteria.routeFactor').optional().isNumeric({ min: 1, max: 2 }),
  body('criteria.minMatchScore').optional().isNumeric({ min: 0, max: 100 }),
  body('saveResults').optional().isBoolean()
], handleValidationErrors, async (req, res) => {
  try {
    const {
      vesselIds,
      cargoIds,
      criteria = {},
      saveResults = false
    } = req.body;

    const startTime = Date.now();

    // String ID'leri number'a çevir
    const vesselIntIds = vesselIds ? vesselIds.map((id: string) => parseInt(id)) : undefined;
    const cargoIntIds = cargoIds ? cargoIds.map((id: string) => parseInt(id)) : undefined;

    logger.info(`Eşleştirme başlatılıyor: ${vesselIntIds?.length || 'tüm'} gemi, ${cargoIntIds?.length || 'tüm'} yük`);

    // Eşleştirme yap
    const matches = await matchingService.findMatches(vesselIntIds, cargoIntIds, criteria);

    // Sonuçları kaydet (istenirse)
    let savedMatchIds: number[] = [];
    if (saveResults && matches.length > 0) {
      savedMatchIds = await matchingService.saveMatches(matches);
    }

    const processingTime = Date.now() - startTime;

    logger.info(`Eşleştirme tamamlandı: ${matches.length} uygun eşleşme (${processingTime}ms)`);

    // Response formatla
    const formattedMatches = matches.map(match => ({
      id: match.vesselId.toString() + '-' + match.cargoId.toString(),
      vessel: {
        id: match.vessel.id.toString(),
        name: match.vessel.name,
        dwt: match.vessel.dwt,
        currentPort: match.vessel.currentPort,
        laycanStart: match.vessel.laycanStart,
        laycanEnd: match.vessel.laycanEnd
      },
      cargo: {
        id: match.cargo.id.toString(),
        reference: match.cargo.reference,
        quantity: match.cargo.quantity,
        loadPort: match.cargo.loadPort,
        laycanStart: match.cargo.laycanStart,
        laycanEnd: match.cargo.laycanEnd
      },
      matchScore: match.matchScore,
      matchDetails: match.matchDetails,
      reason: match.reason
    }));

    res.json({
      success: true,
      message: `${matches.length} uygun eşleşme bulundu`,
      data: {
        matches: formattedMatches,
        totalMatches: matches.length,
        processingTime,
        criteria: { ...matchingService['defaultCriteria'], ...criteria },
        savedMatches: savedMatchIds.length
      }
    });

  } catch (error) {
    logger.error('Eşleştirme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Eşleştirme yapılırken hata oluştu',
      error: error instanceof Error ? error.message : 'Bilinmeyen hata'
    });
  }
});

/**
 * GET /api/vessel-cargo/matches - Kaydedilmiş eşleştirmeleri listele
 */
router.get('/matches', [
  query('status').optional().isIn(['PROPOSED', 'ACCEPTED', 'REJECTED', 'EXPIRED']),
  query('minScore').optional().isNumeric({ min: 0, max: 100 }),
  query('vesselId').optional().isString(),
  query('cargoId').optional().isString(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('sortBy').optional().isIn(['matchScore', 'createdAt', 'updatedAt']),
  query('sortOrder').optional().isIn(['asc', 'desc'])
], handleValidationErrors, async (req, res) => {
  try {
    const {
      status,
      minScore,
      vesselId,
      cargoId,
      page = 1,
      limit = 20,
      sortBy = 'matchScore',
      sortOrder = 'desc'
    } = req.query;

    // Where clause oluştur
    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (minScore) {
      where.matchScore = { gte: parseFloat(minScore as string) };
    }

    if (vesselId) {
      where.vesselId = parseInt(vesselId as string);
    }

    if (cargoId) {
      where.cargoId = parseInt(cargoId as string);
    }

    // Pagination
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const take = parseInt(limit as string);

    // Sorting
    const orderBy: any = {};
    orderBy[sortBy as string] = sortOrder;

    // Query
    const [matches, totalCount] = await Promise.all([
      prisma.vesselCargoMatch.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          vessel: {
            select: {
              id: true,
              name: true,
              dwt: true,
              currentPort: true,
              laycanStart: true,
              laycanEnd: true,
              status: true
            }
          },
          cargo: {
            select: {
              id: true,
              reference: true,
              quantity: true,
              loadPort: true,
              laycanStart: true,
              laycanEnd: true,
              status: true
            }
          }
        }
      }),
      prisma.vesselCargoMatch.count({ where })
    ]);

    const totalPages = Math.ceil(totalCount / take);

    // Response formatla
    const formattedMatches = matches.map(match => ({
      id: match.id.toString(),
      vesselId: match.vesselId.toString(),
      cargoId: match.cargoId.toString(),
      vessel: {
        ...match.vessel,
        id: match.vessel.id.toString()
      },
      cargo: {
        ...match.cargo,
        id: match.cargo.id.toString()
      },
      matchScore: match.matchScore,
      matchReasons: match.matchReasons,
      status: match.status,
      createdAt: match.createdAt,
      updatedAt: match.updatedAt
    }));

    res.json({
      success: true,
      data: {
        matches: formattedMatches,
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
    logger.error('Eşleştirme listesi hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Eşleştirme listesi alınırken hata oluştu',
      error: error instanceof Error ? error.message : 'Bilinmeyen hata'
    });
  }
});

/**
 * PUT /api/vessel-cargo/matches/:id/status - Eşleştirme durumunu güncelle
 */
router.put('/matches/:id/status', [
  param('id').isNumeric(),
  body('status').isIn(['PROPOSED', 'ACCEPTED', 'REJECTED', 'EXPIRED']),
  body('notes').optional().isString().isLength({ max: 1000 })
], handleValidationErrors, async (req, res) => {
  try {
    const matchId = parseInt(req.params.id);
    const { status, notes } = req.body;

    const match = await prisma.vesselCargoMatch.findUnique({
      where: { id: matchId },
      include: {
        vessel: { select: { name: true } },
        cargo: { select: { reference: true } }
      }
    });

    if (!match) {
      return res.status(404).json({
        success: false,
        message: 'Eşleştirme bulunamadı'
      });
    }

    // Durum güncellemesi
    const updatedMatch = await prisma.vesselCargoMatch.update({
      where: { id: matchId },
      data: {
        status,
        updatedAt: new Date()
      }
    });

    // Eğer ACCEPTED ise, gemi ve yük durumlarını güncelle
    if (status === 'ACCEPTED') {
      await Promise.all([
        prisma.vessel.update({
          where: { id: match.vesselId },
          data: { status: 'FIXED' }
        }),
        prisma.cargo.update({
          where: { id: match.cargoId },
          data: { status: 'FIXED' }
        })
      ]);
    }

    logger.info(`Eşleştirme durumu güncellendi: ${match.vessel.name} - ${match.cargo.reference} -> ${status}`);

    res.json({
      success: true,
      message: 'Eşleştirme durumu güncellendi',
      data: {
        ...updatedMatch,
        id: updatedMatch.id.toString(),
        vesselId: updatedMatch.vesselId.toString(),
        cargoId: updatedMatch.cargoId.toString()
      }
    });

  } catch (error) {
    logger.error('Eşleştirme durum güncelleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Eşleştirme durumu güncellenirken hata oluştu',
      error: error instanceof Error ? error.message : 'Bilinmeyen hata'
    });
  }
});

/**
 * DELETE /api/vessel-cargo/matches/:id - Eşleştirmeyi sil
 */
router.delete('/matches/:id', [
  param('id').isNumeric()
], handleValidationErrors, async (req, res) => {
  try {
    const matchId = parseInt(req.params.id);

    const match = await prisma.vesselCargoMatch.findUnique({
      where: { id: matchId },
      include: {
        vessel: { select: { name: true } },
        cargo: { select: { reference: true } }
      }
    });

    if (!match) {
      return res.status(404).json({
        success: false,
        message: 'Eşleştirme bulunamadı'
      });
    }

    // ACCEPTED durumundaki eşleştirmeler silinemez
    if (match.status === 'ACCEPTED') {
      return res.status(400).json({
        success: false,
        message: 'Kabul edilmiş eşleştirmeler silinemez'
      });
    }

    await prisma.vesselCargoMatch.delete({
      where: { id: matchId }
    });

    logger.info(`Eşleştirme silindi: ${match.vessel.name} - ${match.cargo.reference}`);

    res.json({
      success: true,
      message: 'Eşleştirme başarıyla silindi'
    });

  } catch (error) {
    logger.error('Eşleştirme silme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Eşleştirme silinirken hata oluştu',
      error: error instanceof Error ? error.message : 'Bilinmeyen hata'
    });
  }
});

/**
 * POST /api/vessel-cargo/auto-match - Otomatik eşleştirme çalıştır
 */
router.post('/auto-match', [
  body('criteria').optional().isObject(),
  body('autoAcceptThreshold').optional().isNumeric({ min: 80, max: 100 })
], handleValidationErrors, async (req, res) => {
  try {
    const { criteria = {}, autoAcceptThreshold } = req.body;
    const startTime = Date.now();

    logger.info('Otomatik eşleştirme başlatılıyor...');

    // Sadece AVAILABLE durumundaki gemi/yükleri al
    const [availableVessels, availableCargos] = await Promise.all([
      prisma.vessel.findMany({
        where: { status: 'AVAILABLE' },
        select: { id: true }
      }),
      prisma.cargo.findMany({
        where: { status: 'AVAILABLE' },
        select: { id: true }
      })
    ]);

    const vesselIds = availableVessels.map(v => v.id);
    const cargoIds = availableCargos.map(c => c.id);

    // Eşleştirme yap
    const matches = await matchingService.findMatches(vesselIds, cargoIds, criteria);

    // Sonuçları kaydet
    const savedMatchIds = await matchingService.saveMatches(matches);

    // Yüksek skorlu eşleştirmeleri otomatik kabul et (opsiyonel)
    let autoAcceptedCount = 0;
    if (autoAcceptThreshold && matches.length > 0) {
      const highScoreMatches = matches.filter(m => m.matchScore >= autoAcceptThreshold);
      
      for (const match of highScoreMatches) {
        try {
          await prisma.vesselCargoMatch.updateMany({
            where: {
              vesselId: match.vesselId,
              cargoId: match.cargoId,
              status: 'PROPOSED'
            },
            data: { status: 'ACCEPTED' }
          });

          // Gemi ve yük durumlarını güncelle
          await Promise.all([
            prisma.vessel.update({
              where: { id: match.vesselId },
              data: { status: 'FIXED' }
            }),
            prisma.cargo.update({
              where: { id: match.cargoId },
              data: { status: 'FIXED' }
            })
          ]);

          autoAcceptedCount++;
        } catch (error) {
          logger.error('Otomatik kabul hatası:', error);
        }
      }
    }

    const processingTime = Date.now() - startTime;

    logger.info(`Otomatik eşleştirme tamamlandı: ${matches.length} eşleşme, ${autoAcceptedCount} otomatik kabul`);

    res.json({
      success: true,
      message: 'Otomatik eşleştirme tamamlandı',
      data: {
        totalVessels: vesselIds.length,
        totalCargos: cargoIds.length,
        totalMatches: matches.length,
        savedMatches: savedMatchIds.length,
        autoAcceptedMatches: autoAcceptedCount,
        processingTime,
        criteria: { ...matchingService['defaultCriteria'], ...criteria }
      }
    });

  } catch (error) {
    logger.error('Otomatik eşleştirme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Otomatik eşleştirme yapılırken hata oluştu',
      error: error instanceof Error ? error.message : 'Bilinmeyen hata'
    });
  }
});

/**
 * GET /api/vessel-cargo/stats - Eşleştirme istatistikleri
 */
router.get('/stats', async (req, res) => {
  try {
    const [
      totalVessels,
      availableVessels,
      totalCargos,
      availableCargos,
      totalMatches,
      proposedMatches,
      acceptedMatches,
      rejectedMatches,
      avgMatchScore
    ] = await Promise.all([
      prisma.vessel.count(),
      prisma.vessel.count({ where: { status: 'AVAILABLE' } }),
      prisma.cargo.count(),
      prisma.cargo.count({ where: { status: 'AVAILABLE' } }),
      prisma.vesselCargoMatch.count(),
      prisma.vesselCargoMatch.count({ where: { status: 'PROPOSED' } }),
      prisma.vesselCargoMatch.count({ where: { status: 'ACCEPTED' } }),
      prisma.vesselCargoMatch.count({ where: { status: 'REJECTED' } }),
      prisma.vesselCargoMatch.aggregate({
        _avg: { matchScore: true }
      })
    ]);

    res.json({
      success: true,
      data: {
        vessels: {
          total: totalVessels,
          available: availableVessels,
          fixed: totalVessels - availableVessels
        },
        cargos: {
          total: totalCargos,
          available: availableCargos,
          fixed: totalCargos - availableCargos
        },
        matches: {
          total: totalMatches,
          proposed: proposedMatches,
          accepted: acceptedMatches,
          rejected: rejectedMatches,
          averageScore: avgMatchScore._avg.matchScore ? Math.round(avgMatchScore._avg.matchScore * 100) / 100 : 0
        },
        efficiency: {
          vesselUtilization: totalVessels > 0 ? Math.round(((totalVessels - availableVessels) / totalVessels) * 100) : 0,
          cargoUtilization: totalCargos > 0 ? Math.round(((totalCargos - availableCargos) / totalCargos) * 100) : 0,
          matchAcceptanceRate: totalMatches > 0 ? Math.round((acceptedMatches / totalMatches) * 100) : 0
        }
      }
    });

  } catch (error) {
    logger.error('İstatistik hatası:', error);
    res.status(500).json({
      success: false,
      message: 'İstatistikler alınırken hata oluştu',
      error: error instanceof Error ? error.message : 'Bilinmeyen hata'
    });
  }
});

export default router;
