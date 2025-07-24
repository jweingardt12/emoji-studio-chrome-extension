const pendingRequests = new Map();
let debugMode = true;
let lastCapturedWorkspace = null;
let lastCaptureTime = 0;
let hasShownNotification = false; // Track if we've shown a notification on this page

function log(...args) {
  if (debugMode) {
    console.log('[Emoji Studio Content]', ...args);
  }
}

log('Content script loaded on:', window.location.href);
log('Current pathname:', window.location.pathname);
log('Is on customize/emoji page:', window.location.pathname.includes('/customize/emoji'));

function extractWorkspace() {
  const match = window.location.hostname.match(/^([^.]+)\.slack\.com$/);
  return match ? match[1] : null;
}

// Check if user is on a Slack login page
function checkIfLoggedIn() {
  const workspace = extractWorkspace();
  if (!workspace) return;
  
  // Check for common login page indicators
  const isLoginPage = 
    window.location.pathname.includes('/signin') ||
    window.location.pathname.includes('/login') ||
    window.location.pathname === '/' && document.querySelector('input[type="password"]') ||
    document.querySelector('.signin_form') ||
    document.querySelector('[data-qa="signin_domain_input"]');
    
  if (isLoginPage) {
    log('User is on login page - not authenticated');
    chrome.runtime.sendMessage({
      type: 'SLACK_AUTH_FAILED',
      workspace: workspace
    });
  }
}

// Check authentication status on page load
setTimeout(checkIfLoggedIn, 1000);

function extractDataFromHeaders(headers) {
  const data = {
    workspace: extractWorkspace(),
    token: null,
    cookie: null,
    teamId: null,
    xId: null
  };
  
  // Try different token patterns
  if (headers.authorization) {
    const tokenMatch = headers.authorization.match(/Bearer\s+(xox[a-zA-Z]-[\w-]+)/);
    if (tokenMatch) {
      data.token = tokenMatch[1];
    }
  }
  
  // Look for token in cookie as well
  if (headers.cookie) {
    // Split cookies and find the Slack 'd' cookie
    const cookies = headers.cookie.split(/;\s*/);
    for (const cookie of cookies) {
      const [name, value] = cookie.split('=');
      
      // The Slack 'd' cookie contains the authentication token
      if (name === 'd' && value && value.startsWith('xox')) {
        data.cookie = `d=${value}`;
        // Also use this as token if we don't have one
        if (!data.token) {
          data.token = value;
        }
      }
      
      // Extract team ID
      if (name === 'team_id' && value) {
        data.teamId = value;
      }
    }
    
    // If we still don't have a proper d cookie, log all cookies for debugging
    if (!data.cookie || !data.cookie.includes('xox')) {
      log('Warning: No valid Slack d cookie found. All cookies:', headers.cookie.substring(0, 200) + '...');
    }
  }
  
  // Extract X-Slack headers
  Object.keys(headers).forEach(key => {
    if (key.startsWith('x-slack-')) {
      log(`Found Slack header: ${key}:`, headers[key]);
      if (key === 'x-slack-client-request-id') {
        data.xId = headers[key];
      }
    }
  });
  
  return data;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  log('Received message:', request.type);
  
  if (request.type === 'INTERCEPT_REQUEST') {
    pendingRequests.set(request.requestId, {
      url: request.url,
      timestamp: Date.now(),
      formToken: request.formToken
    });
    log('Intercepted request:', request.url);
    if (request.formToken) {
      log('Form token present:', request.formToken.substring(0, 20) + '...');
    }
  } else if (request.type === 'CAPTURE_HEADERS') {
    const pendingRequest = pendingRequests.get(request.requestId);
    if (pendingRequest) {
      log('Processing headers for:', request.url);
      const data = extractDataFromHeaders(request.headers);
      
      // Use form token if available and no token found in headers
      if (request.formToken) {
        log('Using form token:', request.formToken.substring(0, 20) + '...');
        data.token = request.formToken;
      }
      
      log('Extracted data:', data);
      
      if (data.token && data.workspace) {
        // Check if we've already captured data for this workspace recently
        const now = Date.now();
        const workspaceKey = `${data.workspace}_${data.token.substring(0, 10)}`;
        
        if (lastCapturedWorkspace === workspaceKey && (now - lastCaptureTime) < 5000) {
          log('Skipping duplicate capture for workspace:', data.workspace);
          pendingRequests.delete(request.requestId);
          return;
        }
        
        lastCapturedWorkspace = workspaceKey;
        lastCaptureTime = now;
        
        log('Sending data to background for workspace:', data.workspace);
        log('Full data being sent:', JSON.stringify(data));
        
        chrome.runtime.sendMessage({
          type: 'SLACK_DATA_CAPTURED',
          data: data
        }).then((response) => {
          log('Background response:', response);
          
          // Verify data was saved by checking storage
          chrome.storage.local.get('slackData', (result) => {
            log('Storage check after send - has data:', !!result.slackData);
            if (result.slackData) {
              log('Storage check - workspace:', Object.keys(result.slackData));
            }
          });
          
          // Only show notification on the emoji customization page
          const isEmojiPage = window.location.pathname.includes('/customize/emoji');
          
          if (response && response.showNotification && !hasShownNotification && isEmojiPage) {
            hasShownNotification = true;
            log('Showing notification on emoji page');
            // Add a small delay to batch multiple captures
            setTimeout(() => {
              showNotification('Custom Slack emoji data fetched successfully!');
            }, 500);
          } else {
            log('Not showing notification. Already shown:', hasShownNotification, 'Should show:', response?.showNotification, 'Is emoji page:', isEmojiPage);
          }
        }).catch(err => {
          log('Error sending data to background:', err);
        });
      } else if (data.workspace && !data.token) {
        log('Authentication failed - no token found');
        chrome.runtime.sendMessage({
          type: 'SLACK_AUTH_FAILED',
          workspace: data.workspace
        });
      } else {
        log('Missing required data. Token:', !!data.token, 'Workspace:', !!data.workspace);
      }
      
      pendingRequests.delete(request.requestId);
    }
  }
  
  return true; // Keep message channel open
});

