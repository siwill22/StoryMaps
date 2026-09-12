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
 *
 * `#projection-toggle` switches the Globe between 'orthographic' (default) and
 * 'robinson' at runtime via Globe.setProjection() (shared/js/globe.js) -- a flat,
 * pannable world map instead of a rotatable sphere. Continents and boundaries are NOT
 * drawn through the vendored PolygonLayer/BoundarySeries in Robinson mode: a filled
 * continent or a long boundary CAN cross the seam, and neither vendored class has any
 * notion of a projection with one (see globe.js's own comment on `projector.axis`).
 * drawContinentsRobinson()/drawBoundariesRobinson() below read those classes'
 * already-reconstructed `xyz`/ring-or-feature metadata (same reach-in-and-parallel-draw
 * pattern pieLayer.js already uses for PointLayer, not a change to either vendored
 * file) and split each ring/line at the seam via shared/js/robinsonSeams.js before
 * filling/stroking it. Velocity arrows are short (a few degrees at most) so never need
 * that same ring/line clip, but still need their OWN fix: drawVelocitiesRobinson()
 * projects an arrow's base and tip through a shared delta rather than two independent
 * `Globe.project()` calls, so a short arrow whose base or tip sits near the seam
 * doesn't have its two ends independently wrapped to opposite sides (see that
 * function's own comment). The sample/pie layer draws through `globe.projector`/
 * `globe.project()` unchanged in either mode -- a pie glyph is a single point, not a
 * line between two points, so an independent per-point wrap near the seam can only
 * flip which side a whole glyph renders on for one frame, never stretch a shape across
 * the map; left as-is. The ocean-disc overlay switches to traceRobinsonOutline() in
 * Robinson mode, since the outline isn't a circle there.
 */

import { Globe } from '../../shared/js/globe.js';
import { vec3ToLonLat, DEG } from '../../shared/js/geo.js';
import { splitRingAtSeam, splitLineAtSeam, wrapLon } from '../../shared/js/robinsonSeams.js';
import { BoundarySeries, VelocityField, PointLayer, PolygonLayer,
         DEFAULT_STYLE as BOUNDARY_STYLE }
  from '../../shared/vendor/deep-time-map/js/index.js';
import { travel } from '../../shared/vendor/deep-time-map/js/sphere.js';
import { attachHover } from '../../shared/vendor/deep-time-map/js/hover.js';
import { attachTimeSeries }
  from '../../shared/vendor/deep-time-map/js/timeseries-panel.js';
import { lagColour, lagRampCss, drawPieGlyphs,
         cawoodColour, barhamColour, barhamClassify, CAWOOD_COLOURS, BARHAM_COLOURS,
         UNCLASSIFIED_COLOUR }
  from './pieLayer.js';

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

// Mutated by buildColourModeControl()'s slider handler; read by the popup formatter
// (formatSample/POPUP_ROWS below) and by the pie overlay's own draw call in main() so
// both always agree with whatever the legend's slider currently shows.
let currentBarhamThreshold = 20;

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
  ['cawood_class', 'Tectonic setting (Cawood)', (v) => v],
  // barham_ratio is a raw statistic, not a class -- classify it here with whatever
  // threshold the legend's slider is currently set to, so the popup always agrees with
  // however the map is coloured right now, not a value baked in at build time.
  ['barham_ratio', 'Tectonic setting (Barham)',
    (v) => `${barhamClassify(v, currentBarhamThreshold)} (ratio ${fmt(v)}, ` +
           `threshold ${currentBarhamThreshold})`],
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

// Robinson has no raster background on this page (see PROJECTION_TOGGLE below) -- this
// page never calls globe.loadTextures(), so the WebGL raster's real inverse-Robinson
// shader (shared/js/globe.js) never actually draws anything here, ortho or Robinson
// alike. The ocean therefore still has to be a 2D vector shape, which for orthographic is
// simply the circle `ctx.arc()` always drew; Robinson's own outline is not a circle, so it
// is traced here from Globe's own public project() at a fixed set of latitudes along the
// current central meridian's antimeridian -- the map's left/right edges. A tiny epsilon
// keeps the two edges off the exact antimeridian, which project()/robinsonForward()
// normalise to a single wrapped value (there is only one antimeridian, so asking for both
// +180 and -180 the exact way would collapse the right edge onto the left one).
const ROBINSON_OUTLINE_STEPS = 90;
const ROBINSON_OUTLINE_EPS = 0.01;

function traceRobinsonOutline(ctx, g) {
  const centreLon = g.state.lon ?? 0;
  for (let i = 0; i <= ROBINSON_OUTLINE_STEPS; i++) {
    const lat = -90 + (180 * i) / ROBINSON_OUTLINE_STEPS;
    const [x, y] = g.project(centreLon - 180 + ROBINSON_OUTLINE_EPS, lat);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  for (let i = ROBINSON_OUTLINE_STEPS; i >= 0; i--) {
    const lat = -90 + (180 * i) / ROBINSON_OUTLINE_STEPS;
    const [x, y] = g.project(centreLon + 180 - ROBINSON_OUTLINE_EPS, lat);
    ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/**
 * Continent fill/outline for Robinson mode -- NOT drawn through the vendored
 * `PolygonLayer.draw()`, which has no notion of a projection with a seam to split a
 * ring at (see globe.js's own comment on `projector.axis`, and this file's own top
 * comment). Reads `continents`' own already-reconstructed `xyz`/`rings` -- the exact
 * fields `PolygonLayer.draw()` itself reads, just from outside the class, the same
 * reach-in-and-parallel-draw pattern pieLayer.js already uses for PointLayer -- so
 * this stays current with plate rotation for free; only the seam-splitting and
 * projection are new. `robinsonSeams.js`'s `splitRingAtSeam()` does the actual split;
 * every resulting piece is projected with `g.projectDelta()`, never `g.project()` --
 * see that module's own comment on why the two are not interchangeable here.
 */
function drawContinentsRobinson(ctx, continents, g) {
  if (!continents.visible || continents.currentTime == null) return;

  const { fill, stroke, lineWidth, outline } = continents.options;
  const time = continents.currentTime;
  const xyz = continents.xyz;
  const centreLon = g.state.lon ?? 0;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();

  for (const ring of continents.rings) {
    if (!continents.isLive(ring, time)) continue;

    const lonLat = [];
    for (let k = 0; k <= ring.count; k++) {
      const i = (ring.offset + (k % ring.count)) * 3;
      lonLat.push(vec3ToLonLat([xyz[i], xyz[i + 1], xyz[i + 2]]));
    }
    if (lonLat.length < 4) continue;

    for (const piece of splitRingAtSeam(lonLat, centreLon)) {
      if (piece.length < 3) continue;
      const pts = piece.map(([dLon, lat]) => g.projectDelta(dLon, lat));
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    }
  }

  if (!outline && fill) {
    ctx.fillStyle = fill;
    ctx.fill('nonzero');
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Boundary lines for Robinson mode -- same reasoning as drawContinentsRobinson()
 * above, reading `series.current` (a `BoundaryLayer`)'s own `xyz`/`features` from
 * outside the vendored class rather than changing it. Subduction-polarity triangles
 * are NOT drawn here -- BoundaryLayer's own triangle placement resolves which side of
 * the line is "downhill" using the projected screen-space normal, tied to its own
 * internal tracePolyline() call and not something this can cheaply reuse against a
 * seam-split line without duplicating a fair amount of that logic for a decorative
 * detail; left as a known simplification, not an oversight.
 */
function drawBoundariesRobinson(ctx, series, g) {
  const layer = series.current;
  if (!layer) return;

  const xyz = layer.xyz;
  const { style } = layer.options;
  const centreLon = g.state.lon ?? 0;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  for (const type of ['other', 'transform', 'ridge', 'subduction']) {
    if (!layer.visible[type]) continue;
    ctx.strokeStyle = style[type].stroke;
    ctx.lineWidth = style[type].width;
    ctx.beginPath();

    for (const f of layer.features) {
      if (f.type !== type) continue;

      const lonLat = [];
      for (let k = 0; k < f.count; k++) {
        const i = (f.offset + k) * 3;
        lonLat.push(vec3ToLonLat([xyz[i], xyz[i + 1], xyz[i + 2]]));
      }
      if (lonLat.length < 2) continue;

      for (const piece of splitLineAtSeam(lonLat, centreLon)) {
        if (piece.length < 2) continue;
        const pts = piece.map(([dLon, lat]) => g.projectDelta(dLon, lat));
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      }
    }
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Velocity arrows for Robinson mode. Each arrow is only a couple of degrees long (see
 * VelocityField's own comment on its `scale` option), so it never needs the full
 * ring/line clip above -- but a SHORT segment straddling the seam is still broken by
 * `Globe.project()`'s per-point wrap: base and tip are each re-derived and re-wrapped
 * independently against `centreLonDeg`, so a base sitting at +179.9 degrees and a tip
 * one degree further at (raw) +180.9 come back as +179.9 and -179.1 -- correct
 * individually, but the straight line between them now cuts straight across the whole
 * map instead of the one-degree hop it actually is. This is the same class of bug
 * `robinsonSeams.js` documents for rings/lines, just with the fix inlined here rather
 * than pulled through the clip machinery, since a two-point segment has nothing to clip
 * -- only the tip's delta needs to be reconstructed relative to the base's, not
 * re-wrapped from centreLonDeg on its own: `wrapLon(tipLon - baseLon)` is always a small
 * hop (well under 180 degrees at any real plate speed), so adding it to the base's own
 * wrapped delta keeps both ends on the same side of the seam, and `Globe.projectDelta()`
 * projects that pair with no further wrap. Reads `VelocityField`'s own already-computed
 * `base`/`east`/`north` arrays and its `travel()` tip calculation (shared/vendor
 * `sphere.js`, identical to what `VelocityField.draw()` itself calls) rather than
 * changing the vendored class -- same reach-in pattern as the two functions above.
 */
function drawVelocitiesRobinson(ctx, velocities, g) {
  if (!velocities.visible || !velocities.current) return;
  const [ve, vn] = velocities.current;
  const { colour, shaftWidth, minSpeed, scale, headLength, headWidth } = velocities.options;
  const centreLon = g.state.lon ?? 0;

  const base = [0, 0, 0], dir = [0, 0, 0], tip = [0, 0, 0];
  const ends = [];

  for (let i = 0; i < velocities.count; i++) {
    const e = ve[i];
    const n = vn[i];
    const speed = Math.hypot(e, n);
    if (speed < minSpeed) continue;

    const i3 = i * 3;
    base[0] = velocities.base[i3];
    base[1] = velocities.base[i3 + 1];
    base[2] = velocities.base[i3 + 2];

    for (let k = 0; k < 3; k++) {
      dir[k] = (velocities.east[i3 + k] * e + velocities.north[i3 + k] * n) / speed;
    }
    travel(base, dir, speed * scale * DEG, tip);

    const [baseLon, baseLat] = vec3ToLonLat(base);
    const [tipLon, tipLat] = vec3ToLonLat(tip);
    const baseDelta = wrapLon(baseLon - centreLon);
    const tipDelta = baseDelta + wrapLon(tipLon - baseLon);

    const a = g.projectDelta(baseDelta, baseLat);
    const b = g.projectDelta(tipDelta, tipLat);
    ends.push(a[0], a[1], b[0], b[1]);
  }

  ctx.save();
  ctx.strokeStyle = colour;
  ctx.fillStyle = colour;
  ctx.lineWidth = shaftWidth;
  ctx.lineCap = 'round';

  const w = headWidth * 0.5;

  ctx.beginPath();
  for (let i = 0; i < ends.length; i += 4) {
    const x0 = ends[i], y0 = ends[i + 1], x1 = ends[i + 2], y1 = ends[i + 3];
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 1.5) continue;
    const ux = (x1 - x0) / len, uy = (y1 - y0) / len;
    const head = Math.min(headLength, len * 0.6);
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1 - ux * head, y1 - uy * head);
  }
  ctx.stroke();

  ctx.beginPath();
  for (let i = 0; i < ends.length; i += 4) {
    const x0 = ends[i], y0 = ends[i + 1], x1 = ends[i + 2], y1 = ends[i + 3];
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 1.5) continue;
    const ux = (x1 - x0) / len, uy = (y1 - y0) / len;
    const head = Math.min(headLength, len * 0.6);
    const px = -uy, py = ux;
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - ux * head + px * w, y1 - uy * head + py * w);
    ctx.lineTo(x1 - ux * head - px * w, y1 - uy * head - py * w);
    ctx.lineTo(x1, y1);
  }
  ctx.fill();

  ctx.restore();
}

/** Wires a panel's collapse/expand toggle. The legend and the timebar both use this same
 *  pattern -- a `.panel-toggle` button that hides everything else in the panel via
 *  `.is-collapsed` -- so either can be gotten out of the way of the globe entirely,
 *  rather than only ever being resized by the browser window. */
function attachCollapse(panelEl, toggleEl) {
  toggleEl.addEventListener('click', () => {
    const collapsed = panelEl.classList.toggle('is-collapsed');
    toggleEl.setAttribute('aria-expanded', String(!collapsed));
    toggleEl.textContent = collapsed ? '+' : '−';
  });
}

/** Wires the globe/Robinson projection toggle. Dragging still just adjusts `view.lon`/
 *  `view.lat` (attachControls(), unchanged) -- Globe.render() reads `lon` as the Robinson
 *  central meridian and ignores `lat` entirely in that mode, so panning/zooming keep
 *  working with no changes to the drag handler itself; only the button's own label and
 *  Globe's cached shader program change. */
function attachProjectionToggle(globe, toggleEl, render) {
  toggleEl.addEventListener('click', () => {
    const next = globe.projection === 'robinson' ? 'orthographic' : 'robinson';
    globe.setProjection(next);
    toggleEl.textContent = next === 'robinson' ? 'Globe view' : 'Robinson view';
    toggleEl.setAttribute('aria-pressed', String(next === 'robinson'));
    render();
  });
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

  const colourControl = buildColourModeControl(samples);

  // Ocean disc first, then continents/boundaries/velocities, then the sample layer's
  // (invisible) symbols -- and finally the pie glyphs, which must run AFTER
  // samples.draw() in the same frame since that call is what populates the screen
  // positions and resolves any open spiderfy fan (see pieLayer.js's own comment).
  globe.addOverlay((ctx, g) => {
    ctx.save();
    ctx.beginPath();
    if (g.projection === 'robinson') traceRobinsonOutline(ctx, g);
    else ctx.arc(g.cx, g.cy, g.radius, 0, Math.PI * 2);
    ctx.fillStyle = OCEAN;
    ctx.fill();
    ctx.strokeStyle = OCEAN_EDGE;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  });
  globe.addOverlay((ctx, g) => {
    if (g.projection === 'robinson') drawContinentsRobinson(ctx, continents, g);
    else continents.draw(ctx, g.projector);
  });
  globe.addOverlay((ctx, g) => {
    if (g.projection === 'robinson') drawBoundariesRobinson(ctx, series, g);
    else series.draw(ctx, g.projector);
  });
  globe.addOverlay((ctx, g) => {
    if (g.projection === 'robinson') drawVelocitiesRobinson(ctx, velocities, g);
    else velocities.draw(ctx, g.projector);
  });
  globe.addOverlay((ctx, g) => samples.draw(ctx, g.projector));
  globe.addOverlay((ctx) => drawPieGlyphs(ctx, samples,
    { ...PIE_OPTIONS, mode: colourControl.getMode(), barhamThreshold: currentBarhamThreshold }));

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
  colourControl.onRender(scheduleRender);

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
  attachCollapse(document.getElementById('legend'), document.getElementById('legend-toggle'));
  attachCollapse(document.getElementById('timebar'), document.getElementById('timebar-toggle'));
  attachProjectionToggle(globe, document.getElementById('projection-toggle'), scheduleRender);
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

/** Wires the "colour by" pill buttons plus the Barham threshold slider. The threshold
 *  itself lives in the module-level `currentBarhamThreshold` (shared with the popup
 *  formatter above); this returns only `getMode()`, which main()'s pie overlay reads
 *  every frame alongside that same module-level threshold.
 *
 *  Class counts shown in the legend are over the WHOLE dataset (all 16,477 samples,
 *  every depositional age), not just samples currently inside their 5 Myr window -- a
 *  class is a fixed property of the sample, unlike the live sample count next to the
 *  layer's own toggle, so a count that changed as the reconstruction scrubbed would be
 *  reporting something about the window, not about the classification. */
function buildColourModeControl(samples) {
  const buttons = [...document.querySelectorAll('#colour-mode button')];
  const rampWrap = document.getElementById('age-ramp-wrap');
  const classLegend = document.getElementById('class-legend');
  const thresholdWrap = document.getElementById('barham-threshold');
  const thresholdSlider = document.getElementById('barham-threshold-slider');
  const thresholdValue = document.getElementById('barham-threshold-value');

  let mode = 'lag';
  let render = () => {};

  function classLegendRow(colour, label, count) {
    return `<li><span class="swatch" style="background:${colour}"></span>` +
      `<span>${label} <span class="legend-count">· ${count.toLocaleString()}</span></span></li>`;
  }

  // Same setting names for both classifications' shared A/C colours (see pieLayer.js's
  // own comment on why Barham reuses Cawood's palette) -- Barham has no collisional
  // middle category, so only A and C ever appear here.
  const CAWOOD_LABELS = { A: 'A — convergent', B: 'B — collisional', C: 'C — divergent / intraplate' };
  const BARHAM_LABELS = { A: 'A — convergent-like', B: 'B — divergent-like' };

  function renderClassLegend() {
    if (mode === 'cawood') {
      const counts = { A: 0, B: 0, C: 0 };
      for (const point of samples.points) {
        if (point.cawood_class in counts) counts[point.cawood_class]++;
      }
      classLegend.innerHTML = ['A', 'B', 'C']
        .map((cls) => classLegendRow(cawoodColour(cls), CAWOOD_LABELS[cls], counts[cls]))
        .join('');
    } else if (mode === 'barham') {
      const counts = { A: 0, B: 0 };
      let none = 0;
      for (const point of samples.points) {
        const cls = barhamClassify(point.barham_ratio, currentBarhamThreshold);
        if (cls) counts[cls]++; else none++;
      }
      classLegend.innerHTML =
        ['A', 'B'].map((cls) => classLegendRow(barhamColour(cls), BARHAM_LABELS[cls], counts[cls])).join('') +
        classLegendRow(UNCLASSIFIED_COLOUR, 'Too few grains', none);
    }
  }

  function applyMode(next) {
    mode = next;
    for (const btn of buttons) {
      const active = btn.dataset.mode === mode;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    }
    rampWrap.hidden = mode !== 'lag';
    classLegend.hidden = mode === 'lag';
    thresholdWrap.hidden = mode !== 'barham';
    if (mode !== 'lag') renderClassLegend();
  }

  for (const btn of buttons) {
    btn.addEventListener('click', () => {
      if (btn.dataset.mode === mode) return;
      applyMode(btn.dataset.mode);
      render();
    });
  }

  thresholdSlider.addEventListener('input', () => {
    currentBarhamThreshold = Number(thresholdSlider.value);
    thresholdValue.textContent = currentBarhamThreshold;
    renderClassLegend();
    render();
  });

  return {
    getMode: () => mode,
    onRender: (fn) => { render = fn; },
  };
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
