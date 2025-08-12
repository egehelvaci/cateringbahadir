import { ConfidentialClientApplication } from '@azure/msal-node';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';
import { logger } from '../utils/logger';
import { prisma } from '../config/database';

interface MicrosoftTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
}

interface EmailMessage {
  id: string;
  subject: string;
  from: {
    name: string;
    address: string;
  };
  receivedDateTime: string;
  bodyPreview: string;
  body?: {
    content: string;
    contentType: string;
  };
  attachments?: any[];
}

export class MicrosoftGraphService {
  private msalApp: ConfidentialClientApplication;
  private scopes = [
    'https://graph.microsoft.com/Mail.Read',
    'https://graph.microsoft.com/User.Read'
  ];

  constructor() {
    this.msalApp = new ConfidentialClientApplication({
      auth: {
        clientId: process.env.MICROSOFT_CLIENT_ID!,
        clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
        authority: `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID || 'common'}`
      }
    });
  }

  /**
   * Generate Microsoft OAuth authorization URL
   */
  generateAuthUrl(state?: string): string {
    const authCodeUrlParameters = {
      scopes: this.scopes,
      redirectUri: process.env.MICROSOFT_REDIRECT_URI!,
      state: state || 'default',
      prompt: 'consent'
    };

    return this.msalApp.getAuthCodeUrl(authCodeUrlParameters);
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForTokens(code: string): Promise<MicrosoftTokens> {
    try {
      logger.info('Exchanging authorization code for Microsoft tokens');

      const tokenRequest = {
        code: code,
        scopes: this.scopes,
        redirectUri: process.env.MICROSOFT_REDIRECT_URI!,
      };

      const response = await this.msalApp.acquireTokenByCode(tokenRequest);

      if (!response || !response.accessToken) {
        throw new Error('No access token received from Microsoft');
      }

      logger.info('Microsoft tokens received successfully');

      return {
        access_token: response.accessToken,
        refresh_token: response.refreshToken,
        expires_in: response.expiresOn ? Math.floor((response.expiresOn.getTime() - Date.now()) / 1000) : 3600,
        scope: response.scopes?.join(' ') || this.scopes.join(' ')
      };
    } catch (error: any) {
      logger.error('Error exchanging code for Microsoft tokens:', {
        message: error.message,
        code: error.code,
        details: error.details
      });
      throw error;
    }
  }

  /**
   * Get user profile from Microsoft Graph
   */
  async getUserProfile(accessToken: string): Promise<{ email: string; name?: string }> {
    try {
      logger.info('Getting user profile from Microsoft Graph');

      const graphClient = Client.init({
        authProvider: (done) => {
          done(null, accessToken);
        }
      });

      const user = await graphClient.api('/me').get();

      logger.info('Microsoft user profile retrieved successfully', {
        email: user.mail || user.userPrincipalName,
        displayName: user.displayName
      });

      return {
        email: user.mail || user.userPrincipalName,
        name: user.displayName
      };
    } catch (error: any) {
      logger.error('Error getting Microsoft user profile:', {
        message: error.message,
        code: error.code
      });
      throw error;
    }
  }

  /**
   * Get user's emails from Microsoft Graph
   */
  async getEmails(accessToken: string, options: {
    top?: number;
    skip?: number;
    filter?: string;
    orderby?: string;
  } = {}): Promise<EmailMessage[]> {
    try {
      const { top = 50, skip = 0, filter, orderby = 'receivedDateTime desc' } = options;

      logger.info('Fetching emails from Microsoft Graph', { top, skip, filter });

      const graphClient = Client.init({
        authProvider: (done) => {
          done(null, accessToken);
        }
      });

      let apiCall = graphClient
        .api('/me/messages')
        .top(top)
        .skip(skip)
        .orderby(orderby)
        .select('id,subject,from,receivedDateTime,bodyPreview,body,hasAttachments');

      if (filter) {
        apiCall = apiCall.filter(filter);
      }

      const response = await apiCall.get();
      const messages = response.value || [];

      logger.info(`Successfully fetched ${messages.length} emails from Microsoft Graph`);

      return messages.map((msg: any) => ({
        id: msg.id,
        subject: msg.subject || 'No Subject',
        from: {
          name: msg.from?.emailAddress?.name || 'Unknown',
          address: msg.from?.emailAddress?.address || 'unknown@unknown.com'
        },
        receivedDateTime: msg.receivedDateTime,
        bodyPreview: msg.bodyPreview || '',
        body: msg.body ? {
          content: msg.body.content,
          contentType: msg.body.contentType
        } : undefined,
        attachments: msg.hasAttachments ? [] : undefined // Will be fetched separately if needed
      }));
    } catch (error: any) {
      logger.error('Error fetching emails from Microsoft Graph:', {
        message: error.message,
        code: error.code
      });
      throw error;
    }
  }

  /**
   * Get specific email by ID
   */
  async getEmailById(accessToken: string, messageId: string): Promise<EmailMessage> {
    try {
      logger.info(`Fetching email ${messageId} from Microsoft Graph`);

      const graphClient = Client.init({
        authProvider: (done) => {
          done(null, accessToken);
        }
      });

      const message = await graphClient
        .api(`/me/messages/${messageId}`)
        .select('id,subject,from,receivedDateTime,bodyPreview,body,hasAttachments')
        .get();

      logger.info('Email details retrieved successfully');

      return {
        id: message.id,
        subject: message.subject || 'No Subject',
        from: {
          name: message.from?.emailAddress?.name || 'Unknown',
          address: message.from?.emailAddress?.address || 'unknown@unknown.com'
        },
        receivedDateTime: message.receivedDateTime,
        bodyPreview: message.bodyPreview || '',
        body: message.body ? {
          content: message.body.content,
          contentType: message.body.contentType
        } : undefined,
        attachments: message.hasAttachments ? [] : undefined
      };
    } catch (error: any) {
      logger.error('Error fetching email details from Microsoft Graph:', {
        message: error.message,
        code: error.code
      });
      throw error;
    }
  }

  /**
   * Save Microsoft account to database
   */
  async saveMicrosoftAccount(email: string, tokens: MicrosoftTokens): Promise<void> {
    try {
      const expiryDate = new Date(Date.now() + (tokens.expires_in * 1000));

      await prisma.microsoftAccount.upsert({
        where: { email },
        update: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          scope: tokens.scope,
          expiryDate: expiryDate,
          updatedAt: new Date(),
        },
        create: {
          email: email,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          scope: tokens.scope,
          expiryDate: expiryDate,
        },
      });

      logger.info(`Microsoft account saved/updated for: ${email}`);
    } catch (error) {
      logger.error('Error saving Microsoft account:', error);
      throw error;
    }
  }

