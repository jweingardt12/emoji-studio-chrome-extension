let capturedData = {};
let pendingRequestData = new Map();
let lastNotificationTime = {}; // Track last notification time per workspace
let emojiCart = []; // Cart to store emojis before adding to Emoji Studio

// Function to broadcast messages to all Emoji Studio tabs
async function broadcastToEmojiStudioTabs(message) {
  try {
    console.log('[broadcastToEmojiStudioTabs] Broadcasting message:', message.type);
    const tabs = await chrome.tabs.query({
      url: ['https://app.emojistudio.xyz/*', 'https://emojistudio.xyz/*']
    });
    
    console.log('[broadcastToEmojiStudioTabs] Found', tabs.length, 'Emoji Studio tabs');
    
    for (const tab of tabs) {
      try {
        console.log(`[broadcastToEmojiStudioTabs] Sending ${message.type} to tab ${tab.id}`);
        await chrome.tabs.sendMessage(tab.id, message);
      } catch (error) {
        // Tab might not have content script loaded, ignore
        console.log(`Could not send message to tab ${tab.id}:`, error.message);
      }
    }
  } catch (error) {
    console.error('Failed to broadcast to Emoji Studio tabs:', error);
  }
}

// Environment configuration
const EMOJI_STUDIO_URLS = {
  development: 'http://localhost:3002',
  production: 'https://app.emojistudio.xyz'
};

// Force production mode - set this to true to always use production URLs
const FORCE_PRODUCTION = true; // Set to true for production release

// Set environment based on FORCE_PRODUCTION flag
let currentEnvironment = FORCE_PRODUCTION ? 'production' : 'development';

function getEmojiStudioUrl(path = '') {
  const baseUrl = EMOJI_STUDIO_URLS[currentEnvironment];
  return path ? `${baseUrl}${path}` : baseUrl;
}

// Service workers in Manifest V3 should be allowed to go idle
// The browser will wake them up when needed for events

