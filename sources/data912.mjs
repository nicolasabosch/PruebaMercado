import { fetchWithCache } from "../lib/http.mjs";

const data912BaseUrl = "https://data912.com";
const TTL_MS = 30 * 1000;

export function isAllowedData912Path(pathname) {
  const cleaned = pathname.replace(/^\/+/, "");
  return /^(live\/(mep|ccl|arg_stocks|arg_options|arg_cedears|arg_notes|arg_corp|arg_bonds|usa_adrs|usa_stocks)|historical\/(stocks|cedears|bonds)\/[A-Z0-9.]+|eod\/(volatilities|option_chain)\/[A-Z0-9.]+)$/i.test(cleaned);
}

export async function getData912(dataPath, search = "") {
  const targetUrl = `${data912BaseUrl}/${dataPath}${search}`;
  const data = await fetchWithCache(targetUrl, TTL_MS, "json");
  return { source: "Data912", sourceUrl: targetUrl, fetchedAt: new Date().toISOString(), data };
}

// Resuelve varios mercados en una sola request del navegador. Cada clave falla
// por separado: devuelve { data: { clave: filas }, errors: { clave: mensaje } }.
export async function getLivePayload(keys) {
  const valid = [...new Set(keys)].filter((key) => isAllowedData912Path(`live/${key}`));
  const results = await Promise.allSettled(valid.map((key) => getData912(`live/${key}`)));
  const data = {};
  const errors = {};
  results.forEach((result, index) => {
    if (result.status === "fulfilled") data[valid[index]] = result.value.data;
    else errors[valid[index]] = result.reason?.message || "Error al consultar Data912";
  });
  return { source: "Data912", fetchedAt: new Date().toISOString(), data, errors };
}
