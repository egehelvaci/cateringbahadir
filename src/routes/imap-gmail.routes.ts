import { Router, Request, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validation';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { ImapGmailService } from '../services/imap-gmail.service';
import { strictRateLimiter } from '../middleware/rateLimiter';
import { logger } from '../utils/logger';

const router = Router();

// Test Gmail IMAP connection
router.post('/gmail/imap/test',
  authenticate,
  strictRateLimiter,
  [
    body('email').isEmail().withMessage('Valid Gmail address is required'),
    body('appPassword').isLength({ min: 16, max: 16 }).withMessage('Gmail App Password must be 16 characters'),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, appPassword } = req.body;
      
      logger.info(`Testing IMAP connection for: ${email}`);
      
      const isConnected = await ImapGmailService.testConnection(email, appPassword);
      
      if (isConnected) {
        res.json({
          success: true,
          message: 'Gmail IMAP connection successful',
          email: email
        });
      } else {
        throw new AppError('Failed to connect to Gmail IMAP', 400);
      }
    } catch (error) {
      next(error);
    }
  }
);

// Fetch Gmail messages via IMAP
router.post('/gmail/imap/messages',
  authenticate,
  strictRateLimiter,
  [
    body('email').isEmail().withMessage('Valid Gmail address is required'),
    body('appPassword').isLength({ min: 16, max: 16 }).withMessage('Gmail App Password must be 16 characters'),
    body('folder').optional().isString().withMessage('Folder must be a string'),
    body('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    body('filterCatering').optional().isBoolean().withMessage('FilterCatering must be a boolean'),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, appPassword, folder = 'INBOX', limit = 50, filterCatering = false } = req.body;
      
      logger.info(`Fetching messages from ${folder} for: ${email}`);
      
      const imapService = new ImapGmailService(email, appPassword);
      await imapService.connect();
      
      const messages = await imapService.getMessages(folder, limit, filterCatering);
      await imapService.disconnect();
      
      res.json({
        success: true,
        email: email,
        folder: folder,
        messageCount: messages.length,
        messages: messages.map(msg => ({
          id: msg.id,
          subject: msg.subject,
          from: msg.from,
          to: msg.to,
          date: msg.date,
          bodyPreview: (msg.body || '').substring(0, 200) + ((msg.body || '').length > 200 ? '...' : ''),
          hasHtml: !!msg.html,
          attachmentCount: msg.attachments?.length || 0
        }))
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get specific message details
router.post('/gmail/imap/message/:messageId',
  authenticate,
  strictRateLimiter,
  [
    body('email').isEmail().withMessage('Valid Gmail address is required'),
    body('appPassword').isLength({ min: 16, max: 16 }).withMessage('Gmail App Password must be 16 characters'),
    body('folder').optional().isString().withMessage('Folder must be a string'),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { messageId } = req.params;
      const { email, appPassword, folder = 'INBOX' } = req.body;
      
      logger.info(`Fetching message ${messageId} from ${folder} for: ${email}`);
      
      const imapService = new ImapGmailService(email, appPassword);
      await imapService.connect();
      
      const messages = await imapService.getMessages(folder, 100);
      const message = messages.find(msg => msg.id === messageId);
      
      await imapService.disconnect();
      
      if (!message) {
        throw new AppError('Message not found', 404);
      }
      
      res.json({
        success: true,
        email: email,
        message: message
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;