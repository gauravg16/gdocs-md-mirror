import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { Config } from '../types.js';
import { getLogger } from './logger.js';

const CONFIG_DIR = path.join(os.homedir(), '.config', 'gdocs-md');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const TOKENS_FILE = path.join(CONFIG_DIR, 'tokens.json');

const DEFAULT_CONFIG: Config = {
  rootFolder: '',
  mirrorMode: 'sibling',
  shadowRoot: '.gdocs_md',
  pollingIntervalSeconds: 60,
  pushBackend: 'composio',
  ignorePatterns: ['**/node_modules/**', '**/.git/**', '**/.gdocs_md/**'],
  logLevel: 'info',
};

/**
 * Ensure config directory exists with proper permissions
 */
export function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

/**
 * Load configuration from file
 */
export function loadConfig(): Config {
  ensureConfigDir();

  if (!fs.existsSync(CONFIG_FILE)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const loaded = JSON.parse(content) as Partial<Config>;
    return { ...DEFAULT_CONFIG, ...loaded };
  } catch (error) {
    getLogger().warn({ error }, 'Failed to load config, using defaults');
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Save configuration to file
 */
export function saveConfig(config: Partial<Config>): void {
  ensureConfigDir();

  const current = loadConfig();
  const merged = { ...current, ...config };

  fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), {
    mode: 0o600,
  });
}

/**
 * Get config file path
 */
export function getConfigPath(): string {
  return CONFIG_FILE;
}

/**
 * Get config directory path
 */
export function getConfigDir(): string {
  return CONFIG_DIR;
}

/**
 * OAuth token storage
 */
export interface TokenData {
  access_token: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  expiry_date?: number;
}

/**
 * Load OAuth tokens
 */
export function loadTokens(): TokenData | null {
  if (!fs.existsSync(TOKENS_FILE)) {
    return null;
  }

  try {
    const content = fs.readFileSync(TOKENS_FILE, 'utf-8');
    return JSON.parse(content) as TokenData;
  } catch (error) {
    getLogger().warn({ error }, 'Failed to load tokens');
    return null;
  }
}

/**
 * Save OAuth tokens with secure permissions
 */
export function saveTokens(tokens: TokenData): void {
  ensureConfigDir();
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2), {
    mode: 0o600,
  });
}

/**
 * Delete tokens (for logout)
 */
export function deleteTokens(): void {
  if (fs.existsSync(TOKENS_FILE)) {
    fs.unlinkSync(TOKENS_FILE);
  }
}

/**
 * Get tokens file path
 */
export function getTokensPath(): string {
  return TOKENS_FILE;
}

/**
 * Database path
 */
export function getDatabasePath(): string {
  ensureConfigDir();
  return path.join(CONFIG_DIR, 'gdocs-md.db');
}
