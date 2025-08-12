import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import 'express-async-errors';

import { errorHandler } from './middleware/errorHandler';
import { rateLimiter } from './middleware/rateLimiter';
import { logger } from './utils/logger';
import { prisma } from './config/database';
import { GmailPollingService } from './services/gmail-polling.service';

import vesselRoutes from './routes/vessel-v2.routes';
import cargoRoutes from './routes/cargo-v2.routes';
import matchRoutes from './routes/match-v2.routes';
import emailRoutes from './routes/email.routes';
import extractRoutes from './routes/extract.routes';
import googleOAuthRoutes from './routes/google-oauth.routes';
import authRoutes from './routes/auth.routes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3001',
  credentials: true
}));
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(rateLimiter);

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/vessels', vesselRoutes);
app.use('/api/cargos', cargoRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/emails', emailRoutes);
app.use('/api/extract', extractRoutes);
app.use('/api', googleOAuthRoutes);

app.use(errorHandler);

const startServer = async () => {
  try {
    await prisma.$connect();
    logger.info('Database connected successfully');
    
    // Start Gmail polling service
    const gmailPoller = new GmailPollingService();
    if (process.env.NODE_ENV === 'production' || process.env.ENABLE_GMAIL_POLLING === 'true') {
      gmailPoller.startPolling();
      logger.info('Gmail polling service started');
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