#!/usr/bin/env node
// Quick authentication script
import { initOAuth2Client, startOAuthFlow, initLogger } from './packages/core/dist/index.js';

initLogger('info', true);

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables');
  process.exit(1);
}

console.log('Starting Google OAuth flow...');
console.log('A browser window will open. Please authorize the app.\n');

initOAuth2Client(clientId, clientSecret);

try {
  await startOAuthFlow();
  console.log('\n✅ Authentication successful! You can now use gdocs-md.');
} catch (error) {
  console.error('Authentication failed:', error);
  process.exit(1);
}
