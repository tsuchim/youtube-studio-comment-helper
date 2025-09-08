// AGPL-3.0
// Clean background script for handle/channelId resolution with caching
const CACHE_KEY = 'ysch_cache_v3';
const TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

class DisplayNameResolver {
  constructor() {
    this.cache = new Map();
    this.loadCache();
  }

  async loadCache() {
    try {
      const result = await chrome.storage.local.get([CACHE_KEY]);
      const saved = result[CACHE_KEY];
      
      if (saved && typeof saved === 'object') {
        const now = Date.now();
        
        for (const [key, entry] of Object.entries(saved)) {
          if (entry && typeof entry === 'object' && entry.name && entry.ts) {
            if (now - entry.ts <= TTL_MS) {
              this.cache.set(key, entry);
            }
          }
        }
        
        console.debug('[YSCH/bg] Cache loaded:', this.cache.size, 'entries');
      }
    } catch (e) {
      console.debug('[YSCH/bg] Cache load error:', e);
    }
  }

  async saveCache() {
    const now = Date.now();
    const toSave = {};
    
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.ts <= TTL_MS) {
        toSave[key] = entry;
      }
    }
    
    try {
      await chrome.storage.local.set({ [CACHE_KEY]: toSave });
    } catch (e) {
      console.debug('[YSCH/bg] Cache save error:', e);
    }
  }

  getCacheKey(handle, channelId) {
    return handle ? `h:${handle.toLowerCase()}` : `c:${channelId}`;
  }

  async resolve(handle, channelId) {
    if (!handle && !channelId) {
      return { displayName: null, error: 'No handle or channelId provided' };
    }

    const cacheKey = this.getCacheKey(handle, channelId);
    const cached = this.cache.get(cacheKey);
    const now = Date.now();

    // Return cached if valid
    if (cached && now - cached.ts <= TTL_MS) {
      return { displayName: cached.name, cached: true };
    }

    // Determine fetch URL
    const url = handle 
      ? `https://www.youtube.com/@${encodeURIComponent(handle)}`
      : `https://www.youtube.com/channel/${encodeURIComponent(channelId)}`;

    try {
      const response = await fetch(url, { 
        credentials: 'omit', 
        mode: 'cors',
        cache: 'default'
      });

      if (!response.ok) {
        return { displayName: null, error: `HTTP ${response.status}` };
      }

      const html = await response.text();
      const displayName = this.extractDisplayName(html);

      if (displayName) {
        // Cache the result
        this.cache.set(cacheKey, { name: displayName, ts: now });
        
        // Debounced save
        clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => this.saveCache(), 1000);
        
        return { displayName, cached: false };
      }

      return { displayName: null, error: 'Could not extract display name' };

    } catch (error) {
      return { displayName: null, error: error.message };
    }
  }

  extractDisplayName(html) {
    // Try og:title first
    const ogMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
    if (ogMatch) {
      return this.decodeEntities(ogMatch[1].trim());
    }

    // Fallback to title tag
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch) {
      const title = titleMatch[1].replace(/\s*-\s*YouTube\s*$/i, '').trim();
      return this.decodeEntities(title);
    }

    return null;
  }

  decodeEntities(str) {
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'");
  }
}

// Initialize resolver
const resolver = new DisplayNameResolver();

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'resolveDisplayName') {
    resolver.resolve(message.handle, message.channelId)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ 
        displayName: null, 
        error: error.message 
      }));
    return true; // Async response
  }
});

console.debug('[YSCH/bg] Clean background script loaded');
