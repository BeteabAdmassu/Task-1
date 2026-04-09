import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for service worker cache isolation and logout invalidation.
 *
 * We test the SW logic directly by importing and exercising a module-level
 * recreation of the cache helpers, mirroring the behaviour in public/sw.js.
 */

// ── Re-implement the SW cache helpers in a testable module form ───────────────

const CACHE_VERSION = 'v2';

function makeSwScope() {
  let activeUserId: string | null = null;
  const storedCaches: Record<string, Map<string, Response>> = {};

  const cacheApi = {
    open: vi.fn(async (name: string) => {
      if (!storedCaches[name]) storedCaches[name] = new Map();
      return {
        put: vi.fn((req: Request, res: Response) => storedCaches[name].set(req.url, res)),
        match: vi.fn(async (req: Request) => storedCaches[name].get(req.url) ?? undefined),
      };
    }),
    keys: vi.fn(async () => Object.keys(storedCaches)),
    delete: vi.fn(async (name: string) => { delete storedCaches[name]; return true; }),
  };

  function userCacheName() {
    return activeUserId ? `greenleaf-kb-${CACHE_VERSION}-${activeUserId}` : null;
  }

  async function networkFirst(request: Request, fetchImpl: typeof fetch) {
    const cacheName = userCacheName();
    if (!cacheName) return fetchImpl(request);
    const cache = await cacheApi.open(cacheName);
    try {
      const response = await fetchImpl(request);
      if ((response as Response).ok) cache.put(request, (response as Response).clone());
      return response;
    } catch {
      const cached = await cache.match(request);
      return (
        cached ??
        new Response(JSON.stringify({ error: 'offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    }
  }

  async function clearAllCaches() {
    const keys = await cacheApi.keys();
    await Promise.all(keys.map((k) => cacheApi.delete(k)));
    activeUserId = null;
  }

  function setUser(userId: string) { activeUserId = userId; }
  function getUser() { return activeUserId; }
  function getCaches() { return storedCaches; }

  return { networkFirst, clearAllCaches, setUser, getUser, getCaches, userCacheName };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Service worker cache isolation', () => {
  let sw: ReturnType<typeof makeSwScope>;
  let mockFetch: ReturnType<typeof vi.fn>;

  const makeReq = (url: string) => new Request(url);
  const makeOkRes = (body: string) =>
    new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } });

  beforeEach(() => {
    sw = makeSwScope();
    mockFetch = vi.fn();
  });

  it('does not cache when no user is set', async () => {
    mockFetch.mockResolvedValue(makeOkRes('{"data":[]}'));
    const req = makeReq('http://localhost/api/articles?page=1');
    await sw.networkFirst(req, mockFetch as unknown as typeof fetch);

    // No cache name set → no cache entry
    expect(sw.userCacheName()).toBeNull();
    expect(Object.keys(sw.getCaches())).toHaveLength(0);
  });

  it('caches responses under user-scoped key after SET_USER', async () => {
    sw.setUser('user-abc');
    mockFetch.mockResolvedValue(makeOkRes('{"title":"Plant Care 101"}'));

    const req = makeReq('http://localhost/api/articles/1');
    await sw.networkFirst(req, mockFetch as unknown as typeof fetch);

    const caches = sw.getCaches();
    expect(Object.keys(caches)).toContain(`greenleaf-kb-v2-user-abc`);
  });

  it('separate users get separate cache buckets', async () => {
    sw.setUser('user-1');
    mockFetch.mockResolvedValue(makeOkRes('{"user":1}'));
    await sw.networkFirst(makeReq('http://localhost/api/articles/1'), mockFetch as unknown as typeof fetch);

    sw.setUser('user-2');
    mockFetch.mockResolvedValue(makeOkRes('{"user":2}'));
    await sw.networkFirst(makeReq('http://localhost/api/articles/2'), mockFetch as unknown as typeof fetch);

    const caches = sw.getCaches();
    expect(Object.keys(caches)).toContain('greenleaf-kb-v2-user-1');
    expect(Object.keys(caches)).toContain('greenleaf-kb-v2-user-2');
  });

  it('clears ALL caches and resets user on CLEAR_CACHE (logout)', async () => {
    sw.setUser('user-1');
    mockFetch.mockResolvedValue(makeOkRes('{"data":true}'));
    await sw.networkFirst(makeReq('http://localhost/api/articles/1'), mockFetch as unknown as typeof fetch);

    expect(Object.keys(sw.getCaches())).toHaveLength(1);

    await sw.clearAllCaches();

    expect(Object.keys(sw.getCaches())).toHaveLength(0);
    expect(sw.getUser()).toBeNull();
  });

  it('serves offline fallback when network fails and no cache exists', async () => {
    sw.setUser('user-1');
    mockFetch.mockRejectedValue(new Error('Network error'));

    const res = await sw.networkFirst(
      makeReq('http://localhost/api/articles/99'),
      mockFetch as unknown as typeof fetch,
    );

    expect((res as Response).status).toBe(503);
  });

  it('serves cached response when offline after prior successful fetch', async () => {
    sw.setUser('user-1');

    // First: online fetch caches the response
    mockFetch.mockResolvedValueOnce(makeOkRes('{"title":"Cached Article"}'));
    const req = makeReq('http://localhost/api/articles/5');
    await sw.networkFirst(req, mockFetch as unknown as typeof fetch);

    // Second: offline, should serve from cache
    mockFetch.mockRejectedValueOnce(new Error('offline'));
    const res = await sw.networkFirst(req, mockFetch as unknown as typeof fetch);
    const body = await (res as Response).text();
    expect(body).toContain('Cached Article');
  });
});
