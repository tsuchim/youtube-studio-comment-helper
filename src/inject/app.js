// AGPL-3.0
(() => {
  // =====================
  // Logging Utility
  // =====================
  const LEVELS = { silent:0, error:1, warn:2, info:3, debug:4 };
  function readLevel() {
    try { return (localStorage.getItem('YSCH_LOG') || 'warn').toLowerCase(); } catch { return 'warn'; }
  }
  let levelName = readLevel();
  let LEVEL = LEVELS[levelName] ?? LEVELS.warn;
  function refreshLevel() { levelName = readLevel(); LEVEL = LEVELS[levelName] ?? LEVELS.warn; }
  const log = {
    debug: (...a) => { if (LEVEL >= LEVELS.debug) console.debug('[YSCH]', ...a); },
    info:  (...a) => { if (LEVEL >= LEVELS.info)  console.info('[YSCH]', ...a); },
    warn:  (...a) => { if (LEVEL >= LEVELS.warn)  console.warn('[YSCH]', ...a); },
    error: (...a) => { if (LEVEL >= LEVELS.error) console.error('[YSCH]', ...a); }
  };
  // To reflect changes immediately: localStorage.setItem('YSCH_LOG','debug'); window.dispatchEvent(new Event('ysch:reload-log-level'))
  window.addEventListener('ysch:reload-log-level', refreshLevel);

  log.info('App starting (log level=%s)', levelName);

  // =====================
  // (A) ShadowRoot investigation (for debugging) - Auto-stop if none obtained
  // =====================
  let shadowScanEnabled = true;
  let pollCount = 0;
  let foundAnyShadow = false;

  const NAME_SELECTORS = [
    'a#author-text',
    'a#name',
    '#author-text',
    'yt-formatted-string#author-text',
    'a[href^="/channel/"]',
    'a[href^="/@"]'
  ];
  const seenNames = new Set();

  function extractNameFromNode(node) {
    if (!node) return null;
    const txt = node.textContent || '';
    const trimmed = txt.trim();
    return trimmed && /\S/.test(trimmed) ? trimmed : null;
  }

  function processRoot(root, label) {
    if (!root) return;
    try {
      for (const sel of NAME_SELECTORS) {
        const el = root.querySelector(sel);
        if (!el) continue;
        const name = extractNameFromNode(el);
        if (name && !seenNames.has(name)) {
          seenNames.add(name);
          log.debug('commenter:', name, `(via ${label} sel=${sel})`);
        }
      }
    } catch (e) {
      log.debug('processRoot error', e);
    }
  }

  function shadowScan() {
    if (!shadowScanEnabled || LEVEL < LEVELS.debug) return; // Do not run except in debug
    pollCount++;
    try {
      const hosts = document.querySelectorAll('ytcp-comment, ytcp-comment-thread');
      log.debug('hosts found:', hosts.length);
      hosts.forEach(host => {
        const root = window.__ysch?.getShadowRoot(host);
        log.debug('host:', host.tagName, 'shadowRoot?', !!root);
        if (root) {
          foundAnyShadow = true;
          processRoot(root, 'host-root');
        }
      });
      const allRoots = typeof window.__ysch?.getAllRoots === 'function' ? window.__ysch.getAllRoots() : [];
      log.debug('total captured roots:', allRoots.length);
      if (allRoots.length) {
        foundAnyShadow = true;
        allRoots.forEach(r => processRoot(r, 'captured-root'));
      }
    } catch (e) {
      log.warn('shadow scan error', e);
    }
    if (pollCount >= 5 && !foundAnyShadow) {
      shadowScanEnabled = false;
      log.info('shadow scan disabled (no roots after %d polls)', pollCount);
    }
  }

  // =====================
  // (B) Handle -> Display Name Retrieval
  // =====================
  const resolved = new Map(); // handle(lower) -> displayName
  const requested = new Set();
  const pendingErrors = new Map(); // handle(lower) -> {count, lastTs}
  const MAX_RETRY = 3;
  const RETRY_INTERVAL_MS = 4000;

  // New: robust handle extraction (prefers href, falls back to text)
  function extractHandleFromAnchor(a) {
    if (!a) return null;
    const href = a.getAttribute('href') || '';
    if (href.startsWith('/@')) {
      const h = href.slice(2).split(/[/?#]/)[0];
      if (h) return h;
    }
    const txt = (a.textContent || '').trim();
    if (txt.startsWith('@')) return txt.slice(1);
    return null;
  }

  function applyDisplayNames() {
    try {
      const anchors = document.querySelectorAll('a#name, a#author-text');
      anchors.forEach(a => {
        const handle = extractHandleFromAnchor(a);
        if (!handle) return;
        const key = handle.toLowerCase();
        const target = a.querySelector('yt-formatted-string.author-text') || a;

        // If this DOM node has been recycled for a different handle, reset state
        const prevHandle = target.getAttribute('data-ysch-handle');
        if (prevHandle && prevHandle !== key) {
          target.removeAttribute('data-ysch-replaced');
          target.removeAttribute('data-ysch-original-handle');
          target.textContent = '@' + handle; // show raw handle until resolved
        }

        const disp = resolved.get(key);
        if (!disp) {
          // If not yet resolved and text was previously replaced, ensure it shows the raw handle
          if (target.getAttribute('data-ysch-replaced') === '1' && !resolved.has(key)) {
            target.textContent = '@' + handle;
            target.removeAttribute('data-ysch-replaced');
          }
          return;
        }
        if (target.getAttribute('data-ysch-replaced') === '1' && target.getAttribute('data-ysch-handle') === key) return;
        target.setAttribute('data-ysch-original-handle', '@' + handle);
        target.setAttribute('data-ysch-handle', key);
        target.textContent = disp;
        target.setAttribute('data-ysch-replaced', '1');
        log.debug('replaced handle', '@'+handle, '->', disp);
      });
    } catch { /* swallow replace errors */ }
  }

  function requestHandleResolution(handle) {
    if (!handle) return;
    const h = handle.startsWith('@') ? handle.slice(1) : handle;
    const key = h.toLowerCase();
    if (resolved.has(key) || requested.has(key)) return;
    requested.add(key);
    window.dispatchEvent(new CustomEvent('ysch:resolve-handle', { detail: { handle: h } }));
  }

  function scheduleRetry(handleLower) {
    const entry = pendingErrors.get(handleLower);
    if (!entry) return;
    if (entry.count >= MAX_RETRY) return;
    const now = Date.now();
    if (now - entry.lastTs < RETRY_INTERVAL_MS) return;
    entry.count++;
    entry.lastTs = now;
    window.dispatchEvent(new CustomEvent('ysch:resolve-handle', { detail: { handle: handleLower } }));
  }

  window.addEventListener('ysch:display-name-resolved', ev => {
    const { handle, displayName, error, cached } = ev.detail || {}; // add cached to destructuring
    if (!handle) return;
    const key = handle.toLowerCase();
    if (displayName) {
      pendingErrors.delete(key);
      resolved.set(key, displayName);
      log.info('displayName:', '@'+handle, '=>', displayName, cached ? '(cache)' : '');
      applyDisplayNames();
    } else if (error) {
      log.warn('displayName resolve failed', handle, error);
      if (/Extension context invalidated/i.test(error)) {
        const cur = pendingErrors.get(key) || { count: 0, lastTs: 0 };
        pendingErrors.set(key, cur);
        scheduleRetry(key);
      }
    }
  });

  function enumerateAndRequest() {
    try {
      document.querySelectorAll('a#name, a#author-text').forEach(a => {
        const handle = extractHandleFromAnchor(a);
        if (handle) requestHandleResolution(handle);
      });
    } catch { /* ignore enumeration */ }
  }

  function mainPoll() {
    shadowScan(); // For debugging (if needed)
    enumerateAndRequest();
    applyDisplayNames();
  }

  // MutationObserver for faster reaction to dynamically loaded comment batches
  const mo = new MutationObserver(muts => {
    let touched = false;
    for (const m of muts) {
      if (m.addedNodes && m.addedNodes.length) {
        for (const n of m.addedNodes) {
          if (n.nodeType === 1) {
            if (n.matches?.('a#name, a#author-text') || n.querySelector?.('a#name, a#author-text')) {
              touched = true; break;
            }
          }
        }
      }
      if (touched) break;
    }
    if (touched) {
      // Slight delay to allow YouTube's own rendering batches to settle
      queueMicrotask(() => { enumerateAndRequest(); applyDisplayNames(); });
    }
  });
  try { mo.observe(document.documentElement, { childList: true, subtree: true }); } catch {}

  const interval = setInterval(mainPoll, 1500);
  window.addEventListener('beforeunload', () => { try { mo.disconnect(); } catch {}; clearInterval(interval); });
  log.info('handle->displayName bridge active (interval 1500ms)');
})();
