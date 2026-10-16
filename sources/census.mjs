import { fetchWithCache, fetchWithTimeout } from "../lib/http.mjs";
import { withCache } from "../lib/cache.mjs";
import { decodeHtmlEntities, parseWholeNumber } from "../lib/html.mjs";
import { loadData } from "../lib/data.mjs";

const indecCensus2022Url = "https://redatam.indec.gob.ar/binarg/RpWebStats.exe/CrossTab?BASE=CPV2022&ITEM=EDADQUIN&lang=ESP";
const indecCensus2010Url = "https://biblioteca.indec.gob.ar/bases/minde/1c2010b2t2.pdf";
const census2010Rows = loadData("census-2010.json");
const census2022FallbackRows = loadData("census-2022-fallback.json");

export function normalizeCensusAgeGroup(label) {
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

function ageGroupStart(ageGroup) {
  if (String(ageGroup).endsWith("+")) return Number(ageGroup.replace("+", ""));
  return Number(String(ageGroup).split("-")[0]);
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

export function buildCensusSummary(currentRows, previousRows) {
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

export function extractCensusRowsFromHtml(html) {
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
  // El POST a Redatam tarda ~10 s. El resultado vive 12 h en caché (con
  // stale-while-revalidate) y se persiste en disco: ni siquiera un reinicio del
  // servidor vuelve a pagar ese costo.
  return withCache("census:2022-rows", 12 * 60 * 60 * 1000, fetchCensus2022Rows, { persist: true });
}

export async function getCensusPayload() {
  let currentRows = census2022FallbackRows;
  let warning = null;

  try {
    currentRows = await getCensus2022Rows();
  } catch (error) {
    warning = error.message;
  }

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
      previous: { year: "2010", rows: census2010Rows }
    },
    summary: buildCensusSummary(currentRows, census2010Rows)
  };
}
