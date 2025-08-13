import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { strictRateLimiter } from '../middleware/rateLimiter';
import { prisma } from '../config/database';

const router = Router();

// GET /dashboard/summary - Dashboard ana sayfa özeti
router.get('/summary',
  strictRateLimiter,
  authenticate,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

      const [
        // Today's stats
        todaysEmails,
        todaysCargos,
        todaysVessels,
        todaysMatches,
        
        // Yesterday's stats
        yesterdaysEmails,
        yesterdaysCargos,
        yesterdaysVessels,
        yesterdaysMatches,

        // Recent activity
        recentEmails,
        recentCargos,
        recentVessels,
        suggestedMatches,

        // Processing stats
        unprocessedEmails,
        processingStats
      ] = await Promise.all([
        // Today
        prisma.inboundEmail.count({
          where: { createdAt: { gte: today } }
        }),
        prisma.cargo.count({
          where: { createdAt: { gte: today } }
        }),
        prisma.vessel.count({
          where: { createdAt: { gte: today } }
        }),
        prisma.match.count({
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
        prisma.cargo.count({
          where: { 
            createdAt: { 
              gte: yesterday,
              lt: today 
            } 
          }
        }),
        prisma.vessel.count({
          where: { 
            createdAt: { 
              gte: yesterday,
              lt: today 
            } 
          }
        }),
        prisma.match.count({
          where: { 
            createdAt: { 
              gte: yesterday,
              lt: today 
            } 
          }
        }),

        // Recent activity
        prisma.inboundEmail.findMany({
          take: 5,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            fromAddr: true,
            subject: true,
            parsedType: true,
            createdAt: true
          }
        }),
        prisma.cargo.findMany({
          take: 5,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            commodity: true,
            qtyValue: true,
            qtyUnit: true,
            loadPort: true,
            dischargePort: true,
            createdAt: true
          }
        }),
        prisma.vessel.findMany({
          take: 5,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            name: true,
            dwt: true,
            currentArea: true,
            availableFrom: true,
            createdAt: true
          }
        }),
        prisma.match.findMany({
          where: { status: 'SUGGESTED' },
          take: 5,
          orderBy: { score: 'desc' },
          include: {
            cargo: {
              select: { commodity: true, loadPort: true }
            },
            vessel: {
              select: { name: true, dwt: true }
            }
          }
        }),

        // Processing
        prisma.inboundEmail.count({
          where: { parsedType: null }
        }),
        prisma.inboundEmail.groupBy({
          by: ['parsedType'],
          _count: { id: true }
        })
      ]);

      // Calculate percentage changes
      const emailChange = yesterdaysEmails > 0 ? 
        Math.round(((todaysEmails - yesterdaysEmails) / yesterdaysEmails) * 100) : 0;
      const cargoChange = yesterdaysCargos > 0 ? 
        Math.round(((todaysCargos - yesterdaysCargos) / yesterdaysCargos) * 100) : 0;
      const vesselChange = yesterdaysVessels > 0 ? 
        Math.round(((todaysVessels - yesterdaysVessels) / yesterdaysVessels) * 100) : 0;
      const matchChange = yesterdaysMatches > 0 ? 
        Math.round(((todaysMatches - yesterdaysMatches) / yesterdaysMatches) * 100) : 0;

      res.json({
        success: true,
        data: {
          todayStats: {
            emails: { count: todaysEmails, change: emailChange },
            cargos: { count: todaysCargos, change: cargoChange },
            vessels: { count: todaysVessels, change: vesselChange },
            matches: { count: todaysMatches, change: matchChange }
          },
          recentActivity: {
            emails: recentEmails,
            cargos: recentCargos,
            vessels: recentVessels
          },
          suggestedMatches,
          processing: {
            unprocessedEmails,
            typeDistribution: processingStats.map(stat => ({
              type: stat.parsedType || 'UNKNOWN',
              count: stat._count.id
            }))
          }
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      next(error);
    }
  }
);

// GET /dashboard/quick-stats - Hızlı istatistikler
router.get('/quick-stats',
  strictRateLimiter,
  authenticate,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const [
        totalEmails,
        totalCargos,
        totalVessels,
        totalMatches,
        processedEmails,
        successfulMatches
      ] = await Promise.all([
        prisma.inboundEmail.count(),
        prisma.cargo.count(),
        prisma.vessel.count(),
        prisma.match.count(),
        prisma.inboundEmail.count({
          where: { parsedType: { not: null } }
        }),
        prisma.match.count({
          where: { status: 'ACCEPTED' }
        })
      ]);

      const processingRate = totalEmails > 0 ? 
        Math.round((processedEmails / totalEmails) * 100) : 0;
      
      const matchSuccessRate = totalMatches > 0 ? 
        Math.round((successfulMatches / totalMatches) * 100) : 0;

      res.json({
        success: true,
        data: {
          totals: {
            emails: totalEmails,
            cargos: totalCargos,
            vessels: totalVessels,
            matches: totalMatches
          },
          rates: {
            processing: processingRate,
            matchSuccess: matchSuccessRate
          }
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      next(error);
    }
  }
);

export default router;
