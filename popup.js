// Combined popup functionality with simplified Create tab
console.log('[POPUP] Script loaded');
console.log('[POPUP] Document readyState:', document.readyState);
console.log('[POPUP] Window location:', window.location.href);

// Environment configuration
const EMOJI_STUDIO_URLS = {
  development: 'http://localhost:3000',
  production: 'https://app.emojistudio.xyz'
};

// Force production mode - set this to true to always use production URLs
const FORCE_PRODUCTION = false; // Change to true to always use production

// Detect environment - check if localhost is accessible
let currentEnvironment = 'production'; // default to production

function detectEnvironment() {
  return new Promise((resolve) => {
    // If force production is enabled, skip detection
    if (FORCE_PRODUCTION) {
      currentEnvironment = 'production';
      console.log('[POPUP] Environment forced to production (app.emojistudio.xyz)');
      resolve('production');
      return;
    }
    
    // Try to fetch from localhost to detect if we're in development
    // Use a more specific endpoint that would only exist in Emoji Studio
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 second timeout
    
    fetch('http://localhost:3000/api/slack/workspaces', { 
      method: 'GET',
      signal: controller.signal,
      headers: {
        'Accept': 'application/json'
      }
    })
      .then(response => {
        clearTimeout(timeoutId);
        // Only consider it development if we get a valid response
        if (response.ok || response.status === 401 || response.status === 404) {
          currentEnvironment = 'development';
          console.log('[POPUP] Environment detected: development (localhost:3000)');
          resolve('development');
        } else {
          currentEnvironment = 'production';
          console.log('[POPUP] Environment detected: production (app.emojistudio.xyz)');
          resolve('production');
        }
      })
      .catch(() => {
        clearTimeout(timeoutId);
        currentEnvironment = 'production';
        console.log('[POPUP] Environment detected: production (app.emojistudio.xyz)');
        resolve('production');
      });
  });
}

function getEmojiStudioUrl(path = '') {
  const baseUrl = EMOJI_STUDIO_URLS[currentEnvironment];
  return path ? `${baseUrl}${path}` : baseUrl;
}

let capturedData = {};
let updateUIFunction = null;
let switchToTab = null; // Store reference to switchToTab function

// Load data from storage immediately
async function loadDataFromStorage() {
  try {
    const result = await chrome.storage.local.get('slackData');
    console.log('[POPUP] Storage result:', result);
    
    if (result.slackData && typeof result.slackData === 'object') {
      capturedData = result.slackData;
      console.log('[POPUP] Loaded data for workspaces:', Object.keys(capturedData));
      return true;
    }
    return false;
  } catch (error) {
    console.error('[POPUP] Error loading from storage:', error);
    return false;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    console.log('[POPUP] DOM loaded, initializing...');
    console.log('[POPUP] Extension popup is opening successfully');
    console.log('[POPUP] Current URL:', window.location.href);
    
    // Make sure the popup is visible
    document.body.style.display = 'block';
    document.body.style.visibility = 'visible';
    
    // Debug: Check all storage
    const allStorage = await chrome.storage.local.get();
    console.log('[POPUP] All storage on load:', Object.keys(allStorage));
    if (allStorage.pendingEmojiCreate) {
      console.log('[POPUP] pendingEmojiCreate found in storage, length:', allStorage.pendingEmojiCreate.imageUrl?.length);
    }
  } catch (error) {
    console.error('[POPUP] Error during initialization:', error);
  }
  
  // Load data first thing
  await loadDataFromStorage();
  
  // Tab navigation
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');
  
  // Function to switch tabs
  switchToTab = function(tabName) {
    tabButtons.forEach(btn => btn.classList.remove('active'));
    tabContents.forEach(content => content.classList.remove('active'));
    
    const targetButton = document.querySelector(`[data-tab="${tabName}"]`);
    const targetContent = document.getElementById(`${tabName}Tab`);
    
    if (targetButton && targetContent) {
      targetButton.classList.add('active');
      targetContent.classList.add('active');
    }
  };
  
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const targetTab = button.getAttribute('data-tab');
      switchToTab(targetTab);
    });
  });
  
  // Check if we should open the create tab
  const { openCreateTab, pendingEmojiCreate } = await chrome.storage.local.get(['openCreateTab', 'pendingEmojiCreate']);
  console.log('[POPUP] Checking for create tab trigger:', { openCreateTab, hasPendingEmoji: !!pendingEmojiCreate });
  
  if (openCreateTab || pendingEmojiCreate) {
    console.log('[POPUP] Switching to Create tab for pending emoji');
    switchToTab('create');
    // Clear the flag
    chrome.storage.local.remove('openCreateTab');
  }
  
  // Initialize both sync and create functionality
  await initializeSyncTab();
  initializeCreateTab();
  
  // Listen for storage changes at the top level
  chrome.storage.onChanged.addListener((changes, namespace) => {
    console.log('[POPUP] Storage changed:', namespace, Object.keys(changes));
    
    // Handle slackData changes
    if (namespace === 'local' && changes.slackData) {
      if (changes.slackData.newValue) {
        capturedData = changes.slackData.newValue;
        console.log('[POPUP] Updated data from storage change');
        if (updateUIFunction) {
          updateUIFunction();
        }
      }
    }
    
    // Handle new pending emoji or openCreateTab
    if (namespace === 'local' && (changes.pendingEmojiCreate || changes.openCreateTab)) {
      console.log('[POPUP] Detected new pending emoji or create tab trigger');
      
      // Switch to create tab
      switchToTab('create');
      
      // If there's new pending emoji data, reinitialize the create tab
      if (changes.pendingEmojiCreate && changes.pendingEmojiCreate.newValue) {
        console.log('[POPUP] New pending emoji detected, reinitializing create tab');
        initializeCreateTab();
      }
    }
  });
  
  // Listen for messages from background/content scripts
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[POPUP] Received message:', request.type);
    if (request.type === 'DATA_UPDATED' && updateUIFunction) {
      // Reload data when notified
      loadDataFromStorage().then(() => {
        if (updateUIFunction) updateUIFunction();
      });
    }
    return true;
  });
  
  // Add keyboard shortcut for debugging - press 'd' to dump storage
  document.addEventListener('keypress', async (e) => {
    if (e.key === 'd') {
      await debugStorage();
      console.log('Current capturedData:', capturedData);
    }
  });
});

