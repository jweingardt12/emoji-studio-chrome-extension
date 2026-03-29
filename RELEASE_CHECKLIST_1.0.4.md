# Release Checklist - Version 1.0.4

## Pre-Release Verification
- [x] Version updated to 1.0.4 in manifest.json
- [x] FORCE_PRODUCTION set to true in background.js and popup.js
- [x] Localhost URLs removed from manifest.json
- [x] Extension packaged without development files
- [x] Package size: ~1.5 MB (reasonable)

## Files in Package
- ✅ manifest.json
- ✅ popup.html, popup.js, popup.css
- ✅ background.js
- ✅ content.js
- ✅ inject.js
- ✅ slackmojis-content.js
- ✅ logo.png
- ✅ icons/ (16x16, 32x32, 48x48, 128x128)

## Chrome Web Store Upload Steps
1. [ ] Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/developer/dashboard)
2. [ ] Find "Emoji Studio for Slack"
3. [ ] Click "Package" → "Upload new package"
4. [ ] Upload `dist/emoji-studio-extension-v1.0.4.zip`
5. [ ] Update Store Listing:
   - [ ] Add release notes highlighting cart system and bug fixes
   - [ ] Update screenshots if UI has changed significantly
   - [ ] Review and update description if needed

## Testing Before Publishing
1. [ ] Test the uploaded package in developer mode
2. [ ] Verify cart functionality works on production (app.emojistudio.xyz)
3. [ ] Test Slack emoji sync
4. [ ] Test slackmojis.com integration

## Post-Release
1. [ ] Submit for review
2. [ ] Monitor for any user-reported issues
3. [ ] Update GitHub repository with release tag
4. [ ] Consider announcing update to users

## Rollback Plan
If critical issues are found:
1. Revert FORCE_PRODUCTION to false for debugging
2. Add localhost URLs back to manifest.json
3. Fix issues and re-package
4. Version would be 1.0.5 for the fix