// Simple parseSlackCurl function to extract auth data from curl command
function parseSlackCurl(curlCommand) {
  if (!curlCommand) {
    return { isValid: false };
  }
  
  const result = {
    isValid: false,
    token: null,
    cookie: null,
    workspace: null,
    teamId: null,
    xId: null
  };
  
  // Extract workspace
  const workspaceMatch = curlCommand.match(/https:\/\/([^.]+)\.slack\.com/);
  if (workspaceMatch) {
    result.workspace = workspaceMatch[1];
  }
  
  // Extract token
  const tokenMatch = curlCommand.match(/token=([^\s'"&]+)/) || 
                     curlCommand.match(/Bearer\s+([^\s'"]+)/);
  if (tokenMatch) {
    result.token = tokenMatch[1];
  }
  
  // Extract cookie
  const cookieMatch = curlCommand.match(/-H\s+['"]Cookie:\s*([^'"]+)['"]/);
  if (cookieMatch) {
    result.cookie = cookieMatch[1];
  }
  
  // Extract team ID
  const teamIdMatch = curlCommand.match(/slack_route=([^&\s'"]+)/);
  if (teamIdMatch) {
    result.teamId = teamIdMatch[1];
  }
  
  // Extract x_id
  const xIdMatch = curlCommand.match(/_x_id=([^&\s'"]+)/);
  if (xIdMatch) {
    result.xId = xIdMatch[1];
  }
  
  // Validate
  result.isValid = !!(result.token && result.cookie && result.workspace);
  
  return result;
}

// Function to update badge based on cart contents
function updateCartBadge() {
  if (emojiCart.length > 0) {
    chrome.action.setBadgeText({ text: String(emojiCart.length) });
    chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' }); // Orange for cart items
  } else if (Object.keys(capturedData).length > 0) {
    chrome.action.setBadgeText({ text: '✓' });
    chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// Initialize the extension and set up alarms
chrome.runtime.onInstalled.addListener(() => {
  
  // Set up alarm for auto-sync every hour
  chrome.alarms.create('autoSync', {
    periodInMinutes: 60, // 1 hour
    delayInMinutes: 1 // Start checking after 1 minute
  });
  
  // Load existing data from storage
  chrome.storage.local.get(['slackData', 'emojiCart', 'syncSettings'], (result) => {
    if (result.slackData) {
      capturedData = result.slackData;
    }
    if (result.emojiCart) {
      emojiCart = result.emojiCart;
    }
    // Initialize sync settings if not present
    if (!result.syncSettings) {
      chrome.storage.local.set({
        syncSettings: {
          autoSyncEnabled: true,
          syncIntervalMinutes: 60,
          lastSyncAttempt: null,
          lastSuccessfulSync: null,
          syncState: 'idle' // idle, syncing, success, error
        }
      });
    }
  });
  
  // Create context menu for images, gifs, and videos
  chrome.contextMenus.create({
    id: 'createSlackEmoji',
    title: 'Create Slack emoji',
    contexts: ['image', 'video', 'audio'], // Added audio for completeness
    documentUrlPatterns: ['http://*/*', 'https://*/*']
  });
  
  // Also check immediately
  checkAndAutoSync();
});

// Also load data on startup (not just on install)
chrome.storage.local.get(['slackData', 'emojiCart', 'slackCurlCommand', 'syncSettings'], (result) => {
  console.log('Loading data on startup:', result);
  if (result.slackData) {
    capturedData = result.slackData;
    
    // Update badge if we have data
    if (Object.keys(capturedData).length > 0) {
      chrome.action.setBadgeText({ text: '✓' });
      chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
    }
  }
  if (result.slackCurlCommand) {
    console.log('Found stored curl command');
  }
  if (result.emojiCart) {
    emojiCart = result.emojiCart;
    console.log('Loaded cart with', emojiCart.length, 'items');
    updateCartBadge();
  } else {
    emojiCart = [];
    console.log('No cart found, initialized empty cart');
  }
  
  // Check sync settings and possibly recreate alarm with correct interval
  if (result.syncSettings && result.syncSettings.autoSyncEnabled) {
    const intervalMinutes = result.syncSettings.syncIntervalMinutes || 60;
    // Clear existing alarm and recreate with correct interval
    chrome.alarms.clear('autoSync', () => {
      chrome.alarms.create('autoSync', {
        periodInMinutes: intervalMinutes,
        delayInMinutes: 1
      });
    });
    
    // Check if we need to sync on startup
    const lastSync = result.syncSettings.lastSuccessfulSync;
    if (lastSync) {
      const timeSinceSync = Date.now() - lastSync;
      const intervalMs = intervalMinutes * 60 * 1000;
      if (timeSinceSync >= intervalMs) {
        console.log('Time for auto-sync on startup');
        setTimeout(() => checkAndAutoSync(), 5000); // Delay 5 seconds to let everything initialize
      }
    }
  }
});

// Handle alarm events
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'autoSync') {
    console.log('Auto-sync alarm triggered');
    
    // Check if auto-sync is enabled
    const { syncSettings } = await chrome.storage.local.get('syncSettings');
    if (syncSettings && syncSettings.autoSyncEnabled) {
      await checkAndAutoSync();
    }
  }
});


// Function to fetch fresh emoji data directly from Slack
async function fetchFreshEmojiData(workspace, workspaceData) {
  try {
    console.log('Fetching fresh emoji data from Slack...');
    
    // Build the API URL
    const apiUrl = `https://${workspace}.slack.com/api/emoji.adminList`;
    
    // Prepare the request body - get ALL emojis
    const params = new URLSearchParams({
      token: workspaceData.token || workspaceData.formToken,
      count: 100000  // Set very high to get all emojis
    });
    
    // Make the API request
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'Origin': `https://${workspace}.slack.com`,
        'Referer': `https://${workspace}.slack.com/customize/emoji`,
        'Cookie': workspaceData.cookie || ''
      },
      body: params.toString()
    });
    
    if (!response.ok) {
      console.error(`HTTP error! status: ${response.status}, statusText: ${response.statusText}`);
      const errorText = await response.text();
      console.error('Response body:', errorText);
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Slack API response:', data);
    
    if (data.ok) {
      // Update the captured data with fresh emoji list
      const freshData = {
        ...workspaceData,
        emoji: data.emoji || [],
        emojiCount: (data.emoji || []).length,
        lastFetchTime: new Date().toISOString()
      };
      
      // Store the fresh data
      capturedData[workspace] = freshData;
      await chrome.storage.local.set({ 
        slackData: capturedData,
        lastFetchTime: Date.now()
      });
      
      console.log(`Fetched ${freshData.emojiCount} emojis from Slack`);
      
      // Notify popup that data was updated
      chrome.runtime.sendMessage({ type: 'DATA_UPDATED' }).catch(() => {});
      
      return { 
        success: true, 
        data: freshData,
        emojiCount: freshData.emojiCount,
        message: `Fetched ${freshData.emojiCount} emojis` 
      };
    } else {
      console.error('Slack API returned ok: false', data);
      throw new Error(data.error || 'Failed to fetch emoji data');
    }
  } catch (error) {
    console.error('Failed to fetch fresh emoji data:', error);
    
    // If token expired, we might need to re-authenticate
    if (error.message && (error.message.includes('invalid_auth') || error.message.includes('not_authed'))) {
      return { 
        success: false, 
        error: 'Authentication expired. Please visit Slack emoji page to re-authenticate.',
        needsReauth: true 
      };
    }
    
    return { 
      success: false, 
      error: error.message || 'Failed to fetch data' 
    };
  }
}

// Function to sync data to Emoji Studio using Chrome Storage
async function syncToEmojiStudio(isAutoSync = false) {
  console.log('[syncToEmojiStudio] Starting sync, capturedData keys:', Object.keys(capturedData));
  console.log('[syncToEmojiStudio] isAutoSync:', isAutoSync);
  
  if (Object.keys(capturedData).length === 0) {
    console.error('[syncToEmojiStudio] No captured data available for sync');
    
    // Broadcast error to tabs so loading overlay can be dismissed
    broadcastToEmojiStudioTabs({ 
      type: 'SYNC_ERROR', 
      workspace: 'unknown',
      error: 'No data to sync. Please visit a Slack emoji page first.',
      timestamp: Date.now() 
    });
    
    return { success: false, error: 'No data to sync' };
  }
  
  const now = Date.now();
  const workspace = Object.keys(capturedData)[0];
  const dataToSend = capturedData[workspace];
  
  console.log('[syncToEmojiStudio] Syncing workspace:', workspace);
  console.log('[syncToEmojiStudio] Data to send emoji count:', dataToSend.emojiCount);
  console.log('[syncToEmojiStudio] Data to send emoji array length:', (dataToSend.emoji || []).length);
  
  // Broadcast sync start to all tabs
  broadcastToEmojiStudioTabs({ 
    type: 'SYNC_STARTED', 
    workspace: workspace,
    timestamp: now 
  });
  
  // Update sync state
  await updateSyncState('syncing', now);
  
  try {
    // If we don't have emoji data, try to fetch it fresh
    if (!dataToSend.emoji || dataToSend.emoji.length === 0 || !dataToSend.emojiCount) {
      console.log('[syncToEmojiStudio] No emoji data found, fetching fresh data from Slack...');
      
      const freshDataResult = await fetchFreshEmojiData(workspace, dataToSend);
      if (freshDataResult.success && freshDataResult.data) {
        console.log('[syncToEmojiStudio] Successfully fetched fresh data:', freshDataResult.data.emojiCount, 'emojis');
        // Update the capturedData with fresh data
        capturedData[workspace] = freshDataResult.data;
        // Update dataToSend reference
        Object.assign(dataToSend, freshDataResult.data);
      } else {
        console.warn('[syncToEmojiStudio] Failed to fetch fresh data:', freshDataResult.error);
        // Continue with existing data even if empty
      }
    }
    // Store emoji data in Chrome storage for Emoji Studio to read
    const emojiData = {
      workspace: workspace,
      emojiData: dataToSend.emoji || [],
      emojiCount: dataToSend.emojiCount || 0,
      lastFetchTime: dataToSend.lastFetchTime || new Date().toISOString(),
      lastSyncTime: now,
      token: dataToSend.token || dataToSend.formToken || null,
      cookie: dataToSend.cookie || null,
      version: '1.3.0'
    };
    
    // Chrome storage.local has a 5MB limit which should be enough
    // Store the complete data
    await chrome.storage.local.set({
      emojiStudioSyncData: emojiData,
      emojiStudioSyncMeta: {
        workspace: workspace,
        lastSync: now,
        emojiCount: dataToSend.emojiCount || 0,
        hasData: true
      }
    });
    
    console.log('Data synced to Chrome storage successfully');
    chrome.storage.local.set({ lastSyncTime: now });
    
    // Update sync state to success
    await updateSyncState('success', now, now);
    
    // Calculate non-alias emoji count for consistent display
    const nonAliasCount = (dataToSend.emoji || []).filter(emoji => !emoji.is_alias).length;
    
    // Broadcast sync completion to all tabs
    console.log('[syncToEmojiStudio] Broadcasting sync completion with total:', dataToSend.emojiCount || 0, 'non-alias:', nonAliasCount);
    broadcastToEmojiStudioTabs({ 
      type: 'SYNC_COMPLETED', 
      workspace: workspace,
      emojiCount: dataToSend.emojiCount || 0,
      nonAliasCount: nonAliasCount,
      timestamp: now 
    });
    
    // Show success notification only for manual syncs
    if (!isAutoSync) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'Emoji Studio Sync',
        message: `Successfully synced ${nonAliasCount} emojis!`
      });
    }
    
    // Send message to any open Emoji Studio tabs to notify them of new data
    const emojiStudioUrls = [
      'https://app.emojistudio.xyz/*',
      'https://emojistudio.xyz/*',
      'http://localhost:3002/*',
      'http://localhost:3000/*'
    ];
    
    for (const pattern of emojiStudioUrls) {
      chrome.tabs.query({ url: pattern }, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, {
            type: 'EMOJI_DATA_SYNCED',
            workspace: workspace,
            emojiCount: dataToSend.emojiCount || 0
          }).catch(() => {
            // Tab might not have content script, that's ok
          });
        });
      });
    }
    
    return { success: true };
  } catch (error) {
    console.error('Failed to sync to Chrome storage:', error);
    await updateSyncState('error', now);
    
    // Broadcast sync error to all tabs
    broadcastToEmojiStudioTabs({ 
      type: 'SYNC_ERROR', 
      workspace: workspace || 'unknown',
      error: error.message,
      timestamp: now 
    });
    
    return { success: false, error: error.message };
  }
  
  // No longer need API or tab-based sync - Chrome storage is always available
}

// Function to update sync state in storage
async function updateSyncState(state, lastAttempt = null, lastSuccess = null) {
  const { syncSettings } = await chrome.storage.local.get('syncSettings');
  const updatedSettings = {
    ...syncSettings,
    syncState: state
  };
  
  if (lastAttempt !== null) {
    updatedSettings.lastSyncAttempt = lastAttempt;
  }
  
  if (lastSuccess !== null) {
    updatedSettings.lastSuccessfulSync = lastSuccess;
  }
  
  await chrome.storage.local.set({ syncSettings: updatedSettings });
  
  // Notify popup if it's open
  chrome.runtime.sendMessage({ 
    type: 'SYNC_STATE_UPDATED', 
    syncSettings: updatedSettings 
  }).catch(() => {});
}

// Function to perform auto-sync
async function checkAndAutoSync() {
  console.log('Checking for auto-sync...');
  
  // Load fresh data from storage
  const result = await chrome.storage.local.get(['slackData', 'syncSettings', 'lastSyncTime']);
  
  if (result.slackData) {
    capturedData = result.slackData;
  }
  
  // Check if we have data to sync
  if (!capturedData || Object.keys(capturedData).length === 0) {
    console.log('No data to auto-sync');
    return;
  }
  
  const syncSettings = result.syncSettings || {
    autoSyncEnabled: true,
    syncIntervalMinutes: 60
  };
  
  if (!syncSettings.autoSyncEnabled) {
    console.log('Auto-sync is disabled');
    return;
  }
  
  const lastSyncTime = syncSettings.lastSuccessfulSync || result.lastSyncTime;
  const now = Date.now();
  const intervalMs = (syncSettings.syncIntervalMinutes || 60) * 60 * 1000;
  
  // Check if enough time has passed since last sync
  if (lastSyncTime && (now - lastSyncTime) < intervalMs) {
    console.log(`Not time for sync yet. Last sync: ${new Date(lastSyncTime).toISOString()}, Interval: ${syncSettings.syncIntervalMinutes} minutes`);
    return;
  }
  
  console.log('Performing auto-sync...');
  const result_sync = await syncToEmojiStudio(true);
  
  if (result_sync.success) {
    console.log('Auto-sync completed successfully');
  } else {
    console.log('Auto-sync failed:', result_sync.error);
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Validate message structure
  if (!request || typeof request.type !== 'string') {
    console.warn('Invalid message received:', request);
    sendResponse({ success: false, error: 'Invalid message format' });
    return false;
  }
  
  console.log('Background received message:', request.type);
  
  if (request.type === 'SLACK_DATA_CAPTURED') {
    const workspace = request.data.workspace;
    
    
    // Replace all existing data with this single workspace
    capturedData = {};
    capturedData[workspace] = request.data;
    
    // Also store a curl command that can be reused later
    const authData = request.data;
    console.log('Attempting to store curl command. Auth data:', {
      hasToken: !!authData.token,
      tokenType: authData.token ? authData.token.substring(0, 10) + '...' : 'none',
      hasFormToken: !!authData.formToken,
      formTokenType: authData.formToken ? authData.formToken.substring(0, 10) + '...' : 'none',
      hasCookie: !!authData.cookie,
      workspace: authData.workspace
    });
    
    // Prefer formToken (xoxc) over cookie token (xoxd)
    const token = authData.formToken || authData.token;
    console.log('Choosing token:', {
      formToken: authData.formToken ? authData.formToken.substring(0, 15) + '...' : 'none',
      cookieToken: authData.token ? authData.token.substring(0, 15) + '...' : 'none',
      chosen: token ? token.substring(0, 15) + '...' : 'none'
    });
    
    if (token && authData.cookie && authData.workspace) {
      const xId = authData.xId || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const teamId = authData.teamId || '';
      
      // Construct curl command exactly like Emoji Studio expects - with multipart form data
      const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
      const curlCommand = `curl 'https://${authData.workspace}.slack.com/api/emoji.adminList?_x_id=${xId}&_x_version_ts=noversion&fp=98' \\
        -H 'accept: */*' \\
        -H 'accept-language: en-US,en;q=0.9' \\
        -H 'cache-control: no-cache' \\
        -H 'content-type: multipart/form-data; boundary=${boundary}' \\
        -b '${authData.cookie}' \\
        -H 'pragma: no-cache' \\
        -H 'sec-fetch-dest: empty' \\
        -H 'sec-fetch-mode: cors' \\
        -H 'sec-fetch-site: same-origin' \\
        --data-raw $'------${boundary}\\r\\nContent-Disposition: form-data; name="token"\\r\\n\\r\\n${token}\\r\\n------${boundary}\\r\\nContent-Disposition: form-data; name="count"\\r\\n\\r\\n100000\\r\\n------${boundary}--\\r\\n'`;
      
      console.log('Storing curl command for future use');
      console.log('Token:', token ? token.substring(0, 15) + '...' : 'none');
      console.log('Cookie length:', authData.cookie ? authData.cookie.length : 0);
      capturedData[workspace].storedCurlCommand = curlCommand;
      capturedData[workspace].token = token; // Also store the token directly
    }
    
    chrome.storage.local.set({ 
      slackData: capturedData,
      slackCurlCommand: capturedData[workspace].storedCurlCommand || null
    }, () => {
      if (chrome.runtime.lastError) {
      } else {
        
        // Verify it was saved
        chrome.storage.local.get('slackData', (verifyResult) => {
          if (verifyResult.slackData) {
          }
        });
      }
      
      // Notify popup if it's open
      chrome.runtime.sendMessage({ type: 'DATA_UPDATED' }).catch(() => {
        // Popup might not be open, that's fine
      });
    });
    
    chrome.action.setBadgeText({ text: '✓' });
    chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
    
    // Check if we should show notification
    const now = Date.now();
    const lastTime = lastNotificationTime[workspace] || 0;
    const shouldShowNotification = (now - lastTime) > 10000; // 10 second cooldown
    
    if (shouldShowNotification) {
      lastNotificationTime[workspace] = now;
    }
    
    sendResponse({ success: true, showNotification: shouldShowNotification });
  } else if (request.type === 'GET_CAPTURED_DATA') {
    
    // Always check storage in case background script was reloaded
    chrome.storage.local.get('slackData', (result) => {
      
      if (result.slackData && Object.keys(result.slackData).length > 0) {
        // Migration: If multiple workspaces exist, keep only the most recent one
        const workspaceCount = Object.keys(result.slackData).length;
        if (workspaceCount > 1) {
          const workspaces = Object.keys(result.slackData);
          const mostRecentWorkspace = workspaces[workspaces.length - 1];
          const mostRecentData = result.slackData[mostRecentWorkspace];
          
          capturedData = {};
          capturedData[mostRecentWorkspace] = mostRecentData;
          
          // Update storage with single workspace
          chrome.storage.local.set({ slackData: capturedData });
        } else {
          capturedData = result.slackData;
        }
        
      } else {
      }
      
      sendResponse({ data: capturedData });
    });
    return true; // Keep channel open for async response
  } else if (request.type === 'CLEAR_DATA') {
    capturedData = {};
    emojiCart = [];
    chrome.storage.local.remove(['slackData', 'lastSyncTime', 'pendingExtensionData', 'emojiCart', 'slackCurlCommand', 'emojiStudioSyncData', 'emojiStudioSyncMeta']);
    chrome.action.setBadgeText({ text: '' });
    lastNotificationTime = {}; // Reset notification tracking
    
    // Notify all Emoji Studio tabs to clear their data
    // Query for both development and production URLs
    const devUrl = EMOJI_STUDIO_URLS.development;
    const prodUrl = EMOJI_STUDIO_URLS.production;
    
    
    chrome.tabs.query({ url: [devUrl + '/*', prodUrl + '/*'] }, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
          type: 'CLEAR_EMOJI_STUDIO_DATA'
        }, (response) => {
          if (chrome.runtime.lastError) {
          } else {
          }
        });
      });
    });
    
    sendResponse({ success: true });
  } else if (request.type === 'SLACK_AUTH_FAILED') {
    chrome.action.setBadgeText({ text: '✗' });
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
    sendResponse({ success: true });
  } else if (request.type === 'SYNC_TO_EMOJI_STUDIO') {
    syncToEmojiStudio(false).then(result => {
      sendResponse({ success: result.success, error: result.error });
    });
    return true; // Keep channel open for async response
  } else if (request.type === 'SYNC_TO_EMOJI_STUDIO_AND_OPEN') {
    console.log('[Background] SYNC_TO_EMOJI_STUDIO_AND_OPEN received');
    console.log('[Background] Current capturedData keys:', Object.keys(capturedData));
    
    // Open Emoji Studio dashboard with sync parameter to indicate sync will start
    const emojiStudioUrl = getEmojiStudioUrl('/dashboard?syncStarting=true');
    console.log('[Background] Opening dashboard at:', emojiStudioUrl);
    chrome.tabs.create({ url: emojiStudioUrl });
    
    // Start sync after a short delay to ensure dashboard is ready for progress messages
    console.log('[Background] Setting up sync delay...');
    setTimeout(() => {
      console.log('[Background] Starting delayed sync...');
      syncToEmojiStudio(false).then(result => {
        console.log('[Background] Sync completed with result:', result);
        sendResponse({ success: result.success, error: result.error });
      }).catch(error => {
        console.error('[Background] Sync failed with error:', error);
        sendResponse({ success: false, error: error.message });
      });
    }, 1000); // 1 second delay
    return true; // Keep channel open for async response
  } else if (request.type === 'UPDATE_SYNC_SETTINGS') {
    // Update sync settings
    chrome.storage.local.get('syncSettings', (result) => {
      const currentSettings = result.syncSettings || {};
      const newSettings = { ...currentSettings, ...request.settings };
      
      chrome.storage.local.set({ syncSettings: newSettings }, () => {
        // If sync interval changed, update the alarm
        if (request.settings.syncIntervalMinutes) {
          chrome.alarms.clear('autoSync', () => {
            if (newSettings.autoSyncEnabled) {
              chrome.alarms.create('autoSync', {
                periodInMinutes: request.settings.syncIntervalMinutes,
                delayInMinutes: 1
              });
            }
          });
        }
        
        // If auto-sync was just enabled, check if we should sync now
        if (request.settings.autoSyncEnabled === true && !currentSettings.autoSyncEnabled) {
          checkAndAutoSync();
        }
        
        sendResponse({ success: true });
      });
    });
    return true;
  } else if (request.type === 'GET_SYNC_SETTINGS') {
    chrome.storage.local.get('syncSettings', (result) => {
      sendResponse({ 
        syncSettings: result.syncSettings || {
          autoSyncEnabled: true,
          syncIntervalMinutes: 60,
          lastSyncAttempt: null,
          lastSuccessfulSync: null,
          syncState: 'idle'
        }
      });
    });
    return true;
  } else if (request.type === 'FETCH_FRESH_DATA') {
    // Fetch fresh emoji data directly from Slack API
    const workspace = Object.keys(capturedData)[0];
    if (!workspace || !capturedData[workspace]) {
      sendResponse({ success: false, error: 'No workspace data available' });
      return true;
    }
    
    const workspaceData = capturedData[workspace];
    fetchFreshEmojiData(workspace, workspaceData).then(result => {
      sendResponse(result);
    });
    return true;
  } else if (request.type === 'GET_EMOJI_STUDIO_DATA') {
    // Allow Emoji Studio to request synced data directly
    chrome.storage.local.get(['emojiStudioSyncData', 'emojiStudioSyncMeta'], (result) => {
      if (result.emojiStudioSyncData) {
        sendResponse({ 
          success: true, 
          data: result.emojiStudioSyncData,
          meta: result.emojiStudioSyncMeta 
        });
      } else {
        sendResponse({ 
          success: false, 
          error: 'No synced data available' 
        });
      }
    });
    return true;
  } else if (request.type === 'SHOW_NOTIFICATION') {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: request.iconUrl || 'icons/icon128.png',
      title: request.title,
      message: request.message
    });
    sendResponse({ success: true });
  } else if (request.type === 'ADD_TO_EMOJI_CART') {
    console.log('Adding emoji to cart:', request.emoji);
    
    // Initialize cart if needed
    if (!Array.isArray(emojiCart)) {
      console.log('Initializing empty cart');
      emojiCart = [];
    }
    
    // Implement size limit (max 100 emojis)
    const MAX_CART_SIZE = 100;
    if (emojiCart.length >= MAX_CART_SIZE) {
      console.warn('Cart is full, cannot add more emojis');
      sendResponse({ success: false, error: `Maximum of ${MAX_CART_SIZE} emojis allowed` });
      return;
    }
    
    const emoji = request.emoji;
    
    // Validate emoji data
    if (!emoji || !emoji.name || !emoji.url) {
      console.warn('Invalid emoji data:', emoji);
      sendResponse({ success: false, error: 'Invalid emoji data' });
      return;
    }
    
    // Handle data URLs for local uploads
    if (emoji.url.startsWith('data:')) {
      // Data URLs are already valid, no need to validate further
      console.log('Processing local file upload:', emoji.name);
    }
    
    // Check if emoji already exists
    const exists = emojiCart.some(e => e.name === emoji.name && e.workspace === emoji.workspace);
    
    if (!exists) {
      emojiCart.push(emoji);
      console.log('Cart now has', emojiCart.length, 'items');
      
      // Save to storage
      chrome.storage.local.set({ emojiCart: emojiCart }, () => {
        if (chrome.runtime.lastError) {
          console.error('Storage error:', chrome.runtime.lastError);
          sendResponse({ success: false, error: 'Storage error' });
        } else {
          console.log('Cart saved successfully');
          updateCartBadge();
          sendResponse({ success: true, cartSize: emojiCart.length });
        }
      });
    } else {
      console.log('Emoji already in cart');
      sendResponse({ success: false, error: 'Already in cart' });
    }
    
    return true; // Keep channel open for async response
  } else if (request.type === 'GET_CART_DATA') {
    // Ensure we have the latest cart data
    if (!Array.isArray(emojiCart)) {
      emojiCart = [];
    }
    sendResponse({ cart: emojiCart });
  } else if (request.type === 'REMOVE_FROM_CART') {
    const index = emojiCart.findIndex(e => 
      e.name === request.emojiName && e.workspace === request.workspace
    );
    if (index > -1) {
      emojiCart.splice(index, 1);
      chrome.storage.local.set({ emojiCart: emojiCart }, () => {
        updateCartBadge();
        sendResponse({ success: true, cartSize: emojiCart.length });
      });
    } else {
      sendResponse({ success: false, error: 'Emoji not found in cart' });
    }
    return true; // Keep channel open for async response
  } else if (request.type === 'CLEAR_CART') {
    emojiCart = [];
    chrome.storage.local.set({ emojiCart: [] }, () => {
      updateCartBadge();
      sendResponse({ success: true });
    });
    return true; // Keep channel open for async response
  } else if (request.type === 'HIGHLIGHT_EXTENSION_ICON') {
    // Set flag to open create tab when popup opens
    chrome.storage.local.set({ openCreateTab: true });
    
    // Try to open the popup directly (works in Chrome 116+)
    if (chrome.action.openPopup) {
      chrome.action.openPopup().catch(() => {
        // If openPopup fails, fall back to badge animation
        animateExtensionBadge();
      });
    } else {
      // Older Chrome versions: animate the badge
      animateExtensionBadge();
    }
    
    function animateExtensionBadge() {
      // Animate the badge to draw attention
      let flashCount = 0;
      const flashInterval = setInterval(() => {
        if (flashCount % 2 === 0) {
          chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
          chrome.action.setBadgeText({ text: '!' });
        } else {
          // Restore original
          updateCartBadge(); // This will set the correct badge
        }
        
        flashCount++;
        if (flashCount >= 6) { // Flash 3 times
          clearInterval(flashInterval);
          updateCartBadge(); // Ensure correct badge state
        }
      }, 300);
    }
    
    sendResponse({ success: true });
  } else if (request.type === 'FETCH_IMAGE') {
    
    // For Slack images, we need to handle differently
    if (request.url.includes('slack-edge.com') || request.url.includes('slack.com')) {
      
      // Get the active tab
      chrome.tabs.query({active: true, currentWindow: true}, async (tabs) => {
        if (tabs[0]) {
          try {
            const results = await chrome.scripting.executeScript({
              target: { tabId: tabs[0].id },
              func: async (imageUrl) => {
                // Find the image in the DOM
                const img = document.querySelector(`img[src="${imageUrl}"]`);
                if (img && img.complete) {
                  const canvas = document.createElement('canvas');
                  canvas.width = img.naturalWidth || img.width;
                  canvas.height = img.naturalHeight || img.height;
                  const ctx = canvas.getContext('2d');
                  ctx.drawImage(img, 0, 0);
                  return canvas.toDataURL('image/png');
                }
                throw new Error('Image not found or not loaded');
              },
              args: [request.url]
            });
            
            if (results && results[0] && results[0].result) {
              sendResponse({ success: true, dataUrl: results[0].result });
            } else {
              sendResponse({ success: false, error: 'Failed to capture Slack image' });
            }
          } catch (error) {
            sendResponse({ success: false, error: error.message });
          }
        } else {
          sendResponse({ success: false, error: 'No active tab' });
        }
      });
      return true;
    }
    
    // For non-Slack images, use regular fetch
    fetch(request.url, {
      method: 'GET',
      credentials: 'omit' // Don't send cookies to avoid auth issues
    })
      .then(response => {
        const contentType = response.headers.get('content-type');
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.blob();
      })
      .then(blob => {
        
        // For opaque responses, blob type might be empty
        if (!blob.type && request.url.toLowerCase().endsWith('.gif')) {
          return blob.arrayBuffer().then(arrayBuffer => {
            return new Blob([arrayBuffer], { type: 'image/gif' });
          });
        }
        
        // If URL suggests GIF but blob type is wrong, try to correct it
        if (request.url.toLowerCase().endsWith('.gif') && blob.type !== 'image/gif') {
          // Read as array buffer and create new blob with correct type
          return blob.arrayBuffer().then(arrayBuffer => {
            const correctedBlob = new Blob([arrayBuffer], { type: 'image/gif' });
            return correctedBlob;
          });
        }
        return blob;
      })
      .then(blob => {
        const reader = new FileReader();
        reader.onloadend = () => {
          sendResponse({ success: true, dataUrl: reader.result });
        };
        reader.onerror = () => {
          sendResponse({ success: false, error: 'Failed to read image' });
        };
        reader.readAsDataURL(blob);
      })
      .catch(error => {
        
        // Try alternative approach: inject content script to fetch
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
          if (tabs[0]) {
            chrome.scripting.executeScript({
              target: { tabId: tabs[0].id },
              func: async (imageUrl) => {
                try {
                  const response = await fetch(imageUrl);
                  const blob = await response.blob();
                  return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                  });
                } catch (error) {
                  throw new Error('Content script fetch failed: ' + error.message);
                }
              },
              args: [request.url]
            }, (results) => {
              if (results && results[0] && results[0].result) {
                sendResponse({ success: true, dataUrl: results[0].result });
              } else {
                sendResponse({ success: false, error: 'All fetch methods failed' });
              }
            });
          } else {
            sendResponse({ success: false, error: error.message });
          }
        });
      });
    return true; // Keep channel open for async response
  } else if (request.type === 'ADD_EMOJI_FROM_SLACKMOJIS') {
    
    // Get the workspace data
    chrome.storage.local.get('slackData', async (result) => {
      
      if (!result.slackData || !result.slackData[request.workspace]) {
        sendResponse({ success: false, error: 'No workspace data found' });
        return;
      }
      
      const workspaceData = result.slackData[request.workspace];
      
      try {
        
        // Check if this might be an HDR image
        const isLikelyHDR = request.url.toLowerCase().includes('hdr') || 
                            request.url.toLowerCase().includes('heic') ||
                            request.url.toLowerCase().includes('heif') ||
                            request.url.toLowerCase().includes('_hdr') ||
                            request.metadata?.isHDR;
        
        // For HDR images, try to use the original URL if possible
        if (isLikelyHDR) {
          // Create Emoji Studio URL with original image URL
          const emojiStudioUrl = getEmojiStudioUrl('/create?from=extension');
          const baseUrl = getEmojiStudioUrl('');
          
          // Store data with original URL to preserve HDR
          chrome.storage.local.set({ 
            pendingExtensionData: {
              source: 'slackmojis',
              workspace: request.workspace,
              workspaceData: workspaceData,
              imageUrl: request.url,  // Original URL preserves HDR
              isDirectUrl: true,
              isHDR: true,
              name: request.name || request.metadata?.name || 'emoji',
              metadata: request.metadata || {}
            }
          }, () => {
            // Open Emoji Studio
            chrome.tabs.create({ url: emojiStudioUrl }, (tab) => {
              sendResponse({ success: true });
            });
          });
          return;
        }
        
        // For non-HDR images, fetch and convert to data URL as before
        fetch(request.url)
          .then(response => {
            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.blob();
          })
          .then(blob => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const dataUrl = reader.result;
              
              // Create Emoji Studio URL with emoji data
              const emojiStudioUrl = getEmojiStudioUrl('/create?from=extension');
              const baseUrl = getEmojiStudioUrl('');
              
              // Create emoji data with data URL
              const emojiData = {
                imageUrl: dataUrl,
                originalUrl: request.url,
                name: request.name,
                workspace: request.workspace,
                source: 'slackmojis'
              };
              
              // Store temporarily so the Emoji Studio create page can pick it up
              chrome.storage.local.set({ pendingEmojiStudioCreate: emojiData }, () => {
                
                // Check if Emoji Studio is already open
                chrome.tabs.query({ url: [`${baseUrl}/*`] }, (tabs) => {
                  if (tabs.length > 0) {
                    // Use existing tab
                    const tabId = tabs[0].id;
                    chrome.tabs.update(tabId, { 
                      url: emojiStudioUrl,
                      active: true
                    }, () => {
                      sendResponse({ success: true });
                    });
                  } else {
                    // Create new tab
                    chrome.tabs.create({ url: emojiStudioUrl }, (tab) => {
                      sendResponse({ success: true });
                    });
                  }
                });
              });
            };
            reader.onerror = () => {
              sendResponse({ success: false, error: 'Failed to read image data' });
            };
            reader.readAsDataURL(blob);
          })
          .catch(error => {
            sendResponse({ success: false, error: error.message });
          });
        
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    });
    
    return true; // Keep channel open for async response
  } else if (request.type === 'UPLOAD_EMOJI_TO_SLACK') {
    console.log('Uploading emoji to Slack:', request.emoji.name);
    
    const emoji = request.emoji;
    let workspaceData = request.workspaceData;
    
    // Handle the upload asynchronously
    (async () => {
      // First, check if we have a stored curl command
      const storedData = await chrome.storage.local.get(['slackCurlCommand', 'slackData']);
      
      if (storedData.slackCurlCommand) {
        console.log('Using stored curl command for upload');
        // Parse the stored curl command to get auth data
        const parsedCurl = parseSlackCurl(storedData.slackCurlCommand);
        if (parsedCurl.isValid) {
          // Override with stored auth data
          workspaceData = {
            workspace: parsedCurl.workspace || workspaceData.workspace,
            token: parsedCurl.token,
            cookie: parsedCurl.cookie,
            teamId: parsedCurl.teamId || workspaceData.teamId,
            xId: parsedCurl.xId || workspaceData.xId
          };
        }
      }
      
      // Validate we have the necessary auth data
      if (!workspaceData || !workspaceData.workspace) {
        sendResponse({ success: false, error: 'Missing Slack authentication data' });
        return;
      }
      
      // Check if we have some form of authentication
      if (!workspaceData.token && !workspaceData.cookie) {
        sendResponse({ success: false, error: 'No authentication credentials found. Please visit your Slack workspace emoji page.' });
        return;
      }
      
      try {
      // Parse headers to extract needed values
      const cookie = workspaceData.authHeaders?.cookie || workspaceData.cookie || '';
      const xSlackClientId = workspaceData.xSlackClientId || '';
      
      // Extract token from various sources
      let token = workspaceData.token || workspaceData.formToken || '';
      
      // If no token yet, try to extract from cookie
      if (!token && cookie) {
        // Try to find xox token in cookies
        const cookies = cookie.split(/;\s*/);
        for (const c of cookies) {
          const [name, value] = c.split('=');
          if (name === 'd' && value) {
            try {
              const decodedValue = decodeURIComponent(value);
              if (decodedValue.startsWith('xox')) {
                token = decodedValue;
                break;
              }
            } catch (e) {
              if (value.startsWith('xox')) {
                token = value;
                break;
              }
            }
          }
        }
        
        // Fallback to regex match
        if (!token) {
          const tokenMatch = cookie.match(/\bxox[a-zA-Z]-[^\s;]+/);
          if (tokenMatch) {
            token = tokenMatch[0];
          }
        }
      }
      
      // Also check if token is in the authHeaders
      if (!token && workspaceData.authHeaders?.authorization) {
        const authMatch = workspaceData.authHeaders.authorization.match(/Bearer\s+(xox[a-zA-Z]-[\w-]+)/);
        if (authMatch) {
          token = authMatch[1];
        }
      }
      
      if (!token) {
        console.error('No token found. Debug info:', {
          hasWorkspaceData: !!workspaceData,
          hasToken: !!workspaceData.token,
          hasFormToken: !!workspaceData.formToken,
          hasCookie: !!workspaceData.cookie,
          hasAuthHeaders: !!workspaceData.authHeaders,
          cookieLength: workspaceData.cookie ? workspaceData.cookie.length : 0
        });
        sendResponse({ success: false, error: 'No Slack token found. Please visit your Slack workspace emoji page.' });
        return;
      }
      
      console.log('Using token:', token.substring(0, 15) + '...');
      
      // Extract team ID from various sources
      let teamId = workspaceData.teamId || '';
      if (!teamId && workspaceData.authHeaders) {
        // Try to extract from x-slack-team-id header
        const teamHeader = Object.entries(workspaceData.authHeaders).find(([key, value]) => 
          key.toLowerCase() === 'x-slack-team-id'
        );
        if (teamHeader) {
          teamId = teamHeader[1];
        }
      }
      if (!teamId && cookie) {
        // Try to extract from cookie
        const teamMatch = cookie.match(/\bd=([^;]+)/);
        if (teamMatch) {
          try {
            const dCookie = JSON.parse(decodeURIComponent(teamMatch[1]));
            teamId = dCookie.team_id || '';
          } catch (e) {
            console.warn('Failed to parse d cookie:', e);
          }
        }
      }
      
      // Prepare the emoji data
      let imageBlob;
      let fileName;
      let mimeType;
      
      if (emoji.url.startsWith('data:')) {
        // Local upload - convert data URL to blob
        const response = await fetch(emoji.url);
        imageBlob = await response.blob();
        mimeType = imageBlob.type;
        
        // Determine file extension
        const extension = mimeType.includes('gif') ? 'gif' : 
                         mimeType.includes('video') ? 'mp4' : 'png';
        fileName = `${emoji.name}.${extension}`;
      } else {
        // Remote URL - fetch the image
        try {
          const response = await fetch(emoji.url);
          imageBlob = await response.blob();
          mimeType = imageBlob.type || 'image/png';
          
          // Determine file extension from URL or mime type
          const urlExt = emoji.url.match(/\.([^.]+)$/);
          const extension = urlExt ? urlExt[1].toLowerCase() : 
                           mimeType.includes('gif') ? 'gif' : 'png';
          fileName = `${emoji.name}.${extension}`;
        } catch (fetchError) {
          console.error('Failed to fetch emoji:', fetchError);
          sendResponse({ success: false, error: 'Failed to fetch emoji image' });
          return;
        }
      }
      
      // Create FormData for the upload
      const formData = new FormData();
      formData.append('token', token);
      formData.append('name', emoji.name);
      formData.append('mode', 'data');
      formData.append('search_args', '{}');
      
      // Add the image file
      const file = new File([imageBlob], fileName, { type: mimeType });
      formData.append('image', file);
      
      // Add additional fields
      formData.append('_x_reason', 'add-custom-emoji-dialog-content');
      formData.append('_x_mode', 'online');
      
      // Extract x_id from stored data or generate one
      const xId = workspaceData.xId || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const slackRoute = teamId || '';
      
      // Construct the upload URL
      const uploadUrl = `https://${workspaceData.workspace}.slack.com/api/emoji.add?_x_id=${xId}&slack_route=${slackRoute}&_x_version_ts=noversion&fp=5c&_x_num_retries=0`;
      
      console.log('Uploading to:', uploadUrl);
      
      // Convert FormData to a plain object for the proxy
      const formDataObj = {};
      for (const [key, value] of formData.entries()) {
        if (key !== 'image' && value !== undefined && value !== null) {
          formDataObj[key] = value;
        }
      }
      
      // Convert the image blob to data URL for transport
      const reader = new FileReader();
      const dataUrl = await new Promise((resolve, reject) => {
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(imageBlob);
      });
      
      // Use stored curl if available, otherwise construct from current data
      const storedCurl = await chrome.storage.local.get('slackCurlCommand');
      let curlCommand;
      
      if (storedCurl.slackCurlCommand) {
        // Update the stored curl command with the new emoji name
        curlCommand = storedCurl.slackCurlCommand
          .replace(/emoji\.adminList/, 'emoji.add')
          .replace(/--data\s+'token=[^']+'/g, `--form 'token=${token}'`)
          + ` --form 'name=${emoji.name}' --form 'mode=data' --form '_x_reason=add-custom-emoji-dialog-content' --form '_x_mode=online' --form 'image=@${fileName}'`;
      } else {
        // Construct new curl command
        curlCommand = `curl 'https://${workspaceData.workspace}.slack.com/api/emoji.add?_x_id=${xId}&slack_route=${teamId}&_x_version_ts=noversion&fp=5c&_x_num_retries=0' \\
          -H 'Accept: */*' \\
          -H 'Accept-Language: en-US,en;q=0.9' \\
          -H 'Cache-Control: no-cache' \\
          -H 'Content-Type: multipart/form-data' \\
          -H 'Cookie: ${cookie}' \\
          -H 'Origin: https://${workspaceData.workspace}.slack.com' \\
          -H 'Referer: https://${workspaceData.workspace}.slack.com/customize/emoji' \\
          -H 'Sec-Ch-Ua: "Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"' \\
          -H 'Sec-Ch-Ua-Mobile: ?0' \\
          -H 'Sec-Ch-Ua-Platform: "macOS"' \\
          -H 'Sec-Fetch-Dest: empty' \\
          -H 'Sec-Fetch-Mode: cors' \\
          -H 'Sec-Fetch-Site: same-origin' \\
          -H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' \\
          --form 'token=${token}' \\
          --form 'name=${emoji.name}' \\
          --form 'mode=data' \\
          --form '_x_reason=add-custom-emoji-dialog-content' \\
          --form '_x_mode=online' \\
          --form 'search_args={}' \\
          --form 'image=@${fileName}'`;
      }
      
      // Use the same upload logic as Emoji Studio
      console.log('Using Emoji Studio upload logic');
      console.log('Token:', token ? token.substring(0, 15) + '...' : 'none');
      console.log('Cookie length:', cookie ? cookie.length : 0);
      console.log('Upload URL:', uploadUrl);
      
      // Store the curl command in localStorage like Emoji Studio does
      await chrome.storage.local.set({
        slackCurlCommand: curlCommand
      });
      
      // Store curl in localStorage for the Emoji Studio app to use
      // This is how Emoji Studio expects to receive the auth data
      const storageScript = `localStorage.setItem('slackCurlCommand', ${JSON.stringify(curlCommand)})`;
      
      // Now perform the upload using the same approach as Emoji Studio
      try {
        // Create a proxy request that mimics what Emoji Studio does
        const proxyResponse = await fetch(`${EMOJI_STUDIO_URLS[currentEnvironment]}/api/slack-emoji-upload`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: uploadUrl,
            formData: formDataObj,
            headers: {
              'Accept': '*/*',
              'Accept-Language': 'en-US,en;q=0.9',
              'Cache-Control': 'no-cache',
              'Origin': `https://${workspaceData.workspace}.slack.com`,
              'Referer': `https://${workspaceData.workspace}.slack.com/customize/emoji`,
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Cookie': cookie,
              'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
              'Sec-Ch-Ua-Mobile': '?0',
              'Sec-Ch-Ua-Platform': '"macOS"',
              'Sec-Fetch-Dest': 'empty',
              'Sec-Fetch-Mode': 'cors',
              'Sec-Fetch-Site': 'same-origin'
            },
            blob: dataUrl,
            fileName: fileName,
            mimeType: mimeType
          })
        });
        
        const result = await proxyResponse.json();
        console.log('Upload result:', result);
        
        if (result.success && result.data && result.data.ok) {
          sendResponse({ success: true, emojiName: emoji.name });
        } else {
          // Handle error cases
          let errorMessage = 'Upload failed';
          const errorCode = result.error || result.details?.error || result.data?.error;
          
          console.error('Upload failed with error:', errorCode);
          console.error('Full result:', JSON.stringify(result, null, 2));
          
          if (errorCode === 'error_name_taken') {
            errorMessage = `Emoji name "${emoji.name}" is already taken`;
          } else if (errorCode === 'error_bad_name_i18n') {
            errorMessage = `Invalid emoji name "${emoji.name}"`;
          } else if (errorCode === 'error_missing_scope') {
            errorMessage = 'Missing permissions to upload emojis';
          } else if (errorCode === 'not_authed' || errorCode === 'invalid_auth') {
            errorMessage = 'Slack authentication failed. Please visit your Slack workspace and try again.';
            console.error('Auth details:', {
              tokenType: token ? token.substring(0, 4) : 'none',
              tokenLength: token ? token.length : 0,
              cookieLength: cookie ? cookie.length : 0,
              hasTeamId: !!teamId,
              hasXId: !!xId
            });
          } else if (errorCode) {
            errorMessage = errorCode;
          }
          
          sendResponse({ success: false, error: errorMessage });
        }
      } catch (error) {
        console.error('Proxy upload failed:', error);
        
        // If the upload fails due to auth, suggest reconnecting
        if (error.message && (error.message.includes('not_authed') || error.message.includes('invalid_auth'))) {
          // Open a Slack tab to refresh authentication
          const slackUrl = `https://${workspaceData.workspace}.slack.com/customize/emoji`;
          chrome.tabs.create({ url: slackUrl }, (tab) => {
            sendResponse({ 
              success: false, 
              error: 'Authentication expired. Please sign in to Slack and try again.',
              needsReauth: true 
            });
          });
        } else {
          sendResponse({ success: false, error: 'Network error. Please check your connection.' });
        }
      }
      
      } catch (error) {
        console.error('Error uploading emoji:', error);
        sendResponse({ success: false, error: error.message || 'Upload failed' });
      }
    })();
    
    return true; // Keep channel open for async response
  }
  
  return true; // Keep message channel open for async response
});

