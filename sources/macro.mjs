import { fetchWithCache } from "../lib/http.mjs";
import { loadData } from "../lib/data.mjs";

const datosSeriesApiUrl = "https://apis.datos.gob.ar/series/api/series/";
const datosSearchApiUrl = "https://apis.datos.gob.ar/series/api/search/";
const utdtIccUrl = "https://www.utdt.edu/nota_prensa.php?id_item_menu=20475&id_nota_prensa=23325";
const manualData = loadData("manual.json");

// La API de series responde vacío de forma errática para ciertas combinaciones
// exactas de parámetros (la misma URL siempre falla, pero con otro `limit` anda).
// start_date se fija al día 1 para que la URL, y por lo tanto la caché, sea la misma
// durante todo el mes; `extraLimit` varía la URL para reintentar.
export function seriesUrl(id, months, now = new Date(), extraLimit = 0) {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 1));
  const url = new URL(datosSeriesApiUrl);
  url.searchParams.set("ids", id);
  url.searchParams.set("limit", String(months + 2 + extraLimit));
  url.searchParams.set("sort", "desc");
  url.searchParams.set("start_date", from.toISOString().slice(0, 10));
  return url.toString();
}

const SERIES_ATTEMPTS = 8;

async function fetchSeriesPayload(id, months) {
  for (let attempt = 0; attempt < SERIES_ATTEMPTS; attempt += 1) {
    const payload = await fetchWithCache(seriesUrl(id, months, new Date(), attempt), 6 * 60 * 60 * 1000, "json");
    if (payload.data?.some(([, value]) => value !== null)) return payload;
  }
  throw new Error(`Datos Argentina devolvió la serie ${id} vacía tras ${SERIES_ATTEMPTS} intentos`);
}

async function getSeries({ id, months, multiplier = 1, label, sourceUrl }) {
  const payload = await fetchSeriesPayload(id, months);
  const rows = payload.data
    .map(([date, value]) => ({ date, value: value === null ? NaN : Number(value) * multiplier }))
    .filter((row) => row.date && Number.isFinite(row.value))
    .reverse();

  return {
    id,
    label,
    sourceUrl: sourceUrl || seriesUrl(id, months),
    units: payload.meta?.[1]?.field?.units || "",
    source: payload.meta?.[1]?.dataset?.source || "Datos Argentina",
    latest: rows.at(-1) || null,
    rows
  };
}

const seriesLink = (id) => `https://datos.gob.ar/series/api/series/?ids=${id}`;

const seriesConfig = {
  inflation: { id: "145.3_INGNACUAL_DICI_M_38", months: 40, multiplier: 100, label: "Inflación mensual INDEC" },
  tradeBalance: { id: "74.3_ISC_0_M_19", months: 26, label: "Balanza comercial" },
  poverty: { id: "64.2_POBLACION_NUA_0_0_34_74", months: 48, multiplier: 100, label: "Pobreza, personas" },
  primaryResult: { id: "452.3_RESULTADO_RIO_0_M_18_54", months: 20, label: "Resultado primario" },
  financialResult: { id: "452.3_RESULTADO_ERO_0_M_20_25", months: 20, label: "Resultado financiero" },
  confidence: { id: "380.3_ICC_NACIONNAL_0_T_12", months: 16, label: "ICC Di Tella", sourceUrl: utdtIccUrl }
};

// Antigüedad de un dato cargado a mano: si supera maxAgeDays se marca `stale`
// para que la interfaz avise que puede estar desactualizado.
export function withAge(item, now = new Date()) {
  const ageDays = Math.floor((now - new Date(`${item.date}T00:00:00Z`)) / 86400000);
  return { ...item, ageDays, stale: ageDays > item.maxAgeDays };
}

export function buildConfidenceSnapshot(series) {
  const rows = series?.rows || [];
  const latest = rows.at(-1);
  if (!latest) return null;
  const pctChange = (from) => (from ? ((latest.value / from.value) - 1) * 100 : null);
  const yearAgo = new Date(`${latest.date}T00:00:00Z`);
  yearAgo.setUTCFullYear(yearAgo.getUTCFullYear() - 1);

  return {
    label: "ICC Di Tella",
    value: latest.value,
    date: latest.date,
    change: pctChange(rows.at(-2)),
    yearChange: pctChange(rows.find((row) => row.date === yearAgo.toISOString().slice(0, 10))),
    source: "Universidad Torcuato Di Tella",
    sourceUrl: utdtIccUrl,
    note: "Índice de Confianza del Consumidor, serie mensual publicada en Datos Argentina."
  };
}

export async function getMacroPayload() {
  const entries = await Promise.all(
    Object.entries(seriesConfig).map(async ([key, config]) => {
      try {
        return [key, await getSeries({ sourceUrl: seriesLink(config.id), ...config })];
      } catch (error) {
        return [key, { ...config, sourceUrl: config.sourceUrl || seriesLink(config.id), latest: null, rows: [], warning: error.message }];
      }
    })
  );

  const series = Object.fromEntries(entries);
  const confidence = buildConfidenceSnapshot(series.confidence);
  delete series.confidence;

  return {
    source: "Datos Argentina, INDEC, Ministerio de Economía, ACARA y UTDT",
    sourceUrl: datosSearchApiUrl,
    fetchedAt: new Date().toISOString(),
    series,
    snapshots: {
      indigence: withAge(manualData.indigence),
      cars: withAge(manualData.cars),
      ...(confidence ? { confidence } : {})
    }
  };
}
