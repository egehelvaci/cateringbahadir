import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validation';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { OpenAIService } from '../services/openai.service';
import { strictRateLimiter } from '../middleware/rateLimiter';

const router = Router();
const openaiService = new OpenAIService();

router.post(
  '/',
  strictRateLimiter,
  authenticate,
  [
    body('emailText')
      .isString()
      .trim()
      .isLength({ min: 10, max: 32768 })
      .withMessage('Email text must be between 10 and 32,768 characters'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { emailText } = req.body;

      const result = await openaiService.extractFromEmail(emailText);

      res.json({
        ok: true,
        type: result.type,
        parsed: result.data,
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        throw new AppError('Extraction failed: Invalid schema validation', 422);
      }
      
      if (error.message?.includes('OpenAI')) {
        throw new AppError('AI extraction service temporarily unavailable', 503);
      }

      next(error);
    }
  }
);

export default router;