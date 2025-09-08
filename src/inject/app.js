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
      const target = anchor.querySelector('yt-formatted-string.author-text') || anchor;
      const key = this.getCacheKey(type, value);
      
      // Check if already processed for this handle/channelId
      if (target.getAttribute('data-ysch-key') === key) return false;
      
      // Request resolution if needed
      this.request(type, value);
      
      // Apply if resolved
      const displayName = this.resolved.get(key);
      if (displayName) {
        const originalHandle = type === 'handle' ? value : null;
        if (this.replaceInTarget(target, originalHandle, displayName)) {
          target.setAttribute('data-ysch-key', key);
          target.setAttribute('data-ysch-original', originalHandle ? `@${originalHandle}` : '');
          this.log.debug('Replaced:', originalHandle ? `@${originalHandle}` : value, '=>', displayName);
          return true;
        }
      }
      
      return false;
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

  // Anchor-level intersection observer (後からビューに入った未適用要素を補足)
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
      
  // window のスクロール (通常のページ全体スクロール)
  window.addEventListener('scroll', this.scrollHandler, { passive: true });
  // capture で任意のスクロールコンテナからのイベントも拾う (Studioは内部スクロールが多い)
  document.addEventListener('scroll', this.scrollHandler, { passive: true, capture: true });
  // 既知のスクロールコンテナ候補にリスナを追加 (存在すれば)
  this.attachScrollContainers();
  // 動的に追加されるスクロールコンテナを数秒ごとに探索
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
  // フォールバック定期処理を有効化（無限スクロールでイベントを取り逃した場合の保険）
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
      // Re-process to apply new resolutions
  setTimeout(() => replacer.processAll(), 30);
  setTimeout(() => replacer.processAll(), 250); // guard shorter delay
  setTimeout(() => replacer.processAll(), 1000); // guard long delay
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
