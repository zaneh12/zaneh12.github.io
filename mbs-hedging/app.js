const $ = (selector) => document.querySelector(selector);

const els = {
  mbsValue: $("#mbsValue"),
  mbsValueRange: $("#mbsValueRange"),
  baseDuration: $("#baseDuration"),
  baseDurationRange: $("#baseDurationRange"),
  swapNotional: $("#swapNotional"),
  swapNotionalRange: $("#swapNotionalRange"),
  swapDuration: $("#swapDuration"),
  swapDurationRange: $("#swapDurationRange"),
  swaptionNotional: $("#swaptionNotional"),
  swaptionNotionalRange: $("#swaptionNotionalRange"),
  swaptionEnabled: $("#swaptionEnabled"),
  rateShock: $("#rateShock"),
  rateShockOutput: $("#rateShockOutput"),
  currentNetDv01: $("#currentNetDv01"),
  currentMbsDv01: $("#currentMbsDv01"),
  currentSwapDv01: $("#currentSwapDv01"),
  estimatedPnl: $("#estimatedPnl"),
  selectedDuration: $("#selectedDuration"),
  selectedShockLabel: $("#selectedShockLabel"),
  selectedShockNote: $("#selectedShockNote"),
  swaptionBenefit: $("#swaptionBenefit"),
  swaptionNote: $("#swaptionNote"),
  hedgeState: $("#hedgeState"),
  hedgeNote: $("#hedgeNote"),
  hedgeGap: $("#hedgeGap"),
  hedgeGapNote: $("#hedgeGapNote"),
  marketNarrative: $("#marketNarrative"),
  mathCurrentDv01: $("#mathCurrentDv01"),
  mathNetHedge: $("#mathNetHedge"),
  mathDuration: $("#mathDuration"),
  mathSwaption: $("#mathSwaption"),
  mathPnl: $("#mathPnl"),
  durationChart: $("#durationChart"),
  dv01Chart: $("#dv01Chart"),
  stackChart: $("#stackChart"),
  scenarioRows: $("#scenarioRows"),
};

const SHOCKS = range(-150, 150, 25);
const LADDER = [-150, -100, -50, 0, 50, 100, 150];

function range(start, end, step) {
  const values = [];
  for (let value = start; value <= end; value += step) {
    values.push(value);
  }
  return values;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parseNumber(input, fallback) {
  const value = Number(input.value);
  return Number.isFinite(value) ? value : fallback;
}

function fmtDv01(value) {
  const sign = value > 0 ? "" : value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toFixed(2)} mm / bp`;
}

function fmtPnL(value) {
  const sign = value > 0 ? "" : value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toFixed(2)} mm`;
}

function fmtYears(value) {
  return `${value.toFixed(2)} yrs`;
}

function fmtShock(value) {
  return `${value > 0 ? "+" : ""}${value} bp`;
}

function durationForShock(baseDuration, shockBp) {
  const rally = Math.max(0, -shockBp);
  const selloff = Math.max(0, shockBp);
  const rallyDrop = (rally / 100) * (1.25 + rally / 300);
  const selloffLift = (selloff / 100) * (0.82 + selloff / 420);
  return clamp(baseDuration - rallyDrop + selloffLift, 1.25, 9.5);
}

function swaptionActivation(shockBp, enabled) {
  if (!enabled || shockBp >= -40) return 0;
  const rally = Math.abs(shockBp);
  return clamp((rally - 40) / 110, 0, 1);
}

function computeScenario(params, shockBp) {
  const baseMbsDv01 = (params.mbsValue * params.baseDuration) / 10000;
  const swapDv01 = (params.swapNotional * params.swapDuration) / 10000;
  const stressedDuration = durationForShock(params.baseDuration, shockBp);
  const stressedMbsDv01 = (params.mbsValue * stressedDuration) / 10000;
  const optionShare = swaptionActivation(shockBp, params.swaptionEnabled);
  const swaptionDv01 = (params.swaptionNotional * 3.5 * optionShare) / 10000;
  const netBeforeOption = stressedMbsDv01 - swapDv01;
  const netAfterOption = netBeforeOption + swaptionDv01;

  return {
    shockBp,
    baseMbsDv01,
    swapDv01,
    stressedDuration,
    stressedMbsDv01,
    swaptionDv01,
    netBeforeOption,
    netAfterOption,
  };
}

function stateTone(netDv01) {
  const abs = Math.abs(netDv01);
  if (abs <= 0.03) return "state state--good";
  if (netDv01 > 0) return "state state--warn";
  return "state state--bad";
}

