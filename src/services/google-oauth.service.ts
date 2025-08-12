import { google } from 'googleapis';
import crypto from 'crypto';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  scope: string;
  token_type: string;
  expiry_date: number;
}

export class GoogleOAuthService {
  private oauth2Client: any;

  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
  }

  generateAuthUrl(state?: string): string {
    const scopes = [process.env.GOOGLE_SCOPES || 'https://www.googleapis.com/auth/gmail.readonly'];
    
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline', // Refresh token için gerekli
      scope: scopes,
      include_granted_scopes: true,
      state: state || this.generateState(),
      prompt: 'consent', // Her zaman consent screen göster (refresh token için)
    });
  }

  async exchangeCodeForTokens(code: string): Promise<GoogleTokens> {
    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      
      if (!tokens.access_token) {
        throw new Error('No access token received');
      }

      logger.info('OAuth tokens received successfully');
      
      return {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        scope: tokens.scope || process.env.GOOGLE_SCOPES!,
        token_type: tokens.token_type || 'Bearer',
        expiry_date: tokens.expiry_date || Date.now() + (3600 * 1000), // 1 hour default
      };
    } catch (error) {
      logger.error('Error exchanging code for tokens:', error);
      throw error;
    }
  }

  async saveGoogleAccount(email: string, tokens: GoogleTokens): Promise<void> {
    try {
      // Encrypt refresh token for security
      const encryptedRefreshToken = tokens.refresh_token 
        ? this.encryptToken(tokens.refresh_token) 
        : '';

      await prisma.googleAccount.upsert({
        where: { email },
        update: {
          accessToken: tokens.access_token,
          refreshToken: encryptedRefreshToken,
          scope: tokens.scope,
          tokenType: tokens.token_type,
          expiryDate: BigInt(tokens.expiry_date),
          updatedAt: new Date(),
        },
        create: {
          email,
          accessToken: tokens.access_token,
          refreshToken: encryptedRefreshToken,
          scope: tokens.scope,
          tokenType: tokens.token_type,
          expiryDate: BigInt(tokens.expiry_date),
        },
      });

      logger.info(`Google account saved/updated for: ${email}`);
    } catch (error) {
      logger.error('Error saving Google account:', error);
      throw error;
    }
  }

  async getValidAccessToken(email: string): Promise<string> {
    try {
      const account = await prisma.googleAccount.findUnique({
        where: { email },
      });

      if (!account) {
        throw new Error(`No Google account found for: ${email}`);
      }

      const now = Date.now();
      const expiryTime = Number(account.expiryDate);

      // Token geçerliyse direkt döndür
      if (expiryTime > now + (5 * 60 * 1000)) { // 5 dakika buffer
        return account.accessToken;
      }

      // Token yenilemesi gerekli
      if (!account.refreshToken) {
        throw new Error('No refresh token available for token renewal');
      }

      const decryptedRefreshToken = this.decryptToken(account.refreshToken);
      const newTokens = await this.refreshAccessToken(decryptedRefreshToken);

      // Yeni tokenları kaydet
      await this.saveGoogleAccount(email, {
        ...newTokens,
        refresh_token: decryptedRefreshToken, // Aynı refresh token'ı koru
      });

      return newTokens.access_token;
    } catch (error) {
      logger.error(`Error getting valid access token for ${email}:`, error);
      throw error;
    }
  }

  async refreshAccessToken(refreshToken: string): Promise<GoogleTokens> {
    try {
      this.oauth2Client.setCredentials({ refresh_token: refreshToken });
      
      const { credentials } = await this.oauth2Client.refreshAccessToken();
      
      return {
        access_token: credentials.access_token!,
        refresh_token: credentials.refresh_token || refreshToken, // Bazen yeni refresh token gelmez
        scope: credentials.scope || process.env.GOOGLE_SCOPES!,
        token_type: credentials.token_type || 'Bearer',
        expiry_date: credentials.expiry_date || Date.now() + (3600 * 1000),
      };
    } catch (error) {
      logger.error('Error refreshing access token:', error);
      throw error;
    }
  }

  async getUserProfile(accessToken: string): Promise<{ email: string; name?: string }> {
    try {
      this.oauth2Client.setCredentials({ access_token: accessToken });
      
      const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
      const { data } = await oauth2.userinfo.get();

      return {
        email: data.email!,
        name: data.name || undefined,
      };
    } catch (error) {
      logger.error('Error getting user profile:', error);
      throw error;
    }
  }

  async revokeAccess(email: string): Promise<void> {
    try {
      const account = await prisma.googleAccount.findUnique({
        where: { email },
      });

      if (account) {
        // Google'dan token'ı iptal et
        try {
          await this.oauth2Client.revokeToken(account.accessToken);
        } catch (revokeError) {
          logger.warn('Failed to revoke token from Google:', revokeError);
        }

        // DB'den hesabı sil
        await prisma.googleAccount.delete({
          where: { email },
        });

        logger.info(`Google account access revoked for: ${email}`);
      }
    } catch (error) {
      logger.error(`Error revoking access for ${email}:`, error);
      throw error;
    }
  }

  async listAuthorizedAccounts(): Promise<Array<{ email: string; connected: Date }>> {
    try {
      const accounts = await prisma.googleAccount.findMany({
        select: {
          email: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      return accounts.map(account => ({
        email: account.email,
        connected: account.createdAt,
      }));
    } catch (error) {
      logger.error('Error listing authorized accounts:', error);
      return [];
    }
  }

  private generateState(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private encryptToken(token: string): string {
    const algorithm = 'aes-256-gcm';
    const secretKey = crypto.scryptSync(process.env.JWT_SECRET!, 'salt', 32);
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipher(algorithm, secretKey);
    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return `${iv.toString('hex')}:${encrypted}`;
  }

  private decryptToken(encryptedToken: string): string {
    const algorithm = 'aes-256-gcm';
    const secretKey = crypto.scryptSync(process.env.JWT_SECRET!, 'salt', 32);
    
    const [ivHex, encrypted] = encryptedToken.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    
    const decipher = crypto.createDecipher(algorithm, secretKey);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
}