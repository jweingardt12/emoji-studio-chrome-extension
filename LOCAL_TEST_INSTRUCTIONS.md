# Local Testing Instructions for Chrome Extension

## Prerequisites
1. Emoji Studio dev server running on http://localhost:3001
2. Chrome browser with developer mode enabled

## Setup Steps

### 1. Load the Extension
1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `/Users/jason/Github/emoji-studio-chrome-extension` directory
5. The extension should appear with ID displayed

### 2. Verify Configuration
- Extension is set to development mode (FORCE_PRODUCTION = false)
- Using localhost:3001 for Emoji Studio URL

## Test Cases

### Test 1: Right-click Image Context Menu
1. Navigate to any website with images (e.g., giphy.com, google images)
2. Right-click on an image
3. You should see "Create Slack emoji" in the context menu
4. Click it
5. **Expected Result:** 
   - Emoji Studio opens at http://localhost:3001/create?from=extension
   - The image loads in the create page
   - For GIFs > 128x128 or > 128KB, the frame editor should appear

### Test 2: Right-click GIF
1. Go to https://giphy.com
2. Right-click on any GIF
3. Select "Create Slack emoji"
4. **Expected Result:**
   - Emoji Studio opens with the GIF loaded
   - Frame editor appears if GIF needs optimization
   - User can select frames and adjust settings

### Test 3: Right-click Video
1. Find a page with video elements
2. Right-click on a video
3. Select "Create Slack emoji"
4. **Expected Result:**
   - Emoji Studio opens with video loaded
   - Frame extractor appears for frame selection

### Test 4: CORS-protected Images
1. Try with images from different domains (Twitter, Instagram, etc.)
2. Right-click and select "Create Slack emoji"
3. **Expected Result:**
   - Extension should handle CORS by fetching in background
   - Image should still load in Emoji Studio

## Debugging

### Check Console Logs
1. **Extension Background Page:**
   - Go to chrome://extensions/
   - Click "Service Worker" link under your extension
   - Check console for logs

2. **Emoji Studio Page:**
   - Open DevTools on http://localhost:3001/create
   - Look for logs starting with [Create Page]

### Common Issues
- If "Create Slack emoji" doesn't appear: Check if you have Slack data synced
- If Emoji Studio doesn't open: Verify localhost:3001 is running
- If image doesn't load: Check network tab for failed requests

## Reset and Retry
If something isn't working:
1. Reload the extension (click refresh button in chrome://extensions/)
2. Clear extension storage: Click "Service Worker" → Application tab → Clear storage
3. Restart Emoji Studio dev server