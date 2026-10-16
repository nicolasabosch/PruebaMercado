import { numberFormat, timeFormat, signedPercent, formatPercent, formatPrice, formatSignedPrice, formatSignedPercentText, formatMarketPrice, formatAuctionMoney, formatUsdMillions, formatArsMillions, formatCompactNumber, formatPopulation, formatSignedCompactPopulation, formatSignedPoints, formatDate, shortDate, shortMonth, formatMonth, formatSemester, round, escapeHtml } from "./js/format.js";
import { renderDonutChart, renderPopulationPyramidOverlay, renderSignedVerticalBarChart, renderGroupedBarChart, renderTable, renderVerticalBarChart, renderHorizontalBarChart, renderLineChart } from "./js/charts.js";
import { marketLabels, typeLabels, debtFamilyLabels, debtFamilyColors, instrumentDefinitions } from "./js/content.js";

const $ = (selector) => document.querySelector(selector);

const $$ = (selector) => [...document.querySelectorAll(selector)];

const state = {
  live: {},
  auctions: null,
  dollarQuotes: null,
  macro: null,
  census: null,
  risk: null,
  selectedMarket: "arg_stocks",
  selectedExplorer: "arg_bonds",
  errors: []
};

document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  bindEvents();
  initRoute();
  initChartTooltip();
  renderGuide();
  refreshIcons();
  loadAllData();
});

function initTheme() {
  const saved = localStorage.getItem("mercado-theme");
  const theme = saved === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = theme;
  updateThemeButton(theme);
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("mercado-theme", next);
  updateThemeButton(next);
  refreshIcons();
}

function updateThemeButton(theme) {
  const button = $("#themeToggle");
  if (!button) return;
  const isLight = theme === "light";
  button.innerHTML = `
    <i data-lucide="${isLight ? "moon" : "sun"}" aria-hidden="true"></i>
    <span>${isLight ? "Modo oscuro" : "Modo claro"}</span>
  `;
}

function bindEvents() {
  $("#themeToggle")?.addEventListener("click", toggleTheme);
  $("#refreshButton").addEventListener("click", loadAllData);
  window.addEventListener("hashchange", () => {
    applyRoute();
    track(() => loadPage(currentPage()));
  });

  $$("[data-help]").forEach((button) => {
    button.addEventListener("click", () => {
      const help = document.getElementById(button.dataset.help);
      help?.classList.toggle("visible");
    });
  });

  $$(".segment").forEach((button) => {
    button.addEventListener("click", async () => {
      $$(".segment").forEach((item) => {
        item.classList.remove("active");
        item.setAttribute("aria-selected", "false");
      });
      button.classList.add("active");
      button.setAttribute("aria-selected", "true");
      state.selectedMarket = button.dataset.market;
      await ensureMarketData(state.selectedMarket);
      renderMarketSection();
    });
  });

  $("#explorerSelect").addEventListener("change", async (event) => {
    state.selectedExplorer = event.target.value;
    await ensureMarketData(state.selectedExplorer);
    renderExplorer();
  });

  $("#explorerSearch").addEventListener("input", renderExplorer);
}

function initRoute() {
  if (!location.hash) history.replaceState(null, "", "#inicio");
  applyRoute();
}

function currentPage() {
  const validPages = new Set($$(".page-section").map((section) => section.id));
  return validPages.has(location.hash.slice(1)) ? location.hash.slice(1) : "inicio";
}

function applyRoute() {
  const page = currentPage();

  $$(".page-section").forEach((section) => {
    const isActive = section.id === page;
    section.hidden = !isActive;
    section.classList.toggle("active-page", isActive);
  });

  $$(".nav-links a, .landing-card").forEach((link) => {
    const isActive = link.getAttribute("href") === `#${page}`;
    link.classList.toggle("active", isActive);
    if (link.closest(".nav-links")) link.setAttribute("aria-current", isActive ? "page" : "false");
  });

  window.scrollTo({ top: 0, behavior: "auto" });
  refreshIcons();
}

function initChartTooltip() {
  const tooltip = $("#chartTooltip");
  if (!tooltip) return;

  document.addEventListener("pointerover", (event) => {
    const target = event.target.closest?.("[data-tooltip]");
    if (!target) return;
    tooltip.innerHTML = target.dataset.tooltip || "";
    tooltip.classList.add("visible");
    positionChartTooltip(event, tooltip);
  });

  document.addEventListener("pointermove", (event) => {
    if (!tooltip.classList.contains("visible")) return;
    positionChartTooltip(event, tooltip);
  });

  document.addEventListener("pointerout", (event) => {
    if (!event.target.closest?.("[data-tooltip]")) return;
    tooltip.classList.remove("visible");
  });
}

function positionChartTooltip(event, tooltip) {
  const margin = 14;
  const rect = tooltip.getBoundingClientRect();
  const x = Math.min(window.innerWidth - rect.width - margin, event.clientX + margin);
  const y = Math.min(window.innerHeight - rect.height - margin, event.clientY + margin);
  tooltip.style.left = `${Math.max(margin, x)}px`;
  tooltip.style.top = `${Math.max(margin, y)}px`;
}

const baseLiveKeys = ["mep", "arg_stocks", "arg_cedears", "arg_bonds"];

// Datos que sólo hacen falta al entrar a cada página. El resto (licitaciones,
// dólares y mercado en vivo) alimenta el inicio y se carga siempre.
const pageLoaders = {
  macro: () => loadSection(fetchMacro, "macro", renderMacro),
  censo: () => loadSection(fetchCensus, "census", renderCensus),
  mercado: () => loadSection(() => fetchData912("eod/volatilities/GGAL"), "risk", renderRisk)
};
const loadedPages = new Set();
let pending = 0;

async function loadAllData() {
  state.errors = [];
  state.live = {};
  loadedPages.clear();
  await Promise.allSettled([track(loadBase), track(() => loadPage(currentPage()))]);
}

