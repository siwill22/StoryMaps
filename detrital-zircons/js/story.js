/*
 * Prototype: detrital zircon samples (Puetz et al. 2026) reconstructed on a rotatable
 * orthographic globe, alongside the same reconstructed boundaries/continents/velocities
 * as ../plate-boundaries/ and ../zircons/. Adapted from ../zircons/js/story.js -- see
 * that file's own comments for anything not called out again here.
 *
 * The point layer itself carries no visible symbol of its own: every default circle is
 * drawn fully transparent (see the PointLayer.load options below), and js/pieLayer.js
 * paints a pie-chart glyph over each one instead, at a fixed size regardless of grain
 * count, reading the same `_screen`/`_live` arrays PointLayer.draw() just populated.
 * That gets position tracking through plate rotation, hover/pick and spiderfy clustering
 * for free from the vendored library, with no change to it -- a pie chart is this one
 * page's business, not the library's.
 *
 * A sample only appears within 5 Myr of its own depositional age (`lifespan: 'window'`)
 * -- this page is about when a rock was deposited, not that it still exists today. Each
 * pie's colour sweep is lag time (grain age minus depositional age), not absolute grain
 * age, rendered as a continuous conic gradient rather than flat wedges -- see
 * pieLayer.js's own comments for why.
 *
 * Frames are shown with hard cuts, not interpolated -- see BoundarySeries for why.
 */

import { Globe } from '../../shared/js/globe.js';
import { BoundarySeries, VelocityField, PointLayer, PolygonLayer,
         DEFAULT_STYLE as BOUNDARY_STYLE }
  from '../../shared/vendor/deep-time-map/js/index.js';
import { attachHover } from '../../shared/vendor/deep-time-map/js/hover.js';
import { attachTimeSeries }
  from '../../shared/vendor/deep-time-map/js/timeseries-panel.js';
import { lagColour, lagRampCss, drawPieGlyphs } from './pieLayer.js';

const BOUNDARY_MANIFEST = 'data/boundaries.json';
const VELOCITY_FILE = 'data/velocities.json';
const CONTINENT_FILE = 'data/continents.json';
const SAMPLE_FILE = 'data/points.json';

const START = { lon: -60, lat: 10, zoom: 1.0 };
// A sample only exists for a narrow AGE_WINDOW around its depositional age (see
// SAMPLE_STYLE below), so unlike the igneous zircon page's cumulative 'since' view there
// is no time that shows "everything so far" -- 0 Ma is simply where the youngest,
// still-forming sediments cluster, giving the densest initial view.
const START_TIME = 0;
const ZOOM_LIMITS = [0.6, 4.0];
const DEGREES_PER_RADIUS = 90;

const MODEL_CREDITS = {
  Merdith2021: 'Merdith et al. (2021)',
  Muller2019: 'Müller et al. (2019)',
  Muller2022: 'Müller et al. (2022)',
  Matthews2016: 'Matthews et al. (2016)',
  Cao2024: 'Cao et al. (2024)',
};

const PLAY_MYR_PER_SECOND = 25;

const OCEAN = '#0b2036';
const OCEAN_EDGE = 'rgba(143, 212, 240, 0.28)';
const CONTINENT_FILL = 'rgba(126, 140, 124, 0.62)';
const CONTINENT_EDGE = 'rgba(205, 222, 205, 0.45)';

// Gradient bin width -- must match build/build_detrital_zircons.py's BIN_WIDTH, which
// writes each spectrum entry as [bin_lo, count]. Passed straight through to
// drawPieGlyphs() so the two cannot silently disagree about bin width. `radius` is
// fixed: every pie draws the same size regardless of how many grains a sample has.
const PIE_OPTIONS = { binWidth: 20, radius: 7 };

// The point layer's own symbol is invisible -- pieLayer.js paints the actual glyph, at
// PIE_OPTIONS.radius. hitRadius/clusterRadius are sized a little past that fixed radius
// (rather than the library's point-sized defaults) so hover and spiderfy react to the
// whole visible disc, not just a tiny dot at its centre.
//
// `lifespan: 'window'` + `ageWindow: 5`: a sample is drawn only within 5 Myr of its
// depositional age, then disappears entirely -- this page is about WHEN a rock was
// deposited, not that the rock still exists today, so it uses the same rule the base
// metal deposit page did rather than the igneous zircon page's cumulative 'since'.
const SAMPLE_STYLE = {
  lifespan: 'window',
  ageWindow: 5,
  size: 0.001,
  fill: 'rgba(0, 0, 0, 0)',
  keyline: 'rgba(0, 0, 0, 0)',
  keylineWidth: 0,
  hitRadius: 12,
  clusterRadius: 20,
};

