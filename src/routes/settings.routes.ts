import { Router, Request, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth';
import { strictRateLimiter } from '../middleware/rateLimiter';
import { validate } from '../middleware/validation';
import { prisma } from '../config/database';

const router = Router();

// GET /settings/email-accounts - Email hesaplarını listele
router.get('/email-accounts',
  strictRateLimiter,
  authenticate,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const [googleAccounts, microsoftAccounts] = await Promise.all([
        prisma.googleAccount.findMany({
          select: {
            id: true,
            email: true,
            scope: true,
            createdAt: true,
            updatedAt: true
          }
        }),
        prisma.microsoftAccount.findMany({
          select: {
            id: true,
            email: true,
            scope: true,
            createdAt: true,
            updatedAt: true
          }
        })
      ]);

      res.json({
        success: true,
        data: {
          google: googleAccounts,
          microsoft: microsoftAccounts,
          total: googleAccounts.length + microsoftAccounts.length
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      next(error);
    }
  }
);

// DELETE /settings/email-accounts/google/:id - Google hesabını sil
router.delete('/email-accounts/google/:id',
  strictRateLimiter,
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const accountId = parseInt(req.params.id);

      const deletedAccount = await prisma.googleAccount.delete({
        where: { id: accountId }
      });

      res.json({
        success: true,
        message: 'Google account removed successfully',
        data: {
          email: deletedAccount.email
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      next(error);
    }
  }
);

// DELETE /settings/email-accounts/microsoft/:id - Microsoft hesabını sil
router.delete('/email-accounts/microsoft/:id',
  strictRateLimiter,
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const accountId = parseInt(req.params.id);

      const deletedAccount = await prisma.microsoftAccount.delete({
        where: { id: Number(accountId) }
      });

      res.json({
        success: true,
        message: 'Microsoft account removed successfully',
        data: {
          email: deletedAccount.email
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      next(error);
    }
  }
);

// GET /settings/ai-config - AI ayarlarını getir
router.get('/ai-config',
  strictRateLimiter,
  authenticate,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      // Environment variables'dan AI config'i getir
      const config = {
        openai: {
          model: process.env.OPENAI_EXTRACT_MODEL || 'gpt-4o-mini',
          embeddingModel: process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small',
          temperature: parseFloat(process.env.EXTRACTION_TEMPERATURE || '0'),
          isConfigured: !!process.env.OPENAI_API_KEY
        },
        classification: {
          confidenceThreshold: 0.3,
          fallbackEnabled: true
        }
      };

      res.json({
        success: true,
        data: config,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      next(error);
    }
  }
);

// GET /settings/processing-stats - İşleme istatistikleri
router.get('/processing-stats',
  strictRateLimiter,
  authenticate,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const now = new Date();
      const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const [
        totalEmails,
        processedEmails,
        successfulCargos,
        successfulVessels,
        failedClassifications,
        last24HourStats
      ] = await Promise.all([
        prisma.inboundEmail.count(),
        prisma.inboundEmail.count({
          where: { parsedType: { not: null } }
        }),
        prisma.cargo.count(),
        prisma.vessel.count(),
        prisma.inboundEmail.count({
          where: { 
            parsedType: null,
            raw: { not: null }
          }
        }),
        prisma.inboundEmail.groupBy({
          by: ['parsedType'],
          where: {
            createdAt: { gte: last24Hours }
          },
          _count: { id: true }
        })
      ]);

      const processingRate = totalEmails > 0 ? 
        Math.round((processedEmails / totalEmails) * 100) : 0;

      res.json({
        success: true,
        data: {
          totals: {
            emails: totalEmails,
            processed: processedEmails,
            cargos: successfulCargos,
            vessels: successfulVessels,
            failed: failedClassifications
          },
          rates: {
            processing: processingRate,
            success: processedEmails > 0 ? 
              Math.round(((successfulCargos + successfulVessels) / processedEmails) * 100) : 0
          },
          last24Hours: last24HourStats.map(stat => ({
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

// POST /settings/test-processing - Manuel işleme testi
router.post('/test-processing',
  strictRateLimiter,
  authenticate,
  [
    body('emailIds').isArray().withMessage('Email IDs must be an array'),
    body('emailIds.*').isInt().withMessage('Each email ID must be an integer')
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { emailIds } = req.body;

      if (emailIds.length === 0) {
        res.status(400).json({
          success: false,
          message: 'At least one email ID is required'
        });
        return;
      }

      if (emailIds.length > 10) {
        res.status(400).json({
          success: false,
          message: 'Maximum 10 emails can be processed at once'
        });
        return;
      }

      // Bu implementation EmailProcessingService'i kullanabilir
      // Şimdilik basit bir response döndürelim
      res.json({
        success: true,
        message: 'Processing test initiated',
        data: {
          emailIds,
          status: 'queued'
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      next(error);
    }
  }
);

export default router;
