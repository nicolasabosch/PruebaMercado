const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const state = {
  live: {},
  auctions: null,
  dollarQuotes: null,
  macro: null,
  risk: null,
  historyRows: [],
  selectedMarket: "arg_stocks",
  selectedExplorer: "arg_bonds",
  errors: []
};

const marketLabels = {
  arg_stocks: "Acciones argentinas",
  arg_cedears: "CEDEARs",
  arg_bonds: "Bonos soberanos y provinciales",
  arg_notes: "Letras y notes",
  arg_options: "Opciones"
};

const typeLabels = {
  lecap: "Tasa fija",
  cer: "CER",
  tamar: "TAMAR",
  dual: "Dual",
  dolar_linked: "Dólar linked",
  hard_dollar: "Dólar hard",
  otros: "Otros"
};

const typeColors = {
  lecap: "#2f6fb2",
  cer: "#d89a00",
  tamar: "#7b4aae",
  dual: "#bf3b3b",
  dolar_linked: "#007f79",
  hard_dollar: "#18825c",
  otros: "#66717a"
};

const debtFamilyLabels = {
  fixed_rate: "Tasa fija",
  inflation: "Ajusta por inflación",
  floating_rate: "Tasa variable",
  dual: "Dual o mixta",
  dollar_linked: "Atada al dólar oficial",
  hard_dollar: "En dólares",
  other: "Otros"
};

const debtFamilyColors = {
  fixed_rate: "#4aa3ff",
  inflation: "#f2b84b",
  floating_rate: "#a982ff",
  dual: "#ff6b6b",
  dollar_linked: "#1fc6b5",
  hard_dollar: "#4ad080",
  other: "#8a98a6"
};

const instrumentDefinitions = {
  lecap: {
    title: "LECAP",
    short: "Letra capitalizable en pesos",
    text: "Paga una tasa fija implícita y capitaliza intereses hasta el vencimiento. Es la parte más simple de leer: se sabe la tasa en pesos desde el inicio."
  },
  cer: {
    title: "CER",
    short: "Ajusta por inflación",
    text: "El capital se actualiza por CER, que sigue al IPC. Protege contra inflación, aunque el precio también se mueve por tasas y expectativas."
  },
  tamar: {
    title: "TAMAR",
    short: "Tasa variable bancaria",
    text: "Paga una tasa que cambia con una referencia mayorista bancaria. Sirve cuando el mercado no quiere quedar clavado en una tasa fija."
  },
  dual: {
    title: "Dual",
    short: "Combina coberturas",
    text: "Suele pagar según la mejor de dos referencias definidas en la emisión, por ejemplo inflación o tipo de cambio. Es una forma de comprar seguro contra escenarios distintos."
  },
  dolar_linked: {
    title: "Dólar linked",
    short: "Paga en pesos, sigue dólar oficial",
    text: "No entrega dólares: paga pesos ajustados por la evolución del tipo de cambio oficial. Se usa para cubrir riesgo de devaluación oficial."
  },
  hard_dollar: {
    title: "Bono hard dollar",
    short: "Deuda en dólares",
    text: "El flujo está denominado en dólares. Para el Tesoro implica compromiso en moneda dura y para el inversor cambia el riesgo principal."
  },
  otros: {
    title: "Otros",
    short: "Instrumentos no clasificados",
    text: "Agrupa instrumentos que no entran en las familias anteriores o que llegan con poca información de clasificación."
  }
};

const numberFormat = new Intl.NumberFormat("es-AR");
const compactFormat = new Intl.NumberFormat("es-AR", { notation: "compact", maximumFractionDigits: 1 });
const dateFormat = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const timeFormat = new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit" });

document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  bindEvents();
  renderGuide();
  renderBymaSection();
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

  $("#historySelect").addEventListener("change", async (event) => {
    await loadHistory(event.target.value);
    renderHistory();
  });

  $("#explorerSelect").addEventListener("change", async (event) => {
    state.selectedExplorer = event.target.value;
    await ensureMarketData(state.selectedExplorer);
    renderExplorer();
  });

  $("#explorerSearch").addEventListener("input", renderExplorer);
}

