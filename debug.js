// Debug version to check what's happening
(() => {
  'use strict';
  
  console.log('[YSCH Debug] Script loaded');
  
  // Simple test function
  function testBasicFunctionality() {
    console.log('[YSCH Debug] Testing basic functionality...');
    
    // Check if we're on YouTube
    const isYouTube = window.location.hostname.includes('youtube.com');
    console.log('[YSCH Debug] On YouTube:', isYouTube);
    
    // Check for anchors
    const anchors = document.querySelectorAll('a#name, a#author-text');
    console.log('[YSCH Debug] Found anchors:', anchors.length);
    
    anchors.forEach((anchor, i) => {
      console.log(`[YSCH Debug] Anchor ${i}:`, {
        href: anchor.href,
        textContent: anchor.textContent,
        innerHTML: anchor.innerHTML
      });
    });
    
    // Test event dispatch
    try {
      window.dispatchEvent(new CustomEvent('ysch:resolve-handle', { 
        detail: { handle: 'test' } 
      }));
      console.log('[YSCH Debug] Event dispatch: OK');
    } catch (e) {
      console.log('[YSCH Debug] Event dispatch failed:', e);
    }
  }
  
  // Test immediately and after delay
  testBasicFunctionality();
  setTimeout(testBasicFunctionality, 2000);
  
})();
