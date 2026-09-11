/*
 * Prototype: igneous zircon samples (Puetz et al. 2026) reconstructed on a rotatable
 * orthographic globe, alongside the same reconstructed boundaries/continents/velocities
 * as ../plate-boundaries/. Adapted from that page's js/story.js -- see its own comments
 * for anything not called out again here. The base metal deposit layer is gone; this is
 * the same page with a different point dataset and a different display rule for it.
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

const BOUNDARY_MANIFEST = 'data/boundaries.json';
const VELOCITY_FILE = 'data/velocities.json';
const CONTINENT_FILE = 'data/continents.json';
const ZIRCON_FILE = 'data/points.json';

const START = { lon: -60, lat: 10, zoom: 1.0 };
// 300 Ma shows a decent accumulated backdrop of already-formed samples plus a legible
// bright band, without either an almost-empty globe (near 1000 Ma) or the full pile
// (near 0 Ma).
const START_TIME = 300;
const ZOOM_LIMITS = [0.6, 4.0];

// A drag across one globe radius turns the Earth by this much. Fixed in screen
// terms rather than in degrees per pixel, so the globe tracks the pointer at the
// same rate whatever the window size or zoom.
const DEGREES_PER_RADIUS = 90;

// Credit strings for the models this page can be built against. The manifest records
// which one produced the frames, so the attribution on the page follows the data
// instead of having to be remembered when MODEL_NAME changes in the build script.
const MODEL_CREDITS = {
  Merdith2021: 'Merdith et al. (2021)',
  Muller2019: 'Müller et al. (2019)',
  Muller2022: 'Müller et al. (2022)',
  Matthews2016: 'Matthews et al. (2016)',
  Cao2024: 'Cao et al. (2024)',
};

// Playback rate. The page's range is 4x plate-boundaries' (1000 Ma against 250), so the
// rate is raised to match -- otherwise one pass through the whole record takes over a
// minute and a half.
const PLAY_MYR_PER_SECOND = 25;

const OCEAN = '#0b2036';
const OCEAN_EDGE = 'rgba(143, 212, 240, 0.28)';
const CONTINENT_FILL = 'rgba(126, 140, 124, 0.62)';
const CONTINENT_EDGE = 'rgba(205, 222, 205, 0.45)';

/*
 * Colour by rock type, bright and faint variants. Chosen to sit clear of the boundary
 * warms (#ffd8c2/#ff6b6b/#ffc857) and the pale-blue velocity arrows, the same way the
 * base-metal families did. Felsic (silica-rich, pale rock in hand sample) gets the warm
 * pink; mafic (iron/magnesium-rich, dark rock) gets the green -- an association with the
 * rock's own colour, not an arbitrary pairing.
 *
 * Bright is a saturated, punchy version of the hue (not just "the colour" -- the first
 * cut was too close to the faint variant once both were on screen together); faint is the
 * same hue at low alpha, dropped further than the first cut so the contrast between
 * "just formed" and "formed long ago" reads at a glance across a dense, mostly-faint globe.
 */
const ZIRCON_COLOUR = {
  Felsic: { bright: '#ff5fae', faint: 'rgba(255, 95, 174, 0.07)' },
  Mafic:  { bright: '#19e88f', faint: 'rgba(25, 232, 143, 0.07)' },
};

/*
 * Quantities charted under the slider, and where they come from.
 *
 * Ridge and transform length are dropped from plate-boundaries' own three-row chart --
 * this page is about the zircon record, not the boundary record, and subduction alone is
 * enough context for the boundary side of it. In their place: a histogram of zircon
 * crystallisation ages, 20 Myr bins across the full 0-1000 Ma record. It is a fixed
 * distribution, not something that changes as the reconstruction age scrubs -- the shared
 * marker (see the 'shade' mode below) shows where the CURRENT time sits within it, the
 * same way it already does for the subduction-length row.
 *
 * data/zircon_histogram.csv is written by build/build_zircon_histogram.py, which bins
 * the SAME ages data/points.json carries (not a re-fetch of the raw compilation), so
 * what the chart plots is exactly the record the globe draws from.
 */
const TIME_SERIES = [
  {
    url: 'data/boundary_length.csv',
    series: {
      subduction_km: { label: 'Subduction', unit: 'km',
                       colour: BOUNDARY_STYLE.subduction.stroke },
    },
  },
  {
    url: 'data/zircon_histogram.csv',
    series: {
      zircon_count: { label: 'Zircons formed / 20 Myr', unit: '',
                      colour: '#8fd4f0' },
    },
  },
];

