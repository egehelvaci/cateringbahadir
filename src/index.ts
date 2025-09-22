import express from 'express';
// import cors from 'cors'; // CORS middleware kaldırıldı
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
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