async function loadAllData() {
  setStatus("Consultando Data912 y licitaciones...", "loading");
  state.errors = [];

  const jobs = [
    ["mep", () => fetchData912("live/mep")],
    ["ccl", () => fetchData912("live/ccl")],
    ["arg_stocks", () => fetchData912("live/arg_stocks")],
    ["arg_cedears", () => fetchData912("live/arg_cedears")],
    ["arg_bonds", () => fetchData912("live/arg_bonds")],
    ["arg_notes", () => fetchData912("live/arg_notes")],
    ["auctions", fetchAuctions],
    ["dollarQuotes", fetchDollarQuotes],
    ["macro", fetchMacro],
    ["risk", () => fetchData912("eod/volatilities/GGAL")]
  ];

  const results = await Promise.allSettled(jobs.map(async ([key, job]) => [key, await job()]));

  for (const result of results) {
    if (result.status === "fulfilled") {
      const [key, value] = result.value;
      if (key === "auctions") state.auctions = value;
      else if (key === "dollarQuotes") state.dollarQuotes = value;
      else if (key === "macro") state.macro = value;
      else if (key === "risk") state.risk = value;
      else state.live[key] = normalizeRows(value);
    } else {
      state.errors.push(result.reason?.message || "Error desconocido");
    }
  }

  await loadHistory($("#historySelect").value);

  renderDashboard();
  renderAuctions();
  renderDollars();
  renderMacro();
  renderMarketSection();
  renderHistory();
  renderRisk();
  renderExplorer();

  if (state.errors.length) {
    setStatus("Listo con algunas fuentes caídas", "error");
  } else {
    setStatus("Datos actualizados", "ready");
  }
  $("#lastUpdated").textContent = timeFormat.format(new Date());
  refreshIcons();
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

async function ensureMarketData(key) {
  if (state.live[key]?.length) return;
  try {
    state.live[key] = normalizeRows(await fetchData912(`live/${key}`));
  } catch (error) {
    state.errors.push(error.message);
  }
}

async function loadHistory(value) {
  try {
    const rows = await fetchData912(`historical/${value}`);
    state.historyRows = normalizeRows(rows);
  } catch (error) {
    state.historyRows = [];
    state.errors.push(error.message);
  }
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
  const ccl = cleanDollarRows(state.live.ccl, "CCL_mark", "ars_volume");
  const mepAverage = weightedAverage(mep, "mark", "v_ars");
  const cclAverage = weightedAverage(ccl, "CCL_mark", "ars_volume");
  const marketRows = [...(state.live.arg_stocks || []), ...(state.live.arg_cedears || []), ...(state.live.arg_bonds || [])];
  const positiveShare = getPositiveShare(marketRows);
  const volumeLeader = getTopRows(marketRows, "v", 1)[0];
  const latestAuction = state.auctions?.latest;
  const spread = cclAverage && mepAverage ? cclAverage - mepAverage : null;

  const cards = [
    {
      label: "Dólar MEP promedio",
      value: formatPrice(mepAverage),
      note: "Promedio ponderado por volumen de los instrumentos más consistentes.",
      trend: "Cobertura local",
      tone: "info"
    },
    {
      label: "Dólar CCL promedio",
      value: formatPrice(cclAverage),
      note: spread === null ? "Compara precios locales contra su versión del exterior." : `Diferencia contra MEP: ${formatSignedPrice(spread)}.`,
      trend: spread && spread > 20 ? "Más caro afuera" : "En línea",
      tone: spread && spread > 20 ? "warning" : "good"
    },
    {
      label: "Clima del mercado",
      value: `${Math.round(positiveShare)}%`,
      note: "Porcentaje de activos con variación diaria positiva entre acciones, CEDEARs y bonos.",
      trend: positiveShare >= 55 ? "Mayoría verde" : positiveShare <= 45 ? "Mayoría roja" : "Mixto",
      tone: positiveShare >= 55 ? "good" : positiveShare <= 45 ? "bad" : "warning"
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
    { label: "Fecha", value: formatDate(latest.date), note: "Último resultado encontrado." },
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

  renderDebtComposition(payload.typeTotals || [], latest.totalAdjudicatedARS || 0);
  renderLatestAuctionExplanation(latest);

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

function renderDonutChart(slices, { centerTop, centerBottom }) {
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const circles = slices.map((slice) => {
    const length = Math.max(0, (slice.percent / 100) * circumference);
    const dash = `${length.toFixed(2)} ${(circumference - length).toFixed(2)}`;
    const circle = `
      <circle cx="50" cy="50" r="${radius}" fill="none" stroke="${slice.color}" stroke-width="13"
        stroke-dasharray="${dash}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 50 50)">
        <title>${escapeSvg(debtFamilyLabels[slice.family])}: ${escapeSvg(formatPercent(slice.percent))}</title>
      </circle>
    `;
    offset += length;
    return circle;
  }).join("");

  return `
    <svg class="donut-chart" viewBox="0 0 100 100" role="img" aria-label="Composición adjudicada por tipo de deuda">
      <circle cx="50" cy="50" r="${radius}" fill="none" stroke="currentColor" stroke-width="13" opacity="0.1"></circle>
      ${circles}
      <text x="50" y="47" text-anchor="middle" class="donut-center-top">${escapeSvg(centerTop)}</text>
      <text x="50" y="58" text-anchor="middle" class="donut-center-bottom">${escapeSvg(centerBottom)}</text>
    </svg>
  `;
}

function renderLatestAuctionExplanation(latest) {
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

  container.innerHTML = `
    <div class="panel-title">
      <span>Explicación simple de la última licitación</span>
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

  const mepRows = getTopRows(cleanDollarRows(state.live.mep, "mark", "v_ars"), "v_ars", 10);
  const cclRows = getTopRows(cleanDollarRows(state.live.ccl, "CCL_mark", "ars_volume"), "ars_volume", 10);

  renderVerticalBarChart($("#mepChart"), mepRows, {
    labelKey: "ticker",
    valueKey: "mark",
    formatter: formatPrice,
    color: () => "#007f79"
  });

  renderVerticalBarChart($("#cclChart"), cclRows, {
    labelKey: "ticker_ar",
    valueKey: "CCL_mark",
    formatter: formatPrice,
    color: () => "#2f6fb2"
  });
}

function renderOfficialDollarCards() {
  const quotes = state.dollarQuotes?.quotes;
  const rows = [
    {
      key: "bancoNacion",
      title: "Dólar Banco Nación",
      icon: "landmark",
      note: "Referencia oficial minorista. Sirve como piso institucional para comparar contra los demás dólares."
    },
    {
      key: "blue",
      title: "Dólar blue",
      icon: "wallet-cards",
      note: "Cotización informal relevada por DolarHoy. Es útil como termómetro social, no como precio de mercado regulado."
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
      source: series.inflation?.sourceUrl
    },
    {
      title: "Balanza comercial",
      value: formatUsdMillions(trade?.value),
      detail: trade ? `${trade.value >= 0 ? "Superávit" : "Déficit"} en ${formatMonth(trade.date)}.` : "Sin dato reciente.",
      source: series.tradeBalance?.sourceUrl
    },
    {
      title: "Pobreza",
      value: formatPercent(poverty?.value),
      detail: poverty ? `Personas bajo línea de pobreza, ${formatSemester(poverty.date)}.` : "Sin dato reciente.",
      source: series.poverty?.sourceUrl
    },
    {
      title: "Indigencia",
      value: formatPercent(indigence?.value),
      detail: indigence ? `Personas bajo línea de indigencia, ${formatSemester(indigence.date)}.` : "Dato de informe INDEC.",
      source: indigence?.sourceUrl
    },
    {
      title: "Patentamientos",
      value: cars?.value ? numberFormat.format(cars.value) : "--",
      detail: cars ? `Autos 0 km en ${formatMonth(cars.date)}; ${formatSignedPercentText(cars.change)} interanual.` : "Sin dato reciente.",
      source: cars?.sourceUrl
    },
    {
      title: "Confianza consumidor",
      value: confidence?.value ? round(confidence.value, 2) : "--",
      detail: confidence ? `ICC Di Tella: ${formatSignedPercentText(confidence.change)} mensual.` : "Sin dato reciente.",
      source: confidence?.sourceUrl
    },
    {
      title: "Resultado primario",
      value: formatArsMillions(primary?.value),
      detail: primary ? `${primary.value >= 0 ? "Superávit" : "Déficit"} antes de intereses en ${formatMonth(primary.date)}.` : "Sin dato reciente.",
      source: series.primaryResult?.sourceUrl
    },
    {
      title: "Resultado financiero",
      value: formatArsMillions(financial?.value),
      detail: financial ? `${financial.value >= 0 ? "Superávit" : "Déficit"} después de intereses en ${formatMonth(financial.date)}.` : "Sin dato reciente.",
      source: series.financialResult?.sourceUrl
    }
  ];

  $("#macroCards").innerHTML = cards.map((card) => `
    <article class="macro-card">
      <small>${escapeHtml(card.title)}</small>
      <strong>${escapeHtml(card.value)}</strong>
      <p>${escapeHtml(card.detail)}</p>
      ${card.source ? `<a class="source-link" href="${escapeHtml(card.source)}" target="_blank" rel="noreferrer">Fuente</a>` : ""}
    </article>
  `).join("");

  renderInflationChart(series.inflation?.rows || []);
  renderSignedVerticalBarChart($("#tradeChart"), (series.tradeBalance?.rows || []).slice(-18), {
    valueKey: "value",
    formatter: (value) => `${round(value, 0)} M`,
    labelFormatter: (row) => shortDate(row.date)
  });
  renderFiscalChart(series.primaryResult?.rows || [], series.financialResult?.rows || []);
  renderMacroExplain(macro);
}

function renderInflationChart(rows) {
  const cleanRows = rows.filter((row) => Number.isFinite(Number(row.value))).slice(-36);
  renderLineChart($("#inflationChart"), cleanRows, {
    xKey: "date",
    yKey: "value",
    formatter: formatPercent,
    color: "#f2b84b",
    label: "IPC mensual"
  });

  const last = cleanRows.at(-1);
  const previous = cleanRows.at(-2);
  if (!last || !previous) return;
  const direction = last.value > previous.value ? "aceleró" : last.value < previous.value ? "desaceleró" : "quedó igual";
  $("#inflationNarrative").textContent = `El último IPC fue ${formatPercent(last.value)} en ${formatMonth(last.date)} y ${direction} frente al mes anterior (${formatPercent(previous.value)}).`;
}

function renderSignedVerticalBarChart(container, data, options) {
  const rows = data.filter((row) => Number.isFinite(Number(row[options.valueKey])));
  if (!rows.length) {
    container.innerHTML = `<div class="empty-state">No hay datos suficientes para graficar.</div>`;
    return;
  }

  const width = 760;
  const height = 290;
  const margin = { top: 24, right: 18, bottom: 54, left: 56 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maxAbs = Math.max(...rows.map((row) => Math.abs(Number(row[options.valueKey]))), 1) * 1.18;
  const zeroY = margin.top + plotHeight / 2;
  const step = plotWidth / rows.length;
  const barWidth = Math.max(8, step * 0.58);

  const bars = rows.map((row, index) => {
    const value = Number(row[options.valueKey]);
    const heightValue = Math.max(2, (Math.abs(value) / maxAbs) * (plotHeight / 2 - 8));
    const x = margin.left + index * step + (step - barWidth) / 2;
    const y = value >= 0 ? zeroY - heightValue : zeroY;
    const label = options.labelFormatter ? options.labelFormatter(row) : row.date;
    return `
      <rect x="${x}" y="${y}" width="${barWidth}" height="${heightValue}" rx="5" fill="${value >= 0 ? "#4ad080" : "#ff6b6b"}">
        <title>${escapeSvg(options.formatter(value))}</title>
      </rect>
      <text x="${x + barWidth / 2}" y="${height - 28}" text-anchor="middle" class="chart-label">${escapeSvg(shortText(label, 8))}</text>
    `;
  }).join("");

  container.innerHTML = `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Balanza comercial mensual">
      ${gridLines(width, height, margin)}
      <line x1="${margin.left}" x2="${width - margin.right}" y1="${zeroY}" y2="${zeroY}" class="axis-line"></line>
      ${bars}
    </svg>
  `;
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

  renderGroupedBarChart($("#fiscalChart"), rows, {
    series: [
      { key: "primary", label: "Primario", color: "#4ad080" },
      { key: "financial", label: "Financiero", color: "#4aa3ff" }
    ],
    formatter: (value) => `${round(value / 1000000, 2)} B`,
    labelFormatter: shortDate
  });
}

function renderGroupedBarChart(container, data, options) {
  const rows = data.filter((row) => options.series.some((serie) => Number.isFinite(Number(row[serie.key]))));
  if (!rows.length) {
    container.innerHTML = `<div class="empty-state">No hay datos suficientes para graficar.</div>`;
    return;
  }

  const width = 760;
  const height = 290;
  const margin = { top: 26, right: 18, bottom: 56, left: 58 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const values = rows.flatMap((row) => options.series.map((serie) => Number(row[serie.key])).filter(Number.isFinite));
  const maxAbs = Math.max(...values.map((value) => Math.abs(value)), 1) * 1.18;
  const zeroY = margin.top + plotHeight / 2;
  const groupStep = plotWidth / rows.length;
  const barWidth = Math.max(5, groupStep / (options.series.length + 1.8));

  const bars = rows.map((row, index) => {
    const groupX = margin.left + index * groupStep + groupStep / 2;
    const label = options.labelFormatter ? options.labelFormatter(row.date) : row.date;
    const seriesBars = options.series.map((serie, serieIndex) => {
      const value = Number(row[serie.key]);
      if (!Number.isFinite(value)) return "";
      const heightValue = Math.max(2, (Math.abs(value) / maxAbs) * (plotHeight / 2 - 8));
      const x = groupX + (serieIndex - (options.series.length - 1) / 2) * (barWidth + 3) - barWidth / 2;
      const y = value >= 0 ? zeroY - heightValue : zeroY;
      return `
        <rect x="${x}" y="${y}" width="${barWidth}" height="${heightValue}" rx="4" fill="${serie.color}">
          <title>${escapeSvg(serie.label)}: ${escapeSvg(options.formatter(value))}</title>
        </rect>
      `;
    }).join("");
    return `
      ${seriesBars}
      <text x="${groupX}" y="${height - 28}" text-anchor="middle" class="chart-label">${escapeSvg(shortText(label, 7))}</text>
    `;
  }).join("");

  const legend = options.series.map((serie, index) => `
    <rect x="${margin.left + index * 112}" y="9" width="10" height="10" rx="3" fill="${serie.color}"></rect>
    <text x="${margin.left + 16 + index * 112}" y="18" class="chart-label">${escapeSvg(serie.label)}</text>
  `).join("");

  container.innerHTML = `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Resultado primario y financiero">
      ${gridLines(width, height, margin)}
      <line x1="${margin.left}" x2="${width - margin.right}" y1="${zeroY}" y2="${zeroY}" class="axis-line"></line>
      ${legend}
      ${bars}
    </svg>
  `;
}

function renderMacroExplain(macro) {
  const indigence = macro.snapshots?.indigence;
  $("#macroExplain").innerHTML = `
    <article>
      <strong>Inflación</strong>
      <p>Si sube, el peso compra menos. En el gráfico importa la dirección: varios meses de baja alivian ingresos y tasas; una aceleración vuelve más defensiva la lectura.</p>
    </article>
    <article>
      <strong>Pobreza e indigencia</strong>
      <p>Pobreza compara ingresos contra una canasta total; indigencia contra una canasta alimentaria. ${escapeHtml(indigence?.note || "")}</p>
    </article>
    <article>
      <strong>Balanza comercial</strong>
      <p>Superávit es aire de dólares comerciales. Déficit no siempre es malo, pero exige financiamiento o reservas para pagarlo.</p>
    </article>
    <article>
      <strong>Resultado fiscal</strong>
      <p>El primario dice si el Estado cubre sus gastos antes de intereses. El financiero muestra el resultado final después de pagar intereses de deuda.</p>
    </article>
  `;
}

function renderMarketSection() {
  const rows = normalizeRows(state.live[state.selectedMarket]);
  $("#moversTitle").textContent = `${marketLabels[state.selectedMarket]}: cambios diarios`;

  const movers = rows
    .filter((row) => Number.isFinite(Number(row.pct_change)))
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

function renderHistory() {
  const rows = state.historyRows
    .filter((row) => Number.isFinite(Number(row.c)) && Number(row.c) > 0 && String(row.date || "").length)
    .slice(-120);

  if (!rows.length) {
    $("#priceChart").innerHTML = `<div class="empty-state">No hay histórico disponible para este activo.</div>`;
    $("#volumeChart").innerHTML = "";
    return;
  }

  renderLineChart($("#priceChart"), rows, {
    xKey: "date",
    yKey: "c",
    formatter: formatCompactNumber,
    color: "#007f79",
    label: "Precio de cierre"
  });

  renderVerticalBarChart($("#volumeChart"), rows.slice(-50), {
    labelKey: "date",
    valueKey: "v",
    formatter: formatCompactNumber,
    color: () => "#d89a00",
    labelFormatter: shortDate
  });

  const first = rows[0];
  const last = rows[rows.length - 1];
  const change = ((Number(last.c) / Number(first.c)) - 1) * 100;
  const latestVolatility = Number(last.sa);
  const ticker = $("#historySelect").selectedOptions[0].textContent.split(",")[0];
  const movement = change >= 0 ? "subió" : "bajó";
  $("#historyNarrative").textContent = `${ticker} ${movement} ${formatPercent(Math.abs(change))} en la ventana mostrada. La volatilidad anualizada reciente ronda ${formatPercent(latestVolatility * 100)}.`;
}

function renderRisk() {
  const risk = Array.isArray(state.risk) ? state.risk[0] : state.risk;
  const cards = [
    {
      label: "Volatilidad esperada",
      value: formatPercent(Number(risk?.iv_s_term || 0) * 100),
      note: "Lo que el mercado de opciones espera para el corto plazo."
    },
    {
      label: "Volatilidad histórica",
      value: formatPercent(Number(risk?.hv_s_term || 0) * 100),
      note: "Lo que efectivamente se movió el activo recientemente."
    },
    {
      label: "Percentil histórico",
      value: formatPercent(Number(risk?.hv_s_term_percentile || 0) * 100),
      note: "Qué tan alta está la volatilidad frente a su propia historia."
    },
    {
      label: "Prima opciones",
      value: round(Number(risk?.iv_hv_s_ratio || 0), 2),
      note: "Mayor a 1 implica opciones caras frente al movimiento pasado."
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
      title: "BYMA Market Data",
      text: "Es la fuente oficial de datos de mercado de BYMA. Puede entregar precios en tiempo real, con demora de 20 minutos o al cierre del día, según el plan contratado."
    },
    {
      title: "Instrument master",
      text: "Es el diccionario de instrumentos: ticker, tipo de activo, moneda, segmento y parámetros de negociación. Sirve para que una persona entienda qué está mirando antes de ver el precio."
    }
  ];

  $("#guideGrid").innerHTML = items.map((item) => `
    <details>
      <summary>${escapeHtml(item.title)}</summary>
      <p>${escapeHtml(item.text)}</p>
    </details>
  `).join("");
}

function renderBymaSection() {
  const catalog = [
    {
      name: "Snapshot",
      scope: "Precios en tiempo real",
      detail: "Renta variable, renta fija, futuros, opciones, cauciones, préstamos, índices e intradiarios.",
      value: "Para tablero profesional en vivo"
    },
    {
      name: "Delay",
      scope: "Precios con 20 minutos",
      detail: "La misma cobertura de mercado que Snapshot, pero con latencia. Útil para una web pública sin necesidad de real time.",
      value: "Para lectores generales"
    },
    {
      name: "EOD",
      scope: "Cierres del día",
      detail: "Precios de cierre al finalizar la rueda. Ideal para históricos, rankings diarios y análisis sin ruido intradiario.",
      value: "Para tendencias limpias"
    },
    {
      name: "Índices",
      scope: "Índices BYMA",
      detail: "Incluye datos de tipo de cambio, renta fija y cauciones, con valores históricos e intradiarios según plan.",
      value: "Para contexto macro"
    },
    {
      name: "Instruments",
      scope: "Maestro de instrumentos",
      detail: "Características de acciones, CEDEARs, bonos, futuros, opciones, cauciones, préstamos y ticks de precio.",
      value: "Para explicar cada ticker"
    },
    {
      name: "News",
      scope: "Noticias relevantes",
      detail: "Hechos relevantes, balances, avisos de BYMA, boletines y prospectos.",
      value: "Para alertas y contexto"
    },
    {
      name: "Primarias Placements",
      scope: "Mercado primario",
      detail: "Colocaciones actuales e históricas con emisor, colocador, fechas, condiciones y documentación.",
      value: "Para licitaciones privadas"
    },
    {
      name: "Índice Dólar BYMA",
      scope: "Dólar BYMA y CCL",
      detail: "Valor del índice de dólar BYMA y CCL, útil para comparar contra MEP/CCL calculados por Data912.",
      value: "Para validación oficial"
    }
  ];

  const plans = [
    {
      audience: "Miembros",
      rows: [
        ["Snapshot", "USD 400/mes", "237.600 solicitudes/mes"],
        ["Delay", "USD 100/mes", "79.200 solicitudes/mes"],
        ["EOD", "Sin costo", "1.000 solicitudes/mes"],
        ["Índices", "Sin costo", "EOD + intraday"],
        ["News", "Sin costo", "1.000 solicitudes/mes"],
        ["Instruments", "Sin costo", "1.000 solicitudes/mes"]
      ]
    },
    {
      audience: "No miembros",
      rows: [
        ["Snapshot", "USD 1.000/mes", "237.600 solicitudes/mes"],
        ["Delay", "USD 500/mes", "79.200 solicitudes/mes"],
        ["EOD", "USD 50/mes", "1.000 solicitudes/mes"],
        ["Índices", "USD 100/mes", "EOD + intraday"],
        ["News", "USD 50/mes", "1.000 solicitudes/mes"],
        ["Instruments", "USD 200/mes", "1.000 solicitudes/mes"]
      ]
    }
  ];

  const flow = [
    {
      title: "1. Elegir producto",
      text: "Para esta web empezaría por EOD, Instruments, News, Índices y Primarias Placements. Snapshot queda para tiempo real profesional."
    },
    {
      title: "2. Pedir acceso",
      text: "BYMA indica que Market Data se solicita vía contrato/disclaimer DMA y contacto con marketdata@byma.com.ar."
    },
    {
      title: "3. Guardar credenciales",
      text: "El servidor local puede leer un token desde variables de entorno y llamar a BYMA desde backend, sin exponer claves al navegador."
    },
    {
      title: "4. Normalizar datos",
      text: "Mapear símbolo, moneda, segmento, último precio, volumen, horario, tipo de instrumento y fuente. Así Data912 y BYMA conviven."
    },
    {
      title: "5. Mostrar trazabilidad",
      text: "Cada gráfico debería mostrar si viene de Data912, BYMA Delay, BYMA EOD o licitaciones oficiales para que el usuario confíe en el dato."
    }
  ];

  $("#bymaCatalog").innerHTML = catalog.map((item) => `
    <article class="api-card">
      <div>
        <strong>${escapeHtml(item.name)}</strong>
        <span>${escapeHtml(item.scope)}</span>
      </div>
      <p>${escapeHtml(item.detail)}</p>
      <small>${escapeHtml(item.value)}</small>
    </article>
  `).join("");

  $("#bymaPlans").innerHTML = plans.map((plan) => `
    <article class="plan-card">
      <h3>${escapeHtml(plan.audience)}</h3>
      ${plan.rows.map((row) => `
        <div class="plan-row">
          <strong>${escapeHtml(row[0])}</strong>
          <span>${escapeHtml(row[1])}</span>
          <small>${escapeHtml(row[2])}</small>
        </div>
      `).join("")}
    </article>
  `).join("");

  $("#bymaFlow").innerHTML = flow.map((item) => `
    <article class="flow-step">
      <strong>${escapeHtml(item.title)}</strong>
      <p>${escapeHtml(item.text)}</p>
    </article>
  `).join("");
}

function renderTable(container, rows, columns) {
  if (!rows.length) {
    container.innerHTML = `<div class="empty-state">No hay datos para mostrar.</div>`;
    return;
  }

  const headers = columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("");
  const body = rows.map((row) => `
    <tr>${columns.map((column) => `<td>${column.value(row)}</td>`).join("")}</tr>
  `).join("");

  container.innerHTML = `<table><thead><tr>${headers}</tr></thead><tbody>${body}</tbody></table>`;
}

function renderVerticalBarChart(container, data, options) {
  const rows = data.filter((row) => Number.isFinite(Number(row[options.valueKey]))).slice(0, 18);
  if (!rows.length) {
    container.innerHTML = `<div class="empty-state">No hay datos suficientes para graficar.</div>`;
    return;
  }

  const width = 760;
  const height = 290;
  const margin = { top: 22, right: 18, bottom: 54, left: 54 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const values = rows.map((row) => Number(row[options.valueKey]));
  const maxValue = Math.max(...values, options.targetLine || 0) * 1.16 || 1;
  const step = plotWidth / rows.length;
  const barWidth = Math.max(8, step * 0.58);

  const bars = rows.map((row, index) => {
    const value = Number(row[options.valueKey]);
    const barHeight = (value / maxValue) * plotHeight;
    const x = margin.left + index * step + (step - barWidth) / 2;
    const y = margin.top + plotHeight - barHeight;
    const label = options.labelFormatter ? options.labelFormatter(row[options.labelKey]) : row[options.labelKey];
    const color = typeof options.color === "function" ? options.color(row) : options.color;
    return `
      <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="5" fill="${color || "#007f79"}"></rect>
      <text x="${x + barWidth / 2}" y="${height - 28}" text-anchor="middle" class="chart-label">${escapeSvg(shortText(label, 9))}</text>
      <text x="${x + barWidth / 2}" y="${Math.max(14, y - 7)}" text-anchor="middle" class="chart-label">${escapeSvg(options.formatter(value))}</text>
    `;
  }).join("");

  const target = options.targetLine
    ? (() => {
        const y = margin.top + plotHeight - (options.targetLine / maxValue) * plotHeight;
        return `
          <line x1="${margin.left}" x2="${width - margin.right}" y1="${y}" y2="${y}" stroke="#bf3b3b" stroke-dasharray="5 5"></line>
          <text x="${width - margin.right}" y="${y - 6}" text-anchor="end" class="chart-label">100%</text>
        `;
      })()
    : "";

  container.innerHTML = `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Gráfico de barras">
      ${gridLines(width, height, margin)}
      ${target}
      ${bars}
    </svg>
  `;
}

function renderHorizontalBarChart(container, data, options) {
  const rows = data.filter((row) => Number.isFinite(Number(row[options.valueKey]))).slice(0, 14);
  if (!rows.length) {
    container.innerHTML = `<div class="empty-state">No hay datos suficientes para graficar.</div>`;
    return;
  }

  const width = 760;
  const rowHeight = 26;
  const margin = { top: 18, right: 70, bottom: 18, left: 92 };
  const height = margin.top + margin.bottom + rows.length * rowHeight;
  const plotWidth = width - margin.left - margin.right;
  const zeroX = margin.left + plotWidth / 2;
  const maxAbs = Math.max(...rows.map((row) => Math.abs(Number(row[options.valueKey]))), 1);

  const bars = rows.map((row, index) => {
    const value = Number(row[options.valueKey]);
    const y = margin.top + index * rowHeight + 5;
    const length = Math.max(2, (Math.abs(value) / maxAbs) * (plotWidth / 2 - 8));
    const x = value >= 0 ? zeroX : zeroX - length;
    const color = value >= 0 ? "#18825c" : "#bf3b3b";
    const textX = value >= 0 ? zeroX + length + 6 : zeroX - length - 6;
    const anchor = value >= 0 ? "start" : "end";
    return `
      <text x="${margin.left - 10}" y="${y + 12}" text-anchor="end" class="chart-label">${escapeSvg(shortText(row[options.labelKey], 10))}</text>
      <rect x="${x}" y="${y}" width="${length}" height="16" rx="5" fill="${color}"></rect>
      <text x="${textX}" y="${y + 12}" text-anchor="${anchor}" class="chart-label">${escapeSvg(options.formatter(value))}</text>
    `;
  }).join("");

  container.innerHTML = `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Gráfico de cambios positivos y negativos">
      <line x1="${zeroX}" x2="${zeroX}" y1="${margin.top}" y2="${height - margin.bottom}" class="axis-line"></line>
      ${bars}
    </svg>
  `;
}

function renderLineChart(container, data, options) {
  const rows = data.filter((row) => Number.isFinite(Number(row[options.yKey])));
  if (rows.length < 2) {
    container.innerHTML = `<div class="empty-state">No hay suficientes puntos para graficar.</div>`;
    return;
  }

  const width = 760;
  const height = 290;
  const margin = { top: 22, right: 18, bottom: 46, left: 64 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const values = rows.map((row) => Number(row[options.yKey]));
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue || 1;
  const points = rows.map((row, index) => {
    const x = margin.left + (index / (rows.length - 1)) * plotWidth;
    const y = margin.top + plotHeight - ((Number(row[options.yKey]) - minValue) / range) * plotHeight;
    return [x, y, row];
  });
  const path = points.map(([x, y], index) => `${index ? "L" : "M"} ${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  const area = `${path} L ${margin.left + plotWidth} ${margin.top + plotHeight} L ${margin.left} ${margin.top + plotHeight} Z`;
  const first = rows[0];
  const last = rows[rows.length - 1];

  container.innerHTML = `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(options.label)}">
      ${gridLines(width, height, margin)}
      <path d="${area}" fill="${options.color}" opacity="0.12"></path>
      <path d="${path}" fill="none" stroke="${options.color}" stroke-width="3"></path>
      <circle cx="${points.at(-1)[0]}" cy="${points.at(-1)[1]}" r="5" fill="${options.color}"></circle>
      <text x="${margin.left}" y="${height - 18}" class="chart-label">${escapeSvg(shortDate(first[options.xKey]))}</text>
      <text x="${width - margin.right}" y="${height - 18}" text-anchor="end" class="chart-label">${escapeSvg(shortDate(last[options.xKey]))}</text>
      <text x="${margin.left}" y="16" class="chart-label">${escapeSvg(options.label)}: ${escapeSvg(options.formatter(Number(last[options.yKey])))}</text>
    </svg>
  `;
}

function gridLines(width, height, margin) {
  const plotHeight = height - margin.top - margin.bottom;
  return [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const y = margin.top + plotHeight * ratio;
    return `<line x1="${margin.left}" x2="${width - margin.right}" y1="${y}" y2="${y}" class="grid-line"></line>`;
  }).join("");
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

function signedPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return `<span class="neutral">--</span>`;
  const css = numeric > 0 ? "positive" : numeric < 0 ? "negative" : "neutral";
  const sign = numeric > 0 ? "+" : "";
  return `<span class="${css}">${sign}${round(numeric, 2)}%</span>`;
}

function formatPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "--";
  return `${round(numeric, Math.abs(numeric) >= 10 ? 1 : 2)}%`;
}

function formatPrice(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "--";
  return `$${numberFormat.format(Math.round(numeric))}`;
}

function formatSignedPrice(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "--";
  const sign = numeric > 0 ? "+" : "";
  return `${sign}$${numberFormat.format(Math.round(numeric))}`;
}

function formatSignedPercentText(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "--";
  const sign = numeric > 0 ? "+" : "";
  return `${sign}${formatPercent(numeric)}`;
}

function formatMarketPrice(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "--";
  if (Math.abs(numeric) < 10) return numeric.toLocaleString("es-AR", { maximumFractionDigits: 4 });
  if (Math.abs(numeric) < 1000) return numeric.toLocaleString("es-AR", { maximumFractionDigits: 2 });
  return numberFormat.format(Math.round(numeric));
}

function formatAuctionMoney(valueInMillions) {
  const numeric = Number(valueInMillions);
  if (!Number.isFinite(numeric)) return "--";
  if (numeric >= 1000000) return `$${round(numeric / 1000000, 2)} billones`;
  if (numeric >= 1000) return `$${round(numeric / 1000, 1)} mil millones`;
  return `$${numberFormat.format(Math.round(numeric))} millones`;
}

function formatUsdMillions(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "--";
  const sign = numeric < 0 ? "-" : "";
  return `${sign}US$${numberFormat.format(Math.abs(Math.round(numeric)))} M`;
}

function formatArsMillions(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "--";
  const sign = numeric < 0 ? "-" : "";
  const abs = Math.abs(numeric);
  if (abs >= 1000000) return `${sign}$${round(abs / 1000000, 2)} B`;
  return `${sign}$${numberFormat.format(Math.round(abs))} M`;
}

function formatCompactNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "--";
  return compactFormat.format(numeric);
}

function formatDate(value) {
  if (!value) return "--";
  return dateFormat.format(new Date(`${value}T00:00:00Z`)).replace(".", "");
}

function shortDate(value) {
  if (!value) return "";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short", timeZone: "UTC" }).format(date).replace(".", "");
}

function formatMonth(value) {
  if (!value) return "--";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

function formatSemester(value) {
  if (!value) return "--";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return String(value);
  const month = date.getUTCMonth() + 1;
  const semester = month <= 6 ? "1er semestre" : "2do semestre";
  return `${semester} ${date.getUTCFullYear()}`;
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

function shortText(value, length) {
  const text = String(value || "");
  return text.length > length ? `${text.slice(0, Math.max(1, length - 1))}…` : text;
}

function round(value, digits = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "--";
  return numeric.toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeSvg(value) {
  return escapeHtml(value);
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}
