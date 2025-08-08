// This script will be injected into Emoji Studio pages to establish communication
(function() {
  console.log('[Emoji Studio Extension] Inject script loaded');
  
  // Check if chrome.storage is available
  if (typeof chrome === 'undefined' || !chrome.storage) {
    console.log('[Emoji Studio Extension] Chrome API not available');
    return;
  }
  
  // Wait for DOM to be ready before marking extension
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', markExtensionInstalled);
  } else {
    markExtensionInstalled();
  }
  
  function markExtensionInstalled() {
    // Mark extension as installed (multiple ways for reliability)
    window.__EMOJI_STUDIO_EXTENSION__ = true;
    console.log('[Emoji Studio Extension] Marked window.__EMOJI_STUDIO_EXTENSION__ = true');
    
    // Also dispatch an event to notify the page
    const version = chrome.runtime.getManifest().version;
    window.dispatchEvent(new CustomEvent('emoji-studio-extension-installed', { 
      detail: { version: version }
    }));
    console.log('[Emoji Studio Extension] Dispatched emoji-studio-extension-installed event with version:', version);
    
    // Also post a message for good measure
    window.postMessage({
      type: 'EMOJI_STUDIO_EXTENSION_INSTALLED',
      version: version
    }, '*');
    
    // Send the message a few more times to ensure it's received
    setTimeout(() => {
      window.postMessage({
        type: 'EMOJI_STUDIO_EXTENSION_INSTALLED',
        version: version
      }, '*');
    }, 100);
    
    setTimeout(() => {
      window.postMessage({
        type: 'EMOJI_STUDIO_EXTENSION_INSTALLED',
        version: version
      }, '*');
    }, 500);
  }
  
  // Function to check for synced data from extension storage
  async function checkForSyncedData() {
    try {
      console.log('[Inject] Checking chrome.storage.local for sync data...');
      
      // Check if extension has synced data available
      const result = await chrome.storage.local.get(['emojiStudioSyncData', 'emojiStudioSyncMeta']);
      
      console.log('[Inject] Storage check result:', {
        hasSyncData: !!result.emojiStudioSyncData,
        hasSyncMeta: !!result.emojiStudioSyncMeta,
        emojiCount: result.emojiStudioSyncMeta?.emojiCount || 0,
        workspace: result.emojiStudioSyncMeta?.workspace || 'none'
      });
      
      if (result.emojiStudioSyncData && result.emojiStudioSyncMeta) {
        console.log('[Inject] Found synced data in extension storage, posting to window');
        console.log('[Inject] Emoji count:', result.emojiStudioSyncData.emojiCount);
        console.log('[Inject] Workspace:', result.emojiStudioSyncData.workspace);
        
        // Send the synced data to Emoji Studio
        window.postMessage({
          type: 'EMOJI_STUDIO_SYNCED_DATA',
          data: result.emojiStudioSyncData,
          meta: result.emojiStudioSyncMeta,
          source: 'extension-storage'
        }, '*');
        
        return true;
      } else {
        console.log('[Inject] No sync data found in chrome.storage.local');
      }
    } catch (error) {
      console.error('[Inject] Error checking for synced data:', error);
    }
    return false;
  }
  
  // Check for synced data on page load with a small delay to ensure page is ready
  const urlParams = new URLSearchParams(window.location.search);
  const syncStarting = urlParams.get('syncStarting') === 'true';
  
  if (!syncStarting) {
    setTimeout(() => {
      checkForSyncedData();
    }, 500);
  } else {
    console.log('[Inject] Sync is starting, will check for fresh sync data');
    // When syncStarting=true, we're coming from the extension's sync button
    // Wait a bit for the data to be written, then check
    setTimeout(() => {
      console.log('[Inject] First check for fresh sync data...');
      checkForSyncedData().then(found => {
        if (!found) {
          // Try again after another delay
          console.log('[Inject] Data not found, retrying in 1 second...');
          setTimeout(() => {
            console.log('[Inject] Second check for fresh sync data...');
            checkForSyncedData();
          }, 1000);
        }
      });
    }, 1500);
  }
  
  // Listen for sync progress messages from background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'TRACK_EVENT') {
      // Forward tracking event to Emoji Studio
      window.postMessage({
        type: 'EXTENSION_TRACK_EVENT',
        eventName: message.eventName,
        properties: message.properties
      }, '*');
    } else if (message.type === 'SYNC_STARTED') {
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
  // urlParams already declared above, reuse it
  
  
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
      // urlParams already declared above, reuse it
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
    } else if (event.data.type === 'UPDATE_NOTIFICATION_SETTINGS') {
      // Forward notification settings to background script
      console.log('[Inject] Forwarding notification settings to extension');
      chrome.runtime.sendMessage({ 
        type: 'UPDATE_NOTIFICATION_SETTINGS',
        settings: event.data.settings
      });
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