// AGPL-3.0
// MV3 service worker: handle -> displayName resolver with caching.
const CACHE_KEY = 'ysch_display_name_cache_v2';
const TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
// key (norm) -> { name: string, ts: number }
const memoryCache = new Map();
let cacheLoaded = false;

function loadCache() {
  if (cacheLoaded) return;
  cacheLoaded = true;
  try {
    chrome.storage.local.get([CACHE_KEY], items => {
      const saved = items[CACHE_KEY];
      if (saved && typeof saved === 'object') {
        const now = Date.now();
        let restored = 0;
        for (const [k, v] of Object.entries(saved)) {
          if (!v) continue;
          // Backward compatibility: If old format is string, set current load time as ts
          if (typeof v === 'string') {
            memoryCache.set(k, { name: v, ts: now });
            restored++;
            continue;
          }
          if (typeof v === 'object' && typeof v.name === 'string' && typeof v.ts === 'number') {
            if (now - v.ts <= TTL_MS) {
              memoryCache.set(k, v);
              restored++;
            }
          }
        }
        console.debug('[YSCH/bg] cache restored size=', restored);
      }
    });
  } catch (e) {
    console.debug('[YSCH/bg] cache load error', e);
  }
}

function persistCacheDebounced() {
  if (persistCacheDebounced._t) clearTimeout(persistCacheDebounced._t);
  persistCacheDebounced._t = setTimeout(() => {
    const now = Date.now();
    const obj = {};
    for (const [k, v] of memoryCache.entries()) {
      if (now - v.ts <= TTL_MS) obj[k] = v; // Do not save outside TTL (natural deletion)
    }
    try { chrome.storage.local.set({ [CACHE_KEY]: obj }); } catch {}
  }, 500);
}

async function resolveDisplayName(handle, channelId) {
  loadCache();
  // prefer handle when both provided
  if (!handle && !channelId) return { displayName: null, cached: false };
  let normKey, fetchUrl;
  if (handle) {
    normKey = 'h:' + handle.toLowerCase();
    fetchUrl = `https://www.youtube.com/@${encodeURIComponent(handle)}`;
  } else {
    normKey = 'c:' + channelId;
    fetchUrl = `https://www.youtube.com/channel/${encodeURIComponent(channelId)}`;
  }
  const cached = memoryCache.get(normKey);
  const now = Date.now();
  if (cached && now - cached.ts <= TTL_MS && cached.name) {
    return { displayName: cached.name, cached: true };
  }
  try {
    const res = await fetch(fetchUrl, { credentials: 'omit', mode: 'cors' });
    if (!res.ok) return { displayName: null, error: 'http:' + res.status };
    const text = await res.text();
    const name = extractDisplayName(text);
    if (name) {
      memoryCache.set(normKey, { name, ts: now });
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
  // Backward compatibility: old messages only had handle
  resolveDisplayName(msg.handle, msg.channelId).then(r => sendResponse(r));
  return true; // async
});

console.debug('[YSCH/bg] service worker loaded (v2 channelId support)');
