// Combined popup functionality with simplified Create tab

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

let capturedData = {};
let updateUIFunction = null;
let switchToTab = null; // Store reference to switchToTab function

// Load data from storage immediately
async function loadDataFromStorage() {
  try {
    const result = await chrome.storage.local.get('slackData');
    
    if (result.slackData && typeof result.slackData === 'object') {
      
      // Migration: If multiple workspaces exist, keep only the most recent one
      const workspaceCount = Object.keys(result.slackData).length;
      if (workspaceCount > 1) {
        const workspaces = Object.keys(result.slackData);
        const mostRecentWorkspace = workspaces[workspaces.length - 1];
        const mostRecentData = result.slackData[mostRecentWorkspace];
        
        capturedData = {};
        capturedData[mostRecentWorkspace] = mostRecentData;
        
        // Update storage with single workspace
        await chrome.storage.local.set({ slackData: capturedData });
      } else {
        capturedData = result.slackData;
      }
      
      return true;
    }
    capturedData = {};
    return false;
  } catch (error) {
    capturedData = {};
    return false;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    
    // Make sure the popup is visible
    document.body.style.display = 'block';
    document.body.style.visibility = 'visible';
    
  } catch (error) {
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
  
  if (openCreateTab || pendingEmojiCreate) {
    switchToTab('create');
    // Clear the flag
    chrome.storage.local.remove('openCreateTab');
  }
  
  // Initialize both sync and create functionality
  await initializeSyncTab();
  initializeCreateTab();
  
  // Check if we need to auto-sync (> 24 hours since last sync)
  chrome.storage.local.get(['lastSyncTime', 'slackData'], async (result) => {
    if (result.slackData && Object.keys(result.slackData).length > 0) {
      const lastSync = result.lastSyncTime || 0;
      const hoursSinceSync = (Date.now() - lastSync) / (1000 * 60 * 60);
      
      if (hoursSinceSync > 24) {
        // Show notification about auto-sync
        const syncNotification = document.createElement('div');
        syncNotification.className = 'warning-message';
        syncNotification.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <span>Data is ${Math.floor(hoursSinceSync / 24)} day(s) old. Auto-syncing...</span>
        `;
        document.querySelector('.container').insertBefore(syncNotification, document.querySelector('.tab-navigation'));
        
        // Perform auto-sync
        try {
          await chrome.runtime.sendMessage({ type: 'SYNC_TO_EMOJI_STUDIO' });
          syncNotification.classList.remove('warning-message');
          syncNotification.classList.add('success-message');
          syncNotification.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span>Data synced successfully!</span>
          `;
          
          // Remove notification after 3 seconds
          setTimeout(() => syncNotification.remove(), 3000);
          
          // Update UI to show new sync time
          if (updateUIFunction) updateUIFunction();
        } catch (error) {
          syncNotification.classList.add('error-message');
          syncNotification.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="15" y1="9" x2="9" y2="15"></line>
              <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>
            <span>Auto-sync failed. Please sync manually.</span>
          `;
        }
      }
    }
  });
  
  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    
    if (request.type === 'DATA_UPDATED') {
      if (updateUIFunction) {
        updateUIFunction();
      }
    }
    
    return true;
  });
  
  // Listen for storage changes at the top level
  chrome.storage.onChanged.addListener((changes, namespace) => {
    
    // Handle slackData changes
    if (namespace === 'local' && changes.slackData) {
      if (changes.slackData.newValue) {
        const newData = changes.slackData.newValue;
        
        // Migration: If multiple workspaces exist, keep only the most recent one
        const workspaceCount = Object.keys(newData).length;
        if (workspaceCount > 1) {
          const workspaces = Object.keys(newData);
          const mostRecentWorkspace = workspaces[workspaces.length - 1];
          const mostRecentData = newData[mostRecentWorkspace];
          
          capturedData = {};
          capturedData[mostRecentWorkspace] = mostRecentData;
          
          // Update storage with single workspace
          chrome.storage.local.set({ slackData: capturedData });
        } else {
          capturedData = newData;
        }
        
        if (updateUIFunction) {
          updateUIFunction();
        }
      }
    }
    
    // Handle new pending emoji or openCreateTab
    if (namespace === 'local' && (changes.pendingEmojiCreate || changes.openCreateTab)) {
      
      // Switch to create tab
      switchToTab('create');
      
      // If there's new pending emoji data, reinitialize the create tab
      if (changes.pendingEmojiCreate && changes.pendingEmojiCreate.newValue) {
        initializeCreateTab();
      }
    }
  });
  
  // Listen for messages from background/content scripts
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'DATA_UPDATED' && updateUIFunction) {
      // Reload data when notified
      loadDataFromStorage().then(() => {
        if (updateUIFunction) updateUIFunction();
      });
    }
    return true;
  });
  
  
});

// Sync Tab Functionality (keeping existing code)
async function initializeSyncTab() {
  
  const connectedState = document.getElementById('connectedState');
  const emptyState = document.getElementById('emptyState');
  const workspaceName = document.getElementById('workspaceName');
  const syncStatusText = document.getElementById('syncStatusText');
  const refreshButton = document.getElementById('refreshData');
  const openEmojiStudioButton = document.getElementById('openEmojiStudio');
  const autoSyncToggle = document.getElementById('autoSyncToggle');
  const syncInterval = document.getElementById('syncInterval');
  const syncStatus = document.getElementById('syncStatus');
  const syncStatusIndicator = document.getElementById('syncStatusIndicator');
  const syncStatusMessage = document.getElementById('syncStatusMessage');
  
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
  
  // Load sync settings
  async function loadSyncSettings() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_SYNC_SETTINGS' });
      const settings = response.syncSettings;
      
      // Update UI with settings
      autoSyncToggle.checked = settings.autoSyncEnabled;
      syncInterval.value = settings.syncIntervalMinutes || 60;
      syncInterval.style.display = settings.autoSyncEnabled ? 'block' : 'none';
      
      // Update sync status display
      updateSyncStatus(settings);
      
      return settings;
    } catch (error) {
      console.error('Failed to load sync settings:', error);
      return null;
    }
  }
  
  // Update sync status display
  function updateSyncStatus(settings) {
    if (settings.syncState && settings.syncState !== 'idle') {
      syncStatusIndicator.style.display = 'inline-block';
      
      // Remove all state classes
      syncStatusIndicator.classList.remove('syncing', 'success', 'error');
      
      switch (settings.syncState) {
        case 'syncing':
          syncStatusIndicator.classList.add('syncing');
          syncStatusMessage.textContent = 'Syncing...';
          break;
        case 'success':
          syncStatusIndicator.classList.add('success');
          syncStatusMessage.textContent = 'Sync complete';
          // Clear message after 3 seconds but keep the space
          setTimeout(() => {
            syncStatusIndicator.style.display = 'none';
            syncStatusMessage.textContent = '';
          }, 3000);
          break;
        case 'error':
          syncStatusIndicator.classList.add('error');
          syncStatusMessage.textContent = 'Sync failed';
          break;
      }
    } else {
      syncStatusIndicator.style.display = 'none';
      syncStatusMessage.textContent = '';
    }
  }
  
  async function updateUI() {
    
    // Always reload from storage to ensure we have latest data
    await loadDataFromStorage();
    
    const workspaceCount = Object.keys(capturedData).length;
    
    // Get sync settings and last sync time
    const syncSettings = await loadSyncSettings();
    const { lastSyncTime } = await chrome.storage.local.get('lastSyncTime');
    const effectiveLastSync = syncSettings?.lastSuccessfulSync || lastSyncTime;
    
    if (workspaceCount > 0) {
      // Show connected state, hide empty state
      connectedState.style.display = 'block';
      emptyState.style.display = 'none';
      
      // Get the first (and usually only) workspace
      const [workspace, data] = Object.entries(capturedData)[0];
      
      // Update workspace info
      workspaceName.textContent = `${workspace}.slack.com`;
      
      // Update sync status
      if (effectiveLastSync) {
        const timeSinceSync = Date.now() - effectiveLastSync;
        const hours = Math.floor(timeSinceSync / (1000 * 60 * 60));
        const minutes = Math.floor((timeSinceSync % (1000 * 60 * 60)) / (1000 * 60));
        
        let statusText = 'Last synced ';
        
        if (hours > 24) {
          statusText += `${Math.floor(hours / 24)} day${Math.floor(hours / 24) > 1 ? 's' : ''} ago`;
        } else if (hours > 0) {
          statusText += `${hours} hour${hours > 1 ? 's' : ''} ago`;
        } else if (minutes > 0) {
          statusText += `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
        } else {
          statusText += 'just now';
        }
        
        syncStatusText.textContent = statusText;
        
        // Show next sync time if auto-sync is enabled
        if (syncSettings?.autoSyncEnabled) {
          const nextSyncTime = effectiveLastSync + (syncSettings.syncIntervalMinutes * 60 * 1000);
          const timeUntilSync = nextSyncTime - Date.now();
          
          if (timeUntilSync > 0) {
            const hoursUntil = Math.floor(timeUntilSync / (1000 * 60 * 60));
            const minutesUntil = Math.floor((timeUntilSync % (1000 * 60 * 60)) / (1000 * 60));
            
            let nextSyncText = ' • Next sync in ';
            if (hoursUntil > 0) {
              nextSyncText += `${hoursUntil}h ${minutesUntil}m`;
            } else {
              nextSyncText += `${minutesUntil}m`;
            }
            syncStatusText.textContent += nextSyncText;
          } else {
            syncStatusText.textContent += ' • Sync pending';
          }
        }
      } else {
        syncStatusText.textContent = 'Never synced';
      }
      
      refreshButton.disabled = false;
    } else {
      // Show empty state, hide connected state
      connectedState.style.display = 'none';
      emptyState.style.display = 'flex';
      refreshButton.disabled = true;
    }
  }
  
  // Store reference to updateUI function globally
  updateUIFunction = updateUI;
  
  // Handle auto-sync toggle
  autoSyncToggle.addEventListener('change', async () => {
    const enabled = autoSyncToggle.checked;
    syncInterval.style.display = enabled ? 'block' : 'none';
    
    try {
      await chrome.runtime.sendMessage({
        type: 'UPDATE_SYNC_SETTINGS',
        settings: { autoSyncEnabled: enabled }
      });
      
      if (enabled) {
        // If enabling, trigger an immediate sync check
        chrome.runtime.sendMessage({ type: 'SYNC_TO_EMOJI_STUDIO' });
      }
    } catch (error) {
      console.error('Failed to update auto-sync setting:', error);
    }
  });
  
  // Handle sync interval change
  syncInterval.addEventListener('change', async () => {
    const intervalMinutes = parseInt(syncInterval.value);
    
    try {
      await chrome.runtime.sendMessage({
        type: 'UPDATE_SYNC_SETTINGS',
        settings: { syncIntervalMinutes: intervalMinutes }
      });
      
      // Update UI to show new next sync time
      await updateUI();
    } catch (error) {
      console.error('Failed to update sync interval:', error);
    }
  });
  
  // Listen for sync state updates from background
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'SYNC_STATE_UPDATED') {
      updateSyncStatus(request.syncSettings);
      // Also update main UI if sync completed
      if (request.syncSettings.syncState === 'success') {
        updateUI();
      }
    }
    return true;
  });
  
  // Refresh Data button - fetches fresh data from Slack API directly
  refreshButton.addEventListener('click', async () => {
    if (Object.keys(capturedData).length === 0) return;
    
    try {
      // Show fetching status
      syncStatusIndicator.style.display = 'inline-block';
      syncStatusIndicator.classList.remove('success', 'error');
      syncStatusIndicator.classList.add('syncing');
      syncStatusMessage.textContent = 'Fetching fresh data...';
      
      // Fetch fresh data directly from Slack API
      const fetchResponse = await chrome.runtime.sendMessage({ type: 'FETCH_FRESH_DATA' });
      
      if (fetchResponse.success) {
        // Data fetched successfully, now sync to Emoji Studio
        syncStatusMessage.textContent = 'Syncing to Emoji Studio...';
        
        const syncResponse = await chrome.runtime.sendMessage({ type: 'SYNC_TO_EMOJI_STUDIO' });
        
        if (syncResponse.success) {
          syncStatusIndicator.classList.remove('syncing', 'error');
          syncStatusIndicator.classList.add('success');
          syncStatusMessage.textContent = `Refreshed ${fetchResponse.emojiCount} emojis!`;
          
          // Reload data and update UI
          await loadDataFromStorage();
          await updateUI();
          
          // Clear message after 3 seconds
          setTimeout(() => {
            syncStatusIndicator.style.display = 'none';
            syncStatusMessage.textContent = '';
          }, 3000);
        } else {
          syncStatusIndicator.classList.remove('syncing', 'success');
          syncStatusIndicator.classList.add('error');
          syncStatusMessage.textContent = 'Sync failed';
        }
      } else {
        syncStatusIndicator.classList.remove('syncing', 'success');
        syncStatusIndicator.classList.add('error');
        
        if (fetchResponse.needsReauth) {
          syncStatusMessage.textContent = 'Please re-authenticate';
          // Open Slack emoji page for re-authentication
          const workspace = Object.keys(capturedData)[0];
          chrome.tabs.create({ url: `https://${workspace}.slack.com/customize/emoji` });
        } else {
          syncStatusMessage.textContent = fetchResponse.error || 'Failed to fetch data';
        }
        
        // Clear error message after 5 seconds
        setTimeout(() => {
          syncStatusIndicator.style.display = 'none';
          syncStatusMessage.textContent = '';
        }, 5000);
      }
    } catch (error) {
      console.error('Refresh error:', error);
      syncStatusIndicator.classList.remove('syncing', 'success');
      syncStatusIndicator.classList.add('error');
      syncStatusMessage.textContent = 'Refresh failed';
      
      setTimeout(() => {
        syncStatusIndicator.style.display = 'none';
        syncStatusMessage.textContent = '';
      }, 3000);
    }
  });
  
  // Open Emoji Studio button
  openEmojiStudioButton.addEventListener('click', () => {
    const emojiStudioUrl = getEmojiStudioUrl('/dashboard');
    chrome.tabs.create({ url: emojiStudioUrl });
  });
  
  // Initial UI update
  await updateUI();
  
  
}

