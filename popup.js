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
      // Migration: If multiple workspaces exist, keep only the most recent one
      const workspaceCount = Object.keys(result.slackData).length;
      if (workspaceCount > 1) {
        console.log('[POPUP] Multiple workspaces detected, keeping only the most recent');
        const workspaces = Object.keys(result.slackData);
        const mostRecentWorkspace = workspaces[workspaces.length - 1];
        const mostRecentData = result.slackData[mostRecentWorkspace];
        
        capturedData = {};
        capturedData[mostRecentWorkspace] = mostRecentData;
        
        // Update storage with single workspace
        await chrome.storage.local.set({ slackData: capturedData });
        console.log('[POPUP] Migration complete - kept workspace:', mostRecentWorkspace);
      } else {
        capturedData = result.slackData;
      }
      
      console.log('[POPUP] Loaded data for workspace:', Object.keys(capturedData));
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
        const newData = changes.slackData.newValue;
        
        // Migration: If multiple workspaces exist, keep only the most recent one
        const workspaceCount = Object.keys(newData).length;
        if (workspaceCount > 1) {
          console.log('[POPUP] Multiple workspaces in storage change, migrating...');
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
      statusText.textContent = 'Workspace connected';
      
      // Build workspace list HTML - now only showing one workspace
      let html = '';
      for (const [workspace, data] of Object.entries(capturedData)) {
        html += `
          <div class="workspace-item">
            <div class="workspace-info">
              <div class="workspace-name">${workspace}.slack.com</div>
            </div>
          </div>
        `;
      }
      
      workspaceList.innerHTML = html;
      sendButton.disabled = false;
    } else {
      statusIndicator.className = 'status-indicator status-disconnected';
      statusText.textContent = 'No workspace connected';
      workspaceList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📡</div>
          <p class="empty-state-text">Navigate to your Slack workspace and go to the emoji customization page to connect</p>
          <p class="empty-state-subtext">Visit <strong>workspace.slack.com/customize/emoji</strong></p>
        </div>
      `;
      sendButton.disabled = true;
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
      
      // Successfully synced
    } catch (error) {
      console.error('Error syncing to Emoji Studio:', error);
    }
  });
  
  // Initial UI update
  await updateUI();
  
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
  const createTab = document.getElementById('createTab');
  const dragZoneHint = document.getElementById('dragZoneHint');
  
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
        if (dragZoneHint) dragZoneHint.style.display = 'none';
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
      if (dragZoneHint) dragZoneHint.style.display = 'none';
      if (previewSection) previewSection.style.display = 'block';
      if (previewLoading) previewLoading.style.display = 'flex';
      
      // Convert to data URL and show preview
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUrl = e.target.result;
        
        // Handle different file types
        if (file.type.startsWith('video/')) {
          if (previewImage) {
            previewImage.style.display = 'none';
          }
          showSuccess('Video loaded! Click "Send to Emoji Studio" to convert to emoji.');
        } else {
          if (previewImage) {
            previewImage.style.display = 'block';
            previewImage.src = dataUrl;
          }
          showSuccess('Image loaded! Click "Send to Emoji Studio" when ready.');
        }
        
        if (previewLoading) previewLoading.style.display = 'none';
        
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
  
  // Add drag and drop functionality to Create tab
  if (createTab) {
    let dragCounter = 0; // Track drag enter/leave events
    
    createTab.addEventListener('dragenter', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter++;
      createTab.classList.add('drag-over');
    });
    
    createTab.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter--;
      if (dragCounter === 0) {
        createTab.classList.remove('drag-over');
      }
    });
    
    createTab.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    
    createTab.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter = 0;
      createTab.classList.remove('drag-over');
      
      const files = Array.from(e.dataTransfer.files);
      console.log('[POPUP] Files dropped:', files.length);
      
      // Filter for valid file types
      const validFile = files.find(file => {
        const isImage = file.type.startsWith('image/');
        const isVideo = file.type.startsWith('video/');
        const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');
        return isImage || isVideo || isGif;
      });
      
      if (!validFile) {
        showError('Please drop an image, GIF, or video file');
        return;
      }
      
      console.log('[POPUP] Processing dropped file:', validFile.name, validFile.type);
      
      hideAllMessages();
      if (dragZoneHint) dragZoneHint.style.display = 'none';
      if (previewSection) previewSection.style.display = 'block';
      if (previewLoading) previewLoading.style.display = 'flex';
      
      // Convert to data URL and show preview
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUrl = e.target.result;
        
        // For video files, show a placeholder or first frame
        if (validFile.type.startsWith('video/')) {
          if (previewImage) {
            previewImage.style.display = 'none';
          }
          showSuccess('Video loaded! Click "Send to Emoji Studio" to convert to emoji.');
        } else {
          if (previewImage) {
            previewImage.style.display = 'block';
            previewImage.src = dataUrl;
          }
          showSuccess('Image loaded! Click "Send to Emoji Studio" when ready.');
        }
        
        if (previewLoading) previewLoading.style.display = 'none';
        
        // Add a send button if it doesn't exist
        let sendButton = document.getElementById('sendToEmojiStudioButton');
        if (!sendButton && previewSection) {
          sendButton = document.createElement('button');
          sendButton.id = 'sendToEmojiStudioButton';
          sendButton.className = 'button button-primary';
          sendButton.style.marginTop = '16px';
          sendButton.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="5" y1="12" x2="19" y2="12"></line>
              <polyline points="12 5 19 12 12 19"></polyline>
            </svg>
            Send to Emoji Studio
          `;
          previewSection.appendChild(sendButton);
        }
        
        // Update or add click handler
        if (sendButton) {
          sendButton.onclick = async () => {
            await sendToEmojiStudio(dataUrl);
          };
        }
      };
      
      reader.onerror = () => {
        if (previewLoading) previewLoading.style.display = 'none';
        showError('Failed to read file. Please try again.');
      };
      
      reader.readAsDataURL(validFile);
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