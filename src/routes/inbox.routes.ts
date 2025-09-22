import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { strictRateLimiter } from '../middleware/rateLimiter';
import { prisma } from '../config/database';

const router = Router();

// GET /inbox/emails - Gelen mailleri listele
router.get('/emails',
  strictRateLimiter,
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const offset = (page - 1) * limit;

      // Query parameters
      const type = req.query.type as string; // 'CARGO' | 'VESSEL' | 'UNKNOWN'
      const search = req.query.search as string;

      // Build where clause
      const where: any = {};
      
      if (type && ['CARGO', 'VESSEL'].includes(type)) {
        where.parsedType = type;
      } else if (type === 'UNKNOWN') {
        where.parsedType = null;
      }

      if (search) {
        where.OR = [
          { subject: { contains: search, mode: 'insensitive' } },
          { fromAddr: { contains: search, mode: 'insensitive' } },
          { raw: { contains: search, mode: 'insensitive' } }
        ];
      }

      // Get emails with pagination
      const [emails, totalCount] = await Promise.all([
        prisma.inboundEmail.findMany({
          where,
          orderBy: { receivedAt: 'desc' },
          skip: offset,
          take: limit,
          select: {
            id: true,
            messageId: true,
            fromAddr: true,
            subject: true,
            receivedAt: true,
            createdAt: true,
            raw: true
          }
        }),
        prisma.inboundEmail.count({ where })
      ]);

      // Format emails for display
      const formattedEmails = emails.map(email => ({
        id: email.id,
        messageId: email.messageId,
        from: email.fromAddr,
        subject: email.subject,
        receivedAt: email.receivedAt,
        type: 'RAW_EMAIL',
        classification: null,
        createdAt: email.createdAt,
        preview: email.raw ? 
          email.raw
            .replace(/<[^>]*>/g, '') // HTML tags kaldır
            .replace(/=\r?\n/g, '')  // Quoted-printable line breaks kaldır
            .substring(0, 200)
            .trim() + '...' 
          : null
      }));

      // Pagination info
      const totalPages = Math.ceil(totalCount / limit);
      const hasNext = page < totalPages;
      const hasPrev = page > 1;

      res.json({
        success: true,
        data: {
          emails: formattedEmails,
          pagination: {
            page,
            limit,
            totalCount,
            totalPages,
            hasNext,
            hasPrev
          }
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      next(error);
    }
  }
);

// GET /inbox/emails/:id - Specific email details
router.get('/emails/:id',
  strictRateLimiter,
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const emailId = parseInt(req.params.id);

      const email = await prisma.inboundEmail.findUnique({
        where: { id: emailId }
      });

      if (!email) {
        res.status(404).json({
          success: false,
          message: 'Email not found'
        });
        return;
      }

      // Format full email details
      const formattedEmail = {
        id: email.id,
        messageId: email.messageId,
        from: email.fromAddr,
        subject: email.subject,
        receivedAt: email.receivedAt,
        type: 'RAW_EMAIL',
        classification: null,
        createdAt: email.createdAt,
        content: email.raw ? 
          email.raw
            .replace(/<[^>]*>/g, '') // HTML tags kaldır
            .replace(/=\r?\n/g, '')  // Quoted-printable line breaks kaldır
            .trim()
          : null,
        rawContent: email.raw // Ham içerik de dahil et
      };

      res.json({
        success: true,
        data: formattedEmail,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      next(error);
    }
  }
);

// GET /inbox/stats - Email statistics
router.get('/stats',
  strictRateLimiter,
  authenticate,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const [
        totalEmails,
        recentEmails
      ] = await Promise.all([
        prisma.inboundEmail.count(),
        prisma.inboundEmail.findMany({
          orderBy: { receivedAt: 'desc' },
          take: 5,
          select: {
            id: true,
            fromAddr: true,
            subject: true,
            receivedAt: true
          }
        })
      ]);

      res.json({
        success: true,
        data: {
          summary: {
            total: totalEmails,
            message: "AI processing disabled - only raw email statistics available"
          },
          recent: recentEmails
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      next(error);
    }
  }
);

export default router;
