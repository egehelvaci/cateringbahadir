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
        totalCargos,
        totalVessels,
        totalMatches,
        emailsLast30Days,
        emailsLast7Days,
        cargosLast30Days,
        vesselsLast30Days,
        matchesLast30Days,
        recentMatches
      ] = await Promise.all([
        prisma.inboundEmail.count(),
        prisma.cargo.count(),
        prisma.vessel.count(),
        prisma.match.count(),
        prisma.inboundEmail.count({
          where: { createdAt: { gte: thirtyDaysAgo } }
        }),
        prisma.inboundEmail.count({
          where: { createdAt: { gte: sevenDaysAgo } }
        }),
        prisma.cargo.count({
          where: { createdAt: { gte: thirtyDaysAgo } }
        }),
        prisma.vessel.count({
          where: { createdAt: { gte: thirtyDaysAgo } }
        }),
        prisma.match.count({
          where: { createdAt: { gte: thirtyDaysAgo } }
        }),
        prisma.match.findMany({
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            cargo: {
              select: { commodity: true, loadPort: true, dischargePort: true }
            },
            vessel: {
              select: { name: true, dwt: true, currentArea: true }
            }
          }
        })
      ]);

      res.json({
        success: true,
        data: {
          totals: {
            emails: totalEmails,
            cargos: totalCargos,
            vessels: totalVessels,
            matches: totalMatches
          },
          trends: {
            emailsLast30Days,
            emailsLast7Days,
            cargosLast30Days,
            vesselsLast30Days,
            matchesLast30Days
          },
          recentActivity: {
            matches: recentMatches
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

      const emailStats = await prisma.inboundEmail.groupBy({
        by: ['parsedType'],
        where: {
          createdAt: { gte: startDate }
        },
        _count: {
          id: true
        }
      });

      res.json({
        success: true,
        data: {
          period: `${days} days`,
          stats: emailStats.map(stat => ({
            type: stat.parsedType || 'UNKNOWN',
            count: stat._count.id
          }))
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      next(error);
    }
  }
);

// GET /analytics/top-commodities - En çok kargoların istatistikleri
router.get('/top-commodities',
  strictRateLimiter,
  authenticate,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const topCommodities = await prisma.cargo.groupBy({
        by: ['commodity'],
        _count: {
          commodity: true
        },
        orderBy: {
          _count: {
            commodity: 'desc'
          }
        },
        take: 10
      });

      res.json({
        success: true,
        data: {
          topCommodities: topCommodities.map(item => ({
            commodity: item.commodity,
            count: item._count.commodity
          }))
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      next(error);
    }
  }
);

export default router;
