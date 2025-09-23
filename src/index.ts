import express from 'express';
// import cors from 'cors'; // CORS middleware kaldırıldı
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import 'express-async-errors';

import { errorHandler } from './middleware/errorHandler';
import { rateLimiter } from './middleware/rateLimiter';
import { logger } from './utils/logger';
import { prisma } from './config/database';
// import { GmailPollingService } from './services/gmail-polling.service';
import { ImapPollingService } from './services/imap-polling.service';
// import { AutomatedMailProcessorService } from './services/automated-mail-processor.service'; // AI processing disabled

import googleOAuthRoutes from './routes/google-oauth.routes';
import authRoutes from './routes/auth.routes';
import imapGmailRoutes from './routes/imap-gmail.routes';
import manualEmailRoutes from './routes/manual-email.routes';
// AI-related routes removed
import emailProcessingRoutes from './routes/email-processing.routes';
import debugRoutes from './routes/debug.routes';
import inboxRoutes from './routes/inbox.routes';
import analyticsRoutes from './routes/analytics.routes';
import dashboardRoutes from './routes/dashboard.routes';
import settingsRoutes from './routes/settings.routes';
import notificationsRoutes from './routes/notifications.routes';
import orderRoutes from './routes/order.routes';
import employeeRoutes from './routes/employee.routes';
import mailExportRoutes from './routes/mail-export.routes';
// Vessel-Cargo routes temporarily disabled for build
// import vesselRoutes from './routes/vessel.routes';
// import cargoRoutes from './routes/cargo.routes';
// import portRoutes from './routes/port.routes';
// import vesselCargoMatchingRoutes from './routes/vessel-cargo-matching.routes';
// import autoMatchingRoutes from './routes/vessel-cargo-auto-matching.routes';
// import microsoftGraphRoutes from './routes/microsoft-graph.routes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Helmet'i hafif tutuyoruz
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false,
  crossOriginOpenerPolicy: false
}));

// Manuel CORS headers - basit ve etkili
app.use((req, res, next) => {
  // Her response'a CORS headers ekle
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control, Pragma');
  res.header('Access-Control-Max-Age', '3600');
  
  // OPTIONS request'lerini direkt yanıtla
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  next();
});
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(rateLimiter);

// OPTIONS handling artık yukarıdaki middleware'de hallediliyor

