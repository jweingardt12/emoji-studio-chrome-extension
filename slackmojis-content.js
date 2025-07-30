
// Function to create the "Add to Emoji Studio" button
function createAddButton(emojiUrl, emojiName, metadata = {}) {
  const button = document.createElement('button');
  button.className = 'emoji-studio-add-btn';
  button.title = 'Add to Emoji Studio'; // Tooltip
  
  button.innerHTML = '+';
  
  button.style.cssText = `
    background: #1a1a1a;
    color: white;
    border: none;
    width: 32px;
    height: 32px;
    border-radius: 4px;
    font-size: 20px;
    font-weight: bold;
    cursor: pointer;
    margin-top: 4px;
    transition: all 0.2s ease;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    display: none;
    align-items: center;
    justify-content: center;
    position: relative;
    opacity: 0;
  `;
  
  button.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    
    // Check if we have any saved Slack data
    chrome.storage.local.get('slackData', async (result) => {
      // Check for Chrome runtime errors
      if (chrome.runtime.lastError) {
        button.innerHTML = '✗';
        button.style.background = '#dc2626';
        button.title = 'Extension error';
        setTimeout(() => {
          button.innerHTML = '+';
          button.style.background = '#1a1a1a';
          button.title = 'Add to Emoji Studio';
        }, 2000);
        return;
      }
      
      if (!result.slackData || Object.keys(result.slackData).length === 0) {
        button.innerHTML = '✗';
        button.style.background = '#dc2626';
        button.title = 'No Slack workspace connected';
        setTimeout(() => {
          button.innerHTML = '+';
          button.style.background = '#1a1a1a';
          button.title = 'Add to Emoji Studio';
        }, 2000);
        return;
      }
      
      // Get the first workspace (for now)
      const workspaceData = Object.values(result.slackData)[0];
      
      button.innerHTML = '...';
      button.title = 'Adding...';
      button.disabled = true;
      
      // Send message to background script to add emoji
      chrome.runtime.sendMessage({
        type: 'ADD_EMOJI_FROM_SLACKMOJIS',
        url: emojiUrl,
        name: emojiName,
        workspace: workspaceData.workspace,
        metadata: {
          name: emojiName,
          source: 'slackmojis',
          originalUrl: emojiUrl,
          isHDR: metadata?.isHDR || false
        }
      }, (response) => {
        if (chrome.runtime.lastError) {
          button.innerHTML = '✗';
          button.style.background = '#dc2626';
          button.title = 'Failed to communicate with extension';
        } else if (response && response.success) {
          button.innerHTML = '✓';
          button.style.background = '#15803d';
          button.title = 'Added to Emoji Studio!';
        } else {
          button.innerHTML = '✗';
          button.style.background = '#dc2626';
          button.title = response?.error || 'Failed to add';
        }
        
        setTimeout(() => {
          button.innerHTML = '+';
          button.style.background = '#1a1a1a';
          button.title = 'Add to Emoji Studio';
          button.disabled = false;
        }, 2000);
      });
    });
  });
  
  return button;
}

// Simple function to add buttons to emoji items
function addButtonsToEmojis() {
  
  // Target li.emoji containers directly based on the actual Slackmojis HTML structure
  const emojiContainers = document.querySelectorAll('li.emoji');
  
  let addedCount = 0;
  
  emojiContainers.forEach(container => {
    // Check if this container already has our button
    if (container.querySelector('.emoji-studio-add-btn')) {
      return; // Skip this emoji, already has a button
    }
    
    // Find the emoji image within this container
    const img = container.querySelector('img');
    if (!img) return;
    
    const emojiUrl = img.src;
    
    // Check if this might be an HDR image
    const isHDR = emojiUrl.toLowerCase().includes('hdr') ||
                  emojiUrl.toLowerCase().includes('heic') ||
                  emojiUrl.toLowerCase().includes('heif') ||
                  emojiUrl.toLowerCase().includes('_hdr') ||
                  img.alt?.toLowerCase().includes('hdr') ||
                  img.title?.toLowerCase().includes('hdr');
    
    // Try to get emoji name from various sources
    // 1. Check for a span with the emoji name (common pattern on Slackmojis)
    const nameSpan = container.querySelector('span.name');
    let emojiName = nameSpan ? nameSpan.textContent.trim() : null;
    
    // 2. Fall back to image attributes
    if (!emojiName) {
      emojiName = img.alt || img.title || '';
    }
    
    // 3. Try to extract from URL as last resort
    if (!emojiName && emojiUrl) {
      const urlMatch = emojiUrl.match(/\/([^\/]+)\.(gif|png|jpg|jpeg|webp|heic|heif)(?:\?|$)/i);
      if (urlMatch) {
        emojiName = urlMatch[1];
      }
    }
    
    // Clean up the emoji name
    emojiName = emojiName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase() || 'emoji';
    
    // Skip if it's not a valid emoji image
    if (!emojiUrl || emojiUrl.includes('data:')) return;
    
    // Create and add the button
    const button = createAddButton(emojiUrl, emojiName, { isHDR });
    
    // Position the button in the top-right corner
    container.style.position = 'relative';
    button.style.position = 'absolute';
    button.style.top = '2px';
    button.style.right = '2px';
    button.style.zIndex = '10';
    
    // Add hover event listeners to show/hide the button
    container.addEventListener('mouseenter', () => {
      button.style.display = 'inline-flex';
      // Small delay before showing to make it smooth
      setTimeout(() => {
        button.style.opacity = '1';
      }, 10);
    });
    
    container.addEventListener('mouseleave', () => {
      button.style.opacity = '0';
      // Hide after transition completes
      setTimeout(() => {
        button.style.display = 'none';
      }, 200);
    });
    
    container.appendChild(button);
    addedCount++;
  });
  
}

// Function to set up mutation observer for dynamic content
function setupObserver() {
  // Create a MutationObserver to watch for new emojis being added
  const observer = new MutationObserver((mutations) => {
    // Check if any new nodes were added
    let hasNewEmojis = false;
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) { // Element node
          // Check if the added node is an emoji or contains emojis
          if (node.classList && node.classList.contains('emoji') || 
              (node.querySelectorAll && node.querySelectorAll('li.emoji').length > 0)) {
            hasNewEmojis = true;
          }
        }
      });
    });
    
    // If new emojis were added, add buttons to them
    if (hasNewEmojis) {
      setTimeout(addButtonsToEmojis, 100);
    }
  });
  
  // Start observing the entire body for changes
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Run when the page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(addButtonsToEmojis, 1000);
    setupObserver();
  });
} else {
  setTimeout(addButtonsToEmojis, 1000);
  setupObserver();
}

// Also try after delays for any emojis that might have been missed
setTimeout(() => {
  addButtonsToEmojis();
}, 3000);

