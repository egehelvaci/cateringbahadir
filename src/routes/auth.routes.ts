import { Router } from 'express';
import { body } from 'express-validator';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database';
import { validate } from '../middleware/validation';
import { AppError } from '../middleware/errorHandler';
import { strictRateLimiter } from '../middleware/rateLimiter';

const router = Router();

router.post(
  '/register',
  strictRateLimiter,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('name').optional().trim().notEmpty(),
    body('companyName').trim().notEmpty(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { email, password, name, companyName } = req.body;

      const existingUser = await prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        throw new AppError('User already exists', 400);
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      let company = await prisma.company.findFirst({
        where: { name: companyName },
      });

      if (!company) {
        company = await prisma.company.create({
          data: { name: companyName },
        });
      }

      const user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
          companyId: company.id,
        },
        include: { company: true },
      });

      const token = jwt.sign(
        { userId: user.id.toString() },
        process.env.JWT_SECRET!,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      res.status(201).json({
        token,
        user: {
          id: user.id.toString(),
          email: user.email,
          name: user.name,
          company: user.company.name,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/login',
  strictRateLimiter,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { email, password } = req.body;

      const user = await prisma.user.findUnique({
        where: { email },
        include: { company: true },
      });

      if (!user) {
        throw new AppError('Invalid credentials', 401);
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);

      if (!isPasswordValid) {
        throw new AppError('Invalid credentials', 401);
      }

      const token = jwt.sign(
        { userId: user.id.toString() },
        process.env.JWT_SECRET!,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      res.json({
        token,
        user: {
          id: user.id.toString(),
          email: user.email,
          name: user.name,
          company: user.company.name,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;