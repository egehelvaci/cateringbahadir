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
    query('commodity').optional().trim(),
    query('loadPortId').optional().isNumeric(),
    query('dischargePortId').optional().isNumeric(),
    query('laycanFrom').optional().isISO8601(),
    query('laycanTo').optional().isISO8601(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const skip = (page - 1) * limit;

      const where: any = {};

      if (req.query.commodity) {
        where.commodity = { contains: req.query.commodity, mode: 'insensitive' };
      }

      if (req.query.loadPortId) {
        where.loadPortId = BigInt(req.query.loadPortId as string);
      }

      if (req.query.dischargePortId) {
        where.dischargePortId = BigInt(req.query.dischargePortId as string);
      }

      if (req.query.laycanFrom || req.query.laycanTo) {
        where.laycanStart = {};
        if (req.query.laycanFrom) {
          where.laycanStart.gte = new Date(req.query.laycanFrom as string);
        }
        if (req.query.laycanTo) {
          where.laycanStart.lte = new Date(req.query.laycanTo as string);
        }
      }

      const [cargos, total] = await Promise.all([
        prisma.cargo.findMany({
          where,
          skip,
          take: limit,
          include: {
            loadPort: true,
            dischargePort: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.cargo.count({ where }),
      ]);

      res.json({
        cargos: cargos.map(c => ({
          ...c,
          id: c.id.toString(),
          loadPortId: c.loadPortId?.toString(),
          dischargePortId: c.dischargePortId?.toString(),
          loadPort: c.loadPort ? { ...c.loadPort, id: c.loadPort.id.toString() } : null,
          dischargePort: c.dischargePort ? { ...c.dischargePort, id: c.dischargePort.id.toString() } : null,
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
      const cargo = await prisma.cargo.findUnique({
        where: { id: BigInt(req.params.id) },
        include: {
          loadPort: true,
          dischargePort: true,
          matches: {
            include: {
              vessel: true,
            },
            orderBy: { score: 'desc' },
            take: 10,
          },
        },
      });

      if (!cargo) {
        throw new AppError('Cargo not found', 404);
      }

      res.json({
        ...cargo,
        id: cargo.id.toString(),
        loadPortId: cargo.loadPortId?.toString(),
        dischargePortId: cargo.dischargePortId?.toString(),
        loadPort: cargo.loadPort ? { ...cargo.loadPort, id: cargo.loadPort.id.toString() } : null,
        dischargePort: cargo.dischargePort ? { ...cargo.dischargePort, id: cargo.dischargePort.id.toString() } : null,
        matches: cargo.matches.map(m => ({
          ...m,
          id: m.id.toString(),
          vesselId: m.vesselId.toString(),
          cargoId: m.cargoId.toString(),
          vessel: { ...m.vessel, id: m.vessel.id.toString() },
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
    body('commodity').trim().notEmpty(),
    body('qtyValue').optional().isFloat({ min: 0 }),
    body('qtyUnit').optional().isIn(['ton', 'm3', 'unit']),
    body('loadPortId').optional().isNumeric(),
    body('dischargePortId').optional().isNumeric(),
    body('laycanStart').optional().isISO8601(),
    body('laycanEnd').optional().isISO8601(),
    body('constraints').optional().isObject(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const data: any = {
        ...req.body,
        laycanStart: req.body.laycanStart ? new Date(req.body.laycanStart) : undefined,
        laycanEnd: req.body.laycanEnd ? new Date(req.body.laycanEnd) : undefined,
      };

      if (req.body.loadPortId) {
        data.loadPortId = BigInt(req.body.loadPortId);
      }

      if (req.body.dischargePortId) {
        data.dischargePortId = BigInt(req.body.dischargePortId);
      }

      const cargo = await prisma.cargo.create({
        data,
        include: {
          loadPort: true,
          dischargePort: true,
        },
      });

      await matchingQueue.add('match-cargo', { 
        type: 'match-cargo',
        cargoId: cargo.id.toString() 
      });

      res.status(201).json({
        ...cargo,
        id: cargo.id.toString(),
        loadPortId: cargo.loadPortId?.toString(),
        dischargePortId: cargo.dischargePortId?.toString(),
        loadPort: cargo.loadPort ? { ...cargo.loadPort, id: cargo.loadPort.id.toString() } : null,
        dischargePort: cargo.dischargePort ? { ...cargo.dischargePort, id: cargo.dischargePort.id.toString() } : null,
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
    body('commodity').optional().trim().notEmpty(),
    body('qtyValue').optional().isFloat({ min: 0 }),
    body('qtyUnit').optional().isIn(['ton', 'm3', 'unit']),
    body('loadPortId').optional().isNumeric(),
    body('dischargePortId').optional().isNumeric(),
    body('laycanStart').optional().isISO8601(),
    body('laycanEnd').optional().isISO8601(),
    body('constraints').optional().isObject(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const data: any = {
        ...req.body,
        laycanStart: req.body.laycanStart ? new Date(req.body.laycanStart) : undefined,
        laycanEnd: req.body.laycanEnd ? new Date(req.body.laycanEnd) : undefined,
      };

      if (req.body.loadPortId !== undefined) {
        data.loadPortId = req.body.loadPortId ? BigInt(req.body.loadPortId) : null;
      }

      if (req.body.dischargePortId !== undefined) {
        data.dischargePortId = req.body.dischargePortId ? BigInt(req.body.dischargePortId) : null;
      }

      const cargo = await prisma.cargo.update({
        where: { id: BigInt(req.params.id) },
        data,
        include: {
          loadPort: true,
          dischargePort: true,
        },
      });

      await matchingQueue.add('match-cargo', { 
        type: 'match-cargo',
        cargoId: cargo.id.toString() 
      });

      res.json({
        ...cargo,
        id: cargo.id.toString(),
        loadPortId: cargo.loadPortId?.toString(),
        dischargePortId: cargo.dischargePortId?.toString(),
        loadPort: cargo.loadPort ? { ...cargo.loadPort, id: cargo.loadPort.id.toString() } : null,
        dischargePort: cargo.dischargePort ? { ...cargo.dischargePort, id: cargo.dischargePort.id.toString() } : null,
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
      await prisma.cargo.delete({
        where: { id: BigInt(req.params.id) },
      });

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

export default router;