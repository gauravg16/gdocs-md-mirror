# Google Docs ↔ Markdown Mirror

A bidirectional sync solution that mirrors Google Docs as local Markdown files. Works with Google Drive for Desktop to enable viewing and editing Google Docs as `.md` files.

## Features

- 🔄 **Bidirectional Sync**: Pull Google Docs as Markdown, push local edits back
- 👀 **Watch Mode**: Automatic sync on file changes
- 🔀 **Conflict Handling**: Safe handling of concurrent edits with conflict resolution
- 📦 **MCP Server**: Integration with Claude Code and other AI agents
- 🗄️ **SQLite State**: Reliable tracking of sync state
- 🔐 **OAuth2 Auth**: Secure Google authentication

## Quick Start

### Prerequisites

- Node.js 18+
- Google Drive for Desktop installed and syncing
- Google Cloud project with OAuth credentials

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd gdocs-md-mirror

# Install dependencies
npm install

# Build all packages
npm run build
```

### Setup

1. **Create Google OAuth Credentials**

   - Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   - Create a new OAuth 2.0 Client ID (Desktop application)
   - Enable the Google Drive API and Google Docs API
   - Download the credentials

2. **Set Environment Variables**

   ```bash
   export GOOGLE_CLIENT_ID="your-client-id"
   export GOOGLE_CLIENT_SECRET="your-client-secret"

   # Optional: For Composio push backend (recommended)
   export COMPOSIO_API_KEY="your-composio-api-key"
   ```

3. **Initialize gdocs-md**

   ```bash
   npm run gdocs-md init
   ```

   This will:
   - Ask for your Google Drive sync folder location
   - Configure mirror mode (sibling or shadow)
   - Set up OAuth authentication

4. **Verify Setup**

   ```bash
   npm run gdocs-md doctor
   ```

## Usage

### CLI Commands

```bash
# Sync all documents
npm run gdocs-md sync --all

# Sync a specific file
npm run gdocs-md sync --file "path/to/document.gdoc"

# Start watch mode (auto-sync on changes)
npm run gdocs-md watch

# View sync status
npm run gdocs-md status

# Open a document in browser
npm run gdocs-md open "path/to/document.gdoc"

# Push local markdown changes
npm run gdocs-md push "path/to/document.md"

# Check configuration
npm run gdocs-md doctor
```

### Mirror Modes

**Sibling Mode (default)**
```
Documents/
├── MyDoc.gdoc
├── MyDoc.md          ← Created by gdocs-md
├── Report.gdoc
└── Report.md         ← Created by gdocs-md
```

**Shadow Mode**
```
Documents/
├── MyDoc.gdoc
├── Report.gdoc
└── .gdocs_md/
    ├── MyDoc.md      ← Created by gdocs-md
    └── Report.md     ← Created by gdocs-md
```

### Markdown Frontmatter

Generated `.md` files include YAML frontmatter with metadata:

```markdown
---
gdocs_mirror:
  fileId: "1ABC123xyz"
  webViewLink: "https://docs.google.com/document/d/1ABC123xyz/edit"
  lastPulledAt: "2024-01-15T10:30:00Z"
  title: "My Document"
---

# Document Content

Your document content here...
```

### Conflict Resolution

When both local and remote are modified:

1. The remote version is saved as `document.remote.<timestamp>.md`
2. Your local version is preserved as the main file
3. Status shows the conflict

To resolve:
```bash
# View conflicts
npm run gdocs-md status

