const $ = (selector) => document.querySelector(selector);

const els = {
  tickerSelect: $("#tickerSelect"),
  rangeSelect: $("#rangeSelect"),
  betaWindowSelect: $("#betaWindowSelect"),
  positionSize: $("#positionSize"),
  refreshButton: $("#refreshButton"),
  selectedShockLabel: $("#selectedShockLabel"),
  snapshotTitle: $("#snapshotTitle"),
  snapshotSubtitle: $("#snapshotSubtitle"),
  etfClose: $("#etfClose"),
  benchClose: $("#benchClose"),
  beta30: $("#beta30"),
  beta60: $("#beta60"),
  trackingSpread: $("#trackingSpread"),
  residualVol: $("#residualVol"),
  dataNote: $("#dataNote"),
  priceChart: $("#priceChart"),
  betaChart: $("#betaChart"),
  basisChart: $("#basisChart"),
  drawdownChart: $("#drawdownChart"),
  hedgeChart: $("#hedgeChart"),
  scenarioRows: $("#scenarioRows"),
  shockChips: $("#shockChips"),
};

const CONFIG = {
  IBIT: { name: "iShares Bitcoin Trust", benchmark: "BTC-USD", startRatio: 0.0007, beta: 0.98, drag: -0.00005 },
  FBTC: { name: "Fidelity Wise Origin Bitcoin Fund", benchmark: "BTC-USD", startRatio: 0.00069, beta: 0.99, drag: -0.00005 },
  BITB: { name: "Bitwise Bitcoin ETF", benchmark: "BTC-USD", startRatio: 0.00066, beta: 0.97, drag: -0.00006 },
  ARKB: { name: "ARK 21Shares Bitcoin ETF", benchmark: "BTC-USD", startRatio: 0.00062, beta: 0.96, drag: -0.00006 },
  ETHA: { name: "iShares Ethereum Trust", benchmark: "ETH-USD", startRatio: 0.011, beta: 1.02, drag: -0.00007 },
};

const RANGE_MAP = {
  "6mo": { range: "6mo", interval: "1d", days: 180 },
  "1y": { range: "1y", interval: "1d", days: 365 },
  "2y": { range: "2y", interval: "1d", days: 730 },
};

const DEFAULT_SHOCKS = [-10, -5, 0, 5, 10];

let activeRequest = 0;
let selectedShock = 5;