async function loadBase() {
  // Cada bloque pinta su propia sección apenas llega el dato, así la página no
  // espera a la fuente más lenta.
  await Promise.allSettled([
    loadLive(baseLiveKeys).then(() => {
      renderDashboard();
      renderMarketSection();
      renderExplorer();
    }),
    loadSection(fetchAuctions, "auctions", () => {
      renderAuctions();
      renderDashboard();
    }),
    loadSection(fetchDollarQuotes, "dollarQuotes", () => {
      renderDollars();
      renderDashboard();
    })
  ]);
}

async function loadPage(page) {
  const loader = pageLoaders[page];
  if (!loader || loadedPages.has(page)) return;
  loadedPages.add(page);
  await loader();
}

async function track(task) {
  pending += 1;
  setStatus("Consultando datos...", "loading");
  setRefreshLoading(true);
  try {
    await task();
  } finally {
    pending -= 1;
    if (!pending) finishLoading();
  }
}

function finishLoading() {
  if (state.errors.length) {
    setStatus("Listo con algunas fuentes caídas", "error");
  } else {
    setStatus("Datos actualizados", "ready");
  }
  $("#lastUpdated").textContent = timeFormat.format(new Date());
  setRefreshLoading(false);
  refreshIcons();
}

// Pide varios mercados de Data912 en una sola request; los que ya están cargados no se repiten.
async function loadLive(keys) {
  const missing = keys.filter((key) => !state.live[key]?.length);
  if (!missing.length) return;
  try {
    const response = await fetch(`/api/live?keys=${missing.join(",")}`);
    if (!response.ok) throw new Error("No se pudo cargar Data912");
    const payload = await response.json();
    for (const key of missing) {
      if (payload.data[key]) state.live[key] = normalizeRows(payload.data[key]);
      else state.errors.push(payload.errors[key] || `No se pudo cargar ${key}`);
    }
  } catch (error) {
    state.errors.push(error.message);
  }
}

async function loadSection(fetcher, key, render) {
  try {
    state[key] = await fetcher();
  } catch (error) {
    state.errors.push(error.message);
  } finally {
    render();
    refreshIcons();
  }
}

function setRefreshLoading(isLoading) {
  $("#refreshButton")?.classList.toggle("is-loading", isLoading);
}

async function fetchData912(path) {
  const response = await fetch(`/api/data/${path}`);
  if (!response.ok) throw new Error(`No se pudo cargar ${path}`);
  const payload = await response.json();
  return payload.data;
}

async function fetchAuctions() {
  const response = await fetch("/api/auctions");
  if (!response.ok) throw new Error("No se pudieron cargar licitaciones");
  return response.json();
}

async function fetchDollarQuotes() {
  const response = await fetch("/api/dollar-quotes");
  if (!response.ok) throw new Error("No se pudieron cargar cotizaciones oficiales");
  return response.json();
}

async function fetchMacro() {
  const response = await fetch("/api/macro");
  if (!response.ok) throw new Error("No se pudieron cargar datos macro");
  return response.json();
}

async function fetchCensus() {
  const response = await fetch("/api/census");
  if (!response.ok) throw new Error("No se pudieron cargar datos de censo");
  return response.json();
}

async function ensureMarketData(key) {
  await loadLive([key]);
}

function normalizeRows(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.value)) return value.value;
  if (Array.isArray(value?.data)) return value.data;
  return value ? [value] : [];
}

function setStatus(text, mode) {
  $("#statusLine").textContent = text;
  const dot = $("#statusDot");
  dot.className = "status-dot";
  if (mode === "ready") dot.classList.add("ready");
  if (mode === "error") dot.classList.add("error");
}

function renderDashboard() {
  const mep = cleanDollarRows(state.live.mep, "mark", "v_ars");
  const mepAverage = weightedAverage(mep, "mark", "v_ars");
  const marketRows = [...(state.live.arg_stocks || []), ...(state.live.arg_cedears || []), ...(state.live.arg_bonds || [])];
  const volumeLeader = getTopRows(marketRows, "v", 1)[0];
  const latestAuction = state.auctions?.latest;
  const blueQuote = state.dollarQuotes?.quotes?.blue;
  const officialQuote = state.dollarQuotes?.quotes?.bancoNacion;
  const blueSpread = Number.isFinite(Number(blueQuote?.sell)) && Number.isFinite(Number(officialQuote?.sell))
    ? Number(blueQuote.sell) - Number(officialQuote.sell)
    : null;

  const cards = [
    {
      label: "Dólar MEP promedio",
      value: formatPrice(mepAverage),
      note: "Promedio ponderado por volumen de los instrumentos más consistentes.",
      trend: "Cobertura local",
      tone: "info"
    },
    {
      label: "Dólar blue",
      value: formatPrice(blueQuote?.sell),
      note: blueQuote ? `Venta relevada por ${blueQuote.source || "DolarHoy"}. Compra: ${formatPrice(blueQuote.buy)}.` : "Cotización informal relevada por DolarHoy.",
      trend: blueSpread === null ? "DolarHoy" : `${formatSignedPrice(blueSpread)} vs oficial`,
      tone: blueSpread && blueSpread > 0 ? "warning" : "good"
    },
    {
      label: "Dólar oficial",
      value: formatPrice(officialQuote?.sell),
      note: officialQuote ? `Venta Banco Nación. Compra: ${formatPrice(officialQuote.buy)}.` : "Referencia oficial minorista del Banco Nación.",
      trend: officialQuote?.source || "Banco Nación",
      tone: "info"
    },
    {
      label: "Última licitación",
      value: latestAuction ? formatAuctionMoney(latestAuction.totalAdjudicatedARS) : "--",
      note: latestAuction ? `Rollover ${formatPercent(latestAuction.rolloverPercent)} el ${formatDate(latestAuction.date)}.` : "Sin datos de licitaciones.",
      trend: getRolloverToneText(latestAuction?.rolloverPercent),
      tone: getRolloverTone(latestAuction?.rolloverPercent)
    }
  ];

  $("#kpiGrid").innerHTML = cards.map(renderKpiCard).join("");

  const leaderText = volumeLeader
    ? `${getTicker(volumeLeader)} aparece entre los activos con más volumen del tablero.`
    : "Todavía no hay suficientes datos de volumen.";
  const auctionText = latestAuction?.rolloverPercent
    ? `La última licitación cubrió ${formatPercent(latestAuction.rolloverPercent)} de los vencimientos: ${plainRollover(latestAuction.rolloverPercent)}`
    : "No se pudo calcular el rollover de la última licitación.";

  $("#insightStrip").innerHTML = `
    <i data-lucide="lightbulb" aria-hidden="true"></i>
    <span>${escapeHtml(leaderText)} ${escapeHtml(auctionText)}</span>
  `;
}

