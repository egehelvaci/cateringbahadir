import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { authenticate } from '../middleware/auth';
import { strictRateLimiter } from '../middleware/rateLimiter';

const router = Router();

// GET /dashboard/stats - Dashboard istatistikleri
router.get('/stats',
  strictRateLimiter,
  authenticate,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      const thisWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);

      const [
        emailsToday,
        emailsYesterday,
        emailsThisWeek,
        emailsThisMonth
      ] = await Promise.all([
        // Today
        prisma.inboundEmail.count({
          where: { createdAt: { gte: today } }
        }),

        // Yesterday
        prisma.inboundEmail.count({
          where: { 
            createdAt: { 
              gte: yesterday,
              lt: today
            }
          }
        }),

        // This Week
        prisma.inboundEmail.count({
          where: { createdAt: { gte: thisWeek } }
        }),

        // This Month
        prisma.inboundEmail.count({
          where: { createdAt: { gte: thisMonth } }
        })
      ]);

      res.json({
        success: true,
        data: {
          emails: {
            today: emailsToday,
            yesterday: emailsYesterday,
            thisWeek: emailsThisWeek,
            thisMonth: emailsThisMonth
          },
          message: "AI processing disabled - only email statistics available"
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      next(error);
    }
  }
);

export default router;