// Listen for all Slack API requests
chrome.webRequest.onBeforeRequest.addListener(
  function(details) {
    if (details.url.includes('.slack.com/api/')) {
    }
    
    if (details.url.includes('/api/emoji.adminList') || 
        details.url.includes('/api/emoji.list') ||
        details.url.includes('/api/emoji.') ||
        details.url.includes('/api/client.') ||
        details.url.includes('/api/users.') ||
        details.url.includes('/api/team.')) {
      
      
      // Log the full request details for debugging
      console.log('Intercepted Slack API request:', {
        url: details.url,
        method: details.method,
        hasRequestBody: !!details.requestBody,
        hasFormData: !!(details.requestBody && details.requestBody.formData),
        formDataKeys: details.requestBody && details.requestBody.formData ? Object.keys(details.requestBody.formData) : []
      });
      
      // Extract token from form data if present
      let formToken = null;
      if (details.requestBody && details.requestBody.formData && details.requestBody.formData.token) {
        formToken = details.requestBody.formData.token[0];
        console.log('✅ Extracted form token from request:', formToken ? formToken.substring(0, 15) + '...' : 'none');
      } else {
        console.log('❌ No token in form data');
        
        // Check all form data fields for debugging
        if (details.requestBody && details.requestBody.formData) {
          console.log('All form data fields:', details.requestBody.formData);
          
          // Check if token might be in other fields
          for (const [key, value] of Object.entries(details.requestBody.formData)) {
            if (value && value[0] && value[0].startsWith && value[0].startsWith('xox')) {
              console.log(`Found token in field '${key}':`, value[0].substring(0, 15) + '...');
              formToken = value[0];
              break;
            }
          }
        }
      }
      
      // Also check for tokens in the URL
      const urlMatch = details.url.match(/[?&]token=([^&]+)/);
      if (urlMatch && !formToken) {
        formToken = decodeURIComponent(urlMatch[1]);
        console.log('Extracted token from URL:', formToken ? formToken.substring(0, 15) + '...' : 'none');
      }
      
      // Store the form token for this request
      if (formToken) {
        pendingRequestData.set(details.requestId, { formToken, timestamp: Date.now() });
        console.log('Stored form token for request:', details.requestId);
      }
      
      const tabId = details.tabId;
      if (tabId > 0) {
        chrome.tabs.sendMessage(tabId, {
          type: 'INTERCEPT_REQUEST',
          url: details.url,
          requestId: details.requestId,
          formToken: formToken
        }).catch(err => {});
      }
    }
  },
  { urls: ["https://*.slack.com/api/*"] },
  ["requestBody"]
);