function renderKpiCard(card) {
  return `
    <article class="kpi-card">
      <div>
        <small>${escapeHtml(card.label)}</small>
        <div class="kpi-value">${escapeHtml(card.value)}</div>
        <p>${escapeHtml(card.note)}</p>
      </div>
      <span class="kpi-trend tone-${card.tone}">${escapeHtml(card.trend)}</span>
    </article>
  `;
}

function renderAuctions() {
  const payload = state.auctions;
  const latest = payload?.latest;
  if (!latest) {
    $("#auctionSummary").innerHTML = `<div class="empty-state">No se pudieron cargar licitaciones.</div>`;
    return;
  }

  const summaryCards = [
    { label: "Fecha", value: formatDate(latest.date), note: payload.isFallback ? "Dato de respaldo: no se pudo leer licitaciones.ar." : "Último resultado encontrado." },
    { label: "Adjudicado", value: formatAuctionMoney(latest.totalAdjudicatedARS), note: "Monto aceptado por el Tesoro." },
    { label: "Ofertado", value: formatAuctionMoney(latest.totalOfferedARS), note: "Demanda presentada por inversores." },
    { label: "Rollover", value: formatPercent(latest.rolloverPercent), note: plainRollover(latest.rolloverPercent) }
  ];

  $("#auctionSummary").innerHTML = summaryCards.map((card) => `
    <article class="metric-card">
      <small>${escapeHtml(card.label)}</small>
      <div class="kpi-value">${escapeHtml(card.value)}</div>
      <small>${escapeHtml(card.note)}</small>
    </article>
  `).join("");

  renderVerticalBarChart($("#rolloverChart"), payload.rolloverSeries || [], {
    labelKey: "date",
    valueKey: "rolloverPercent",
    formatter: (value) => `${round(value, 1)}%`,
    targetLine: 100,
    color: (row) => getRolloverColor(row.rolloverPercent),
    labelFormatter: shortDate
  });

  const detailed = payload.detailed || latest;
  renderDebtComposition(payload.typeTotals || [], detailed.totalAdjudicatedARS || 0);
  renderLatestAuctionExplanation(detailed, payload.detailedIsLatest !== false);

  renderTable($("#auctionTable"), payload.items || [], [
    { label: "Fecha", value: (row) => formatDate(row.date) },
    { label: "Rollover", value: (row) => toneValue(formatPercent(row.rolloverPercent), getRolloverTone(row.rolloverPercent)) },
    { label: "Adjudicado", value: (row) => formatAuctionMoney(row.totalAdjudicatedARS) },
    { label: "Ofertas", value: (row) => numberFormat.format(row.totalOffers || 0) },
    { label: "Instrumentos", value: (row) => String(row.instruments?.length || 0) },
    { label: "Tipos", value: (row) => renderTypePills(row.instruments || []) }
  ]);
}

function renderDebtComposition(items, total) {
  const families = getDebtFamilies(items);
  const safeTotal = total || families.reduce((sum, item) => sum + Number(item.value || 0), 0);
  if (!families.length || !safeTotal) {
    $("#auctionComposition").innerHTML = `<div class="empty-state">Sin datos de composición.</div>`;
    $("#auctionCompositionLegend").innerHTML = "";
    return;
  }

  const slices = families.map((item) => ({
    ...item,
    percent: (Number(item.value || 0) / safeTotal) * 100,
    color: debtFamilyColors[item.family] || debtFamilyColors.other
  }));

  $("#auctionComposition").innerHTML = renderDonutChart(slices, {
    centerTop: "Total",
    centerBottom: formatAuctionMoney(safeTotal)
  });

  $("#auctionCompositionLegend").innerHTML = slices.map((item) => `
    <div class="legend-row">
      <span class="legend-dot" style="background:${item.color}"></span>
      <div>
        <strong>${escapeHtml(debtFamilyLabels[item.family] || item.family)}</strong>
        <small>${formatPercent(item.percent)} · ${formatAuctionMoney(item.value)}</small>
      </div>
    </div>
  `).join("");
}

