# Google Docs ↔ Markdown Mirror

**Edit Google Docs in your IDE. Push changes back. Formatting preserved.**

Works with Claude Code via MCP - ask Claude to read/edit your Google Docs directly.

---

## What It Does

| Action | Result |
|--------|--------|
| `sync --all` | Pulls all Google Docs → local `.md` files |
| `push "doc.md"` | Pushes your edits → Google Docs (keeps formatting!) |
| Claude: "Edit my resume" | AI edits via MCP integration |

---

## Quick Setup

### 1. Google Cloud Credentials (one-time)

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → Create project
2. Enable **Google Drive API** and **Google Docs API**
3. Create OAuth credentials (Web application)
4. Add redirect URI: `http://localhost:3000/oauth2callback`
5. Copy your Client ID and Secret

### 2. Install & Configure

```bash
git clone https://github.com/gauravg16/gdocs-md-mirror.git
cd gdocs-md-mirror
npm install && npm run build

# Set credentials
export GOOGLE_CLIENT_ID="your-client-id"
export GOOGLE_CLIENT_SECRET="your-client-secret"

# Initialize (opens browser for Google auth)
node packages/cli/dist/index.js init

# Sync all your Google Docs
node packages/cli/dist/index.js sync --all
```

Your `.md` files appear in `My Drive/gdocs-markdown/`.

---

## Claude Code Integration (MCP)

Add to your `~/.claude.json`:

```json
{
  "projects": {
    "/your/project": {
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

Then ask Claude:
- *"List my Google Docs"*
- *"Sync all documents"*
- *"Push changes to my resume"*

---

## CLI Commands

```bash
# Sync all docs
node packages/cli/dist/index.js sync --all

# Push local changes to Google Docs
node packages/cli/dist/index.js push "path/to/doc.md"

# Check status
node packages/cli/dist/index.js status

# Watch for changes (continuous sync)
node packages/cli/dist/index.js watch
```

**Tip**: Create a shell alias:
```bash
alias gdocs='cd /path/to/gdocs-md-mirror && source .env && node packages/cli/dist/index.js'
```

---

## How Push Preserves Formatting

When you edit a `.md` file and push, only the changed text is updated in Google Docs. Tables, fonts, images, and layout stay intact.

---

## Config

Located at `~/.config/gdocs-md/config.json`:

```json
{
  "rootFolder": "/path/to/Google Drive/My Drive",
  "mirrorMode": "shadow",
  "shadowRoot": "gdocs-markdown"
}
```

- **shadow mode**: All `.md` files in one folder (recommended)
- **sibling mode**: `.md` files next to `.gdoc` files

---

## Troubleshooting

**"redirect_uri_mismatch"** → Add `http://localhost:3000/oauth2callback` to Google Cloud OAuth credentials

**"Not authenticated"** → Run `init` again

---

## License

MIT - [Gaurav Gupta](https://github.com/gauravg16)
