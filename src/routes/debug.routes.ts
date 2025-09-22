import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { authenticate } from '../middleware/auth';
import { strictRateLimiter } from '../middleware/rateLimiter';

const router = Router();

// GET /debug/emails - Son 10 emaili göster
router.get('/emails',
  strictRateLimiter,
  authenticate,
  async (_req: Request, res: Response, _next: NextFunction) => {
    try {
      const emails = await prisma.inboundEmail.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          fromAddr: true,
          subject: true,
          receivedAt: true,
          raw: true,
          createdAt: true
        }
      });

      // Clean up raw content for display
      const cleanEmails = emails.map(email => ({
        ...email,
        raw: email.raw ? email.raw.substring(0, 500) + '...' : null,
        bodyPreview: email.raw ? 
          email.raw.replace(/\n/g, ' ').substring(0, 200) + '...' : 
          'No content'
      }));

      res.json({
        success: true,
        data: {
          emails: cleanEmails,
          count: emails.length
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      _next(error);
    }
  }
);

// GET /debug/stats - Sistem istatistikleri
router.get('/stats',
  strictRateLimiter,
  authenticate,
  async (_req: Request, res: Response, _next: NextFunction) => {
    try {
      const totalEmails = await prisma.inboundEmail.count();

      res.json({
        success: true,
        data: {
          emails: {
            total: totalEmails
          },
          message: "AI processing disabled - only email statistics available"
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      _next(error);
    }
  }
);

// GET /debug/health - Sistem sağlık durumu
router.get('/health',
  strictRateLimiter,
  async (_req: Request, res: Response, _next: NextFunction) => {
    try {
      // Test database connection
      await prisma.$queryRaw`SELECT 1`;

      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        database: 'connected',
        services: {
          imap: 'running',
          mailProcessor: 'disabled'
        }
      });

    } catch (error) {
      res.status(500).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: (error as Error).message
      });
    }
  }
);

export default router;