// Sync Tab Functionality (keeping existing code)
async function initializeSyncTab() {
  console.log('[POPUP] Initializing sync tab');
  
  const statusIndicator = document.getElementById('statusIndicator');
  const statusText = document.getElementById('statusText');
  const workspaceList = document.getElementById('workspaceList');
  const sendButton = document.getElementById('sendToEmojiStudio');
  const clearButton = document.getElementById('clearData');
  const lastRefreshedDiv = document.getElementById('lastRefreshed');
  const lastRefreshedText = document.getElementById('lastRefreshedText');
  const refreshButton = document.getElementById('refreshButton');
  
  // Load data again to be sure
  await loadDataFromStorage();
  
  function formatTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days} day${days === 1 ? '' : 's'} ago`;
    if (hours > 0) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    if (minutes > 0) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    if (seconds > 30) return `${seconds} seconds ago`;
    return 'Just now';
  }
  
  async function updateUI() {
    console.log('[POPUP] updateUI called, current capturedData:', capturedData);
    
    // Always reload from storage to ensure we have latest data
    await loadDataFromStorage();
    
    const workspaceCount = Object.keys(capturedData).length;
    console.log('[POPUP] Workspace count:', workspaceCount);
    
    // Get last sync time from storage
    const { lastSyncTime } = await chrome.storage.local.get('lastSyncTime');
    
    if (workspaceCount > 0) {
      statusIndicator.className = 'status-indicator status-connected';
      statusText.textContent = `${workspaceCount} workspace${workspaceCount > 1 ? 's' : ''} connected`;
      
      // Build workspace list HTML
      let html = '';
      for (const [workspace, data] of Object.entries(capturedData)) {
        const hasEmojiCount = data.emojiCount !== null && data.emojiCount !== undefined;
        html += `
          <div class="workspace-item">
            <div class="workspace-info">
              <div class="workspace-name">${workspace}.slack.com</div>
              ${hasEmojiCount ? `<div class="emoji-count">${data.emojiCount} custom emoji${data.emojiCount !== 1 ? 's' : ''}</div>` : '<div class="emoji-count loading">Loading emoji count...</div>'}
            </div>
          </div>
        `;
      }
      
      workspaceList.innerHTML = html;
      sendButton.disabled = false;
      
      // Show/update last refreshed time
      if (lastSyncTime) {
        lastRefreshedDiv.style.display = 'flex';
        lastRefreshedText.textContent = formatTimeAgo(lastSyncTime);
      }
    } else {
      statusIndicator.className = 'status-indicator status-disconnected';
      statusText.textContent = 'No workspaces connected';
      workspaceList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📡</div>
          <p class="empty-state-text">Navigate to your Slack workspace and go to the emoji customization page to connect</p>
          <p class="empty-state-subtext">Visit <strong>workspace.slack.com/customize/emoji</strong></p>
        </div>
      `;
      sendButton.disabled = true;
      lastRefreshedDiv.style.display = 'none';
    }
  }
  
  // Store reference to updateUI function globally
  updateUIFunction = updateUI;
  
  sendButton.addEventListener('click', async () => {
    if (Object.keys(capturedData).length === 0) return;
    
    const now = Date.now();
    const dataToSend = Object.values(capturedData)[0];
    
    try {
      await chrome.storage.local.set({ 
        pendingExtensionData: dataToSend,
        lastSyncTime: now
      });
      
      chrome.runtime.sendMessage({ type: 'SYNC_TO_EMOJI_STUDIO' });
      
      // Update last refreshed time immediately
      lastRefreshedDiv.style.display = 'flex';
      lastRefreshedText.textContent = formatTimeAgo(now);
    } catch (error) {
      console.error('Error syncing to Emoji Studio:', error);
    }
  });
  
  clearButton.addEventListener('click', async () => {
    if (confirm('This will clear all stored Slack workspace data. Continue?')) {
      capturedData = {};
      await chrome.storage.local.remove(['slackData', 'lastSyncTime']);
      chrome.runtime.sendMessage({ type: 'CLEAR_DATA' });
      await updateUI();
    }
  });
  
  refreshButton.addEventListener('click', async () => {
    refreshButton.disabled = true;
    refreshButton.classList.add('refreshing');
    
    console.log('[POPUP] Refresh button clicked, updating emoji counts');
    
    if (Object.keys(capturedData).length === 0) {
      alert('No connected workspaces to refresh. Please connect a Slack workspace first.');
      refreshButton.classList.remove('refreshing');
      refreshButton.disabled = false;
      return;
    }
    
    try {
      // Send message to background script to refresh emoji counts
      chrome.runtime.sendMessage({ type: 'REFRESH_EMOJI_COUNTS' }, (response) => {
        console.log('[POPUP] Refresh response:', response);
        
        // Update the last sync time
        const now = Date.now();
        chrome.storage.local.set({ lastSyncTime: now });
        
        // Update UI to show new data
        setTimeout(async () => {
          await loadDataFromStorage();
          await updateUI();
          refreshButton.classList.remove('refreshing');
          refreshButton.disabled = false;
        }, 1000);
      });
    } catch (error) {
      console.error('[POPUP] Failed to refresh emoji counts:', error);
      refreshButton.classList.remove('refreshing');
      refreshButton.disabled = false;
    }
  });
  
  // Initial UI update
  await updateUI();
  
  // Update the refresh time every minute
  setInterval(() => {
    chrome.storage.local.get('lastSyncTime', ({ lastSyncTime }) => {
      if (lastSyncTime && lastRefreshedDiv.style.display === 'flex') {
        lastRefreshedText.textContent = formatTimeAgo(lastSyncTime);
      }
    });
  }, 60000);
  
  // Try to update emoji counts periodically
  let updateCount = 0;
  const emojiCountInterval = setInterval(async () => {
    await loadDataFromStorage();
    await updateUI();
    updateCount++;
    if (updateCount >= 5) {
      clearInterval(emojiCountInterval);
    }
  }, 3000);
}

