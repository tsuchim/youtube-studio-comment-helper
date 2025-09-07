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

  // === Force test debug output to verify script is running ===
  console.log('[YSCH][FORCE] Script loaded, verbose flag:', localStorage.getItem('YSCH_DEBUG_VERBOSE'));
  setTimeout(() => console.log('[YSCH][FORCE] Delayed test output after 2s'), 2000);

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
        if (!handle || handle.length === 0) return; // guard: invalid / empty
        const key = handle.toLowerCase();
        const target = a.querySelector('yt-formatted-string.author-text') || a;

        const prevHandle = target.getAttribute('data-ysch-handle');
        const disp = resolved.get(key);

        // If node recycled for different handle, clear state but don't blindly blank text
        if (prevHandle && prevHandle !== key) {
          target.removeAttribute('data-ysch-replaced');
          target.removeAttribute('data-ysch-original-handle');
          target.removeAttribute('data-ysch-handle');
          // Only set raw handle if current text does not already show it
          const rawCandidate = '@' + handle;
          if (!target.textContent || !target.textContent.includes(handle)) {
            target.textContent = rawCandidate;
          }
        }

        if (!disp) {
          // Don't force placeholder; leave existing text (could still be loading)
          return;
        }

        if (target.getAttribute('data-ysch-replaced') === '1' && target.getAttribute('data-ysch-handle') === key) return;
        target.setAttribute('data-ysch-original-handle', '@' + handle);
        target.setAttribute('data-ysch-handle', key);
        if (disp && disp.trim().length > 0) {
          target.textContent = disp;
          target.setAttribute('data-ysch-replaced', '1');
          log.debug('replaced handle', '@'+handle, '->', disp);
        }
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

  function findChannelIdNearAnchor(a){
    try {
      // YouTube Studio comment inbox structure heuristic:
      // Often the anchor itself or a nearby parent carries a channel link /channel/UCxxxx or /@handle
      // We search up to 3 ancestor levels for href with /channel/ pattern in descendant anchors.
      const CHANNEL_REGEX = /\/channel\/(UC[0-9A-Za-z_-]{10,})/;
      const check = (el)=>{
        if (!el) return null;
        if (el.tagName === 'A') {
          const h = el.getAttribute('href')||'';
          const m = h.match(CHANNEL_REGEX); if (m) return m[1];
        }
        const link = el.querySelector('a[href*="/channel/"]');
        if (link){
          const h = link.getAttribute('href')||'';
          const m = h.match(CHANNEL_REGEX); if (m) return m[1];
        }
        return null;
      };
      let cur = a;
      for (let i=0;i<3 && cur;i++){
        const id = check(cur); if (id) return id;
        cur = cur.parentElement;
      }
      return null;
    } catch { return null; }
  }

  // Patch enumerateAndRequest to pass channelId fallback
  const _origEnumerate = enumerateAndRequest;
  enumerateAndRequest = function() {
    try {
      document.querySelectorAll('a#name, a#author-text').forEach(a => {
        const handle = extractHandleFromAnchor(a);
        const channelId = !handle ? findChannelIdNearAnchor(a) : null;
        const effective = handle || channelId;
        if (!effective) return;
        const key = (handle? 'h:' : 'c:') + effective.toLowerCase();
        if (requested.has(key) || (handle && resolved.has(handle.toLowerCase())) || (!handle && resolved.has(channelId?.toLowerCase?.()))) return;
        requested.add(key);
        window.dispatchEvent(new CustomEvent('ysch:resolve-handle', { detail: { handle, channelId } }));
      });
    } catch {}
  };

  function enumerateAndRequest() {
    try {
      document.querySelectorAll('a#name, a#author-text').forEach(a => {
        const handle = extractHandleFromAnchor(a);
        if (handle) requestHandleResolution(handle);
      });
    } catch { /* ignore enumeration */ }
  }

  // Wrap around errors to prevent YouTube script interference
  function safeCall(name, fn) {
    try {
      return fn();
    } catch (e) {
      console.error('[YSCH][ERROR]', name, 'failed:', e);
      return null;
    }
  }

  function mainPoll() {
    safeCall('shadowScan', shadowScan);
    safeCall('enumerateAndRequest', enumerateAndRequest);
    safeCall('applyDisplayNames', applyDisplayNames);
  }

  // MutationObserver for faster reaction to dynamically loaded comment batches
  let mutationTimeout = null;
  const mo = new MutationObserver(muts => {
    // Debounce mutation handling to avoid excessive processing
    if (mutationTimeout) clearTimeout(mutationTimeout);
    mutationTimeout = setTimeout(() => {
      console.log('[YSCH][FORCE] MutationObserver processing after debounce, mutations:', muts.length);
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
        console.log('[YSCH][FORCE] Found relevant nodes, scheduling update');
        queueMicrotask(() => { 
          safeCall('enumerateAndRequest', enumerateAndRequest);
          safeCall('applyDisplayNames', applyDisplayNames);
        });
      }
      mutationTimeout = null;
    }, 100); // 100ms debounce
  });
  try { mo.observe(document.documentElement, { childList: true, subtree: true }); } catch {}

  // MutationObserver already handles dynamic content well, remove redundant polling
  // const interval = setInterval(() => {
  //   console.log('[YSCH][FORCE] Main poll tick');
  //   mainPoll();
  // }, 1500);

  // Add scroll-based trigger with throttling
  let scrollTimeout = null;
  const handleScroll = () => {
    if (scrollTimeout) return; // throttle
    scrollTimeout = setTimeout(() => {
      console.log('[YSCH][FORCE] Scroll trigger processing');
      safeCall('enumerateAndRequest', enumerateAndRequest);
      safeCall('applyDisplayNames', applyDisplayNames);
      scrollTimeout = null;
    }, 300); // 300ms throttle
  };

  // Passive scroll listener to avoid blocking
  window.addEventListener('scroll', handleScroll, { passive: true });

  // Keep minimal fallback polling only for edge cases
  const fallbackInterval = setInterval(() => {
    console.log('[YSCH][FORCE] Fallback poll tick');
    mainPoll();
  }, 10000); // 10 second fallback only

  window.addEventListener('beforeunload', () => { 
    try { mo.disconnect(); } catch {}
    window.removeEventListener('scroll', handleScroll);
    clearInterval(fallbackInterval);
    if (scrollTimeout) clearTimeout(scrollTimeout);
  });
  log.info('handle->displayName bridge active (interval 1500ms)');

  // === Verbose debug helpers (enable with localStorage.setItem('YSCH_DEBUG_VERBOSE','1')) ===
  function verboseEnabled(){ try { return localStorage.getItem('YSCH_DEBUG_VERBOSE') === '1'; } catch { return false; } }
  const actionStats = { processed:0, replaced:0, skippedNoDisp:0, recycled:0, skipEmptyHandle:0 };

  // Wrap original extractor to add debug info
  const _origExtractHandleFromAnchor = extractHandleFromAnchor;
  extractHandleFromAnchor = function(a){
    const href = a?.getAttribute?.('href');
    const rawText = (a?.textContent||'').trim();
    const h = _origExtractHandleFromAnchor(a);
    if (verboseEnabled() && LEVEL >= LEVELS.debug) {
      try { log.debug('[DBG/extract]', { href, rawText, extracted:h }); } catch {}
    }
    return h;
  };

  // Patch applyDisplayNames with detailed decision logging
  const _origApply = applyDisplayNames;
  applyDisplayNames = function(){
    try {
      const anchors = document.querySelectorAll('a#name, a#author-text');
      let localProcessed = 0;
      anchors.forEach(a => {
        const handle = extractHandleFromAnchor(a);
        if (!handle || handle.length === 0) { actionStats.skipEmptyHandle++; return; }
        const key = handle.toLowerCase();
        const target = a.querySelector('yt-formatted-string.author-text') || a;
        const prevHandle = target.getAttribute('data-ysch-handle');
        const disp = resolved.get(key);
        let reason = 'noop';

        // Detect recycled
        if (prevHandle && prevHandle !== key) {
          reason = 'recycled';
          target.removeAttribute('data-ysch-replaced');
          target.removeAttribute('data-ysch-original-handle');
          target.removeAttribute('data-ysch-handle');
          const rawCandidate = '@' + handle;
          if (!target.textContent || !target.textContent.includes(handle)) {
            target.textContent = rawCandidate;
          }
          actionStats.recycled++;
        }

        if (!disp) {
          reason = (reason === 'recycled') ? 'recycled-wait' : 'wait';
          actionStats.skippedNoDisp++;
        } else {
          if (!(target.getAttribute('data-ysch-replaced') === '1' && target.getAttribute('data-ysch-handle') === key)) {
            if (disp && disp.trim().length > 0) {
              target.setAttribute('data-ysch-original-handle', '@' + handle);
              target.setAttribute('data-ysch-handle', key);
              target.textContent = disp;
              target.setAttribute('data-ysch-replaced', '1');
              reason = 'replaced';
              actionStats.replaced++;
            } else {
              reason = 'empty-disp-skip';
            }
          } else {
            reason = 'already';
          }
        }

        actionStats.processed++;
        localProcessed++;
        if (verboseEnabled() && LEVEL >= LEVELS.debug) {
          const snapshot = {
            handle, key,
            prevHandle,
            replaced: target.getAttribute('data-ysch-replaced'),
            hasDisp: !!disp,
            textLen: (target.textContent||'').length,
            reason
          };
          try { log.debug('[DBG/apply]', snapshot); } catch {}
        }
      });
      if (verboseEnabled() && LEVEL >= LEVELS.debug && localProcessed) {
        try { log.debug('[DBG/stats]', { ...actionStats }); } catch {}
      }
    } catch (e) {
      if (verboseEnabled()) log.debug('[DBG/apply-error]', e);
    }
  };

  // Insert advanced handle replacement helper
  function replaceHandleInTarget(target, rawHandle, displayName) {
    if (!target || !rawHandle || !displayName) return { mode: 'noop' };
    const handleToken = '@' + rawHandle;
    // Walk only text nodes and replace the exact token
    const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT, null);
    let foundNode = null;
    while (walker.nextNode()) {
      const n = walker.currentNode;
      if (!n.nodeValue) continue;
      if (n.nodeValue.includes(handleToken)) { foundNode = n; break; }
      // also allow startsWith trimmed variant
      const trimmed = n.nodeValue.trimStart();
      if (trimmed.startsWith(handleToken)) { foundNode = n; break; }
    }
    if (foundNode) {
      const before = foundNode.nodeValue;
      foundNode.nodeValue = before.replace(handleToken, displayName);
      return { mode: 'partial', before, after: foundNode.nodeValue };
    }
    // fallback: full textContent replacement (structure may collapse)
    const beforeAll = target.textContent;
    target.textContent = displayName;
    return { mode: 'full', before: beforeAll, after: target.textContent };
  }

  // Replace original applyDisplayNames core logic with safer partial replacement
  const _prevApplyDisplayNames = applyDisplayNames;
  applyDisplayNames = function saferApplyDisplayNames() {
    try {
      const anchors = document.querySelectorAll('a#name, a#author-text');
      anchors.forEach(a => {
        const handle = extractHandleFromAnchor(a);
        if (!handle) return;
        const key = handle.toLowerCase();
        const target = a.querySelector('yt-formatted-string.author-text') || a;
        const prevHandle = target.getAttribute('data-ysch-handle');
        const disp = resolved.get(key);
        if (prevHandle && prevHandle !== key) {
          target.removeAttribute('data-ysch-replaced');
          target.removeAttribute('data-ysch-original-handle');
          target.removeAttribute('data-ysch-handle');
        }
        if (!disp) return;
        if (target.getAttribute('data-ysch-replaced') === '1' && target.getAttribute('data-ysch-handle') === key) return;
        const rawOriginal = target.textContent;
        const res = replaceHandleInTarget(target, handle, disp);
        target.setAttribute('data-ysch-original-handle', '@'+handle);
        target.setAttribute('data-ysch-handle', key);
        target.setAttribute('data-ysch-replaced', '1');
        if (LEVEL >= LEVELS.debug && localStorage.getItem('YSCH_DEBUG_VERBOSE') === '1') {
          log.debug('[DBG/replace]', { handle, mode: res.mode, before: res.before || rawOriginal, after: res.after || target.textContent });
          if (/^\d+\s+.+@/.test(target.textContent)) {
            log.debug('[DBG/anomaly-prefix-plus-handle]', { text: target.textContent, handle });
          }
        }
      });
    } catch (e) {
      if (LEVEL >= LEVELS.debug && localStorage.getItem('YSCH_DEBUG_VERBOSE') === '1') log.debug('[DBG/saferApply-error]', e);
    }
  };

  // === Extended unresolved tracking instrumentation ===
  const unresolvedTracker = new Map(); // key -> { seen: number, firstTs: number, lastText: string }
  const UNRESOLVED_LOG_THRESHOLD = 3; // polls

  function forceLog(...a){
    // Always log when verbose flag set, even if log level < debug
    console.log('[YSCH][FORCE]', ...a); // Changed from console.debug to console.log
    if (localStorage.getItem('YSCH_DEBUG_VERBOSE') === '1') {
      try { console.warn('[YSCH][VERBOSE]', ...a); } catch {} // Additional warn level log
    }
  }

  const _origEnumerate2 = enumerateAndRequest;
  enumerateAndRequest = function() {
    _origEnumerate2();
    if (localStorage.getItem('YSCH_DEBUG_VERBOSE') !== '1') return;
    try {
      document.querySelectorAll('a#name, a#author-text').forEach(a => {
        const handle = extractHandleFromAnchor(a);
        let channelId = null;
        if (!handle) channelId = (a.getAttribute('href')||'').match(/\/channel\/(UC[0-9A-Za-z_-]{10,})/)?.[1] || null;
        if (!handle && !channelId) {
          forceLog('[unmatched-anchor]', { outer: a.outerHTML.slice(0,300) });
          return;
        }
        const key = (handle? 'h:' : 'c:') + (handle || channelId).toLowerCase();
        if (resolved.has((handle||'').toLowerCase()) || resolved.has((channelId||'').toLowerCase())) {
          unresolvedTracker.delete(key);
          return;
        }
        const entry = unresolvedTracker.get(key) || { seen:0, firstTs: Date.now(), lastText: a.textContent||'' };
        entry.seen++;
        entry.lastText = a.textContent||'';
        unresolvedTracker.set(key, entry);
        if (entry.seen === UNRESOLVED_LOG_THRESHOLD) {
          forceLog('[unresolved-threshold]', { key, handle, channelId, text: entry.lastText, outer: a.outerHTML.slice(0,300) });
        }
      });
    } catch(e) { forceLog('[enumerate-track-error]', e); }
  };

  // Wrap saferApplyDisplayNames for post-resolution verification
  const _origApply2 = applyDisplayNames;
  applyDisplayNames = function() {
    _origApply2();
    if (localStorage.getItem('YSCH_DEBUG_VERBOSE') !== '1') return;
    try {
      // After apply, dump any entries that exceeded large threshold without resolution
      const NOW = Date.now();
      for (const [key, ent] of unresolvedTracker.entries()) {
        if (ent.seen >= UNRESOLVED_LOG_THRESHOLD + 2) {
          forceLog('[still-unresolved]', { key, seen: ent.seen, ageMs: NOW - ent.firstTs, lastText: ent.lastText });
        }
      }
    } catch(e){ forceLog('[post-apply-check-error]', e); }
  };

  // Developer helper to dump current unresolved map manually
  window.__yschDumpUnresolved = function(){
    const arr = [];
    for (const [k,v] of unresolvedTracker.entries()) arr.push({ key:k, ...v, ageMs: Date.now()-v.firstTs });
    arr.sort((a,b)=>b.seen-a.seen);
    forceLog('[dump-unresolved]', arr.slice(0,50));
    return arr;
  };

  forceLog('Extended unresolved tracking instrumentation active');
})();
