# Emoji Studio Chrome Extension

This Chrome extension simplifies the process of connecting your Slack workspace to Emoji Studio by automatically capturing the necessary authentication data.

## Features

- 🔐 Automatic detection of Slack workspace authentication
- 🎯 One-click data transfer to Emoji Studio
- 🔄 Support for one workspace at a time
- 🛡️ Secure local storage of credentials
- ✨ Clean, intuitive interface

## Installation

### Development Mode

1. Clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension directory
5. The extension icon will appear in your toolbar

### Creating Icons

1. Open `icons/generate-icons.html` in your browser
2. Right-click each canvas and save as PNG with the specified filename
3. Save all icons in the `icons/` directory

## Usage

1. **Install the Extension**: Follow the installation steps above

2. **Navigate to Slack**: 
   - Go to your Slack workspace (e.g., `https://myworkspace.slack.com`)
   - Navigate to the emoji management page: `Customize Workspace > Emoji`

3. **Automatic Capture**: 
   - The extension will automatically detect and capture authentication data
   - You'll see a green notification when data is captured
   - The extension icon will show a badge indicator

4. **Send to Emoji Studio**:
   - Click the extension icon
   - Review captured workspace
   - Click "Send to Emoji Studio"
   - The data will be transferred and Emoji Studio will open

## How It Works

The extension uses Chrome's webRequest API to intercept Slack API calls and extract:
- Authentication token (xoxc-...)
- Session cookie (d=...)
- Workspace identifier
- Team ID (optional)
- Request ID (optional)

This data is stored locally and can be sent to Emoji Studio with one click.

## Security

- All data is stored locally in your browser
- No data is sent to external servers
- Credentials are only shared with Emoji Studio when you explicitly click "Send"
- You can clear all stored data at any time

## Troubleshooting

### Data Not Capturing
- Ensure you're on a Slack workspace page
- Try navigating to the emoji management page
- Check that the extension has permissions for Slack domains

### Can't Send to Emoji Studio
- Make sure Emoji Studio is running locally (http://localhost:3000)
- Check browser console for any errors
- Try clearing extension data and recapturing

## Development

### Project Structure
```
├── manifest.json       # Extension configuration
├── background.js       # Service worker for request interception
├── content.js         # Content script for Slack pages
├── popup.html         # Extension popup interface
├── popup.js           # Popup functionality
├── inject.js          # Script injected into Emoji Studio
└── icons/             # Extension icons
```

### Building for Production
1. Update the version in `manifest.json`
2. Create a ZIP file of all extension files
3. Upload to Chrome Web Store

## Privacy Policy

This extension:
- Only activates on Slack domains
- Stores data locally in your browser
- Does not track usage or analytics
- Does not share data with third parties

## License

MIT