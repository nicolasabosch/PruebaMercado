export const numberFormat = new Intl.NumberFormat("es-AR");

export const compactFormat = new Intl.NumberFormat("es-AR", { notation: "compact", maximumFractionDigits: 1 });

export const dateFormat = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

export const timeFormat = new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit" });

export function signedPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return `<span class="neutral">--</span>`;
  const css = numeric > 0 ? "positive" : numeric < 0 ? "negative" : "neutral";
  const sign = numeric > 0 ? "+" : "";
  return `<span class="${css}">${sign}${round(numeric, 2)}%</span>`;
}

export function formatPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "--";
  return `${round(numeric, Math.abs(numeric) >= 10 ? 1 : 2)}%`;
}

export function formatPrice(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "--";
  return `$${numberFormat.format(Math.round(numeric))}`;
}

export function formatSignedPrice(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "--";
  const sign = numeric > 0 ? "+" : "";
  return `${sign}$${numberFormat.format(Math.round(numeric))}`;
}

export function formatSignedPercentText(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "--";
  const sign = numeric > 0 ? "+" : "";
  return `${sign}${formatPercent(numeric)}`;
}

export function formatMarketPrice(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "--";
  if (Math.abs(numeric) < 10) return numeric.toLocaleString("es-AR", { maximumFractionDigits: 4 });
  if (Math.abs(numeric) < 1000) return numeric.toLocaleString("es-AR", { maximumFractionDigits: 2 });
  return numberFormat.format(Math.round(numeric));
}

export function formatAuctionMoney(valueInMillions) {
  const numeric = Number(valueInMillions);
  if (!Number.isFinite(numeric)) return "--";
  if (numeric >= 1000000) return `$${round(numeric / 1000000, 2)} billones`;
  if (numeric >= 1000) return `$${round(numeric / 1000, 1)} mil millones`;
  return `$${numberFormat.format(Math.round(numeric))} millones`;
}

export function formatUsdMillions(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "--";
  const sign = numeric < 0 ? "-" : "";
  return `${sign}US$${numberFormat.format(Math.abs(Math.round(numeric)))} M`;
}

export function formatArsMillions(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "--";
  const sign = numeric < 0 ? "-" : "";
  const abs = Math.abs(numeric);
  if (abs >= 1000000) return `${sign}$${round(abs / 1000000, 2)} B`;
  return `${sign}$${numberFormat.format(Math.round(abs))} M`;
}

export function formatCompactNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "--";
  return compactFormat.format(numeric);
}

export function formatPopulation(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "--";
  if (numeric >= 1000000) return `${round(numeric / 1000000, 1)} M`;
  return numberFormat.format(Math.round(numeric));
}

export function formatSignedCompactPopulation(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "--";
  const sign = numeric > 0 ? "+" : numeric < 0 ? "-" : "";
  const abs = Math.abs(numeric);
  if (abs >= 1000000) return `${sign}${round(abs / 1000000, 1)} M`;
  return `${sign}${numberFormat.format(Math.round(abs))}`;
}

export function formatSignedPoints(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "--";
  const sign = numeric > 0 ? "+" : "";
  return `${sign}${round(numeric, 1)} p.p.`;
}

export function formatPopulationTick(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "--";
  return numeric >= 1000000 ? `${round(numeric / 1000000, 1)} M` : `${round(numeric / 1000, 0)} k`;
}

export function formatDate(value) {
  if (!value) return "--";
  return dateFormat.format(new Date(`${value}T00:00:00Z`)).replace(".", "");
}

export function shortDate(value) {
  if (!value) return "";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short", timeZone: "UTC" }).format(date).replace(".", "");
}

export function formatMonth(value) {
  if (!value) return "--";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

export function formatSemester(value) {
  if (!value) return "--";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return String(value);
  const month = date.getUTCMonth() + 1;
  const semester = month <= 6 ? "1er semestre" : "2do semestre";
  return `${semester} ${date.getUTCFullYear()}`;
}

export function shortText(value, length) {
  const text = String(value || "");
  return text.length > length ? `${text.slice(0, Math.max(1, length - 1))}…` : text;
}

export function ageGroupStart(ageGroup) {
  const text = String(ageGroup || "");
  if (text.endsWith("+")) return Number(text.replace("+", ""));
  return Number(text.split("-")[0]);
}

export function round(value, digits = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "--";
  return numeric.toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits
  });
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

export function escapeSvg(value) {
  return escapeHtml(value);
}

export function tooltipAttribute(html) {
  return `data-tooltip="${escapeHtml(html)}"`;
}
