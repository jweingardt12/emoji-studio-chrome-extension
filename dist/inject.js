// This script will be injected into Emoji Studio pages to establish communication
(function() {
  // Check if chrome.storage is available
  if (typeof chrome === 'undefined' || !chrome.storage) {
    return;
  }
  
  // Check if we're on the dashboard with extension parameter
  const urlParams = new URLSearchParams(window.location.search);
  
  
  // Add a visual indicator that the extension is loaded
  
  if (urlParams.get('extension') === 'true') {
  }
  
  if (urlParams.get('extension') === 'true' && (window.location.pathname.includes('dashboard') || window.location.pathname.includes('settings'))) {
    // Check chrome.storage for pending data
    chrome.storage.local.get(['pendingExtensionData'], (result) => {
      if (result.pendingExtensionData) {
        // Small delay to ensure the page is ready
        setTimeout(() => {
          sendDataToPage(result.pendingExtensionData);
        }, 500);
        
        // Clear the pending data
        chrome.storage.local.remove(['pendingExtensionData']);
      } else {
      }
    });
  } else if (window.location.pathname.includes('create')) {
      
      // Check if we came from the extension (new workflow)
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('from') === 'extension') {
        
        // Add a small delay to ensure storage is written before we read it
        setTimeout(() => {
          chrome.storage.local.get(['pendingEmojiStudioCreate'], (result) => {
            if (result.pendingEmojiStudioCreate) {
            
            // Small delay to ensure the page is ready
            setTimeout(() => {
              // Send emoji creation data to the page
              window.postMessage({
                type: 'EMOJI_STUDIO_CREATE_EMOJI',
                imageUrl: result.pendingEmojiStudioCreate.imageUrl,
                originalUrl: result.pendingEmojiStudioCreate.originalUrl,
                emojiName: result.pendingEmojiStudioCreate.name,
                workspace: result.pendingEmojiStudioCreate.workspace
              }, '*');
              
            }, 500);
            
            // Clear the pending data
            chrome.storage.local.remove(['pendingEmojiStudioCreate']);
            } else {
            }
          });
        }, 1000); // Wait 1 second for storage to be written
      } else {
        // Old workflow - check for pendingEmojiCreate (kept for compatibility)
        chrome.storage.local.get(['pendingEmojiCreate'], (result) => {
          if (result.pendingEmojiCreate) {
            
            // Small delay to ensure the page is ready
            setTimeout(() => {
              // Send emoji creation data to the page
              window.postMessage({
                type: 'EMOJI_STUDIO_CREATE_EMOJI',
                data: result.pendingEmojiCreate
              }, '*');
              
            }, 500);
            
            // Clear the pending data
            chrome.storage.local.remove(['pendingEmojiCreate']);
          }
        });
        
        // Also check for pendingEmojiAdd (from Slackmojis)
        chrome.storage.local.get(['pendingEmojiAdd'], (result) => {
          if (result.pendingEmojiAdd) {
            
            // Small delay to ensure the page is ready
            setTimeout(() => {
              // Send emoji add data to the page
              window.postMessage({
                type: 'EMOJI_STUDIO_ADD_EMOJI',
                data: result.pendingEmojiAdd
              }, '*');
              
            }, 500);
            
            // Clear the pending data
            chrome.storage.local.remove(['pendingEmojiAdd']);
          }
        });
      }
  }
  
  // Function to send data to the page
  function sendDataToPage(data) {
    console.log('[Extension] Sending data to page:', {
      workspace: data.workspace,
      hasToken: !!data.token,
      hasCookie: !!data.cookie
    });
    
    window.postMessage({
      type: 'EMOJI_STUDIO_DATA',
      data: data
    }, '*');
    
  }
  
  // Listen for messages from the extension
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    
    if (request.type === 'EMOJI_STUDIO_DATA') {
      // Forward the data to the page
      sendDataToPage(request.data);
      
      // Also clear any pending data from storage
      chrome.storage.local.remove(['pendingExtensionData']);
      
      sendResponse({ success: true });
    } else if (request.type === 'EMOJI_STUDIO_CREATE_EMOJI') {
      // Forward the emoji creation data to the page
      window.postMessage({
        type: 'EMOJI_STUDIO_CREATE_EMOJI',
        imageUrl: request.imageUrl
      }, '*');
      
      sendResponse({ success: true });
    } else if (request.type === 'CLEAR_EMOJI_STUDIO_DATA') {
      // Tell Emoji Studio to clear its data
      
      const message = {
        type: 'EMOJI_STUDIO_CLEAR_DATA_FROM_EXTENSION'
      };
      
      window.postMessage(message, '*');
      
      sendResponse({ success: true });
    }
    return true; // Keep message channel open
  });
  
  // Also listen for window messages to confirm they're being received
  window.addEventListener('message', (event) => {
    if (event.data.type === 'EMOJI_STUDIO_DATA') {
    } else if (event.data.type === 'EMOJI_STUDIO_ADD_EMOJI') {
    } else if (event.data.type === 'EMOJI_STUDIO_CLEAR_DATA') {
      // Forward to background script to clear extension data
      chrome.runtime.sendMessage({ type: 'CLEAR_DATA' });
    } else if (event.data.type === 'REQUEST_EXTENSION_DATA') {
      // Check chrome.storage for pending data
      chrome.storage.local.get(['pendingExtensionData'], (result) => {
        if (result.pendingExtensionData) {
          sendDataToPage(result.pendingExtensionData);
          // Clear the pending data
          chrome.storage.local.remove(['pendingExtensionData']);
        } else {
        }
      });
    }
  });
  
  // Also check for pendingEmojiAdd on dashboard page load (from Slackmojis)
  if (window.location.pathname.includes('dashboard')) {
    chrome.storage.local.get(['pendingEmojiAdd'], (result) => {
      if (result.pendingEmojiAdd) {
        
        // Small delay to ensure the page is ready
        setTimeout(() => {
          // Send emoji add data to the page
          const messageData = {
            type: 'EMOJI_STUDIO_ADD_EMOJI',
            data: result.pendingEmojiAdd
          };
          
          window.postMessage(messageData, '*');
          
          
          // Clear the pending data
          chrome.storage.local.remove(['pendingEmojiAdd']);
        }, 1000);
      }
    });
  }
  
  // Notify the extension that we're ready
  window.postMessage({ type: 'EMOJI_STUDIO_READY' }, '*');
})();