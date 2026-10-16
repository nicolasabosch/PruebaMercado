import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const memoryCache = new Map();
const inFlight = new Map();
const persistFile = fileURLToPath(new URL("../.cache/persist.json", import.meta.url));
let saveTimer;

try {
  for (const [key, entry] of Object.entries(JSON.parse(readFileSync(persistFile, "utf8")))) memoryCache.set(key, entry);
} catch {}

function savePersisted() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const entries = [...memoryCache].filter(([, entry]) => entry.persist);
    try {
      mkdirSync(dirname(persistFile), { recursive: true });
      writeFileSync(persistFile, JSON.stringify(Object.fromEntries(entries)));
    } catch {}
  }, 1000);
  saveTimer.unref();
}

function setCacheEntry(key, value, ttlMs, staleMs, persist) {
  const now = Date.now();
  memoryCache.set(key, { value, freshUntil: now + ttlMs, staleUntil: now + ttlMs + staleMs, persist });
  if (persist) savePersisted();
}

// Caché genérica:
//  - de-duplicación: varias requests al mismo recurso comparten un solo fetch.
//  - stale-while-revalidate: vencido el TTL se devuelve el valor cacheado al
//    instante y se dispara UNA actualización en segundo plano.
//  - persist: guarda la entrada en disco para sobrevivir a un reinicio.
export async function withCache(key, ttlMs, producer, { staleMs = ttlMs * 8, persist = false } = {}) {
  const now = Date.now();
  const entry = memoryCache.get(key);

  if (entry && entry.freshUntil > now) return entry.value;

  if (entry && entry.staleUntil > now) {
    if (!inFlight.has(key)) refreshCache(key, ttlMs, producer, staleMs, persist).catch(() => {});
    return entry.value;
  }

  return refreshCache(key, ttlMs, producer, staleMs, persist);
}

function refreshCache(key, ttlMs, producer, staleMs, persist) {
  const pending = inFlight.get(key);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const value = await producer();
      setCacheEntry(key, value, ttlMs, staleMs, persist);
      return value;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
}