function getDebtFamilies(items) {
  const map = new Map();
  for (const item of items || []) {
    const family = mapTypeToDebtFamily(item.type);
    map.set(family, (map.get(family) || 0) + Number(item.value || 0));
  }
  return [...map.entries()]
    .map(([family, value]) => ({ family, value }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);
}

function mapTypeToDebtFamily(type) {
  if (type === "lecap") return "fixed_rate";
  if (type === "cer") return "inflation";
  if (type === "tamar") return "floating_rate";
  if (type === "dual") return "dual";
  if (type === "dolar_linked") return "dollar_linked";
  if (type === "hard_dollar") return "hard_dollar";
  return "other";
}

function renderLatestAuctionExplanation(latest, isLatest = true) {
  const container = $("#latestAuctionExplanation");
  const instruments = normalizeRows(latest?.instruments)
    .filter((item) => Number.isFinite(Number(item.effectiveValue)))
    .sort((a, b) => Number(b.effectiveValue || 0) - Number(a.effectiveValue || 0));

  if (!latest || !instruments.length) {
    container.innerHTML = `<div class="empty-state">Sin instrumentos para explicar.</div>`;
    return;
  }

  const topInstruments = instruments.slice(0, 6);
  const uniqueTypes = [...new Set(instruments.map((item) => item.type || "otros"))];
  const fixedShare = getFamilyShare(instruments, "fixed_rate");
  const inflationShare = getFamilyShare(instruments, "inflation");
  const title = isLatest
    ? "Explicación simple de la última licitación"
    : "Explicación de la última licitación con desglose";

  container.innerHTML = `
    <div class="panel-title">
      <span>${escapeHtml(title)}</span>
      <small>${escapeHtml(formatDate(latest.date))}</small>
    </div>
    <div class="auction-reading">
      <p>
        El Tesoro adjudicó ${escapeHtml(formatAuctionMoney(latest.totalAdjudicatedARS))} y logró un rollover de
        ${escapeHtml(formatPercent(latest.rolloverPercent))}. En criollo: ${escapeHtml(plainRollover(latest.rolloverPercent))}
      </p>
      <p>
        La parte de tasa fija representó ${escapeHtml(formatPercent(fixedShare))} y la parte que ajusta por inflación CER
        ${escapeHtml(formatPercent(inflationShare))}. Cuanto más pesa CER, más protección contra inflación compró el mercado;
        cuanto más pesa tasa fija, más aceptó cerrar una tasa conocida en pesos.
      </p>
    </div>
    <div class="latest-instrument-grid">
      ${topInstruments.map((item) => `
        <article class="instrument-card">
          <div>
            <strong>${escapeHtml(item.ticker || "--")}</strong>
            <span>${escapeHtml(typeLabels[item.type] || item.type || "Otro")}</span>
          </div>
          <p>${escapeHtml(formatAuctionMoney(item.effectiveValue))}</p>
          <small>Vence ${escapeHtml(formatDate(item.maturityDate))}${Number.isFinite(Number(item.tirea)) ? ` · TIREA ${escapeHtml(formatPercent(item.tirea))}` : ""}</small>
        </article>
      `).join("")}
    </div>
    <div class="definition-grid">
      ${uniqueTypes.map((type) => {
        const definition = instrumentDefinitions[type] || instrumentDefinitions.otros;
        return `
          <article>
            <strong>${escapeHtml(definition.title)}</strong>
            <span>${escapeHtml(definition.short)}</span>
            <p>${escapeHtml(definition.text)}</p>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function getFamilyShare(instruments, family) {
  const total = instruments.reduce((sum, item) => sum + Number(item.effectiveValue || 0), 0);
  if (!total) return 0;
  const familyTotal = instruments
    .filter((item) => mapTypeToDebtFamily(item.type) === family)
    .reduce((sum, item) => sum + Number(item.effectiveValue || 0), 0);
  return (familyTotal / total) * 100;
}

function renderDollars() {
  renderOfficialDollarCards();
}

function renderOfficialDollarCards() {
  const quotes = state.dollarQuotes?.quotes;
  const rows = [
    {
      key: "bancoNacion",
      title: "Dólar oficial",
      icon: "landmark",
      note: "Referencia minorista del Banco Nación. Es la base para comparar brechas y costos en pesos."
    },
    {
      key: "blue",
      title: "Dólar blue",
      icon: "wallet-cards",
      note: "Cotización informal relevada por DolarHoy. Es útil como termómetro social, no como precio de mercado regulado."
    },
    {
      key: "mep",
      title: "Dólar MEP",
      icon: "repeat-2",
      note: "Precio financiero local: surge de comprar y vender activos que cotizan en pesos y dólares dentro del mercado argentino."
    },
    {
      key: "ccl",
      title: "Dólar CCL",
      icon: "globe-2",
      note: "Contado con liquidación. Es una referencia financiera para dolarizarse mediante activos con liquidación fuera del país."
    },
    {
      key: "tarjeta",
      title: "Dólar tarjeta",
      icon: "credit-card",
      note: "Costo estimado para consumos con tarjeta en moneda extranjera, incluyendo percepciones e impuestos vigentes."
    }
  ];

  $("#officialDollarCards").innerHTML = rows.map((item) => {
    const quote = quotes?.[item.key];
    return `
      <article class="quote-card">
        <div class="quote-head">
          <i data-lucide="${item.icon}" aria-hidden="true"></i>
          <div>
            <strong>${escapeHtml(item.title)}</strong>
            <small>${quote?.source ? escapeHtml(quote.source) : "Fuente pendiente"}</small>
          </div>
        </div>
        <div class="quote-prices">
          <span><small>Compra</small>${escapeHtml(formatPrice(quote?.buy))}</span>
          <span><small>Venta</small>${escapeHtml(formatPrice(quote?.sell))}</span>
        </div>
        <p>${escapeHtml(item.note)}</p>
        ${quote?.sourceUrl ? `<a class="source-link" href="${escapeHtml(quote.sourceUrl)}" target="_blank" rel="noreferrer">Ver fuente</a>` : ""}
      </article>
    `;
  }).join("");
}

function renderMacro() {
  const macro = state.macro;
  if (!macro) {
    $("#macroCards").innerHTML = `<div class="empty-state">No se pudieron cargar datos macro.</div>`;
    return;
  }

  const series = macro.series || {};
  const snapshots = macro.snapshots || {};
  const inflation = series.inflation?.latest;
  const trade = series.tradeBalance?.latest;
  const poverty = series.poverty?.latest;
  const primary = series.primaryResult?.latest;
  const financial = series.financialResult?.latest;
  const indigence = snapshots.indigence;
  const cars = snapshots.cars;
  const confidence = snapshots.confidence;

  const cards = [
    {
      title: "Inflación mensual",
      value: formatPercent(inflation?.value),
      detail: inflation ? `IPC de ${formatMonth(inflation.date)}.` : "Sin dato reciente.",
      explain: "Mide cuánto subieron los precios de un mes al siguiente. Si baja varios meses, los pesos pierden poder de compra más lento; si sube, vuelve presión sobre salarios, tasas y consumo.",
      source: series.inflation?.sourceUrl
    },
    {
      title: "Balanza comercial",
      value: formatUsdMillions(trade?.value),
      detail: trade ? `${trade.value >= 0 ? "Superávit" : "Déficit"} en ${formatMonth(trade.date)}.` : "Sin dato reciente.",
      explain: trade?.value >= 0
        ? "Superávit significa que las exportaciones superaron a las importaciones: entraron más dólares comerciales de los que salieron por compras al exterior."
        : "Déficit significa que las importaciones superaron a las exportaciones: faltan dólares comerciales y hay que financiarlos con reservas o crédito.",
      source: series.tradeBalance?.sourceUrl
    },
    {
      title: "Pobreza",
      value: formatPercent(poverty?.value),
      detail: poverty ? `Personas bajo línea de pobreza, ${formatSemester(poverty.date)}.` : "Sin dato reciente.",
      explain: "Compara los ingresos de los hogares contra una canasta básica total. Si el ingreso no alcanza esa canasta, la persona queda bajo la línea de pobreza.",
      source: series.poverty?.sourceUrl
    },
    {
      title: "Indigencia",
      value: formatPercent(indigence?.value),
      detail: indigence ? `Personas bajo línea de indigencia, ${formatSemester(indigence.date)}.` : "Dato de informe INDEC.",
      explain: "Es una medición más extrema que pobreza: mira si el ingreso alcanza para cubrir una canasta básica alimentaria.",
      source: indigence?.sourceUrl,
      staleLabel: indigence?.stale ? `Dato de ${formatSemester(indigence.date)}, puede estar desactualizado` : ""
    },
    {
      title: "Patentamientos",
      value: cars?.value ? numberFormat.format(cars.value) : "--",
      detail: cars ? `Autos 0 km en ${formatMonth(cars.date)}; ${formatSignedPercentText(cars.monthChange)} mensual y ${formatSignedPercentText(cars.change)} interanual.` : "Sin dato reciente.",
      explain: cars ? `Es la cantidad de autos nuevos inscriptos. Contra ${formatMonth(cars.previousDate)} (${numberFormat.format(cars.previousValue)} unidades), ${formatMonth(cars.date)} mostró una variación mensual de ${formatSignedPercentText(cars.monthChange)}.` : "Mide cuántos autos 0 km se registran: sirve como termómetro de consumo durable.",
      source: cars?.sourceUrl,
      staleLabel: cars?.stale ? `Dato de ${formatMonth(cars.date)}, puede estar desactualizado` : ""
    },
    {
      title: "Confianza consumidor",
      value: confidence?.value ? round(confidence.value, 2) : "--",
      detail: confidence ? `ICC Di Tella: ${formatSignedPercentText(confidence.change)} mensual.` : "Sin dato reciente.",
      explain: "Resume cómo perciben los hogares su situación y la economía. Cuando cae, suele anticipar más cautela para consumir o endeudarse.",
      source: confidence?.sourceUrl
    },
    {
      title: "Resultado primario",
      value: formatArsMillions(primary?.value),
      detail: primary ? `${primary.value >= 0 ? "Superávit" : "Déficit"} antes de intereses en ${formatMonth(primary.date)}.` : "Sin dato reciente.",
      explain: "Es ingresos menos gastos del Estado antes de pagar intereses de deuda. Sirve para ver si las cuentas públicas cierran por la operación corriente.",
      source: series.primaryResult?.sourceUrl
    },
    {
      title: "Resultado financiero",
      value: formatArsMillions(financial?.value),
      detail: financial ? `${financial.value >= 0 ? "Superávit" : "Déficit"} después de intereses en ${formatMonth(financial.date)}.` : "Sin dato reciente.",
      explain: "Es el saldo fiscal completo: toma el resultado primario y le resta los intereses de la deuda. Muestra si al final sobró o faltó plata.",
      source: series.financialResult?.sourceUrl
    }
  ];

  $("#macroCards").innerHTML = cards.map((card) => `
    <article class="macro-card">
      <small>${escapeHtml(card.title)}</small>
      <strong>${escapeHtml(card.value)}</strong>
      <p>${escapeHtml(card.detail)}</p>
      <p class="card-explain">${escapeHtml(card.explain)}</p>
      ${card.staleLabel ? `<span class="kpi-trend tone-warning">${escapeHtml(card.staleLabel)}</span>` : ""}
      ${card.source ? `<a class="source-link" href="${escapeHtml(card.source)}" target="_blank" rel="noreferrer">Fuente</a>` : ""}
    </article>
  `).join("");

  renderInflationChart(series.inflation?.rows || []);
  renderAnnualInflationChart(series.inflation?.rows || []);
  renderSignedVerticalBarChart($("#tradeChart"), (series.tradeBalance?.rows || []).slice(-12), {
    valueKey: "value",
    formatter: (value) => `${round(value, 0)} M`,
    labelFormatter: (row) => shortDate(row.date),
    tooltipFormatter: (row, value) => {
      const result = value >= 0 ? "Superávit" : "Déficit";
      return `<strong>${escapeHtml(formatMonth(row.date))}</strong><span>${escapeHtml(result)}: US$ ${escapeHtml(numberFormat.format(Math.round(Math.abs(value))))} millones</span>`;
    }
  });
  renderFiscalChart(series.primaryResult?.rows || [], series.financialResult?.rows || []);
}

function renderCensus() {
  const census = state.census;
  if (!census) {
    $("#censusSummary").innerHTML = `<div class="empty-state">No se pudieron cargar datos de censo.</div>`;
    $("#censusPyramids").innerHTML = `<div class="empty-state">Sin piramide poblacional.</div>`;
    $("#censusNarrative").innerHTML = "";
    return;
  }

  const current = census.censuses?.current;
  const previous = census.censuses?.previous;
  const summary = census.summary;

  if (!current?.rows?.length || !previous?.rows?.length) {
    $("#censusSummary").innerHTML = `<div class="empty-state">No hay filas suficientes para comparar censos.</div>`;
    $("#censusPyramids").innerHTML = `<div class="empty-state">Sin piramide poblacional.</div>`;
    $("#censusNarrative").innerHTML = "";
    return;
  }

  const cards = [
    {
      label: "Poblacion relevada",
      value: `${formatPopulation(summary?.totals?.previous)} -> ${formatPopulation(summary?.totals?.current)}`,
      note: `Cambio total: ${formatSignedCompactPopulation(summary?.totals?.delta)}.`
    },
    {
      label: "Ninez (0 a 14)",
      value: formatPercent(summary?.shares?.children?.current),
      note: `En 2010 era ${formatPercent(summary?.shares?.children?.previous)}. Cambio: ${formatSignedPoints(summary?.shares?.children?.delta)}.`
    },
    {
      label: "Mayores de 65",
      value: formatPercent(summary?.shares?.older?.current),
      note: `En 2010 era ${formatPercent(summary?.shares?.older?.previous)}. Cambio: ${formatSignedPoints(summary?.shares?.older?.delta)}.`
    },
    {
      label: "Mujeres dentro de 65+",
      value: formatPercent(summary?.shares?.olderFemale?.current),
      note: `En 2010 era ${formatPercent(summary?.shares?.olderFemale?.previous)}.`
    }
  ];

  $("#censusSummary").innerHTML = cards.map((card) => `
    <article class="metric-card census-card">
      <small>${escapeHtml(card.label)}</small>
      <div class="kpi-value">${escapeHtml(card.value)}</div>
      <small>${escapeHtml(card.note)}</small>
    </article>
  `).join("");

  $("#censusPyramids").innerHTML = `
    <article class="pyramid-card overlay-pyramid-card">
      <div class="panel-title">
        <span>Censo ${escapeHtml(previous.year)} vs ${escapeHtml(current.year)}</span>
        <small>Superpuesto por edad y sexo</small>
      </div>
      ${renderPopulationPyramidOverlay(previous.rows, current.rows, previous.year, current.year)}
    </article>
  `;

  const shares = summary.shares;
  const trend = (delta, up, down) => (delta > 0 ? up : delta < 0 ? down : "se mantuvo igual");
  const narrative = [
    {
      title: "Cómo cambió la forma",
      text: `Los chicos de 0 a 14 años pasaron de ${formatPercent(shares.children.previous)} a ${formatPercent(shares.children.current)} de la población (${formatSignedPoints(shares.children.delta)}): la base ${trend(shares.children.delta, "se ensanchó", "se achicó")}. Eso suele reflejar cómo evolucionan los nacimientos y el envejecimiento.`
    },
    {
      title: "Peso en edades altas",
      text: `Los mayores de 65 pasaron de ${formatPercent(shares.older.previous)} a ${formatPercent(shares.older.current)} (${formatSignedPoints(shares.older.delta)}): la parte alta ${trend(shares.older.delta, "ganó", "perdió")} participación. Las edades de 15 a 64 son hoy ${formatPercent(shares.workingAge.current)} del total.`
    },
    {
      title: "Diferencia por sexo en edades altas",
      text: `Entre los mayores de 65, las mujeres son ${formatPercent(shares.olderFemale.current)} (en 2010: ${formatPercent(shares.olderFemale.previous)}), algo habitual cuando la esperanza de vida de las mujeres supera a la de los varones.`
    },
    {
      title: "Fuente y alcance",
      text: `El último censo sale del cuadro oficial de INDEC en Redatam y la comparación 2010 del cuadro nacional del censo anterior.${census.warning ? " Ahora se muestran datos de respaldo para 2022 porque no se pudo consultar Redatam." : ""} Sirve para ver la estructura de la población, no para sacar conclusiones financieras.`
    }
  ];
  $("#censusNarrative").innerHTML = narrative.map((item) => `
    <article>
      <strong>${escapeHtml(item.title)}</strong>
      <p>${escapeHtml(item.text)}</p>
    </article>
  `).join("");
}

function renderInflationChart(rows) {
  // 13 meses = el mes actual más el año previo. Con 24 las etiquetas de % y de
  // fecha se encimaban y el gráfico quedaba ilegible.
  const cleanRows = rows.filter((row) => Number.isFinite(Number(row.value))).slice(-13);
  const rowsWithPrevious = cleanRows.map((row, index) => ({
    ...row,
    previousValue: index > 0 ? cleanRows[index - 1].value : null
  }));

  renderVerticalBarChart($("#inflationChart"), rowsWithPrevious, {
    labelKey: "date",
    valueKey: "value",
    formatter: formatPercent,
    color: "#f2b84b",
    labelFormatter: shortMonth,
    maxItems: 13,
    ariaLabel: "Inflacion mensual comparada con meses previos",
    tooltipFormatter: (row, value) => {
      const previous = row.previousValue === null ? null : Number(row.previousValue);
      const delta = Number.isFinite(previous) ? value - previous : null;
      const comparison = Number.isFinite(delta)
        ? `${delta >= 0 ? "Subio" : "Bajo"} ${formatPercent(Math.abs(delta))} contra el mes previo`
        : "Primer mes de la ventana mostrada";
      return `<strong>${escapeHtml(formatMonth(row.date))}</strong><span>IPC mensual: ${escapeHtml(formatPercent(value))}</span><span>${escapeHtml(comparison)}</span>`;
    }
  });

  const last = rowsWithPrevious.at(-1);
  const previous = rowsWithPrevious.at(-2);
  if (!last || !previous) return;
  const direction = last.value > previous.value ? "aceleró" : last.value < previous.value ? "desaceleró" : "quedó igual";
  $("#inflationNarrative").textContent = `El último IPC fue ${formatPercent(last.value)} en ${formatMonth(last.date)} y ${direction} frente al mes anterior (${formatPercent(previous.value)}).`;
}

function renderAnnualInflationChart(rows) {
  const cleanRows = rows.filter((row) => Number.isFinite(Number(row.value)))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const annualRows = [];

  for (let index = 11; index < cleanRows.length; index += 1) {
    const windowRows = cleanRows.slice(index - 11, index + 1);
    const factor = windowRows.reduce((acc, row) => acc * (1 + Number(row.value) / 100), 1);
    const annual = (factor - 1) * 100;
    const previousAnnual = annualRows.at(-1)?.annual;
    annualRows.push({
      date: cleanRows[index].date,
      annual,
      delta: Number.isFinite(previousAnnual) ? annual - previousAnnual : null
    });
  }

  // Últimos 13 meses: muestra este mes contra el mismo mes del año pasado. Con 18
  // meses los valores viejos (interanual mucho más alto) dejaban la escala
  // distorsionada y el resto de la línea quedaba pegado al piso.
  const visibleRows = annualRows.slice(-13);
  renderLineChart($("#inflationAnnualChart"), visibleRows, {
    xKey: "date",
    yKey: "annual",
    formatter: formatPercent,
    axisFormatter: (value) => `${round(value, 0)}%`,
    xFormatter: shortMonth,
    color: "#1fc6b5",
    label: "Inflación interanual",
    tooltipFormatter: (row, value) => {
      const delta = Number.isFinite(Number(row.delta)) ? formatSignedPoints(row.delta) : "sin comparación previa";
      return `<strong>${escapeHtml(formatMonth(row.date))}</strong><span>Interanual: ${escapeHtml(formatPercent(value))}</span><span>Variación mensual de la interanual: ${escapeHtml(delta)}</span>`;
    }
  });

  const last = visibleRows.at(-1);
  const previous = visibleRows.at(-2);
  if (!last || !previous) return;
  const direction = last.annual > previous.annual ? "subió" : last.annual < previous.annual ? "bajó" : "quedó igual";
  $("#inflationAnnualNarrative").textContent = `La inflación interanual estimada fue ${formatPercent(last.annual)} en ${formatMonth(last.date)} y ${direction} ${formatSignedPoints(last.annual - previous.annual)} contra el mes anterior.`;
}

function renderFiscalChart(primaryRows, financialRows) {
  const byDate = new Map();
  for (const row of primaryRows) {
    byDate.set(row.date, { date: row.date, primary: Number(row.value), financial: null });
  }
  for (const row of financialRows) {
    const item = byDate.get(row.date) || { date: row.date, primary: null, financial: null };
    item.financial = Number(row.value);
    byDate.set(row.date, item);
  }
  const rows = [...byDate.values()]
    .filter((row) => Number.isFinite(row.primary) || Number.isFinite(row.financial))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(-12);

  const latest = rows.at(-1);
  if ($("#fiscalNarrative") && latest) {
    const primaryText = Number.isFinite(latest.primary) ? `primario ${formatArsMillions(latest.primary)}` : "primario sin dato";
    const financialText = Number.isFinite(latest.financial) ? `financiero ${formatArsMillions(latest.financial)}` : "financiero sin dato";
    $("#fiscalNarrative").textContent = `Primario mira ingresos menos gastos antes de intereses. Financiero incluye intereses de deuda. Último dato disponible en la serie: ${formatMonth(latest.date)} (${primaryText}; ${financialText}).`;
  }

  renderGroupedBarChart($("#fiscalChart"), rows, {
    series: [
      { key: "primary", label: "Primario", color: "#4ad080" },
      { key: "financial", label: "Financiero", color: "#4aa3ff" }
    ],
    formatter: (value) => `${round(value / 1000000, 2)} B`,
    labelFormatter: shortDate
  });
}

function renderMarketSection() {
  const rows = normalizeRows(state.live[state.selectedMarket]);
  $("#moversTitle").textContent = `${marketLabels[state.selectedMarket]}: cambios diarios`;

  const movers = rows
    .filter((row) => Number.isFinite(Number(row.pct_change)) && Number(row.v) > 0)
    .sort((a, b) => Math.abs(Number(b.pct_change)) - Math.abs(Number(a.pct_change)))
    .slice(0, 12);

  renderHorizontalBarChart($("#moversChart"), movers, {
    labelKey: "symbol",
    valueKey: "pct_change",
    formatter: (value) => `${round(value, 2)}%`
  });

  const topVolume = getTopRows(rows, "v", 14);
  renderTable($("#marketTable"), topVolume, marketColumns());
}

function renderRisk() {
  const risk = Array.isArray(state.risk) ? state.risk[0] : state.risk;
  const expected = Number(risk?.iv_s_term || 0) * 100;
  const historical = Number(risk?.hv_s_term || 0) * 100;
  const premium = expected - historical;
  const cards = [
    {
      label: "Volatilidad esperada",
      value: formatPercent(expected),
      note: "Es la oscilación que el mercado de opciones está cobrando hacia adelante. Más alta implica que se esperan precios más movedizos."
    },
    {
      label: "Volatilidad histórica",
      value: formatPercent(historical),
      note: "Es cuánto se movió realmente el activo en el pasado reciente. Sirve como piso de comparación contra la expectativa."
    },
    {
      label: "Percentil histórico",
      value: formatPercent(Number(risk?.hv_s_term_percentile || 0) * 100),
      note: "Ubica la volatilidad actual frente a su propia historia. 70% significa que estuvo más baja en 7 de cada 10 momentos comparables."
    },
    {
      label: "Prima de opciones",
      value: round(Number(risk?.iv_hv_s_ratio || 0), 2),
      note: `Mayor a 1 indica que las opciones cobran más movimiento del que se vio recientemente. Diferencia esperada vs histórica: ${formatSignedPoints(premium)}.`
    }
  ];

  $("#riskGrid").innerHTML = cards.map((card) => `
    <article class="risk-card">
      <span>${escapeHtml(card.label)}</span>
      <strong>${escapeHtml(String(card.value))}</strong>
      <span>${escapeHtml(card.note)}</span>
    </article>
  `).join("");
}

function renderExplorer() {
  const rows = normalizeRows(state.live[state.selectedExplorer]);
  const query = $("#explorerSearch").value.trim().toUpperCase();
  const filtered = rows
    .filter((row) => !query || getTicker(row).includes(query))
    .sort((a, b) => Number(b.v || 0) - Number(a.v || 0))
    .slice(0, 80);

  renderTable($("#explorerTable"), filtered, marketColumns());
}

function marketColumns() {
  return [
    { label: "Ticker", value: (row) => `<span class="ticker">${escapeHtml(getTicker(row))}</span>` },
    { label: "Precio", value: (row) => formatMarketPrice(row.c) },
    { label: "Cambio", value: (row) => signedPercent(row.pct_change) },
    { label: "Volumen", value: (row) => formatCompactNumber(row.v) },
    { label: "Operaciones", value: (row) => formatCompactNumber(row.q_op) },
    { label: "Compra", value: (row) => formatMarketPrice(row.px_bid) },
    { label: "Venta", value: (row) => formatMarketPrice(row.px_ask) }
  ];
}

function renderGuide() {
  const items = [
    {
      title: "Licitación del Tesoro",
      text: "Es una subasta de deuda. El Gobierno ofrece letras o bonos, los inversores hacen ofertas y el Tesoro decide cuánto acepta. Sirve para pagar vencimientos o conseguir financiamiento nuevo."
    },
    {
      title: "Rollover",
      text: "Compara cuánto consiguió el Tesoro contra cuánto tenía que pagar. Un rollover de 100% cubre justo los vencimientos; arriba de 100% suma financiamiento; abajo de 100% deja una parte sin renovar."
    },
    {
      title: "MEP",
      text: "Es un dólar implícito que surge al comprar un activo en pesos y venderlo en dólares dentro del mercado local. Se usa como referencia de cobertura en Argentina."
    },
    {
      title: "CCL",
      text: "Es parecido al MEP, pero conecta el precio local con el precio del activo en el exterior. Ayuda a ver cuánto cuesta dolarizar o mover valor fuera del mercado local."
    },
    {
      title: "Bono",
      text: "Es un préstamo al emisor. En el tablero se ven precio, volumen y variación diaria; si el precio baja, el mercado pide más rendimiento o percibe más riesgo."
    },
    {
      title: "Acción",
      text: "Es una participación en una empresa. Su precio sube o baja según expectativas de ganancias, contexto económico, liquidez y apetito por riesgo."
    },
    {
      title: "CEDEAR",
      text: "Es un certificado local que representa acciones o ETFs del exterior. Se opera en pesos y suele moverse por dos fuerzas: el activo internacional y el dólar implícito."
    },
    {
      title: "CER, TAMAR y dólar linked",
      text: "CER ajusta por inflación, TAMAR sigue una tasa bancaria de referencia y dólar linked paga en pesos pero se mueve con el dólar oficial. Son formas distintas de proteger valor."
    },
    {
      title: "Volatilidad",
      text: "Mide cuánto cambia el precio. Alta volatilidad significa que el activo puede moverse mucho; no dice dirección, solo intensidad del movimiento."
    },
    {
      title: "Inflación",
      text: "Mide cuánto suben los precios. Si el IPC mensual baja varios meses seguidos, los pesos pierden poder de compra más lento; si sube, vuelve la presión sobre salarios, tasas y consumo."
    },
    {
      title: "Balanza comercial",
      text: "Es exportaciones menos importaciones. Superávit significa que el comercio exterior deja más dólares de los que demanda; déficit significa que hace falta financiarlos."
    },
    {
      title: "Resultado primario y financiero",
      text: "El resultado primario mira ingresos menos gastos antes de intereses. El financiero incluye los intereses de la deuda y muestra el saldo fiscal completo."
    },
    {
      title: "Piramide poblacional",
      text: "Ordena a la poblacion por edad y sexo. Si la base se hace mas angosta entre censos, suele indicar menos nacimientos; si la parte alta gana peso, hay envejecimiento poblacional."
    },
    {
      title: "Instrumento",
      text: "Es cada bono, letra, accion o CEDEAR individual. El ticker es solo su nombre corto; lo importante es que activo representa, en que moneda esta y que riesgo tiene."
    }
  ];

  $("#guideGrid").innerHTML = items.map((item) => `
    <article class="guide-card">
      <strong>${escapeHtml(item.title)}</strong>
      <p>${escapeHtml(item.text)}</p>
    </article>
  `).join("");
}

function cleanDollarRows(rows, valueKey, weightKey) {
  return normalizeRows(rows).filter((row) => {
    const value = Number(row[valueKey]);
    const weight = Number(row[weightKey]);
    return Number.isFinite(value) && Number.isFinite(weight) && value > 800 && value < 2500 && weight > 0;
  });
}

function weightedAverage(rows, valueKey, weightKey) {
  const totals = rows.reduce((acc, row) => {
    const value = Number(row[valueKey]);
    const weight = Number(row[weightKey]) || 1;
    if (Number.isFinite(value) && Number.isFinite(weight) && weight > 0) {
      acc.sum += value * weight;
      acc.weight += weight;
    }
    return acc;
  }, { sum: 0, weight: 0 });
  return totals.weight ? totals.sum / totals.weight : null;
}

function getPositiveShare(rows) {
  const valid = rows.filter((row) => Number.isFinite(Number(row.pct_change)));
  if (!valid.length) return 0;
  return (valid.filter((row) => Number(row.pct_change) > 0).length / valid.length) * 100;
}

function getTopRows(rows, key, count) {
  return normalizeRows(rows)
    .filter((row) => Number.isFinite(Number(row[key])))
    .sort((a, b) => Number(b[key]) - Number(a[key]))
    .slice(0, count);
}

function renderTypePills(instruments) {
  const uniqueTypes = [...new Set(instruments.map((item) => item.type).filter(Boolean))];
  if (!uniqueTypes.length) return `<span class="neutral">--</span>`;
  return `<div class="tag-row">${uniqueTypes.map((type) => `<span class="pill">${escapeHtml(typeLabels[type] || type)}</span>`).join("")}</div>`;
}

function toneValue(value, tone) {
  const css = tone === "good" ? "positive" : tone === "bad" ? "negative" : "neutral";
  return `<span class="${css}">${escapeHtml(value)}</span>`;
}

function getTicker(row) {
  return String(row.symbol || row.ticker || row.ticker_ar || row.ticker_usa || "--").toUpperCase();
}

function getRolloverTone(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "warning";
  if (numeric >= 100) return "good";
  if (numeric >= 75) return "warning";
  return "bad";
}

function getRolloverToneText(value) {
  const tone = getRolloverTone(value);
  if (tone === "good") return "Cubre vencimientos";
  if (tone === "bad") return "Cobertura débil";
  return "Cobertura parcial";
}

function getRolloverColor(value) {
  const tone = getRolloverTone(value);
  if (tone === "good") return "#18825c";
  if (tone === "bad") return "#bf3b3b";
  return "#d89a00";
}

function plainRollover(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "No hay dato de cobertura.";
  if (numeric >= 100) return "alcanzó para cubrir los pagos y sumar aire financiero.";
  if (numeric >= 75) return "cubrió una parte importante, pero no todo.";
  return "quedó corto frente a los pagos que vencían.";
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}
