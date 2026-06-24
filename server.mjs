import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = resolve(fileURLToPath(new URL(".", import.meta.url)));
const publicDir = join(__dirname, "public");
const port = Number(process.env.PORT || 4173);
const data912BaseUrl = "https://data912.com";
const auctionSourceUrl = "https://licitaciones.ar/";
const dolarHoyBlueUrl = "https://dolarhoy.com/cotizacion-dolar-blue";
const dolarHoyBnaUrl = "https://dolarhoy.com/cotizacion-dolar-banco-nacion";
const dolarApiBaseUrl = "https://dolarapi.com/v1/dolares";
const datosSeriesApiUrl = "https://apis.datos.gob.ar/series/api/series/";
const datosSearchApiUrl = "https://apis.datos.gob.ar/series/api/search/";
const indecPovertyReportUrl = "https://www.indec.gob.ar/uploads/informesdeprensa/eph_pobreza_03_269225CA3217.pdf";
const acaraReportUrl = "https://api.acara.org.ar/storage/documents/7e24295a-d5bd-406e-bdda-e764d1cb4351.pdf";
const utdtIccUrl = "https://www.utdt.edu/nota_prensa.php?id_item_menu=20475&id_nota_prensa=23325";
const meconFiscalMarch2026Url = "https://www.argentina.gob.ar/noticias/en-marzo-el-sector-publico-nacional-registro-superavit-financiero-por-484789-millones-luego";
const indecCensus2022Url = "https://redatam.indec.gob.ar/binarg/RpWebStats.exe/CrossTab?BASE=CPV2022&ITEM=EDADQUIN&lang=ESP";
const indecCensus2010Url = "https://biblioteca.indec.gob.ar/bases/minde/1c2010b2t2.pdf";

const memoryCache = new Map();
const inFlight = new Map();
const DEFAULT_TIMEOUT_MS = 8000;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

const fallbackAuctions = [
  {
    id: "2026-04-28",
    date: "2026-04-28",
    totalOffers: 3735,
    totalOfferedARS: 9188472,
    totalAdjudicatedARS: 8109066,
    maturityAmountARS: 7938587,
    rolloverPercent: 102.15,
    instruments: [
      { ticker: "S12J6", type: "lecap", currency: "ARS", maturityDate: "2026-06-12", effectiveValue: 4937002, tirea: 28.32 },
      { ticker: "TZXS8", type: "cer", currency: "ARS", maturityDate: "2028-09-29", effectiveValue: 1036517, tirea: 8.41 },
      { ticker: "TMG28", type: "tamar", currency: "ARS", maturityDate: "2028-08-31", effectiveValue: 1026517, tirea: 33.61 },
      { ticker: "TXMJ9", type: "dual", currency: "ARS", maturityDate: "2029-06-29", effectiveValue: 949186, tirea: 7.31 },
      { ticker: "D30S6", type: "dolar_linked", currency: "ARS", maturityDate: "2026-09-30", effectiveValue: 159843, tirea: 2.52 },
      { ticker: "AO27", type: "hard_dollar", currency: "USD", maturityDate: "2027-10-29", effectiveValue: 355, tirea: 5.16 },
      { ticker: "AO28", type: "hard_dollar", currency: "USD", maturityDate: "2028-10-31", effectiveValue: 331, tirea: 8.77 }
    ],
    conversions: []
  }
];

