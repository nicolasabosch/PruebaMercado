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
  window.addEventListener("hashchange", applyRoute);

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

function applyRoute() {
  const validPages = new Set($$(".page-section").map((section) => section.id));
  const page = validPages.has(location.hash.slice(1)) ? location.hash.slice(1) : "inicio";

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

async function loadAllData() {
  setStatus("Consultando Data912 y licitaciones...", "loading");
  state.errors = [];
  setRefreshLoading(true);

  // Cada bloque resuelve y pinta su propia sección apenas llega el dato, así la
  // página deja de quedar bloqueada esperando a la fuente más lenta (el censo).
  const tasks = [
    (async () => {
      await Promise.allSettled([
        loadLive("mep"),
        loadLive("ccl"),
        loadLive("arg_stocks"),
        loadLive("arg_cedears"),
        loadLive("arg_bonds"),
        loadLive("arg_notes")
      ]);
      renderDashboard();
      renderMarketSection();
      renderExplorer();
    })(),
    loadSection(fetchAuctions, "auctions", () => {
      renderAuctions();
      renderDashboard();
    }),
    loadSection(fetchDollarQuotes, "dollarQuotes", () => {
      renderDollars();
      renderDashboard();
    }),
    loadSection(fetchMacro, "macro", renderMacro),
    loadSection(fetchCensus, "census", renderCensus),
    loadSection(() => fetchData912("eod/volatilities/GGAL"), "risk", renderRisk)
  ];

  await Promise.allSettled(tasks);

  if (state.errors.length) {
    setStatus("Listo con algunas fuentes caídas", "error");
  } else {
    setStatus("Datos actualizados", "ready");
  }
  $("#lastUpdated").textContent = timeFormat.format(new Date());
  setRefreshLoading(false);
  refreshIcons();
}

async function loadLive(key) {
  try {
    state.live[key] = normalizeRows(await fetchData912(`live/${key}`));
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
  if (state.live[key]?.length) return;
  try {
    state.live[key] = normalizeRows(await fetchData912(`live/${key}`));
  } catch (error) {
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

function renderDonutChart(slices, { centerTop, centerBottom }) {
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const circles = slices.map((slice) => {
    const length = Math.max(0, (slice.percent / 100) * circumference);
    const dash = `${length.toFixed(2)} ${(circumference - length).toFixed(2)}`;
    const tooltip = `<strong>${escapeHtml(debtFamilyLabels[slice.family] || slice.family)}</strong><span>${escapeHtml(formatPercent(slice.percent))}</span><span>${escapeHtml(formatAuctionMoney(slice.value))}</span>`;
    const circle = `
      <circle class="chart-hotspot donut-seg" ${tooltipAttribute(tooltip)} cx="50" cy="50" r="${radius}" fill="none" stroke="${slice.color}" stroke-width="13"
        stroke-dasharray="${dash}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 50 50)"></circle>
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
      source: indigence?.sourceUrl
    },
    {
      title: "Patentamientos",
      value: cars?.value ? numberFormat.format(cars.value) : "--",
      detail: cars ? `Autos 0 km en ${formatMonth(cars.date)}; ${formatSignedPercentText(cars.monthChange)} mensual y ${formatSignedPercentText(cars.change)} interanual.` : "Sin dato reciente.",
      explain: cars ? `Es la cantidad de autos nuevos inscriptos. Contra febrero de 2026 (${numberFormat.format(cars.previousValue)} unidades), marzo mostró una suba mensual de ${formatSignedPercentText(cars.monthChange)}.` : "Mide cuántos autos 0 km se registran: sirve como termómetro de consumo durable.",
      source: cars?.sourceUrl
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

  $("#censusNarrative").innerHTML = `
    <article>
      <strong>Como cambio la forma</strong>
      <p>La base se achico: hay menos peso relativo de chicos de 0 a 14 anos que en 2010. Eso suele pasar cuando bajan los nacimientos y la poblacion envejece.</p>
    </article>
    <article>
      <strong>Mas peso en edades altas</strong>
      <p>La parte de 65 anos o mas gano participacion. En una lectura simple, Argentina tiene una piramide menos triangular y mas parecida a una columna en las edades medias.</p>
    </article>
    <article>
      <strong>Diferencia por sexo en edades altas</strong>
      <p>En ambos censos se ve una mayor presencia femenina en los tramos mas altos, algo habitual cuando la esperanza de vida de las mujeres supera a la de los varones.</p>
    </article>
    <article>
      <strong>Fuente y alcance</strong>
      <p>El ultimo censo sale del cuadro oficial de INDEC en Redatam y la comparacion 2010 del cuadro nacional del censo anterior. Sirve para ver la estructura de la poblacion, no para sacar conclusiones financieras.</p>
    </article>
  `;
}

function renderPopulationPyramid(rows, year, color) {
  const cleanRows = [...rows].sort((a, b) => ageGroupStart(a.ageGroup) - ageGroupStart(b.ageGroup));
  const width = 520;
  const rowHeight = 16;
  const gap = 4;
  const margin = { top: 42, right: 58, bottom: 18, left: 58 };
  const centerGap = 20;
  const height = margin.top + margin.bottom + cleanRows.length * (rowHeight + gap);
  const plotWidth = width - margin.left - margin.right - centerGap;
  const halfWidth = plotWidth / 2;
  const centerX = margin.left + halfWidth;
  const maxValue = Math.max(...cleanRows.flatMap((row) => [Number(row.male || 0), Number(row.female || 0)]), 1);
  const ticks = [maxValue / 2, maxValue];

  const bars = cleanRows.map((row, index) => {
    const y = margin.top + index * (rowHeight + gap);
    const maleWidth = (Number(row.male || 0) / maxValue) * (halfWidth - 12);
    const femaleWidth = (Number(row.female || 0) / maxValue) * (halfWidth - 12);
    const maleTooltip = `<strong>${escapeHtml(year)} · ${escapeHtml(row.ageGroup)}</strong><span>Varones: ${escapeHtml(numberFormat.format(row.male))}</span><span>Total grupo: ${escapeHtml(numberFormat.format(row.total))}</span>`;
    const femaleTooltip = `<strong>${escapeHtml(year)} · ${escapeHtml(row.ageGroup)}</strong><span>Mujeres: ${escapeHtml(numberFormat.format(row.female))}</span><span>Total grupo: ${escapeHtml(numberFormat.format(row.total))}</span>`;
    return `
      <text x="${centerX - 10}" y="${y + 11.5}" text-anchor="end" class="chart-label">${escapeSvg(row.ageGroup)}</text>
      <rect class="chart-hotspot" ${tooltipAttribute(maleTooltip)} x="${centerX - maleWidth}" y="${y}" width="${maleWidth}" height="${rowHeight}" rx="4" fill="${color}" opacity="0.88"></rect>
      <rect class="chart-hotspot" ${tooltipAttribute(femaleTooltip)} x="${centerX + centerGap}" y="${y}" width="${femaleWidth}" height="${rowHeight}" rx="4" fill="${color}" opacity="0.48"></rect>
    `;
  }).join("");

  const tickLines = ticks.map((tick) => {
    const span = (tick / maxValue) * (halfWidth - 12);
    return `
      <line x1="${centerX - span}" x2="${centerX - span}" y1="${margin.top - 8}" y2="${height - margin.bottom}" class="grid-line"></line>
      <line x1="${centerX + centerGap + span}" x2="${centerX + centerGap + span}" y1="${margin.top - 8}" y2="${height - margin.bottom}" class="grid-line"></line>
      <text x="${centerX - span}" y="${margin.top - 16}" text-anchor="middle" class="chart-label">${escapeSvg(formatPopulationTick(tick))}</text>
      <text x="${centerX + centerGap + span}" y="${margin.top - 16}" text-anchor="middle" class="chart-label">${escapeSvg(formatPopulationTick(tick))}</text>
    `;
  }).join("");

  return `
    <div class="pyramid-wrap">
      <svg class="chart-svg pyramid-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Piramide poblacional ${escapeHtml(year)}">
        <text x="${centerX - halfWidth / 2}" y="18" text-anchor="middle" class="chart-label">Varones</text>
        <text x="${centerX + centerGap + halfWidth / 2}" y="18" text-anchor="middle" class="chart-label">Mujeres</text>
        <line x1="${centerX}" x2="${centerX}" y1="${margin.top - 8}" y2="${height - margin.bottom}" class="axis-line"></line>
        <line x1="${centerX + centerGap}" x2="${centerX + centerGap}" y1="${margin.top - 8}" y2="${height - margin.bottom}" class="axis-line"></line>
        ${tickLines}
        ${bars}
      </svg>
      <p class="chart-help visible">Izquierda: varones. Derecha: mujeres. Las barras mas anchas muestran grupos de edad con mas peso dentro de la poblacion.</p>
    </div>
  `;
}

function renderPopulationPyramidOverlay(previousRows, currentRows, previousYear, currentYear) {
  const previousByAge = new Map(previousRows.map((row) => [row.ageGroup, row]));
  const currentByAge = new Map(currentRows.map((row) => [row.ageGroup, row]));
  const ageGroups = [...new Set([...previousByAge.keys(), ...currentByAge.keys()])]
    .sort((a, b) => ageGroupStart(a) - ageGroupStart(b));
  const rows = ageGroups.map((ageGroup) => ({
    ageGroup,
    previous: previousByAge.get(ageGroup) || { male: 0, female: 0, total: 0 },
    current: currentByAge.get(ageGroup) || { male: 0, female: 0, total: 0 }
  }));

  const width = 760;
  const rowHeight = 16;
  const gap = 5;
  const margin = { top: 50, right: 78, bottom: 28, left: 78 };
  const centerGap = 26;
  const height = margin.top + margin.bottom + rows.length * (rowHeight + gap);
  const plotWidth = width - margin.left - margin.right - centerGap;
  const halfWidth = plotWidth / 2;
  const centerX = margin.left + halfWidth;
  const maxValue = Math.max(...rows.flatMap((row) => [
    Number(row.previous.male || 0),
    Number(row.previous.female || 0),
    Number(row.current.male || 0),
    Number(row.current.female || 0)
  ]), 1);
  const scale = (value) => (Number(value || 0) / maxValue) * (halfWidth - 14);

  const bars = rows.map((row, index) => {
    const y = margin.top + index * (rowHeight + gap);
    const prevMaleWidth = scale(row.previous.male);
    const prevFemaleWidth = scale(row.previous.female);
    const currentMaleWidth = scale(row.current.male);
    const currentFemaleWidth = scale(row.current.female);
    const deltaTotal = Number(row.current.total || 0) - Number(row.previous.total || 0);
    const tooltip = `<strong>${escapeHtml(row.ageGroup)}</strong><span>${escapeHtml(previousYear)}: ${escapeHtml(numberFormat.format(row.previous.total || 0))}</span><span>${escapeHtml(currentYear)}: ${escapeHtml(numberFormat.format(row.current.total || 0))}</span><span>Cambio: ${escapeHtml(formatSignedCompactPopulation(deltaTotal))}</span>`;
    return `
      <text x="${centerX - 10}" y="${y + 12}" text-anchor="end" class="chart-label">${escapeSvg(row.ageGroup)}</text>
      <rect class="chart-hotspot" ${tooltipAttribute(tooltip)} x="${centerX - prevMaleWidth}" y="${y}" width="${prevMaleWidth}" height="${rowHeight}" rx="4" fill="#4aa3ff" opacity="0.25"></rect>
      <rect class="chart-hotspot" ${tooltipAttribute(tooltip)} x="${centerX + centerGap}" y="${y}" width="${prevFemaleWidth}" height="${rowHeight}" rx="4" fill="#4aa3ff" opacity="0.25"></rect>
      <rect class="chart-hotspot" ${tooltipAttribute(tooltip)} x="${centerX - currentMaleWidth}" y="${y + 3}" width="${currentMaleWidth}" height="${rowHeight - 6}" rx="4" fill="#1fc6b5" opacity="0.92"></rect>
      <rect class="chart-hotspot" ${tooltipAttribute(tooltip)} x="${centerX + centerGap}" y="${y + 3}" width="${currentFemaleWidth}" height="${rowHeight - 6}" rx="4" fill="#1fc6b5" opacity="0.62"></rect>
    `;
  }).join("");

  return `
    <div class="pyramid-wrap">
      <svg class="chart-svg pyramid-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Piramide poblacional superpuesta ${escapeHtml(previousYear)} y ${escapeHtml(currentYear)}">
        <text x="${centerX - halfWidth / 2}" y="18" text-anchor="middle" class="chart-label">Varones</text>
        <text x="${centerX + centerGap + halfWidth / 2}" y="18" text-anchor="middle" class="chart-label">Mujeres</text>
        <rect x="${margin.left}" y="28" width="10" height="10" rx="3" fill="#4aa3ff" opacity="0.35"></rect>
        <text x="${margin.left + 16}" y="37" class="chart-label">${escapeSvg(previousYear)}</text>
        <rect x="${margin.left + 78}" y="28" width="10" height="10" rx="3" fill="#1fc6b5" opacity="0.92"></rect>
        <text x="${margin.left + 94}" y="37" class="chart-label">${escapeSvg(currentYear)}</text>
        <line x1="${centerX}" x2="${centerX}" y1="${margin.top - 8}" y2="${height - margin.bottom}" class="axis-line"></line>
        <line x1="${centerX + centerGap}" x2="${centerX + centerGap}" y1="${margin.top - 8}" y2="${height - margin.bottom}" class="axis-line"></line>
        ${gridLines(width, height, margin)}
        ${bars}
      </svg>
      <p class="chart-help visible">Azul claro: ${escapeHtml(previousYear)}. Verde: ${escapeHtml(currentYear)}. Si el verde sobresale, ese grupo creció; si queda adentro, perdió peso o cantidad.</p>
    </div>
  `;
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
    labelFormatter: shortDate,
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
    const tooltip = options.tooltipFormatter
      ? options.tooltipFormatter(row, value)
      : `<strong>${escapeHtml(formatMonth(row.date))}</strong><span>${escapeHtml(options.formatter(value))}</span>`;
    return `
      <rect class="chart-hotspot bar-fade" style="animation-delay:${index * 35}ms" ${tooltipAttribute(tooltip)} x="${x}" y="${y}" width="${barWidth}" height="${heightValue}" rx="5" fill="${value >= 0 ? "#4ad080" : "#ff6b6b"}"></rect>
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
      const tooltip = `<strong>${escapeHtml(formatMonth(row.date))}</strong><span>${escapeHtml(serie.label)}: ${escapeHtml(options.formatter(value))}</span>`;
      return `
        <rect class="chart-hotspot bar-fade" style="animation-delay:${index * 35}ms" ${tooltipAttribute(tooltip)} x="${x}" y="${y}" width="${barWidth}" height="${heightValue}" rx="4" fill="${serie.color}"></rect>
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
  const rows = data.filter((row) => Number.isFinite(Number(row[options.valueKey]))).slice(0, options.maxItems || 18);
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
    const tooltip = options.tooltipFormatter
      ? options.tooltipFormatter(row, value)
      : `<strong>${escapeHtml(label)}</strong><span>${escapeHtml(options.formatter(value))}</span>`;
    return `
      <rect class="chart-hotspot bar-v" style="animation-delay:${index * 35}ms" ${tooltipAttribute(tooltip)} x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="5" fill="${color || "#007f79"}"></rect>
      <text x="${x + barWidth / 2}" y="${height - 28}" text-anchor="middle" class="chart-label">${escapeSvg(shortText(label, 9))}</text>
      <text x="${x + barWidth / 2}" y="${Math.max(14, y - 7)}" text-anchor="middle" class="chart-label value-label">${escapeSvg(options.formatter(value))}</text>
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
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(options.ariaLabel || "Gráfico de barras")}">
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
  const maxBar = Math.max(8, plotWidth / 2 - 8);

  const bars = rows.map((row, index) => {
    const value = Number(row[options.valueKey]);
    const y = margin.top + index * rowHeight + 5;
    const length = Math.max(2, (Math.abs(value) / maxAbs) * maxBar);
    const isPositive = value >= 0;
    const x = isPositive ? zeroX : zeroX - length;
    const color = isPositive ? "#18825c" : "#bf3b3b";
    const label = row[options.labelKey];
    const valueText = options.formatter(value);
    // Si la barra es larga, el % va DENTRO (texto blanco) para no acercarse al
    // ticker. Si es corta, va afuera junto al tip, pero ahí la barra queda cerca
    // del centro, así que tampoco toca el nombre. De este modo nunca se pisan.
    const estLabelWidth = valueText.length * 7 + 10;
    const inside = length > estLabelWidth;
    let textX;
    let anchor;
    if (isPositive) {
      textX = inside ? x + length - 8 : x + length + 6;
      anchor = inside ? "end" : "start";
    } else {
      textX = inside ? x + 8 : x - 6;
      anchor = inside ? "start" : "end";
    }
    const labelClass = inside ? "value-label value-label-inside" : "value-label";
    const tooltip = options.tooltipFormatter
      ? options.tooltipFormatter(row, value)
      : `<strong>${escapeHtml(label)}</strong><span>${escapeHtml(valueText)}</span>`;
    return `
      <text x="${margin.left - 10}" y="${y + 12}" text-anchor="end" class="chart-label">${escapeSvg(shortText(label, 10))}</text>
      <rect class="chart-hotspot bar-h" style="transform-origin:${isPositive ? "left" : "right"} center;animation-delay:${index * 35}ms" ${tooltipAttribute(tooltip)} x="${x}" y="${y}" width="${length}" height="16" rx="5" fill="${color}"></rect>
      <text x="${textX}" y="${y + 12}" text-anchor="${anchor}" class="chart-label ${labelClass}">${escapeSvg(valueText)}</text>
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
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  // Margen del 12% arriba y abajo para que la línea no quede pegada a los bordes
  // y se lea la pendiente real en vez de un acantilado contra el piso.
  const pad = (rawMax - rawMin || Math.abs(rawMax) || 1) * 0.12;
  const minValue = rawMin - pad;
  const maxValue = rawMax + pad;
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
  const plotTop = margin.top;
  const gap = plotWidth / Math.max(1, rows.length - 1);

  // Cada punto es un grupo con una guía vertical, un punto y una zona de captura
  // ancha. Al pasar el cursor por la franja se enciende el crosshair y el dato,
  // que hace al gráfico mucho más fácil de leer punto a punto.
  const interactivePoints = points.map(([x, y, row]) => {
    const value = Number(row[options.yKey]);
    const label = options.xFormatter ? options.xFormatter(row[options.xKey]) : formatMonth(row[options.xKey]);
    const tooltip = options.tooltipFormatter
      ? options.tooltipFormatter(row, value)
      : `<strong>${escapeHtml(label)}</strong><span>${escapeHtml(options.label)}: ${escapeHtml(options.formatter(value))}</span>`;
    const hitX = Math.max(margin.left, x - gap / 2);
    const hitW = Math.max(1, Math.min(width - margin.right, x + gap / 2) - hitX);
    return `
      <g class="line-point" ${tooltipAttribute(tooltip)}>
        <line class="line-guide" x1="${x.toFixed(2)}" x2="${x.toFixed(2)}" y1="${plotTop}" y2="${(margin.top + plotHeight).toFixed(2)}"></line>
        <circle class="line-dot" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="4" fill="${options.color}"></circle>
        <rect class="line-hit" x="${hitX.toFixed(2)}" y="${plotTop}" width="${hitW.toFixed(2)}" height="${plotHeight}" fill="transparent"></rect>
      </g>
    `;
  }).join("");

  container.innerHTML = `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(options.label)}">
      ${gridLines(width, height, margin)}
      <path class="line-area" d="${area}" fill="${options.color}" opacity="0.12"></path>
      <path class="line-path" pathLength="1" d="${path}" fill="none" stroke="${options.color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"></path>
      <circle cx="${points.at(-1)[0]}" cy="${points.at(-1)[1]}" r="5" fill="${options.color}"></circle>
      ${interactivePoints}
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

function formatPopulation(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "--";
  if (numeric >= 1000000) return `${round(numeric / 1000000, 1)} M`;
  return numberFormat.format(Math.round(numeric));
}

function formatSignedCompactPopulation(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "--";
  const sign = numeric > 0 ? "+" : numeric < 0 ? "-" : "";
  const abs = Math.abs(numeric);
  if (abs >= 1000000) return `${sign}${round(abs / 1000000, 1)} M`;
  return `${sign}${numberFormat.format(Math.round(abs))}`;
}

function formatSignedPoints(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "--";
  const sign = numeric > 0 ? "+" : "";
  return `${sign}${round(numeric, 1)} p.p.`;
}

function formatPopulationTick(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "--";
  return numeric >= 1000000 ? `${round(numeric / 1000000, 1)} M` : `${round(numeric / 1000, 0)} k`;
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

function ageGroupStart(ageGroup) {
  const text = String(ageGroup || "");
  if (text.endsWith("+")) return Number(text.replace("+", ""));
  return Number(text.split("-")[0]);
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

function tooltipAttribute(html) {
  return `data-tooltip="${escapeHtml(html)}"`;
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}
