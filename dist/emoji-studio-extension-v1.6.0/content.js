const pendingRequests = new Map();
let debugMode = false;
let lastCapturedWorkspace = null;
let lastCaptureTime = 0;
let hasShownNotification = false; // Track if we've shown a notification on this page

const shouldUseSafariFallbackCapture = (() => {
  if (typeof safari !== 'undefined' && safari.pushNotification) {
    return true;
  }
  const ua = navigator.userAgent || '';
  const vendor = navigator.vendor || '';
  const isSafariVendor = vendor.includes('Apple');
  const isSafariUA = /\bSafari\b/.test(ua) && !/\bChrome\b|\bCriOS\b|\bFxiOS\b|\bEdg\b|\bOPR\b/i.test(ua);
  return isSafariVendor && isSafariUA;
})();

const SAFARI_CAPTURE_ENDPOINTS = [
  '/api/emoji.adminList',
  '/api/emoji.list',
  '/api/emoji.add',
  '/api/emoji.remove',
  '/api/client.',
  '/api/users.',
  '/api/team.'
];

let safariFallbackInstalled = false;
let safariListenerAttached = false;
let lastSafariCaptureKey = null;
let lastSafariCaptureTime = 0;

function log(...args) {
  if (debugMode) {
  }
}


function extractWorkspace() {
  const match = window.location.hostname.match(/^([^.]+)\.slack\.com$/);
  return match ? match[1] : null;
}

function normalizeSlackToken(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }
  let token = value.trim();
  if (!token) {
    return null;
  }
  try {
    token = decodeURIComponent(token);
  } catch (error) {}
  if (!token.startsWith('xox')) {
    return null;
  }
  return token;
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

// Check if we're on the emoji customization page and show a prompt
function checkEmojiPage() {
  const isEmojiPage = window.location.pathname.includes('/customize/emoji');
  console.log('[Emoji Studio Extension] Page check - Is emoji page?', isEmojiPage, 'Path:', window.location.pathname);
  
  if (isEmojiPage && !hasShownNotification) {
    console.log('[Emoji Studio Extension] On emoji customization page, checking for data...');
    
    // Get the workspace from the URL
    const workspace = extractWorkspace();
    if (!workspace) {
      console.log('[Emoji Studio Extension] Could not extract workspace from URL');
      return;
    }
    
    // Ask background script to check if we have emoji data
    chrome.runtime.sendMessage({ 
      type: 'CHECK_EMOJI_PAGE', 
      workspace: workspace 
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[Emoji Studio Extension] Error checking data:', chrome.runtime.lastError);
        return;
      }
      
      console.log('[Emoji Studio Extension] Data check response:', response);
      
      if (response.hasEmojis && response.emojiCount > 0) {
        // We have emoji data - show green sync notification
        console.log('[Emoji Studio Extension] Found emoji data:', response.emojiCount, 'emojis');
        if (!hasShownNotification) {
          hasShownNotification = true;
          showNotification(`${response.emojiCount} emojis ready`);
        }
      } else if (response.hasData) {
        // We have auth but no emojis - might be fetching
        console.log('[Emoji Studio Extension] Have auth data but no emojis yet');
        // Wait a bit and check again
        setTimeout(() => {
          if (!hasShownNotification) {
            checkEmojiPage();
          }
        }, 2000);
      } else {
        // No data at all - show refresh prompt
        console.log('[Emoji Studio Extension] No data captured yet');
        if (!hasShownNotification) {
          hasShownNotification = true;
          showPromptNotification();
        }
      }
    });
  }
}