// Create Tab functionality
function initializeCreateTab() {
  const emojiItems = document.getElementById('emojiItems');
  const createActions = document.getElementById('createActions');
  const emojiSummary = document.getElementById('emojiSummary');
  const clearAllButton = document.getElementById('clearAllButton');
  const createSuccessMessage = document.getElementById('createSuccessMessage');
  const createSuccessText = document.getElementById('createSuccessText');
  const createErrorMessage = document.getElementById('createErrorMessage');
  const createErrorText = document.getElementById('createErrorText');
  
  // Load and display emojis
  async function loadEmojis() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_CART_DATA' });
      const cart = response.cart || [];
      
      // Update emoji display
      if (cart.length === 0) {
        emojiItems.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">✨</div>
            <p class="empty-state-text">No emojis added yet</p>
            <p class="empty-state-subtext">Drop images/videos here or add from slackmojis.com</p>
          </div>
        `;
        createActions.style.display = 'none';
        clearAllButton.style.display = 'none';
      } else {
        // Show emoji items
        emojiItems.innerHTML = cart.map((emoji, index) => `
          <div class="emoji-item" data-index="${index}">
            <img src="${emoji.url}" alt="${emoji.name}" class="emoji-item-image">
            <div class="emoji-item-info">
              <div class="emoji-item-name">
                <input type="text" class="emoji-item-name-input" value="${emoji.name}" 
                       data-original-name="${emoji.name}" data-workspace="${emoji.workspace}"
                       pattern="[a-z0-9_\\-]+" 
                       title="Use lowercase letters, numbers, underscores, and dashes only">
              </div>
              <div class="emoji-item-source">From ${emoji.source}</div>
            </div>
            <button class="emoji-item-remove" data-name="${emoji.name}" data-workspace="${emoji.workspace}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        `).join('');
        
        createActions.style.display = 'block';
        clearAllButton.style.display = 'block';
        emojiSummary.textContent = `${cart.length} emoji${cart.length > 1 ? 's' : ''} selected`;
        
        // Attach event listener to Send to Slack button after it's visible
        attachSendToSlackListener();
        
        // Add name input listeners
        document.querySelectorAll('.emoji-item-name-input').forEach(input => {
          input.addEventListener('change', async (e) => {
            const newName = e.target.value.trim();
            const originalName = input.getAttribute('data-original-name');
            const workspace = input.getAttribute('data-workspace');
            
            // Validate name
            if (!newName || !/^[a-z0-9_-]+$/.test(newName)) {
              input.value = originalName; // Reset to original
              return;
            }
            
            // Update the emoji name in cart
            const response = await chrome.runtime.sendMessage({ type: 'GET_CART_DATA' });
            const cart = response.cart || [];
            const emojiIndex = cart.findIndex(e => e.name === originalName && e.workspace === workspace);
            
            if (emojiIndex !== -1) {
              cart[emojiIndex].name = newName;
              cart[emojiIndex].originalName = cart[emojiIndex].originalName || originalName;
              
              // Save updated cart
              await chrome.storage.local.set({ emojiCart: cart });
              
              // Update the data attributes
              input.setAttribute('data-original-name', newName);
              const removeBtn = input.closest('.emoji-item').querySelector('.emoji-item-remove');
              if (removeBtn) {
                removeBtn.setAttribute('data-name', newName);
              }
            }
          });
          
          // Add Enter key support
          input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
              e.target.blur(); // Trigger change event
            }
          });
        });
        
        // Add remove button listeners
        document.querySelectorAll('.emoji-item-remove').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.preventDefault();
            const name = btn.getAttribute('data-name');
            const workspace = btn.getAttribute('data-workspace');
            
            try {
              await chrome.runtime.sendMessage({
                type: 'REMOVE_FROM_CART',
                emojiName: name,
                workspace: workspace
              });
              loadEmojis(); // Reload emojis
            } catch (error) {
              console.error('Failed to remove emoji:', error);
            }
          });
        });
      }
    } catch (error) {
      console.error('Failed to load emojis:', error);
    }
  }
  
  // Clear all emojis
  if (clearAllButton) {
    clearAllButton.addEventListener('click', async () => {
      if (confirm('Clear all emojis?')) {
        try {
          await chrome.runtime.sendMessage({ type: 'CLEAR_CART' });
          loadEmojis();
        } catch (error) {
          console.error('Failed to clear emojis:', error);
        }
      }
    });
  }
  
  // Function to attach event listener to Send to Slack button
  function attachSendToSlackListener() {
    const sendToSlackButton = document.getElementById('sendToSlack');
    
    // Prevent duplicate listeners
    if (sendToSlackButton && sendToSlackButton.hasAttribute('data-listener-attached')) {
      return; // Already attached
    }
    
    // Send to Slack - upload directly
    if (sendToSlackButton) {
      sendToSlackButton.setAttribute('data-listener-attached', 'true');
      sendToSlackButton.addEventListener('click', async () => {
        try {
          // Hide messages
          createSuccessMessage.style.display = 'none';
          createErrorMessage.style.display = 'none';
          
          // Get emoji data
          const response = await chrome.runtime.sendMessage({ type: 'GET_CART_DATA' });
          const cart = response.cart || [];
          
          if (cart.length === 0) {
            createErrorText.textContent = 'No emojis to send';
            createErrorMessage.style.display = 'flex';
            return;
          }
          
          // Check if connected to a workspace
          await loadDataFromStorage();
          const workspaceData = Object.values(capturedData)[0];
          if (!workspaceData) {
            createErrorText.textContent = 'Connect to a Slack workspace first. Go to the Sync tab to connect.';
            createErrorMessage.style.display = 'flex';
            return;
          }
          
          // Upload directly to Slack
          await uploadEmojisToSlackDirectly(cart, workspaceData);
          
        } catch (error) {
          console.error('Failed to send to Slack:', error);
          createErrorText.textContent = 'Failed to send emojis';
          createErrorMessage.style.display = 'flex';
        }
      });
    }
  }
  
  
  // Initial load
  loadEmojis();
  
  
  // Listen for emoji updates
  chrome.runtime.onMessage.addListener((request) => {
    if (request.type === 'CART_UPDATED') {
      loadEmojis();
    }
  });
  
  // Add file input handler
  const fileInput = document.getElementById('fileInput');
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      handleFiles(e.target.files);
      // Reset the input so the same file can be selected again
      e.target.value = '';
    });
  }
  
  // Add drag and drop functionality
  let dragCounter = 0;
  
  // Prevent default drag behaviors
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    document.addEventListener(eventName, preventDefaults, false);
    emojiItems.addEventListener(eventName, preventDefaults, false);
  });
  
  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }
  
  // Highlight drop area when item is dragged over it
  ['dragenter', 'dragover'].forEach(eventName => {
    emojiItems.addEventListener(eventName, highlight, false);
  });
  
  ['dragleave', 'drop'].forEach(eventName => {
    emojiItems.addEventListener(eventName, unhighlight, false);
  });
  
  function highlight(e) {
    emojiItems.classList.add('drag-over');
  }
  
  function unhighlight(e) {
    emojiItems.classList.remove('drag-over');
  }
  
  // Handle dropped files
  emojiItems.addEventListener('drop', handleDrop, false);
  
  async function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    
    await handleFiles(files);
  }
  
  async function handleFiles(files) {
    // Check if connected to a workspace first
    await loadDataFromStorage();
    if (Object.keys(capturedData).length === 0) {
      const createErrorMessage = document.getElementById('createErrorMessage');
      const createErrorText = document.getElementById('createErrorText');
      createErrorText.textContent = 'Connect to a Slack workspace first. Go to the Sync tab to connect.';
      createErrorMessage.style.display = 'flex';
      setTimeout(() => {
        createErrorMessage.style.display = 'none';
      }, 5000);
      return;
    }
    
    const validFiles = Array.from(files).filter(file => {
      const isImage = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');
      const isGif = file.type === 'image/gif';
      return isImage || isVideo || isGif;
    });
    
    if (validFiles.length === 0) {
      alert('Please drop only image or video files');
      return;
    }
    
    // Show loading state
    const originalContent = emojiItems.innerHTML;
    emojiItems.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⏳</div>
        <p class="empty-state-text">Processing ${validFiles.length} file${validFiles.length > 1 ? 's' : ''}...</p>
      </div>
    `;
    
    // Get current cart
    const response = await chrome.runtime.sendMessage({ type: 'GET_CART_DATA' });
    const cart = response.cart || [];
    
    let processedCount = 0;
    let errorCount = 0;
    
    // Process each file
    for (const file of validFiles) {
      // Check file size (limit to 10MB for data URLs)
      if (file.size > 10 * 1024 * 1024) {
        console.warn(`File ${file.name} is too large (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
        errorCount++;
        continue;
      }
      
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        const dataUrl = e.target.result;
        
        // Generate a name from the filename
        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
        const emojiName = nameWithoutExt
          .toLowerCase()
          .replace(/[^a-z0-9_-]/g, '_')
          .replace(/_+/g, '_')
          .substring(0, 30);
        
        // Add to cart
        const result = await chrome.runtime.sendMessage({
          type: 'ADD_TO_EMOJI_CART',
          emoji: {
            name: emojiName,
            url: dataUrl,
            source: 'local upload',
            workspace: 'local',
            isLocal: true,
            mimeType: file.type,
            fileSize: file.size
          }
        });
        
        if (result.success) {
          processedCount++;
        } else {
          errorCount++;
        }
      };
      
      reader.onerror = () => {
        console.error(`Failed to read file ${file.name}`);
        errorCount++;
      };
      
      reader.readAsDataURL(file);
    }
    
    // Wait a bit for all files to process
    setTimeout(() => {
      loadEmojis(); // Reload to show the new emojis
      
      if (processedCount > 0 && errorCount === 0) {
        // Show success briefly
        createSuccessMessage.textContent = `${processedCount} file${processedCount > 1 ? 's' : ''} added!`;
        createSuccessMessage.style.display = 'flex';
        setTimeout(() => {
          createSuccessMessage.style.display = 'none';
        }, 2000);
      } else if (errorCount > 0) {
        alert(`${processedCount} file(s) added successfully. ${errorCount} file(s) failed.`);
      }
    }, 500);
  }
  
  // Also handle dragenter/dragleave on document level for better UX
  document.addEventListener('dragenter', (e) => {
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      dragCounter++;
      if (dragCounter === 1 && document.querySelector('[data-tab="create"].active')) {
        emojiItems.classList.add('drag-over');
      }
    }
  });
  
  document.addEventListener('dragleave', (e) => {
    dragCounter--;
    if (dragCounter === 0) {
      emojiItems.classList.remove('drag-over');
    }
  });
  
  document.addEventListener('drop', (e) => {
    dragCounter = 0;
    emojiItems.classList.remove('drag-over');
  });
}

