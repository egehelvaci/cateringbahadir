import { Router } from 'express';
import { logger } from '../utils/logger';
import { VesselCargoParsingService } from '../services/vessel-cargo-parsing.service';
import { VesselCargoMatchingService } from '../services/vessel-cargo-matching.service';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';

const router = Router();
const parsingService = new VesselCargoParsingService();
const matchingService = new VesselCargoMatchingService();

// Multer konfigürasyonu - dosyaları geçici olarak uploads klasörüne kaydet
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const extension = path.extname(file.originalname);
    cb(null, `mail-${timestamp}${extension}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.txt', '.docx', '.doc'];
    const extension = path.extname(file.originalname).toLowerCase();
    
    if (allowedTypes.includes(extension)) {
      cb(null, true);
    } else {
      cb(new Error('Sadece TXT, DOC ve DOCX dosyaları desteklenir'));
    }
  }
});

/**
 * POST /api/auto-match - Tek API: Dosya yükle, parse et, eşleştir ve sonuçları döndür
 * 
 * Bu endpoint:
 * 1. TXT veya DOCX dosyasını alır
 * 2. İçeriği parse ederek gemi/yük bilgilerini çıkarır
 * 3. Veritabanına kaydeder
 * 4. Eşleştirme algoritmasını çalıştırır
 * 5. Detaylı eşleştirme sonuçlarını döndürür
 * 6. Geçici dosyayı temizler
 */
router.post('/auto-match', upload.single('file'), async (req, res) => {
  const startTime = Date.now();
  let uploadedFilePath: string | null = null;

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Dosya yüklenmedi. Lütfen TXT veya DOCX dosyası yükleyin.'
      });
    }

    uploadedFilePath = req.file.path;
    const originalFileName = req.file.originalname;

    logger.info(`Otomatik eşleştirme başlatılıyor: ${originalFileName}`);

    // 1. DOSYA PARSE ETİLİYOR
    logger.info('1/4 - Dosya parse ediliyor...');
    const parseResult = await parsingService.parseMailFile(uploadedFilePath);

    if (parseResult.vessels.length === 0 && parseResult.cargos.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Dosyada gemi veya yük bilgisi bulunamadı',
        data: {
          errors: parseResult.errors,
          processingTime: Date.now() - startTime
        }
      });
    }

    // 2. VERİTABANINA KAYDEDILIYOR
    logger.info(`2/4 - Veritabanına kaydediliyor: ${parseResult.vessels.length} gemi, ${parseResult.cargos.length} yük`);
    const { vesselIds, cargoIds } = await parsingService.saveToDatabase(parseResult);

    // 3. EŞLEŞTİRME YAPILIYOR
    logger.info('3/4 - Eşleştirme algoritması çalıştırılıyor...');
    
    // Eşleştirme kriterleri (req.body'den alınabilir, yoksa varsayılan)
    const criteria = {
      maxLaycanGapDays: parseInt(req.body.maxLaycanGapDays) || 3,
      maxDistanceDays: parseFloat(req.body.maxDistanceDays) || 2.0,
      maxOversizeRatio: parseFloat(req.body.maxOversizeRatio) || 0.35,
      routeFactor: parseFloat(req.body.routeFactor) || 1.20,
      minMatchScore: parseInt(req.body.minMatchScore) || 60
    };

    const matches = await matchingService.findMatches(vesselIds, cargoIds, criteria);

    // 4. SONUÇLAR HAZIRLANIYOR
    logger.info(`4/4 - Sonuçlar hazırlanıyor: ${matches.length} eşleşme bulundu`);

    // Eşleştirmeleri veritabanına kaydet
    const savedMatchIds = matches.length > 0 ? await matchingService.saveMatches(matches) : [];

    const processingTime = Date.now() - startTime;

    // Detaylı sonuç formatı
    const detailedResults = {
      summary: {
        fileName: originalFileName,
        processingTime: `${processingTime}ms`,
        vesselsFound: parseResult.vessels.length,
        cargosFound: parseResult.cargos.length,
        totalMatches: matches.length,
        savedMatches: savedMatchIds.length,
        parseErrors: parseResult.errors.length
      },
      criteria: criteria,
      vessels: parseResult.vessels.map((vessel, index) => ({
        id: vesselIds[index]?.toString(),
        name: vessel.name,
        dwt: vessel.dwt,
        currentPort: vessel.currentPort,
        laycan: vessel.laycanStart && vessel.laycanEnd ? {
          start: vessel.laycanStart.toISOString().split('T')[0],
          end: vessel.laycanEnd.toISOString().split('T')[0]
        } : null,
        capacity: {
          grain: vessel.grainCuft,
          bale: vessel.baleCuft
        },
        features: vessel.features,
        speedKnots: vessel.speedKnots
      })),
      cargos: parseResult.cargos.map((cargo, index) => ({
        id: cargoIds[index]?.toString(),
        reference: cargo.reference,
        quantity: cargo.quantity,
        loadPort: cargo.loadPort,
        laycan: cargo.laycanStart && cargo.laycanEnd ? {
          start: cargo.laycanStart.toISOString().split('T')[0],
          end: cargo.laycanEnd.toISOString().split('T')[0]
        } : null,
        stowageFactor: {
          value: cargo.stowageFactorValue,
          unit: cargo.stowageFactorUnit
        },
        brokenStowagePct: cargo.brokenStowagePct,
        requirements: cargo.requirements
      })),
      matches: matches.map(match => ({
        id: `${match.vesselId}-${match.cargoId}`,
        matchScore: Math.round(match.matchScore * 100) / 100,
        vessel: {
          id: match.vessel.id.toString(),
          name: match.vessel.name,
          dwt: match.vessel.dwt,
          currentPort: match.vessel.currentPort
        },
        cargo: {
          id: match.cargo.id.toString(),
          reference: match.cargo.reference,
          quantity: match.cargo.quantity,
          loadPort: match.cargo.loadPort
        },
        compatibility: {
          tonnage: {
            suitable: match.matchDetails.tonnageMatch,
            utilization: match.matchDetails.tonnageUtilization ? `${Math.round(match.matchDetails.tonnageUtilization)}%` : null,
            cargoSize: match.cargo.quantity,
            vesselCapacity: match.vessel.dwt
          },
          laycan: {
            suitable: match.matchDetails.laycanMatch,
            gapDays: match.matchDetails.laycanGapDays,
            vesselLaycan: match.vessel.laycanStart && match.vessel.laycanEnd ? {
              start: match.vessel.laycanStart.toISOString().split('T')[0],
              end: match.vessel.laycanEnd.toISOString().split('T')[0]
            } : null,
            cargoLaycan: match.cargo.laycanStart && match.cargo.laycanEnd ? {
              start: match.cargo.laycanStart.toISOString().split('T')[0],
              end: match.cargo.laycanEnd.toISOString().split('T')[0]
            } : null
          },
          distance: {
            suitable: match.matchDetails.distanceMatch,
            sailingDays: match.matchDetails.sailingDays ? Math.round(match.matchDetails.sailingDays * 100) / 100 : null,
            fromPort: match.vessel.currentPort,
            toPort: match.cargo.loadPort
          },
          volume: {
            suitable: match.matchDetails.cubicMatch,
            utilization: match.matchDetails.cubicUtilization ? `${Math.round(match.matchDetails.cubicUtilization)}%` : null,
            vesselCapacity: match.vessel.baleCuft || match.vessel.grainCuft,
            cargoRequirement: match.cargo.stowageFactorValue ? 
              Math.round(match.cargo.quantity * match.cargo.stowageFactorValue * (1 + match.cargo.brokenStowagePct/100)) : null
          },
          requirements: {
            suitable: match.matchDetails.requirementsMatch,
            cargoNeeds: match.cargo.requirements,
            vesselFeatures: match.vessel.features
          }
        },
        recommendation: match.matchScore >= 90 ? 'Mükemmel Eşleşme' :
                       match.matchScore >= 80 ? 'Çok İyi Eşleşme' :
                       match.matchScore >= 70 ? 'İyi Eşleşme' :
                       match.matchScore >= 60 ? 'Kabul Edilebilir' : 'Düşük Uyum',
        reason: match.reason
      })),
      parseErrors: parseResult.errors,
      recommendations: {
        bestMatches: matches.slice(0, 3).map(m => ({
          vessel: m.vessel.name,
          cargo: m.cargo.reference,
          score: Math.round(m.matchScore * 100) / 100,
          reason: m.reason
        })),
        totalPossibleCombinations: parseResult.vessels.length * parseResult.cargos.length,
        actualMatches: matches.length,
        matchRate: parseResult.vessels.length * parseResult.cargos.length > 0 ? 
          Math.round((matches.length / (parseResult.vessels.length * parseResult.cargos.length)) * 100) : 0
      }
    };

    logger.info(`Otomatik eşleştirme tamamlandı: ${matches.length} eşleşme, ${processingTime}ms`);

    res.json({
      success: true,
      message: `${matches.length} eşleşme bulundu`,
      data: detailedResults
    });

  } catch (error) {
    logger.error('Otomatik eşleştirme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Otomatik eşleştirme yapılırken hata oluştu',
      error: error instanceof Error ? error.message : 'Bilinmeyen hata',
      data: {
        processingTime: Date.now() - startTime
      }
    });
  } finally {
    // Geçici dosyayı temizle
    if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
      try {
        fs.unlinkSync(uploadedFilePath);
        logger.info(`Geçici dosya temizlendi: ${uploadedFilePath}`);
      } catch (cleanupError) {
        logger.error('Dosya temizleme hatası:', cleanupError);
      }
    }
  }
});

/**
 * GET /api/auto-match/test - Test endpoint'i
 */
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Gemi-Yük Otomatik Eşleştirme API hazır',
    endpoints: {
      autoMatch: {
        method: 'POST',
        url: '/api/auto-match',
        description: 'TXT/DOCX dosyası yükleyerek otomatik eşleştirme yapar',
        parameters: {
          file: 'multipart/form-data - TXT veya DOCX dosyası (zorunlu)',
          maxLaycanGapDays: 'number - Maksimum laycan farkı (varsayılan: 3)',
          maxDistanceDays: 'number - Maksimum seyir süresi (varsayılan: 2.0)',
          maxOversizeRatio: 'number - Maksimum gemi büyüklük oranı (varsayılan: 0.35)',
          routeFactor: 'number - Rota faktörü (varsayılan: 1.20)',
          minMatchScore: 'number - Minimum eşleşme skoru (varsayılan: 60)'
        }
      }
    },
    usage: {
      curl: `curl -X POST http://localhost:3000/api/auto-match \\
  -F "file=@your-mail-file.txt" \\
  -F "maxLaycanGapDays=3" \\
  -F "minMatchScore=70"`,
      javascript: `
const formData = new FormData();
formData.append('file', fileInput.files[0]);
formData.append('minMatchScore', '70');

fetch('/api/auto-match', {
  method: 'POST',
  body: formData
}).then(response => response.json());`
    }
  });
});

export default router;
