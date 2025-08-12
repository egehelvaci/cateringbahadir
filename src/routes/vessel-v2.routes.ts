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
    query('availableFrom').optional().isISO8601(),
    query('currentArea').optional().trim(),
    query('minDwt').optional().isFloat({ min: 0 }),
    query('maxDwt').optional().isFloat({ min: 0 }),
    query('gear').optional().trim(),
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
        where.dwt = { ...where.dwt, gte: parseFloat(req.query.minDwt as string) };
      }

      if (req.query.maxDwt) {
        where.dwt = { ...where.dwt, lte: parseFloat(req.query.maxDwt as string) };
      }

      if (req.query.gear) {
        where.gear = { contains: req.query.gear, mode: 'insensitive' };
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
        vessels,
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
      const vessel = await prisma.vessel.findUnique({
        where: { id: parseInt(req.params.id) },
        include: {
          matches: {
            include: { cargo: true },
            orderBy: { score: 'desc' },
            take: 10,
          },
        },
      });

      if (!vessel) {
        return res.status(404).json({ error: 'Vessel not found' });
      }

      res.json(vessel);
    } catch (error) {
      next(error);
    }
  }
);

export default router;