import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { strictRateLimiter } from '../middleware/rateLimiter';
import { prisma } from '../config/database';
import { AIClassificationService } from '../services/ai-classification.service';
import { OpenAIService } from '../services/openai.service';
import { logger } from '../utils/logger';

const router = Router();
const aiClassification = new AIClassificationService();
const openaiService = new OpenAIService();

// Debug: Get recent emails with classification info
router.get('/emails/recent',
  strictRateLimiter,
  authenticate,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const emails = await prisma.inboundEmail.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          fromAddr: true,
          subject: true,
          receivedAt: true,
          parsedType: true,
          parsedJson: true,
          raw: true,
          createdAt: true
        }
      });

      // Clean up raw content for display
      const cleanEmails = emails.map(email => ({
        ...email,
        raw: email.raw ? email.raw.substring(0, 500) + '...' : null,
        bodyPreview: email.raw ? 
          email.raw.replace(/<[^>]*>/g, '').substring(0, 200) + '...' : 
          null
      }));

      res.json({
        success: true,
        data: cleanEmails,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

// Debug: Get cargo and vessel counts
router.get('/stats',
  strictRateLimiter,
  authenticate,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const [
        totalEmails,
        processedEmails,
        cargoEmails,
        vesselEmails,
        cargoCount,
        vesselCount,
        recentCargos,
        recentVessels
      ] = await Promise.all([
        prisma.inboundEmail.count(),
        prisma.inboundEmail.count({ where: { parsedType: { not: null } } }),
        prisma.inboundEmail.count({ where: { parsedType: 'CARGO' } }),
        prisma.inboundEmail.count({ where: { parsedType: 'VESSEL' } }),
        prisma.cargo.count(),
        prisma.vessel.count(),
        prisma.cargo.findMany({
          orderBy: { createdAt: 'desc' },
          take: 5,
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
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            name: true,
            dwt: true,
            currentArea: true,
            availableFrom: true,
            createdAt: true
          }
        })
      ]);

      res.json({
        success: true,
        data: {
          emails: {
            total: totalEmails,
            processed: processedEmails,
            unprocessed: totalEmails - processedEmails,
            cargoEmails,
            vesselEmails
          },
          records: {
            cargoCount,
            vesselCount
          },
          recent: {
            cargos: recentCargos,
            vessels: recentVessels
          }
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

// Debug: Test classification on specific email
router.post('/test-classification',
  strictRateLimiter,
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { emailId } = req.body;

      if (!emailId) {
        res.status(400).json({
          success: false,
          message: 'Email ID is required'
        });
        return;
      }

      const email = await prisma.inboundEmail.findUnique({
        where: { id: parseInt(emailId) }
      });

      if (!email) {
        res.status(404).json({
          success: false,
          message: 'Email not found'
        });
        return;
      }

      // Test AI classification
      const classification = await aiClassification.classifyEmail(
        email.subject || '',
        email.raw || '',
        email.fromAddr || ''
      );

      // Test OpenAI extraction if classification is good
      let extraction = null;
      if (classification.type !== 'UNKNOWN' && classification.confidence > 0.3) {
        try {
          extraction = await openaiService.extractFromEmail(email.raw || '');
        } catch (error) {
          logger.error('OpenAI extraction failed:', error);
        }
      }

      res.json({
        success: true,
        data: {
          email: {
            id: email.id,
            subject: email.subject,
            from: email.fromAddr,
            currentType: email.parsedType
          },
          classification,
          extraction,
          wouldProcess: classification.type !== 'UNKNOWN' && classification.confidence > 0.3
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
