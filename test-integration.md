# Testing Chrome Extension & Emoji Studio Integration

## Setup
1. Ensure both the Chrome extension and Emoji Studio app are running
2. The Chrome extension should have background syncing enabled

## Test Scenarios

### 1. Background Sync to Emoji Studio
**Steps:**
1. Open Chrome with the extension installed
2. Ensure you're logged into a Slack workspace via the extension
3. Click "Refresh Data" in the extension popup
4. Open Emoji Studio app (any page)

**Expected Result:**
- Emoji Studio should receive the synced data automatically
- A success toast should appear showing "Synced X emojis from [workspace]"
- The emoji data should be visible in the dashboard

### 2. Manual Sync Trigger
**Steps:**
1. Open the extension popup
2. Click "Refresh Data" button
3. Check Chrome DevTools console for sync messages

**Expected Result:**
- Console should show:
  - `[Background] Refresh data requested`
  - `[Background] Fetching fresh data for workspace: [name]`
  - `[Background] Successfully fetched X emojis`
  - `[Background] Data synced to Emoji Studio`

### 3. Auto Sync
**Steps:**
1. Enable auto-sync in extension with 1 hour interval
2. Wait for the sync to trigger (or use Chrome DevTools to trigger alarm)

**Expected Result:**
- Background sync should run automatically
- Data should be stored in Chrome Storage
- Emoji Studio should receive updated data when opened

### 4. Data Persistence
**Steps:**
1. Sync data from extension
2. Close Emoji Studio app
3. Reopen Emoji Studio app

**Expected Result:**
- Data should persist and be immediately available
- No need to re-sync unless data has changed

## Console Commands for Testing

### Check Chrome Storage (in extension background page console):
```javascript
// Check synced data
chrome.storage.local.get(['emojiStudioSyncData', 'emojiStudioSyncMeta'], (result) => {
  console.log('Synced Data:', result.emojiStudioSyncData);
  console.log('Sync Meta:', result.emojiStudioSyncMeta);
});

// Check workspaces
chrome.storage.local.get('workspaces', (result) => {
  console.log('Workspaces:', result.workspaces);
});
```

### Trigger Manual Sync (in extension background page console):
```javascript
// Trigger immediate sync
chrome.runtime.sendMessage({ type: 'FETCH_FRESH_DATA' });
```

### Check Emoji Studio Reception (in Emoji Studio app console):
```javascript
// Check localStorage for synced data
console.log('Emoji Data:', localStorage.getItem('emojiData'));
console.log('Workspace:', localStorage.getItem('workspace'));
console.log('Last Sync:', localStorage.getItem('lastSyncTime'));
```

## Debugging Tips

1. **Extension Background Page:**
   - Open chrome://extensions/
   - Find the extension and click "Inspect views: background page"
   - Check console for sync logs

2. **Emoji Studio App:**
   - Open browser DevTools on Emoji Studio
   - Look for console logs prefixed with:
     - `[Emoji Studio]` - from lib/chrome-extension.ts
     - `[ChromeExtensionHandler]` - from the handler component
     - `[Inject]` - from the injected script

3. **Message Flow:**
   - Extension background.js → Chrome Storage
   - Extension inject.js → Reads Chrome Storage
   - inject.js → Posts message to window
   - Emoji Studio → Receives message via listener
   - ChromeExtensionHandler → Processes and stores data

## Common Issues

1. **No data received in Emoji Studio:**
   - Check if extension has permission to access Emoji Studio domain
   - Verify inject.js is running on Emoji Studio pages
   - Check Chrome Storage has data

2. **Data not persisting:**
   - Check localStorage in Emoji Studio
   - Verify ChromeExtensionHandler is mounted on the page

3. **Sync not triggering:**
   - Check Chrome alarms are set correctly
   - Verify background service worker is running
   - Check network requests to Slack API