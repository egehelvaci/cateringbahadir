import { Router, Request, Response, NextFunction } from 'express';
import { query } from 'express-validator';
import { validate } from '../middleware/validation';
import { authenticate } from '../middleware/auth';
import { prisma } from '../config/database';

const router = Router();

// Get all vessel records
router.get('/vessels',
  authenticate,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('name').optional().isString().withMessage('Name must be a string'),
    query('currentArea').optional().isString().withMessage('Current area must be a string'),
    query('minDwt').optional().isFloat({ min: 0 }).withMessage('Min DWT must be a positive number'),
    query('maxDwt').optional().isFloat({ min: 0 }).withMessage('Max DWT must be a positive number'),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { 
        page = 1, 
        limit = 50, 
        name, 
        currentArea, 
        minDwt, 
        maxDwt,
        search 
      } = req.query;
      
      const offset = (Number(page) - 1) * Number(limit);
      
      const where: any = {};
      
      // Filter by vessel name
      if (name) {
        where.name = {
          contains: name as string,
          mode: 'insensitive'
        };
      }
      
      // Filter by current area
      if (currentArea) {
        where.currentArea = {
          contains: currentArea as string,
          mode: 'insensitive'
        };
      }
      
      // Filter by DWT range
      if (minDwt || maxDwt) {
        where.dwt = {};
        if (minDwt) where.dwt.gte = Number(minDwt);
        if (maxDwt) where.dwt.lte = Number(maxDwt);
      }
      
      // General search across multiple fields
      if (search) {
        where.OR = [
          { name: { contains: search as string, mode: 'insensitive' } },
          { imo: { contains: search as string, mode: 'insensitive' } },
          { currentArea: { contains: search as string, mode: 'insensitive' } },
          { notes: { contains: search as string, mode: 'insensitive' } }
        ];
      }
      
      const [vessels, total] = await Promise.all([
        prisma.vessel.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: Number(limit),
          skip: offset,
          include: {
            _count: {
              select: {
                matches: true
              }
            }
          }
        }),
        prisma.vessel.count({ where })
      ]);
      
      res.json({
        success: true,
        data: vessels,
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

// Get specific vessel by ID
router.get('/vessels/:id',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      
      const vessel = await prisma.vessel.findUnique({
        where: { id: Number(id) },
        include: {
          matches: {
            include: {
              cargo: true
            }
          }
        }
      });
      
      if (!vessel) {
        return res.status(404).json({
          success: false,
          message: 'Vessel not found'
        });
      }
      
      res.json({
        success: true,
        data: vessel
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;