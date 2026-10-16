import { loadData } from "../lib/data.mjs";

const indecCensus2022Url = "https://redatam.indec.gob.ar/binarg/RpWebStats.exe/CrossTab?BASE=CPV2022&ITEM=EDADQUIN&lang=ESP";
const indecCensus2010Url = "https://biblioteca.indec.gob.ar/bases/minde/1c2010b2t2.pdf";
const census2010Rows = loadData("census-2010.json");
const census2022Rows = loadData("census-2022.json");

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

// Los dos censos son datos cerrados: se leen de data/*.json en lugar de consultar
// Redatam (~10 s por request, que en Vercel supera el límite de la función).
export async function getCensusPayload() {
  return {
    source: "INDEC Censo 2022 y Censo 2010",
    fetchedAt: new Date().toISOString(),
    warning: null,
    sources: {
      current: indecCensus2022Url,
      previous: indecCensus2010Url
    },
    censuses: {
      current: { year: "2022", rows: census2022Rows },
      previous: { year: "2010", rows: census2010Rows }
    },
    summary: buildCensusSummary(census2022Rows, census2010Rows)
  };
}
