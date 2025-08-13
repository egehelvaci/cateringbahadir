import { Router, Request, Response, NextFunction } from 'express';
import { body, query } from 'express-validator';
import { validate } from '../middleware/validation';
import { authenticate } from '../middleware/auth';
import { prisma } from '../config/database';
import { AIMatchingService } from '../services/ai-matching.service';

const router = Router();
const aiMatchingService = new AIMatchingService();

// Get all matches
router.get('/matches',
  authenticate,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('status').optional().isIn(['SUGGESTED', 'ACCEPTED', 'REJECTED']).withMessage('Invalid status'),
    query('minScore').optional().isFloat({ min: 0, max: 100 }).withMessage('Min score must be between 0 and 100'),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { 
        page = 1, 
        limit = 50, 
        status,
        minScore
      } = req.query;
      
      const offset = (Number(page) - 1) * Number(limit);
      
      const where: any = {};
      
      if (status) {
        where.status = status;
      }
      
      if (minScore) {
        where.score = {
          gte: Number(minScore)
        };
      }
      
      const [matches, total] = await Promise.all([
        prisma.match.findMany({
          where,
          orderBy: { score: 'desc' },
          take: Number(limit),
          skip: offset,
          include: {
            cargo: true,
            vessel: true
          }
        }),
        prisma.match.count({ where })
      ]);
      
      res.json({
        success: true,
        data: matches,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          totalPages: Math.ceil(total / Number(limit))
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// Find best matches using AI
router.post('/matches/find',
  authenticate,
  [
    body('cargoId').optional().isInt().withMessage('Cargo ID must be an integer'),
    body('vesselId').optional().isInt().withMessage('Vessel ID must be an integer'),
    body('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { cargoId, vesselId, limit = 10 } = req.body;
      
      if (!cargoId && !vesselId) {
        res.status(400).json({
          success: false,
          message: 'Either cargoId or vesselId must be provided'
        });
        return;
      }
      
      const matches = await aiMatchingService.findBestMatches(cargoId, vesselId, Number(limit));
      
      res.json({
        success: true,
        data: matches,
        message: `Found ${matches.length} potential matches`
      });
    } catch (error) {
      next(error);
    }
  }
);

// Create a new match with AI analysis
router.post('/matches',
  authenticate,
  [
    body('cargoId').isInt().withMessage('Cargo ID is required and must be an integer'),
    body('vesselId').isInt().withMessage('Vessel ID is required and must be an integer'),
    body('manualScore').optional().isFloat({ min: 0, max: 100 }).withMessage('Manual score must be between 0 and 100'),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { cargoId, vesselId, manualScore } = req.body;
      
      // Check if match already exists
      const existingMatch = await prisma.match.findFirst({
        where: { cargoId: Number(cargoId), vesselId: Number(vesselId) }
      });
      
      if (existingMatch) {
        res.status(400).json({
          success: false,
          message: 'Match already exists between this cargo and vessel'
        });
        return;
      }
      
      const match = await aiMatchingService.createMatch(
        Number(cargoId), 
        Number(vesselId), 
        manualScore ? Number(manualScore) : undefined
      );
      
      res.status(201).json({
        success: true,
        data: match,
        message: 'Match created successfully with AI analysis'
      });
    } catch (error) {
      next(error);
    }
  }
);

// Analyze specific cargo-vessel pair without creating match
router.post('/matches/analyze',
  authenticate,
  [
    body('cargoId').isInt().withMessage('Cargo ID is required and must be an integer'),
    body('vesselId').isInt().withMessage('Vessel ID is required and must be an integer'),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { cargoId, vesselId } = req.body;
      
      const [cargo, vessel] = await Promise.all([
        prisma.cargo.findUnique({ where: { id: Number(cargoId) } }),
        prisma.vessel.findUnique({ where: { id: Number(vesselId) } })
      ]);
      
      if (!cargo || !vessel) {
        res.status(404).json({
          success: false,
          message: 'Cargo or vessel not found'
        });
        return;
      }
      
      const analysis = await aiMatchingService.analyzeMatch(cargo, vessel);
      
      res.json({
        success: true,
        data: {
          cargo,
          vessel,
          analysis
        },
        message: 'AI analysis completed'
      });
    } catch (error) {
      next(error);
    }
  }
);

// Update match status
router.patch('/matches/:id',
  authenticate,
  [
    body('status').isIn(['PENDING', 'CONFIRMED', 'REJECTED']).withMessage('Invalid status'),
    body('notes').optional().isString().withMessage('Notes must be a string'),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      
      const match = await prisma.match.update({
        where: { id: Number(id) },
        data: {
          status
        },
        include: {
          cargo: true,
          vessel: true
        }
      });
      
      res.json({
        success: true,
        data: match,
        message: 'Match updated successfully'
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get specific match details
router.get('/matches/:id',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      
      const match = await prisma.match.findUnique({
        where: { id: Number(id) },
        include: {
          cargo: true,
          vessel: true
        }
      });
      
      if (!match) {
        res.status(404).json({
          success: false,
          message: 'Match not found'
        });
        return;
      }
      
      res.json({
        success: true,
        data: match
      });
    } catch (error) {
      next(error);
    }
  }
);

// Auto-match: Find and create best matches automatically
router.post('/matches/auto',
  authenticate,
  [
    body('minScore').optional().isFloat({ min: 0, max: 100 }).withMessage('Min score must be between 0 and 100'),
    body('maxMatches').optional().isInt({ min: 1, max: 20 }).withMessage('Max matches must be between 1 and 20'),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { minScore = 70, maxMatches = 10 } = req.body;
      
      // Find best overall matches
      const potentialMatches = await aiMatchingService.findBestMatches(undefined, undefined, 50);
      
      // Filter by minimum score and create matches
      const createdMatches = [];
      let created = 0;
      
      for (const match of potentialMatches) {
        if (created >= maxMatches) break;
        if (match.matching.score < minScore) continue;
        
        // Check if match already exists
        const existing = await prisma.match.findFirst({
          where: { 
            cargoId: match.cargo.id, 
            vesselId: match.vessel.id 
          }
        });
        
        if (!existing) {
          const createdMatch = await aiMatchingService.createMatch(
            match.cargo.id, 
            match.vessel.id, 
            match.matching.score
          );
          createdMatches.push(createdMatch);
          created++;
        }
      }
      
      res.json({
        success: true,
        data: createdMatches,
        message: `Created ${createdMatches.length} automatic matches with score ≥ ${minScore}%`
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;