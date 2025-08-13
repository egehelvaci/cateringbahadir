import { Router, Request, Response, NextFunction } from 'express';
import { query } from 'express-validator';
import { validate } from '../middleware/validation';
import { authenticate } from '../middleware/auth';
import { prisma } from '../config/database';

const router = Router();

// Get all cargo records
router.get('/cargo',
  authenticate,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('commodity').optional().isString().withMessage('Commodity must be a string'),
    query('loadPort').optional().isString().withMessage('Load port must be a string'),
    query('dischargePort').optional().isString().withMessage('Discharge port must be a string'),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { 
        page = 1, 
        limit = 50, 
        commodity, 
        loadPort, 
        dischargePort,
        search 
      } = req.query;
      
      const offset = (Number(page) - 1) * Number(limit);
      
      const where: any = {};
      
      // Filter by commodity
      if (commodity) {
        where.commodity = {
          contains: commodity as string,
          mode: 'insensitive'
        };
      }
      
      // Filter by load port
      if (loadPort) {
        where.loadPort = {
          contains: loadPort as string,
          mode: 'insensitive'
        };
      }
      
      // Filter by discharge port
      if (dischargePort) {
        where.dischargePort = {
          contains: dischargePort as string,
          mode: 'insensitive'
        };
      }
      
      // General search across multiple fields
      if (search) {
        where.OR = [
          { commodity: { contains: search as string, mode: 'insensitive' } },
          { loadPort: { contains: search as string, mode: 'insensitive' } },
          { dischargePort: { contains: search as string, mode: 'insensitive' } },
          { notes: { contains: search as string, mode: 'insensitive' } }
        ];
      }
      
      const [cargos, total] = await Promise.all([
        prisma.cargo.findMany({
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
        prisma.cargo.count({ where })
      ]);
      
      res.json({
        success: true,
        data: cargos,
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

// Get specific cargo by ID
router.get('/cargo/:id',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      
      const cargo = await prisma.cargo.findUnique({
        where: { id: Number(id) },
        include: {
          matches: {
            include: {
              vessel: true
            }
          }
        }
      });
      
      if (!cargo) {
        res.status(404).json({
          success: false,
          message: 'Cargo not found'
        });
        return;
      }
      
      res.json({
        success: true,
        data: cargo
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;