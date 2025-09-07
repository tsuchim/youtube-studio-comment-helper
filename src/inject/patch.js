// AGPL-3.0
(() => {
  // Minimum: Do not output extra logs (debug is handled in app.js)
  if (window.__ysch) return;

  const registry = new WeakMap();   // hostElement -> ShadowRoot
  const roots = new Set();          // For collection
  const orig = Element.prototype.attachShadow;

  Element.prototype.attachShadow = function(init) {
    const root = orig.call(this, init);
    // Can get even if closed
    registry.set(this, root);
    roots.add(root);

    // Monitoring event (optional)
    try {
      window.dispatchEvent(new CustomEvent('ysch:shadow-created', { detail: { host: this } }));
  } catch { /* ignore dispatch failure */ }

    return root;
  };

  // Public API (in MAIN world)
  window.__ysch = {
    getShadowRoot(el) {
      return registry.get(el) || el.shadowRoot || null;
    },
    getAllRoots() {
      return Array.from(roots);
    }
  };
})();