// Upload emojis directly to Slack without dialog
async function uploadEmojisToSlackDirectly(emojis, workspaceData) {
  const createSuccessMessage = document.getElementById('createSuccessMessage');
  const createSuccessText = document.getElementById('createSuccessText');
  const createErrorMessage = document.getElementById('createErrorMessage');
  const createErrorText = document.getElementById('createErrorText');
  
  // Hide messages initially
  createSuccessMessage.style.display = 'none';
  createErrorMessage.style.display = 'none';
  
  // Show processing message
  createSuccessText.textContent = `Uploading ${emojis.length} emoji${emojis.length > 1 ? 's' : ''} to Slack...`;
  createSuccessMessage.style.display = 'flex';
  
  const results = [];
  let successCount = 0;
  let errorCount = 0;
  let authFailed = false;
  
  // Upload emojis one by one
  for (let i = 0; i < emojis.length; i++) {
    const emoji = emojis[i];
    
    // Update progress message
    createSuccessText.textContent = `Uploading ${i + 1} of ${emojis.length}: ${emoji.name}`;
    
    try {
      const result = await chrome.runtime.sendMessage({
        type: 'UPLOAD_EMOJI_TO_SLACK',
        emoji: emoji,
        workspaceData: workspaceData
      });
      
      if (result.success) {
        successCount++;
        results.push({
          name: emoji.name,
          success: true
        });
      } else {
        errorCount++;
        
        // Check if it's an authentication error
        if (result.error && (result.error.includes('authentication') || 
                           result.error.includes('not_authed') || 
                           result.error.includes('invalid_auth'))) {
          authFailed = true;
          results.push({
            name: emoji.name,
            success: false,
            error: result.error
          });
          // Stop trying more uploads if auth failed
          break;
        } else {
          results.push({
            name: emoji.name,
            success: false,
            error: result.error || 'Upload failed'
          });
        }
      }
    } catch (error) {
      errorCount++;
      results.push({
        name: emoji.name,
        success: false,
        error: error.message || 'Upload failed'
      });
    }
    
    // Add a small delay between uploads to avoid rate limiting
    if (i < emojis.length - 1 && !authFailed) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  // Show final results
  if (authFailed) {
    createErrorText.textContent = 'Authentication failed. Please visit your Slack workspace and try again.';
    createErrorMessage.style.display = 'flex';
    createSuccessMessage.style.display = 'none';
  } else if (successCount === emojis.length) {
    createSuccessText.textContent = `All ${successCount} emoji${successCount > 1 ? 's' : ''} uploaded successfully to Slack!`;
    createSuccessMessage.style.display = 'flex';
    
    // Clear cart on success
    await chrome.runtime.sendMessage({ type: 'CLEAR_CART' });
    
    // Auto-sync to Emoji Studio after successful upload
    createSuccessText.textContent = 'Syncing to Emoji Studio...';
    try {
      await chrome.runtime.sendMessage({ type: 'SYNC_TO_EMOJI_STUDIO' });
      createSuccessText.textContent = `All ${successCount} emoji${successCount > 1 ? 's' : ''} uploaded and synced!`;
    } catch (syncError) {
      // Sync failed but uploads succeeded
      createSuccessText.textContent = `${successCount} emoji${successCount > 1 ? 's' : ''} uploaded. Manual sync required.`;
    }
    
    // Reload the emoji list after a short delay
    setTimeout(() => {
      initializeCreateTab();
    }, 2000);
  } else if (successCount > 0) {
    createSuccessText.textContent = `${successCount} succeeded, ${errorCount} failed. Check failed emojis in your cart.`;
    createSuccessMessage.style.display = 'flex';
    
    // Remove successful emojis from cart
    const failedEmojis = results.filter(r => !r.success).map(r => r.name);
    const response = await chrome.runtime.sendMessage({ type: 'GET_CART_DATA' });
    const currentCart = response.cart || [];
    const updatedCart = currentCart.filter(emoji => failedEmojis.includes(emoji.name));
    await chrome.storage.local.set({ emojiCart: updatedCart });
    
    // Auto-sync to Emoji Studio after partial upload
    if (successCount > 0) {
      createSuccessText.textContent = 'Syncing successful uploads to Emoji Studio...';
      try {
        await chrome.runtime.sendMessage({ type: 'SYNC_TO_EMOJI_STUDIO' });
        createSuccessText.textContent = `${successCount} succeeded, ${errorCount} failed. Changes synced.`;
      } catch (syncError) {
        // Keep the original message if sync fails
      }
    }
    
    // Reload the emoji list
    setTimeout(() => {
      initializeCreateTab();
    }, 2000);
  } else {
    createErrorText.textContent = 'All uploads failed. Please check your connection and try again.';
    createErrorMessage.style.display = 'flex';
    createSuccessMessage.style.display = 'none';
  }
}

// Show Slack upload dialog
function showSlackUploadDialog(emojis, workspaceData) {
  // Create dialog overlay
  const dialog = document.createElement('div');
  dialog.className = 'upload-dialog-overlay';
  dialog.innerHTML = `
    <div class="upload-dialog">
      <div class="upload-dialog-header">
        <h3>Upload to Slack</h3>
        <button class="upload-dialog-close" id="closeUploadDialog">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      
      <div class="upload-dialog-content">
        <div class="upload-dialog-info">
          <p class="upload-dialog-workspace">
            Uploading to <strong>${workspaceData.workspace}.slack.com</strong>
          </p>
          <p class="upload-dialog-count">
            ${emojis.length} emoji${emojis.length > 1 ? 's' : ''} ready to upload
          </p>
        </div>
        
        <div class="upload-dialog-choice">
          <button class="button button-primary full-width" id="uploadDirectlyBtn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"></path>
              <path d="M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0z"></path>
            </svg>
            Upload Directly to Slack
          </button>
          
          <div class="upload-dialog-or">or</div>
          
          <button class="button button-secondary full-width" id="useEmojiStudioBtn">
            <img src="logo.png" width="16" height="16" alt="Emoji Studio">
            Open in Emoji Studio App
          </button>
        </div>
        
        <div class="upload-progress" id="uploadProgress" style="display: none;">
          <div class="upload-progress-bar">
            <div class="upload-progress-fill" id="uploadProgressFill"></div>
          </div>
          <p class="upload-progress-text" id="uploadProgressText">Uploading...</p>
        </div>
        
        <div class="upload-results" id="uploadResults" style="display: none;">
          <div class="upload-results-summary" id="uploadResultsSummary"></div>
          <div class="upload-results-list" id="uploadResultsList"></div>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(dialog);
  
  // Add event listeners
  document.getElementById('closeUploadDialog').addEventListener('click', () => {
    dialog.remove();
  });
  
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) {
      dialog.remove();
    }
  });
  
  document.getElementById('uploadDirectlyBtn').addEventListener('click', async () => {
    await uploadEmojisDirectly(emojis, workspaceData, dialog);
  });
  
  document.getElementById('useEmojiStudioBtn').addEventListener('click', async () => {
    // Original behavior - open in Emoji Studio app
    // Separate local uploads from slackmojis emojis
    const localEmojis = emojis.filter(e => e.isLocal);
    const slackEmojis = emojis.filter(e => !e.isLocal);
    
    // Prepare data for Emoji Studio
    const emojiData = {
      workspace: workspaceData.workspace,
      authData: workspaceData,
      emojis: emojis,
      source: 'extension-cart',
      hasLocalUploads: localEmojis.length > 0
    };
    
    // Store data for Emoji Studio
    await chrome.storage.local.set({
      pendingEmojiStudioCart: emojiData,
      pendingExtensionData: workspaceData
    });
    
    // Open Emoji Studio
    const emojiStudioUrl = getEmojiStudioUrl('/create?from=extension-cart');
    chrome.tabs.create({ url: emojiStudioUrl });
    
    // Clear emojis after sending
    await chrome.runtime.sendMessage({ type: 'CLEAR_CART' });
    
    dialog.remove();
    
    // Reload the emoji list
    initializeCreateTab();
  });
}

// Upload emojis directly to Slack
async function uploadEmojisDirectly(emojis, workspaceData, dialog) {
  const progressSection = document.getElementById('uploadProgress');
  const progressFill = document.getElementById('uploadProgressFill');
  const progressText = document.getElementById('uploadProgressText');
  const resultsSection = document.getElementById('uploadResults');
  const resultsSummary = document.getElementById('uploadResultsSummary');
  const resultsList = document.getElementById('uploadResultsList');
  const choiceSection = dialog.querySelector('.upload-dialog-choice');
  
  // Hide choice buttons, show progress
  choiceSection.style.display = 'none';
  progressSection.style.display = 'block';
  
  const results = [];
  let successCount = 0;
  let errorCount = 0;
  let authFailed = false;
  
  // Upload emojis one by one
  for (let i = 0; i < emojis.length; i++) {
    const emoji = emojis[i];
    const progress = ((i + 1) / emojis.length) * 100;
    
    progressFill.style.width = `${progress}%`;
    progressText.textContent = `Uploading ${i + 1} of ${emojis.length}: ${emoji.name}`;
    
    try {
      const result = await chrome.runtime.sendMessage({
        type: 'UPLOAD_EMOJI_TO_SLACK',
        emoji: emoji,
        workspaceData: workspaceData
      });
      
      if (result.success) {
        successCount++;
        results.push({
          name: emoji.name,
          success: true
        });
      } else {
        errorCount++;
        
        // Check if it's an authentication error
        if (result.error && (result.error.includes('authentication') || 
                           result.error.includes('not_authed') || 
                           result.error.includes('invalid_auth'))) {
          authFailed = true;
          results.push({
            name: emoji.name,
            success: false,
            error: result.error
          });
          // Stop trying more uploads if auth failed
          break;
        } else {
          results.push({
            name: emoji.name,
            success: false,
            error: result.error || 'Upload failed'
          });
        }
      }
    } catch (error) {
      errorCount++;
      results.push({
        name: emoji.name,
        success: false,
        error: error.message || 'Upload failed'
      });
    }
    
    // Add a small delay between uploads to avoid rate limiting
    if (i < emojis.length - 1 && !authFailed) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  // Show results
  progressSection.style.display = 'none';
  resultsSection.style.display = 'block';
  
  // Update summary
  if (authFailed) {
    resultsSummary.innerHTML = `
      <div class="upload-error">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <span>Authentication Failed</span>
      </div>
      <p style="margin-top: 12px; color: #6b7280; font-size: 13px; line-height: 1.5;">
        Your Slack session has expired. To fix this:
      </p>
      <ol style="margin: 8px 0 0 20px; color: #6b7280; font-size: 13px; line-height: 1.6;">
        <li>Click "Visit Slack" below</li>
        <li>Sign in to your workspace</li>
        <li>Return here and try uploading again</li>
      </ol>
      <button id="visitSlackBtn" style="
        margin-top: 12px;
        background: #4a154b;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 4px;
        font-size: 13px;
        cursor: pointer;
        font-weight: 500;
      ">Visit Slack</button>
    `;
    
    // Add click handler for Visit Slack button
    setTimeout(() => {
      const visitBtn = document.getElementById('visitSlackBtn');
      if (visitBtn) {
        visitBtn.addEventListener('click', () => {
          const workspace = workspaceData.workspace;
          if (workspace) {
            chrome.tabs.create({ url: `https://${workspace}.slack.com/customize/emoji` });
          }
        });
      }
    }, 100);
  } else if (successCount === emojis.length) {
    resultsSummary.innerHTML = `
      <div class="upload-success">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="9 12 12 15 16 10"></polyline>
        </svg>
        <span>All ${successCount} emoji${successCount > 1 ? 's' : ''} uploaded successfully!</span>
      </div>
    `;
  } else if (successCount > 0) {
    resultsSummary.innerHTML = `
      <div class="upload-mixed">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <span>${successCount} succeeded, ${errorCount} failed</span>
      </div>
    `;
  } else {
    resultsSummary.innerHTML = `
      <div class="upload-error">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="15" y1="9" x2="9" y2="15"></line>
          <line x1="9" y1="9" x2="15" y2="15"></line>
        </svg>
        <span>All uploads failed</span>
      </div>
    `;
  }
  
  // Show individual results if there were errors
  if (errorCount > 0) {
    const errorResults = results.filter(r => !r.success);
    resultsList.innerHTML = `
      <h4>Failed uploads:</h4>
      ${errorResults.map(r => `
        <div class="upload-result-item error">
          <span class="emoji-name">:${r.name}:</span>
          <span class="error-message">${r.error}</span>
        </div>
      `).join('')}
    `;
  }
  
  // Clear cart if all successful
  if (successCount === emojis.length) {
    await chrome.runtime.sendMessage({ type: 'CLEAR_CART' });
    
    // Auto-close dialog after 3 seconds
    setTimeout(() => {
      dialog.remove();
      initializeCreateTab(); // Reload the list
    }, 3000);
  } else {
    // Add a button to close and optionally retry failed ones
    resultsList.innerHTML += `
      <div class="upload-results-actions">
        <button class="button button-secondary" id="closeResultsBtn">Close</button>
      </div>
    `;
    
    document.getElementById('closeResultsBtn').addEventListener('click', () => {
      dialog.remove();
      initializeCreateTab(); // Reload to show remaining emojis
    });
  }
}

// Create tab functionality for managing emojis
