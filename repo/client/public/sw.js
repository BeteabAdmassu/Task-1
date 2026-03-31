/**
 * GreenLeaf Service Worker — offline Knowledge Base cache
 *
 * Security: caches are scoped per user ID.  On logout all caches are wiped so
 * a subsequent user on the same workstation cannot access stale protected data.
 */

const CACHE_VERSION = 'v2';
const ARTICLE_API_PATTERN = /\/api\/(articles|plant-care)/;

let activeUserId = null;

function userCacheName() {
  return activeUserId ? `greenleaf-kb-${CACHE_VERSION}-${activeUserId}` : null;
}

async function networkFirst(request) {
  const cacheName = userCacheName();
  if (!cacheName) {
    // No authenticated user — never serve from cache
    return fetch(request);
  }

  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'Offline and no cached data available' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function clearAllCaches() {
  const keys = await caches.keys();
  await Promise.all(keys.map((k) => caches.delete(k)));
  activeUserId = null;
}

// ── Message handling ────────────────────────────────────────────────────────

self.addEventListener('message', (event) => {
  const { type, userId } = event.data || {};

  if (type === 'SET_USER') {
    // Called after login — scope cache to this user
    activeUserId = userId || null;
  }

  if (type === 'CLEAR_CACHE') {
    // Called on logout — wipe everything so the next user starts clean
    clearAllCaches().catch(() => {});
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ cleared: true });
    }
  }
});

// ── Fetch interception ──────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  if (ARTICLE_API_PATTERN.test(event.request.url)) {
    event.respondWith(networkFirst(event.request));
  }
});

// ── Activation: remove stale (version-bumped) caches ───────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.startsWith(`greenleaf-kb-${CACHE_VERSION}-`))
          .map((k) => caches.delete(k)),
      ),
    ),
  );
});
