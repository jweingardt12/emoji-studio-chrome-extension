const pendingRequests = new Map();
let debugMode = false;
let lastCapturedWorkspace = null;
let lastCaptureTime = 0;
let hasShownNotification = false; // Track if we've shown a notification on this page

function log(...args) {
  if (debugMode) {
  }
}


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
    }
  }
  
  // Extract X-Slack headers
  Object.keys(headers).forEach(key => {
    if (key.startsWith('x-slack-')) {
      if (key === 'x-slack-client-request-id') {
        data.xId = headers[key];
      }
    }
  });
  
  return data;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  
  if (request.type === 'INTERCEPT_REQUEST') {
    pendingRequests.set(request.requestId, {
      url: request.url,
      timestamp: Date.now(),
      formToken: request.formToken
    });
    if (request.formToken) {
    }
  } else if (request.type === 'CAPTURE_HEADERS') {
    const pendingRequest = pendingRequests.get(request.requestId);
    if (pendingRequest) {
      const data = extractDataFromHeaders(request.headers);
      
      // Use form token if available and no token found in headers
      if (request.formToken) {
        data.token = request.formToken;
      }
      
      
      if (data.token && data.workspace) {
        // Check if we've already captured data for this workspace recently
        const now = Date.now();
        const workspaceKey = `${data.workspace}_${data.token.substring(0, 10)}`;
        
        if (lastCapturedWorkspace === workspaceKey && (now - lastCaptureTime) < 5000) {
          pendingRequests.delete(request.requestId);
          return;
        }
        
        lastCapturedWorkspace = workspaceKey;
        lastCaptureTime = now;
        
        
        chrome.runtime.sendMessage({
          type: 'SLACK_DATA_CAPTURED',
          data: data
        }).then((response) => {
          
          // Verify data was saved by checking storage
          chrome.storage.local.get('slackData', (result) => {
            if (result.slackData) {
            }
          });
          
          // Only show notification on the emoji customization page
          const isEmojiPage = window.location.pathname.includes('/customize/emoji');
          
          if (response && response.showNotification && !hasShownNotification && isEmojiPage) {
            hasShownNotification = true;
            // Add a small delay to batch multiple captures
            setTimeout(() => {
              showNotification('Emoji data captured');
            }, 500);
          } else {
          }
        }).catch(err => {
        });
      } else if (data.workspace && !data.token) {
        chrome.runtime.sendMessage({
          type: 'SLACK_AUTH_FAILED',
          workspace: data.workspace
        });
      } else {
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
    <div style="display: flex; align-items: center; gap: 8px;">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      <span style="font-size: 12px;">Emoji data captured</span>
      <button class="emoji-studio-sync-btn" style="
        background: rgba(255, 255, 255, 0.15);
        color: white;
        border: 1px solid rgba(255, 255, 255, 0.25);
        padding: 3px 8px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 450;
        cursor: pointer;
        transition: all 0.15s ease;
        white-space: nowrap;
        margin-left: 2px;
      ">
        Sync
      </button>
    </div>
  `;
  notification.style.cssText = `
    position: fixed;
    top: 16px;
    right: 16px;
    background: #15803d;
    color: white;
    padding: 6px 10px;
    border-radius: 4px;
    box-shadow: 0 1px 4px rgba(21, 128, 61, 0.15);
    z-index: 10000;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 12px;
    font-weight: 450;
    animation: slideIn 0.15s ease-out;
  `;
  
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(15px); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(15px); opacity: 0; }
    }
    .emoji-studio-sync-btn:hover {
      background: rgba(255, 255, 255, 0.25) !important;
      border-color: rgba(255, 255, 255, 0.35) !important;
    }
  `;
  document.head.appendChild(style);
  
  document.body.appendChild(notification);
  
  // Add click handler for sync button
  const syncBtn = notification.querySelector('.emoji-studio-sync-btn');
  syncBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'SYNC_TO_EMOJI_STUDIO' });
    // Remove notification immediately when clicked
    notification.style.animation = 'slideOut 0.15s ease-out forwards';
    setTimeout(() => notification.remove(), 200);
  });
  
  // Auto-hide after 5 seconds (increased from 2 seconds to give time to click)
  setTimeout(() => {
    if (notification.parentNode) {
      notification.style.animation = 'slideOut 0.2s ease-out forwards';
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