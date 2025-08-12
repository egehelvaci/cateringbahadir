import { Router } from 'express';
import { body, query } from 'express-validator';
import { prisma } from '../config/database';
import { validate } from '../middleware/validation';
import { authenticate } from '../middleware/auth';
import { OpenAIService } from '../services/openai.service';
import { AppError } from '../middleware/errorHandler';
import { strictRateLimiter } from '../middleware/rateLimiter';

const router = Router();
const openaiService = new OpenAIService();

router.get(
  '/',
  authenticate,
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('parsedType').optional().isIn(['CARGO', 'VESSEL']),
  ],
  validate,
  async (req, res, next) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const skip = (page - 1) * limit;

      const where: any = {};

      if (req.query.parsedType) {
        where.parsedType = req.query.parsedType;
      }

      const [emails, total] = await Promise.all([
        prisma.inboundEmail.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.inboundEmail.count({ where }),
      ]);

      res.json({
        emails,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/ingest',
  strictRateLimiter,
  authenticate,
  [
    body('emailText')
      .isString()
      .trim()
      .isLength({ min: 10, max: 32768 })
      .withMessage('Email text must be between 10 and 32,768 characters'),
    body('messageId').optional().isString().trim(),
    body('fromAddr').optional().isEmail(),
    body('subject').optional().isString().trim(),
    body('receivedAt').optional().isISO8601(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { emailText, messageId, fromAddr, subject, receivedAt } = req.body;

      // Check for duplicate messageId
      if (messageId) {
        const existing = await prisma.inboundEmail.findUnique({
          where: { messageId },
        });

        if (existing) {
          return res.json({
            ok: true,
            duplicate: true,
            message: 'Email already processed',
            emailId: existing.id,
          });
        }
      }

      // Extract using OpenAI
      const extraction = await openaiService.extractFromEmail(emailText);

      // Save to InboundEmail
      const email = await prisma.inboundEmail.create({
        data: {
          messageId,
          fromAddr,
          subject,
          receivedAt: receivedAt ? new Date(receivedAt) : new Date(),
          raw: emailText,
          parsedType: extraction.type,
          parsedJson: extraction.data as any,
        },
      });

      // Generate embedding text
      const embeddingText = openaiService.generateEmbeddingText(
        extraction.type,
        extraction.data
      );
      const embedding = await openaiService.generateEmbedding(embeddingText);
      const embeddingBytes = Buffer.from(new Float32Array(embedding).buffer);

      let entityId: number;

      // Insert into appropriate table
      if (extraction.type === 'CARGO') {
        const cargoData = extraction.data as any;
        const cargo = await prisma.cargo.create({
          data: {
            commodity: cargoData.commodity,
            qtyValue: cargoData.qtyValue,
            qtyUnit: cargoData.qtyUnit,
            loadPort: cargoData.loadPort,
            dischargePort: cargoData.dischargePort,
            laycanStart: cargoData.laycanStart ? new Date(cargoData.laycanStart) : null,
            laycanEnd: cargoData.laycanEnd ? new Date(cargoData.laycanEnd) : null,
            notes: cargoData.notes,
            embedding: embeddingBytes,
          },
        });
        entityId = cargo.id;
      } else {
        const vesselData = extraction.data as any;
        const vessel = await prisma.vessel.create({
          data: {
            name: vesselData.name,
            imo: vesselData.imo,
            dwt: vesselData.dwt,
            capacityTon: vesselData.capacityTon,
            capacityM3: vesselData.capacityM3,
            currentArea: vesselData.currentArea,
            availableFrom: vesselData.availableFrom ? new Date(vesselData.availableFrom) : null,
            gear: vesselData.gear,
            notes: vesselData.notes,
            embedding: embeddingBytes,
          },
        });
        entityId = vessel.id;
      }

      res.json({
        ok: true,
        entity: extraction.type,
        id: entityId,
        emailId: email.id,
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        throw new AppError('Email processing failed: Invalid extraction', 422);
      }
      
      if (error.message?.includes('OpenAI')) {
        throw new AppError('AI processing service temporarily unavailable', 503);
      }

      next(error);
    }
  }
);


export default router;