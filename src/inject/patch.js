// AGPL-3.0
(() => {
  // 最低限: 余計なログは出さない（debug は app.js で完結）
  if (window.__ysch) return;

  const registry = new WeakMap();   // hostElement -> ShadowRoot
  const roots = new Set();          // 収集用
  const orig = Element.prototype.attachShadow;

  Element.prototype.attachShadow = function(init) {
    const root = orig.call(this, init);
    // closed でもここでは取れる
    registry.set(this, root);
    roots.add(root);

    // 監視用イベント（任意）
    try {
      window.dispatchEvent(new CustomEvent('ysch:shadow-created', { detail: { host: this } }));
    } catch {}

    return root;
  };

  // 公開 API（MAINワールド内）
  window.__ysch = {
    getShadowRoot(el) {
      return registry.get(el) || el.shadowRoot || null;
    },
    getAllRoots() {
      return Array.from(roots);
    }
  };
})();
