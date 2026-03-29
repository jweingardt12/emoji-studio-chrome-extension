# Release Notes - Version 1.0.4

## New Features
- **Cart System**: Add multiple emojis to a cart before sending to Emoji Studio
- **Emoji Renaming**: Rename emojis directly in the cart before importing
- **Improved Slackmojis Integration**: Emojis now retain their original names (e.g., "mic-drop" instead of descriptive text)
- **Toast Notifications**: Visual feedback when adding emojis to cart

## Bug Fixes
- Fixed CORS errors when importing emojis from slackmojis.com
- Fixed service worker becoming inactive during long operations
- Fixed "Clear All" button functionality in cart
- Improved error handling for failed emoji fetches

## UI/UX Improvements
- Cart tab now shows emoji count
- Sticky "Add to Emoji Studio" button for better accessibility
- White border on hover for better visibility on slackmojis.com
- Toast notifications appear in top-right corner
- Better visual feedback during emoji processing

## Technical Improvements
- Added support for localhost development URLs
- Implemented message passing for cart data transfer
- Added keepalive mechanism for service worker stability
- Improved logging for better debugging

## Known Issues
- None currently identified

## Upgrade Instructions
1. The extension will auto-update for most users
2. Manual update: Go to chrome://extensions/ and click "Update"
3. After update, reload any open Slack or slackmojis.com tabs