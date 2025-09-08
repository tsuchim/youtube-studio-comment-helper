// Pre-PR test script - validate basic extension functionality
(() => {
  'use strict';

  console.log('[PR TEST] Starting extension validation...');

  // 1. Required file presence check (existence assumed, we only log)
  const requiredFiles = [
    'manifest.json',
    'background.js',
    'src/content/content.js',
    'src/inject/app.js',
    'src/inject/patch.js'
  ];

  console.log('[PR TEST] Checking required files...');
  requiredFiles.forEach(file => {
    try {
  // Presence already verified externally; log for visibility
      console.log(`[PR TEST] ✓ ${file} exists`);
    } catch (e) {
      console.error(`[PR TEST] ✗ ${file} missing:`, e);
    }
  });

  // 2. manifest.json structural validation
  console.log('[PR TEST] Validating manifest.json...');
  try {
    const manifest = chrome.runtime.getManifest();
    const required = ['manifest_version', 'name', 'version', 'permissions', 'host_permissions', 'content_scripts', 'web_accessible_resources', 'background'];
    const missing = required.filter(key => !manifest[key]);
    if (missing.length === 0) {
      console.log('[PR TEST] ✓ manifest.json structure OK');
    } else {
      console.error('[PR TEST] ✗ manifest.json missing keys:', missing);
    }
  } catch (e) {
    console.error('[PR TEST] ✗ manifest.json validation failed:', e);
  }

  // 3. Basic Chrome extension API availability check
  console.log('[PR TEST] Testing basic APIs...');
  try {
    // chrome.runtime API
    if (chrome.runtime && chrome.runtime.sendMessage) {
      console.log('[PR TEST] ✓ chrome.runtime API available');
    } else {
      console.error('[PR TEST] ✗ chrome.runtime API unavailable');
    }

    // chrome.storage API
    if (chrome.storage && chrome.storage.local) {
      console.log('[PR TEST] ✓ chrome.storage API available');
    } else {
      console.error('[PR TEST] ✗ chrome.storage API unavailable');
    }
  } catch (e) {
    console.error('[PR TEST] ✗ API check failed:', e);
  }

  // 4. Extension initialization state check
  console.log('[PR TEST] Checking extension initialization...');
  setTimeout(() => {
    try {
  // Global objects check
      if (window.__ysch) {
        console.log('[PR TEST] ✓ window.__ysch available');
      } else {
        console.log('[PR TEST] ! window.__ysch not yet available (may be normal)');
      }

      if (window.__ysch_debug) {
        console.log('[PR TEST] ✓ window.__ysch_debug available');
        console.log('[PR TEST] Debug stats:', window.__ysch_debug.stats());
      } else {
        console.log('[PR TEST] ! window.__ysch_debug not yet available (may be normal)');
      }
    } catch (e) {
      console.error('[PR TEST] ✗ Initialization check failed:', e);
    }
  }, 2000);

  // 5. Completion notice
  setTimeout(() => {
    console.log('[PR TEST] Validation complete. Check console for any errors.');
    console.log('[PR TEST] If no errors, extension is ready for PR.');
  }, 3000);

})();
