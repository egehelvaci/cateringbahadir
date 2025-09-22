import { Router, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validation';
import { authenticate, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { strictRateLimiter } from '../middleware/rateLimiter';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

const router = Router();

// Upload email manually
router.post('/email/upload',
  authenticate,
  strictRateLimiter,
  [
    body('subject').notEmpty().withMessage('Email subject is required'),
    body('from').isEmail().withMessage('Valid sender email is required'),
    body('to').optional().isEmail().withMessage('Valid recipient email required if provided'),
    body('body').notEmpty().withMessage('Email body is required'),
    body('receivedAt').optional().isISO8601().withMessage('Valid date format required'),
  ],
  validate,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { subject, from, to, body, receivedAt } = req.body;
      
      logger.info(`Manual email upload from: ${from}, subject: ${subject}`);
      
      // Create email record
      const email = await prisma.inboundEmail.create({
        data: {
          messageId: `manual_${Date.now()}_${Math.random()}`,
          fromAddr: from,
          subject: subject,
          receivedAt: receivedAt ? new Date(receivedAt) : new Date(),
          raw: `Subject: ${subject}\nFrom: ${from}\nTo: ${to || 'Manual Upload'}\n\n${body}`,
        }
      });

      res.status(201).json({
        success: true,
        message: 'Email uploaded successfully',
        emailId: email.id,
        email: {
          id: email.id,
          subject: email.subject,
          from: email.fromAddr,
          receivedAt: email.receivedAt,
          createdAt: email.createdAt
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// List uploaded emails
router.get('/emails',
  authenticate,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const skip = (page - 1) * limit;

      const [emails, total] = await Promise.all([
        prisma.inboundEmail.findMany({
          skip,
          take: limit,
          orderBy: { receivedAt: 'desc' },
          select: {
            id: true,
            messageId: true,
            fromAddr: true,
            subject: true,
            receivedAt: true,
            createdAt: true
          }
        }),
        prisma.inboundEmail.count()
      ]);

      res.json({
        emails,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get specific email details
router.get('/emails/:id',
  authenticate,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      
      const email = await prisma.inboundEmail.findUnique({
        where: { id: parseInt(id) }
      });

      if (!email) {
        throw new AppError('Email not found', 404);
      }

      res.json({
        email: {
          id: email.id,
          messageId: email.messageId,
          from: email.fromAddr,
          subject: email.subject,
          receivedAt: email.receivedAt,
          rawContent: email.raw,
          parsedType: 'RAW_EMAIL',
          parsedData: null,
          createdAt: email.createdAt
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// Bulk email upload
router.post('/emails/bulk',
  authenticate,
  strictRateLimiter,
  [
    body('emails').isArray({ min: 1, max: 50 }).withMessage('Emails array must contain 1-50 items'),
    body('emails.*.subject').notEmpty().withMessage('Email subject is required'),
    body('emails.*.from').isEmail().withMessage('Valid sender email is required'),
    body('emails.*.body').notEmpty().withMessage('Email body is required'),
  ],
  validate,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { emails } = req.body;
      
      logger.info(`Bulk email upload: ${emails.length} emails`);
      
      const uploadedEmails = await Promise.all(
        emails.map(async (emailData: any) => {
          return await prisma.inboundEmail.create({
            data: {
              messageId: `bulk_${Date.now()}_${Math.random()}`,
              fromAddr: emailData.from,
              subject: emailData.subject,
              receivedAt: emailData.receivedAt ? new Date(emailData.receivedAt) : new Date(),
              raw: `Subject: ${emailData.subject}\nFrom: ${emailData.from}\nTo: ${emailData.to || 'Bulk Upload'}\n\n${emailData.body}`,
            }
          });
        })
      );

      res.status(201).json({
        success: true,
        message: `${uploadedEmails.length} emails uploaded successfully`,
        uploadedCount: uploadedEmails.length,
        emails: uploadedEmails.map(email => ({
          id: email.id,
          subject: email.subject,
          from: email.fromAddr,
          receivedAt: email.receivedAt
        }))
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;