function stateLabel(netDv01) {
  const abs = Math.abs(netDv01);
  if (abs <= 0.03) return "Neutral";
  if (netDv01 > 0) return "Long duration";
  return "Short duration";
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
  focusX,
  yFormatter,
  yLabel,
  xLabel,
  showZeroLine = false,
}) {
  const width = 1000;
  const height = 340;
  const pad = { top: 24, right: 24, bottom: 42, left: 64 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const xValues = series.flatMap((item) => item.points.map((point) => point.x));
  const yValues = series.flatMap((item) => item.points.map((point) => point.y));
  const xMin = Math.min(...xValues);
  const xMax = Math.max(...xValues);
  const yMin = showZeroLine ? Math.min(0, ...yValues) : Math.min(...yValues);
  const yMax = showZeroLine ? Math.max(0, ...yValues) : Math.max(...yValues);
  const xScale = createScale(xMin, xMax, pad.left, pad.left + innerWidth);
  const yScale = createScale(yMin, yMax, pad.top + innerHeight, pad.top);
  const xTicks = [-150, -100, -50, 0, 50, 100, 150];
  const yTicks = 5;

  const gridLines = [];
  for (let i = 0; i <= yTicks; i += 1) {
    const ratio = i / yTicks;
    const y = pad.top + innerHeight * ratio;
    const value = yMax - ((yMax - yMin) * i) / yTicks;
    gridLines.push(`
      <line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" class="chart-grid" />
      <text x="${pad.left - 12}" y="${y + 4}" text-anchor="end" class="chart-axis">${yFormatter(value)}</text>
    `);
  }

  const tickLabels = xTicks.map((tick) => {
    const x = xScale(tick);
    return `
      <line x1="${x}" y1="${height - pad.bottom}" x2="${x}" y2="${height - pad.bottom + 6}" class="chart-grid" />
      <text x="${x}" y="${height - 12}" text-anchor="middle" class="chart-axis">${fmtShock(tick)}</text>
    `;
  }).join("");

  const zeroLine = showZeroLine
    ? `<line x1="${pad.left}" y1="${yScale(0)}" x2="${width - pad.right}" y2="${yScale(0)}" class="chart-zero" />`
    : "";

  const focusLine = focusX !== undefined
    ? `<line x1="${xScale(focusX)}" y1="${pad.top}" x2="${xScale(focusX)}" y2="${height - pad.bottom}" class="chart-focus" />`
    : "";

  const paths = series.map((item) => {
    const path = item.points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${xScale(point.x)} ${yScale(point.y)}`)
      .join(" ");

    const focusPoint = focusX === undefined
      ? null
      : item.points.reduce((closest, point) => (
          Math.abs(point.x - focusX) < Math.abs(closest.x - focusX) ? point : closest
        ));

    const dot = focusPoint
      ? `<circle cx="${xScale(focusPoint.x)}" cy="${yScale(focusPoint.y)}" r="5.5" fill="${item.color}" stroke="rgba(8,12,18,0.85)" stroke-width="2" />`
      : "";

    return `
      <path d="${path}" fill="none" stroke="${item.color}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
      ${dot}
    `;
  }).join("");

  container.innerHTML = `
    ${buildSvg(width, height, `
      <rect x="0" y="0" width="${width}" height="${height}" rx="24" fill="#ffffff" stroke="rgba(16,21,29,0.08)" />
      ${gridLines.join("")}
      ${zeroLine}
      ${focusLine}
      ${paths}
      ${tickLabels}
      <text x="${pad.left}" y="${height - 14}" class="chart-label">${xLabel}</text>
      <text x="18" y="${pad.top + 8}" class="chart-label" transform="rotate(-90 18 ${pad.top + 8})">${yLabel}</text>
    `)}
  `;
}

function renderWaterfall(container, scenario) {
  const rows = [
    { label: "MBS leg", value: scenario.stressedMbsDv01, tone: "positive" },
    { label: "Swap hedge", value: -scenario.swapDv01, tone: "negative" },
    { label: "Swaption", value: scenario.swaptionDv01, tone: "positive" },
    { label: "Net", value: scenario.netAfterOption, tone: scenario.netAfterOption >= 0 ? "positive" : "negative", emphasis: true },
  ];
  const max = Math.max(0.05, ...rows.map((row) => Math.abs(row.value)));

  container.innerHTML = rows.map((row) => {
    const width = (Math.abs(row.value) / max) * 100;
    return `
      <div class="waterfall-row ${row.emphasis ? "waterfall-row--emphasis" : ""}">
        <div class="waterfall-label">${row.label}</div>
        <div class="waterfall-track">
          <div class="waterfall-center"></div>
          <div class="waterfall-fill waterfall-fill--${row.tone}" style="width:${width}%; ${row.value < 0 ? "right: 50%;" : "left: 50%;"}"></div>
        </div>
        <div class="waterfall-value">${fmtDv01(row.value)}</div>
      </div>
    `;
  }).join("");
}

function renderLadder(container, params) {
  container.innerHTML = LADDER.map((shockBp) => {
    const scenario = computeScenario(params, shockBp);
    const tone = stateTone(scenario.netAfterOption);
    const label = stateLabel(scenario.netAfterOption);
    return `
      <tr>
        <td>${fmtShock(shockBp)}</td>
        <td>${fmtYears(scenario.stressedDuration)}</td>
        <td>${fmtDv01(scenario.netAfterOption)}</td>
        <td class="${tone}">${label}</td>
      </tr>
    `;
  }).join("");
}

function buildNarrative(params, current, selected, shockBp) {
  const currentNet = current.baseMbsDv01 - current.swapDv01;
  const state = stateLabel(selected.netAfterOption).toLowerCase();
  const moveType = shockBp < 0 ? "rally" : shockBp > 0 ? "selloff" : "flat curve";

  return `
    <div class="narrative-head">
      <p class="narrative-label">Live interpretation</p>
      <p class="narrative-summary">
        Current net exposure ${fmtDv01(currentNet)}. After a ${fmtShock(shockBp)} move, the book ends at ${fmtDv01(selected.netAfterOption)} and is ${state}.
      </p>
    </div>
    <div class="narrative-grid">
      <article class="narrative-card">
        <span class="narrative-card__label">Starting point</span>
        <h3>Mortgage leg and swap hedge</h3>
        <p>
          The mortgage position contributes ${fmtDv01(current.baseMbsDv01)} of DV01. The swap hedge contributes ${fmtDv01(current.swapDv01)}.
        </p>
      </article>
      <article class="narrative-card">
        <span class="narrative-card__label">Rate move</span>
        <h3>${fmtShock(shockBp)} ${moveType}</h3>
        <p>
          The stressed duration becomes ${fmtYears(selected.stressedDuration)}, which changes mortgage DV01 to ${fmtDv01(selected.stressedMbsDv01)}.
        </p>
      </article>
      <article class="narrative-card">
        <span class="narrative-card__label">Result</span>
        <h3>Net book after hedge</h3>
        <p>
          After the swap and option overlay, the position finishes at ${fmtDv01(selected.netAfterOption)}.
        </p>
      </article>
    </div>
  `;
}

function buildMathText(params, current, selected, shockBp) {
  const rally = Math.max(0, -shockBp);
  const selloff = Math.max(0, shockBp);
  const rallyDrop = (rally / 100) * (1.25 + rally / 300);
  const selloffLift = (selloff / 100) * (0.82 + selloff / 420);
  const activation = swaptionActivation(shockBp, params.swaptionEnabled);

  els.mathCurrentDv01.textContent =
    `MBS DV01 = ${params.mbsValue.toFixed(1)} x ${params.baseDuration.toFixed(2)} / 10,000 = ${fmtDv01(current.baseMbsDv01)}.`;

  els.mathNetHedge.textContent =
    `Net DV01 = ${fmtDv01(current.baseMbsDv01)} - ${fmtDv01(current.swapDv01)} = ${fmtDv01(current.baseMbsDv01 - current.swapDv01)}.`;

  els.mathDuration.textContent =
    `Stressed duration = clamp(${params.baseDuration.toFixed(2)} - ${rallyDrop.toFixed(3)} + ${selloffLift.toFixed(3)}, 1.25, 9.5) = ${fmtYears(selected.stressedDuration)}.`;

  els.mathSwaption.textContent =
    `Swaption DV01 = ${params.swaptionNotional.toFixed(1)} x 3.5 x ${activation.toFixed(3)} / 10,000 = ${fmtDv01(selected.swaptionDv01)}.`;
}

function update() {
  const params = {
    mbsValue: parseNumber(els.mbsValue, 500),
    baseDuration: parseNumber(els.baseDuration, 5.5),
    swapNotional: parseNumber(els.swapNotional, 700),
    swapDuration: parseNumber(els.swapDuration, 4.0),
    swaptionNotional: parseNumber(els.swaptionNotional, 250),
    swaptionEnabled: els.swaptionEnabled.checked,
  };
  const shockBp = parseNumber(els.rateShock, -75);

  const current = computeScenario(params, 0);
  const selected = computeScenario(params, shockBp);
  els.rateShockOutput.textContent = fmtShock(shockBp);
  els.currentMbsDv01.textContent = fmtDv01(current.baseMbsDv01);
  els.currentSwapDv01.textContent = fmtDv01(current.swapDv01);
  els.currentNetDv01.textContent = fmtDv01(current.baseMbsDv01 - current.swapDv01);
  const estimatedPnl = -(current.baseMbsDv01 - current.swapDv01) * shockBp;
  els.estimatedPnl.textContent = fmtPnL(estimatedPnl);
  els.selectedDuration.textContent = fmtYears(selected.stressedDuration);
  els.selectedShockLabel.textContent = fmtShock(shockBp);
  els.selectedShockNote.textContent = shockBp < 0
    ? "Negative shocks represent rallies and generally shorten mortgage duration."
    : shockBp > 0
      ? "Positive shocks represent selloffs and generally extend mortgage duration."
      : "Zero shock is the reference case.";
  els.swaptionBenefit.textContent = fmtDv01(selected.swaptionDv01);
  els.swaptionNote.textContent = selected.swaptionDv01 > 0
    ? "The option overlay contributes positive DV01 in this scenario."
    : "The selected shock is not deep enough to activate the option overlay.";
  els.hedgeState.textContent = stateLabel(selected.netAfterOption);
  els.hedgeState.className = stateTone(selected.netAfterOption);
  els.hedgeNote.textContent = selected.netAfterOption > 0
    ? "The resulting book remains long duration."
    : selected.netAfterOption < 0
      ? "The resulting book is short duration."
      : "The resulting book is approximately balanced.";
  els.hedgeGap.textContent = fmtDv01(selected.netAfterOption);
  els.hedgeGapNote.textContent = Math.abs(selected.netAfterOption) <= 0.03
    ? "The result is near flat."
    : selected.netAfterOption > 0
      ? "The hedge leaves residual long duration."
      : "The hedge leaves residual short duration.";

  els.marketNarrative.innerHTML = buildNarrative(params, current, selected, shockBp);
  buildMathText(params, current, selected, shockBp);
  els.mathPnl.textContent = `Estimated P&L = ${fmtDv01(current.baseMbsDv01 - current.swapDv01)} x ${shockBp.toFixed(0)} bp = ${fmtPnL(estimatedPnl)}.`;

  renderLineChart(els.durationChart, {
    series: [
      {
        name: "Starting duration",
        color: "#1f2730",
        points: SHOCKS.map((shock) => ({ x: shock, y: params.baseDuration })),
      },
      {
        name: "Stressed duration",
        color: "#9c6b24",
        points: SHOCKS.map((shock) => ({ x: shock, y: durationForShock(params.baseDuration, shock) })),
      },
    ],
    focusX: shockBp,
    yFormatter: (value) => `${value.toFixed(1)}y`,
    yLabel: "Years of duration",
    xLabel: "Rate move in basis points",
  });

  renderLineChart(els.dv01Chart, {
    series: [
      {
        name: "Swap only",
        color: "#0d7f79",
        points: SHOCKS.map((shock) => ({ x: shock, y: computeScenario(params, shock).netBeforeOption })),
      },
      {
        name: "Swap plus option",
        color: "#9c6b24",
        points: SHOCKS.map((shock) => ({ x: shock, y: computeScenario(params, shock).netAfterOption })),
      },
    ],
    focusX: shockBp,
    yFormatter: fmtDv01,
    yLabel: "Net DV01",
    xLabel: "Rate move in basis points",
    showZeroLine: true,
  });

  renderWaterfall(els.stackChart, selected);
  renderLadder(els.scenarioRows, params);

  document.querySelectorAll(".chip").forEach((chip) => {
    chip.classList.toggle("is-active", Number(chip.dataset.shock) === shockBp);
  });
}

[
  ["mbsValue", "mbsValueRange"],
  ["baseDuration", "baseDurationRange"],
  ["swapNotional", "swapNotionalRange"],
  ["swapDuration", "swapDurationRange"],
  ["swaptionNotional", "swaptionNotionalRange"],
].forEach(([numberId, rangeId]) => {
  const numberEl = els[numberId];
  const rangeEl = els[rangeId];
  const sync = (source) => {
    const value = source.value;
    numberEl.value = value;
    rangeEl.value = value;
    update();
  };
  numberEl.addEventListener("input", () => sync(numberEl));
  rangeEl.addEventListener("input", () => sync(rangeEl));
});

els.swaptionEnabled.addEventListener("input", update);
els.rateShock.addEventListener("input", update);

document.querySelectorAll(".chip").forEach((button) => {
  button.addEventListener("click", () => {
    els.rateShock.value = button.dataset.shock;
    update();
  });
});

update();