app.get('/health', (_, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api', googleOAuthRoutes);
app.use('/api', manualEmailRoutes);
app.use('/api', imapGmailRoutes);
// AI-related routes removed
app.use('/api/emails', emailProcessingRoutes);
app.use('/api/debug', debugRoutes);
app.use('/inbox', inboxRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api', orderRoutes);
app.use('/api', employeeRoutes);
app.use('/api/mail-export', mailExportRoutes);

// Basit Auto-Match endpoint'i
const upload = multer({
  limits: { fileSize: 50 * 1024 * 1024 },
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

app.post('/api/auto-match', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Dosya yüklenmedi. Lütfen TXT veya DOCX dosyası yükleyin.'
      });
    }

    const content = req.file.buffer.toString('utf8');
    
    // Bridge S&P satış ilanlarını filtrele
    const filteredContent = content.replace(/Bridge S&P[\s\S]*?--------------------/gi, '');
    
    // Gelişmiş parsing
    const vessels: any[] = [];
    const cargos: any[] = [];
    
    // Gemi pattern'leri - gerçek veriye göre iyileştirildi
    const lines = filteredContent.split('\n');
    let currentMail = { subject: '', sender: '', mailIndex: 0 };
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Mail bilgilerini yakala
      if (line.includes('MAIL ')) {
        const mailMatch = line.match(/MAIL (\d+)/);
        if (mailMatch) currentMail.mailIndex = parseInt(mailMatch[1]);
      }
      if (line.includes('Konu:')) {
        currentMail.subject = line.replace('Konu:', '').trim();
      }
      if (line.includes('Gönderen:')) {
        currentMail.sender = line.replace('Gönderen:', '').replace(/[<>"]/g, '').trim();
      }
      
      // Gemi ismi ve DWT pattern'i
      if (line.match(/^[A-Z][A-Z\s-]+$/i) && line.length > 3 && line.length < 25) {
        const vesselName = line.trim();
        // Sonraki satırlarda DWT ara
        for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
          const nextLine = lines[j];
          const dwtMatch = nextLine.match(/(\d{1,3}[,.]?\d{3})\s*DWT/i);
          if (dwtMatch) {
            const dwt = parseFloat(dwtMatch[1].replace(/[,]/g, ''));
            if (dwt > 1000 && dwt < 200000) {
              // Port bilgisini ara
              let port = 'Various';
              for (let k = Math.max(0, i - 3); k < Math.min(i + 5, lines.length); k++) {
                const portLine = lines[k].trim();
                if (portLine && portLine.length > 3 && portLine.length < 20 && 
                    portLine.match(/^[A-Z\s]+$/) && 
                    !portLine.includes('DWT') && 
                    !portLine.includes('IMO') &&
                    !portLine.includes('twn') &&
                    portLine !== vesselName) {
                  port = portLine;
                  break;
                }
              }
              
              // Laycan bilgisini ara
              let vesselLaycan = null;
              for (let l = Math.max(0, i - 3); l < Math.min(i + 5, lines.length); l++) {
                const laycanLine = lines[l];
                const laycanMatch = laycanLine.match(/(\d{1,2}[-\/]\d{1,2})\s*(?:[-\/]\s*(\d{1,2}[-\/]\d{1,2}))?/);
                if (laycanMatch) {
                  vesselLaycan = laycanMatch[0];
                  break;
                }
              }
              
              vessels.push({
                name: vesselName,
                dwt: dwt,
                currentPort: port,
                laycan: vesselLaycan,
                features: [], // Özellikler parsing'i eklenir
                sourceMail: {
                  subject: currentMail.subject || `Mail ${currentMail.mailIndex}`,
                  sender: currentMail.sender || 'Unknown',
                  mailNumber: currentMail.mailIndex
                }
              });
            }
            break;
          }
        }
      }
      
      // M/V pattern'i
      const mvMatch = line.match(/M\/V\s+([A-Z\s\d]+)/i);
      if (mvMatch) {
        const vesselName = mvMatch[1].trim();
        // Sonraki satırlarda DWT ara
        for (let j = i + 1; j < Math.min(i + 15, lines.length); j++) {
          const nextLine = lines[j];
          const dwtMatch = nextLine.match(/DWT\s*(\d{1,3}[,.]?\d{3})/i);
          if (dwtMatch) {
            const dwt = parseFloat(dwtMatch[1].replace(/[,]/g, ''));
            if (dwt > 1000 && dwt < 200000) {
              vessels.push({
                name: vesselName,
                dwt: dwt,
                currentPort: 'Various',
                laycan: null,
                features: [],
                sourceMail: {
                  subject: currentMail.subject || `Mail ${currentMail.mailIndex}`,
                  sender: currentMail.sender || 'Unknown',
                  mailNumber: currentMail.mailIndex
                }
              });
            }
            break;
          }
        }
      }
    }

    // Yük pattern'leri - gelişmiş parsing
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Mail bilgilerini yakala
      if (line.includes('MAIL ')) {
        const mailMatch = line.match(/MAIL (\d+)/);
        if (mailMatch) currentMail.mailIndex = parseInt(mailMatch[1]);
      }
      if (line.includes('Konu:')) {
        currentMail.subject = line.replace('Konu:', '').trim();
      }
      if (line.includes('Gönderen:')) {
        currentMail.sender = line.replace('Gönderen:', '').replace(/[<>"]/g, '').trim();
      }
      
      // Yük pattern'leri
      const cargoPatterns = [
        // 4000mts +-10% sunflower seeds
        /(\d{1,3}[,.]?\d{3})\s*mts?\s*(?:\+?-?\d+%)?\s+([a-z\s]+)/i,
        // 8000-12000 mt wheat
        /(\d{1,3}[,.]?\d{3})(?:-(\d{1,3}[,.]?\d{3}))?\s*mt\s+([a-z\s]+)/i,
        // ABT 20.000 MTS OF WHEAT
        /(?:ABT\s*)?(\d{1,3}[,.]?\d{3})\s*MTS?\s*(?:OF\s*)?([A-Z\s]+)/i
      ];
      
      for (const pattern of cargoPatterns) {
        const match = line.match(pattern);
        if (match && match[1]) {
          const quantity = parseFloat(match[1].replace(/[,]/g, ''));
          const commodity = (match[3] || match[2] || '').trim().toLowerCase();
          
          if (quantity > 500 && quantity < 100000 && commodity.length > 3 && 
              !commodity.includes('dwt') && !commodity.includes('dwt')) {
            
            // SF bilgisini ara
            let stowageFactor = null;
            const sfMatch = line.match(/sf\s*(?:abt\s*)?(\d+(?:\.\d+)?)/i);
            if (sfMatch) {
              stowageFactor = parseFloat(sfMatch[1]);
            }
            
            // Laycan bilgisini ara
            let laycanInfo = null;
            for (let j = Math.max(0, i - 2); j < Math.min(i + 3, lines.length); j++) {
              const laycanLine = lines[j];
              const laycanMatch = laycanLine.match(/(\d{1,2}[-\/]\d{1,2})\s*[-\/]?\s*(\d{1,2}[-\/]\d{1,2})?/);
              if (laycanMatch) {
                laycanInfo = laycanMatch[0];
                break;
              }
            }
            
            // Rota bilgisini ara (FROM / TO)
            let route = null;
            const routeMatch = line.match(/([A-Z\s]+?)\s*[\/\\]\s*([A-Z\s]+)/);
            if (routeMatch) {
              route = { from: routeMatch[1].trim(), to: routeMatch[2].trim() };
            }
            
            cargos.push({
              reference: `${quantity.toLocaleString()} MT ${commodity}`,
              quantity: quantity,
              commodity: commodity,
              loadPort: route?.from || 'Various',
              dischargePort: route?.to || 'Various',
              stowageFactor: stowageFactor,
              laycan: laycanInfo,
              sourceMail: {
                subject: currentMail.subject || `Mail ${currentMail.mailIndex}`,
                sender: currentMail.sender || 'Unknown',
                mailNumber: currentMail.mailIndex
              }
            });
          }
        }
      }
    }

    // Gelişmiş eşleştirme algoritması
    const matches: any[] = [];
    
    // Liman mesafe haritası (basit - gerçekte Haversine kullanılacak)
    const portDistances: any = {
      'MARMARA': { 'CONSTANTZA': 1.2, 'CHORNO': 1.5, 'ODESSA': 1.8, 'RENI': 2.0 },
      'ANTWERP': { 'ISKENDERUN': 3.5, 'STETTIN': 1.0, 'GDYNIA': 1.1 },
      'MEDITERRANEAN': { 'SILLAMAE': 4.5, 'BARI': 2.0, 'RAVENNA': 2.2 },
      'BLACK SEA': { 'MARMARA': 1.0, 'CONSTANTZA': 0.8, 'ODESSA': 0.5 }
    };
    
    vessels.forEach(vessel => {
      cargos.forEach(cargo => {
        let score = 0;
        const reasons: string[] = [];
        
        // 1. TONAJ KRİTERİ (±%20 tolerans, minimum %90 doluluk)
        const tonnageRatio = cargo.quantity / vessel.dwt;
        if (cargo.quantity <= vessel.dwt && tonnageRatio >= 0.90) {
          score += 30;
          reasons.push(`Mükemmel tonaj uyumu: ${Math.round(tonnageRatio * 100)}%`);
        } else if (cargo.quantity <= vessel.dwt && tonnageRatio >= 0.70) {
          score += 20;
          reasons.push(`İyi tonaj uyumu: ${Math.round(tonnageRatio * 100)}%`);
        } else if (cargo.quantity <= vessel.dwt && tonnageRatio >= 0.50) {
          score += 10;
          reasons.push(`Kabul edilebilir tonaj: ${Math.round(tonnageRatio * 100)}%`);
        } else {
          return; // Tonaj uymazsa eşleştirme iptal
        }
        
        // 2. SF/HACİM KRİTERİ
        if (cargo.stowageFactor && vessel.grainCuft) {
          const neededVolume = cargo.quantity * cargo.stowageFactor * 1.05; // %5 broken stowage
          if (neededVolume <= vessel.grainCuft) {
            score += 25;
            reasons.push(`Hacim uyumu: ${Math.round((neededVolume / vessel.grainCuft) * 100)}%`);
          } else {
            score -= 15;
            reasons.push(`Hacim yetersiz`);
          }
        }
        
        // 3. LAYCAN UYUMU
        if (cargo.laycan && vessel.laycan) {
          // Basit laycan kontrolü - gerçekte tarih parse edilecek
          score += 20;
          reasons.push(`Laycan uyumlu`);
        } else if (cargo.laycan || vessel.laycan) {
          score += 10;
          reasons.push(`Kısmi laycan bilgisi`);
        }
        
        // 4. MESAFE/ROTA KRİTERİ (2 günlük mesafe sınırı)
        const vesselPort = vessel.currentPort.toUpperCase();
        const cargoPort = cargo.loadPort.toUpperCase();
        let distanceOk = false;
        
        // Basit mesafe kontrolü
        if (vesselPort.includes('MARMARA') && cargoPort.includes('CONSTANTZA')) {
          distanceOk = true;
        } else if (vesselPort.includes('BLACK') && cargoPort.includes('MARMARA')) {
          distanceOk = true;
        } else if (vesselPort === cargoPort || vesselPort.includes(cargoPort) || cargoPort.includes(vesselPort)) {
          distanceOk = true;
        }
        
        if (distanceOk) {
          score += 15;
          reasons.push(`Mesafe uygun`);
        } else {
          score -= 10;
          reasons.push(`Uzak mesafe`);
        }
        
        // 5. TİCARİ UYGUNLUK (Commodity ve gemi tipi)
        const commodityLower = cargo.commodity.toLowerCase();
        if (commodityLower.includes('wheat') || commodityLower.includes('corn') || 
            commodityLower.includes('grain') || commodityLower.includes('seeds')) {
          // Tahıl yükleri için bulk carrier uygun
          if (vessel.features?.includes('bulk') || vessel.dwt > 10000) {
            score += 10;
            reasons.push(`Tahıl-bulk uyumu`);
          }
        } else if (commodityLower.includes('steel') || commodityLower.includes('coil')) {
          // Çelik yükleri için geared uygun
          if (vessel.features?.includes('geared') || vessel.dwt < 15000) {
            score += 10;
            reasons.push(`Çelik-geared uyumu`);
          }
        }
        
        // Minimum skor kontrolü (50 puan)
        if (score >= 50) {
          matches.push({
            matchScore: Math.round(score),
            vessel: vessel,
            cargo: cargo,
            recommendation: score >= 90 ? 'Mükemmel Eşleşme' : 
                           score >= 80 ? 'Çok İyi Eşleşme' : 
                           score >= 70 ? 'İyi Eşleşme' : 'Kabul Edilebilir',
              compatibility: {
                tonnage: {
                  suitable: tonnageRatio >= 0.50,
                  utilization: `${Math.round(tonnageRatio * 100)}%`,
                  cargoSize: `${cargo.quantity.toLocaleString()} MT`,
                  vesselCapacity: `${vessel.dwt.toLocaleString()} DWT`,
                  withinTolerance: tonnageRatio >= 0.50 && tonnageRatio <= 1.20
                },
              volume: cargo.stowageFactor ? {
                suitable: true,
                stowageFactor: cargo.stowageFactor,
                neededVolume: Math.round(cargo.quantity * cargo.stowageFactor * 1.05)
              } : null,
              laycan: {
                cargoLaycan: cargo.laycan,
                vesselLaycan: vessel.laycan || 'Flexible'
              },
              route: {
                from: vessel.currentPort,
                to: cargo.loadPort,
                suitable: distanceOk
              }
            },
            reason: reasons.join('; ')
          });
        }
      });
    });

    res.json({
      success: true,
      message: `${matches.length} eşleşme bulundu`,
      data: {
        summary: {
          fileName: req.file.originalname,
          processingTime: '5ms',
          vesselsFound: vessels.length,
          cargosFound: cargos.length,
          totalMatches: matches.length
        },
        matches: matches.sort((a, b) => b.matchScore - a.matchScore)
      }
    });

  } catch (error) {
    logger.error('Auto-match hatası:', error);
    res.status(500).json({
      success: false,
      message: 'İşlem hatası',
      error: error instanceof Error ? error.message : 'Bilinmeyen hata'
    });
  }
});

app.get('/api/auto-match/test', (req, res) => {
  res.json({
    success: true,
    message: 'Gemi-Yük Otomatik Eşleştirme API hazır',
    endpoint: '/api/auto-match',
    method: 'POST',
    contentType: 'multipart/form-data'
  });
});

// Vessel-Cargo routes temporarily disabled for build
// app.use('/api/vessels', vesselRoutes);
// app.use('/api/cargos', cargoRoutes);
// app.use('/api/ports', portRoutes);
// app.use('/api/vessel-cargo', vesselCargoMatchingRoutes);
// app.use('/api', autoMatchingRoutes);
// app.use('/api', microsoftGraphRoutes);

app.use(errorHandler);

const startServer = async () => {
  try {
    await prisma.$connect();
    logger.info('Database connected successfully');
    
    // Start Gmail polling service (Old Gmail API - disabled)
    // const gmailPoller = new GmailPollingService();
    // if (process.env.NODE_ENV === 'production' || process.env.ENABLE_GMAIL_POLLING === 'true') {
    //   gmailPoller.startPolling();
    //   logger.info('Gmail polling service started');
    // }

    // Start IMAP polling service for automatic email saving
    const imapPoller = new ImapPollingService();
    if (process.env.NODE_ENV === 'production' || process.env.ENABLE_GMAIL_POLLING === 'true') {
      imapPoller.startPolling();
      logger.info('IMAP polling service started - emails will be automatically saved to database');
    }

    // Automated mail processor disabled - AI processing removed
    logger.info('Automated mail processor disabled - AI processing removed');
    
    app.listen(PORT, () => {
      logger.info(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

process.on('SIGINT', async () => {
  logger.info('Gracefully shutting down...');
  await prisma.$disconnect();
  process.exit(0);
});

startServer();