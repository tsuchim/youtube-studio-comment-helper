// AGPL-3.0
(function injectMainWorld() {
  function inject(file) {
    const s = document.createElement('script');
    s.src = chrome.runtime.getURL(file);
    s.type = 'text/javascript';
    (document.head || document.documentElement).appendChild(s);
    s.onload = () => s.remove();
  }

  // 順序が重要：まずパッチ、次にアプリ本体
  inject('src/inject/patch.js');
  inject('src/inject/app.js');
})();
