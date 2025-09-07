// AGPL-3.0
// MV3 service worker: handle -> displayName resolver with caching.
const CACHE_KEY = 'ysch_display_name_cache_v1';
const memoryCache = new Map(); // handle -> displayName
let cacheLoaded = false;

function loadCache() {
  if (cacheLoaded) return;
  cacheLoaded = true;
  try {
    chrome.storage.local.get([CACHE_KEY], items => {
      const saved = items[CACHE_KEY];
      if (saved && typeof saved === 'object') {
        for (const [k, v] of Object.entries(saved)) {
          if (typeof v === 'string') memoryCache.set(k, v);
        }
        console.debug('[YSCH/bg] cache restored size=', memoryCache.size);
      }
    });
  } catch (e) {
    console.debug('[YSCH/bg] cache load error', e);
  }
}

function persistCacheDebounced() {
  if (persistCacheDebounced._t) clearTimeout(persistCacheDebounced._t);
  persistCacheDebounced._t = setTimeout(() => {
    const obj = {};
    for (const [k, v] of memoryCache.entries()) obj[k] = v;
    try { chrome.storage.local.set({ [CACHE_KEY]: obj }); } catch {}
  }, 500);
}

async function resolveDisplayName(handle) {
  loadCache();
  if (!handle) return { displayName: null, cached: false };
  const norm = handle.toLowerCase(); // normalization for lookup
  if (memoryCache.has(norm)) {
    return { displayName: memoryCache.get(norm), cached: true };
  }
  const encoded = encodeURIComponent(handle);
  const url = `https://www.youtube.com/@${encoded}`;
  try {
    const res = await fetch(url, { credentials: 'omit', mode: 'cors' });
    if (!res.ok) return { displayName: null, error: 'http:' + res.status };
    const text = await res.text();
    const name = extractDisplayName(text);
    if (name) {
      memoryCache.set(norm, name);
      persistCacheDebounced();
    }
    return { displayName: name || null, cached: false };
  } catch (e) {
    return { displayName: null, error: String(e) };
  }
}

function extractDisplayName(html) {
  // og:title
  const og = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
  if (og && og[1]) return decodeEntities(og[1].trim());
  const t = html.match(/<title>([^<]+)<\/title>/i);
  if (t && t[1]) return decodeEntities(t[1].replace(/\s*-\s*YouTube\s*$/i, '').trim());
  return null;
}

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'resolveDisplayName') return;
  resolveDisplayName(msg.handle).then(r => sendResponse(r));
  return true; // async
});

console.debug('[YSCH/bg] service worker loaded');
