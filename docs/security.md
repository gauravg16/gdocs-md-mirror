# Security Notes

## OAuth Token Storage

### Current Implementation

Tokens are stored in `~/.config/gdocs-md/tokens.json` with file permissions `0600` (read/write for owner only).

```bash
# Verify permissions
ls -la ~/.config/gdocs-md/tokens.json
# Should show: -rw------- (600)
```

### Token Contents

The token file contains:
- `access_token`: Short-lived token for API access (expires in ~1 hour)
- `refresh_token`: Long-lived token for getting new access tokens
- `expiry_date`: Timestamp when access token expires

### Security Considerations

1. **Never share token files** - They provide full access to your Google account within granted scopes
2. **Use environment variables for CI/CD** - Don't commit tokens to version control
3. **Revoke tokens if compromised** - Use `gdocs-md` logout or revoke at [Google Account Security](https://myaccount.google.com/permissions)

### Future Improvements

- macOS Keychain integration
- Windows Credential Manager integration
- Linux Secret Service (libsecret) integration

## OAuth Scopes

The application requests the following scopes:

| Scope | Purpose | Risk Level |
|-------|---------|------------|
| `drive.readonly` | Read .gdoc file metadata | Low |
| `drive.file` | Export document content as Markdown | Medium |
| `documents` | Update document content (push changes) | Medium |

### Scope Minimization

If you only need to **read** documents (no push functionality), you can modify the scopes in `packages/core/src/google/auth.ts` to remove the `documents` scope.

## API Key Security

### Google OAuth

- Store `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in environment variables
- Never commit these to version control
- Consider using a secrets manager for production deployments

### Composio API

- Store `COMPOSIO_API_KEY` in environment variables
- The key has access to your connected Google account via Composio
- Rotate keys periodically

## File System Security

### Local Markdown Files

- Generated `.md` files may contain sensitive document content
- Apply appropriate file permissions to your Drive sync folder
- Be cautious when sharing the sync folder

### Conflict Files

- Conflict backup files (`*.remote.*.md`) are created during conflicts
- These contain document content from Google Docs
- Clean up conflict files after resolution

## Network Security

### API Communication

- All Google API calls use HTTPS
- All Composio API calls use HTTPS
- No sensitive data is transmitted over plain HTTP

### Local Server

- OAuth callback server runs on `localhost:3000` during authentication
- Server is only active during the authentication flow
- Automatically shuts down after receiving the callback

## Best Practices

1. **Regular Token Rotation**
   - Periodically re-authenticate to get fresh tokens
   - Google automatically rotates access tokens

2. **Principle of Least Privilege**
   - Only grant necessary OAuth scopes
   - Use read-only mode if push isn't needed

3. **Audit Access**
   - Review connected apps at [Google Account Security](https://myaccount.google.com/permissions)
   - Remove access if no longer needed

4. **Secure Environment**
   - Use on trusted machines only
   - Keep the system and Node.js updated

## Reporting Security Issues

If you discover a security vulnerability, please report it privately via GitHub security advisories rather than creating a public issue.