chrome.webRequest.onSendHeaders.addListener(
  function(details) {
    if (details.url.includes('/api/emoji.adminList') || 
        details.url.includes('/api/emoji.list') ||
        details.url.includes('/api/emoji.') ||
        details.url.includes('/api/client.') ||
        details.url.includes('/api/users.') ||
        details.url.includes('/api/team.')) {
      
      
      const headers = {};
      details.requestHeaders.forEach(header => {
        headers[header.name.toLowerCase()] = header.value;
      });
      
      // Get stored form data for this request
      const requestData = pendingRequestData.get(details.requestId);
      const formToken = requestData ? requestData.formToken : null;
      
      // Log important headers for debugging
      if (headers.cookie) {
        console.log('Captured cookie length:', headers.cookie.length);
        // Check for xox tokens in cookie
        const cookieTokenMatch = headers.cookie.match(/xox[a-zA-Z]-[^\s;]+/);
        if (cookieTokenMatch) {
          console.log('Found token in cookie:', cookieTokenMatch[0].substring(0, 15) + '...');
        }
      }
      if (headers.authorization) {
        console.log('Captured authorization header');
      }
      if (formToken) {
        console.log('Captured form token:', formToken.substring(0, 15) + '...');
      }
      
      const tabId = details.tabId;
      if (tabId > 0) {
        chrome.tabs.sendMessage(tabId, {
          type: 'CAPTURE_HEADERS',
          url: details.url,
          headers: headers,
          requestId: details.requestId,
          formToken: formToken
        }).catch(err => {});
      }
      
      // Clean up stored data
      pendingRequestData.delete(details.requestId);
    }
  },
  { urls: ["https://*.slack.com/api/*"] },
  ["requestHeaders", "extraHeaders"]  // Added extraHeaders for more complete header access
);

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get('slackData', (result) => {
    if (result.slackData) {
      // Migration: If multiple workspaces exist, keep only the most recent one
      const workspaceCount = Object.keys(result.slackData).length;
      if (workspaceCount > 1) {
        // Find the most recent workspace (assuming the last key is most recent)
        const workspaces = Object.keys(result.slackData);
        const mostRecentWorkspace = workspaces[workspaces.length - 1];
        const mostRecentData = result.slackData[mostRecentWorkspace];
        
        // Keep only the most recent workspace
        capturedData = {};
        capturedData[mostRecentWorkspace] = mostRecentData;
        
        // Update storage with single workspace
        chrome.storage.local.set({ slackData: capturedData }, () => {
        });
      } else {
        capturedData = result.slackData;
      }
      
      chrome.action.setBadgeText({ text: '✓' });
      chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
    }
  });
});

