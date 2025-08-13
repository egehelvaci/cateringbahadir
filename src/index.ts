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

import googleOAuthRoutes from './routes/google-oauth.routes';
import authRoutes from './routes/auth.routes';
import imapGmailRoutes from './routes/imap-gmail.routes';
import manualEmailRoutes from './routes/manual-email.routes';
import cargoRoutes from './routes/cargo.routes';
import vesselRoutes from './routes/vessel.routes';
import matchingRoutes from './routes/matching.routes';
import emailProcessingRoutes from './routes/email-processing.routes';
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
app.use('/api', cargoRoutes);
app.use('/api', vesselRoutes);
app.use('/api', matchingRoutes);
app.use('/api/emails', emailProcessingRoutes);
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