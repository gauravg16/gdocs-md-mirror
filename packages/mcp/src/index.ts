#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import {
  loadConfig,
  initLogger,
  initDatabaseAsync,
  createSyncEngine,
  initOAuth2Client,
  hasValidTokens,
  documentOps,
  type Document,
} from '@gdocs-md/core';

// Initialize core components
const config = loadConfig();
initLogger(config.logLevel || 'info', false);

let dbInitialized = false;
let syncEngine: ReturnType<typeof createSyncEngine> | null = null;

async function ensureInitialized(): Promise<void> {
  if (!config.rootFolder) {
    throw new Error('gdocs-md not initialized. Run "gdocs-md init" first.');
  }

  if (!dbInitialized) {
    await initDatabaseAsync();
    dbInitialized = true;
  }

  if (!syncEngine) {
    try {
      initOAuth2Client();
      if (!(await hasValidTokens())) {
        throw new Error('Not authenticated with Google. Run "gdocs-md init" to authenticate.');
      }
      syncEngine = createSyncEngine(config);
    } catch (error) {
      throw new Error(`Failed to initialize: ${error}`);
    }
  }
}

// Define MCP tools
const tools: Tool[] = [
  {
    name: 'mirror_list',
    description: 'List all tracked Google Docs and their Markdown mirrors',
    inputSchema: {
      type: 'object',
      properties: {
        filter: {
          type: 'string',
          description: 'Filter by: "all", "conflicts", "synced"',
          enum: ['all', 'conflicts', 'synced'],
        },
      },
    },
  },
  {
    name: 'mirror_sync_all',
    description: 'Sync all Google Docs to their Markdown mirrors',
    inputSchema: {
      type: 'object',
      properties: {
        dryRun: {
          type: 'boolean',
          description: 'Preview changes without making them',
        },
      },
    },
  },
  {
    name: 'mirror_sync_one',
    description: 'Sync a specific Google Doc or Markdown file',
    inputSchema: {
      type: 'object',
      properties: {
        pathOrFileId: {
          type: 'string',
          description: 'Path to .gdoc or .md file, or Google Doc file ID',
        },
      },
      required: ['pathOrFileId'],
    },
  },
  {
    name: 'mirror_status',
    description: 'Get the current sync status overview',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'mirror_open_doc',
    description: 'Get the web URL for a Google Doc',
    inputSchema: {
      type: 'object',
      properties: {
        pathOrFileId: {
          type: 'string',
          description: 'Path to .gdoc or .md file, or Google Doc file ID',
        },
      },
      required: ['pathOrFileId'],
    },
  },
  {
    name: 'mirror_push_one',
    description: 'Push local Markdown changes to the corresponding Google Doc',
    inputSchema: {
      type: 'object',
      properties: {
        mdPath: {
          type: 'string',
          description: 'Path to the .md file to push',
        },
      },
      required: ['mdPath'],
    },
  },
];

// Create MCP server
const server = new Server(
  {
    name: 'gdocs-md-mirror',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle list tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    await ensureInitialized();

    switch (name) {
      case 'mirror_list': {
        const filter = (args?.filter as string) || 'all';
        let documents: Document[];

        if (filter === 'conflicts') {
          documents = documentOps.getConflicts();
        } else if (filter === 'synced') {
          documents = documentOps.getAll().filter((d) => d.lastSyncTime);
        } else {
          documents = documentOps.getAll();
        }

        const result = documents.map((doc) => ({
          fileId: doc.fileId,
          title: doc.title,
          gdocPath: doc.gdocPath,
          mdPath: doc.mdPath,
          hasConflict: doc.hasConflict,
          lastSyncTime: doc.lastSyncTime,
          lastSyncDirection: doc.lastSyncDirection,
          webViewLink: doc.webViewLink,
        }));

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ documents: result, count: result.length }, null, 2),
            },
          ],
        };
      }

      case 'mirror_sync_all': {
        const dryRun = (args?.dryRun as boolean) || false;
        const engine = createSyncEngine(config, dryRun);
        const status = await engine.syncAll();

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  synced: status.synced,
                  conflicts: status.conflicts,
                  errors: status.errors,
                  total: status.total,
                  dryRun,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'mirror_sync_one': {
        const pathOrFileId = args?.pathOrFileId as string;
        if (!pathOrFileId) {
          throw new Error('pathOrFileId is required');
        }

        const result = await syncEngine!.syncOne(pathOrFileId);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: result.success,
                  action: result.action,
                  document: result.document
                    ? {
                        fileId: result.document.fileId,
                        title: result.document.title,
                        mdPath: result.document.mdPath,
                      }
                    : null,
                  error: result.error,
                  conflictPath: result.conflictPath,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'mirror_status': {
        const status = syncEngine!.getStatus();

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  total: status.total,
                  synced: status.synced,
                  conflicts: status.conflicts,
                  lastSyncTime: status.lastSyncTime,
                  rootFolder: config.rootFolder,
                  mirrorMode: config.mirrorMode,
                  pushBackend: config.pushBackend,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'mirror_open_doc': {
        const pathOrFileId = args?.pathOrFileId as string;
        if (!pathOrFileId) {
          throw new Error('pathOrFileId is required');
        }

        const url = syncEngine!.getDocumentUrl(pathOrFileId);

        if (!url) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: 'Document not found', url: null }, null, 2),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ url }, null, 2),
            },
          ],
        };
      }

      case 'mirror_push_one': {
        const mdPath = args?.mdPath as string;
        if (!mdPath) {
          throw new Error('mdPath is required');
        }

        const result = await syncEngine!.pushDocument(mdPath);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: result.success,
                  action: result.action,
                  document: result.document
                    ? {
                        fileId: result.document.fileId,
                        title: result.document.title,
                        webViewLink: result.document.webViewLink,
                      }
                    : null,
                  error: result.error,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: String(error) }, null, 2),
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('gdocs-md MCP server started');
}

main().catch((error) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