  /**
   * Get valid access token for user
   */
  async getValidAccessToken(email: string): Promise<string> {
    try {
      const account = await prisma.microsoftAccount.findUnique({
        where: { email }
      });

      if (!account) {
        throw new Error(`No Microsoft account found for: ${email}`);
      }

      // Check if token is still valid (with 5 minute buffer)
      const now = new Date();
      const expiryWithBuffer = new Date(account.expiryDate.getTime() - (5 * 60 * 1000));

      if (now < expiryWithBuffer) {
        logger.info('Using existing valid access token');
        return account.accessToken;
      }

      // Token expired, need to refresh
      if (account.refreshToken) {
        logger.info('Refreshing expired access token');
        return await this.refreshAccessToken(email, account.refreshToken);
      }

      throw new Error('Access token expired and no refresh token available');
    } catch (error) {
      logger.error('Error getting valid access token:', error);
      throw error;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  private async refreshAccessToken(email: string, refreshToken: string): Promise<string> {
    try {
      const refreshTokenRequest = {
        refreshToken: refreshToken,
        scopes: this.scopes,
      };

      const response = await this.msalApp.acquireTokenByRefreshToken(refreshTokenRequest);

      if (!response || !response.accessToken) {
        throw new Error('Failed to refresh access token');
      }

      // Update database with new tokens
      const expiryDate = new Date(Date.now() + (3600 * 1000)); // Default 1 hour
      await prisma.microsoftAccount.update({
        where: { email },
        data: {
          accessToken: response.accessToken,
          refreshToken: response.refreshToken || refreshToken,
          expiryDate: expiryDate,
          updatedAt: new Date(),
        },
      });

      logger.info('Access token refreshed successfully');
      return response.accessToken;
    } catch (error) {
      logger.error('Error refreshing access token:', error);
      throw error;
    }
  }
}