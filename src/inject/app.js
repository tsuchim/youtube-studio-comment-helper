// AGPL-3.0
(() => {
  console.log('[YSCH] App starting...');

  // 取得済み表示名重複回避
  const seenNames = new Set();

  // 名前候補セレクタ（順序優先）
  const NAME_SELECTORS = [
    'a#author-text',
    'a#name',
    '#author-text',
    'yt-formatted-string#author-text',
    'a[href^="/channel/"]',
    'a[href^="/@"]'
  ];

  function extractNameFromNode(node) {
    if (!node) return null;
    const txt = node.textContent || '';
    const trimmed = txt.trim();
    if (trimmed && /\S/.test(trimmed)) return trimmed;
    return null;
  }

  function processRoot(root, label) {
    try {
      for (const sel of NAME_SELECTORS) {
        const el = root.querySelector(sel);
        if (!el) continue;
        const name = extractNameFromNode(el);
        if (name && !seenNames.has(name)) {
          seenNames.add(name);
          console.log('[YSCH] commenter:', name, `(via ${label} sel=${sel})`);
        }
      }
    } catch (e) {
      console.debug('[YSCH] processRoot error', e);
    }
  }

  function poll() {
    try {
      console.debug('[YSCH] poll start');
      const hosts = document.querySelectorAll('ytcp-comment, ytcp-comment-thread');
      console.debug('[YSCH] hosts found:', hosts.length);
      hosts.forEach(host => {
        const root = window.__ysch?.getShadowRoot(host);
        console.debug('[YSCH] host:', host.tagName, 'shadowRoot?', !!root);
        if (!root) return;
        processRoot(root, 'host-root');
      });

      // 捕捉済み全 ShadowRoot を再走査（attachShadow フックで拾ったもの）
      try {
        const allRoots = typeof window.__ysch?.getAllRoots === 'function' ? window.__ysch.getAllRoots() : [];
        console.debug('[YSCH] total captured roots:', allRoots.length);
        allRoots.forEach(r => processRoot(r, 'captured-root'));
      } catch (e) {
        console.debug('[YSCH] enumerate roots error', e);
      }
    } catch (e) {
      console.warn('[YSCH] poll error', e);
    }
  }

  const interval = setInterval(poll, 1000);
  window.addEventListener('ysch:shadow-created', poll);
  window.addEventListener('beforeunload', () => clearInterval(interval));
  console.debug('[YSCH] polling every 1000ms');

  // =====================
  // Handle -> 表示名 取得 (background 経由)
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
        console.debug('[YSCH] replaced handle with displayName', raw, '->', disp);
      });
    } catch (e) {
      // ignore
    }
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
      console.log('[YSCH] displayName:', '@' + handle, '=>', displayName, cached ? '(cache)' : '');
  applyDisplayNames();
    } else if (error) {
      console.debug('[YSCH] displayName resolve failed', handle, error);
    }
  });

  // poll をラップして handle 抽出
  const originalPoll = poll;
  function pollWithHandles() {
    originalPoll();
    try {
      document.querySelectorAll('a#name, a#author-text').forEach(a => {
        const t = (a.textContent || '').trim();
        if (t.startsWith('@')) requestHandleResolution(t);
      });
    } catch {}
  applyDisplayNames();
  }
  clearInterval(interval);
  const newInterval = setInterval(pollWithHandles, 1500);
  window.addEventListener('beforeunload', () => clearInterval(newInterval));
  console.debug('[YSCH] handle->displayName bridge active');
})();
