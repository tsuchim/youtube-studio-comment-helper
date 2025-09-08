// AGPL-3.0
// Clean content script bridge - minimal message passing
(function() {
  'use strict';

  // Simple message forwarding between page and background
  window.addEventListener('ysch:resolve-handle', event => {
    const { handle, channelId } = event.detail || {};
    
    if (!handle && !channelId) return;

    try {
      chrome.runtime.sendMessage(
        { type: 'resolveDisplayName', handle, channelId },
        response => {
          if (chrome.runtime.lastError) {
            window.dispatchEvent(new CustomEvent('ysch:display-name-resolved', {
              detail: { 
                handle, 
                channelId, 
                displayName: null, 
                error: chrome.runtime.lastError.message 
              }
            }));
            return;
          }

          window.dispatchEvent(new CustomEvent('ysch:display-name-resolved', {
            detail: { handle, channelId, ...response }
          }));
        }
      );
    } catch (error) {
      window.dispatchEvent(new CustomEvent('ysch:display-name-resolved', {
        detail: { 
          handle, 
          channelId, 
          displayName: null, 
          error: error.message 
        }
      }));
    }
  });

  // Inject main app script
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('src/inject/app.js');
  script.onload = () => script.remove();
  script.onerror = () => console.error('[YSCH] Failed to load main app script');
  
  (document.head || document.documentElement).appendChild(script);

  console.debug('[YSCH] Content script bridge loaded');
})();