// Must match --thumb in story.css. The chart insets its plot by half of this so its marker
// lands on the slider thumb; if the two ever disagree, the marker drifts off the thumb at
// the ends of the axis.
const THUMB_WIDTH = 14;

// A sample is drawn from its crystallisation age to the present (PointLayer's default
// 'since' lifespan -- the rock it is part of does not stop existing once it has formed),
// and is BRIGHT within this many Myr of that age, fading to a low-alpha version of the
// same colour outside it. That is a different rule from plate-boundaries' base metal
// deposits, which used 'window' to hide a deposit entirely outside +-5 Myr; a zircon
// sample never disappears once it has formed, it just stops being the freshly-formed
// thing the bright colour is calling attention to.
const ZIRCON_WINDOW = 5;

// Which metadata keys the popup shows, in order, and how to render each. Kept here rather
// than in the library because wording is the page's business, not the renderer's.
const POPUP_ROWS = [
  ['age', 'Age', (v, p) => `${fmt(v)} Ma${p.age_uncertainty != null
      ? ` ± ${fmt(p.age_uncertainty)} Myr` : ''}`],
  ['age_type', 'Dated by', (v) => v],
  ['rock_type', 'Rock type', (v) => v],
  ['locality', 'Locality', (v) => v],
  ['country', 'Region', (v) => v],
  ['continent', 'Continent', (v) => v],
  ['plate_id', 'Plate', (v) => v],
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
  // Declared before the loads below, not after: the zircon layer's `style` hook (passed
  // into PointLayer.load) closes over this variable and is first invoked synchronously
  // during construction, before `await` returns control here. Reading `time` there while
  // still in the temporal dead zone would throw -- see plate-boundaries' story.js for the
  // ordering this page deliberately does NOT copy.
  let time = view.time ?? START_TIME;

  const [series, velocities, continents, zircons] = await Promise.all([
    BoundarySeries.load(BOUNDARY_MANIFEST),
    VelocityField.load(VELOCITY_FILE),
    PolygonLayer.load(CONTINENT_FILE, {
      fill: CONTINENT_FILL,
      stroke: CONTINENT_EDGE,
      lineWidth: 0.7,
    }),
    // Colour is applied here rather than baked into the export: the palette belongs to
    // this page's design, while rock type belongs to the data. `style` is re-read every
    // time `restyle()` runs, and setTime() below calls it on every time change, so the
    // fill tracks how far the CURRENT time sits from each sample's own age.
    PointLayer.load(ZIRCON_FILE, {
      // Denser than the deposit layer by an order of magnitude (~14,000 against ~2,000)
      // and, being lifespan:'since', mostly all drawn at once near the present -- smaller
      // and lighter than the deposit symbols so the pile reads as texture, not a wall of
      // keylines. 3.1 = 2.6 x 1.2.
      size: 3.1,
      keyline: 'rgba(6, 11, 20, 0.55)',
      keylineWidth: 0.6,
      style: (point, cat) => {
        const colour = ZIRCON_COLOUR[point.type] ?? ZIRCON_COLOUR.Felsic;
        const dist = point.age == null ? Infinity : Math.abs(time - point.age);
        return { fill: dist <= ZIRCON_WINDOW ? colour.bright : colour.faint };
      },
    }),
  ]);

  const [minTime, maxTime] = series.timeRange;
  scrubEl.min = minTime;
  scrubEl.max = maxTime;

  // The slider runs backwards: present at the right, deep time at the left, so dragging
  // right moves toward today the way a timeline reads. Done by inverting the VALUE rather
  // than flipping the element in CSS, so the native keyboard behaviour stays sensible --
  // right arrow still means "later", which a scaleX(-1) would have reversed.
  const sliderToTime = (v) => maxTime - (Number(v) - minTime);
  const timeToSlider = (t) => maxTime - (t - minTime);

  const model = series.meta.model;
  document.getElementById('model-credit').textContent =
    MODEL_CREDITS[model] ?? model;

  // Arrows go on top of the boundaries: where a fast plate meets a trench, the arrow
  // is the thing you want to read against the triangles. Zircons go on top of both --
  // they are the only interactive layer, and a symbol you cannot see you cannot click.
  // The ocean disc replaces the raster: without it the globe has no body and the vectors
  // float on the page background. Drawn first, so everything else sits on top of it.
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
  globe.addOverlay((ctx, g) => zircons.draw(ctx, g.projector));

  // Scale reference. The label is pinned to a round speed and the drawn bar is sized
  // to match, rather than the other way round -- "5 cm/yr" is a reference a reader can
  // use, "20.7 cm/yr" is just the arbitrary length of a box in the legend.
  const SCALE_SPEEDS = [200, 100, 50, 20, 10];   // km/Myr, i.e. 20 down to 1 cm/yr
  const scaleLabelEl = document.getElementById('scale-label');
  const scaleArrowEl = document.getElementById('scale-arrow');

  // The scale bar depends only on the globe radius, so it changes on zoom and resize and
  // never on time. Rewriting its SVG attributes every frame invalidated style on frames
  // where nothing about the legend had moved.
  let scaleRadius = null;

  function updateScaleLabel() {
    if (globe.radius === scaleRadius) return;
    scaleRadius = globe.radius;

    // Arrow length in px for a given speed, from the library so it cannot drift out of
    // step with what draw() actually renders.
    const pxFor = (kmPerMyr) => velocities.lengthFor(kmPerMyr, globe.radius);

    // Largest round speed whose bar still fits the legend column.
    const speed = SCALE_SPEEDS.find((s) => pxFor(s) <= 56) ?? SCALE_SPEEDS.at(-1);
    const len = Math.max(12, pxFor(speed));

    scaleArrowEl.setAttribute('width', len + 10);
    scaleArrowEl.querySelector('line').setAttribute('x2', len);
    scaleArrowEl.querySelector('polygon')
      .setAttribute('points', `${len + 9},5 ${len - 1},9 ${len - 1},1`);
    scaleLabelEl.textContent = `${speed / 10} cm/yr`;
  }

  // Assigned once the CSVs have loaded; the page works without it, so every use is guarded.
  let timeseries = null;

  function render() {
    globe.set({ age: time, lon: view.lon, lat: view.lat, zoom: view.zoom });
    globe.render();
    timecodeEl.textContent = Math.round(time);
    updateScaleLabel();
    // The chart repaints on the same frame as the globe rather than running its own loop,
    // so a scrub is still one render per event.
    timeseries?.draw();
  }

  /*
   * Coalesce every redraw request into one frame -- see plate-boundaries' story.js for
   * the measurement that motivated this.
   */
  let renderFrame = null;
  function scheduleRender() {
    if (renderFrame !== null) return;
    renderFrame = requestAnimationFrame(() => {
      renderFrame = null;
      render();
    });
  }

  // The frame may not be in cache yet. Warm frames swap synchronously and are picked up by
  // the render already scheduled below; a cold one calls back when it lands and schedules
  // another, which is the only case that genuinely needs a second paint.
  function setTime(next, { updateSlider = true } = {}) {
    time = Math.max(minTime, Math.min(maxTime, next));
    if (updateSlider) scrubEl.value = timeToSlider(time);
    velocities.setTime(time);      // already in memory, no fetch to wait on
    continents.setTime(time);
    // restyle() re-reads the `style` hook above for every point, so each sample's fill
    // is recomputed against the NEW `time` before positions update. Order against
    // setTime() below does not matter -- restyle() only touches cached fill colour,
    // setTime() only touches position/live flags.
    zircons.restyle();
    zircons.setTime(time);
    timeseries?.setTime(time);
    updateZirconCounts();
    series.setTime(time, scheduleRender);
    scheduleRender();
  }

  document.getElementById('velocity-toggle').addEventListener('click', (e) => {
    velocities.visible = !velocities.visible;
    e.currentTarget.classList.toggle('is-off', !velocities.visible);
    scheduleRender();
  });

  buildLegend(series, scheduleRender);
  const updateZirconCounts = buildZirconLegend(zircons, scheduleRender);

  const caption = zircons.meta.caption;
  if (caption) document.getElementById('points-credit').textContent = caption;

  attachHover({
    element: stageEl,
    popup: document.getElementById('point-popup'),
    layer: zircons,
    render,
    format: formatZircon,
  });

  /*
   * The chart under the slider. Failing to load it must not take the globe down with it --
   * it is context for the map, not the map -- so a missing or malformed CSV leaves the page
   * working and says so in the console.
   */
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
      if (next > maxTime) next = minTime;      // loop back to the present
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

  // 1001 frames at ~92 kB mean (92.5 MB total) is far too much to pull eagerly on load,
  // but once the page is up and idle it is worth warming so scrubbing stops hitting the
  // network.
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

/** Legend rows double as per-type visibility toggles. */
function buildLegend(series, render) {
  const list = document.getElementById('legend-items');

  for (const [type, style] of Object.entries(BOUNDARY_STYLE)) {
    const li = document.createElement('li');
    // The subduction swatch carries a triangle: the decoration is the whole point of
    // the symbol, and a plain line would make it indistinguishable from the others.
    const swatch = type === 'subduction'
      ? `<span class="swatch swatch-sz" style="background:${style.stroke}">` +
        `<i style="border-bottom-color:${style.stroke}"></i></span>`
      : `<span class="swatch" style="background:${style.stroke}"></span>`;
    li.innerHTML = swatch + `<span>${style.label}</span>`;
    li.addEventListener('click', () => {
      // The visibility object is shared with every loaded frame, so a toggle applies
      // across the whole series rather than just the frame on screen.
      series.visible[type] = !series.visible[type];
      li.classList.toggle('is-off', !series.visible[type]);
      render();
    });
    list.appendChild(li);
  }
}

/** One toggle row per rock type, each showing the symbol used on the map. */
function buildZirconLegend(zircons, render) {
  const list = document.getElementById('zircon-items');
  const allBtn = document.getElementById('zircon-all');

  // Counts are of what is showing NOW, not of the whole dataset. Under lifespan:'since'
  // that means "how many samples had already formed by this time" -- cumulative, not a
  // moving-window count the way the deposit page's was.
  const totals = {};
  for (const p of zircons.points) totals[p.type] = (totals[p.type] || 0) + 1;

  const rows = [];
  const countEls = {};

  for (const [type, cat] of Object.entries(zircons.categories)) {
    const li = document.createElement('li');
    const colour = ZIRCON_COLOUR[type]?.bright || '#9fb4c8';
    li.innerHTML =
      `<span class="swatch swatch-sym">${legendSymbol(colour)}</span>` +
      `<span>${escapeHtml(cat.label || type)}` +
      `<span class="legend-count" style="color:var(--ink-dim)"> · 0</span></span>`;
    li.title = `${totals[type] || 0} in the dataset (age <= 1000 Ma)`;
    countEls[type] = li.querySelector('.legend-count');
    li.addEventListener('click', () => {
      zircons.types[type] = !zircons.types[type];
      li.classList.toggle('is-off', !zircons.types[type]);
      render();
      syncAll();
    });
    list.appendChild(li);
    rows.push([type, li]);
  }

  function syncAll() {
    const anyOn = rows.some(([type]) => zircons.types[type]);
    allBtn.textContent = anyOn ? 'none' : 'all';
  }

  allBtn.addEventListener('click', () => {
    const anyOn = rows.some(([type]) => zircons.types[type]);
    for (const [type, li] of rows) {
      zircons.types[type] = !anyOn;
      li.classList.toggle('is-off', anyOn);
    }
    render();
    syncAll();
  });

  syncAll();

  return function updateCounts() {
    for (const [type, el] of Object.entries(countEls)) {
      el.textContent = ` · ${zircons.liveCount(type)}`;
    }
  };
}

/** Miniature of the canvas symbol, for the legend row. Both rock types draw as circles --
 *  colour alone tells them apart, since there is no third variable shape would need to
 *  carry the way it did across the deposit layer's seven types. */
function legendSymbol(colour) {
  const c = escapeHtml(colour);
  return `<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">` +
    `<circle cx="7" cy="7" r="4.4" fill="${c}"/></svg>`;
}

/** Popup body for one zircon sample. */
function formatZircon(point) {
  const rows = [];
  for (const [key, label, render] of POPUP_ROWS) {
    const value = point[key];
    if (value == null || value === '') continue;
    rows.push(`<dt>${label}</dt><dd>${escapeHtml(render(value, point))}</dd>`);
  }

  const name = point.sample_id || point.locality || 'Unnamed sample';
  const type = point.type || '';

  return (
    `<span class="pp-type">${escapeHtml(type)}</span>` +
    `<h3>${escapeHtml(name)}</h3>` +
    (rows.length ? `<dl>${rows.join('')}</dl>` : '') +
    (point.reference
      ? `<p class="pp-ref">${escapeHtml(point.reference)}</p>` : '')
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

    // Clamping short of the pole avoids the degenerate view matrix exactly at 90,
    // where east and north are undefined.
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