// Show a prompt to refresh the page to capture data
function showPromptNotification() {
  const existingNotification = document.querySelector('.emoji-studio-notification');
  if (existingNotification) {
    existingNotification.remove();
  }
  
  const notification = document.createElement('div');
  notification.className = 'emoji-studio-notification';
  notification.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px;">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M23 4v6h-6"></path>
        <path d="M1 20v-6h6"></path>
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
      </svg>
      <span style="font-size: 12px;">Fetch & sync emojis</span>
      <button class="emoji-studio-refresh-btn" style="
        background: rgba(255, 255, 255, 0.15);
        color: white;
        border: 1px solid rgba(255, 255, 255, 0.25);
        padding: 3px 8px;
        font-size: 10px;
        border-radius: 2px;
        cursor: pointer;
        transition: all 0.15s ease;
        margin-left: 4px;
        font-weight: 500;
        letter-spacing: 0.3px;
        text-transform: uppercase;
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
    font-size: 11px;
    line-height: 1.2;
    animation: slideIn 0.2s ease-out;
  `;
  
  document.body.appendChild(notification);
  
  // Add click handler for sync button
  const refreshBtn = notification.querySelector('.emoji-studio-refresh-btn');
  refreshBtn.addEventListener('click', () => {
    // Change button text to show loading
    refreshBtn.textContent = 'Loading...';
    refreshBtn.disabled = true;
    
    // Trigger a page refresh to capture auth data, then sync
    // First, set a flag that we want to auto-sync after refresh
    sessionStorage.setItem('emojiStudioAutoSync', 'true');
    window.location.reload();
  });
  
  // Auto-hide after 10 seconds
  setTimeout(() => {
    if (notification.parentNode) {
      notification.style.animation = 'slideOut 0.2s ease-out forwards';
      setTimeout(() => notification.remove(), 300);
    }
  }, 10000);
}

// Check if we should auto-sync after refresh
function checkAutoSync() {
  if (sessionStorage.getItem('emojiStudioAutoSync') === 'true') {
    console.log('[Emoji Studio Extension] Auto-sync flag detected, waiting for data capture...');
    sessionStorage.removeItem('emojiStudioAutoSync');
    
    // Show a loading notification
    const notification = document.createElement('div');
    notification.className = 'emoji-studio-notification';
    notification.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M12 2v4m0 12v4m-8-8h4m12 0h4" stroke-linecap="round" style="animation: spin 1s linear infinite; transform-origin: center;"></path>
        </svg>
        <span style="font-size: 12px;">Fetching emojis...</span>
      </div>
    `;
    notification.style.cssText = `
      position: fixed;
      top: 16px;
      right: 16px;
      background: #0284c7;
      color: white;
      padding: 6px 10px;
      border-radius: 4px;
      box-shadow: 0 1px 4px rgba(2, 132, 199, 0.15);
      z-index: 10000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 11px;
      line-height: 1.2;
      animation: slideIn 0.2s ease-out;
    `;
    
    // Add spinning animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(notification);
    
    // Wait a bit for data to be captured, then trigger sync
    setTimeout(() => {
      console.log('[Emoji Studio Extension] Auto-triggering sync...');
      chrome.runtime.sendMessage({ type: 'SYNC_TO_EMOJI_STUDIO_AND_OPEN' });
      
      // Update notification
      notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span style="font-size: 12px;">Syncing emojis...</span>
        </div>
      `;
      notification.style.background = '#15803d';
      
      // Remove notification after a moment
      setTimeout(() => notification.remove(), 2000);
    }, 3000); // Wait 3 seconds for auth capture
  }
}

// Check on page load and when URL changes
checkAutoSync();
checkEmojiPage();

// Also check when the URL changes (for SPAs)
let lastUrl = window.location.href;
setInterval(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    hasShownNotification = false; // Reset for new page
    checkEmojiPage();
  }
}, 1000);

function extractDataFromHeaders(headers, url) {
  const data = {
    workspace: extractWorkspace(),
    token: null,
    cookie: null,
    teamId: null,
    xId: null,
    authHeaders: headers // Store the full headers object
  };
  
  // Try different token patterns
  if (headers.authorization) {
    const tokenMatch = headers.authorization.match(/Bearer\s+(xox[a-zA-Z]-[\w-]+)/);
    if (tokenMatch) {
      data.token = tokenMatch[1];
    }
  }
  
  // Store the full cookie header
  if (headers.cookie) {
    data.cookie = headers.cookie;
    
    // Also try to extract token from cookies
    const cookies = headers.cookie.split(/;\s*/);
    for (const cookie of cookies) {
      const [name, value] = cookie.split('=');
      
      // The Slack 'd' cookie contains the authentication token
      if (name === 'd' && value) {
        console.log('Found d cookie:', value.substring(0, 20) + '...');
        // The d cookie value might be the token itself
        if (value.startsWith('xox')) {
          console.log('d cookie starts with xox');
          if (!data.token) {
            data.token = value;
          }
        } else {
          // Try to decode if URL encoded
          try {
            const decodedValue = decodeURIComponent(value);
            console.log('Decoded d cookie:', decodedValue.substring(0, 20) + '...');
            if (decodedValue.startsWith('xox')) {
              console.log('Decoded d cookie is a token!');
              if (!data.token) {
                data.token = decodedValue;
              }
            }
          } catch (e) {
            console.log('Failed to decode d cookie:', e);
          }
        }
      }
      
      // Extract team ID
      if (name === 'team_id' && value) {
        data.teamId = value;
      }
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
  
  // Also try to extract xId from request URL if not found in headers
  if (!data.xId && url) {
    const xIdMatch = url.match(/_x_id=([^&]+)/);
    if (xIdMatch) {
      data.xId = xIdMatch[1];
    }
  }
  
  return data;
}

function installSafariTokenCapture() {
  if (safariFallbackInstalled) {
    return;
  }
  safariFallbackInstalled = true;

  function safariCaptureBootstrap(endpoints) {
    if (window.__emojiStudioSafariCaptureInstalled) {
      return;
    }
    window.__emojiStudioSafariCaptureInstalled = true;

    const interestingEndpoints = Array.isArray(endpoints) ? endpoints : [];

    const shouldInspect = (url) => {
      if (!url || typeof url !== 'string') {
        return false;
      }
      return interestingEndpoints.some((endpoint) => url.includes(endpoint));
    };

    const normalizeToken = (value) => {
      if (!value || typeof value !== 'string') {
        return null;
      }
      let token = value.trim();
      if (!token) {
        return null;
      }
      try {
        token = decodeURIComponent(token);
      } catch (error) {}
      return token.startsWith('xox') ? token : null;
    };

    const recordEntry = (params, tokens, key, value) => {
      if (!key) {
        return;
      }
      let stringValue = null;
      if (typeof value === 'string') {
        stringValue = value;
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        stringValue = String(value);
      } else if (value && typeof value === 'object') {
        if (typeof Blob !== 'undefined' && value instanceof Blob) {
          return;
        }
        if (typeof value.toString === 'function') {
          stringValue = value.toString();
        }
      }
      if (!stringValue) {
        return;
      }
      if (!(key in params)) {
        params[key] = stringValue;
      }
      const normalized = normalizeToken(stringValue);
      if (normalized) {
        tokens.push(normalized);
      }
    };

    const parseBody = (body) => {
      const params = {};
      const tokens = [];

      if (!body) {
        return { params, tokens };
      }

      if (typeof FormData !== 'undefined' && body instanceof FormData) {
        for (const [key, value] of body.entries()) {
          recordEntry(params, tokens, key, value);
        }
        return { params, tokens };
      }

      if (body instanceof URLSearchParams) {
        for (const [key, value] of body.entries()) {
          recordEntry(params, tokens, key, value);
        }
        return { params, tokens };
      }

      if (typeof body === 'string') {
        let parsed = false;
        try {
          const search = new URLSearchParams(body);
          for (const [key, value] of search.entries()) {
            parsed = true;
            recordEntry(params, tokens, key, value);
          }
        } catch (error) {}
        if (!parsed) {
          try {
            const json = JSON.parse(body);
            if (json && typeof json === 'object') {
              Object.keys(json).forEach((key) => {
                recordEntry(params, tokens, key, json[key]);
              });
              parsed = true;
            }
          } catch (error) {}
        }
        if (!parsed) {
          recordEntry(params, tokens, 'raw_body', body);
        }
        return { params, tokens };
      }

      if (typeof body === 'object') {
        try {
          Object.keys(body).forEach((key) => {
            recordEntry(params, tokens, key, body[key]);
          });
        } catch (error) {}
      }

      return { params, tokens };
    };

    const recentlyNotified = new Map();

    const notifyCapture = (url, parsed) => {
      if (!parsed) {
        return;
      }
      const tokens = (parsed.tokens || []).map(normalizeToken).filter(Boolean);
      if (!tokens.length) {
        return;
      }
      const primaryToken = tokens.find((token) => token.startsWith('xoxc')) || tokens[0];
      if (!primaryToken) {
        return;
      }
      const key = `${primaryToken}::${url}`;
      const now = Date.now();
      const last = recentlyNotified.get(key);
      if (last && (now - last) < 500) {
        return;
      }
      recentlyNotified.set(key, now);

      window.postMessage({
        type: 'SLACK_TOKEN_CAPTURED',
        token: primaryToken,
        url: url,
        params: parsed.params || {}
      }, '*');
    };

    if (typeof window.fetch === 'function') {
      const originalFetch = window.fetch;
      window.fetch = function(input, init) {
        try {
          const requestInfo = (input && typeof input === 'object' && 'url' in input) ? input.url : input;
          const url = typeof requestInfo === 'string' ? requestInfo : (requestInfo ? String(requestInfo) : '');
          const method = (init && init.method) || (input && typeof input === 'object' && input.method) || 'GET';

          if (shouldInspect(url) && method && method.toUpperCase() === 'POST') {
            let parsed = null;

            if (init && init.body) {
              parsed = parseBody(init.body);
              if (parsed.tokens.length) {
                notifyCapture(url, parsed);
              }
            }

            if ((!parsed || !parsed.tokens.length) && typeof Request !== 'undefined' && input instanceof Request) {
              try {
                const clone = input.clone();
                clone.text().then((text) => {
                  const clonedParsed = parseBody(text);
                  if (clonedParsed.tokens.length) {
                    notifyCapture(url, clonedParsed);
                  }
                }).catch(() => {});
              } catch (error) {}
            }
          }
        } catch (error) {
          console.error('[Emoji Studio] Safari fetch fallback error', error);
        }
        return originalFetch.apply(this, arguments);
      };
    }

    if (typeof XMLHttpRequest !== 'undefined') {
      const originalOpen = XMLHttpRequest.prototype.open;
      const originalSend = XMLHttpRequest.prototype.send;

      XMLHttpRequest.prototype.open = function(method, url) {
        this.__emojiStudioInfo = { method, url };
        return originalOpen.apply(this, arguments);
      };

      XMLHttpRequest.prototype.send = function(body) {
        try {
          const info = this.__emojiStudioInfo || {};
          if (info.url && shouldInspect(info.url) && (!info.method || info.method.toUpperCase() === 'POST')) {
            const parsed = parseBody(body);
            if (parsed.tokens.length) {
              notifyCapture(info.url, parsed);
            }
          }
        } catch (error) {
          console.error('[Emoji Studio] Safari xhr fallback error', error);
        }
        return originalSend.apply(this, arguments);
      };
    }
  }

  const script = document.createElement('script');
  script.setAttribute('data-emoji-studio', 'safari-fallback');
  script.textContent = `(${safariCaptureBootstrap.toString()})(${JSON.stringify(SAFARI_CAPTURE_ENDPOINTS)});`;
  (document.head || document.documentElement).appendChild(script);
  script.remove();
}

function handleSafariTokenMessage(event) {
  if (!shouldUseSafariFallbackCapture) {
    return;
  }
  if (event.source !== window) {
    return;
  }

  const data = event.data;
  if (!data || data.type !== 'SLACK_TOKEN_CAPTURED') {
    return;
  }

  const workspace = extractWorkspace();
  if (!workspace) {
    return;
  }

  const params = data.params || {};
  const tokens = new Set();
  const addToken = (candidate) => {
    const normalized = normalizeSlackToken(candidate);
    if (normalized) {
      tokens.add(normalized);
    }
  };

  addToken(data.token);
  Object.values(params).forEach(addToken);

  if (tokens.size === 0) {
    return;
  }

  let primaryToken = null;
  let formToken = null;
  for (const token of tokens) {
    if (!primaryToken) {
      primaryToken = token;
    }
    if (!formToken && token.startsWith('xoxc')) {
      formToken = token;
    }
  }
  if (formToken) {
    primaryToken = formToken;
  }

  if (!primaryToken) {
    return;
  }

  const cookie = document.cookie || '';
  let teamId = params.team_id || params.team || null;
  if (!teamId && cookie) {
    const teamIdMatch = cookie.match(/team_id=([^;]+)/);
    if (teamIdMatch) {
      teamId = teamIdMatch[1];
    }
  }

  let xId = params._x_id || params.x_id || null;
  if (!xId && data.url) {
    const xIdMatch = data.url.match(/_x_id=([^&]+)/);
    if (xIdMatch) {
      xId = xIdMatch[1];
    }
  }

  const slackRoute = params.slack_route || teamId || null;

  const authData = {
    workspace,
    token: primaryToken,
    cookie,
    teamId,
    xId,
    formToken: formToken || (primaryToken.startsWith('xoxc') ? primaryToken : null),
    capturedFromAPI: true,
    requestUrl: data.url || null,
    slackRoute,
    fallbackSource: 'safari-injected'
  };

  const workspaceKey = `${workspace}_${primaryToken.substring(0, 10)}`;
  const now = Date.now();
  if (lastSafariCaptureKey === workspaceKey && (now - lastSafariCaptureTime) < 3000) {
    return;
  }
  lastSafariCaptureKey = workspaceKey;
  lastSafariCaptureTime = now;
  lastCapturedWorkspace = workspaceKey;
  lastCaptureTime = now;

  try {
    chrome.runtime.sendMessage({
      type: 'SLACK_DATA_CAPTURED',
      data: authData
    });
  } catch (error) {
    console.error('[Emoji Studio] Failed to send Safari capture', error);
  }
}

if (shouldUseSafariFallbackCapture && !safariListenerAttached) {
  installSafariTokenCapture();
  window.addEventListener('message', handleSafariTokenMessage, false);
  safariListenerAttached = true;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  
  if (request.type === 'INTERCEPT_REQUEST') {
    pendingRequests.set(request.requestId, {
      url: request.url,
      timestamp: Date.now(),
      formToken: request.formToken
    });
    if (request.formToken) {
      console.log('Stored pending request with form token:', request.formToken.substring(0, 15) + '...');
    }
  } else if (request.type === 'CAPTURE_HEADERS') {
    const pendingRequest = pendingRequests.get(request.requestId);
    if (pendingRequest) {
      const data = extractDataFromHeaders(request.headers, request.url);
      
      // Store form token separately and use it if no other token found
      if (request.formToken) {
        console.log('Processing form token:', request.formToken.substring(0, 15) + '...');
        // Try to decode the form token if it's URL encoded
        let decodedFormToken = request.formToken;
        try {
          decodedFormToken = decodeURIComponent(request.formToken);
        } catch (e) {
          // Use original if decoding fails
        }
        
        data.formToken = decodedFormToken;
        if (!data.token) {
          console.log('Using form token as main token');
          data.token = decodedFormToken;
        }
      } else if (pendingRequest.formToken) {
        // Check if form token was stored in pending request
        console.log('Using form token from pending request:', pendingRequest.formToken.substring(0, 15) + '...');
        data.formToken = pendingRequest.formToken;
        if (!data.token) {
          data.token = pendingRequest.formToken;
        }
      }
      
      
      // Log what we captured for debugging
      console.log('Captured Slack data:', {
        workspace: data.workspace,
        hasToken: !!data.token,
        tokenType: data.token ? data.token.substring(0, 4) : 'none',
        hasCookie: !!data.cookie,
        hasFormToken: !!data.formToken,
        formTokenType: data.formToken ? data.formToken.substring(0, 4) : 'none'
      });
      
      // Always prefer formToken over cookie token
      if (data.formToken && data.formToken.startsWith('xoxc')) {
        console.log('Using formToken as primary token');
        data.token = data.formToken;
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
    chrome.runtime.sendMessage({ type: 'SYNC_TO_EMOJI_STUDIO_AND_OPEN' });
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