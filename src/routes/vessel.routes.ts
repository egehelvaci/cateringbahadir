import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { prisma } from '../config/database';
import { validate } from '../middleware/validation';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { matchingQueue } from '../config/queue';

const router = Router();

router.get(
  '/',
  authenticate,
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('availableFrom').optional().isISO8601(),
    query('currentArea').optional().trim(),
    query('minDwt').optional().isInt({ min: 0 }),
    query('maxDwt').optional().isInt({ min: 0 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const skip = (page - 1) * limit;

      const where: any = {};

      if (req.query.availableFrom) {
        where.availableFrom = { gte: new Date(req.query.availableFrom as string) };
      }

      if (req.query.currentArea) {
        where.currentArea = { contains: req.query.currentArea, mode: 'insensitive' };
      }

      if (req.query.minDwt) {
        where.dwt = { ...where.dwt, gte: parseInt(req.query.minDwt as string) };
      }

      if (req.query.maxDwt) {
        where.dwt = { ...where.dwt, lte: parseInt(req.query.maxDwt as string) };
      }

      const [vessels, total] = await Promise.all([
        prisma.vessel.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.vessel.count({ where }),
      ]);

      res.json({
        vessels: vessels.map(v => ({ ...v, id: v.id.toString() })),
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
      const vessel = await prisma.vessel.findUnique({
        where: { id: BigInt(req.params.id) },
        include: {
          matches: {
            include: {
              cargo: {
                include: {
                  loadPort: true,
                  dischargePort: true,
                },
              },
            },
            orderBy: { score: 'desc' },
            take: 10,
          },
        },
      });

      if (!vessel) {
        throw new AppError('Vessel not found', 404);
      }

      res.json({
        ...vessel,
        id: vessel.id.toString(),
        matches: vessel.matches.map(m => ({
          ...m,
          id: m.id.toString(),
          vesselId: m.vesselId.toString(),
          cargoId: m.cargoId.toString(),
          cargo: {
            ...m.cargo,
            id: m.cargo.id.toString(),
            loadPortId: m.cargo.loadPortId?.toString(),
            dischargePortId: m.cargo.dischargePortId?.toString(),
          },
        })),
      });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/',
  authenticate,
  [
    body('name').optional().trim().notEmpty(),
    body('imo').optional().trim().matches(/^\d{7}$/),
    body('dwt').optional().isInt({ min: 0 }),
    body('capacityJson').optional().isObject(),
    body('currentArea').optional().trim(),
    body('availableFrom').optional().isISO8601(),
    body('gear').optional().isIn(['geared', 'gearless']),
  ],
  validate,
  async (req, res, next) => {
    try {
      const vessel = await prisma.vessel.create({
        data: {
          ...req.body,
          availableFrom: req.body.availableFrom ? new Date(req.body.availableFrom) : undefined,
        },
      });

      await matchingQueue.add('match-vessel', { 
        type: 'match-vessel',
        vesselId: vessel.id.toString() 
      });

      res.status(201).json({
        ...vessel,
        id: vessel.id.toString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

router.put(
  '/:id',
  authenticate,
  [
    param('id').notEmpty(),
    body('name').optional().trim().notEmpty(),
    body('imo').optional().trim().matches(/^\d{7}$/),
    body('dwt').optional().isInt({ min: 0 }),
    body('capacityJson').optional().isObject(),
    body('currentArea').optional().trim(),
    body('availableFrom').optional().isISO8601(),
    body('gear').optional().isIn(['geared', 'gearless']),
  ],
  validate,
  async (req, res, next) => {
    try {
      const vessel = await prisma.vessel.update({
        where: { id: BigInt(req.params.id) },
        data: {
          ...req.body,
          availableFrom: req.body.availableFrom ? new Date(req.body.availableFrom) : undefined,
        },
      });

      await matchingQueue.add('match-vessel', { 
        type: 'match-vessel',
        vesselId: vessel.id.toString() 
      });

      res.json({
        ...vessel,
        id: vessel.id.toString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

router.delete(
  '/:id',
  authenticate,
  [param('id').notEmpty()],
  validate,
  async (req, res, next) => {
    try {
      await prisma.vessel.delete({
        where: { id: BigInt(req.params.id) },
      });

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

export default router;