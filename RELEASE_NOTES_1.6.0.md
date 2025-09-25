# Release Notes - Version 1.6.0

## Release Date: September 25, 2025

## New Features

### Mobile Connection Tab
- **New Tab**: Added a dedicated "Mobile" tab for connecting to Emoji Studio iOS app
- **QR Code Generation**: Automatically generates QR code when Slack workspace is connected
- **Secure Sync**: QR code contains compressed authentication data for seamless mobile sync
- **TestFlight Access**: Direct link to join the iOS beta program via TestFlight

## Improvements

### Enhanced UI/UX
- **Simplified Interface**: Clean, minimal design for the mobile connection tab
- **Clear Instructions**: Simple message: "Scan this code with the mobile app to sync your workspace"
- **Visual Feedback**: Shows placeholder when no workspace is connected

### Technical Enhancements
- **Optimized QR Format**: Uses compressed format matching Emoji Studio web app
- **Cookie Optimization**: Extracts only essential 'd' cookie value for smaller QR codes
- **Error Handling**: Improved error messages and recovery options for QR generation

## User Impact

Users will experience:
1. ✅ Easy mobile sync with QR code scanning
2. ✅ Direct access to iOS TestFlight beta
3. ✅ Seamless workspace sync between desktop and mobile
4. ✅ Clean, intuitive interface for mobile connection

## Testing Checklist

Before installing this update:
- [ ] Verify QR code generates when workspace is connected
- [ ] Test QR code scanning with iOS app
- [ ] Confirm TestFlight link works correctly
- [ ] Check tab navigation between Sync, Create, and Mobile tabs

## Chrome Web Store Submission

This is a feature release that adds mobile connectivity. No new permissions required.

## What's Next

- Android app support (coming soon)
- Enhanced mobile sync features
- Real-time emoji updates across devices