#!/bin/bash

# Package Chrome Extension for Release
echo "Packaging Emoji Studio Chrome Extension v1.3.2..."

# Create a clean dist directory
rm -rf dist
mkdir -p dist

# Create the zip file excluding unnecessary files
zip -r dist/emoji-studio-extension-v1.3.2.zip . \
  -x ".*" \
  -x "*.sh" \
  -x "*.md" \
  -x "dist/*" \
  -x ".git/*" \
  -x "node_modules/*" \
  -x "test-*" \
  -x "*.log" \
  -x ".DS_Store" \
  -x "*.zip" \
  -x "package.json" \
  -x "package-lock.json"

echo "✅ Extension packaged successfully!"
echo "📦 Output: dist/emoji-studio-extension-v1.3.2.zip"
echo ""
echo "Next steps:"
echo "1. Upload to Chrome Web Store Developer Dashboard"
echo "2. Update the listing with release notes"
echo "3. Submit for review"