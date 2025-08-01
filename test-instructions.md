# Testing the Emoji Studio Chrome Extension Cart Feature

## Setup
1. The Next.js development server is running on http://localhost:3002
2. The extension is configured for local development (FORCE_PRODUCTION = false)
3. Both background.js and popup.js are using the correct localhost:3002 URL
4. Environment defaults to 'development' and checks localhost:3002 for availability
5. Console logging added to track which environment is being used

## Test Steps
1. **Reload the Chrome Extension**
   - Go to chrome://extensions/
   - Find "Emoji Studio Extension"
   - Click the refresh icon

2. **Navigate to Slackmojis**
   - Go to https://slackmojis.com
   - Browse some emojis

3. **Add Emojis to Cart**
   - Hover over emojis to see the "+" button with the logo
   - Click to add emojis to cart
   - You should see a toast notification in the top-right corner

4. **Check Cart in Extension**
   - Click the extension icon
   - Go to the "Create" tab
   - You should see your emojis with their original names (e.g., "mic-drop")
   - You can rename emojis if desired

5. **Send to Emoji Studio**
   - Connect a Slack workspace first (if not already connected)
   - Click "Add to Emoji Studio"
   - The extension should open http://localhost:3002/create?from=extension-cart
   - Emojis should be automatically loaded and processing should start

## Features Implemented
- ✅ Emoji name extraction from slackmojis (using :emoji-name: format)
- ✅ Cart system instead of direct addition
- ✅ Toast notifications when adding to cart
- ✅ Ability to rename emojis in cart
- ✅ Cart count display in Create tab
- ✅ Sticky "Add to Emoji Studio" button
- ✅ Clear All functionality
- ✅ White border on hover
- ✅ Service worker keepalive mechanism
- ✅ Local development support

## Troubleshooting
- If emojis don't load, check the browser console for errors
- Make sure the Next.js server is running on port 3002
- Check that the extension has proper permissions
- Verify Chrome storage API is accessible