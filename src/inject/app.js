// AGPL-3.0
(() => {
  const markKey = Symbol('ysch:seen');

  function tryLogCommenterNames() {
    // Studio の要素は逐次ロードされるので、広めにキャッチ
    const hosts = document.querySelectorAll('ytcp-comment, ytcp-comment-thread');
    hosts.forEach(host => {
      if (host[markKey]) return;

      const root = window.__ysch?.getShadowRoot(host);
      if (!root) return;

      // 代表的な構造：a#name > yt-formatted-string
      const link = root.querySelector('a#name');
      if (!link) return;

      const name = (link.textContent || '').trim();
      if (!name) return;

      host[markKey] = true;
      console.log('[YSCH] commenter:', name, host);
    });
  }

  // 定期ポーリング + attachShadow作成イベントで追随
  const interval = setInterval(tryLogCommenterNames, 1000);
  window.addEventListener('ysch:shadow-created', tryLogCommenterNames);

  // ページ離脱時に掃除（念のため）
  window.addEventListener('beforeunload', () => clearInterval(interval));
})();
