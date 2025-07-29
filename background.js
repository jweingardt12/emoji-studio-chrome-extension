let capturedData = {};
let pendingRequestData = new Map();
let lastNotificationTime = {}; // Track last notification time per workspace

// Environment configuration
const EMOJI_STUDIO_URLS = {
  development: 'http://localhost:3001',
  production: 'https://app.emojistudio.xyz'
};

// Force production mode - set this to true to always use production URLs
const FORCE_PRODUCTION = true; // Always use production for Chrome Store

// Detect environment - check if localhost is accessible
let currentEnvironment = 'production'; // default to production

function detectEnvironment() {
  // If force production is enabled, skip detection
  if (FORCE_PRODUCTION) {
    currentEnvironment = 'production';
    return;
  }
  
  // Try to fetch from localhost to detect if we're in development
  // Use a more specific endpoint that would only exist in Emoji Studio
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 second timeout
  
  fetch('http://localhost:3001/api/slack/workspaces', { 
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
      } else {
        currentEnvironment = 'production';
      }
    })
    .catch(() => {
      clearTimeout(timeoutId);
      currentEnvironment = 'production';
    });
}

function getEmojiStudioUrl(path = '') {
  const baseUrl = EMOJI_STUDIO_URLS[currentEnvironment];
  return path ? `${baseUrl}${path}` : baseUrl;
}


// Detect environment on startup
detectEnvironment();

// Initialize the extension and set up alarms
chrome.runtime.onInstalled.addListener(() => {
  
  // Set up alarm for auto-sync every 24 hours
  chrome.alarms.create('autoSync', {
    periodInMinutes: 24 * 60 // 24 hours
  });
  
  // Load existing data from storage
  chrome.storage.local.get('slackData', (result) => {
    if (result.slackData) {
      capturedData = result.slackData;
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
chrome.storage.local.get('slackData', (result) => {
  if (result.slackData) {
    capturedData = result.slackData;
    
    // Update badge if we have data
    if (Object.keys(capturedData).length > 0) {
      chrome.action.setBadgeText({ text: '✓' });
      chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
    }
  } else {
  }
});

// Handle alarm events
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'autoSync') {
    checkAndAutoSync();
  }
});


// Function to sync data to Emoji Studio
function syncToEmojiStudio() {
  if (Object.keys(capturedData).length === 0) {
    return;
  }
  
  const now = Date.now();
  const dataToSend = Object.values(capturedData)[0];
  
  try {
    // Find Emoji Studio tab or create one
    const emojiStudioUrl = getEmojiStudioUrl('/?extension=true');
    const baseUrl = getEmojiStudioUrl('');
    
    chrome.tabs.query({ url: [`${baseUrl}/*`] }, (tabs) => {
      
      chrome.storage.local.set({ 
        pendingExtensionData: dataToSend,
        lastSyncTime: now
      }, () => {
        if (tabs.length > 0) {
          // Use existing tab
          const tabId = tabs[0].id;
          chrome.tabs.update(tabId, { 
            url: emojiStudioUrl,
            active: true
          }, () => {
            // Wait for the tab to reload, then send the data directly
            chrome.tabs.onUpdated.addListener(function listener(updatedTabId, info) {
              if (updatedTabId === tabId && info.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                
                // Small delay to ensure content script is loaded
                setTimeout(() => {
                  chrome.tabs.sendMessage(tabId, {
                    type: 'EMOJI_STUDIO_DATA',
                    data: dataToSend
                  });
                }, 1000);
              }
            });
          });
        } else {
          // Create new tab
          chrome.tabs.create({ 
            url: emojiStudioUrl 
          }, (newTab) => {
            // Wait for the tab to load, then send the data directly
            chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
              if (tabId === newTab.id && info.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                
                // Small delay to ensure content script is loaded
                setTimeout(() => {
                  chrome.tabs.sendMessage(tabId, {
                    type: 'EMOJI_STUDIO_DATA',
                    data: dataToSend
                  });
                }, 1000);
              }
            });
          });
        }
        
      });
    });
  } catch (error) {
  }
}

// Function to perform auto-sync
function checkAndAutoSync() {
  chrome.storage.local.get('lastSyncTime', (result) => {
    const lastSyncTime = result.lastSyncTime;
    const now = Date.now();
    const twentyFourHours = 24 * 60 * 60 * 1000;
    
    // Check if we have data and if it's been more than 24 hours
    if (Object.keys(capturedData).length > 0 && (!lastSyncTime || (now - lastSyncTime) > twentyFourHours)) {
      syncToEmojiStudio();
    }
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  
  if (request.type === 'SLACK_DATA_CAPTURED') {
    const workspace = request.data.workspace;
    
    
    // Replace all existing data with this single workspace
    capturedData = {};
    capturedData[workspace] = request.data;
    
    chrome.storage.local.set({ slackData: capturedData }, () => {
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
    chrome.storage.local.remove(['slackData', 'lastSyncTime', 'pendingExtensionData']);
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
    syncToEmojiStudio();
    sendResponse({ success: true });
  } else if (request.type === 'SHOW_NOTIFICATION') {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: request.iconUrl || 'icons/icon128.png',
      title: request.title,
      message: request.message
    });
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
          console.log('Detected potential HDR image, preserving original URL');
          
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
      
      
      // Extract token from form data if present
      let formToken = null;
      if (details.requestBody && details.requestBody.formData && details.requestBody.formData.token) {
        formToken = details.requestBody.formData.token[0];
      }
      
      // Store the form token for this request
      if (formToken) {
        pendingRequestData.set(details.requestId, { formToken });
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
      
      // Log important headers
      if (headers.cookie) {
      }
      if (headers.authorization) {
      }
      if (formToken) {
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