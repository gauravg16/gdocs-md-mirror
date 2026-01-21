# Troubleshooting Guide

## Common Issues

### "gdocs-md not initialized"

**Cause**: Configuration file doesn't exist or root folder not set.

**Solution**:
```bash
npm run gdocs-md init
```

### "Not authenticated with Google"

**Cause**: OAuth tokens are missing, expired, or invalid.

**Solutions**:
1. Check if environment variables are set:
   ```bash
   echo $GOOGLE_CLIENT_ID
   echo $GOOGLE_CLIENT_SECRET
   ```

2. Re-authenticate:
   ```bash
   npm run gdocs-md init
   ```

3. Check token file:
   ```bash
   ls -la ~/.config/gdocs-md/tokens.json
   ```

### ".gdoc file not parsed correctly"

**Cause**: The .gdoc file format is unexpected.

**Check the file format**:
```bash
cat "path/to/file.gdoc"
```

Expected format:
```json
{"url": "https://docs.google.com/document/d/<FILE_ID>/edit"}
```

**Solutions**:
- Ensure Google Drive for Desktop is properly syncing
- Try re-syncing the folder in Google Drive for Desktop
- Check if the file is a valid Google Doc (not a shortcut to a shortcut)

### "Failed to export document as markdown"

**Causes**:
- Document doesn't exist in Google Drive
- Insufficient permissions
- Network issues

**Solutions**:
1. Check document access in browser
2. Verify OAuth scopes include `drive.file`
3. Run `gdocs-md doctor` to check connectivity

### Watch Mode Not Detecting Changes

**Cause**: File system events not being detected.

**Solutions**:

1. **Check inotify limits (Linux)**:
   ```bash
   cat /proc/sys/fs/inotify/max_user_watches
   # Increase if needed:
   echo 524288 | sudo tee /proc/sys/fs/inotify/max_user_watches
   ```

2. **Network drive issues**:
   - Google Drive for Desktop uses virtual file system
   - Some events may be delayed
   - Increase polling interval in config

3. **Permission issues**:
   - Ensure read access to the sync folder
   - Check if files are locked by other processes

### Sync Conflicts

**Cause**: Both local and remote were modified since last sync.

**Resolution**:

1. View conflict details:
   ```bash
   npm run gdocs-md status
   ```

2. Compare versions:
   - Local: `document.md`
   - Remote: `document.remote.<timestamp>.md`

3. Manually merge changes into `document.md`

4. Delete the remote backup file

5. Resolve the conflict:
   ```bash
   npm run gdocs-md sync --resolve "path/to/document.md"
   ```

### "Composio not available"

**Cause**: Composio API key not set or API unreachable.

**Solutions**:
1. Set API key:
   ```bash
   export COMPOSIO_API_KEY="your-key"
   ```

2. Check Composio status at [status.composio.dev](https://status.composio.dev)

3. Use Docs API fallback:
   ```json
   // In ~/.config/gdocs-md/config.json
   {
     "pushBackend": "docs_api"
   }
   ```

### "Rate limit exceeded"

**Cause**: Too many API requests in a short period.

**Solutions**:
1. Increase polling interval:
   ```json
   {
     "pollingIntervalSeconds": 120
   }
   ```

2. Reduce number of documents being synced

3. Wait and retry (automatic with exponential backoff)

### Database Errors

**Cause**: Corrupted or inaccessible SQLite database.

**Solutions**:
1. Check database file:
   ```bash
   ls -la ~/.config/gdocs-md/gdocs-md.db
   ```

2. Reset database (will lose sync history):
   ```bash
   rm ~/.config/gdocs-md/gdocs-md.db
   npm run gdocs-md sync --all
   ```

## Google Drive for Desktop Specifics

### macOS

**Drive location**: Usually at:
- `~/Google Drive/` (older installations)
- `~/Library/CloudStorage/GoogleDrive-<email>/` (newer installations)

**Finding the path**:
```bash
ls ~/Library/CloudStorage/ | grep GoogleDrive
```

### Windows

**Drive location**: Usually at:
- `G:\My Drive\` or similar drive letter
- `%USERPROFILE%\Google Drive\`

### Linux

Google Drive for Desktop is not officially supported on Linux. Consider:
- [rclone](https://rclone.org/) with Google Drive backend
- [google-drive-ocamlfuse](https://github.com/astrada/google-drive-ocamlfuse)

Note: .gdoc files may work differently with third-party tools.

## Getting Help

### Diagnostic Information

Run the doctor command:
```bash
npm run gdocs-md doctor
```

### Debug Logging

Enable debug logging:
```bash
# In config.json
{
  "logLevel": "debug"
}
```

Or via environment:
```bash
LOG_LEVEL=debug npm run gdocs-md sync --all
```

### Reporting Issues

When reporting issues, include:
1. Output of `gdocs-md doctor`
2. Operating system and version
3. Node.js version (`node --version`)
4. Relevant error messages
5. Steps to reproduce

**Do not include**:
- OAuth tokens or API keys
- Personal document content
- Email addresses (unless necessary)
