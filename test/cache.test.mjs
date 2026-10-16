import test from "node:test";
import assert from "node:assert/strict";
import { withCache } from "../lib/cache.mjs";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("withCache comparte un solo fetch entre pedidos simultáneos", async () => {
  let calls = 0;
  const producer = async () => {
    calls += 1;
    await wait(20);
    return "valor";
  };
  const results = await Promise.all([withCache("t:dedupe", 1000, producer), withCache("t:dedupe", 1000, producer)]);
  assert.deepEqual(results, ["valor", "valor"]);
  assert.equal(calls, 1);
});

test("withCache devuelve el valor viejo al instante y actualiza en segundo plano", async () => {
  let version = 0;
  const producer = async () => `v${++version}`;
  assert.equal(await withCache("t:swr", 10, producer, { staleMs: 1000 }), "v1");
  await wait(20);
  assert.equal(await withCache("t:swr", 10, producer, { staleMs: 1000 }), "v1");
  await wait(20);
  assert.equal(await withCache("t:swr", 10, producer, { staleMs: 1000 }), "v2");
});
