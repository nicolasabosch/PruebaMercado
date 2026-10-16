import test from "node:test";
import assert from "node:assert/strict";
import { extractAuctionsFromHtml, getAuctionTypeTotals } from "../sources/auctions.mjs";
import { findAmountsNear } from "../sources/dollar.mjs";
import { buildCensusSummary } from "../sources/census.mjs";
import { buildConfidenceSnapshot, seriesUrl, withAge } from "../sources/macro.mjs";
import { isAllowedData912Path } from "../sources/data912.mjs";

test("extractAuctionsFromHtml lee el arreglo aunque haya corchetes dentro de strings", () => {
  const html = String.raw`<script>self.__next_f.push([1,"{\"licitaciones\":[{\"id\":\"1\",\"note\":\"a]b\"},{\"id\":\"2\"}],\"otro\":[]}"])</script>`;
  assert.deepEqual(extractAuctionsFromHtml(html), [{ id: "1", note: "a]b" }, { id: "2" }]);
});

test("extractAuctionsFromHtml falla con mensaje claro si no encuentra la lista", () => {
  assert.throws(() => extractAuctionsFromHtml("<html></html>"), /No se encontró la lista/);
});

test("getAuctionTypeTotals suma por tipo y ordena de mayor a menor", () => {
  const totals = getAuctionTypeTotals({
    instruments: [
      { type: "cer", effectiveValue: 10 },
      { type: "lecap", effectiveValue: 30 },
      { type: "cer", effectiveValue: 5 },
      { effectiveValue: 1 }
    ]
  });
  assert.deepEqual(totals, [{ type: "lecap", value: 30 }, { type: "cer", value: 15 }, { type: "otros", value: 1 }]);
});

test("findAmountsNear toma compra y venta cerca del marcador", () => {
  const text = "Cotizaciones Dólar Blue Compra $1.525 Venta $1.545 actualizado";
  assert.deepEqual(findAmountsNear(text, ["Dólar Blue"]), { buy: 1525, sell: 1545 });
  assert.equal(findAmountsNear("sin precios", ["Dólar Blue"]), null);
});

test("buildCensusSummary calcula participación de mayores y variación", () => {
  const rows = (older, young) => [
    { ageGroup: "0-4", female: young / 2, male: young / 2, total: young },
    { ageGroup: "65-69", female: older / 2, male: older / 2, total: older }
  ];
  const summary = buildCensusSummary(rows(30, 70), rows(10, 90));
  assert.equal(summary.shares.older.current, 30);
  assert.equal(summary.shares.older.previous, 10);
  assert.equal(summary.shares.older.delta, 20);
  assert.equal(summary.totals.delta, 0);
});

test("seriesUrl usa limit + sort + start_date, en ese orden, fijado al día 1", () => {
  const url = seriesUrl("abc", 20, new Date("2026-10-16T12:00:00Z"));
  assert.equal(url, "https://apis.datos.gob.ar/series/api/series/?ids=abc&limit=22&sort=desc&start_date=2025-02-01");
});

test("withAge marca como vencido un dato manual viejo", () => {
  const now = new Date("2026-10-16T00:00:00Z");
  assert.equal(withAge({ date: "2026-03-01", maxAgeDays: 75 }, now).stale, true);
  assert.equal(withAge({ date: "2026-10-01", maxAgeDays: 75 }, now).stale, false);
});

test("buildConfidenceSnapshot calcula variación mensual e interanual", () => {
  const snapshot = buildConfidenceSnapshot({
    rows: [
      { date: "2025-09-01", value: 50 },
      { date: "2026-08-01", value: 40 },
      { date: "2026-09-01", value: 44 }
    ]
  });
  assert.equal(snapshot.value, 44);
  assert.ok(Math.abs(snapshot.change - 10) < 1e-9);
  assert.ok(Math.abs(snapshot.yearChange - -12) < 1e-9);
  assert.equal(buildConfidenceSnapshot({ rows: [] }), null);
});

test("isAllowedData912Path acepta solo rutas conocidas", () => {
  assert.equal(isAllowedData912Path("live/arg_stocks"), true);
  assert.equal(isAllowedData912Path("eod/volatilities/GGAL"), true);
  assert.equal(isAllowedData912Path("../etc/passwd"), false);
  assert.equal(isAllowedData912Path("live/otra_cosa"), false);
});
