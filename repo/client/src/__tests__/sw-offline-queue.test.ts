import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for the offline mutation queue added to public/sw.js.
 *
 * Because a real Service Worker cannot run in a Vitest/Node environment,
 * we re-implement the SW queue helpers in a testable module-level form —
 * the same pattern used in sw-cache.test.ts for the cache helpers.
 *
 * Covers:
 *   - Mutations succeed immediately when online (fetch resolves)
 *   - Offline mutations are queued and 202 Queued is returned
 *   - Queued operations are replayed successfully on reconnect
 *   - 5xx responses are NOT removed from the queue (retry later)
 *   - Non-5xx client errors (4xx) ARE removed from the queue (won't fix itself)
 *   - Queue is user-scoped: a different user's operations are not replayed
 *   - Operational GETs use network-first with ops-scoped cache key
 *   - Cache cleanup on logout removes both kb and ops caches
 */

// ── Re-implement the SW queue helpers in a testable form ──────────────────────

const CACHE_VERSION = 'v2';

interface QueuedOp {
  id: number;
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  userId: string | null;
  queuedAt: number;
}

function makeSwScope() {
  let activeUserId: string | null = null;
  let nextId = 1;
  const queue: QueuedOp[] = [];
  const storedCaches: Record<string, Map<string, Response>> = {};

  // ── Cache helpers ──────────────────────────────────────────────────────────

  const cacheApi = {
    open: vi.fn(async (name: string) => {
      if (!storedCaches[name]) storedCaches[name] = new Map();
      return {
        put: vi.fn((req: Request, res: Response) => {
          storedCaches[name].set(req.url, res);
        }),
        match: vi.fn(async (req: Request) => storedCaches[name].get(req.url) ?? undefined),
      };
    }),
    keys: vi.fn(async () => Object.keys(storedCaches)),
    delete: vi.fn(async (name: string) => {
      delete storedCaches[name];
      return true;
    }),
  };

  function userKbCacheName() {
    return activeUserId ? `greenleaf-kb-${CACHE_VERSION}-${activeUserId}` : null;
  }

  function userOpCacheName() {
    return activeUserId ? `greenleaf-ops-${CACHE_VERSION}-${activeUserId}` : null;
  }

  async function networkFirst(req: Request, fetchImpl: typeof fetch, forOps = false) {
    const cacheName = forOps ? userOpCacheName() : userKbCacheName();
    if (!cacheName) return fetchImpl(req);
    const cache = await cacheApi.open(cacheName);
    try {
      const response = await fetchImpl(req);
      if ((response as Response).ok) cache.put(req, (response as Response).clone());
      return response;
    } catch {
      const cached = await cache.match(req);
      return (
        cached ??
        new Response(JSON.stringify({ error: 'Offline and no cached data available' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    }
  }

  // ── Queue helpers ──────────────────────────────────────────────────────────

  async function enqueueOperation(req: Request): Promise<number> {
    const body = await req.clone().text().catch(() => '');
    const record: QueuedOp = {
      id: nextId++,
      url: req.url,
      method: req.method,
      headers: Object.fromEntries(req.headers.entries()),
      body: body || undefined,
      userId: activeUserId,
      queuedAt: Date.now(),
    };
    queue.push(record);
    return record.id;
  }

  async function mutationWithOfflineQueue(req: Request, fetchImpl: typeof fetch): Promise<Response> {
    try {
      return await fetchImpl(req);
    } catch {
      const queueId = await enqueueOperation(req);
      return new Response(
        JSON.stringify({
          queued: true,
          queueId,
          message: 'You are offline. This operation will be submitted automatically when connectivity is restored.',
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

  async function replayQueue(
    fetchImpl: typeof fetch,
  ): Promise<Array<{ id: number; status?: number; success: boolean; error?: string }>> {
    const userOps = queue.filter((op) => !activeUserId || op.userId === activeUserId);
    const results = [];
    for (const op of userOps) {
      try {
        const init: RequestInit = { method: op.method, headers: op.headers };
        if (op.body && op.method !== 'GET' && op.method !== 'HEAD') init.body = op.body;
        const response = await fetchImpl(new Request(op.url, init));
        if (response.status < 500) {
          const idx = queue.findIndex((o) => o.id === op.id);
          if (idx !== -1) queue.splice(idx, 1);
        }
        results.push({ id: op.id, status: response.status, success: response.ok });
      } catch {
        results.push({ id: op.id, success: false, error: 'network' });
      }
    }
    return results;
  }

  async function clearAllCaches() {
    const keys = await cacheApi.keys();
    await Promise.all(keys.map((k) => cacheApi.delete(k)));
    activeUserId = null;
  }

  function setUser(userId: string) { activeUserId = userId; }
  function getUser() { return activeUserId; }
  function getQueue() { return [...queue]; }
  function getCaches() { return storedCaches; }

  return {
    networkFirst,
    mutationWithOfflineQueue,
    replayQueue,
    clearAllCaches,
    setUser,
    getUser,
    getQueue,
    getCaches,
    userKbCacheName,
    userOpCacheName,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Service worker offline mutation queue', () => {
  let sw: ReturnType<typeof makeSwScope>;
  let mockFetch: ReturnType<typeof vi.fn>;

  const makeReq = (url: string, method = 'POST', body?: string) =>
    new Request(url, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body,
    });

  const makeOkRes = (body = '{}') =>
    new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } });

  const makeCreatedRes = (body = '{}') =>
    new Response(body, { status: 201, headers: { 'Content-Type': 'application/json' } });

  beforeEach(() => {
    sw = makeSwScope();
    mockFetch = vi.fn();
  });

  // ── Online mutations ───────────────────────────────────────────────────────

  it('passes through immediately when the network is available', async () => {
    mockFetch.mockResolvedValue(makeCreatedRes('{"id":"new-req"}'));
    sw.setUser('user-1');

    const req = makeReq('http://localhost/api/procurement/requests', 'POST', '{"title":"x"}');
    const res = await sw.mutationWithOfflineQueue(req, mockFetch as unknown as typeof fetch);

    expect(res.status).toBe(201);
    expect(sw.getQueue()).toHaveLength(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  // ── Offline mutations → queue ──────────────────────────────────────────────

  it('returns 202 with X-Offline-Queued when offline', async () => {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));
    sw.setUser('user-1');

    const req = makeReq('http://localhost/api/procurement/requests', 'POST', '{"title":"offline"}');
    const res = await sw.mutationWithOfflineQueue(req, mockFetch as unknown as typeof fetch);

    expect(res.status).toBe(202);
    expect(res.headers.get('X-Offline-Queued')).toBe('true');

    const body = await res.json();
    expect(body.queued).toBe(true);
    expect(body.queueId).toBeTypeOf('number');
  });

  it('adds the operation to the queue with correct metadata when offline', async () => {
    mockFetch.mockRejectedValue(new TypeError('offline'));
    sw.setUser('user-abc');

    const req = makeReq(
      'http://localhost/api/procurement/requests',
      'POST',
      JSON.stringify({ title: 'Restock Soil' }),
    );
    await sw.mutationWithOfflineQueue(req, mockFetch as unknown as typeof fetch);

    const queue = sw.getQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].url).toBe('http://localhost/api/procurement/requests');
    expect(queue[0].method).toBe('POST');
    expect(queue[0].userId).toBe('user-abc');
    expect(queue[0].body).toContain('Restock Soil');
  });

  it('queues multiple offline operations sequentially', async () => {
    mockFetch.mockRejectedValue(new TypeError('offline'));
    sw.setUser('user-1');

    await sw.mutationWithOfflineQueue(
      makeReq('http://localhost/api/procurement/requests', 'POST'),
      mockFetch as unknown as typeof fetch,
    );
    await sw.mutationWithOfflineQueue(
      makeReq('http://localhost/api/receiving/receipts', 'POST'),
      mockFetch as unknown as typeof fetch,
    );

    expect(sw.getQueue()).toHaveLength(2);
  });

  // ── Queue replay ───────────────────────────────────────────────────────────

  it('replays all queued operations and removes successful ones on reconnect', async () => {
    // Queue two operations offline
    mockFetch.mockRejectedValue(new TypeError('offline'));
    sw.setUser('user-1');

    await sw.mutationWithOfflineQueue(
      makeReq('http://localhost/api/procurement/requests', 'POST'),
      mockFetch as unknown as typeof fetch,
    );
    await sw.mutationWithOfflineQueue(
      makeReq('http://localhost/api/procurement/requests', 'PATCH'),
      mockFetch as unknown as typeof fetch,
    );
    expect(sw.getQueue()).toHaveLength(2);

    // Now back online — replay
    mockFetch.mockResolvedValue(makeOkRes());
    const results = await sw.replayQueue(mockFetch as unknown as typeof fetch);

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.success)).toBe(true);
    expect(sw.getQueue()).toHaveLength(0); // cleared after successful replay
  });

  it('keeps 5xx operations in the queue for later retry', async () => {
    mockFetch.mockRejectedValue(new TypeError('offline'));
    sw.setUser('user-1');

    await sw.mutationWithOfflineQueue(
      makeReq('http://localhost/api/procurement/requests', 'POST'),
      mockFetch as unknown as typeof fetch,
    );

    // Replay receives a 503
    mockFetch.mockResolvedValue(
      new Response('{"error":"db down"}', {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const results = await sw.replayQueue(mockFetch as unknown as typeof fetch);

    expect(results[0].success).toBe(false);
    expect(results[0].status).toBe(503);
    expect(sw.getQueue()).toHaveLength(1); // still in queue
  });

  it('removes 4xx (client error) operations from the queue — will not fix itself', async () => {
    mockFetch.mockRejectedValue(new TypeError('offline'));
    sw.setUser('user-1');

    await sw.mutationWithOfflineQueue(
      makeReq('http://localhost/api/procurement/requests', 'POST', '{"invalid":true}'),
      mockFetch as unknown as typeof fetch,
    );

    // Replay receives a 400 (invalid body)
    mockFetch.mockResolvedValue(
      new Response('{"message":"Validation failed"}', {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const results = await sw.replayQueue(mockFetch as unknown as typeof fetch);

    expect(results[0].status).toBe(400);
    expect(sw.getQueue()).toHaveLength(0); // removed — no point retrying a 400
  });

  it('keeps network-failure entries in queue when still offline during replay', async () => {
    mockFetch.mockRejectedValue(new TypeError('offline'));
    sw.setUser('user-1');

    await sw.mutationWithOfflineQueue(
      makeReq('http://localhost/api/procurement/requests', 'POST'),
      mockFetch as unknown as typeof fetch,
    );

    // Still offline during replay
    const results = await sw.replayQueue(mockFetch as unknown as typeof fetch);

    expect(results[0].error).toBe('network');
    expect(results[0].success).toBe(false);
    expect(sw.getQueue()).toHaveLength(1);
  });

  // ── User scoping ───────────────────────────────────────────────────────────

  it('replay only processes operations belonging to the active user', async () => {
    mockFetch.mockRejectedValue(new TypeError('offline'));

    // Queue one operation for user-A
    sw.setUser('user-A');
    await sw.mutationWithOfflineQueue(
      makeReq('http://localhost/api/procurement/requests', 'POST'),
      mockFetch as unknown as typeof fetch,
    );

    // Switch to user-B and queue another
    sw.setUser('user-B');
    await sw.mutationWithOfflineQueue(
      makeReq('http://localhost/api/procurement/requests', 'POST'),
      mockFetch as unknown as typeof fetch,
    );

    expect(sw.getQueue()).toHaveLength(2);

    // Replay as user-B — should only replay user-B's operation
    mockFetch.mockResolvedValue(makeOkRes());
    const results = await sw.replayQueue(mockFetch as unknown as typeof fetch);

    expect(results).toHaveLength(1);
    // user-B's op was replayed and removed; user-A's op remains
    expect(sw.getQueue()).toHaveLength(1);
    expect(sw.getQueue()[0].userId).toBe('user-A');
  });

  // ── Operational GET caching ────────────────────────────────────────────────

  it('operational GETs use the ops-scoped cache key (not the KB key)', async () => {
    sw.setUser('user-1');
    mockFetch.mockResolvedValue(makeOkRes('{"data":[]}'));

    const req = new Request('http://localhost/api/procurement/requests?page=1');
    await sw.networkFirst(req, mockFetch as unknown as typeof fetch, /* forOps */ true);

    const caches = sw.getCaches();
    expect(Object.keys(caches)).toContain('greenleaf-ops-v2-user-1');
    expect(Object.keys(caches)).not.toContain('greenleaf-kb-v2-user-1');
  });

  it('ops cache serves stale data on network failure', async () => {
    sw.setUser('user-1');

    // First request — online, caches result
    mockFetch.mockResolvedValueOnce(makeOkRes('{"data":[{"id":"req-1"}]}'));
    const req = new Request('http://localhost/api/procurement/requests?page=1');
    await sw.networkFirst(req, mockFetch as unknown as typeof fetch, true);

    // Second request — offline, should serve from cache
    mockFetch.mockRejectedValueOnce(new TypeError('offline'));
    const offlineRes = await sw.networkFirst(req, mockFetch as unknown as typeof fetch, true);
    const body = await (offlineRes as Response).text();
    expect(body).toContain('req-1');
  });

  // ── Logout clears both cache namespaces ───────────────────────────────────

  it('clearAllCaches removes both kb and ops caches and resets the user', async () => {
    sw.setUser('user-1');

    // Populate both cache types
    mockFetch.mockResolvedValue(makeOkRes('{}'));
    await sw.networkFirst(
      new Request('http://localhost/api/articles/1'),
      mockFetch as unknown as typeof fetch,
      false,
    );
    await sw.networkFirst(
      new Request('http://localhost/api/procurement/requests'),
      mockFetch as unknown as typeof fetch,
      true,
    );

    expect(Object.keys(sw.getCaches())).toHaveLength(2);

    await sw.clearAllCaches();

    expect(Object.keys(sw.getCaches())).toHaveLength(0);
    expect(sw.getUser()).toBeNull();
  });
});
