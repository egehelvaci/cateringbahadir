import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { authenticate } from '../middleware/auth';
import { strictRateLimiter } from '../middleware/rateLimiter';

const router = Router();

// GET /notifications - Kullanıcı bildirimlerini getir
router.get('/',
  strictRateLimiter,
  authenticate,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const now = new Date();
      const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const recentEmails = await prisma.inboundEmail.count({
        where: { createdAt: { gte: last24Hours } }
      });

      // Mock notifications
      const notifications = [
        ...(recentEmails > 0 ? [{
          id: 'emails-summary',
          type: 'summary',
          title: 'New Emails Processed',
          message: `${recentEmails} new emails processed in the last 24 hours`,
          data: { count: recentEmails },
          createdAt: last24Hours,
          read: false
        }] : [])
      ];

      res.json({
        success: true,
        data: {
          notifications,
          unreadCount: notifications.filter(n => !n.read).length
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      next(error);
    }
  }
);

// POST /notifications - Yeni bildirim oluştur
router.post('/',
  strictRateLimiter,
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { type, title, message, data } = req.body;

      // Mock notification creation
      const notification = {
        id: `notification-${Date.now()}`,
        type: type || 'info',
        title: title || 'New Notification',
        message: message || 'You have a new notification',
        data: data || {},
        createdAt: new Date(),
        read: false
      };

      res.status(201).json({
        success: true,
        data: { notification },
        message: 'Notification created successfully',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      next(error);
    }
  }
);

// PUT /notifications/:id/read - Bildirimi okundu olarak işaretle
router.put('/:id/read',
  strictRateLimiter,
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      // Mock notification update
      res.json({
        success: true,
        message: `Notification ${id} marked as read`,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      next(error);
    }
  }
);

export default router;