function toKey(date) {
  return date.toISOString().slice(0, 10);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPct(value, digits = 1) {
  return `${value >= 0 ? "" : "-"}${Math.abs(value).toFixed(digits)}%`;
}

function formatPoint(value, digits = 1) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)} pts`;
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

function formatAxisDate(date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit" }).format(date);
}

function parseChartResponse(payload) {
  const result = payload?.chart?.result?.[0];
  if (!result) return null;

  const meta = result.meta || {};
  const timestamps = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};
  const adj = result.indicators?.adjclose?.[0]?.adjclose || [];

  const points = timestamps
    .map((ts, index) => {
      const close = adj[index] ?? quote.close?.[index];
      if (close == null) return null;
      return {
        date: new Date(ts * 1000),
        close,
        volume: quote.volume?.[index] ?? 0,
      };
    })
    .filter(Boolean);

  return {
    symbol: meta.symbol || "",
    name: meta.longName || meta.shortName || meta.symbol || "",
    points,
  };
}

async function fetchLiveSeries(symbol, range, interval, signal) {
  const endpoints = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false&events=div%2Csplits`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false&events=div%2Csplits`,
  ];

  for (const url of endpoints) {
    try {
      const response = await fetch(url, { signal, cache: "no-store" });
      if (!response.ok) continue;
      const payload = await response.json();
      const series = parseChartResponse(payload);
      if (series?.points?.length > 8) return series;
    } catch (error) {
      if (error?.name === "AbortError") throw error;
    }
  }

  return null;
}

function seedFromSymbol(symbol) {
  return symbol.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function generateBenchmarkFallback(symbol, days) {
  const seed = seedFromSymbol(symbol);
  const start = symbol.includes("ETH") ? 3500 : 97000;
  const drift = symbol.includes("ETH") ? 0.0006 : 0.0004;
  const vol = symbol.includes("ETH") ? 0.018 : 0.012;
  const points = [];
  let close = start;
  const date = new Date();
  date.setDate(date.getDate() - days);

  for (let i = 0; i < days; i += 1) {
    const cycle = Math.sin((i + seed) / 12) * vol;
    const noise = Math.cos((i + seed) / 7) * vol * 0.45;
    close = Math.max(1, close * (1 + drift + cycle * 0.06 + noise * 0.04));
    points.push({
      date: new Date(date),
      close,
      volume: 1_000_000 + Math.round((Math.sin(i / 8 + seed) + 1.2) * 250_000),
    });
    date.setDate(date.getDate() + 1);
  }

  return { symbol, name: `${symbol} fallback`, points, fallback: true };
}

function generateEtfFallback(symbol, benchmarkSeries) {
  const config = CONFIG[symbol];
  const seed = seedFromSymbol(symbol);
  const points = [];
  let close = benchmarkSeries.points[0].close * config.startRatio;

  benchmarkSeries.points.forEach((benchmarkPoint, index) => {
    if (index === 0) {
      close = benchmarkPoint.close * config.startRatio;
    } else {
      const prevBenchmark = benchmarkSeries.points[index - 1].close;
      const benchmarkReturn = prevBenchmark > 0 ? benchmarkPoint.close / prevBenchmark - 1 : 0;
      const noise = Math.sin((index + seed) / 5) * 0.0014;
      close = Math.max(0.5, close * (1 + config.beta * benchmarkReturn + config.drag + noise));
    }

    points.push({
      date: new Date(benchmarkPoint.date),
      close,
      volume: 300_000 + Math.round((Math.cos(index / 9 + seed) + 1.4) * 160_000),
    });
  });

  return { symbol, name: `${symbol} fallback`, points, fallback: true };
}

function movingAverage(values, windowSize) {
  return values.map((value, index) => {
    if (index + 1 < windowSize) return null;
    const slice = values.slice(index + 1 - windowSize, index + 1);
    return slice.reduce((sum, item) => sum + item, 0) / windowSize;
  });
}

function returns(values) {
  const out = [0];
  for (let i = 1; i < values.length; i += 1) {
    out.push(values[i] / values[i - 1] - 1);
  }
  return out;
}

function annualizedVolatility(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, item) => sum + item, 0) / values.length;
  const variance = values.reduce((sum, item) => sum + (item - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252);
}

function drawdowns(values) {
  let peak = -Infinity;
  return values.map((value) => {
    peak = Math.max(peak, value);
    return peak > 0 ? value / peak - 1 : 0;
  });
}

function rollingBeta(etfReturns, benchReturns, windowSize) {
  return etfReturns.map((_, index) => {
    if (index + 1 < windowSize) return null;
    const start = index + 1 - windowSize;
    const etfWindow = etfReturns.slice(start, index + 1);
    const benchWindow = benchReturns.slice(start, index + 1);
    const benchMean = benchWindow.reduce((sum, item) => sum + item, 0) / windowSize;
    const etfMean = etfWindow.reduce((sum, item) => sum + item, 0) / windowSize;
    const benchVar = benchWindow.reduce((sum, item) => sum + (item - benchMean) ** 2, 0) / (windowSize - 1 || 1);
    if (benchVar === 0) return null;
    const covariance = etfWindow.reduce(
      (sum, item, i) => sum + (item - etfMean) * (benchWindow[i] - benchMean),
      0,
    ) / (windowSize - 1 || 1);
    return covariance / benchVar;
  });
}

function buildSeriesPath(points, xScale, yScale) {
  let path = "";
  let inRun = false;

  points.forEach((point) => {
    if (point == null || point.y == null) {
      inRun = false;
      return;
    }
    const x = xScale(point.x);
    const y = yScale(point.y);
    path += inRun ? ` L ${x} ${y}` : `M ${x} ${y}`;
    inRun = true;
  });

  return path.trim();
}

function buildSvg(width, height, inner) {
  return `
    <svg viewBox="0 0 ${width} ${height}" class="chart-svg" role="img" aria-hidden="true">
      ${inner}
    </svg>
  `;
}

function createScale(domainMin, domainMax, rangeMin, rangeMax) {
  const span = domainMax - domainMin || 1;
  return (value) => rangeMin + ((value - domainMin) / span) * (rangeMax - rangeMin);
}

function renderLineChart(container, {
  series,
  xValues,
  yFormatter,
  xFormatter,
  referenceLines = [],
  yLabel,
  xLabel,
}) {
  if (!xValues.length) {
    container.innerHTML = "";
    return;
  }

  const width = 1040;
  const height = 320;
  const pad = { top: 22, right: 24, bottom: 40, left: 64 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const yValues = series.flatMap((item) => item.points.map((point) => point.y).filter((value) => value != null));

  referenceLines.forEach((value) => yValues.push(value));
  const xMin = Math.min(...xValues);
  const xMax = Math.max(...xValues);
  const yMin = Math.min(...yValues);
  const yMax = Math.max(...yValues);
  const xScale = createScale(xMin, xMax, pad.left, pad.left + innerWidth);
  const yScale = createScale(yMin, yMax, pad.top + innerHeight, pad.top);
  const yTicks = 5;

  const grid = [];
  for (let i = 0; i <= yTicks; i += 1) {
    const ratio = i / yTicks;
    const y = pad.top + innerHeight * ratio;
    const value = yMax - ((yMax - yMin) * i) / yTicks;
    grid.push(`
      <line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" class="chart-grid" />
      <text x="${pad.left - 10}" y="${y + 4}" text-anchor="end" class="chart-axis">${yFormatter(value)}</text>
    `);
  }

  const tickDates = [
    xValues[0],
    xValues[Math.floor(xValues.length / 3)],
    xValues[Math.floor((xValues.length * 2) / 3)],
    xValues[xValues.length - 1],
  ].filter((value, index, array) => value != null && array.indexOf(value) === index);

  const ticks = tickDates.map((tick) => {
    const x = xScale(tick);
    return `
      <line x1="${x}" y1="${height - pad.bottom}" x2="${x}" y2="${height - pad.bottom + 6}" class="chart-grid" />
      <text x="${x}" y="${height - 12}" text-anchor="middle" class="chart-axis">${xFormatter(tick)}</text>
    `;
  }).join("");

  const focusX = xValues[xValues.length - 1];
  const focusLine = `
    <line x1="${xScale(focusX)}" y1="${pad.top}" x2="${xScale(focusX)}" y2="${height - pad.bottom}" class="chart-focus" />
  `;

  const refLines = referenceLines.map((value) => `
    <line x1="${pad.left}" y1="${yScale(value)}" x2="${width - pad.right}" y2="${yScale(value)}" class="chart-zero" />
  `).join("");

  const paths = series.map((item) => {
    const path = buildSeriesPath(item.points, xScale, yScale);
    const fill = item.fill
      ? `<path d="${path} L ${xScale(item.points[item.points.length - 1].x)} ${height - pad.bottom} L ${xScale(item.points[0].x)} ${height - pad.bottom} Z" fill="${item.fill}" />`
      : "";

    return `
      ${fill}
      <path d="${path}" fill="none" stroke="${item.color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
    `;
  }).join("");

  container.innerHTML = buildSvg(width, height, `
    <rect x="0" y="0" width="${width}" height="${height}" rx="22" class="chart-surface" />
    ${grid.join("")}
    ${refLines}
    ${focusLine}
    ${paths}
    ${ticks}
    ${yLabel ? `<text x="18" y="${pad.top + 8}" class="chart-label" transform="rotate(-90 18 ${pad.top + 8})">${yLabel}</text>` : ""}
    ${xLabel ? `<text x="${width - 22}" y="${height - 12}" text-anchor="end" class="chart-label">${xLabel}</text>` : ""}
  `);
}

function renderWaterfall(container, rows) {
  if (!rows.length) {
    container.innerHTML = "";
    return;
  }

  const maxAbs = Math.max(...rows.map((row) => Math.abs(row.value)), 0.01);
  container.innerHTML = rows.map((row) => {
    const width = (Math.abs(row.value) / maxAbs) * 100;
    return `
      <div class="waterfall-row ${row.emphasis ? "waterfall-row--emphasis" : ""}">
        <div class="waterfall-label">${row.label}</div>
        <div class="waterfall-track">
          <div class="waterfall-center"></div>
          <div class="waterfall-fill waterfall-fill--${row.value >= 0 ? "positive" : "negative"}" style="width:${width}%; ${row.value >= 0 ? "left:50%;" : "right:50%;"}"></div>
        </div>
        <div class="waterfall-value">${formatMoney(row.value)}</div>
      </div>
    `;
  }).join("");
}

function alignSeries(etfSeries, benchmarkSeries) {
  const benchmarkMap = new Map(benchmarkSeries.points.map((point) => [toKey(point.date), point.close]));
  const aligned = [];

  etfSeries.points.forEach((point) => {
    const benchmarkClose = benchmarkMap.get(toKey(point.date));
    if (benchmarkClose == null) return;
    aligned.push({
      date: new Date(point.date),
      etfClose: point.close,
      benchmarkClose,
      etfVolume: point.volume,
    });
  });

  return aligned;
}

function computeMetrics(aligned, betaWindow, positionSize) {
  const etfCloses = aligned.map((point) => point.etfClose);
  const benchmarkCloses = aligned.map((point) => point.benchmarkClose);
  const dates = aligned.map((point) => point.date.getTime());
  const etfReturns = returns(etfCloses);
  const benchmarkReturns = returns(benchmarkCloses);
  const betaSeries = rollingBeta(etfReturns, benchmarkReturns, betaWindow);
  const beta30Series = rollingBeta(etfReturns, benchmarkReturns, Math.min(30, betaWindow));
  const beta60Series = rollingBeta(etfReturns, benchmarkReturns, Math.min(60, etfReturns.length));
  const selectedBeta = [...betaSeries].reverse().find((value) => value != null) ?? 1;
  const beta30 = [...beta30Series].reverse().find((value) => value != null) ?? selectedBeta;
  const beta60 = [...beta60Series].reverse().find((value) => value != null) ?? selectedBeta;
  const normalizedEtf = etfCloses.map((close) => (close / etfCloses[0]) * 100);
  const normalizedBench = benchmarkCloses.map((close) => (close / benchmarkCloses[0]) * 100);
  const basis = normalizedEtf.map((value, index) => value - normalizedBench[index]);
  const residualReturns = etfReturns.slice(1).map((ret, index) => ret - selectedBeta * benchmarkReturns.slice(1)[index]);
  const residualVol = annualizedVolatility(residualReturns) * 100;
  const drawdownEtf = drawdowns(etfCloses).map((value) => value * 100);
  const drawdownBench = drawdowns(benchmarkCloses).map((value) => value * 100);
  const ma20 = movingAverage(normalizedEtf, 20);
  const ma50 = movingAverage(normalizedEtf, 50);
  const basisMean = basis.slice(-Math.min(20, basis.length)).reduce((sum, item) => sum + item, 0) / Math.min(20, basis.length);
  const residualMean = residualReturns.length
    ? residualReturns.slice(-Math.min(20, residualReturns.length)).reduce((sum, item) => sum + item, 0) / Math.min(20, residualReturns.length)
    : 0;

  return {
    dates,
    etfCloses,
    benchmarkCloses,
    etfReturns,
    benchmarkReturns,
    betaSeries,
    beta30,
    beta60,
    selectedBeta,
    normalizedEtf,
    normalizedBench,
    basis,
    basisMean,
    residualReturns,
    residualVol,
    drawdownEtf,
    drawdownBench,
    ma20,
    ma50,
    positionSize,
    hedgeUnits: positionSize * selectedBeta / benchmarkCloses[benchmarkCloses.length - 1],
    residualMean,
    latestDate: aligned[aligned.length - 1]?.date,
  };
}

function buildScenarioRows(metrics, shockPct) {
  const shock = shockPct / 100;
  const etfShock = metrics.selectedBeta * shock + metrics.residualMean;
  const hedgeShock = -metrics.selectedBeta * shock;
  const residualShock = etfShock + hedgeShock;

  return {
    etfPnl: metrics.positionSize * etfShock,
    hedgePnl: metrics.positionSize * hedgeShock,
    residualPnl: metrics.positionSize * residualShock,
    totalPnl: metrics.positionSize * (etfShock + hedgeShock),
  };
}

function buildScenarioTable(metrics) {
  return DEFAULT_SHOCKS.map((shockPct) => {
    const shock = shockPct / 100;
    const etfShock = metrics.selectedBeta * shock + metrics.residualMean;
    const hedgeShock = -metrics.selectedBeta * shock;
    const totalShock = etfShock + hedgeShock;
    const read = totalShock > 0.001 ? "Hedge helps but leaves upside" : totalShock < -0.001 ? "Residual still dominates" : "Near flat";
    return `
      <tr>
        <td>${formatPct(shockPct, 0)}</td>
        <td>${formatPct(etfShock * 100, 2)}</td>
        <td>${formatMoney(metrics.positionSize * hedgeShock)}</td>
        <td>${formatMoney(metrics.positionSize * totalShock)}</td>
        <td class="${Math.abs(totalShock) < 0.001 ? "state--good" : totalShock > 0 ? "state--warn" : "state--bad"}">${read}</td>
      </tr>
    `;
  }).join("");
}

function buildWaterfallRows(metrics, shockPct) {
  const scenario = buildScenarioRows(metrics, shockPct);
  return [
    { label: "ETF leg", value: scenario.etfPnl },
    { label: "Short hedge", value: scenario.hedgePnl },
    { label: "Residual", value: scenario.residualPnl },
    { label: "Total", value: scenario.totalPnl, emphasis: true },
  ];
}

function setActiveChip(shockPct) {
  document.querySelectorAll(".chip").forEach((chip) => {
    chip.classList.toggle("is-active", Number(chip.dataset.shock) === shockPct);
  });
}

function renderDashboard(state) {
  const { ticker, config, benchmarkSeries, etfSeries, metrics, rangeLabel } = state;
  const latestEtf = metrics.etfCloses[metrics.etfCloses.length - 1];
  const latestBench = metrics.benchmarkCloses[metrics.benchmarkCloses.length - 1];
  const latestDate = metrics.latestDate;
  const scenarioRows = buildWaterfallRows(metrics, selectedShock);

  els.snapshotTitle.textContent = `${ticker} / ${config.benchmark}`;
  els.snapshotSubtitle.textContent = `${config.name} against the underlying benchmark over the ${rangeLabel} window.`;
  els.etfClose.textContent = formatMoney(latestEtf);
  els.benchClose.textContent = formatMoney(latestBench);
  els.beta30.textContent = metrics.beta30.toFixed(2);
  els.beta60.textContent = metrics.beta60.toFixed(2);
  els.trackingSpread.textContent = formatPoint(metrics.basis[metrics.basis.length - 1] ?? 0, 1);
  els.residualVol.textContent = `${metrics.residualVol.toFixed(1)}%`;
  els.selectedShockLabel.textContent = formatPct(selectedShock, 0);
  els.dataNote.textContent = etfSeries.fallback || benchmarkSeries.fallback
    ? `Fallback data is active for this view, which keeps the note usable even if the live endpoint blocks the request.`
    : `Live chart data loaded on ${formatDate(latestDate)}. The hedge view uses a ${metrics.beta30.toFixed(2)} beta estimate and a ${metrics.beta60.toFixed(2)} longer-window check.`;
  els.dataNote.classList.toggle("error-note", etfSeries.fallback || benchmarkSeries.fallback);
  els.scenarioRows.innerHTML = buildScenarioTable(metrics);

  renderLineChart(els.priceChart, {
    series: [
      { points: metrics.normalizedEtf.map((y, x) => ({ x: metrics.dates[x], y })), color: "#1f4e79", fill: "rgba(31, 78, 121, 0.08)" },
      { points: metrics.normalizedBench.map((y, x) => ({ x: metrics.dates[x], y })), color: "#7b5a32" },
      { points: metrics.ma20.map((y, x) => ({ x: metrics.dates[x], y })), color: "#0d7f79" },
      { points: metrics.ma50.map((y, x) => ({ x: metrics.dates[x], y })), color: "#a14c56" },
    ],
    xValues: metrics.dates,
    yFormatter: (value) => value.toFixed(0),
    xFormatter: (value) => formatAxisDate(new Date(value)),
    yLabel: "Indexed to 100",
  });

  renderLineChart(els.betaChart, {
    series: [
      { points: metrics.betaSeries.map((y, x) => ({ x: metrics.dates[x], y })), color: "#1f4e79" },
    ],
    xValues: metrics.dates,
    yFormatter: (value) => value.toFixed(2),
    xFormatter: (value) => formatAxisDate(new Date(value)),
    referenceLines: [1],
    yLabel: "Rolling beta",
  });

  renderLineChart(els.basisChart, {
    series: [
      { points: metrics.basis.map((y, x) => ({ x: metrics.dates[x], y })), color: "#7b5a32", fill: "rgba(123, 90, 50, 0.08)" },
    ],
    xValues: metrics.dates,
    yFormatter: (value) => value.toFixed(1),
    xFormatter: (value) => formatAxisDate(new Date(value)),
    referenceLines: [0],
    yLabel: "Index spread",
  });

  renderLineChart(els.drawdownChart, {
    series: [
      { points: metrics.drawdownEtf.map((y, x) => ({ x: metrics.dates[x], y })), color: "#1f4e79" },
      { points: metrics.drawdownBench.map((y, x) => ({ x: metrics.dates[x], y })), color: "#a14c56" },
    ],
    xValues: metrics.dates,
    yFormatter: (value) => formatPct(value, 0),
    xFormatter: (value) => formatAxisDate(new Date(value)),
    referenceLines: [0],
    yLabel: "Drawdown",
  });

  renderWaterfall(els.hedgeChart, buildWaterfallRows(metrics, selectedShock));
}

async function loadDashboard() {
  const requestId = ++activeRequest;
  const ticker = els.tickerSelect.value;
  const config = CONFIG[ticker];
  const range = RANGE_MAP[els.rangeSelect.value];
  const betaWindow = Number(els.betaWindowSelect.value);
  const positionSize = Number(els.positionSize.value) || 1_000_000;
  const rangeLabel = els.rangeSelect.options[els.rangeSelect.selectedIndex].textContent;

  els.refreshButton.disabled = true;
  els.refreshButton.textContent = "Loading...";

  try {
    const [liveEtf, liveBenchmark] = await Promise.all([
      fetchLiveSeries(ticker, range.range, range.interval),
      fetchLiveSeries(config.benchmark, range.range, range.interval),
    ]);

    let etfSeries = liveEtf;
    let benchmarkSeries = liveBenchmark;

    if (!etfSeries || !benchmarkSeries) {
      benchmarkSeries = generateBenchmarkFallback(config.benchmark, range.days);
      etfSeries = generateEtfFallback(ticker, benchmarkSeries);
    }

    const aligned = alignSeries(etfSeries, benchmarkSeries);
    if (aligned.length < Math.max(30, betaWindow + 5)) {
      benchmarkSeries = generateBenchmarkFallback(config.benchmark, range.days);
      etfSeries = generateEtfFallback(ticker, benchmarkSeries);
    }

    const finalAligned = alignSeries(etfSeries, benchmarkSeries);
    const metrics = computeMetrics(finalAligned, betaWindow, positionSize);

    if (requestId !== activeRequest) return;

    renderDashboard({
      ticker,
      config,
      benchmarkSeries,
      etfSeries,
      metrics,
      rangeLabel,
    });
  } catch (error) {
    if (error?.name === "AbortError") return;

    const benchmarkSeries = generateBenchmarkFallback(config.benchmark, range.days);
    const etfSeries = generateEtfFallback(ticker, benchmarkSeries);
    const metrics = computeMetrics(alignSeries(etfSeries, benchmarkSeries), betaWindow, positionSize);

    if (requestId !== activeRequest) return;

    renderDashboard({
      ticker,
      config,
      benchmarkSeries,
      etfSeries,
      metrics,
      rangeLabel,
    });
    els.dataNote.textContent = "Live data was unavailable, so this view is using a deterministic fallback pair.";
    els.dataNote.classList.add("error-note");
  } finally {
    if (requestId === activeRequest) {
      els.refreshButton.disabled = false;
      els.refreshButton.textContent = "Refresh data";
    }
  }
}

function wireShockChips() {
  els.shockChips.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      selectedShock = Number(chip.dataset.shock);
      setActiveChip(selectedShock);
      loadDashboard();
    });
  });
}

function wireControls() {
  const schedule = () => loadDashboard();
  els.tickerSelect.addEventListener("change", schedule);
  els.rangeSelect.addEventListener("change", schedule);
  els.betaWindowSelect.addEventListener("change", schedule);
  els.positionSize.addEventListener("input", schedule);
  els.refreshButton.addEventListener("click", schedule);
}

wireShockChips();
wireControls();
setActiveChip(selectedShock);
loadDashboard();
