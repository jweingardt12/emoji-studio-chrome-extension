// Storage debug helper
async function debugStorage() {
  console.log('=== STORAGE DEBUG ===');
  
  // Get all storage
  const all = await chrome.storage.local.get();
  console.log('All storage keys:', Object.keys(all));
  console.log('Full storage:', all);
  
  // Specifically check slackData
  const slackData = await chrome.storage.local.get('slackData');
  console.log('slackData:', slackData);
  
  if (slackData.slackData) {
    console.log('Workspaces:', Object.keys(slackData.slackData));
    for (const [workspace, data] of Object.entries(slackData.slackData)) {
      console.log(`Workspace ${workspace}:`, {
        hasToken: !!data.token,
        hasCookie: !!data.cookie,
        emojiCount: data.emojiCount
      });
    }
  }
  
  console.log('===================');
}

// Export for use in popup
if (typeof module !== 'undefined' && module.exports) {
  module.exports = debugStorage;
}