// Clean up old pending request data periodically
setInterval(() => {
  const now = Date.now();
  for (const [id, data] of pendingRequestData.entries()) {
    if (now - (data.timestamp || now) > 30000) {
      pendingRequestData.delete(id);
    }
  }
}, 60000);

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  
  if (info.menuItemId === 'createSlackEmoji') {
    
    // Check if user is authenticated
    if (Object.keys(capturedData).length === 0) {
      // Show notification that user needs to connect Slack first
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'Connect Slack First',
        message: 'Please connect your Slack workspace before creating emojis. Click the extension icon to get started.'
      });
      return;
    }
    
    const imageUrl = info.srcUrl;
    const pageUrl = info.pageUrl;
    const workspace = Object.keys(capturedData)[0]; // Use first workspace
    const data = capturedData[workspace];
    
    
    try {
      // For cross-origin images, we need to inject a content script to fetch the image
      const [activeTab] = await chrome.tabs.query({active: true, currentWindow: true});
      
      // Inject content script to fetch the image as data URL
      const results = await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        func: async (imageUrl, pageUrl) => {
          try {
            // Analyze the media URL to determine type
            const urlLower = imageUrl.toLowerCase();
            const isLikelyGif = urlLower.includes('.gif') || urlLower.includes('giphy') || urlLower.includes('tenor');
            const isLikelyVideo = urlLower.includes('.mp4') || urlLower.includes('.webm') || urlLower.includes('.mov') || 
                                urlLower.includes('.avi') || urlLower.includes('.mkv') || urlLower.includes('video');
            const isLikelyAudio = urlLower.includes('.mp3') || urlLower.includes('.wav') || urlLower.includes('.ogg') || 
                                urlLower.includes('.m4a') || urlLower.includes('audio');
            
            // Try to find the actual GIF if this might be a preview
            let targetUrl = imageUrl;
            
            // Check if there's a data-gif attribute or similar on the clicked element
            // Look for img, video, audio, and source elements
            const clickedElement = document.querySelector(`img[src="${imageUrl}"], video[src="${imageUrl}"], audio[src="${imageUrl}"], source[src="${imageUrl}"]`);
            if (clickedElement) {
              
              // For video elements, also check for poster attribute
              if (clickedElement.tagName.toLowerCase() === 'video') {
                const posterUrl = clickedElement.getAttribute('poster');
                if (posterUrl && posterUrl !== imageUrl) {
                  // Keep the video URL, not the poster image
                }
              }
              
              // Check various attributes that might contain the actual media URL
              const mediaUrl = clickedElement.getAttribute('data-gif') || 
                             clickedElement.getAttribute('data-gif-src') ||
                             clickedElement.getAttribute('data-animated-src') ||
                             clickedElement.getAttribute('data-original') ||
                             clickedElement.getAttribute('data-video-src') ||
                             clickedElement.getAttribute('data-mp4');
              if (mediaUrl) {
                targetUrl = mediaUrl;
              }
              
              // Also check parent elements for media URLs
              let parent = clickedElement.parentElement;
              let depth = 0;
              while (parent && depth < 3) {
                const parentMediaUrl = parent.getAttribute('data-gif') || 
                                     parent.getAttribute('data-gif-src') ||
                                     parent.getAttribute('data-video-src') ||
                                     parent.getAttribute('data-mp4') ||
                                     parent.getAttribute('href');
                if (parentMediaUrl && (parentMediaUrl.toLowerCase().includes('.gif') || 
                                     parentMediaUrl.toLowerCase().includes('.mp4') ||
                                     parentMediaUrl.toLowerCase().includes('.webm') ||
                                     parentMediaUrl.toLowerCase().includes('.mov'))) {
                  targetUrl = parentMediaUrl;
                  break;
                }
                parent = parent.parentElement;
                depth++;
              }
            }
            
            // Special handling for SlackMojis - try to read from already loaded image
            if (pageUrl.includes('slackmojis.com')) {
              
              // Find the image element and check if it's loaded
              const imgElement = document.querySelector(`img[src="${imageUrl}"]`);
              if (imgElement && imgElement.complete && imgElement.naturalWidth > 0) {
                
                // Create canvas to extract image data
                const canvas = document.createElement('canvas');
                canvas.width = imgElement.naturalWidth;
                canvas.height = imgElement.naturalHeight;
                const ctx = canvas.getContext('2d');
                
                try {
                  ctx.drawImage(imgElement, 0, 0);
                  // Try to get as PNG first (will lose GIF animation)
                  const pngDataUrl = canvas.toDataURL('image/png');
                  return pngDataUrl;
                } catch (canvasError) {
                  // Continue to regular fetch attempt
                }
              }
            }
            
            // For GIFs and other formats, fetch as blob to preserve animation
            // For Slack images, try different approaches
            let response;
            let blob;
            
            if (targetUrl.includes('slack-edge.com') || targetUrl.includes('slack.com')) {
              
              // For Slack media, try to use the element directly
              const mediaElement = document.querySelector(`img[src="${imageUrl}"], video[src="${imageUrl}"]`);
              if (mediaElement && (mediaElement.complete || mediaElement.readyState >= 2)) {
                const canvas = document.createElement('canvas');
                
                if (mediaElement.tagName.toLowerCase() === 'video') {
                  // For video elements
                  canvas.width = mediaElement.videoWidth || mediaElement.width || 640;
                  canvas.height = mediaElement.videoHeight || mediaElement.height || 480;
                  const ctx = canvas.getContext('2d');
                  try {
                    ctx.drawImage(mediaElement, 0, 0, canvas.width, canvas.height);
                    blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                  } catch (canvasError) {
                    throw new Error('Video canvas extraction failed');
                  }
                } else {
                  // For image elements
                  canvas.width = mediaElement.naturalWidth || mediaElement.width;
                  canvas.height = mediaElement.naturalHeight || mediaElement.height;
                  const ctx = canvas.getContext('2d');
                  try {
                    ctx.drawImage(mediaElement, 0, 0);
                    blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                  } catch (canvasError) {
                    throw new Error('Canvas extraction failed');
                  }
                }
              } else {
                throw new Error('Slack media not loaded in DOM');
              }
            } else {
              // For non-Slack images, use regular fetch
              response = await fetch(targetUrl);
              blob = await response.blob();
            }
            
            
            // Check the actual content type
            let finalBlob = blob;
            
            // Correct MIME type based on URL and magic bytes
            if ((isLikelyGif || targetUrl.toLowerCase().includes('.gif')) && blob.type !== 'image/gif') {
              const arrayBuffer = await blob.arrayBuffer();
              const bytes = new Uint8Array(arrayBuffer);
              
              // Check for GIF magic bytes (GIF87a or GIF89a)
              if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
                // It's actually a GIF, create new blob with correct type
                finalBlob = new Blob([arrayBuffer], { type: 'image/gif' });
              } else {
                // Even if magic bytes don't match, trust the URL if it's clearly a GIF
                if (targetUrl.toLowerCase().endsWith('.gif')) {
                  finalBlob = new Blob([arrayBuffer], { type: 'image/gif' });
                } else {
                  finalBlob = new Blob([arrayBuffer], { type: blob.type });
                }
              }
            } else if (isLikelyVideo && !blob.type.startsWith('video/')) {
              const arrayBuffer = await blob.arrayBuffer();
              
              // Determine video type based on URL
              let videoType = 'video/mp4'; // Default
              if (targetUrl.toLowerCase().includes('.webm')) videoType = 'video/webm';
              else if (targetUrl.toLowerCase().includes('.mov')) videoType = 'video/quicktime';
              else if (targetUrl.toLowerCase().includes('.avi')) videoType = 'video/x-msvideo';
              
              finalBlob = new Blob([arrayBuffer], { type: videoType });
            } else if (isLikelyAudio && !blob.type.startsWith('audio/')) {
              const arrayBuffer = await blob.arrayBuffer();
              
              // Determine audio type based on URL
              let audioType = 'audio/mpeg'; // Default
              if (targetUrl.toLowerCase().includes('.wav')) audioType = 'audio/wav';
              else if (targetUrl.toLowerCase().includes('.ogg')) audioType = 'audio/ogg';
              else if (targetUrl.toLowerCase().includes('.m4a')) audioType = 'audio/mp4';
              
              finalBlob = new Blob([arrayBuffer], { type: audioType });
            }
            
            // Convert blob to data URL
            return new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result);
              reader.onerror = reject;
              reader.readAsDataURL(finalBlob);
            });
          } catch (error) {
            // If fetch fails due to CORS, try the canvas method as fallback
            try {
              // For Slack images, don't set crossOrigin as it will fail
              const isSlackImage = imageUrl.includes('slack-edge.com') || imageUrl.includes('slack.com');
              
              // First try to find existing media element
              const existingMedia = document.querySelector(`img[src="${imageUrl}"], video[src="${imageUrl}"]`);
              if (existingMedia && (existingMedia.complete || existingMedia.readyState >= 2)) {
                const canvas = document.createElement('canvas');
                
                if (existingMedia.tagName.toLowerCase() === 'video') {
                  canvas.width = existingMedia.videoWidth || existingMedia.width || 640;
                  canvas.height = existingMedia.videoHeight || existingMedia.height || 480;
                  const ctx = canvas.getContext('2d');
                  ctx.drawImage(existingMedia, 0, 0, canvas.width, canvas.height);
                  return canvas.toDataURL('image/png');
                } else {
                  canvas.width = existingMedia.naturalWidth || existingMedia.width;
                  canvas.height = existingMedia.naturalHeight || existingMedia.height;
                  const ctx = canvas.getContext('2d');
                  ctx.drawImage(existingMedia, 0, 0);
                  return canvas.toDataURL('image/png');
                }
              }
              
              const img = new Image();
              if (!isSlackImage) {
                img.crossOrigin = 'anonymous';
              }
              
              const loadPromise = new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
              });
              
              img.src = imageUrl;
              await loadPromise;
              
              // Check if it's a GIF by looking at the URL
              if (imageUrl.toLowerCase().includes('.gif')) {
              }
              
              const canvas = document.createElement('canvas');
              canvas.width = img.width;
              canvas.height = img.height;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0);
              
              return canvas.toDataURL();
            } catch (canvasError) {
              // Return the original URL - we'll try background fetch
              throw new Error('Canvas method failed due to CORS/security restrictions');
            }
          }
        },
        args: [imageUrl, pageUrl]
      });
      
      const dataUrl = results[0]?.result;
      
      // Special handling for known problematic sites
      if (pageUrl.includes('slackmojis.com') && (!dataUrl || !dataUrl.startsWith('data:'))) {
        
        // Check if we at least got a PNG version
        if (dataUrl && dataUrl.startsWith('data:image/png')) {
          // Continue with the PNG version
        } else {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: 'SlackMojis Site Detected',
            message: 'SlackMojis blocks direct GIF access. Trying background fetch instead.'
          });
          // Don't return here - continue to background fetch
        }
      }
      
      if (!dataUrl || !dataUrl.startsWith('data:')) {
        // Try to fetch in background instead
        try {
          const response = await fetch(imageUrl);
          const blob = await response.blob();
          
          
          // If it's a GIF URL but blob type is wrong, correct it
          let finalBlob = blob;
          if (imageUrl.toLowerCase().includes('.gif') && blob.type !== 'image/gif') {
            const arrayBuffer = await blob.arrayBuffer();
            finalBlob = new Blob([arrayBuffer], { type: 'image/gif' });
          }
          
          
          const reader = new FileReader();
          reader.onloadend = () => {
            const bgDataUrl = reader.result;
            
            // New workflow: redirect directly to Emoji Studio
            const storageData = {
              pendingEmojiStudioCreate: {
                imageUrl: bgDataUrl,
                originalUrl: imageUrl,
                workspace: workspace,
                authData: data,
                timestamp: Date.now()
              }
            };
            
            
            chrome.storage.local.set(storageData, () => {
              if (chrome.runtime.lastError) {
                return;
              }
              
              
              // Verify the data was stored
              chrome.storage.local.get(['pendingEmojiStudioCreate'], (verifyResult) => {
              });
              
              // Open Emoji Studio create page directly
              const emojiStudioUrl = getEmojiStudioUrl('/create?from=extension');
              chrome.tabs.create({ url: emojiStudioUrl });
              
              // Show notification
              chrome.notifications.create({
                type: 'basic',
                iconUrl: 'icons/icon128.png',
                title: 'Opening Emoji Studio',
                message: 'Redirecting to Emoji Studio to create your emoji'
              });
            });
          };
          
          reader.onerror = () => {
            chrome.notifications.create({
              type: 'basic',
              iconUrl: 'icons/icon128.png',
              title: 'Failed to Process Image',
              message: 'Could not read the image data. Please try again.'
            });
          };
          
          reader.readAsDataURL(finalBlob);
        } catch (bgError) {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: 'Failed to Load Image',
            message: 'Could not load the image. The website may be blocking access. Try saving the image first and then right-clicking on the saved file.'
          });
        }
        return;
      }
      
      // New workflow: redirect directly to Emoji Studio
      const storageData = {
        pendingEmojiStudioCreate: {
          imageUrl: dataUrl,
          originalUrl: imageUrl,
          workspace: workspace,
          authData: data,
          timestamp: Date.now()
        }
      };
      
      
      chrome.storage.local.set(storageData, () => {
        if (chrome.runtime.lastError) {
          return;
        }
        
        
        // Verify the data was stored
        chrome.storage.local.get(['pendingEmojiStudioCreate'], (verifyResult) => {
        });
        
        // Open Emoji Studio create page directly
        const emojiStudioUrl = getEmojiStudioUrl('/create?from=extension');
        chrome.tabs.create({ url: emojiStudioUrl });
        
        // Show notification
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: 'Opening Emoji Studio',
          message: 'Redirecting to Emoji Studio to create your emoji'
        });
      });
    } catch (error) {
      // Show error notification
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'Failed to Load Image',
        message: 'Could not access the image. Try refreshing the page or saving the image first.'
      });
    }
  }
});

// Update context menu visibility based on authentication status
function updateContextMenu() {
  const hasAuth = Object.keys(capturedData).length > 0;
  chrome.contextMenus.update('createSlackEmoji', {
    enabled: hasAuth,
    title: hasAuth ? 'Create Slack emoji' : 'Create Slack emoji (Connect Slack first)'
  });
}

// Update context menu when data changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.slackData) {
    updateContextMenu();
  }
});

// Log when extension starts

// Initial context menu update
setTimeout(updateContextMenu, 1000);