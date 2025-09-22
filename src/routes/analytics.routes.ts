import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { strictRateLimiter } from '../middleware/rateLimiter';
import { prisma } from '../config/database';

const router = Router();

// GET /analytics/overview - Genel analytics
router.get('/overview',
  strictRateLimiter,
  authenticate,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const [
        totalEmails,
        emailsLast30Days,
        emailsLast7Days
      ] = await Promise.all([
        prisma.inboundEmail.count(),
        prisma.inboundEmail.count({
          where: { createdAt: { gte: thirtyDaysAgo } }
        }),
        prisma.inboundEmail.count({
          where: { createdAt: { gte: sevenDaysAgo } }
        })
      ]);

      res.json({
        success: true,
        data: {
          totals: {
            emails: totalEmails
          },
          trends: {
            emailsLast30Days,
            emailsLast7Days
          },
          recentActivity: {
            message: "AI processing disabled - only email statistics available"
          }
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      next(error);
    }
  }
);

// GET /analytics/emails-by-day - Günlük email istatistikleri
router.get('/emails-by-day',
  strictRateLimiter,
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const emailCount = await prisma.inboundEmail.count({
        where: {
          createdAt: { gte: startDate }
        }
      });

      res.json({
        success: true,
        data: {
          period: `${days} days`,
          stats: [{
            type: 'RAW_EMAIL',
            count: emailCount
          }],
          message: "AI processing disabled - only raw email statistics available"
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      next(error);
    }
  }
);

// GET /analytics/top-commodities - AI processing disabled
router.get('/top-commodities',
  strictRateLimiter,
  authenticate,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({
        success: true,
        data: {
          message: "AI processing disabled - commodity statistics not available",
          topCommodities: []
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      next(error);
    }
  }
);

export default router;
