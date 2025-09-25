# Troubleshooting Guide - Emoji Studio Extension

## Sync Notification Not Appearing on Slack Emoji Page

If you're not seeing the sync notification when visiting `/customize/emoji/` on Slack, follow these steps:

### 1. Verify Extension is Loaded
1. Open Chrome DevTools (F12) on the Slack emoji page
2. Go to Console tab
3. Look for messages starting with `[Emoji Studio Extension]`
4. You should see: `[Emoji Studio Extension] Page check - Is emoji page? true`

### 2. After Updating Extension Code
When you change the extension files (especially after switching between production/development):

1. **Reload the Extension:**
   - Go to `chrome://extensions/`
   - Find "Emoji Studio for Slack"
   - Click the refresh icon (↻)

2. **Refresh the Slack Page:**
   - Hard refresh the Slack emoji page (Ctrl+Shift+R or Cmd+Shift+R)
   - The content script needs to be re-injected after extension reload

3. **Clear Extension Storage (if needed):**
   - Right-click the extension icon
   - Click "Manage Extension"
   - Click "Clear data" under "Storage"

### 3. Check Console for Errors
In the Slack page console, check for:
- Any errors related to the extension
- Messages about data capture
- Authentication status

Common console messages:
```
[Emoji Studio Extension] Page check - Is emoji page? true Path: /customize/emoji
[Emoji Studio Extension] On emoji customization page, checking for data...
[Emoji Studio Extension] Data check response: {hasEmojis: false, hasData: false}
[Emoji Studio Extension] No data captured yet
```

### 4. Manual Sync Process
If the notification appears but sync isn't working:

1. Click the "Sync" button in the green notification
2. The page will refresh to capture authentication
3. After refresh, emojis should automatically sync
4. Check the extension popup to verify data was captured

### 5. Development Mode Setup
For local testing with `localhost:3001`:

**In background.js:**
```javascript
const FORCE_PRODUCTION = false; // Should be false for localhost
```

**In popup.js:**
```javascript
const FORCE_PRODUCTION = false; // Should be false for localhost
```

### 6. Verify Slack Authentication
The extension needs to capture Slack's authentication tokens. If not working:

1. Make sure you're logged into Slack
2. Navigate away from `/customize/emoji/` and back
3. Try refreshing the page
4. Check if you can see emojis loading on the page

### 7. Check Network Requests
In DevTools Network tab, look for:
- Requests to `emoji.adminList`
- These should have authentication headers that the extension captures

### Common Issues and Solutions

**Issue:** Notification doesn't appear at all
- **Solution:** Reload extension and refresh Slack page

**Issue:** "Fetch & sync emojis" appears but clicking doesn't work
- **Solution:** The extension hasn't captured auth data yet. Try navigating to another Slack page and back

**Issue:** Sync opens wrong URL (production instead of localhost)
- **Solution:** Check FORCE_PRODUCTION flag in background.js is set to false

**Issue:** Extension popup shows no data after sync
- **Solution:** Check if localStorage:3001 has correct CORS headers for extension communication