# After manually merging, resolve the conflict
npm run gdocs-md sync --resolve "path/to/document.md"
```

## MCP Server

The MCP server enables AI agents (like Claude Code) to interact with your Google Docs mirror.

### Configuration

Add to your Claude Code MCP config (`.claude/mcp.json`):

```json
{
  "mcpServers": {
    "gdocs-md": {
      "command": "node",
      "args": ["/path/to/gdocs-md-mirror/packages/mcp/dist/index.js"],
      "env": {
        "GOOGLE_CLIENT_ID": "your-client-id",
        "GOOGLE_CLIENT_SECRET": "your-client-secret"
      }
    }
  }
}
```

### Available Tools

| Tool | Description |
|------|-------------|
| `mirror_list` | List all tracked documents |
| `mirror_sync_all` | Sync all documents |
| `mirror_sync_one` | Sync a specific document |
| `mirror_status` | Get sync status overview |
| `mirror_open_doc` | Get web URL for a document |
| `mirror_push_one` | Push local changes to Google Doc |

## Configuration

Configuration is stored at `~/.config/gdocs-md/config.json`:

```json
{
  "rootFolder": "/Users/me/Google Drive/My Drive",
  "mirrorMode": "sibling",
  "shadowRoot": ".gdocs_md",
  "pollingIntervalSeconds": 60,
  "pushBackend": "composio",
  "ignorePatterns": ["**/node_modules/**", "**/.git/**"],
  "logLevel": "info"
}
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `rootFolder` | Path to Google Drive sync folder | - |
| `mirrorMode` | `sibling` or `shadow` | `sibling` |
| `shadowRoot` | Shadow folder name (if shadow mode) | `.gdocs_md` |
| `pollingIntervalSeconds` | Remote change poll interval | `60` |
| `pushBackend` | `composio` or `docs_api` | `composio` |
| `ignorePatterns` | Glob patterns to ignore | `[...]` |
| `logLevel` | `debug`, `info`, `warn`, `error` | `info` |

## Push Backends

### Composio (Recommended)

Uses Composio API for reliable Markdown-to-Google Docs conversion with full formatting support.

Requirements:
- Sign up at [composio.dev](https://composio.dev)
- Set `COMPOSIO_API_KEY` environment variable

### Google Docs API (Fallback)

Direct Google Docs API calls with basic Markdown support:

**Supported:**
- Headings (H1-H6)
- Paragraphs
- Bold and italic
- Bullet and numbered lists
- Links

**Not Supported:**
- Code blocks (converted to plain text)
- Tables
- Images

## Security

### OAuth Tokens

- Tokens are stored at `~/.config/gdocs-md/tokens.json` with 0600 permissions
- On macOS, you can optionally store in Keychain (future enhancement)

### Required Scopes

- `https://www.googleapis.com/auth/drive.readonly` - Read .gdoc metadata
- `https://www.googleapis.com/auth/drive.file` - Export content
- `https://www.googleapis.com/auth/documents` - Update documents

### Best Practices

- Never commit OAuth credentials to version control
- Use environment variables for secrets
- Review permissions before authorizing

## Troubleshooting

### "gdocs-md not initialized"

Run `npm run gdocs-md init` to set up configuration.

### "Not authenticated with Google"

Run `npm run gdocs-md init` to re-authenticate. Make sure `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set.

### ".gdoc file not parsed correctly"

The tool supports standard `.gdoc` format from Google Drive for Desktop. Check that:
- The file is a valid JSON file
- It contains a `url` field with a docs.google.com URL

### "Sync conflicts"

Use `npm run gdocs-md status` to see conflicts, then:
1. Review the `.remote.<timestamp>.md` file
2. Merge changes into your main `.md` file
3. Run `npm run gdocs-md sync --resolve "path/to/file.md"`

### Watch mode not detecting changes

- Ensure the polling interval is reasonable (default 60s)
- Check file permissions on the Drive folder
- On some systems, inotify limits may need adjustment

## Development

### Project Structure

```
packages/
├── core/        # Core library (parser, db, sync engine)
├── cli/         # Command-line interface
└── mcp/         # MCP server for AI agents

docs/
└── design.md    # Architecture documentation

test/
└── fixtures/    # Test fixtures
```

### Building

```bash
npm run build     # Build all packages
npm run clean     # Clean build artifacts
```

### Testing

```bash
npm run test      # Run all tests
```

## License

MIT

## Contributing

Contributions are welcome! Please read the design document in `docs/design.md` before making changes.
