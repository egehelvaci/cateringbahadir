import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { authenticate } from '../middleware/auth';
import { strictRateLimiter } from '../middleware/rateLimiter';

const router = Router();

// GET /settings - Sistem ayarlarını getir
router.get('/',
  strictRateLimiter,
  authenticate,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const totalEmails = await prisma.inboundEmail.count();

      res.json({
        success: true,
        data: {
          system: {
            totalEmails,
            aiProcessing: false,
            message: "AI processing disabled - only email statistics available"
          },
          email: {
            imapEnabled: true,
            pollingInterval: 300000, // 5 minutes
            maxEmailsPerPoll: 50
          }
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      next(error);
    }
  }
);

// PUT /settings - Sistem ayarlarını güncelle
router.put('/',
  strictRateLimiter,
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, pollingInterval, maxEmailsPerPoll } = req.body;

      // Mock settings update
      res.json({
        success: true,
        message: 'Settings updated successfully',
        data: {
          email: email || 'settings@example.com',
          pollingInterval: pollingInterval || 300000,
          maxEmailsPerPoll: maxEmailsPerPoll || 50
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      next(error);
    }
  }
);

export default router;