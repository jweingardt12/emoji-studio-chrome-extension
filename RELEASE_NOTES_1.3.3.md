# Release Notes - Version 1.3.3

## Critical Bug Fix

### 🐛 Fixed Emoji Count Limit
- **Issue**: Background sync was only fetching 5,000 emojis instead of all available emojis
- **Fix**: Now fetches up to 20,000 emojis to ensure complete workspace synchronization
- **Impact**: Workspaces with more than 5,000 emojis will now sync completely

### ✅ What's Improved
- **Complete Sync**: All emojis in your workspace are now properly synchronized
- **Consistency**: Extension behavior now matches the Emoji Studio web app
- **Better Coverage**: No more missing emojis in large workspaces

## Who Should Update
This is a **critical fix** for users with large emoji collections. If your Slack workspace has more than 5,000 custom emojis, this update ensures you get all of them synced to Emoji Studio.

## Technical Details
- Changed `fetchFreshEmojiData` from `count: 5000` to `count: 20000`
- Aligned with existing Emoji Studio app limits
- Maintains backward compatibility

## Previous Features (Still Available)
- Loading overlay when syncing from notification (v1.3.2)
- Automatic dashboard opening after sync (v1.3.2)  
- Background sync with configurable intervals
- One-click Slack workspace authentication
- Chrome storage-based sync (no tabs opening)

## Compatibility
- Chrome 88 or later
- All Slack workspaces with emoji permissions
- Full Emoji Studio app integration

This is a maintenance release focused on ensuring complete emoji synchronization for all users.