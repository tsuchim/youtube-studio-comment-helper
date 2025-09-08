// AGPL-3.0
(function injectMainWorld() {
  const LEVELS = { silent:0, error:1, warn:2, info:3, debug:4 };
  function readLevel(){ try { return (localStorage.getItem('YSCH_LOG')||'warn').toLowerCase(); } catch { return 'warn'; } }
  function lvl(){ return LEVELS[readLevel()] ?? 2; }
  const log = {
    debug: (...a)=>{ if (lvl()>=4) console.debug('[YSCH]',...a); },
    info:  (...a)=>{ if (lvl()>=3) console.info('[YSCH]',...a); },
    warn:  (...a)=>{ if (lvl()>=2) console.warn('[YSCH]',...a); },
    error: (...a)=>{ if (lvl()>=1) console.error('[YSCH]',...a); }
  };

  log.info('Starting injection');

  // 1) Hook attachShadow as fast as possible before external loading (to not miss initial component generation)
  try {
    if (!window.__ysch_inlineHook) {
      window.__ysch_inlineHook = true;
      const registry = new WeakMap();
      const roots = new Set();
      const origAttach = Element.prototype.attachShadow;
      Element.prototype.attachShadow = function(init) {
        const r = origAttach.call(this, init);
        registry.set(this, r);
        roots.add(r);
  try { window.dispatchEvent(new CustomEvent('ysch:shadow-created', { detail: { host: this } })); } catch { /* ignore shadow dispatch */ }
        return r;
      };
      // Hook only in environments where customElements exist
      if (window.customElements && window.customElements.define) {
        const origDefine = window.customElements.define.bind(window.customElements);
        window.customElements.define = function(name, ctor, opts) {
          return origDefine(name, ctor, opts);
        };
      }
      window.__ysch = window.__ysch || {
        getShadowRoot(el) { return registry.get(el) || el.shadowRoot || null; },
        getAllRoots() { return Array.from(roots); }
      };
      log.debug('inline attachShadow hook installed');
    }
    } catch (e) {
    log.warn('inline hook failed', e);
  }

  // 2) Idempotent re-injection of existing detailed logic via external files
  function inject(file) {
    log.info('Injecting', file);
    const s = document.createElement('script');
    s.src = chrome.runtime.getURL(file);
    s.type = 'text/javascript';
    (document.head || document.documentElement).appendChild(s);
    s.onload = () => { log.debug('Injected successfully:', file); s.remove(); };
    s.onerror = () => { log.error('[inject] Failed to load', file, '->', s.src); };
  }

  inject('src/inject/patch.js'); // Idempotent (overwrite same API)
  inject('src/inject/app.js');

  // ========= Bridge: page <-> background =========
  // page script dispatches CustomEvent('ysch:resolve-handle', {detail:{handle}})
  // we forward to background and emit 'ysch:display-name-resolved'
  window.addEventListener('ysch:resolve-handle', e => {
    const handle = e?.detail?.handle;
    const channelId = e?.detail?.channelId; // optional new field
    if (!handle && !channelId) return;
    try {
      chrome.runtime.sendMessage({ type: 'resolveDisplayName', handle, channelId }, resp => {
        if (chrome.runtime.lastError) {
          window.dispatchEvent(new CustomEvent('ysch:display-name-resolved', { detail: { handle, channelId, displayName: null, error: chrome.runtime.lastError.message } }));
          return;
        }
        window.dispatchEvent(new CustomEvent('ysch:display-name-resolved', { detail: { handle, channelId, ...resp } }));
      });
    } catch (err) {
      window.dispatchEvent(new CustomEvent('ysch:display-name-resolved', { detail: { handle, channelId, displayName: null, error: String(err) } }));
    }
  });
})();
