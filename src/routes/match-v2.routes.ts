import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { prisma } from '../config/database';
import { validate } from '../middleware/validation';
import { authenticate, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { MatchingV2Service } from '../services/matching-v2.service';

const router = Router();
const matchingService = new MatchingV2Service();

// Get matches with optional filtering
router.get(
  '/',
  authenticate,
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('status').optional().isIn(['SUGGESTED', 'ACCEPTED', 'REJECTED']),
    query('minScore').optional().isFloat({ min: 0, max: 100 }),
    query('vesselId').optional().isInt({ min: 1 }),
    query('cargoId').optional().isInt({ min: 1 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const skip = (page - 1) * limit;

      const where: any = {};

      if (req.query.status) {
        where.status = req.query.status;
      }

      if (req.query.minScore) {
        where.score = { gte: parseFloat(req.query.minScore as string) };
      }

      if (req.query.vesselId) {
        where.vesselId = parseInt(req.query.vesselId as string);
      }

      if (req.query.cargoId) {
        where.cargoId = parseInt(req.query.cargoId as string);
      }

      const [matches, total] = await Promise.all([
        prisma.match.findMany({
          where,
          skip,
          take: limit,
          include: {
            vessel: true,
            cargo: true,
          },
          orderBy: { score: 'desc' },
        }),
        prisma.match.count({ where }),
      ]);

      res.json({
        matches,
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

// Generate matches for specific cargo
router.get(
  '/cargo/:cargoId',
  authenticate,
  [param('cargoId').isInt({ min: 1 })],
  validate,
  async (req, res, next) => {
    try {
      const cargoId = parseInt(req.params.cargoId);
      
      const cargo = await prisma.cargo.findUnique({
        where: { id: cargoId },
      });

      if (!cargo) {
        throw new AppError('Cargo not found', 404);
      }

      const matches = await matchingService.findTopMatchesForCargo(cargoId, 3);

      res.json({
        cargo,
        matches,
        generated: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

// Generate matches for specific vessel
router.get(
  '/vessel/:vesselId',
  authenticate,
  [param('vesselId').isInt({ min: 1 })],
  validate,
  async (req, res, next) => {
    try {
      const vesselId = parseInt(req.params.vesselId);
      
      const vessel = await prisma.vessel.findUnique({
        where: { id: vesselId },
      });

      if (!vessel) {
        throw new AppError('Vessel not found', 404);
      }

      const matches = await matchingService.findTopMatchesForVessel(vesselId, 3);

      res.json({
        vessel,
        matches,
        generated: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

// Select/decide on a match
router.post(
  '/select',
  authenticate,
  [
    body('matchId').isInt({ min: 1 }),
    body('accept').isBoolean(),
  ],
  validate,
  async (req: AuthRequest, res, next) => {
    try {
      const { matchId, accept } = req.body;

      const match = await prisma.match.findUnique({
        where: { id: matchId },
        include: {
          vessel: true,
          cargo: true,
        },
      });

      if (!match) {
        throw new AppError('Match not found', 404);
      }

      if (match.status !== 'SUGGESTED') {
        throw new AppError('Match has already been decided', 400);
      }

      // Update this match
      const updatedMatch = await prisma.match.update({
        where: { id: matchId },
        data: {
          status: accept ? 'ACCEPTED' : 'REJECTED',
          selected: accept,
        },
        include: {
          vessel: true,
          cargo: true,
        },
      });

      // If accepted, reject other matches for the same cargo
      if (accept) {
        await prisma.match.updateMany({
          where: {
            cargoId: match.cargoId,
            id: { not: matchId },
            status: 'SUGGESTED',
          },
          data: {
            status: 'REJECTED',
            selected: false,
          },
        });
      }

      res.json({
        match: updatedMatch,
        decision: accept ? 'ACCEPTED' : 'REJECTED',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get specific match details
router.get(
  '/:id',
  authenticate,
  [param('id').isInt({ min: 1 })],
  validate,
  async (req, res, next) => {
    try {
      const match = await prisma.match.findUnique({
        where: { id: parseInt(req.params.id) },
        include: {
          vessel: true,
          cargo: true,
        },
      });

      if (!match) {
        throw new AppError('Match not found', 404);
      }

      res.json(match);
    } catch (error) {
      next(error);
    }
  }
);

export default router;