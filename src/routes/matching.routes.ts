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

// AI-Enhanced Matching Endpoints

// POST /matches/reanalyze - Tüm pending match'leri AI ile yeniden analiz et
router.post('/matches/reanalyze',
  authenticate,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await aiMatchingService.reanalyzePendingMatches();
      
      res.json({
        success: true,
        data: result,
        message: `Reanalyzed ${result.processed} matches, ${result.enhanced} enhanced`,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /matches/quality-metrics - Matching kalitesi metrikleri
router.get('/matches/quality-metrics',
  authenticate,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const metrics = await aiMatchingService.getMatchQualityMetrics();
      
      res.json({
        success: true,
        data: metrics,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /matches/:id/ai-analysis - Specific match'in AI analizi
router.get('/matches/:id/ai-analysis',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const matchId = parseInt(req.params.id);
      
      const match = await prisma.match.findUnique({
        where: { id: matchId },
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
      
      // Extract AI analysis from reason field
      const aiAnalysis = (match.reason as any)?.aiAnalysis;
      
      if (!aiAnalysis) {
        res.status(404).json({
          success: false,
          message: 'AI analysis not available for this match'
        });
        return;
      }
      
      res.json({
        success: true,
        data: {
          matchId: match.id,
          score: match.score,
          status: match.status,
          aiAnalysis,
          cargo: {
            id: match.cargo.id,
            commodity: match.cargo.commodity,
            loadPort: match.cargo.loadPort,
            dischargePort: match.cargo.dischargePort
          },
          vessel: {
            id: match.vessel.id,
            name: match.vessel.name,
            dwt: match.vessel.dwt,
            currentArea: match.vessel.currentArea
          }
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /matches/trigger-auto/:type/:id - Manuel olarak otomatik matching tetikle
router.post('/matches/trigger-auto/:type/:id',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { type, id } = req.params;
      const recordId = parseInt(id);
      
      if (!['cargo', 'vessel'].includes(type)) {
        res.status(400).json({
          success: false,
          message: 'Type must be "cargo" or "vessel"'
        });
        return;
      }
      
      if (type === 'cargo') {
        await aiMatchingService.triggerMatchingForNewCargo(recordId);
      } else {
        await aiMatchingService.triggerMatchingForNewVessel(recordId);
      }
      
      res.json({
        success: true,
        message: `Automatic matching triggered for ${type} ${recordId}`,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /matches/enhanced - AI-enhanced match listesi
router.get('/matches/enhanced',
  authenticate,
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('minCompatibility').optional().isInt({ min: 0, max: 100 }),
    query('hasAI').optional().isBoolean()
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { 
        page = 1, 
        limit = 20, 
        minCompatibility = 0,
        hasAI = 'true'
      } = req.query;
      
      const offset = (Number(page) - 1) * Number(limit);
      
      // Build where clause
      const where: any = {};
      
      if (hasAI === 'true') {
        where.reason = {
          path: ['aiAnalysis'],
          not: null
        };
      }
      
      const matches = await prisma.match.findMany({
        where,
        include: {
          cargo: {
            select: {
              id: true,
              commodity: true,
              qtyValue: true,
              qtyUnit: true,
              loadPort: true,
              dischargePort: true,
              laycanStart: true,
              laycanEnd: true
            }
          },
          vessel: {
            select: {
              id: true,
              name: true,
              dwt: true,
              currentArea: true,
              availableFrom: true,
              gear: true
            }
          }
        },
        orderBy: [
          { score: 'desc' },
          { createdAt: 'desc' }
        ],
        skip: offset,
        take: Number(limit)
      });
      
      // Filter by AI compatibility if specified
      const filteredMatches = matches.filter(match => {
        const aiAnalysis = (match.reason as any)?.aiAnalysis;
        if (!aiAnalysis) return hasAI !== 'true';
        return aiAnalysis.compatibility >= Number(minCompatibility);
      });
      
      // Format enhanced matches
      const enhancedMatches = filteredMatches.map(match => {
        const aiAnalysis = (match.reason as any)?.aiAnalysis;
        
        return {
          id: match.id,
          score: match.score,
          status: match.status,
          createdAt: match.createdAt,
          cargo: match.cargo,
          vessel: match.vessel,
          aiEnhanced: !!aiAnalysis,
          aiCompatibility: aiAnalysis?.compatibility || null,
          aiRecommendations: aiAnalysis?.recommendations || [],
          aiRisks: aiAnalysis?.risks || [],
          summary: {
            route: `${match.cargo.loadPort || 'Unknown'} → ${match.cargo.dischargePort || 'Unknown'}`,
            commodity: match.cargo.commodity,
            vessel: match.vessel.name || 'Unknown',
            utilization: match.cargo.qtyValue && match.vessel.dwt ? 
              Math.round((match.cargo.qtyValue / match.vessel.dwt) * 100) + '%' : 'Unknown'
          }
        };
      });
      
      const totalCount = await prisma.match.count({ where });
      const totalPages = Math.ceil(totalCount / Number(limit));
      
      res.json({
        success: true,
        data: {
          matches: enhancedMatches,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            totalCount,
            totalPages,
            hasNext: Number(page) < totalPages,
            hasPrev: Number(page) > 1
          },
          filters: {
            minCompatibility: Number(minCompatibility),
            hasAI: hasAI === 'true'
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