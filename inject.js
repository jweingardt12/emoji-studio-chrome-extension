// This script will be injected into Emoji Studio pages to establish communication
(function() {
  // Check if chrome.storage is available
  if (typeof chrome === 'undefined' || !chrome.storage) {
    return;
  }
  
  // Function to check for synced data from extension storage
  async function checkForSyncedData() {
    try {
      // Check if extension has synced data available
      const result = await chrome.storage.local.get(['emojiStudioSyncData', 'emojiStudioSyncMeta']);
      
      if (result.emojiStudioSyncData && result.emojiStudioSyncMeta) {
        console.log('[Inject] Found synced data in extension storage');
        
        // Send the synced data to Emoji Studio
        window.postMessage({
          type: 'EMOJI_STUDIO_SYNCED_DATA',
          data: result.emojiStudioSyncData,
          meta: result.emojiStudioSyncMeta,
          source: 'extension-storage'
        }, '*');
        
        return true;
      }
    } catch (error) {
      console.error('[Inject] Error checking for synced data:', error);
    }
    return false;
  }
  
  // Check for synced data on page load with a small delay to ensure page is ready
  // But don't auto-check if sync is starting (to avoid sending stale data)
  const urlParams = new URLSearchParams(window.location.search);
  const syncStarting = urlParams.get('syncStarting') === 'true';
  
  if (!syncStarting) {
    setTimeout(() => {
      checkForSyncedData();
    }, 500);
  } else {
    console.log('[Inject] Sync is starting, skipping auto-check for synced data');
  }
  
  // Listen for sync progress messages from background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SYNC_STARTED') {
      console.log('[Inject] Sync started for workspace:', message.workspace);
      window.postMessage({
        type: 'EMOJI_STUDIO_SYNC_PROGRESS',
        status: 'started',
        workspace: message.workspace,
        timestamp: message.timestamp
      }, '*');
    } else if (message.type === 'SYNC_COMPLETED') {
      console.log('[Inject] Sync completed for workspace:', message.workspace);
      window.postMessage({
        type: 'EMOJI_STUDIO_SYNC_PROGRESS',
        status: 'completed',
        workspace: message.workspace,
        emojiCount: message.emojiCount,
        nonAliasCount: message.nonAliasCount,
        timestamp: message.timestamp
      }, '*');
      
      // Also check for updated synced data
      setTimeout(() => {
        checkForSyncedData();
      }, 100);
    } else if (message.type === 'SYNC_ERROR') {
      console.log('[Inject] Sync error for workspace:', message.workspace, message.error);
      window.postMessage({
        type: 'EMOJI_STUDIO_SYNC_PROGRESS',
        status: 'error',
        workspace: message.workspace,
        error: message.error,
        timestamp: message.timestamp
      }, '*');
    }
  });
  
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
        
        // Check for cart data (from extension-cart flow)
        if (urlParams.get('from') === 'extension-cart') {
          chrome.storage.local.get(['pendingEmojiStudioCart'], (result) => {
            if (result.pendingEmojiStudioCart) {
              console.log('[Inject] Found cart data:', result.pendingEmojiStudioCart);
              
              // Small delay to ensure the page is ready
              setTimeout(() => {
                // Send cart data to the page
                window.postMessage({
                  type: 'EMOJI_STUDIO_CART_DATA',
                  data: result.pendingEmojiStudioCart
                }, '*');
              }, 500);
              
              // Clear the pending data
              chrome.storage.local.remove(['pendingEmojiStudioCart']);
            } else {
              console.log('[Inject] No cart data found in storage');
            }
          });
        }
      }
  }
  
  // Function to send data to the page
  function sendDataToPage(data) {
    window.postMessage({
      type: 'EMOJI_STUDIO_DATA',
      data: data
    }, '*');
    
  }
  
  // Listen for messages from the extension
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    
    if (request.type === 'EMOJI_DATA_SYNCED') {
      // Extension notifying us that new data has been synced
      console.log('[Inject] Received notification of new synced data');
      checkForSyncedData();
      sendResponse({ success: true });
    } else if (request.type === 'EMOJI_STUDIO_DATA') {
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
    } else if (event.data.type === 'REQUEST_EXTENSION_SYNC_DATA') {
      // Emoji Studio requesting synced data
      console.log('[Inject] Emoji Studio requesting synced data');
      checkForSyncedData();
    } else if (event.data.type === 'EMOJI_STUDIO_READY') {
      // Emoji Studio is ready, send synced data if available
      console.log('[Inject] Emoji Studio ready, checking for synced data');
      checkForSyncedData();
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