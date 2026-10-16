import { fetchWithCache } from "../lib/http.mjs";
import { loadData } from "../lib/data.mjs";

const auctionSourceUrl = "https://licitaciones.ar/";
const fallbackAuctions = loadData("auctions-fallback.json");

function unescapeNextPayload(html) {
  return html
    .replace(/\\"/g, "\"")
    .replace(/\\n/g, "\n")
    .replace(/\\u003c/g, "<")
    .replace(/\\u003e/g, ">")
    .replace(/\\u0026/g, "&");
}

function sliceBalancedJsonArray(source, startIndex) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
    } else if (char === "[") {
      depth += 1;
    } else if (char === "]") {
      depth -= 1;
      if (depth === 0) return source.slice(startIndex, index + 1);
    }
  }

  throw new Error("No se pudo encontrar el cierre del arreglo de licitaciones");
}

export function extractAuctionsFromHtml(html) {
  const payload = unescapeNextPayload(html);
  const key = "\"licitaciones\":";
  const keyIndex = payload.indexOf(key);
  if (keyIndex === -1) throw new Error("No se encontró la lista de licitaciones");

  const arrayStart = payload.indexOf("[", keyIndex + key.length);
  if (arrayStart === -1) throw new Error("No se encontró el inicio del arreglo de licitaciones");

  const rawArray = sliceBalancedJsonArray(payload, arrayStart);
  return JSON.parse(rawArray);
}

export function getAuctionTypeTotals(auction) {
  const totals = new Map();
  for (const instrument of auction.instruments || []) {
    const label = instrument.type || "otros";
    const value = Number(instrument.effectiveValue || 0);
    totals.set(label, (totals.get(label) || 0) + value);
  }
  return [...totals.entries()].map(([type, value]) => ({ type, value })).sort((a, b) => b.value - a.value);
}

function getRolloverSeries(auctions) {
  return auctions
    .filter((item) => Number.isFinite(Number(item.rolloverPercent)))
    .slice(0, 12)
    .reverse()
    .map((item) => ({
      id: item.id,
      date: item.date,
      rolloverPercent: Number(item.rolloverPercent),
      totalAdjudicatedARS: Number(item.totalAdjudicatedARS || 0),
      maturityAmountARS: Number(item.maturityAmountARS || 0)
    }));
}

export async function getAuctionPayload() {
  try {
    const html = await fetchWithCache(auctionSourceUrl, 10 * 60 * 1000, "text");
    const auctions = extractAuctionsFromHtml(html);
    const regular = auctions.filter((item) => item?.date && Number(item.totalAdjudicatedARS || 0) > 0);
    const latest = regular[0] || fallbackAuctions[0];
    // La última licitación a veces llega sin desglose por instrumento. Para que la
    // composición y la explicación no queden vacías, usamos la más reciente que sí
    // lo tenga, manteniendo los KPIs con el dato realmente más nuevo.
    const detailed = regular.find((item) => (item.instruments || []).length > 0) || latest;

    return {
      source: "licitaciones.ar, con datos del Ministerio de Economía",
      sourceUrl: auctionSourceUrl,
      fetchedAt: new Date().toISOString(),
      latest,
      detailed,
      detailedIsLatest: detailed === latest,
      typeTotals: getAuctionTypeTotals(detailed),
      rolloverSeries: getRolloverSeries(regular),
      items: regular.slice(0, 24)
    };
  } catch (error) {
    const latest = fallbackAuctions[0];
    return {
      source: "datos de respaldo incluidos en la app",
      sourceUrl: auctionSourceUrl,
      fetchedAt: new Date().toISOString(),
      warning: error.message,
      isFallback: true,
      latest,
      detailed: latest,
      detailedIsLatest: true,
      typeTotals: getAuctionTypeTotals(latest),
      rolloverSeries: getRolloverSeries(fallbackAuctions),
      items: fallbackAuctions
    };
  }
}
