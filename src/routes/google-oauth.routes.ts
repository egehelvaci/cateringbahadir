import { Router, Request, Response, NextFunction } from 'express';
import { query, body } from 'express-validator';
import { validate } from '../middleware/validation';
import { authenticate, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { GoogleOAuthService } from '../services/google-oauth.service';
import { GmailService } from '../services/gmail.service';
import { strictRateLimiter } from '../middleware/rateLimiter';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

const router = Router();
const googleOAuth = new GoogleOAuthService();
const gmailService = new GmailService();

// Google OAuth initiation
router.get('/auth/google', 
  authenticate,
  [query('state').optional().isString()],
  validate,
  (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const state = (req.query.state as string) || `user_${req.userId}`;
      const authUrl = googleOAuth.generateAuthUrl(state);
      
      res.json({
        authUrl,
        message: 'Redirect user to this URL to authorize Gmail access',
      });
    } catch (error) {
      next(error);
    }
  }
);

// OAuth callback handler
router.get('/oauth2/callback',
  [
    query('code').notEmpty().withMessage('Authorization code is required'),
    query('state').optional().isString(),
  ],
  validate,
  async (req: Request, res: Response, _: NextFunction) => {
    try {
      const { code } = req.query;
      
      // Exchange authorization code for tokens
      const tokens = await googleOAuth.exchangeCodeForTokens(code as string);
      
      // Get user profile
      const userProfile = await googleOAuth.getUserProfile(tokens.access_token);
      
      // Save to database
      await googleOAuth.saveGoogleAccount(userProfile.email, tokens);
      
      res.json({
        success: true,
        message: 'Gmail account connected successfully',
        email: userProfile.email,
        name: userProfile.name,
        connectedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      logger.error('OAuth callback error:', error);
      
      if (error.message?.includes('invalid_grant')) {
        throw new AppError('Authorization code has expired or is invalid', 400);
      }
      
      throw new AppError('Failed to connect Gmail account', 500);
    }
  }
);

// List connected Gmail accounts
router.get('/gmail/accounts',
  authenticate,
  async (_: Request, res: Response, next: NextFunction) => {
    try {
      const accounts = await googleOAuth.listAuthorizedAccounts();
      
      res.json({
        accounts,
        totalCount: accounts.length,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Pull new messages from Gmail
router.post('/gmail/pull',
  strictRateLimiter,
  authenticate,
  [
    body('email').isEmail().withMessage('Valid Gmail address is required'),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email } = req.body;
      
      // Check if account exists and is authorized
      const account = await prisma.googleAccount.findUnique({
        where: { email },
      });
      
      if (!account) {
        throw new AppError('Gmail account not connected. Please authorize first.', 404);
      }
      
      const result = await gmailService.pullAndSaveNewMessages(email);
      
      res.json({
        success: true,
        email,
        newMessages: result.newMessages,
        totalFetched: result.totalFetched,
        pulledAt: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

// Pull from all connected accounts
router.post('/gmail/pull-all',
  strictRateLimiter,
  authenticate,
  async (_: Request, res: Response, next: NextFunction) => {
    try {
      const accounts = await googleOAuth.listAuthorizedAccounts();
      
      if (accounts.length === 0) {
        throw new AppError('No Gmail accounts connected', 404);
      }
      
      const results = [];
      
      for (const account of accounts) {
        try {
          const result = await gmailService.pullAndSaveNewMessages(account.email);
          results.push({
            email: account.email,
            success: true,
            newMessages: result.newMessages,
            totalFetched: result.totalFetched,
          });
        } catch (accountError) {
          logger.error(`Error pulling from ${account.email}:`, accountError);
          results.push({
            email: account.email,
            success: false,
            error: (accountError as Error).message,
          });
        }
      }
      
      const totalNewMessages = results
        .filter(r => r.success)
        .reduce((sum, r) => sum + (r.newMessages || 0), 0);
      
      res.json({
        success: true,
        results,
        totalNewMessages,
        pulledAt: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

// Revoke Gmail access
router.delete('/gmail/revoke',
  authenticate,
  [
    body('email').isEmail().withMessage('Valid Gmail address is required'),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email } = req.body;
      
      await googleOAuth.revokeAccess(email);
      
      res.json({
        success: true,
        message: `Gmail access revoked for ${email}`,
        revokedAt: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get account status
router.get('/gmail/status/:email',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email } = req.params;
      
      const account = await prisma.googleAccount.findUnique({
        where: { email },
        select: {
          email: true,
          scope: true,
          expiryDate: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      
      if (!account) {
        throw new AppError('Gmail account not found', 404);
      }
      
      const now = Date.now();
      const expiryTime = Number(account.expiryDate);
      
      res.json({
        ...account,
        expiryDate: new Date(expiryTime).toISOString(),
        isExpired: expiryTime <= now,
        expiresInMinutes: Math.floor((expiryTime - now) / (60 * 1000)),
      });
    } catch (error) {
      next(error);
    }
  }
);

// List Gmail messages
router.get('/gmail/messages/:email',
  authenticate,
  [
    query('maxResults').optional().isInt({ min: 1, max: 100 }),
    query('labelIds').optional().isString(),
    query('q').optional().isString(),
    query('includeSpamTrash').optional().isBoolean(),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email } = req.params;
      const { maxResults, labelIds, q, includeSpamTrash } = req.query;
      
      // Check if Gmail account exists
      const account = await prisma.googleAccount.findUnique({
        where: { email },
      });
      
      if (!account) {
        throw new AppError('Gmail account not found. Please authorize Gmail access first.', 404);
      }

      const options: any = {
        maxResults: maxResults ? parseInt(maxResults as string) : 20,
        includeSpamTrash: includeSpamTrash === 'true',
      };

      if (labelIds) {
        options.labelIds = (labelIds as string).split(',');
      }

      if (q) {
        options.q = q as string;
      }

      const messages = await gmailService.fetchMessages(email, options);
      
      res.json({
        success: true,
        email,
        messages,
        count: messages.length,
        fetchedAt: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get specific Gmail message details
router.get('/gmail/messages/:email/:messageId',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, messageId } = req.params;
      
      // Check if Gmail account exists
      const account = await prisma.googleAccount.findUnique({
        where: { email },
      });
      
      if (!account) {
        throw new AppError('Gmail account not found. Please authorize Gmail access first.', 404);
      }

      const messageDetail = await gmailService.getMessageById(email, messageId);
      
      res.json({
        success: true,
        email,
        message: messageDetail,
        fetchedAt: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;