const census2010Rows = [
  { ageGroup: "0-4", female: 1639680, male: 1697972, total: 3337652 },
  { ageGroup: "5-9", female: 1663467, male: 1717752, total: 3381219 },
  { ageGroup: "10-14", female: 1724074, male: 1779372, total: 3503446 },
  { ageGroup: "15-19", female: 1757006, male: 1785061, total: 3542067 },
  { ageGroup: "20-24", female: 1651693, male: 1648456, total: 3300149 },
  { ageGroup: "25-29", female: 1578403, male: 1552106, total: 3130509 },
  { ageGroup: "30-34", female: 1575371, male: 1523342, total: 3098713 },
  { ageGroup: "35-39", female: 1366907, male: 1311528, total: 2678435 },
  { ageGroup: "40-44", female: 1184888, male: 1125887, total: 2310775 },
  { ageGroup: "45-49", female: 1128882, male: 1067468, total: 2196350 },
  { ageGroup: "50-54", female: 1056797, male: 986196, total: 2042993 },
  { ageGroup: "55-59", female: 975380, male: 893570, total: 1868950 },
  { ageGroup: "60-64", female: 860276, male: 760914, total: 1621190 },
  { ageGroup: "65-69", female: 704492, male: 588569, total: 1293061 },
  { ageGroup: "70-74", female: 577459, male: 438438, total: 1015897 },
  { ageGroup: "75-79", female: 480178, male: 321481, total: 801659 },
  { ageGroup: "80-84", female: 365172, male: 200744, total: 565916 },
  { ageGroup: "85-89", female: 205489, male: 92848, total: 298337 },
  { ageGroup: "90-94", female: 76234, male: 26574, total: 102808 },
  { ageGroup: "95-99", female: 18779, male: 4704, total: 23483 },
  { ageGroup: "100+", female: 2703, male: 784, total: 3487 }
];

const census2022FallbackRows = [
  { ageGroup: "0-4", female: 1402857, male: 1440893, total: 2843750 },
  { ageGroup: "5-9", female: 1772183, male: 1824234, total: 3596417 },
  { ageGroup: "10-14", female: 1786201, male: 1842705, total: 3628906 },
  { ageGroup: "15-19", female: 1764602, male: 1794417, total: 3559019 },
  { ageGroup: "20-24", female: 1775436, male: 1735025, total: 3510461 },
  { ageGroup: "25-29", female: 1820852, male: 1729539, total: 3550391 },
  { ageGroup: "30-34", female: 1784888, male: 1684646, total: 3469534 },
  { ageGroup: "35-39", female: 1689906, male: 1598863, total: 3288769 },
  { ageGroup: "40-44", female: 1711533, male: 1603622, total: 3315155 },
  { ageGroup: "45-49", female: 1486233, male: 1376718, total: 2862951 },
  { ageGroup: "50-54", female: 1278561, male: 1169613, total: 2448174 },
  { ageGroup: "55-59", female: 1155449, male: 1038682, total: 2194131 },
  { ageGroup: "60-64", female: 1054462, male: 923244, total: 1977706 },
  { ageGroup: "65-69", female: 941658, male: 790896, total: 1732554 },
  { ageGroup: "70-74", female: 793035, male: 622529, total: 1415564 },
  { ageGroup: "75-79", female: 602502, male: 419408, total: 1021910 },
  { ageGroup: "80-84", female: 404175, male: 241330, total: 645505 },
  { ageGroup: "85-89", female: 237241, male: 116378, total: 353619 },
  { ageGroup: "90-94", female: 111080, male: 45076, total: 156156 },
  { ageGroup: "95-99", female: 30852, male: 11729, total: 42581 },
  { ageGroup: "100+", female: 4200, male: 1334, total: 5534 }
];

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(body));
}

function sendText(response, statusCode, text) {
  response.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(text);
}

function setCacheEntry(key, value, ttlMs, staleMs) {
  const now = Date.now();
  memoryCache.set(key, {
    value,
    freshUntil: now + ttlMs,
    staleUntil: now + ttlMs + staleMs
  });
}

