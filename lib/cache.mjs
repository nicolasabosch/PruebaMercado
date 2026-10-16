const memoryCache = new Map();
const inFlight = new Map();

function setCacheEntry(key, value, ttlMs, staleMs) {
  const now = Date.now();
  memoryCache.set(key, { value, freshUntil: now + ttlMs, staleUntil: now + ttlMs + staleMs });
}

// Caché genérica:
//  - de-duplicación: varias requests al mismo recurso comparten un solo fetch.
//  - stale-while-revalidate: vencido el TTL se devuelve el valor cacheado al
//    instante y se dispara UNA actualización en segundo plano.
export async function withCache(key, ttlMs, producer, { staleMs = ttlMs * 8 } = {}) {
  const now = Date.now();
  const entry = memoryCache.get(key);

  if (entry && entry.freshUntil > now) return entry.value;

  if (entry && entry.staleUntil > now) {
    if (!inFlight.has(key)) refreshCache(key, ttlMs, producer, staleMs).catch(() => {});
    return entry.value;
  }

  return refreshCache(key, ttlMs, producer, staleMs);
}

function refreshCache(key, ttlMs, producer, staleMs) {
  const pending = inFlight.get(key);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const value = await producer();
      setCacheEntry(key, value, ttlMs, staleMs);
      return value;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
}
