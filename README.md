# Google Docs ↔ Markdown Mirror

> **Seamlessly sync Google Docs with local Markdown files** — Edit in your IDE, push to Google Docs, preserve formatting.

[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## Why This Exists

Google Docs is great for collaboration, but developers often prefer working in their IDE with Markdown. This tool bridges that gap:

- **Write in your IDE** → Changes sync to Google Docs
- **Collaborate in Google Docs** → Changes sync to local `.md` files
- **AI-powered editing** → Claude Code can read/edit your Google Docs via MCP

### Use Cases

- **Technical writers**: Draft in Markdown, share polished Google Docs
- **Developers**: Keep documentation in sync between repo and Google Drive
- **AI workflows**: Let Claude Code access and edit your Google Docs directly
- **Content teams**: Collaborate in Google Docs, version control in Git

---

## Features

| Feature | Description |
|---------|-------------|
| **Bidirectional Sync** | Pull Google Docs → Markdown, push Markdown → Google Docs |
| **Surgical Updates** | Only changed text is updated, preserving Google Docs formatting |
| **Watch Mode** | Auto-sync when files change |
| **Conflict Resolution** | Safe handling of concurrent edits |
| **MCP Server** | AI agent integration (Claude Code, etc.) |
| **SQLite State** | Reliable sync state tracking |
| **OAuth2 Auth** | Secure Google authentication |

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Installation](#installation)
3. [Google Cloud Setup](#google-cloud-setup)
4. [Configuration](#configuration)
5. [CLI Commands](#cli-commands)
6. [Watch Mode](#watch-mode)
7. [MCP Server (AI Integration)](#mcp-server-ai-integration)
8. [How It Works](#how-it-works)
9. [Troubleshooting](#troubleshooting)
10. [Development](#development)

---

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/gauravg16/gdocs-md-mirror.git
cd gdocs-md-mirror
npm install && npm run build

# 2. Set credentials (see Google Cloud Setup below)
export GOOGLE_CLIENT_ID="your-client-id"
export GOOGLE_CLIENT_SECRET="your-client-secret"

# 3. Initialize
node packages/cli/dist/index.js init

# 4. Sync all Google Docs
node packages/cli/dist/index.js sync --all

# 5. Check status
node packages/cli/dist/index.js status
```

---

## Installation

### Prerequisites

- **Node.js 18+** — [Download](https://nodejs.org/)
- **Google Drive for Desktop** — [Download](https://www.google.com/drive/download/) (optional, but recommended)
- **Google Cloud Project** with OAuth credentials (see setup below)

### Install from Source

```bash
# Clone the repository
git clone https://github.com/gauravg16/gdocs-md-mirror.git
cd gdocs-md-mirror

# Install dependencies
npm install

# Build all packages
npm run build

# Verify installation
node packages/cli/dist/index.js doctor
```

### Directory Structure

```
gdocs-md-mirror/
├── packages/
│   ├── core/       # Core library (parser, db, sync engine, Google client)
│   ├── cli/        # Command-line interface
│   └── mcp/        # MCP server for AI agents
├── docs/           # Documentation
└── test/           # Test fixtures
```

---

## Google Cloud Setup

### Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **Select a project** → **New Project**
3. Name it (e.g., "gdocs-md-mirror") and click **Create**

### Step 2: Enable Required APIs

1. Go to [API Library](https://console.cloud.google.com/apis/library)
2. Search and enable:
   - **Google Drive API**
   - **Google Docs API**

### Step 3: Configure OAuth Consent Screen

1. Go to [OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent)
2. Select **External** (or Internal if using Google Workspace)
3. Fill in:
   - **App name**: `gdocs-md-mirror`
   - **User support email**: Your email
   - **Developer contact**: Your email
4. Click **Save and Continue**
5. On **Scopes**, click **Add or Remove Scopes** and add:
   - `https://www.googleapis.com/auth/drive.readonly`
   - `https://www.googleapis.com/auth/drive.file`
   - `https://www.googleapis.com/auth/documents`
6. Click **Save and Continue** → **Back to Dashboard**

### Step 4: Create OAuth Credentials

1. Go to [Credentials](https://console.cloud.google.com/apis/credentials)
2. Click **Create Credentials** → **OAuth client ID**
3. Select **Web application** (not Desktop)
4. Add **Authorized redirect URIs**:
   ```
   http://localhost:3000/oauth2callback
   ```
5. Click **Create**
6. Copy the **Client ID** and **Client Secret**

### Step 5: Set Environment Variables

Create a `.env` file in the project root (add to `.gitignore`):

```bash
# .env
GOOGLE_CLIENT_ID="486081548883-xxxxx.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="GOCSPX-xxxxxxxxxxxxx"
```

Load before running commands:

```bash
source .env && export GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET
```

---

## Configuration

### Initialize Configuration

```bash
node packages/cli/dist/index.js init
```

This interactive wizard will:
1. Ask for your Google Drive folder location
2. Configure mirror mode (sibling or shadow)
3. Start OAuth authentication flow

### Configuration File

Located at `~/.config/gdocs-md/config.json`:

```json
{
  "rootFolder": "/Users/you/Library/CloudStorage/GoogleDrive-you@gmail.com/My Drive",
  "mirrorMode": "shadow",
  "shadowRoot": "gdocs-markdown",
  "pollingIntervalSeconds": 60,
  "pushBackend": "docs_api",
  "ignorePatterns": ["**/node_modules/**", "**/.git/**"],
  "logLevel": "info"
}
```

### Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| `rootFolder` | Path to your Google Drive sync folder | Required |
| `mirrorMode` | `shadow` (dedicated folder) or `sibling` (same folder) | `shadow` |
| `shadowRoot` | Folder name for shadow mode | `gdocs-markdown` |
| `pollingIntervalSeconds` | How often to check for remote changes | `60` |
| `pushBackend` | `docs_api` (direct) or `composio` (via Composio API) | `docs_api` |
| `ignorePatterns` | Glob patterns to skip | `["**/node_modules/**"]` |
| `logLevel` | `debug`, `info`, `warn`, `error` | `info` |

### Mirror Modes Explained

**Shadow Mode** (recommended) — All markdown files in one dedicated folder:

```
My Drive/
├── Project Proposal.gdoc
├── Meeting Notes.gdoc
└── gdocs-markdown/
    ├── Project Proposal.md  ← Created by sync
    └── Meeting Notes.md     ← Created by sync
```

**Sibling Mode** — Markdown files alongside `.gdoc` files (can clutter Drive):

```
My Drive/
├── Project Proposal.gdoc
├── Project Proposal.md      ← Created by sync
├── Meeting Notes.gdoc
└── Meeting Notes.md         ← Created by sync
```

---

## CLI Commands

### Sync Commands

```bash
# Sync all .gdoc files in your Drive
node packages/cli/dist/index.js sync --all

# Sync a specific file
node packages/cli/dist/index.js sync --file "path/to/document.gdoc"

# Preview changes without applying (dry run)
node packages/cli/dist/index.js sync --all --dry-run

# Resolve a conflict
node packages/cli/dist/index.js sync --resolve "path/to/document.md"
```

### Push Command

```bash
# Push local markdown changes back to Google Docs
node packages/cli/dist/index.js push "path/to/document.md"
```

**Important**: The push uses "surgical replacement" — only changed text is updated, preserving your Google Docs formatting (fonts, tables, images, etc.).

### Status Command

```bash
# View sync status for all documents
node packages/cli/dist/index.js status
```

Output:
```
📊 gdocs-md Status

Overview
  Total documents: 4
  Synced: 4
  Conflicts: 0
  Last sync: 1/21/2026, 9:15:00 PM

Configuration
  Root folder: /Users/you/Google Drive/My Drive
  Mirror mode: sibling
  Push backend: docs_api

Recent Activity
  9:15:00 PM push
  9:10:00 PM pull
```

### Other Commands

```bash
# Open document in browser
node packages/cli/dist/index.js open "path/to/document.gdoc"

# Check configuration and connectivity
node packages/cli/dist/index.js doctor

# Show help
node packages/cli/dist/index.js --help
```

---

## Watch Mode

Watch mode automatically syncs when files change:

```bash
# Start watching (runs continuously)
node packages/cli/dist/index.js watch
```

What it does:
- **New `.gdoc` file detected** → Creates corresponding `.md` file
- **Google Doc updated remotely** → Updates local `.md` file
- **Local `.md` file edited** → Queues for push (manual or auto)

### Run in Background

```bash
# Run as background process
nohup node packages/cli/dist/index.js watch > ~/.gdocs-md.log 2>&1 &

# Check logs
tail -f ~/.gdocs-md.log

# Stop the watcher
pkill -f "gdocs-md.*watch"
```

### Shell Alias (Recommended)

Add to your `~/.zshrc` or `~/.bashrc`:

```bash
# Add this line
alias gdocs-md='cd /path/to/gdocs-md-mirror && source .env && export GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET && node packages/cli/dist/index.js'
```

Then use:
```bash
gdocs-md sync --all
gdocs-md watch
gdocs-md status
gdocs-md push "My Doc.md"
```

---

## MCP Server (AI Integration)

The MCP (Model Context Protocol) server allows AI agents like **Claude Code** to interact with your Google Docs.

### Setup for Claude Code

Add to your `~/.claude.json` under your project's `mcpServers`:

```json
{
  "projects": {
    "/your/project/path": {
      "mcpServers": {
        "gdocs-md-mirror": {
          "type": "stdio",
          "command": "node",
          "args": ["/path/to/gdocs-md-mirror/packages/mcp/dist/index.js"],
          "env": {
            "GOOGLE_CLIENT_ID": "your-client-id",
            "GOOGLE_CLIENT_SECRET": "your-client-secret"
          }
        }
      }
    }
  }
}
```

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `mirror_list` | List all tracked Google Docs and their Markdown mirrors |
| `mirror_sync_all` | Sync all Google Docs to their Markdown mirrors |
| `mirror_sync_one` | Sync a specific Google Doc or Markdown file |
| `mirror_status` | Get the current sync status overview |
| `mirror_open_doc` | Get the web URL for a Google Doc |
| `mirror_push_one` | Push local Markdown changes to the corresponding Google Doc |

### Example Usage with Claude Code

After configuring, you can ask Claude:

- *"List my Google Docs mirrors"*
- *"Sync all my documents"*
- *"Push changes to my resume"*
- *"What's the sync status?"*

---

## How It Works

### Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Google Docs    │────▶│  gdocs-md-mirror │────▶│  Local .md      │
│  (Cloud)        │◀────│  (Sync Engine)   │◀────│  (Your IDE)     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
                        ┌──────┴──────┐
                        │   SQLite    │
                        │   State DB  │
                        └─────────────┘
```

### Sync Flow

**Pull (Google Docs → Markdown)**:
1. Read `.gdoc` file (JSON pointer to Google Doc)
2. Fetch document via Google Docs API
3. Export as Markdown
4. Add YAML frontmatter with metadata
5. Write to local `.md` file
6. Update SQLite state

**Push (Markdown → Google Docs)**:
1. Read local `.md` file
2. Fetch current Google Doc content
3. Diff to find changed text only
4. Use `replaceAllText` API (preserves formatting!)
5. Update SQLite state

### Frontmatter Format

Every generated `.md` file includes metadata:

```yaml
---
gdocs_mirror:
  fileId: 1H14shVL39hSFYNaQ91YbiNK-ZvevasLRZFPPs72NnsQ
  webViewLink: https://docs.google.com/document/d/.../edit
  title: My Document
  lastPulledAt: '2026-01-21T15:38:33.905Z'
---

# Document Content

Your content here...
```

### Conflict Resolution

When both local and remote are modified:

1. Remote version saved as `document.remote.<timestamp>.md`
2. Local version preserved as main file
3. Status shows conflict

To resolve:
```bash
# View conflicts
node packages/cli/dist/index.js status

# After manually merging changes:
node packages/cli/dist/index.js sync --resolve "path/to/document.md"
```

---

## Troubleshooting

### "redirect_uri_mismatch" Error

**Cause**: OAuth redirect URI not configured in Google Cloud Console.

**Fix**:
1. Go to [Google Cloud Credentials](https://console.cloud.google.com/apis/credentials)
2. Edit your OAuth client
3. Add this exact URI to **Authorized redirect URIs**:
   ```
   http://localhost:3000/oauth2callback
   ```

### "Not authenticated with Google"

**Fix**: Re-run authentication:
```bash
source .env && export GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET
node packages/cli/dist/index.js init
```

### "gdocs-md not initialized"

**Fix**: Run the init command:
```bash
node packages/cli/dist/index.js init
```

### Push destroys Google Docs formatting

**Cause**: Using old version without surgical replacement.

**Fix**: Update to latest version. The current implementation uses `replaceAllText` API which only changes specific text, preserving all formatting.

### "No text changes detected" when pushing

**Cause**: The diff algorithm didn't find meaningful differences.

**Fix**: This is normal if only whitespace or formatting changed. The tool only pushes actual text content changes.

### Watch mode not detecting changes

**Possible causes**:
1. File system events not propagating (try increasing polling interval)
2. Google Drive for Desktop sync delay
3. File permissions issue

**Fix**: Check logs with `--log-level debug`:
```bash
node packages/cli/dist/index.js watch --log-level debug
```

---

## Development

### Building

```bash
# Build all packages
npm run build

# Build specific package
npm run build --workspace=@gdocs-md/core

# Clean build artifacts
npm run clean
```

### Testing

```bash
# Run all tests
npm run test

# Run with coverage
npm run test -- --coverage
```

### Project Structure

```
packages/
├── core/                 # Core library
│   ├── src/
│   │   ├── db/          # SQLite database operations
│   │   ├── google/      # Google API client & OAuth
│   │   ├── parser/      # .gdoc parser & frontmatter
│   │   ├── sync/        # Sync engine & watcher
│   │   ├── backends/    # Push backends (Docs API, Composio)
│   │   └── utils/       # Logger, retry, hash utilities
│   └── package.json
├── cli/                  # CLI application
│   ├── src/
│   │   └── commands/    # init, sync, watch, status, etc.
│   └── package.json
└── mcp/                  # MCP server
    ├── src/
    │   └── index.ts     # MCP tool implementations
    └── package.json
```

---

## Security

### OAuth Tokens

- Stored at `~/.config/gdocs-md/tokens.json`
- File permissions set to `0600` (owner read/write only)
- Refresh tokens auto-renew access tokens

### Required OAuth Scopes

| Scope | Purpose |
|-------|---------|
| `drive.readonly` | Read `.gdoc` file metadata |
| `drive.file` | Export document content |
| `documents` | Update document content |

### Best Practices

- **Never commit credentials** to version control
- Add `.env` to `.gitignore`
- Use environment variables for secrets
- Review OAuth permissions when authorizing

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

## Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

For major changes, please open an issue first to discuss.

---

## Credits

Built by [Gaurav Gupta](https://github.com/gauravg16)

---

## Support

- **Issues**: [GitHub Issues](https://github.com/gauravg16/gdocs-md-mirror/issues)
- **Discussions**: [GitHub Discussions](https://github.com/gauravg16/gdocs-md-mirror/discussions)
