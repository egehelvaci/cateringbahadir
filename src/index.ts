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
    
    // Basit parsing
    const vessels: any[] = [];
    const cargos: any[] = [];
    
    // Gemi pattern'leri - gerçek veriye göre iyileştirildi
    const lines = content.split('\n');
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
              
              vessels.push({
                name: vesselName,
                dwt: dwt,
                currentPort: port,
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

    // Yük pattern'leri  
    const cargoMatches = content.match(/(\d{1,3}[,.]?\d{3})\s*(?:mt|mts)\s+([a-z\s]+)/gi);
    if (cargoMatches) {
      cargoMatches.forEach((match, index) => {
        const parts = match.match(/(\d{1,3}[,.]?\d{3})\s*(?:mt|mts)\s+([a-z\s]+)/i);
        if (parts) {
          cargos.push({
            reference: `${parts[1]} MT ${parts[2].trim()}`,
            quantity: parseFloat(parts[1].replace(/[,]/g, '')),
            loadPort: 'Various',
            sourceMail: {
              subject: `Cargo Inquiry`,
              sender: 'Charterer',  
              mailNumber: index + 1
            }
          });
        }
      });
    }

    // Basit eşleştirme
    const matches: any[] = [];
    vessels.forEach(vessel => {
      cargos.forEach(cargo => {
        if (cargo.quantity <= vessel.dwt && (cargo.quantity / vessel.dwt) >= 0.65) {
          const score = 70 + Math.min(30, (cargo.quantity / vessel.dwt) * 100 - 65);
          matches.push({
            matchScore: Math.round(score),
            vessel: vessel,
            cargo: cargo,
            recommendation: score >= 85 ? 'Çok İyi Eşleşme' : 'İyi Eşleşme',
            compatibility: {
              tonnage: {
                suitable: true,
                utilization: `${Math.round((cargo.quantity / vessel.dwt) * 100)}%`,
                cargoSize: `${cargo.quantity.toLocaleString()} MT`,
                vesselCapacity: `${vessel.dwt.toLocaleString()} DWT`
              }
            }
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