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
  // 変更を即時反映したい場合: localStorage.setItem('YSCH_LOG','debug'); window.dispatchEvent(new Event('ysch:reload-log-level'))
  window.addEventListener('ysch:reload-log-level', refreshLevel);

  log.info('App starting (log level=%s)', levelName);

  // =====================
  // (A) ShadowRoot 調査 (デバッグ用) - 一度も取得できなければ自動停止
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
    if (!shadowScanEnabled || LEVEL < LEVELS.debug) return; // デバッグ以外では走らせない
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
  // (B) Handle -> 表示名 取得
  // =====================
  const resolved = new Map(); // handle(lower) -> displayName
  const requested = new Set();

  function applyDisplayNames() {
    try {
      const anchors = document.querySelectorAll('a#name, a#author-text');
      anchors.forEach(a => {
        const raw = (a.textContent || '').trim();
        if (!raw.startsWith('@')) return;
        const handle = raw.slice(1);
        const disp = resolved.get(handle.toLowerCase());
        if (!disp) return;
        const target = a.querySelector('yt-formatted-string.author-text') || a;
        if (target.getAttribute('data-ysch-replaced') === '1') return;
        target.setAttribute('data-ysch-original-handle', raw);
        target.textContent = disp;
        target.setAttribute('data-ysch-replaced', '1');
        log.debug('replaced handle', raw, '->', disp);
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

  window.addEventListener('ysch:display-name-resolved', ev => {
    const { handle, displayName, error, cached } = ev.detail || {};
    if (!handle) return;
    const key = handle.toLowerCase();
    if (displayName) {
      resolved.set(key, displayName);
      log.info('displayName:', '@'+handle, '=>', displayName, cached ? '(cache)' : '');
      applyDisplayNames();
    } else if (error) {
      log.warn('displayName resolve failed', handle, error);
    }
  });

  function mainPoll() {
    shadowScan(); // デバッグ用 (必要なら)
    try {
      document.querySelectorAll('a#name, a#author-text').forEach(a => {
        const t = (a.textContent || '').trim();
        if (t.startsWith('@')) requestHandleResolution(t);
      });
  } catch { /* ignore enumeration */ }
    applyDisplayNames();
  }

  const interval = setInterval(mainPoll, 1500);
  window.addEventListener('beforeunload', () => clearInterval(interval));
  log.info('handle->displayName bridge active (interval 1500ms)');
})();
