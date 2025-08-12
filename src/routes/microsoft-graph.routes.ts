import { Router, Request, Response, NextFunction } from 'express';
import { query, body } from 'express-validator';
import { validate } from '../middleware/validation';
import { authenticate, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { MicrosoftGraphService } from '../services/microsoft-graph.service';
import { strictRateLimiter } from '../middleware/rateLimiter';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

const router = Router();
const microsoftGraph = new MicrosoftGraphService();

// Microsoft OAuth initiation
router.get('/auth/microsoft', 
  authenticate,
  [query('state').optional().isString()],
  validate,
  (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const state = (req.query.state as string) || `user_${req.userId}`;
      const authUrl = microsoftGraph.generateAuthUrl(state);
      
      res.json({
        authUrl,
        message: 'Redirect user to this URL to authorize Microsoft Graph access',
      });
    } catch (error) {
      next(error);
    }
  }
);

// Microsoft OAuth callback handler
router.get('/microsoft/callback',
  [
    query('code').notEmpty().withMessage('Authorization code is required'),
    query('state').optional().isString(),
  ],
  validate,
  async (req: Request, res: Response, _: NextFunction) => {
    try {
      const { code } = req.query;
      
      // Exchange authorization code for tokens
      const tokens = await microsoftGraph.exchangeCodeForTokens(code as string);
      
      // Get user profile
      const userProfile = await microsoftGraph.getUserProfile(tokens.access_token);
      
      // Save to database
      await microsoftGraph.saveMicrosoftAccount(userProfile.email, tokens);
      
      res.json({
        success: true,
        message: 'Microsoft account connected successfully',
        email: userProfile.email,
        name: userProfile.name,
        connectedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      logger.error('Microsoft OAuth callback error:', error);
      
      if (error.message?.includes('invalid_grant')) {
        throw new AppError('Authorization code has expired or is invalid', 400);
      }
      
      if (error.response?.status === 401) {
        throw new AppError('Microsoft OAuth authentication failed', 401);
      }
      
      if (error.response?.status === 403) {
        throw new AppError('Microsoft OAuth access forbidden - check client credentials', 403);
      }
      
      throw new AppError(`Failed to connect Microsoft account: ${error.message}`, 500);
    }
  }
);

// List connected Microsoft accounts
router.get('/microsoft/accounts',
  authenticate,
  async (_: Request, res: Response, next: NextFunction) => {
    try {
      const accounts = await prisma.microsoftAccount.findMany({
        select: {
          email: true,
          scope: true,
          expiryDate: true,
          createdAt: true,
          updatedAt: true
        },
        orderBy: { createdAt: 'desc' }
      });
      
      res.json({
        accounts: accounts.map(account => ({
          email: account.email,
          scope: account.scope,
          connectedAt: account.createdAt,
          lastUpdated: account.updatedAt,
          tokenExpiry: account.expiryDate,
          isExpired: account.expiryDate < new Date()
        })),
        totalCount: accounts.length,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get emails from Microsoft Graph
router.get('/microsoft/emails/:email',
  authenticate,
  strictRateLimiter,
  [
    query('top').optional().isInt({ min: 1, max: 100 }).withMessage('Top must be between 1 and 100'),
    query('skip').optional().isInt({ min: 0 }).withMessage('Skip must be 0 or greater'),
    query('filter').optional().isString().withMessage('Filter must be a string'),
    query('orderby').optional().isString().withMessage('OrderBy must be a string'),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email } = req.params;
      const { top = 50, skip = 0, filter, orderby } = req.query;

      logger.info(`Fetching emails for Microsoft account: ${email}`);

      // Get valid access token
      const accessToken = await microsoftGraph.getValidAccessToken(email);

      // Fetch emails
      const emails = await microsoftGraph.getEmails(accessToken, {
        top: parseInt(top as string),
        skip: parseInt(skip as string),
        filter: filter as string,
        orderby: orderby as string
      });

      res.json({
        success: true,
        email: email,
        totalCount: emails.length,
        emails: emails,
        retrievedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      if (error.message?.includes('No Microsoft account found')) {
        throw new AppError('Microsoft account not found. Please authorize Microsoft Graph access first.', 404);
      }
      
      if (error.message?.includes('expired')) {
        throw new AppError('Microsoft access token expired. Please re-authorize.', 401);
      }

      next(error);
    }
  }
);

// Get specific email details
router.get('/microsoft/emails/:email/:messageId',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, messageId } = req.params;

      logger.info(`Fetching email ${messageId} for Microsoft account: ${email}`);

      // Get valid access token
      const accessToken = await microsoftGraph.getValidAccessToken(email);

      // Fetch email details
      const emailData = await microsoftGraph.getEmailById(accessToken, messageId);

      res.json({
        success: true,
        email: email,
        message: emailData,
        retrievedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      if (error.message?.includes('No Microsoft account found')) {
        throw new AppError('Microsoft account not found. Please authorize Microsoft Graph access first.', 404);
      }
      
      if (error.message?.includes('not found')) {
        throw new AppError('Email message not found', 404);
      }

      next(error);
    }
  }
);

// Revoke Microsoft account access
router.delete('/microsoft/revoke',
  authenticate,
  strictRateLimiter,
  [
    body('email').isEmail().withMessage('Valid Microsoft email address is required'),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email } = req.body;

      // Delete from database
      await prisma.microsoftAccount.delete({
        where: { email }
      });

      res.json({
        success: true,
        message: 'Microsoft account access revoked successfully',
        email: email
      });
    } catch (error: any) {
      if (error.code === 'P2025') {
        throw new AppError('Microsoft account not found', 404);
      }
      next(error);
    }
  }
);

// Get Microsoft account status
router.get('/microsoft/status/:email',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email } = req.params;

      const account = await prisma.microsoftAccount.findUnique({
        where: { email },
        select: {
          email: true,
          scope: true,
          expiryDate: true,
          createdAt: true,
          updatedAt: true
        }
      });

      if (!account) {
        return res.json({
          email: email,
          connected: false,
          message: 'Microsoft account not connected'
        });
      }

      const isExpired = account.expiryDate < new Date();

      res.json({
        email: account.email,
        connected: true,
        scope: account.scope,
        connectedAt: account.createdAt,
        lastUpdated: account.updatedAt,
        tokenExpiry: account.expiryDate,
        isExpired: isExpired,
        status: isExpired ? 'expired' : 'active'
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;