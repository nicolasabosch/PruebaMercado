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

const memoryCache = new Map();

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

function getCached(key) {
  const cached = memoryCache.get(key);
  if (!cached || cached.expiresAt < Date.now()) return null;
  return cached.value;
}

function setCached(key, value, ttlMs) {
  memoryCache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

async function fetchWithCache(url, ttlMs, responseType = "json") {
  const cached = getCached(url);
  if (cached) return cached;

  const response = await fetch(url, {
    headers: {
      accept: responseType === "json" ? "application/json" : "text/html, text/plain;q=0.9, */*;q=0.8",
      "user-agent": "PruebaMercado local dashboard"
    }
  });

  if (!response.ok) {
    throw new Error(`Error ${response.status} al consultar ${url}`);
  }

  const value = responseType === "json" ? await response.json() : await response.text();
  setCached(url, value, ttlMs);
  return value;
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

    return {
      source: "licitaciones.ar, con datos del Ministerio de Economía",
      sourceUrl: auctionSourceUrl,
      fetchedAt: new Date().toISOString(),
      latest,
      typeTotals: getAuctionTypeTotals(latest),
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
  const [blue, bancoNacion] = await Promise.all([
    fetchDolarHoyQuote(dolarHoyBlueUrl, ["Dólar Libre", "Dólar Blue", "Dolar Blue", "Blue"], "Dólar blue")
      .catch(() => fetchDolarApiQuote("blue", "Dólar blue", dolarHoyBlueUrl)),
    fetchDolarHoyQuote(dolarHoyBnaUrl, ["Banco Nación", "Dólar Banco Nación", "Dolar Banco Nacion"], "Dólar Banco Nación")
      .catch(() => fetchDolarApiQuote("oficial", "Dólar Banco Nación", "https://www.bna.com.ar/Personas"))
  ]);

  return {
    source: "DolarHoy y Banco Nación con respaldo DolarAPI",
    fetchedAt: new Date().toISOString(),
    quotes: { blue, bancoNacion }
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
        change: 1.2,
        source: "ACARA",
        sourceUrl: acaraReportUrl,
        note: "Unidades informadas para marzo de 2026; suba interanual de 1,2%."
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

server.listen(port, () => {
  console.log(`Prueba Mercado listo en http://localhost:${port}`);
});