const TIME_SERIES = [
  {
    url: 'data/boundary_length.csv',
    series: {
      subduction_km: { label: 'Subduction', unit: 'km',
                       colour: BOUNDARY_STYLE.subduction.stroke },
    },
  },
];

const THUMB_WIDTH = 14;

const POPUP_ROWS = [
  ['age', 'Depositional age', (v) => `${fmt(v)} Ma`],
  ['dominant_lag', 'Dominant lag time', (v) => `~${fmt(v)} Myr`],
  ['n_grains', 'Dated grains', (v) => String(v)],
  ['rock_type', 'Rock type', (v) => v],
  ['locality', 'Locality', (v) => v],
  ['country', 'Region', (v) => v],
  ['continent', 'Continent', (v) => v],
  ['plate_id', 'Plate', (v) => v],
  ['reference', 'Reference key', (v) => v],
];

function fmt(v) {
  if (v == null) return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  if (n >= 100) return n.toFixed(0);
  if (n >= 10) return n.toFixed(1);
  return n.toFixed(2).replace(/\.?0+$/, '');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function main() {
  const stageEl = document.getElementById('stage');
  const globeEl = document.getElementById('globe');
  const loadingEl = document.getElementById('loading');
  const timecodeEl = document.getElementById('timecode');
  const scrubEl = document.getElementById('scrub');
  const playEl = document.getElementById('play');

  const globe = new Globe(globeEl, { projection: 'orthographic' });

  const view = { ...START, ...parseHash(location.hash) };
  let time = view.time ?? START_TIME;

  const [series, velocities, continents, samples] = await Promise.all([
    BoundarySeries.load(BOUNDARY_MANIFEST),
    VelocityField.load(VELOCITY_FILE),
    PolygonLayer.load(CONTINENT_FILE, {
      fill: CONTINENT_FILL,
      stroke: CONTINENT_EDGE,
      lineWidth: 0.7,
    }),
    PointLayer.load(SAMPLE_FILE, SAMPLE_STYLE),
  ]);

  const [minTime, maxTime] = series.timeRange;
  scrubEl.min = minTime;
  scrubEl.max = maxTime;

  const sliderToTime = (v) => maxTime - (Number(v) - minTime);
  const timeToSlider = (t) => maxTime - (t - minTime);

  const model = series.meta.model;
  document.getElementById('model-credit').textContent =
    MODEL_CREDITS[model] ?? model;

  // Ocean disc first, then continents/boundaries/velocities, then the sample layer's
  // (invisible) symbols -- and finally the pie glyphs, which must run AFTER
  // samples.draw() in the same frame since that call is what populates the screen
  // positions and resolves any open spiderfy fan (see pieLayer.js's own comment).
  globe.addOverlay((ctx, g) => {
    ctx.save();
    ctx.beginPath();
    ctx.arc(g.cx, g.cy, g.radius, 0, Math.PI * 2);
    ctx.fillStyle = OCEAN;
    ctx.fill();
    ctx.strokeStyle = OCEAN_EDGE;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  });
  globe.addOverlay((ctx, g) => continents.draw(ctx, g.projector));
  globe.addOverlay((ctx, g) => series.draw(ctx, g.projector));
  globe.addOverlay((ctx, g) => velocities.draw(ctx, g.projector));
  globe.addOverlay((ctx, g) => samples.draw(ctx, g.projector));
  globe.addOverlay((ctx) => drawPieGlyphs(ctx, samples, PIE_OPTIONS));

  const SCALE_SPEEDS = [200, 100, 50, 20, 10];
  const scaleLabelEl = document.getElementById('scale-label');
  const scaleArrowEl = document.getElementById('scale-arrow');
  let scaleRadius = null;

  function updateScaleLabel() {
    if (globe.radius === scaleRadius) return;
    scaleRadius = globe.radius;
    const pxFor = (kmPerMyr) => velocities.lengthFor(kmPerMyr, globe.radius);
    const speed = SCALE_SPEEDS.find((s) => pxFor(s) <= 56) ?? SCALE_SPEEDS.at(-1);
    const len = Math.max(12, pxFor(speed));
    scaleArrowEl.setAttribute('width', len + 10);
    scaleArrowEl.querySelector('line').setAttribute('x2', len);
    scaleArrowEl.querySelector('polygon')
      .setAttribute('points', `${len + 9},5 ${len - 1},9 ${len - 1},1`);
    scaleLabelEl.textContent = `${speed / 10} cm/yr`;
  }

  let timeseries = null;

  function render() {
    globe.set({ age: time, lon: view.lon, lat: view.lat, zoom: view.zoom });
    globe.render();
    timecodeEl.textContent = Math.round(time);
    updateScaleLabel();
    timeseries?.draw();
  }

  let renderFrame = null;
  function scheduleRender() {
    if (renderFrame !== null) return;
    renderFrame = requestAnimationFrame(() => {
      renderFrame = null;
      render();
    });
  }

  function setTime(next, { updateSlider = true } = {}) {
    time = Math.max(minTime, Math.min(maxTime, next));
    if (updateSlider) scrubEl.value = timeToSlider(time);
    velocities.setTime(time);
    continents.setTime(time);
    samples.setTime(time);
    timeseries?.setTime(time);
    updateSampleCount();
    series.setTime(time, scheduleRender);
    scheduleRender();
  }

  document.getElementById('velocity-toggle').addEventListener('click', (e) => {
    velocities.visible = !velocities.visible;
    e.currentTarget.classList.toggle('is-off', !velocities.visible);
    scheduleRender();
  });

  buildLegend(series, scheduleRender);
  const updateSampleCount = buildSampleLegend(samples, scheduleRender);
  buildAgeRamp();

  const caption = samples.meta.caption;
  if (caption) document.getElementById('points-credit').textContent = caption;

  attachHover({
    element: stageEl,
    popup: document.getElementById('point-popup'),
    layer: samples,
    render,
    format: formatSample,
  });

  try {
    timeseries = await attachTimeSeries({
      element: document.getElementById('timeseries'),
      sources: TIME_SERIES,
      range: [minTime, maxTime],
      thumbWidth: THUMB_WIDTH,
      mode: 'shade',
      onSeek: (t) => { stopPlaying(); setTime(t); },
      onRender: scheduleRender,
    });
    if (timeseries.clipping()) {
      document.getElementById('ts-note').textContent =
        'record extends beyond this range';
    }
  } catch (err) {
    console.warn('time series unavailable:', err.message);
  }

  attachControls(stageEl, globe, view, scheduleRender);
  window.addEventListener('resize', scheduleRender);

  scrubEl.addEventListener('input', () => {
    stopPlaying();
    setTime(sliderToTime(scrubEl.value), { updateSlider: false });
  });

  /* ---- playback --------------------------------------------------------- */

  let playing = null;

  function stopPlaying() {
    if (playing === null) return;
    cancelAnimationFrame(playing);
    playing = null;
    playEl.textContent = '▶';
  }

  function startPlaying() {
    playEl.textContent = '❚❚';
    let last = performance.now();
    const step = (now) => {
      const dt = Math.min((now - last) / 1000, 0.25);
      last = now;
      let next = time + dt * PLAY_MYR_PER_SECOND;
      if (next > maxTime) next = minTime;
      setTime(next);
      playing = requestAnimationFrame(step);
    };
    playing = requestAnimationFrame(step);
  }

  playEl.addEventListener('click', () => {
    if (playing === null) startPlaying(); else stopPlaying();
  });

  setTime(time);
  loadingEl.classList.add('is-done');
  setTimeout(() => { loadingEl.style.display = 'none'; }, 900);

  setTimeout(() => series.prefetchAll(), 4000);
}

function parseHash(hash) {
  const parts = hash.replace('#', '').split(',').map(Number);
  if (parts.length < 2 || parts.some(Number.isNaN)) return {};
  return {
    lon: parts[0],
    lat: parts[1],
    zoom: parts[2] ?? START.zoom,
    time: parts[3],
  };
}

function buildLegend(series, render) {
  const list = document.getElementById('legend-items');

  for (const [type, style] of Object.entries(BOUNDARY_STYLE)) {
    const li = document.createElement('li');
    const swatch = type === 'subduction'
      ? `<span class="swatch swatch-sz" style="background:${style.stroke}">` +
        `<i style="border-bottom-color:${style.stroke}"></i></span>`
      : `<span class="swatch" style="background:${style.stroke}"></span>`;
    li.innerHTML = swatch + `<span>${style.label}</span>`;
    li.addEventListener('click', () => {
      series.visible[type] = !series.visible[type];
      li.classList.toggle('is-off', !series.visible[type]);
      render();
    });
    list.appendChild(li);
  }
}

/** One row: a mini pie (fixed, decorative) and a live count of samples currently within
 *  their 5 Myr window, doubling as the whole layer's on/off toggle. There is only one
 *  category of point on this page -- unlike the igneous zircon page's felsic/mafic split
 *  -- so there is nothing to filter by type, just the layer as a whole. */
function buildSampleLegend(samples, render) {
  const list = document.getElementById('sample-items');
  const li = document.createElement('li');
  li.innerHTML =
    `<span class="swatch swatch-sym">${miniPie()}</span>` +
    `<span>Samples<span class="legend-count" id="sample-count" ` +
    `style="color:var(--ink-dim)"> · 0</span></span>`;
  li.title = `${samples.count} samples with a depositional age <= 1000 Ma`;
  const countEl = li.querySelector('#sample-count');

  li.addEventListener('click', () => {
    samples.visible = !samples.visible;
    li.classList.toggle('is-off', !samples.visible);
    render();
  });
  list.appendChild(li);

  return function updateCount() {
    countEl.textContent = ` · ${samples.liveCount()}`;
  };
}

/** Miniature three-wedge pie for the legend row, using the same lag-time ramp the real
 *  glyphs draw from -- three fixed lag times spread across the ramp, not real data,
 *  purely to show "this row means a pie chart". */
function miniPie() {
  const stops = [0, 250, 500];
  const angles = [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3, 2 * Math.PI];
  let paths = '';
  for (let i = 0; i < stops.length; i++) {
    const a0 = angles[i];
    const a1 = angles[i + 1];
    const x0 = 7 + 6 * Math.cos(a0 - Math.PI / 2);
    const y0 = 7 + 6 * Math.sin(a0 - Math.PI / 2);
    const x1 = 7 + 6 * Math.cos(a1 - Math.PI / 2);
    const y1 = 7 + 6 * Math.sin(a1 - Math.PI / 2);
    paths += `<path d="M7,7 L${x0.toFixed(2)},${y0.toFixed(2)} ` +
      `A6,6 0 0,1 ${x1.toFixed(2)},${y1.toFixed(2)} Z" fill="${lagColour(stops[i])}"/>`;
  }
  return `<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">${paths}</svg>`;
}

function buildAgeRamp() {
  document.getElementById('age-ramp').style.background =
    `linear-gradient(to right, ${lagRampCss()})`;
}

/** Popup body for one detrital sample. */
function formatSample(point) {
  const rows = [];
  for (const [key, label, render] of POPUP_ROWS) {
    const value = point[key];
    if (value == null || value === '') continue;
    rows.push(`<dt>${label}</dt><dd>${escapeHtml(render(value, point))}</dd>`);
  }

  const name = point.sample_id || point.locality || 'Unnamed sample';

  return (
    `<span class="pp-type">Detrital zircon sample</span>` +
    `<h3>${escapeHtml(name)}</h3>` +
    (rows.length ? `<dl>${rows.join('')}</dl>` : '')
  );
}

function attachControls(stageEl, globe, view, render) {
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  stageEl.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    stageEl.classList.add('is-dragging');
    stageEl.setPointerCapture(e.pointerId);
  });

  stageEl.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const scale = DEGREES_PER_RADIUS / (globe.radius || 1);
    view.lon -= (e.clientX - lastX) * scale;
    view.lat += (e.clientY - lastY) * scale;
    view.lat = Math.max(-89.9, Math.min(89.9, view.lat));
    if (view.lon > 180) view.lon -= 360;
    if (view.lon < -180) view.lon += 360;
    lastX = e.clientX;
    lastY = e.clientY;
    render();
  });

  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    stageEl.classList.remove('is-dragging');
    stageEl.releasePointerCapture?.(e.pointerId);
  };
  stageEl.addEventListener('pointerup', endDrag);
  stageEl.addEventListener('pointercancel', endDrag);

  stageEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0015);
    view.zoom = Math.max(ZOOM_LIMITS[0], Math.min(ZOOM_LIMITS[1], view.zoom * factor));
    render();
  }, { passive: false });
}

main().catch((err) => {
  console.error(err);
  const el = document.getElementById('loading');
  if (el) el.textContent = 'Could not load: ' + err.message;
});
