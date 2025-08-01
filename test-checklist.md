# Chrome Extension Cart Test Checklist

## Pre-test Setup
- [x] Next.js server running on http://localhost:3002
- [x] Extension manifest.json includes localhost URLs
- [x] inject.js has cart handling for EMOJI_STUDIO_CART_DATA
- [x] Emoji Studio create page uses image proxy for external URLs

## Test Steps

### 1. Reload Chrome Extension
- [ ] Go to chrome://extensions/
- [ ] Find "Emoji Studio for Slack"
- [ ] Click the refresh/reload icon
- [ ] Check the extension console for any errors

### 2. Test on Slackmojis
- [ ] Navigate to https://slackmojis.com
- [ ] Search for some emojis (e.g., "party", "celebrate")
- [ ] Hover over emojis - you should see the "+" button with logo
- [ ] Click to add 2-3 emojis to cart
- [ ] Verify toast notification appears in top-right corner

### 3. Check Extension Cart
- [ ] Click the extension icon in Chrome toolbar
- [ ] Go to "Create" tab
- [ ] Verify you see your emojis with original names
- [ ] Try renaming one emoji (optional)
- [ ] Verify cart count shows correct number

### 4. Sync to Emoji Studio
- [ ] Ensure you have a Slack workspace connected (Sync tab)
- [ ] Click "Add to Emoji Studio" button
- [ ] Should open http://localhost:3002/create?from=extension-cart

### 5. Verify in Browser Console
Open DevTools Console (F12) and look for:
- [ ] `[Inject] Found cart data:` - Shows cart was retrieved
- [ ] `[Create Page] Waiting for cart data from extension...`
- [ ] `[Create Page] Received cart data from extension:`
- [ ] `[Create Page] Successfully loaded X emojis from cart`
- [ ] No CORS errors about slackmojis.com

### 6. Check Processing
- [ ] Toast notification shows "Processing X emojis from cart"
- [ ] Emojis appear in the processing interface
- [ ] Each emoji processes successfully (green checkmark)
- [ ] No errors in console about failed fetches

## Expected Console Output
```
[Inject] Found cart data: {workspace: "...", emojis: [...]}
[Create Page] Received cart data from extension: {type: "EMOJI_STUDIO_CART_DATA", data: {...}}
[Create Page] Successfully loaded 3 emojis from cart
```

## Troubleshooting

### If emojis don't load:
1. Check browser console for errors
2. Verify extension is reloaded after code changes
3. Check Network tab - image requests should go to `/api/image-proxy?url=...`
4. Ensure you're on http://localhost:3002 (not production)

### If you see CORS errors:
- The proxy might not be working - check Network tab
- Image URLs should be proxied through `/api/image-proxy`
- Original slackmojis URLs should NOT be fetched directly

### If cart is empty:
1. Check extension popup console for errors
2. Try clearing extension storage and re-adding emojis
3. Verify emojis were added successfully (toast notification)

## Success Criteria
✅ All emojis from cart load in Emoji Studio
✅ No CORS errors in console
✅ Images fetch through proxy endpoint
✅ Processing starts automatically
✅ Event tracked: `chrome_extension_cart_synced`