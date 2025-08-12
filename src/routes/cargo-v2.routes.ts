import { Router } from 'express';
import { query } from 'express-validator';
import { prisma } from '../config/database';
import { validate } from '../middleware/validation';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get(
  '/',
  authenticate,
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('commodity').optional().trim(),
    query('loadPort').optional().trim(),
    query('dischargePort').optional().trim(),
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

      if (req.query.loadPort) {
        where.loadPort = { contains: req.query.loadPort, mode: 'insensitive' };
      }

      if (req.query.dischargePort) {
        where.dischargePort = { contains: req.query.dischargePort, mode: 'insensitive' };
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
          orderBy: { createdAt: 'desc' },
        }),
        prisma.cargo.count({ where }),
      ]);

      res.json({
        cargos,
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
  async (req, res, next) => {
    try {
      const cargo = await prisma.cargo.findUnique({
        where: { id: parseInt(req.params.id) },
        include: {
          matches: {
            include: { vessel: true },
            orderBy: { score: 'desc' },
            take: 10,
          },
        },
      });

      if (!cargo) {
        return res.status(404).json({ error: 'Cargo not found' });
      }

      res.json(cargo);
    } catch (error) {
      next(error);
    }
  }
);

export default router;