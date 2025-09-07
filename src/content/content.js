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

  // 1) 外部読み込み前に最速で attachShadow をフック（初期コンポーネント生成を逃さない）
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
        try { window.dispatchEvent(new CustomEvent('ysch:shadow-created', { detail: { host: this } })); } catch {}
        return r;
      };
      // customElements が存在する環境のみフック
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

  // 2) 既存の詳細ロジックを外部ファイルで冪等再注入
  function inject(file) {
    log.info('Injecting', file);
    const s = document.createElement('script');
    s.src = chrome.runtime.getURL(file);
    s.type = 'text/javascript';
    (document.head || document.documentElement).appendChild(s);
    s.onload = () => { log.debug('Injected successfully:', file); s.remove(); };
    s.onerror = () => { log.error('[inject] Failed to load', file, '->', s.src); };
  }

  inject('src/inject/patch.js'); // 冪等（同じAPIを上書き）
  inject('src/inject/app.js');

  // ========= Bridge: page <-> background =========
  // page script dispatches CustomEvent('ysch:resolve-handle', {detail:{handle}})
  // we forward to background and emit 'ysch:display-name-resolved'
  window.addEventListener('ysch:resolve-handle', e => {
    const handle = e?.detail?.handle;
    if (!handle) return;
    try {
      chrome.runtime.sendMessage({ type: 'resolveDisplayName', handle }, resp => {
        window.dispatchEvent(new CustomEvent('ysch:display-name-resolved', { detail: { handle, ...resp } }));
      });
    } catch (err) {
      window.dispatchEvent(new CustomEvent('ysch:display-name-resolved', { detail: { handle, displayName: null, error: String(err) } }));
    }
  });
})();
