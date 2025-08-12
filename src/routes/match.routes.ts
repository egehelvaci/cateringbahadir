import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { prisma } from '../config/database';
import { validate } from '../middleware/validation';
import { authenticate, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { MatchStatus } from '@prisma/client';

const router = Router();

router.get(
  '/',
  authenticate,
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('status').optional().isIn(['SUGGESTED', 'ACCEPTED', 'REJECTED']),
    query('minScore').optional().isFloat({ min: 0, max: 100 }),
    query('vesselId').optional().isNumeric(),
    query('cargoId').optional().isNumeric(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const skip = (page - 1) * limit;

      const where: any = {};

      if (req.query.status) {
        where.status = req.query.status as MatchStatus;
      }

      if (req.query.minScore) {
        where.score = { gte: parseFloat(req.query.minScore as string) };
      }

      if (req.query.vesselId) {
        where.vesselId = BigInt(req.query.vesselId as string);
      }

      if (req.query.cargoId) {
        where.cargoId = BigInt(req.query.cargoId as string);
      }

      const [matches, total] = await Promise.all([
        prisma.match.findMany({
          where,
          skip,
          take: limit,
          include: {
            vessel: true,
            cargo: {
              include: {
                loadPort: true,
                dischargePort: true,
              },
            },
          },
          orderBy: { score: 'desc' },
        }),
        prisma.match.count({ where }),
      ]);

      res.json({
        matches: matches.map(m => ({
          ...m,
          id: m.id.toString(),
          vesselId: m.vesselId.toString(),
          cargoId: m.cargoId.toString(),
          decidedBy: m.decidedBy?.toString(),
          vessel: { ...m.vessel, id: m.vessel.id.toString() },
          cargo: {
            ...m.cargo,
            id: m.cargo.id.toString(),
            loadPortId: m.cargo.loadPortId?.toString(),
            dischargePortId: m.cargo.dischargePortId?.toString(),
            loadPort: m.cargo.loadPort ? { ...m.cargo.loadPort, id: m.cargo.loadPort.id.toString() } : null,
            dischargePort: m.cargo.dischargePort ? { ...m.cargo.dischargePort, id: m.cargo.dischargePort.id.toString() } : null,
          },
        })),
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

router.get(
  '/:id',
  authenticate,
  [param('id').notEmpty()],
  validate,
  async (req, res, next) => {
    try {
      const match = await prisma.match.findUnique({
        where: { id: BigInt(req.params.id) },
        include: {
          vessel: true,
          cargo: {
            include: {
              loadPort: true,
              dischargePort: true,
            },
          },
        },
      });

      if (!match) {
        throw new AppError('Match not found', 404);
      }

      res.json({
        ...match,
        id: match.id.toString(),
        vesselId: match.vesselId.toString(),
        cargoId: match.cargoId.toString(),
        decidedBy: match.decidedBy?.toString(),
        vessel: { ...match.vessel, id: match.vessel.id.toString() },
        cargo: {
          ...match.cargo,
          id: match.cargo.id.toString(),
          loadPortId: match.cargo.loadPortId?.toString(),
          dischargePortId: match.cargo.dischargePortId?.toString(),
          loadPort: match.cargo.loadPort ? { ...match.cargo.loadPort, id: match.cargo.loadPort.id.toString() } : null,
          dischargePort: match.cargo.dischargePort ? { ...match.cargo.dischargePort, id: match.cargo.dischargePort.id.toString() } : null,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

router.patch(
  '/:id/status',
  authenticate,
  [
    param('id').notEmpty(),
    body('status').isIn(['ACCEPTED', 'REJECTED']),
  ],
  validate,
  async (req: AuthRequest, res, next) => {
    try {
      const match = await prisma.match.findUnique({
        where: { id: BigInt(req.params.id) },
      });

      if (!match) {
        throw new AppError('Match not found', 404);
      }

      if (match.status !== MatchStatus.SUGGESTED) {
        throw new AppError('Match has already been decided', 400);
      }

      const updatedMatch = await prisma.match.update({
        where: { id: BigInt(req.params.id) },
        data: {
          status: req.body.status as MatchStatus,
          decidedBy: req.userId,
          decidedAt: new Date(),
        },
        include: {
          vessel: true,
          cargo: {
            include: {
              loadPort: true,
              dischargePort: true,
            },
          },
        },
      });

      res.json({
        ...updatedMatch,
        id: updatedMatch.id.toString(),
        vesselId: updatedMatch.vesselId.toString(),
        cargoId: updatedMatch.cargoId.toString(),
        decidedBy: updatedMatch.decidedBy?.toString(),
        vessel: { ...updatedMatch.vessel, id: updatedMatch.vessel.id.toString() },
        cargo: {
          ...updatedMatch.cargo,
          id: updatedMatch.cargo.id.toString(),
          loadPortId: updatedMatch.cargo.loadPortId?.toString(),
          dischargePortId: updatedMatch.cargo.dischargePortId?.toString(),
          loadPort: updatedMatch.cargo.loadPort ? { ...updatedMatch.cargo.loadPort, id: updatedMatch.cargo.loadPort.id.toString() } : null,
          dischargePort: updatedMatch.cargo.dischargePort ? { ...updatedMatch.cargo.dischargePort, id: updatedMatch.cargo.dischargePort.id.toString() } : null,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/generate',
  authenticate,
  [
    body('vesselId').optional().isNumeric(),
    body('cargoId').optional().isNumeric(),
  ],
  validate,
  async (req, res, next) => {
    try {
      if (!req.body.vesselId && !req.body.cargoId) {
        throw new AppError('Either vesselId or cargoId must be provided', 400);
      }

      const { MatchingService } = await import('../services/matching.service');
      const matchingService = new MatchingService();

      let matches = [];

      if (req.body.vesselId) {
        matches = await matchingService.findTopMatchesForVessel(BigInt(req.body.vesselId));
      } else if (req.body.cargoId) {
        matches = await matchingService.findTopMatchesForCargo(BigInt(req.body.cargoId));
      }

      for (const match of matches) {
        await matchingService.createMatch(match.vesselId, match.cargoId);
      }

      res.json({
        message: `Generated ${matches.length} matches`,
        matches: matches.map(m => ({
          vesselId: m.vesselId.toString(),
          cargoId: m.cargoId.toString(),
          score: m.score,
          reasons: m.reasons,
        })),
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;