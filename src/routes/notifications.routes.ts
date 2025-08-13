import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { strictRateLimiter } from '../middleware/rateLimiter';
import { prisma } from '../config/database';

const router = Router();

// GET /notifications - Bildirimler listesi
router.get('/',
  strictRateLimiter,
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const offset = (page - 1) * limit;

      // Şimdilik basit notification'lar oluşturalım
      // Gerçek sistemde ayrı bir Notification tablosu olurdu
      const now = new Date();
      const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const [
        recentMatches,
        recentEmails,
        recentCargos,
        recentVessels
      ] = await Promise.all([
        prisma.match.findMany({
          where: {
            createdAt: { gte: last24Hours },
            status: 'SUGGESTED'
          },
          take: 5,
          orderBy: { createdAt: 'desc' },
          include: {
            cargo: { select: { commodity: true } },
            vessel: { select: { name: true } }
          }
        }),
        prisma.inboundEmail.count({
          where: { createdAt: { gte: last24Hours } }
        }),
        prisma.cargo.count({
          where: { createdAt: { gte: last24Hours } }
        }),
        prisma.vessel.count({
          where: { createdAt: { gte: last24Hours } }
        })
      ]);

      // Mock notifications
      const notifications = [
        ...recentMatches.map(match => ({
          id: `match-${match.id}`,
          type: 'match',
          title: 'New Match Found',
          message: `${match.cargo.commodity} matched with ${match.vessel.name || 'vessel'}`,
          data: { matchId: match.id, score: match.score },
          createdAt: match.createdAt,
          read: false
        })),
        ...(recentEmails > 0 ? [{
          id: 'emails-summary',
          type: 'summary',
          title: 'New Emails Processed',
          message: `${recentEmails} new emails processed in the last 24 hours`,
          data: { count: recentEmails },
          createdAt: last24Hours,
          read: false
        }] : []),
        ...(recentCargos > 0 ? [{
          id: 'cargos-summary',
          type: 'summary',
          title: 'New Cargo Records',
          message: `${recentCargos} new cargo records added`,
          data: { count: recentCargos },
          createdAt: last24Hours,
          read: false
        }] : []),
        ...(recentVessels > 0 ? [{
          id: 'vessels-summary',
          type: 'summary',
          title: 'New Vessel Records',
          message: `${recentVessels} new vessel records added`,
          data: { count: recentVessels },
          createdAt: last24Hours,
          read: false
        }] : [])
      ];

      // Sort by date
      notifications.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      // Paginate
      const paginatedNotifications = notifications.slice(offset, offset + limit);
      const totalCount = notifications.length;
      const totalPages = Math.ceil(totalCount / limit);

      res.json({
        success: true,
        data: {
          notifications: paginatedNotifications,
          pagination: {
            page,
            limit,
            totalCount,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1
          }
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      next(error);
    }
  }
);

// GET /notifications/unread-count - Okunmamış bildirim sayısı
router.get('/unread-count',
  strictRateLimiter,
  authenticate,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const now = new Date();
      const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const [
        newMatches,
        newEmails
      ] = await Promise.all([
        prisma.match.count({
          where: {
            createdAt: { gte: last24Hours },
            status: 'SUGGESTED'
          }
        }),
        prisma.inboundEmail.count({
          where: { createdAt: { gte: last24Hours } }
        })
      ]);

      // Basit hesaplama - gerçek sistemde ayrı notification tracking olurdu
      const unreadCount = newMatches + (newEmails > 0 ? 1 : 0);

      res.json({
        success: true,
        data: {
          unreadCount,
          breakdown: {
            matches: newMatches,
            emails: newEmails > 0 ? 1 : 0
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
