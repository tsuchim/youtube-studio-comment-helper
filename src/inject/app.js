// AGPL-3.0
// Core handle-to-displayName replacement system for YouTube Studio
(() => {
  'use strict';

  // ==================== CORE ARCHITECTURE ====================
  
  class Logger {
    constructor() {
      this.levels = { silent:0, error:1, warn:2, info:3, debug:4 };
      this.refresh();
      window.addEventListener('ysch:reload-log-level', () => this.refresh());
    }
    
    refresh() {
      try {
        this.levelName = (localStorage.getItem('YSCH_LOG') || 'warn').toLowerCase();
        this.level = this.levels[this.levelName] ?? this.levels.warn;
      } catch { 
        this.levelName = 'warn'; 
        this.level = this.levels.warn; 
      }
    }
    
    debug(...a) { if (this.level >= 4) console.debug('[YSCH]', ...a); }
    info(...a)  { if (this.level >= 3) console.info('[YSCH]', ...a); }
    warn(...a)  { if (this.level >= 2) console.warn('[YSCH]', ...a); }
    error(...a) { if (this.level >= 1) console.error('[YSCH]', ...a); }
  }

  class HandleExtractor {
    static extract(anchor) {
      if (!anchor) return null;
      
      // Priority 1: href with @handle
      const href = anchor.getAttribute('href') || '';
      if (href.startsWith('/@')) {
        const handle = href.slice(2).split(/[/?#]/)[0];
        if (handle) return { type: 'handle', value: handle };
      }
      
      // Priority 2: href with channelId
      const channelMatch = href.match(/\/channel\/(UC[0-9A-Za-z_-]{10,})/);
      if (channelMatch) {
        return { type: 'channelId', value: channelMatch[1] };
      }
      
      // Priority 3: text content with @handle
      const text = (anchor.textContent || '').trim();
      if (text.startsWith('@')) {
        return { type: 'handle', value: text.slice(1) };
      }
      
      return null;
    }
  }

  class DisplayNameReplacer {
    constructor(logger) {
      this.log = logger;
      this.resolved = new Map(); // cacheKey -> displayName
      this.requested = new Set(); // cacheKey
  // Element sets associated with each handle/channelId
  this.keyToElements = new Map(); // key -> Set<element>
  // Current state for each element
  this.elementState = new WeakMap(); // el -> { key, rawHandle, replaced }
    }
    
    getCacheKey(type, value) {
      return `${type}:${value.toLowerCase()}`;
    }
    
    isResolved(type, value) {
      return this.resolved.has(this.getCacheKey(type, value));
    }
    
    request(type, value) {
      const key = this.getCacheKey(type, value);
      if (this.requested.has(key) || this.resolved.has(key)) return false;
      
      this.requested.add(key);
      const detail = type === 'handle' ? { handle: value } : { channelId: value };
      window.dispatchEvent(new CustomEvent('ysch:resolve-handle', { detail }));
      return true;
    }
    
    onResolved({ handle, channelId, displayName, error, cached }) {
      const type = handle ? 'handle' : 'channelId';
      const value = handle || channelId;
      const key = this.getCacheKey(type, value);
      
      if (displayName) {
        this.resolved.set(key, displayName);
        this.log.info(`Resolved ${type}:`, value, '=>', displayName, cached ? '(cached)' : '');
        return true;
      } else if (error) {
        this.log.warn(`Resolution failed for ${type}:`, value, error);
        return false;
      }
      return false;
    }
    
    replaceInTarget(target, originalHandle, displayName) {
      if (!target || !originalHandle || !displayName) return false;
      
      const handleToken = '@' + originalHandle;
      
      // Find and replace in text nodes
      const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (node.nodeValue && node.nodeValue.includes(handleToken)) {
          node.nodeValue = node.nodeValue.replace(handleToken, displayName);
          return true;
        }
      }
      
      // Fallback: replace entire text content
      target.textContent = displayName;
      return true;
    }
    
    processAnchor(anchor) {
      const extracted = HandleExtractor.extract(anchor);
      if (!extracted) return false;
      const { type, value } = extracted;
      // 対象は anchor 本体に限定（余計な兄弟/日付混入を最小化）
      const target = anchor;
      const key = this.getCacheKey(type, value);

      const state = this.elementState.get(target);
      if (state && state.key !== key) {
        // リサイクル: 旧集合から除去
        const oldSet = this.keyToElements.get(state.key);
        if (oldSet) oldSet.delete(target);
        // 汚染テキスト (旧表示名 + 新 @handle) をクリーン化
        const handleToken = '@' + value;
        if (!target.textContent || !target.textContent.includes(handleToken)) {
          target.textContent = handleToken; // 新ハンドルのみ保持
        } else {
          // 先頭に別文字列があればトリム
          const idx = target.textContent.indexOf(handleToken);
          if (idx > 0) target.textContent = target.textContent.slice(idx);
          else target.textContent = handleToken;
        }
        target.removeAttribute('data-ysch-replaced');
        target.removeAttribute('data-ysch-original');
      }

      // 登録
      if (!this.keyToElements.has(key)) this.keyToElements.set(key, new Set());
      this.keyToElements.get(key).add(target);
      this.elementState.set(target, { key, rawHandle: type === 'handle' ? value : null, replaced: false });
      target.setAttribute('data-ysch-key', key);

      // 解決要求（初回のみ）
      this.request(type, value);

      // 既解決なら即適用
      const displayName = this.resolved.get(key);
      if (displayName) {
        return this.applyDisplayNameToElement(key, target, displayName);
      }
      return false;
    }

    applyDisplayNameToElement(key, el, displayName) {
      if (!el || !displayName) return false;
      const state = this.elementState.get(el);
      if (!state) return false;
      if (el.getAttribute('data-ysch-replaced') === '1') return false;
      const handle = state.rawHandle;
      if (handle) {
        const token = '@' + handle;
        const txt = el.textContent || '';
        // 汚染パターン: 先頭に displayName でない文字列 + token
        if (txt.includes(token)) {
          // 例: "旧名@handle", "他人名 @handle", "@handle • 9 日前" など → token 部分が存在したら丸ごと displayName に正規化
          // アンカー内に本来付くべきでない付帯情報は外部 DOM にある想定なので保持しない
          el.textContent = displayName;
        } else if (/^\S+@/.test(txt)) {
          // 既に前方汚染（別名 + @新ハンドル未表示）: 強制表示名
          el.textContent = displayName;
        } else if (txt.trim() === '' || txt.trim() === token) {
          el.textContent = displayName;
        } else {
          // 不明パターン: 無理に書き換えずスキップ
          return false;
        }
      } else {
        // channelId の場合は安全に全置換（anchor 内は純粋な名前のみ想定）
        el.textContent = displayName;
      }
      el.setAttribute('data-ysch-replaced', '1');
      if (handle) el.setAttribute('data-ysch-original', '@'+handle);
      const st = this.elementState.get(el);
      if (st) st.replaced = true;
      return true;
    }
    
    // Collect anchors from document + captured shadow roots (if patch.js injected)
    collectAnchors() {
      const selector = 'a#name, a#author-text, a[href^="/@"][id="name"], a[href^="/@"][id="author-text"], a[href^="/@"]';
      const set = new Set();
      // Light DOM
      document.querySelectorAll(selector).forEach(a => set.add(a));
      // Shadow roots (captured even if closed by patch.js)
      try {
        const roots = window.__ysch?.getAllRoots?.() || [];
        for (const r of roots) {
          if (!r || !r.querySelectorAll) continue;
            r.querySelectorAll(selector).forEach(a => set.add(a));
        }
      } catch (e) {
        this.log.debug('Shadow root scan failed', e);
      }
      return Array.from(set);
    }

    processAll() {
      const anchors = this.collectAnchors();
      let processed = 0;
      for (const anchor of anchors) {
        try {
          if (this.processAnchor(anchor)) processed++;
        } catch (e) {
          this.log.debug('Error processing anchor:', e);
        }
      }
      if (processed && this.log.level >= 4) this.log.debug('Processed anchors count:', processed);
      return processed;
    }

    applyResolvedToKey(key) {
      const displayName = this.resolved.get(key);
      if (!displayName) return 0;
      const set = this.keyToElements.get(key);
      if (!set || !set.size) return 0;
      let applied = 0;
      for (const el of [...set]) {
        if (!el.isConnected) { set.delete(el); continue; }
  if (this.applyDisplayNameToElement(key, el, displayName)) applied++;
      }
      return applied;
    }
  }

  class SmartTrigger {
    constructor(processor, logger) {
      this.process = processor;
      this.log = logger;
      this.init();
    }
    
    init() {
      // Initial processing after page elements settle
      this.scheduleInitial();
      
      // Mutation observer for dynamic content
      this.setupMutationObserver();
      
      // Scroll-based processing for infinite scroll
      this.setupScrollHandler();
      
      // Intersection observer for viewport entry
      this.setupIntersectionObserver();

  // Anchor-level intersection observer (captures unapplied elements that enter the view later)
  this.setupAnchorObserver();
    }
    
    scheduleInitial() {
      // Multiple attempts during page load
      setTimeout(() => this.process(), 100);   // Fast initial
      setTimeout(() => this.process(), 500);   // After DOM settle
      setTimeout(() => this.process(), 1500);  // After heavy scripts
    }
    
    setupMutationObserver() {
      let timeout = null;
      
      this.mutationObserver = new MutationObserver(mutations => {
        if (timeout) clearTimeout(timeout);
        
        timeout = setTimeout(() => {
          const hasRelevantNodes = mutations.some(m => 
            Array.from(m.addedNodes).some(n => 
              n.nodeType === 1 && (
                n.matches?.('a#name, a#author-text') || 
                n.querySelector?.('a#name, a#author-text')
              )
            )
          );
          
          if (hasRelevantNodes) {
            this.log.debug('Mutation triggered processing');
            this.process();
          }
          timeout = null;
        }, 150); // Debounce
      });
      
      this.mutationObserver.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
    }
    
    setupScrollHandler() {
      let timeout = null;
      
      this.scrollHandler = () => {
        if (timeout) return;
        timeout = setTimeout(() => {
          this.log.debug('Scroll triggered processing');
          this.process();
          timeout = null;
        }, 300);
      };
      
  // window scroll (normal page-wide scrolling)
  window.addEventListener('scroll', this.scrollHandler, { passive: true });
  // Use capture to catch scroll events from arbitrary scroll containers (Studio often uses internal scrolling)
  document.addEventListener('scroll', this.scrollHandler, { passive: true, capture: true });
  // Add listeners to known scroll container candidates (if they exist)
  this.attachScrollContainers();
  // Periodically search for dynamically added scroll containers every few seconds
  this.scrollContainerWatcher = setInterval(() => this.attachScrollContainers(), 4000);
    }
    
    setupIntersectionObserver() {
      this.intersectionObserver = new IntersectionObserver(entries => {
        const hasNewEntries = entries.some(entry => entry.isIntersecting);
        if (hasNewEntries) {
          this.log.debug('Intersection triggered processing');
          this.process();
        }
      }, { rootMargin: '50px' });
      
      // Observe comment containers as they appear
      setTimeout(() => {
        document.querySelectorAll('ytcp-comment, ytcp-comment-thread').forEach(el => {
          this.intersectionObserver.observe(el);
        });
      }, 1000);
    }
    
    destroy() {
      if (this.mutationObserver) this.mutationObserver.disconnect();
      if (this.intersectionObserver) this.intersectionObserver.disconnect();
      if (this.scrollHandler) window.removeEventListener('scroll', this.scrollHandler);
      if (this.scrollHandler) document.removeEventListener('scroll', this.scrollHandler, { capture: true });
      if (this.scrollContainerWatcher) clearInterval(this.scrollContainerWatcher);
      if (this.fallbackInterval) clearInterval(this.fallbackInterval);
  if (this.anchorObserver) this.anchorObserver.disconnect();
    }

    attachScrollContainers() {
      const selectors = [
        'ytd-app', 'ytcp-app', '#content', 'ytcp-comments-list',
        'ytcp-comment-thread', 'ytcp-comment', 'tp-yt-app-drawer',
        'iron-pages', 'ytcp-page-manager'
      ];
      selectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
          if (!el || typeof el.addEventListener !== 'function') return;
          if (el.__yschScrollBound) return;
          // スクロール可能か軽く判定
          try {
            const hasScroll = (el.scrollHeight - el.clientHeight) > 8 || getComputedStyle(el).overflowY === 'auto' || getComputedStyle(el).overflowY === 'scroll';
            if (!hasScroll) return;
          } catch { /* ignore style access */ }
          el.addEventListener('scroll', this.scrollHandler, { passive: true });
          el.__yschScrollBound = true;
          this.log.debug('Attached scroll listener to', sel);
        });
      });
    }

    enableFallback(intervalMs = 6000) {
      if (this.fallbackInterval) return;
      this.fallbackInterval = setInterval(() => {
        this.log.debug('Fallback interval processing');
        this.process();
      }, intervalMs);
    }

    setupAnchorObserver() {
      try {
        this.anchorObserver = new IntersectionObserver(entries => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const a = entry.target;
            try {
              if (replacer && typeof replacer.processAnchor === 'function') {
                const ok = replacer.processAnchor(a);
                if (ok) this.anchorObserver.unobserve(a);
              }
            } catch { /* ignore single anchor processing error */ }
          }
        }, { rootMargin: '100px' });
      } catch (e) {
        this.log.warn('Anchor observer init failed', e);
      }
      // 初期登録
      setTimeout(() => this.registerAnchorsForObservation(), 800);
      setTimeout(() => this.registerAnchorsForObservation(), 2500);
    }

    registerAnchorsForObservation() {
      if (!this.anchorObserver) return;
      try {
        const anchors = replacer?.collectAnchors?.() || [];
        for (const a of anchors) {
          // 既に置換済みなら不要
            const extracted = HandleExtractor.extract(a);
            if (!extracted) continue;
            const { type, value } = extracted;
            const key = replacer.getCacheKey(type, value);
            const target = a.querySelector('yt-formatted-string.author-text') || a;
            if (target.getAttribute('data-ysch-key') === key) continue; // already applied
            // 解決済みか未解決かに関わらず、ビューポート侵入時に再トライする仕組み
            this.anchorObserver.observe(a);
        }
      } catch (e) {
        this.log.debug('registerAnchorsForObservation error', e);
      }
    }
  }

  // ==================== INITIALIZATION ====================
  
  const logger = new Logger();
  const replacer = new DisplayNameReplacer(logger);
  const trigger = new SmartTrigger(() => {
    const count = replacer.processAll();
    if (trigger && count) trigger.registerAnchorsForObservation();
  }, logger);
  // Enable fallback periodic processing (safety net for missed events in infinite scroll)
  trigger.enableFallback(7000);
  
  // Explicit startup kicks (初期ロード直後に確実に走らせる)
  function startupKick() {
    try {
      replacer.processAll();
      setTimeout(() => replacer.processAll(), 400);   // after micro layout
      setTimeout(() => replacer.processAll(), 1200);  // after heavy scripts
      setTimeout(() => replacer.processAll(), 3000);  // after possible late shadow attach
      logger.debug('Startup kick scheduled');
    } catch (e) {
      logger.warn('Startup kick error', e);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startupKick, { once: true });
  } else {
    startupKick();
  }
  
  // Bridge to background script
  window.addEventListener('ysch:display-name-resolved', ev => {
    const resolved = replacer.onResolved(ev.detail || {});
    if (resolved) {
      const { handle, channelId } = ev.detail || {};
      const key = handle ? replacer.getCacheKey('handle', handle) : replacer.getCacheKey('channelId', channelId);
      // 直接キーに紐づく全要素へ適用（再スキャン不要）
      const appliedNow = replacer.applyResolvedToKey(key);
      if (appliedNow === 0) {
        // 要素が後から来るケースに備えて軽い遅延再試行（限定回数）
        let attempts = 0;
        const retry = () => {
          const a = replacer.applyResolvedToKey(key);
            attempts++;
          if (a > 0 || attempts >= 3) return;
          setTimeout(retry, attempts === 1 ? 120 : 400);
        };
        setTimeout(retry, 60);
      }
    }
  });

  // 新しい ShadowRoot が生成されたら短い遅延で再処理
  window.addEventListener('ysch:shadow-created', () => {
    setTimeout(() => replacer.processAll(), 80);
    setTimeout(() => replacer.processAll(), 500);
  });
  
  // Cleanup on page unload
  window.addEventListener('beforeunload', () => trigger.destroy());
  
  // Development helpers
  if (typeof window !== 'undefined') {
    window.__ysch_debug = {
      logger,
      replacer,
      trigger,
      processNow: () => replacer.processAll(),
      stats: () => ({
        resolved: replacer.resolved.size,
        requested: replacer.requested.size
      })
    };
  }
  
  logger.info('YouTube Studio Comment Helper v2 initialized');
})();