// Simplified Create Tab - just send to Emoji Studio
function initializeCreateTab() {
  const fileInput = document.getElementById('fileInput');
  const selectFileButton = document.getElementById('selectFileButton');
  const previewSection = document.getElementById('previewSection');
  const previewImage = document.getElementById('previewImage');
  const previewLoading = document.getElementById('previewLoading');
  const successMessage = document.getElementById('successMessage');
  const successText = document.getElementById('successText');
  const errorMessage = document.getElementById('errorMessage');
  const errorText = document.getElementById('errorText');
  
  async function sendToEmojiStudio(imageUrl) {
    console.log('[POPUP] Redirecting to Emoji Studio create page');
    
    // Detect environment first
    await detectEnvironment();
    
    // Store the image data for Emoji Studio to pick up
    await chrome.storage.local.set({
      pendingEmojiStudioCreate: {
        imageUrl: imageUrl,
        timestamp: Date.now()
      }
    });
    
    // Open Emoji Studio create page
    const emojiStudioUrl = getEmojiStudioUrl('/create?from=extension');
    await chrome.tabs.create({ url: emojiStudioUrl });
    
    // Close the popup by clearing the pending data that opened it
    chrome.storage.local.remove(['pendingEmojiCreate', 'openCreateTab']);
    chrome.action.setBadgeText({ text: '' });
    
    // Close the popup window
    window.close();
  }
  
  // Check for pending emoji from context menu
  console.log('[POPUP] Create tab initialized, checking for pending emoji...');
  chrome.storage.local.get('pendingEmojiCreate', async (result) => {
    console.log('[POPUP] Pending emoji check result:', result);
    console.log('[POPUP] Has pendingEmojiCreate:', !!result.pendingEmojiCreate);
    
    if (result.pendingEmojiCreate) {
      const { imageUrl } = result.pendingEmojiCreate;
      console.log('[POPUP] Found pending emoji, imageUrl length:', imageUrl?.length);
      
      // Show preview
      console.log('[POPUP] Preview elements:', { 
        previewSection: !!previewSection, 
        previewImage: !!previewImage,
        previewLoading: !!previewLoading 
      });
      
      if (previewSection && previewImage) {
        console.log('[POPUP] Showing preview...');
        previewSection.style.display = 'block';
        previewImage.src = imageUrl;
        if (previewLoading) previewLoading.style.display = 'none';
      } else {
        console.error('[POPUP] Preview elements not found!');
      }
      
      // Show a button to send to Emoji Studio instead of doing it automatically
      if (typeof showSuccess === 'function') {
        showSuccess('Image loaded! Click "Send to Emoji Studio" when ready.');
      } else {
        console.log('[POPUP] showSuccess function not available yet');
      }
      
      // Add a send button if it doesn't exist
      const sendButton = document.getElementById('sendToEmojiStudioButton');
      console.log('[POPUP] Existing send button:', !!sendButton);
      
      if (!sendButton && previewSection) {
        console.log('[POPUP] Creating send button...');
        const button = document.createElement('button');
        button.id = 'sendToEmojiStudioButton';
        button.className = 'button button-primary';
        button.style.marginTop = '16px';
        button.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="5" y1="12" x2="19" y2="12"></line>
            <polyline points="12 5 19 12 12 19"></polyline>
          </svg>
          Send to Emoji Studio
        `;
        button.onclick = async () => {
          await sendToEmojiStudio(imageUrl);
          chrome.storage.local.remove('pendingEmojiCreate');
          // Clear the badge
          chrome.action.setBadgeText({ text: '' });
        };
        previewSection.appendChild(button);
        console.log('[POPUP] Send button created and appended');
      } else if (!previewSection) {
        console.error('[POPUP] Cannot create button - previewSection is null');
      }
    }
  });
  
  if (selectFileButton) {
    selectFileButton.addEventListener('click', () => {
      fileInput.click();
    });
  }
  
  if (fileInput) {
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      hideAllMessages();
      if (previewSection) previewSection.style.display = 'block';
      if (previewLoading) previewLoading.style.display = 'flex';
      
      // Convert to data URL and show preview
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUrl = e.target.result;
        if (previewImage) previewImage.src = dataUrl;
        if (previewLoading) previewLoading.style.display = 'none';
        
        // Show success message and add send button
        showSuccess('Image loaded! Click "Send to Emoji Studio" when ready.');
        
        // Add a send button if it doesn't exist
        const sendButton = document.getElementById('sendToEmojiStudioButton');
        if (!sendButton && previewSection) {
          const button = document.createElement('button');
          button.id = 'sendToEmojiStudioButton';
          button.className = 'button button-primary';
          button.style.marginTop = '16px';
          button.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="5" y1="12" x2="19" y2="12"></line>
              <polyline points="12 5 19 12 12 19"></polyline>
            </svg>
            Send to Emoji Studio
          `;
          button.onclick = async () => {
            await sendToEmojiStudio(dataUrl);
          };
          previewSection.appendChild(button);
        }
      };
      reader.readAsDataURL(file);
    });
  }
  
  function hideAllMessages() {
    if (successMessage) successMessage.style.display = 'none';
    if (errorMessage) errorMessage.style.display = 'none';
    const warningMessage = document.getElementById('warningMessage');
    if (warningMessage) warningMessage.style.display = 'none';
  }
  
  function showSuccess(message) {
    if (successText) successText.textContent = message;
    if (successMessage) successMessage.style.display = 'flex';
  }
  
  function showError(message) {
    if (errorText) errorText.textContent = message;
    if (errorMessage) errorMessage.style.display = 'flex';
  }
}