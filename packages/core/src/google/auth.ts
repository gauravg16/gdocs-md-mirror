import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import * as http from 'http';
import * as url from 'url';
import { exec } from 'child_process';
import { loadTokens, saveTokens, type TokenData, getLogger } from '../utils/index.js';

// Required OAuth scopes
export const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly', // Read .gdoc metadata
  'https://www.googleapis.com/auth/drive.file', // Export content
  'https://www.googleapis.com/auth/documents', // Update documents (for Docs API backend)
];

let oauth2Client: OAuth2Client | null = null;

/**
 * Get OAuth credentials from environment variables
 */
export function getOAuthCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return null;
  }

  return { clientId, clientSecret };
}

/**
 * Initialize OAuth2 client
 */
export function initOAuth2Client(
  clientId?: string,
  clientSecret?: string,
  redirectUri: string = 'http://localhost:3000/oauth2callback'
): OAuth2Client {
  const creds = clientId && clientSecret ? { clientId, clientSecret } : getOAuthCredentials();

  if (!creds) {
    throw new Error(
      'Google OAuth credentials not found. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables, or run "gdocs-md init" to configure.'
    );
  }

  oauth2Client = new OAuth2Client(creds.clientId, creds.clientSecret, redirectUri);

  // Try to load existing tokens
  const tokens = loadTokens();
  if (tokens) {
    oauth2Client.setCredentials(tokens);
  }

  return oauth2Client;
}

/**
 * Get the OAuth2 client (initialize if needed)
 */
export function getOAuth2Client(): OAuth2Client {
  if (!oauth2Client) {
    return initOAuth2Client();
  }
  return oauth2Client;
}

/**
 * Check if we have valid tokens
 */
export async function hasValidTokens(): Promise<boolean> {
  try {
    const client = getOAuth2Client();
    const tokens = client.credentials;

    if (!tokens.access_token) {
      return false;
    }

    // Check if token is expired
    if (tokens.expiry_date && tokens.expiry_date < Date.now()) {
      // Try to refresh
      if (tokens.refresh_token) {
        await client.refreshAccessToken();
        saveTokens(client.credentials as TokenData);
        return true;
      }
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Generate authorization URL
 */
export function getAuthUrl(): string {
  const client = getOAuth2Client();
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Force consent screen to get refresh token
  });
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(code: string): Promise<TokenData> {
  const client = getOAuth2Client();
  const { tokens } = await client.getToken(code);

  client.setCredentials(tokens);
  saveTokens(tokens as TokenData);

  return tokens as TokenData;
}

/**
 * Start a local OAuth flow with a callback server
 */
export async function startOAuthFlow(): Promise<TokenData> {
  const logger = getLogger();

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        if (!req.url) {
          res.writeHead(400);
          res.end('Bad request');
          return;
        }

        const parsedUrl = url.parse(req.url, true);

        if (parsedUrl.pathname === '/oauth2callback') {
          const code = parsedUrl.query.code as string;

          if (!code) {
            res.writeHead(400);
            res.end('No authorization code provided');
            return;
          }

          try {
            const tokens = await exchangeCodeForTokens(code);

            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <!DOCTYPE html>
              <html>
              <head><title>Authorization Successful</title></head>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h1>✅ Authorization Successful!</h1>
                <p>You can close this window and return to the terminal.</p>
              </body>
              </html>
            `);

            server.close();
            resolve(tokens);
          } catch (error) {
            logger.error({ error }, 'Failed to exchange code for tokens');
            res.writeHead(500);
            res.end('Failed to authenticate');
            server.close();
            reject(error);
          }
        }
      } catch (error) {
        logger.error({ error }, 'OAuth callback error');
        res.writeHead(500);
        res.end('Internal server error');
        server.close();
        reject(error);
      }
    });

    server.listen(3000, () => {
      const authUrl = getAuthUrl();
      logger.info('OAuth server started on http://localhost:3000');
      logger.info(`Opening browser for authorization: ${authUrl}`);

      // Try to open browser (macOS)
      exec(`open "${authUrl}"`, (error) => {
        if (error) {
          logger.info('Could not open browser automatically. Please visit:');
          logger.info(authUrl);
        }
      });
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('OAuth flow timed out'));
    }, 5 * 60 * 1000);
  });
}

/**
 * Get Google Drive API client
 */
export function getDriveClient() {
  const auth = getOAuth2Client();
  return google.drive({ version: 'v3', auth });
}

/**
 * Get Google Docs API client
 */
export function getDocsClient() {
  const auth = getOAuth2Client();
  return google.docs({ version: 'v1', auth });
}

/**
 * Revoke tokens and clear stored credentials
 */
export async function revokeTokens(): Promise<void> {
  const client = getOAuth2Client();

  if (client.credentials.access_token) {
    try {
      await client.revokeToken(client.credentials.access_token);
    } catch {
      // Token might already be invalid
    }
  }

  client.setCredentials({});

  const { deleteTokens } = await import('../utils/config.js');
  deleteTokens();
}