function showNotification(message) {
  // Check if notification already exists
  const existingNotification = document.querySelector('.emoji-studio-notification');
  if (existingNotification) {
    existingNotification.remove();
  }
  
  const notification = document.createElement('div');
  notification.className = 'emoji-studio-notification';
  notification.innerHTML = `
    <div style="display: flex; align-items: center; gap: 12px;">
      <div style="display: flex; align-items: center;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 8px;">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span>${message}</span>
      </div>
      <button class="emoji-studio-sync-btn" style="
        background: rgba(255, 255, 255, 0.2);
        color: white;
        border: 1px solid rgba(255, 255, 255, 0.3);
        padding: 6px 12px;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        white-space: nowrap;
      ">
        Sync to Emoji Studio
      </button>
    </div>
  `;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #22c55e;
    color: white;
    padding: 12px 16px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(34, 197, 94, 0.25);
    z-index: 10000;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    font-weight: 500;
    animation: slideIn 0.3s ease-out;
  `;
  
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(100%); opacity: 0; }
    }
    .emoji-studio-sync-btn:hover {
      background: rgba(255, 255, 255, 0.3) !important;
      border-color: rgba(255, 255, 255, 0.4) !important;
      transform: translateY(-1px);
    }
  `;
  document.head.appendChild(style);
  
  document.body.appendChild(notification);
  
  // Add click handler for sync button
  const syncBtn = notification.querySelector('.emoji-studio-sync-btn');
  syncBtn.addEventListener('click', () => {
    log('Sync button clicked, sending message to background');
    chrome.runtime.sendMessage({ type: 'SYNC_TO_EMOJI_STUDIO' });
    // Remove notification immediately when clicked
    notification.style.animation = 'slideOut 0.3s ease-out forwards';
    setTimeout(() => notification.remove(), 300);
  });
  
  // Auto-hide after 5 seconds (increased from 2 seconds to give time to click)
  setTimeout(() => {
    if (notification.parentNode) {
      notification.style.animation = 'slideOut 0.3s ease-out forwards';
      setTimeout(() => notification.remove(), 300);
    }
  }, 5000);
}

// Clean up old pending requests
setInterval(() => {
  const now = Date.now();
  for (const [id, request] of pendingRequests.entries()) {
    if (now - request.timestamp > 30000) {
      pendingRequests.delete(id);
    }
  }
}, 10000);