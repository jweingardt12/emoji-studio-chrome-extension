// Debug script to check context menu status
chrome.contextMenus.removeAll(() => {
  console.log('All context menus removed');
  
  // Re-create the context menu
  chrome.contextMenus.create({
    id: 'createSlackEmoji',
    title: 'Create Slack emoji',
    contexts: ['image', 'video', 'audio'],
    documentUrlPatterns: ['http://*/*', 'https://*/*', 'file:///*'] // Added file:// for local testing
  }, () => {
    if (chrome.runtime.lastError) {
      console.error('Error creating context menu:', chrome.runtime.lastError);
    } else {
      console.log('Context menu created successfully');
    }
  });
});

// Also check current data status
chrome.storage.local.get(['slackData'], (result) => {
  console.log('Current slackData:', result.slackData);
  if (!result.slackData || Object.keys(result.slackData).length === 0) {
    console.log('No Slack data found - context menu will require authentication');
  }
});