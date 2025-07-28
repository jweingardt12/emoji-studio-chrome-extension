// This script will be injected into Emoji Studio pages to establish communication
(function() {
  console.log('[Emoji Studio Extension] Inject script loaded on:', window.location.href);
  
  // Debug current page info
  console.log('[Emoji Studio Extension] Current pathname:', window.location.pathname);
  console.log('[Emoji Studio Extension] Current search:', window.location.search);
  
  // Check if we're on the dashboard with extension parameter
  const urlParams = new URLSearchParams(window.location.search);
  
  console.log('[Emoji Studio Extension] URL params:', Object.fromEntries(urlParams.entries()));
  console.log('[Emoji Studio Extension] Pathname:', window.location.pathname);
  
  if (urlParams.get('extension') === 'true' && (window.location.pathname.includes('dashboard') || window.location.pathname.includes('settings'))) {
    console.log('[Emoji Studio Extension] Extension sync detected! Checking for pending data in chrome.storage');
    
    // Check chrome.storage for pending data
    chrome.storage.local.get(['pendingExtensionData'], (result) => {
      console.log('[Emoji Studio Extension] Chrome storage result:', result);
      console.log('[Emoji Studio Extension] Has pendingExtensionData:', !!result.pendingExtensionData);
      
      if (result.pendingExtensionData) {
        console.log('[Emoji Studio Extension] Found pending data with keys:', Object.keys(result.pendingExtensionData));
        
        // Small delay to ensure the page is ready
        setTimeout(() => {
          // Send data to the page
          window.postMessage({
            type: 'EMOJI_STUDIO_DATA',
            data: result.pendingExtensionData
          }, '*');
          
          console.log('[Emoji Studio Extension] Data posted to window');
        }, 500);
        
        // Clear the pending data
        chrome.storage.local.remove(['pendingExtensionData']);
        console.log('[Emoji Studio Extension] Pending data cleared from storage');
      } else {
        console.log('[Emoji Studio Extension] No pending data found in chrome.storage');
      }
    });
  } else if (window.location.pathname.includes('create')) {
      console.log('[Emoji Studio Extension] On create page, checking for pending emoji creation');
      console.log('[Emoji Studio Extension] Pathname contains create:', window.location.pathname.includes('create'));
      
      // Check if we came from the extension (new workflow)
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('from') === 'extension') {
        console.log('[Emoji Studio Extension] Came from extension, checking for pendingEmojiStudioCreate');
        
        // Add a small delay to ensure storage is written before we read it
        setTimeout(() => {
          chrome.storage.local.get(['pendingEmojiStudioCreate'], (result) => {
            console.log('[Emoji Studio Extension] Storage query result:', result);
            if (result.pendingEmojiStudioCreate) {
              console.log('[Emoji Studio Extension] Found pending emoji studio create:', result.pendingEmojiStudioCreate);
            
            // Small delay to ensure the page is ready
            setTimeout(() => {
              // Send emoji creation data to the page
              window.postMessage({
                type: 'EMOJI_STUDIO_CREATE_EMOJI',
                imageUrl: result.pendingEmojiStudioCreate.imageUrl,
                originalUrl: result.pendingEmojiStudioCreate.originalUrl,
                workspace: result.pendingEmojiStudioCreate.workspace
              }, '*');
              
              console.log('[Emoji Studio Extension] Emoji creation data posted to window');
            }, 500);
            
            // Clear the pending data
            chrome.storage.local.remove(['pendingEmojiStudioCreate']);
            } else {
              console.log('[Emoji Studio Extension] No pendingEmojiStudioCreate found in storage');
            }
          });
        }, 1000); // Wait 1 second for storage to be written
      } else {
        // Old workflow - check for pendingEmojiCreate (kept for compatibility)
        chrome.storage.local.get(['pendingEmojiCreate'], (result) => {
          if (result.pendingEmojiCreate) {
            console.log('[Emoji Studio Extension] Found pending emoji creation:', result.pendingEmojiCreate);
            
            // Small delay to ensure the page is ready
            setTimeout(() => {
              // Send emoji creation data to the page
              window.postMessage({
                type: 'EMOJI_STUDIO_CREATE_EMOJI',
                data: result.pendingEmojiCreate
              }, '*');
              
              console.log('[Emoji Studio Extension] Emoji creation data posted to window');
            }, 500);
            
            // Clear the pending data
            chrome.storage.local.remove(['pendingEmojiCreate']);
          }
        });
      }
  }
  
  // Listen for messages from the extension
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[Emoji Studio Extension] Received message:', request.type, request.data);
    
    if (request.type === 'EMOJI_STUDIO_DATA') {
      // Forward the data to the page
      console.log('[Emoji Studio Extension] Forwarding data to window:', request.data);
      window.postMessage({
        type: 'EMOJI_STUDIO_DATA',
        data: request.data
      }, '*');
      
      console.log('[Emoji Studio Extension] Data forwarded to page');
      sendResponse({ success: true });
    } else if (request.type === 'EMOJI_STUDIO_CREATE_EMOJI') {
      // Forward the emoji creation data to the page
      console.log('[Emoji Studio Extension] Forwarding emoji creation data to window:', request);
      window.postMessage({
        type: 'EMOJI_STUDIO_CREATE_EMOJI',
        imageUrl: request.imageUrl
      }, '*');
      
      console.log('[Emoji Studio Extension] Emoji creation data forwarded to page');
      sendResponse({ success: true });
    } else if (request.type === 'CLEAR_EMOJI_STUDIO_DATA') {
      // Tell Emoji Studio to clear its data
      console.log('[Emoji Studio Extension] Forwarding clear data request to window');
      window.postMessage({
        type: 'EMOJI_STUDIO_CLEAR_DATA_FROM_EXTENSION'
      }, '*');
      sendResponse({ success: true });
    }
    return true; // Keep message channel open
  });
  
  // Also listen for window messages to confirm they're being received
  window.addEventListener('message', (event) => {
    console.log('[Emoji Studio Extension] Window message received:', event.data.type);
    if (event.data.type === 'EMOJI_STUDIO_DATA') {
      console.log('[Emoji Studio Extension] Window received EMOJI_STUDIO_DATA message:', event.data);
    } else if (event.data.type === 'EMOJI_STUDIO_CLEAR_DATA') {
      console.log('[Emoji Studio Extension] Clear data request from Emoji Studio');
      // Forward to background script to clear extension data
      chrome.runtime.sendMessage({ type: 'CLEAR_DATA' });
    } else if (event.data.type === 'REQUEST_EXTENSION_DATA') {
      console.log('[Emoji Studio Extension] Request for extension data received');
      // Check chrome.storage for pending data
      chrome.storage.local.get(['pendingExtensionData'], (result) => {
        if (result.pendingExtensionData) {
          console.log('[Emoji Studio Extension] Sending pending data on request:', result.pendingExtensionData);
          window.postMessage({
            type: 'EMOJI_STUDIO_DATA',
            data: result.pendingExtensionData
          }, '*');
          // Clear the pending data
          chrome.storage.local.remove(['pendingExtensionData']);
        }
      });
    }
  });
  
  // Notify the extension that we're ready
  window.postMessage({ type: 'EMOJI_STUDIO_READY' }, '*');
  console.log('[Emoji Studio Extension] Ready message sent');
})();