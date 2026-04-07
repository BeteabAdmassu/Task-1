/**
 * GreenLeaf Service Worker — offline Knowledge Base + operational data cache
 *
 * Security: caches are scoped per user ID.  On logout all caches are wiped so
 * a subsequent user on the same workstation cannot access stale protected data.
 *
 * Offline strategy
 * ─────────────────
 * KB articles (/api/articles, /api/plant-care):
 *   Network-first → cache on success → serve from cache on error → 503 if no cache.
 *
 * Operational reads (/api/procurement, /purchase-orders, /receiving, /returns, /suppliers):
 *   Same network-first + cache strategy.
 *
 * Operational mutations (POST/PATCH/PUT/DELETE to procurement, purchase-orders,
 *   receiving, returns):
 *   Try network.  If offline, persist the request in IndexedDB and return 202
 *   with X-Offline-Queued:true.  On the next online event the SW replays the
 *   queue and notifies all open clients via postMessage {type:'QUEUE_REPLAYED'}.
 */

const CACHE_VERSION = 'v2';
const ARTICLE_API_PATTERN = /\/api\/(articles|plant-care)/;
const OPERATIONAL_GET_PATTERN = /\/api\/(procurement|purchase-orders|receiving|returns|suppliers)/;
const OPERATIONAL_MUTATE_PATTERN = /\/api\/(procurement|purchase-orders|receiving|returns)/;

// IndexedDB offline-operation queue
const IDB_NAME = 'greenleaf-offline-queue';
const IDB_VERSION = 1;
const IDB_STORE = 'operations';

let activeUserId = null;

function userKbCacheName() {
  return activeUserId ? `greenleaf-kb-${CACHE_VERSION}-${activeUserId}` : null;
}

function userOpCacheName() {
  return activeUserId ? `greenleaf-ops-${CACHE_VERSION}-${activeUserId}` : null;
}

// ── IndexedDB helpers ────────────────────────────────────────────────────────

function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

async function enqueueOperation(request) {
  const body = await request.clone().text().catch(() => '');
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    const record = {
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      body: body || undefined,
      userId: activeUserId,
      queuedAt: Date.now(),
    };
    const req = store.add(record);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getPendingOperations() {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).getAll();
    req.onsuccess = () =>
      resolve(
        (req.result || []).filter((op) => !activeUserId || op.userId === activeUserId),
      );
    req.onerror = () => reject(req.error);
  });
}

async function removeOperation(id) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const req = tx.objectStore(IDB_STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function replayQueue() {
  const ops = await getPendingOperations();
  if (!ops.length) return;

  const results = [];
  for (const op of ops) {
    try {
      const init = {
        method: op.method,
        headers: op.headers,
      };
      if (op.body && op.method !== 'GET' && op.method !== 'HEAD') {
        init.body = op.body;
      }
      const response = await fetch(op.url, init);
      // Remove from queue on any non-5xx response (including 4xx client errors
      // that won't benefit from retrying).
      if (response.status < 500) {
        await removeOperation(op.id);
      }
      results.push({ id: op.id, status: response.status, success: response.ok });
    } catch {
      // Still offline — leave in queue
      results.push({ id: op.id, success: false, error: 'network' });
    }
  }

  const clients = await self.clients.matchAll({ type: 'window' });
  for (const client of clients) {
    client.postMessage({ type: 'QUEUE_REPLAYED', results });
  }
}

// ── Cache strategies ─────────────────────────────────────────────────────────

async function networkFirst(request, cacheName) {
  if (!cacheName) {
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
    return new Response(
      JSON.stringify({ error: 'Offline and no cached data available' }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}

async function mutationWithOfflineQueue(request) {
  try {
    return await fetch(request);
  } catch {
    const queueId = await enqueueOperation(request);
    return new Response(
      JSON.stringify({
        queued: true,
        queueId,
        message:
          'You are offline. This operation will be submitted automatically when connectivity is restored.',
      }),
      {
        status: 202,
        headers: {
          'Content-Type': 'application/json',
          'X-Offline-Queued': 'true',
        },
      },
    );
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
    activeUserId = userId || null;
  }

  if (type === 'CLEAR_CACHE') {
    clearAllCaches().catch(() => {});
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ cleared: true });
    }
  }

  if (type === 'SYNC_QUEUE') {
    replayQueue().catch(() => {});
  }
});

// ── Online detection → trigger queue replay ──────────────────────────────────

self.addEventListener('online', () => {
  replayQueue().catch(() => {});
});

// ── Fetch interception ──────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = request.url;
  const method = request.method;

  if (ARTICLE_API_PATTERN.test(url)) {
    event.respondWith(networkFirst(request, userKbCacheName()));
    return;
  }

  if (OPERATIONAL_GET_PATTERN.test(url) && method === 'GET') {
    event.respondWith(networkFirst(request, userOpCacheName()));
    return;
  }

  if (
    OPERATIONAL_MUTATE_PATTERN.test(url) &&
    ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)
  ) {
    event.respondWith(mutationWithOfflineQueue(request));
  }
});

// ── Activation: remove stale (version-bumped) caches ───────────────────────

self.addEventListener('activate', (event) => {
  const validPrefixes = [
    `greenleaf-kb-${CACHE_VERSION}-`,
    `greenleaf-ops-${CACHE_VERSION}-`,
  ];
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !validPrefixes.some((p) => k.startsWith(p)))
          .map((k) => caches.delete(k)),
      ),
    ),
  );
});
