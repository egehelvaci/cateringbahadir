import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { strictRateLimiter } from '../middleware/rateLimiter';
import { EmailProcessingService } from '../services/email-processing.service';
import { logger } from '../utils/logger';

const router = Router();
const emailProcessingService = new EmailProcessingService();

// Process unprocessed emails
router.post('/process',
  strictRateLimiter,
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
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

// Get processing statistics
router.get('/stats',
  strictRateLimiter,
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const stats = await emailProcessingService.getProcessingStats();
      
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

export default router;
