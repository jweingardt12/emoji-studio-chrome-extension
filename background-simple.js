// Minimal background script for testing
console.log('🚀 Simple background script loaded');

// Create context menu on installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed/updated');
  
  chrome.contextMenus.create({
    id: 'createSlackEmoji',
    title: 'Create Slack emoji',
    contexts: ['image', 'video'],
    documentUrlPatterns: ['<all_urls>']
  }, () => {
    if (chrome.runtime.lastError) {
      console.error('Context menu error:', chrome.runtime.lastError);
    } else {
      console.log('✅ Context menu created');
    }
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  console.log('Context menu clicked:', info.menuItemId);
  
  if (info.menuItemId === 'createSlackEmoji') {
    const imageUrl = info.srcUrl;
    console.log('Image URL:', imageUrl);
    
    try {
      // For cross-origin images, we need to inject a content script to fetch the image
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: async (imageUrl) => {
          try {
            // Try to fetch the image and convert to data URL
            const response = await fetch(imageUrl);
            const blob = await response.blob();
            
            return new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
          } catch (error) {
            console.error('Failed to fetch image:', error);
            // Try canvas method as fallback
            try {
              const img = new Image();
              img.crossOrigin = 'anonymous';
              
              await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = imageUrl;
              });
              
              const canvas = document.createElement('canvas');
              canvas.width = img.width;
              canvas.height = img.height;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0);
              
              return canvas.toDataURL();
            } catch (canvasError) {
              console.error('Canvas method also failed:', canvasError);
              // Return the original URL as last resort
              return imageUrl;
            }
          }
        },
        args: [imageUrl]
      });
      
      const dataUrl = results[0]?.result || imageUrl;
      console.log('Got data URL, length:', dataUrl.length);
      
      // Store the image data
      chrome.storage.local.set({
        pendingEmojiStudioCreate: {
          imageUrl: dataUrl,
          originalUrl: imageUrl,
          workspace: 'test',
          authData: {},
          timestamp: Date.now()
        }
      }, () => {
        console.log('Data stored, opening Emoji Studio');
        // Open Emoji Studio
        const emojiStudioUrl = 'http://localhost:3001/create?from=extension';
        chrome.tabs.create({ url: emojiStudioUrl });
      });
    } catch (error) {
      console.error('Failed to process image:', error);
      
      // Fallback: try to fetch in background
      try {
        console.log('Trying background fetch for:', imageUrl);
        const response = await fetch(imageUrl);
        let blob = await response.blob();
        
        // Check if it's a GIF and fix MIME type if needed
        if (imageUrl.toLowerCase().includes('.gif') && blob.type !== 'image/gif') {
          console.log('Correcting GIF MIME type from', blob.type, 'to image/gif');
          const arrayBuffer = await blob.arrayBuffer();
          blob = new Blob([arrayBuffer], { type: 'image/gif' });
        }
        
        console.log('Blob type:', blob.type, 'Size:', blob.size);
        
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result;
          console.log('Data URL created, length:', dataUrl.length);
          
          chrome.storage.local.set({
            pendingEmojiStudioCreate: {
              imageUrl: dataUrl,
              originalUrl: imageUrl,
              workspace: 'test',
              authData: {},
              timestamp: Date.now()
            }
          }, () => {
            console.log('Data stored (background fetch), opening Emoji Studio');
            const emojiStudioUrl = 'http://localhost:3001/create?from=extension';
            chrome.tabs.create({ url: emojiStudioUrl });
          });
        };
        
        reader.readAsDataURL(blob);
      } catch (bgError) {
        console.error('Background fetch also failed:', bgError);
        // Last resort: just pass the URL
        chrome.storage.local.set({
          pendingEmojiStudioCreate: {
            imageUrl: imageUrl,
            originalUrl: imageUrl,
            workspace: 'test',
            authData: {},
            timestamp: Date.now()
          }
        }, () => {
          console.log('Data stored (URL only), opening Emoji Studio');
          const emojiStudioUrl = 'http://localhost:3001/create?from=extension';
          chrome.tabs.create({ url: emojiStudioUrl });
        });
      }
    }
  }
});

console.log('Background script setup complete');