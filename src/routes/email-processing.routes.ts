import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { strictRateLimiter } from '../middleware/rateLimiter';
import { EmailProcessingService } from '../services/email-processing.service';
import { AutomatedMailProcessorService } from '../services/automated-mail-processor.service';
import { logger } from '../utils/logger';

const router = Router();
const emailProcessingService = new EmailProcessingService();
const automatedProcessorService = new AutomatedMailProcessorService();

// Process unprocessed emails
router.post('/process',
  strictRateLimiter,
  authenticate,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      logger.info('Manual email processing triggered');
      
      const result = await emailProcessingService.processUnprocessedEmails();
      
      res.json({
        success: true,
        message: 'Email processing completed',
        processed: result.processed,
        errors: result.errors,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

// Enhanced processing with new automated service
router.post('/process-enhanced',
  strictRateLimiter,
  authenticate,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      logger.info('Enhanced automated email processing triggered');
      
      const result = await automatedProcessorService.processAllUnprocessedEmails();
      
      res.json({
        success: true,
        message: 'Enhanced email processing completed',
        processed: result.processed,
        cargoCreated: 0,
        vesselCreated: 0,
        errors: result.errors,
        skipped: result.skipped,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get processing statistics
router.get('/stats',
  strictRateLimiter,
  authenticate,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const stats = await automatedProcessorService.getProcessingStats();
      
      res.json({
        success: true,
        data: stats,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

// Start automated processing (admin only)
router.post('/start-automation',
  strictRateLimiter,
  authenticate,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      automatedProcessorService.startAutomaticProcessing();
      
      res.json({
        success: true,
        message: 'Automated email processing started - will run every 5 minutes',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