// Caché genérica con dos mejoras clave de rendimiento:
//  - de-duplicación: varias requests al mismo recurso comparten un solo fetch.
//  - stale-while-revalidate: una vez vencido el TTL se devuelve el valor cacheado
//    al instante y se dispara UNA actualización en segundo plano. Así el tablero
//    nunca vuelve a quedar bloqueado esperando a una fuente lenta tras la primera
//    carga exitosa.
async function withCache(key, ttlMs, producer, { staleMs = ttlMs * 8 } = {}) {
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

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`Tiempo de espera agotado (${timeoutMs} ms) al consultar ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchRemote(url, responseType, timeoutMs) {
  const response = await fetchWithTimeout(url, {
    headers: {
      accept: responseType === "json" ? "application/json" : "text/html, text/plain;q=0.9, */*;q=0.8",
      "user-agent": "PruebaMercado local dashboard"
    }
  }, timeoutMs);

  if (!response.ok) {
    throw new Error(`Error ${response.status} al consultar ${url}`);
  }

  return responseType === "json" ? await response.json() : await response.text();
}

function fetchWithCache(url, ttlMs, responseType = "json", timeoutMs = DEFAULT_TIMEOUT_MS) {
  return withCache(url, ttlMs, () => fetchRemote(url, responseType, timeoutMs));
}

function isAllowedData912Path(pathname) {
  const cleaned = pathname.replace(/^\/+/, "");
  return /^(live\/(mep|ccl|arg_stocks|arg_options|arg_cedears|arg_notes|arg_corp|arg_bonds|usa_adrs|usa_stocks)|historical\/(stocks|cedears|bonds)\/[A-Z0-9.]+|eod\/(volatilities|option_chain)\/[A-Z0-9.]+)$/i.test(cleaned);
}

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

function extractAuctionsFromHtml(html) {
  const payload = unescapeNextPayload(html);
  const key = "\"licitaciones\":";
  const keyIndex = payload.indexOf(key);
  if (keyIndex === -1) throw new Error("No se encontró la lista de licitaciones");

  const arrayStart = payload.indexOf("[", keyIndex + key.length);
  if (arrayStart === -1) throw new Error("No se encontró el inicio del arreglo de licitaciones");

  const rawArray = sliceBalancedJsonArray(payload, arrayStart);
  return JSON.parse(rawArray);
}

function getAuctionTypeTotals(auction) {
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

async function getAuctionPayload() {
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
      latest,
      detailed: latest,
      detailedIsLatest: true,
      typeTotals: getAuctionTypeTotals(latest),
      rolloverSeries: getRolloverSeries(fallbackAuctions),
      items: fallbackAuctions
    };
  }
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, code) => String.fromCharCode(Number.parseInt(code, 10)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function textFromHtml(html) {
  return decodeHtmlEntities(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSpanishMoney(value) {
  const cleaned = String(value || "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseWholeNumber(value) {
  const numeric = Number(String(value || "").replace(/[^\d-]/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeCensusAgeGroup(label) {
  const clean = decodeHtmlEntities(String(label || ""))
    .replace(/\?/g, "a")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  if (/^\d+\s+y\s+m/.test(clean)) return "100+";

  const range = clean.match(/^(\d+)\s+a\s+(\d+)$/);
  if (!range) return null;

  const start = Number(range[1]);
  const end = Number(range[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start >= 100) return "100+";
  return `${start}-${end}`;
}

function aggregateCensusRows(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const ageGroup = normalizeCensusAgeGroup(row.ageGroup || row.age);
    if (!ageGroup) continue;
    const female = Number(row.female || 0);
    const male = Number(row.male || 0);
    const total = Number(row.total || female + male);
    const current = grouped.get(ageGroup) || { ageGroup, female: 0, male: 0, total: 0 };
    current.female += female;
    current.male += male;
    current.total += total;
    grouped.set(ageGroup, current);
  }

  return [...grouped.values()].sort((a, b) => ageGroupStart(a.ageGroup) - ageGroupStart(b.ageGroup));
}

function ageGroupStart(ageGroup) {
  if (String(ageGroup).endsWith("+")) return Number(ageGroup.replace("+", ""));
  return Number(String(ageGroup).split("-")[0]);
}

function summarizeCensusRows(rows) {
  const total = rows.reduce((sum, row) => sum + Number(row.total || 0), 0);
  const sumWhere = (predicate) => rows.reduce((sum, row) => (predicate(row) ? sum + Number(row.total || 0) : sum), 0);
  const olderFemale = rows.reduce((sum, row) => (ageGroupStart(row.ageGroup) >= 65 ? sum + Number(row.female || 0) : sum), 0);
  const olderMale = rows.reduce((sum, row) => (ageGroupStart(row.ageGroup) >= 65 ? sum + Number(row.male || 0) : sum), 0);
  const olderTotal = olderFemale + olderMale;

  return {
    total,
    childrenShare: total ? (sumWhere((row) => ageGroupStart(row.ageGroup) <= 10) / total) * 100 : 0,
    workingAgeShare: total ? (sumWhere((row) => {
      const start = ageGroupStart(row.ageGroup);
      return start >= 15 && start < 65;
    }) / total) * 100 : 0,
    olderShare: total ? (sumWhere((row) => ageGroupStart(row.ageGroup) >= 65) / total) * 100 : 0,
    olderFemaleShare: olderTotal ? (olderFemale / olderTotal) * 100 : 0
  };
}

function buildCensusSummary(currentRows, previousRows) {
  const current = summarizeCensusRows(currentRows);
  const previous = summarizeCensusRows(previousRows);
  return {
    totals: {
      current: current.total,
      previous: previous.total,
      delta: current.total - previous.total
    },
    shares: {
      children: { current: current.childrenShare, previous: previous.childrenShare, delta: current.childrenShare - previous.childrenShare },
      workingAge: { current: current.workingAgeShare, previous: previous.workingAgeShare, delta: current.workingAgeShare - previous.workingAgeShare },
      older: { current: current.olderShare, previous: previous.olderShare, delta: current.olderShare - previous.olderShare },
      olderFemale: { current: current.olderFemaleShare, previous: previous.olderFemaleShare, delta: current.olderFemaleShare - previous.olderFemaleShare }
    }
  };
}

function extractCensusRowsFromHtml(html) {
  const rows = [];
  for (const match of html.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
      .map((cell) => decodeHtmlEntities(cell[1]).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());

    if (cells.length < 5) continue;
    const age = cells[1];
    if (!/(\d+\s+a\s+\d+|\d+\s+y\s+m)/i.test(age)) continue;

    const female = parseWholeNumber(cells[2]);
    const male = parseWholeNumber(cells[3]);
    const total = parseWholeNumber(cells[4]);
    if (!Number.isFinite(female) || !Number.isFinite(male) || !Number.isFinite(total)) continue;

    rows.push({ ageGroup: age, female, male, total });
  }
  return aggregateCensusRows(rows);
}

async function fetchCensus2022Rows() {
  const form = new URLSearchParams({
    MAIN: "WebServerMain.inl",
    BASE: "CPV2022",
    LANG: "ESP",
    CODIGO: "XXUSUARIOXX",
    ITEM: "EDADQUIN",
    MODE: "RUN",
    ROW: "PERSONA.EDADQUI",
    COLUMN: "PERSONA.P02",
    AREABREAK: "",
    SELECTION: "ALL",
    FILTER: "",
    TEXT_FILTER: "",
    FORMAT: "HTML",
    Submit: "Ejecutar"
  });

  const response = await fetchWithTimeout(indecCensus2022Url, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": "PruebaMercado local dashboard"
    },
    body: form
  }, 14000);

  if (!response.ok) {
    throw new Error(`Error ${response.status} al consultar Censo 2022`);
  }

  const html = await response.text();
  const iframeMatch = html.match(/<iframe[^>]+src="([^"]+)"/i);
  if (!iframeMatch) throw new Error("No se encontro la tabla del Censo 2022");

  const iframeUrl = new URL(iframeMatch[1], "https://redatam.indec.gob.ar").toString();
  const tableHtml = await fetchWithCache(iframeUrl, 12 * 60 * 60 * 1000, "text");
  const rows = extractCensusRowsFromHtml(tableHtml);
  if (!rows.length) throw new Error("No se pudieron extraer filas del Censo 2022");
  return rows;
}

function getCensus2022Rows() {
  // El POST a Redatam tarda ~10 s y antes se repetía en cada request. Ahora el
  // resultado vive en caché 12 h (con stale-while-revalidate), así que solo la
  // primera carga paga ese costo y el resto responde al instante.
  return withCache("census:2022-rows", 12 * 60 * 60 * 1000, fetchCensus2022Rows);
}

async function getCensusPayload() {
  let currentRows = census2022FallbackRows;
  let warning = null;

  try {
    currentRows = await getCensus2022Rows();
  } catch (error) {
    warning = error.message;
  }

  const previousRows = census2010Rows;
  return {
    source: "INDEC Censo 2022 y Censo 2010",
    fetchedAt: new Date().toISOString(),
    warning,
    sources: {
      current: indecCensus2022Url,
      previous: indecCensus2010Url
    },
    censuses: {
      current: { year: "2022", rows: currentRows },
      previous: { year: "2010", rows: previousRows }
    },
    summary: buildCensusSummary(currentRows, previousRows)
  };
}

function findAmountsNear(text, markers) {
  const lower = text.toLowerCase();
  for (const marker of markers) {
    const normalizedMarker = marker.toLowerCase();
    let index = lower.indexOf(normalizedMarker);
    while (index !== -1) {
      const slice = text.slice(Math.max(0, index - 260), index + 1200);
      const matches = [...slice.matchAll(/\$\s*([0-9]+(?:\.[0-9]{3})*(?:,[0-9]+)?)/g)]
        .map((match) => parseSpanishMoney(match[1]))
        .filter((value) => Number.isFinite(value) && value > 100);

      if (matches.length >= 2) return { buy: matches[0], sell: matches[1] };
      index = lower.indexOf(normalizedMarker, index + normalizedMarker.length);
    }
  }
  return null;
}

async function fetchDolarHoyQuote(url, markers, name) {
  const html = await fetchWithCache(url, 4 * 60 * 1000, "text");
  const amounts = findAmountsNear(textFromHtml(html), markers);
  if (!amounts) throw new Error(`No se pudo leer ${name} desde DolarHoy`);
  return {
    name,
    buy: amounts.buy,
    sell: amounts.sell,
    source: "DolarHoy",
    sourceUrl: url,
    fetchedAt: new Date().toISOString()
  };
}

async function fetchDolarApiQuote(kind, name, sourceUrl) {
  const payload = await fetchWithCache(`${dolarApiBaseUrl}/${kind}`, 2 * 60 * 1000, "json");
  return {
    name,
    buy: Number(payload.compra),
    sell: Number(payload.venta),
    source: sourceUrl === dolarHoyBlueUrl ? "DolarAPI, respaldo para DolarHoy" : "DolarAPI",
    sourceUrl,
    fetchedAt: payload.fechaActualizacion || new Date().toISOString()
  };
}

async function getDollarQuotesPayload() {
  const [blue, bancoNacion, mep, ccl, tarjeta] = await Promise.all([
    fetchDolarHoyQuote(dolarHoyBlueUrl, ["Dólar Libre", "Dólar Blue", "Dolar Blue", "Blue"], "Dólar blue")
      .catch(() => fetchDolarApiQuote("blue", "Dólar blue", dolarHoyBlueUrl)),
    fetchDolarHoyQuote(dolarHoyBnaUrl, ["Banco Nación", "Dólar Banco Nación", "Dolar Banco Nacion"], "Dólar Banco Nación")
      .catch(() => fetchDolarApiQuote("oficial", "Dólar Banco Nación", "https://www.bna.com.ar/Personas")),
    fetchDolarApiQuote("bolsa", "Dólar MEP", "https://dolarapi.com/docs/argentina/operations/get-dolar-bolsa.html"),
    fetchDolarApiQuote("contadoconliqui", "Dólar CCL", "https://dolarapi.com/docs/argentina/operations/get-dolar-contadoconliqui.html"),
    fetchDolarApiQuote("tarjeta", "Dólar tarjeta", "https://dolarapi.com/docs/argentina/operations/get-dolar-tarjeta.html")
  ]);

  return {
    source: "DolarHoy, Banco Nación y DolarAPI",
    fetchedAt: new Date().toISOString(),
    quotes: { blue, bancoNacion, mep, ccl, tarjeta }
  };
}

function seriesUrl(id, limit) {
  const url = new URL(datosSeriesApiUrl);
  url.searchParams.set("ids", id);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("sort", "desc");
  return url.toString();
}

async function getSeries({ id, limit = 24, multiplier = 1, label, sourceUrl }) {
  const payload = await fetchWithCache(seriesUrl(id, limit), 6 * 60 * 60 * 1000, "json");
  const rows = (payload.data || [])
    .map(([date, value]) => ({ date, value: Number(value) * multiplier }))
    .filter((row) => row.date && Number.isFinite(row.value))
    .reverse();

  return {
    id,
    label,
    sourceUrl: sourceUrl || seriesUrl(id, limit),
    units: payload.meta?.[1]?.field?.units || "",
    source: payload.meta?.[1]?.dataset?.source || "Datos Argentina",
    latest: rows.at(-1) || null,
    rows
  };
}

function latestPeriodLabel(date) {
  if (!date) return "";
  const [year, month] = String(date).split("-");
  return month ? `${month}/${year}` : String(date);
}

async function getMacroPayload() {
  const seriesConfig = {
    inflation: {
      id: "145.3_INGNACUAL_DICI_M_38",
      limit: 36,
      multiplier: 100,
      label: "Inflación mensual INDEC",
      sourceUrl: "https://datos.gob.ar/series/api/series/?ids=145.3_INGNACUAL_DICI_M_38"
    },
    tradeBalance: {
      id: "164.3_SOTALTAL_0_0_8",
      limit: 24,
      label: "Balanza comercial",
      sourceUrl: "https://datos.gob.ar/series/api/series/?ids=164.3_SOTALTAL_0_0_8"
    },
    poverty: {
      id: "64.2_POBLACION_NUA_0_0_34_74",
      limit: 8,
      multiplier: 100,
      label: "Pobreza, personas",
      sourceUrl: "https://datos.gob.ar/series/api/series/?ids=64.2_POBLACION_NUA_0_0_34_74"
    },
    primaryResult: {
      id: "452.3_RESULTADO_RIO_0_M_18_54",
      limit: 18,
      label: "Resultado primario",
      sourceUrl: "https://datos.gob.ar/series/api/series/?ids=452.3_RESULTADO_RIO_0_M_18_54"
    },
    financialResult: {
      id: "452.3_RESULTADO_ERO_0_M_20_25",
      limit: 18,
      label: "Resultado financiero",
      sourceUrl: "https://datos.gob.ar/series/api/series/?ids=452.3_RESULTADO_ERO_0_M_20_25"
    }
  };

  const entries = await Promise.all(
    Object.entries(seriesConfig).map(async ([key, config]) => {
      try {
        return [key, await getSeries(config)];
      } catch (error) {
        return [key, { ...config, latest: null, rows: [], warning: error.message }];
      }
    })
  );

  const series = Object.fromEntries(entries);
  const fiscalMarch2026 = {
    primary: { date: "2026-03-01", value: 930284 },
    financial: { date: "2026-03-01", value: 484789 }
  };
  if (series.primaryResult && !series.primaryResult.rows.some((row) => row.date === fiscalMarch2026.primary.date)) {
    series.primaryResult.rows.push(fiscalMarch2026.primary);
    series.primaryResult.rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    series.primaryResult.latest = series.primaryResult.rows.at(-1);
    series.primaryResult.sourceUrl = meconFiscalMarch2026Url;
    series.primaryResult.note = "Marzo de 2026 se complementa con el comunicado oficial de Economía mientras la serie de Datos Argentina se actualiza.";
  }
  if (series.financialResult && !series.financialResult.rows.some((row) => row.date === fiscalMarch2026.financial.date)) {
    series.financialResult.rows.push(fiscalMarch2026.financial);
    series.financialResult.rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    series.financialResult.latest = series.financialResult.rows.at(-1);
    series.financialResult.sourceUrl = meconFiscalMarch2026Url;
    series.financialResult.note = "Marzo de 2026 se complementa con el comunicado oficial de Economía mientras la serie de Datos Argentina se actualiza.";
  }
  const povertyDate = series.poverty?.latest?.date || "2026-01-01";

  return {
    source: "Datos Argentina, INDEC, Ministerio de Economía, ACARA y UTDT",
    sourceUrl: datosSearchApiUrl,
    fetchedAt: new Date().toISOString(),
    series,
    snapshots: {
      indigence: {
        label: "Indigencia, personas",
        value: 6.3,
        date: povertyDate,
        source: "INDEC, informe pobreza e indigencia",
        sourceUrl: indecPovertyReportUrl,
        note: "La serie pública de Datos Argentina cubre pobreza continua; el último dato de indigencia se toma del informe oficial del segundo semestre de 2025."
      },
      cars: {
        label: "Patentamientos autos 0 km",
        value: 48972,
        date: "2026-03-01",
        previousValue: 42026,
        previousDate: "2026-02-01",
        monthChange: 16.53,
        change: 1.2,
        source: "ACARA",
        sourceUrl: acaraReportUrl,
        note: "Unidades informadas para marzo de 2026; comparación mensual contra febrero de 2026 y suba interanual de 1,2%."
      },
      confidence: {
        label: "ICC Di Tella",
        value: 39.64,
        date: "2026-04-01",
        change: -5.68,
        yearChange: -10.12,
        source: "Universidad Torcuato Di Tella",
        sourceUrl: utdtIccUrl,
        note: "Índice de Confianza del Consumidor de abril de 2026."
      }
    }
  };
}

async function handleApi(requestUrl, response) {
  if (requestUrl.pathname === "/api/auctions") {
    sendJson(response, 200, await getAuctionPayload());
    return true;
  }

  if (requestUrl.pathname === "/api/dollar-quotes") {
    sendJson(response, 200, await getDollarQuotesPayload());
    return true;
  }

  if (requestUrl.pathname === "/api/macro") {
    sendJson(response, 200, await getMacroPayload());
    return true;
  }

  if (requestUrl.pathname === "/api/census") {
    sendJson(response, 200, await getCensusPayload());
    return true;
  }

  if (requestUrl.pathname.startsWith("/api/data/")) {
    const dataPath = decodeURIComponent(requestUrl.pathname.replace("/api/data/", ""));
    if (!isAllowedData912Path(dataPath)) {
      sendJson(response, 400, { error: "Endpoint de Data912 no permitido" });
      return true;
    }

    const targetUrl = `${data912BaseUrl}/${dataPath}${requestUrl.search}`;
    const data = await fetchWithCache(targetUrl, 30 * 1000, "json");
    sendJson(response, 200, { source: "Data912", sourceUrl: targetUrl, fetchedAt: new Date().toISOString(), data });
    return true;
  }

  return false;
}

async function serveStatic(requestUrl, response) {
  const requestedPath = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
  const resolvedPath = resolve(publicDir, `.${decodeURIComponent(requestedPath)}`);
  const pathFromPublic = relative(publicDir, resolvedPath);

  if (pathFromPublic.startsWith("..") || resolve(pathFromPublic) === pathFromPublic) {
    sendText(response, 403, "Acceso denegado");
    return;
  }

  try {
    const data = await readFile(resolvedPath);
    const type = mimeTypes[extname(resolvedPath)] || "application/octet-stream";
    response.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
    response.end(data);
  } catch {
    sendText(response, 404, "No encontrado");
  }
}

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    const handledApi = await handleApi(requestUrl, response);
    if (!handledApi) await serveStatic(requestUrl, response);
  } catch (error) {
    sendJson(response, 500, { error: error.message || "Error interno" });
  }
});

function warmCaches() {
  // Dispara las fuentes lentas (sobre todo el censo) al arrancar para que la
  // caché ya esté caliente cuando llegue el primer visitante.
  Promise.allSettled([
    getCensusPayload(),
    getAuctionPayload(),
    getDollarQuotesPayload(),
    getMacroPayload()
  ]).catch(() => {});
}

server.listen(port, () => {
  console.log(`Prueba Mercado listo en http://localhost:${port}`);
  warmCaches();
});
