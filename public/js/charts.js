import { numberFormat, formatPercent, formatAuctionMoney, formatSignedCompactPopulation, shortDate, formatMonth, shortText, ageGroupStart, round, escapeHtml, escapeSvg, tooltipAttribute } from "./format.js";
import { debtFamilyLabels } from "./content.js";

export function renderDonutChart(slices, { centerTop, centerBottom }) {
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

export function renderPopulationPyramidOverlay(previousRows, currentRows, previousYear, currentYear) {
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

export function renderSignedVerticalBarChart(container, data, options) {
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

export function renderGroupedBarChart(container, data, options) {
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

export function renderTable(container, rows, columns) {
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

export function renderVerticalBarChart(container, data, options) {
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

export function renderHorizontalBarChart(container, data, options) {
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

function niceTicks(min, max, count = 4) {
  const span = max - min || Math.abs(max) || 1;
  const raw = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= raw);
  const ticks = [];
  for (let value = Math.floor(min / step) * step; value <= Math.ceil(max / step) * step + step / 2; value += step) {
    ticks.push(Number(value.toFixed(10)));
  }
  return ticks;
}

// Curva suave que no se pasa de los puntos (cúbica monótona, Fritsch-Carlson).
function smoothPath(points) {
  const dx = points.slice(1).map((point, index) => point[0] - points[index][0]);
  const slope = points.slice(1).map((point, index) => (point[1] - points[index][1]) / dx[index]);
  const tangent = points.map((_, index) => {
    if (index === 0) return slope[0];
    if (index === points.length - 1) return slope[index - 1];
    return slope[index - 1] * slope[index] <= 0 ? 0 : (slope[index - 1] + slope[index]) / 2;
  });
  slope.forEach((value, index) => {
    if (value === 0) {
      tangent[index] = 0;
      tangent[index + 1] = 0;
      return;
    }
    const a = tangent[index] / value;
    const b = tangent[index + 1] / value;
    const size = a * a + b * b;
    if (size > 9) {
      const scale = 3 / Math.sqrt(size);
      tangent[index] = scale * a * value;
      tangent[index + 1] = scale * b * value;
    }
  });

  return points.map(([x, y], index) => {
    if (index === 0) return `M ${x.toFixed(2)} ${y.toFixed(2)}`;
    const [prevX, prevY] = points[index - 1];
    const third = dx[index - 1] / 3;
    return `C ${(prevX + third).toFixed(2)} ${(prevY + tangent[index - 1] * third).toFixed(2)} ${(x - third).toFixed(2)} ${(y - tangent[index] * third).toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ");
}

export function renderLineChart(container, data, options) {
  const rows = data.filter((row) => Number.isFinite(Number(row[options.yKey])));
  if (rows.length < 2) {
    container.innerHTML = `<div class="empty-state">No hay suficientes puntos para graficar.</div>`;
    return;
  }

  const width = 760;
  const height = 290;
  const margin = { top: 34, right: 26, bottom: 38, left: 52 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const plotBottom = margin.top + plotHeight;
  const values = rows.map((row) => Number(row[options.yKey]));
  const ticks = niceTicks(Math.min(...values), Math.max(...values));
  const minValue = ticks[0];
  const range = ticks.at(-1) - minValue || 1;
  const xAt = (index) => margin.left + (index / (rows.length - 1)) * plotWidth;
  const yAt = (value) => plotBottom - ((value - minValue) / range) * plotHeight;
  const points = rows.map((row, index) => [xAt(index), yAt(values[index]), row]);
  const path = smoothPath(points);
  const area = `${path} L ${points.at(-1)[0].toFixed(2)} ${plotBottom} L ${margin.left} ${plotBottom} Z`;
  const gradientId = `${container.id || "line"}-gradient`;
  const axisFormatter = options.axisFormatter || options.formatter;
  const xFormatter = options.xFormatter || shortDate;
  const lastIndex = rows.length - 1;
  const gap = plotWidth / lastIndex;

  const yAxis = ticks.map((tick) => `
    <line x1="${margin.left}" x2="${width - margin.right}" y1="${yAt(tick).toFixed(2)}" y2="${yAt(tick).toFixed(2)}" class="grid-line"></line>
    <text x="${margin.left - 10}" y="${(yAt(tick) + 4).toFixed(2)}" text-anchor="end" class="chart-label">${escapeSvg(axisFormatter(tick))}</text>
  `).join("");

  const labelStep = Math.ceil(rows.length / 7);
  const xAxis = points
    .map(([x, , row], index) => ((lastIndex - index) % labelStep === 0
      ? `<text x="${x.toFixed(2)}" y="${height - 14}" text-anchor="middle" class="chart-label">${escapeSvg(xFormatter(row[options.xKey]))}</text>`
      : ""))
    .join("");

  // Máximo y mínimo del período, salvo que caigan pegados al último punto, que ya
  // lleva su propia etiqueta.
  const maxIndex = values.indexOf(Math.max(...values));
  const minIndex = values.indexOf(Math.min(...values));
  const extremes = [[maxIndex, -10], [minIndex, 18]]
    .filter(([index], position, all) => index < lastIndex - 1 && all.findIndex(([other]) => other === index) === position)
    .map(([index, offset]) => `<text x="${points[index][0].toFixed(2)}" y="${(points[index][1] + offset).toFixed(2)}" text-anchor="middle" class="chart-label">${escapeSvg(options.formatter(values[index]))}</text>`)
    .join("");

  const nodes = points.map(([x, y], index) => (index === lastIndex
    ? ""
    : `<circle class="line-node" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="3" stroke="${options.color}"></circle>`)).join("");

  const [lastX, lastY] = points[lastIndex];
  const badgeText = options.formatter(values[lastIndex]);
  const badgeWidth = badgeText.length * 7.5 + 18;
  const badge = `
    <circle cx="${lastX.toFixed(2)}" cy="${lastY.toFixed(2)}" r="9" fill="${options.color}" opacity="0.2"></circle>
    <circle cx="${lastX.toFixed(2)}" cy="${lastY.toFixed(2)}" r="5" fill="${options.color}"></circle>
    <rect x="${(lastX - badgeWidth + 8).toFixed(2)}" y="${(lastY - 36).toFixed(2)}" width="${badgeWidth.toFixed(2)}" height="22" rx="6" fill="${options.color}"></rect>
    <text x="${(lastX - badgeWidth / 2 + 8).toFixed(2)}" y="${(lastY - 21).toFixed(2)}" text-anchor="middle" class="line-badge-text">${escapeSvg(badgeText)}</text>
  `;

  // Cada punto es un grupo con una guía vertical, un punto y una zona de captura
  // ancha: al pasar el cursor por la franja se enciende el crosshair y el dato.
  const interactivePoints = points.map(([x, y, row], index) => {
    const value = values[index];
    const label = options.xFormatter ? options.xFormatter(row[options.xKey]) : formatMonth(row[options.xKey]);
    const tooltip = options.tooltipFormatter
      ? options.tooltipFormatter(row, value)
      : `<strong>${escapeHtml(label)}</strong><span>${escapeHtml(options.label)}: ${escapeHtml(options.formatter(value))}</span>`;
    const hitX = Math.max(margin.left, x - gap / 2);
    const hitW = Math.max(1, Math.min(width - margin.right, x + gap / 2) - hitX);
    return `
      <g class="line-point" ${tooltipAttribute(tooltip)}>
        <line class="line-guide" x1="${x.toFixed(2)}" x2="${x.toFixed(2)}" y1="${margin.top}" y2="${plotBottom}"></line>
        <circle class="line-dot" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="4" fill="${options.color}"></circle>
        <rect class="line-hit" x="${hitX.toFixed(2)}" y="${margin.top}" width="${hitW.toFixed(2)}" height="${plotHeight}" fill="transparent"></rect>
      </g>
    `;
  }).join("");

  container.innerHTML = `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(options.label)}">
      <defs>
        <linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="${options.color}" stop-opacity="0.32"></stop>
          <stop offset="1" stop-color="${options.color}" stop-opacity="0"></stop>
        </linearGradient>
      </defs>
      ${yAxis}
      <path class="line-area" d="${area}" fill="url(#${gradientId})"></path>
      <path class="line-path" pathLength="1" d="${path}" fill="none" stroke="${options.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"></path>
      ${nodes}
      ${extremes}
      ${badge}
      ${xAxis}
      ${interactivePoints}
    </svg>
  `;
}


export function gridLines(width, height, margin) {
  const plotHeight = height - margin.top - margin.bottom;
  return [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const y = margin.top + plotHeight * ratio;
    return `<line x1="${margin.left}" x2="${width - margin.right}" y1="${y}" y2="${y}" class="grid-line"></line>`;
  }).join("");
}
