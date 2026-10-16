import { fetchWithCache } from "../lib/http.mjs";
import { parseSpanishMoney, textFromHtml } from "../lib/html.mjs";

const dolarHoyBlueUrl = "https://dolarhoy.com/cotizacion-dolar-blue";
const dolarHoyBnaUrl = "https://dolarhoy.com/cotizacion-dolar-banco-nacion";
const dolarApiBaseUrl = "https://dolarapi.com/v1/dolares";

export function findAmountsNear(text, markers) {
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

export async function getDollarQuotesPayload() {
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
