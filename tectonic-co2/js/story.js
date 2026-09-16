/*
 * Tectonic drivers of atmospheric CO2 -- walking skeleton.
 *
 * One driver, end to end: active suture length in the tropics, the quantity Macdonald et
 * al. (2019) argued sets Earth's climate state. The page's subject is not the quantity.
 * It is that the quantity is not a measurement -- it is the output of three choices, all
 * of which the source author enumerated and only one of which got published:
 *
 *     which plate model puts a suture at a latitude
 *     which tabulated age interval counts as "active"
 *     how wide "tropical" is
 *
 * Move any of them and the curve moves. The page shows all the combinations at once and
 * lets the reader drive. It characterises nobody and asserts nothing: it reports
 * parameter values, which are matters of record, and draws the arithmetic.
 *
 * Structure follows ../zircons/js/story.js -- see that page for anything about the globe,
 * the shared clock or the collapsible panels that is not specific to this one.
 */

import { Globe } from '../../shared/js/globe.js';
import { BoundarySeries, PolygonLayer, DEFAULT_STYLE as BOUNDARY_STYLE }
  from '../../shared/vendor/deep-time-map/js/index.js';
import { vec3ToLonLat } from '../../shared/vendor/deep-time-map/js/index.js';
import { splitRingAtSeam, splitLineAtSeam } from '../../shared/js/robinsonSeams.js';
import { SutureSet, DEFINITIONS, BANDS, WEIGHTINGS } from './sutures.js';
import { Chart } from './chart.js';

const REFERENCE_FILE = 'data/macdonald2019.json';

/*
 * Which plate models this page can place a suture in, and what to call them.
 *
 * There is no ranking here and no "primary" model -- models are models. What differs is
 * capability: a model with topologies can also yield boundary lengths, one with only
 * rotations and static polygons can still place a feature at a latitude. Torsvik & Cocks
 * has no topologies, and for THIS driver that costs nothing, because latitude is all the
 * suture argument needs. It earns its place for a better reason than availability: CEED on
 * anchor 1 is the frame the published curve was computed in, so it is the strand the dashed
 * reference line is directly comparable to.
 *
 * `lineage` is shown in the UI. Two models from one lab's revision series are not two
 * independent opinions, and a page about over-confidence that quietly implied otherwise
 * would be refuting itself.
 */
const MODELS = {
  Merdith2021: {
    label: 'Merdith et al. 2021',
    lineage: 'Merdith / EarthByte · PLATEID1',
    topologies: true,
  },
  TorsvikCocks2017: {
    label: 'Torsvik & Cocks 2017 (CEED)',
    lineage: 'Torsvik / CEED · PLATEID_CE',
    topologies: false,
  },
  /*
   * The same named model, from the rotation file the published analysis actually ran on:
   * TC2017 plus Swanson-Hysell & Macdonald plus Domeier 2018, from the source's own
   * repository. Kept as a separate option rather than replacing the one above, because the
   * two disagree by 13 degrees of latitude for Laurentia at 445 Ma and the disagreement is
   * the most direct thing on this page -- one named model, two files, half the tropical
   * suture length at the Hirnantian.
   */
  TC2017_SHM2017_D2018: {
    label: 'CEED + Swanson-Hysell & Macdonald + Domeier',
    lineage: 'Torsvik / CEED · PLATEID_CE · source\'s own file',
    topologies: false,
  },
};

/** Every model keeps its own data under data/<Model>/. */
const modelFile = (model, name) => `data/${model}/${name}`;

const START = { lon: 20, lat: 10, zoom: 1.0 };

/*
 * Robinson is the default, not the globe.
 *
 * This decision was made by measurement, not taste. At the opening time, 64 of 245 active
 * suture vertices fall on the visible hemisphere of an orthographic globe -- the other
 * three quarters are behind the Earth. For a page whose entire subject is where sutures
 * sit in latitude, hiding most of them and making the reader drag to find the rest gets
 * the priority backwards: the belt is a global object and the reader needs to see it
 * whole while a knob moves its edges.
 *
 * Robinson also makes the latitude histogram beside the map an aligned marginal rather
 * than a detached summary, because latitude maps to a row of the map. The globe stays one
 * click away, and is the better view once the reader wants to look at a particular
 * collision rather than at the distribution.
 */
const START_PROJECTION = 'robinson';
// 445 Ma is the Late Ordovician peak in the source's own tropical suture curve, and it
// coincides with the Hirnantian glaciation -- the moment the published argument is built
// on. Opening there means the reader's first act is to move the knobs on the case that
// matters most, rather than on an arbitrary time.
const START_TIME = 445;
const ZOOM_LIMITS = [0.6, 4.0];
const DEGREES_PER_RADIUS = 90;
const PLAY_MYR_PER_SECOND = 25;
const THUMB_WIDTH = 14;

/*
 * Boundaries are context on this page, not the subject, and the library's default style
 * is tuned for pages where they ARE the subject. Left at full strength they out-shout the
 * sutures, which is backwards: the reader is meant to be watching which sutures the belt
 * captures. Dimmed here rather than in the vendored default, which other pages rely on.
 */
const BOUNDARY_DIM = 0.45;

const OCEAN = '#0b2036';
const OCEAN_EDGE = 'rgba(143, 212, 240, 0.28)';
const CONTINENT_FILL = 'rgba(126, 140, 124, 0.55)';
/*
 * No stroke on the continents. The sibling pages outline them because the polygon edge IS
 * the information there; here it is a competing set of thin light lines running through
 * exactly the places sutures are -- continental margins -- and it made the overlay hard to
 * read. Fill alone still separates land from ocean, and the suture is then the only line
 * on the map that is not a plate boundary.
 */
const CONTINENT_EDGE = null;

// In-band and out-of-band suture colours. The band is the subject, so the contrast
// between them carries the page: a suture inside the belt is the brightest thing on the
// globe, one outside is barely there but never invisible -- it still exists, it just
// stops counting, and hiding it would overstate the choice's consequences.
const SUTURE_IN = 'rgba(255, 196, 92, 1)';
// Alpha raised from a first pass at 0.35: with equal stroke widths in and out of the band
// (the width carries no meaning -- see SutureSet.draw), too low an alpha made the
// out-of-band lines READ as thinner, which put the distinction back into width by the
// side door. At this alpha the two look equally thick and only the colour differs.
const SUTURE_OUT = 'rgba(150, 170, 190, 0.62)';

// How many nested strips the latitude belt is drawn with. One strip under a hard edge;
// the gradient of a cosine taper needs enough to read as smooth.
const BELT_STRIPS = 14;

// Drawing more strands than this stops being a bundle and becomes a wash. When the
// enabled contributors would exceed it, the page subsamples and SAYS it subsampled --
// a silent cap would imply coverage the chart does not have.
const MAX_STRANDS = 48;

const state = {
  model: 'Merdith2021',
  definition: 'ex_max_min',
  band: 15,
  weighting: 'step',
  /*
   * Which knobs vary across the drawn bundle. Turn one off and watch the bundle collapse
   * -- or not. That is the difference between "everything is uncertain" and "the result
   * rests on this one choice".
   *
   * `definition` is OFF by default, and the reason is not presentational. The four
   * definitions do not all measure the same kind of quantity: Ex_max is cumulative -- a
   * suture starts counting at exhumation onset and never stops -- while the other three
   * are moving windows. Measured here, Ex_max at +-40 degrees peaks at 86,000 km against
   * 12,000 km for Ex_max_min at +-15, a factor of 7. Drawn together on one linear axis
   * the windowed strands collapse onto the floor, and worse, the bundle would be
   * implying that a cumulative total and an instantaneous length are alternative
   * estimates of one thing. They are not. Mixing them is exactly the sloppy comparison
   * this page objects to elsewhere, so it is not the default -- but it stays available,
   * because seeing the axis jump when you enable it is the clearest way to learn that
   * the choice is not a detail.
   */
  vary: { model: true, definition: false, band: true, weighting: false },
};

function strandKey(c) {
  return `${c.model}|${c.definition}|${c.band}|${c.weighting}`;
}

function strandLabel(c) {
  return `${MODELS[c.model].label} · ${DEFINITIONS[c.definition].short} · ±${c.band}° · `
       + `${WEIGHTINGS[c.weighting].label.toLowerCase()}`;
}

async function main() {
  const stageEl = document.getElementById('stage');
  const globeEl = document.getElementById('globe');
  const loadingEl = document.getElementById('loading');
  const timecodeEl = document.getElementById('timecode');
  const scrubEl = document.getElementById('scrub');
  const playEl = document.getElementById('play');

  const globe = new Globe(globeEl, { projection: START_PROJECTION });
  const view = { ...START, ...parseHash(location.hash) };
  let time = view.time ?? START_TIME;

  /*
   * Everything is loaded per model, not once.
   *
   * Changing the reconstruction has to move the whole map -- continents and boundaries as
   * well as sutures. Drawing one model's continents under another's sutures would put
   * collisions out to sea, and it would make the model control look like it did less than
   * it does, because most of the map would not move when you used it. So each model owns
   * its own continents (and its own boundaries, where it has topologies) and selecting a
   * model swaps all of them together.
   */
  const names = Object.keys(MODELS);
  const [reference, ...loaded] = await Promise.all([
    fetch(REFERENCE_FILE).then((r) => r.json()),
    ...names.map(async (name) => ({
      name,
      sutures: await SutureSet.load(modelFile(name, 'sutures.json')),
      continents: await PolygonLayer.load(modelFile(name, 'continents.json'), {
        fill: CONTINENT_FILL, stroke: CONTINENT_EDGE,
      }),
      // A model without topologies has no closed plates, so there are no boundaries to
      // draw. The page shows none and says why rather than borrowing another model's.
      series: MODELS[name].topologies
        ? await BoundarySeries.load(modelFile(name, 'boundaries.json'))
        : null,
    })),
  ]);

  const sutures = {};
  const continentsFor = {};
  const seriesFor = {};
  for (const entry of loaded) {
    sutures[entry.name] = entry.sutures;
    continentsFor[entry.name] = entry.continents;
    seriesFor[entry.name] = entry.series;
  }

  const times = sutures[state.model].times;
  const [minTime, maxTime] = [times[0], times[times.length - 1]];
  scrubEl.min = minTime;
  scrubEl.max = maxTime;
  scrubEl.step = times[1] - times[0];

  // Slider runs backwards: present at the right, deep time at the left.
  const sliderToTime = (v) => maxTime - (Number(v) - minTime);
  const timeToSlider = (t) => maxTime - (t - minTime);

  /* ---- globe overlays --------------------------------------------------- */

  // The ocean body. Robinson's outline is not a circle, so it is traced from Globe's own
  // project() rather than drawn with ctx.arc().
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
    const continents = continentsFor[state.model];
    if (g.projection === 'robinson') drawContinentsRobinson(ctx, continents, g);
    else continents.draw(ctx, g.projector);
  });
  globe.addOverlay((ctx, g) => {
    const series = seriesFor[state.model];
    if (!series) return;
    ctx.save();
    ctx.globalAlpha = BOUNDARY_DIM;
    if (g.projection === 'robinson') drawBoundariesRobinson(ctx, series, g);
    else series.draw(ctx, g.projector);
    ctx.restore();
  });
  globe.addOverlay((ctx) => drawLatitudeBelt(ctx, globe, state));
  globe.addOverlay((ctx) => sutures[state.model].draw(ctx, globe, {
    time,
    definition: state.definition,
    band: state.band,
    weighting: state.weighting,
    inColour: SUTURE_IN,
    outColour: SUTURE_OUT,
  }));

  /* ---- chart ------------------------------------------------------------ */

  const chart = new Chart(document.getElementById('chart'), times,
    { thumbWidth: THUMB_WIDTH });

  // The observational record: glacial extent, degrees of latitude from the pole. Larger
  // means ice reached further toward the equator, i.e. colder. Shipped verbatim from the
  // source's own output -- it is measured, so it gets the shaded treatment.
  chart.setRecord({
    times: reference.rows.map((r) => r.age_Ma),
    values: reference.rows.map((r) => r.ice_extent),
    label: 'glacial extent',
  });

  /*
   * The source's own published curve, shipped verbatim, drawn as a named line.
   *
   * It is here as a check on this page's machinery rather than as a claim about anyone's
   * conclusions. A reader is entitled to know that the arithmetic reproduces the source
   * before being shown it diverging, otherwise every later strand is just this page's own
   * number.
   *
   * The settings the source used are CEED, exhumation interval, +-15 degrees -- CEED, not
   * Merdith: every column in its output CSV comes from a `_TC17_SHM17_D18` variable,
   * reconstructed on anchor 1. So this line is the CEED strand's counterpart, and that is
   * the strand to compare it against -- specifically the CEED + SHM + Domeier one, built
   * from the source's own rotation file, which reproduces the published series to an RMS of
   * 70 km over 0-520 Ma. gprm's CEED file is the same named model but not the same rotations:
   * it puts Laurentia 13 degrees further from the equator at 445 Ma and so returns about half
   * the tropical length at the Hirnantian. See README, "Which frame the published curve is
   * in".
   *
   * Drawn as a LINE, not a shaded band: it is a constructed quantity like every strand
   * around it, and the shaded treatment on this page means measured.
   */
  chart.setReference({
    times: reference.rows.map((r) => r.age_Ma),
    values: reference.rows.map((r) => r.within_15_suture),
    label: 'Macdonald et al. 2019, within_15_suture (as published)',
  });

  chart.onPick = (strand) => {
    Object.assign(state, strand.combo);
    syncKnobs();
    rebuild();
  };

  const hoverEl = document.getElementById('strand-hover');
  chart.onHover = (payload) => {
    if (!payload) { hoverEl.classList.remove('is-on'); return; }
    hoverEl.classList.add('is-on');
    hoverEl.innerHTML =
      `<strong>${escapeHtml(strandLabel(payload.strand.combo))}</strong>`
      + `<span>${Math.round(payload.value).toLocaleString()} km `
      + `at ${Math.round(payload.time)} Ma</span>`;
    hoverEl.style.left = `${payload.x + 14}px`;
    hoverEl.style.top = `${payload.y - 10}px`;
  };

  /** Enumerate every combination the enabled contributors allow, and curve each. */
  function rebuild() {
    const axes = {
      model: state.vary.model ? Object.keys(MODELS) : [state.model],
      definition: state.vary.definition ? Object.keys(DEFINITIONS) : [state.definition],
      band: state.vary.band ? BANDS : [state.band],
      weighting: state.vary.weighting ? Object.keys(WEIGHTINGS) : [state.weighting],
    };

    const combos = [];
    for (const model of axes.model) {
      for (const definition of axes.definition) {
        for (const band of axes.band) {
          for (const weighting of axes.weighting) {
            combos.push({ model, definition, band, weighting });
          }
        }
      }
    }

    let drawn = combos;
    let truncatedBy = 0;
    if (combos.length > MAX_STRANDS) {
      // Keep an evenly spaced subsample, and always keep the current selection so the
      // bright strand never disappears out from under the knobs.
      const stride = combos.length / MAX_STRANDS;
      const keep = new Set();
      for (let i = 0; i < MAX_STRANDS; i++) keep.add(Math.floor(i * stride));
      drawn = combos.filter((_, i) => keep.has(i));
      if (!drawn.some((c) => strandKey(c) === strandKey(state))) drawn.push({ ...state });
      truncatedBy = combos.length - drawn.length;
    }

    chart.setStrands(drawn.map((combo) => ({
      combo,
      key: strandKey(combo),
      curve: sutures[combo.model].curve(combo),
    })), { truncatedBy });
    chart.setHighlight(strandKey(state));
    chart.setTime(time);
  }

  /* ---- latitude histogram ----------------------------------------------- */

  const histEl = document.getElementById('lat-hist');
  const histCtx = histEl.getContext('2d');

  function drawHistogram() {
    const dpr = window.devicePixelRatio || 1;
    const w = histEl.clientWidth;
    const h = histEl.clientHeight;
    if (w <= 0 || h <= 0) return;
    if (histEl.width !== Math.round(w * dpr)) {
      histEl.width = Math.round(w * dpr);
      histEl.height = Math.round(h * dpr);
    }
    histCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    histCtx.clearRect(0, 0, w, h);

    const bins = sutures[state.model].latitudeHistogram(time, state.definition);
    let max = 0;
    for (const v of bins) if (v > max) max = v;
    if (max <= 0) max = 1;

    // In Robinson the histogram's latitude axis is mapped through the projection itself,
    // so a bar lines up with the sutures it counts. Orthographic has no single latitude
    // -> y mapping (a parallel is a curve, not a row), so it falls back to linear and the
    // histogram reads as a summary rather than as an aligned marginal.
    const yFor = (lat) => {
      if (globe.projection === 'robinson') {
        const p = globe.project(globe.state.lon ?? 0, lat);
        if (p) return p[1] - histEl.getBoundingClientRect().top
                           + histEl.parentElement.getBoundingClientRect().top;
      }
      return h / 2 - (lat / 90) * (h / 2);
    };

    const weightFn = WEIGHTINGS[state.weighting].weight;
    for (let b = 0; b < 180; b++) {
      const lat = b - 90 + 0.5;
      const v = bins[b];
      if (v <= 0) continue;
      const wgt = state.band === null ? 1 : weightFn(Math.abs(lat), state.band);
      const y = yFor(lat);
      const len = (v / max) * (w - 16);
      histCtx.fillStyle = wgt > 0
        ? `rgba(255, 196, 92, ${0.35 + 0.65 * wgt})`
        : 'rgba(140, 160, 180, 0.3)';
      histCtx.fillRect(w - 2 - len, y - 1.2, len, 2.4);
    }

    // Band edges, as the same dashed rule the globe uses.
    histCtx.strokeStyle = 'rgba(255, 196, 92, 0.55)';
    histCtx.setLineDash([3, 3]);
    histCtx.lineWidth = 1;
    for (const lat of [state.band, -state.band]) {
      const y = Math.round(yFor(lat)) + 0.5;
      histCtx.beginPath();
      histCtx.moveTo(0, y);
      histCtx.lineTo(w, y);
      histCtx.stroke();
    }
    histCtx.setLineDash([]);

    histCtx.fillStyle = 'rgba(159, 180, 200, 0.6)';
    histCtx.font = '9px ui-sans-serif, system-ui, sans-serif';
    histCtx.textAlign = 'left';
    histCtx.fillText('N', 2, 10);
    histCtx.fillText('S', 2, h - 4);
  }

  /* ---- render loop ------------------------------------------------------ */

  function render() {
    globe.set({ age: time, lon: view.lon, lat: view.lat, zoom: view.zoom });
    globe.render();
    timecodeEl.textContent = Math.round(time);
    drawHistogram();
    chart.draw();
  }

  let renderFrame = null;
  function scheduleRender() {
    if (renderFrame !== null) return;
    renderFrame = requestAnimationFrame(() => { renderFrame = null; render(); });
  }

  function setTime(next, { updateSlider = true } = {}) {
    // Snap to the series' own 5 Myr grid: the suture frames exist only at those times,
    // and asking for an intermediate one would silently draw nothing.
    const step = times[1] - times[0];
    time = Math.max(minTime, Math.min(maxTime, Math.round(next / step) * step));
    if (updateSlider) scrubEl.value = timeToSlider(time);
    // Every model's layers are advanced, not just the visible one: switching model then
    // becomes an instant swap rather than a reload-and-wait, and a half-loaded frame can
    // never be shown under a model it does not belong to.
    for (const name of names) {
      continentsFor[name].setTime(time);
      seriesFor[name]?.setTime(time, scheduleRender);
    }
    chart.setTime(time);
    scheduleRender();
  }

  /* ---- knobs ------------------------------------------------------------ */

  const knobs = buildKnobs(() => { rebuild(); scheduleRender(); });

  function syncKnobs() { knobs.sync(); }

  document.getElementById('projection-toggle').addEventListener('click', (e) => {
    const next = globe.projection === 'orthographic' ? 'robinson' : 'orthographic';
    globe.setProjection(next);
    e.currentTarget.textContent = next === 'robinson' ? 'Globe' : 'Map';
    // Orthographic tilts, Robinson does not; leaving a tilt behind would silently
    // shift every latitude the reader is trying to read off the belt.
    if (next === 'robinson') view.lat = 0;
    scheduleRender();
  });

  /* ---- suture hover ------------------------------------------------------
   *
   * The source names the suture and cites a reference but records nothing about which
   * blocks collided, so that line of the popup is MEASURED from the reconstruction rather
   * than read off the table: build_sutures.py samples ~120 km either side of each suture
   * and asks the model's own continent polygons what is there. It is labelled as the
   * model's own naming for that reason, and it changes when the model does.
   */
  const sutureHoverEl = document.getElementById('suture-hover');

  stageEl.addEventListener('pointermove', (e) => {
    if (stageEl.classList.contains('is-dragging')) {
      sutureHoverEl.classList.remove('is-on');
      return;
    }
    const rect = globeEl.getBoundingClientRect();
    const hit = sutures[state.model].hitTest(
      globe, { time, definition: state.definition, band: state.band,
               weighting: state.weighting },
      e.clientX - rect.left, e.clientY - rect.top);

    if (!hit) { sutureHoverEl.classList.remove('is-on'); return; }

    sutureHoverEl.innerHTML = formatSuture(hit, state);
    sutureHoverEl.classList.add('is-on');
    // Flip to the left of the pointer near the right edge so the popup never runs off.
    const w = sutureHoverEl.offsetWidth;
    const x = e.clientX + 16 + w > window.innerWidth ? e.clientX - 16 - w : e.clientX + 16;
    sutureHoverEl.style.left = `${x}px`;
    sutureHoverEl.style.top = `${Math.min(e.clientY + 12, window.innerHeight - 220)}px`;
  });
  stageEl.addEventListener('pointerleave', () => {
    sutureHoverEl.classList.remove('is-on');
  });

  attachControls(stageEl, globe, view, scheduleRender);
  attachCollapse(document.getElementById('legend'), document.getElementById('legend-toggle'));
  attachCollapse(document.getElementById('timebar'), document.getElementById('timebar-toggle'));
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

  /* ---- coverage note ---------------------------------------------------- */

  // What the reconstruction could not do, stated on the page rather than in a log.
  // Macdonald assigned plate IDs against the models HE used; a few do not survive the
  // transfer, and the two models here lose different ones. That difference is not
  // geology -- it is model coverage -- and a reader comparing the two curves in deep
  // time needs to know it before drawing a conclusion from the gap.
  const coverageEl = document.getElementById('coverage-note');
  coverageEl.innerHTML = Object.entries(MODELS).map(([name, m]) => {
    const meta = sutures[name].meta;
    const c = meta.coverage;
    // Read the anchor off the payload rather than restating it here, so the page cannot
    // claim a reference frame the data was not built in.
    const anchor = meta.anchor_plate_id;
    return `<li><strong>${escapeHtml(m.label)}</strong> — reconstructed on anchor plate `
         + `${anchor}${anchor === 1 ? ' (spin axis), as the source\u2019s own analysis was'
                                    : ''}; `
         + `${c.sutures_dropped} of ${c.sutures_total} sutures dropped, `
         + `${c.sutures_clamped} clamped to their plate's defined range `
         + `(${Math.round(100 * c.length_km_available / c.length_km_total)}% of `
         + `compilation length reconstructable)`
         + (m.topologies ? '' : '; no topologies, so no plate boundaries are drawn')
         + `.</li>`;
  }).join('');

  rebuild();
  setTime(time);
  loadingEl.classList.add('is-done');
  setTimeout(() => { loadingEl.style.display = 'none'; }, 900);
  // Warm every topological model's frames once the page is up and idle, so switching
  // model mid-scrub does not stall on the network.
  setTimeout(() => {
    for (const name of names) seriesFor[name]?.prefetchAll();
  }, 4000);
}

/* ---- Robinson overlays --------------------------------------------------
 *
 * The vendored PolygonLayer/BoundarySeries draw through a projector that has no notion
 * of a seam, so in Robinson a ring or line crossing the antimeridian is stroked straight
 * across the whole map. These three functions are taken from ../detrital-zircons/js/
 * story.js, which solved this first -- same reach-in-and-draw-in-parallel pattern,
 * reading each vendored class's own already-reconstructed xyz so they stay current with
 * plate rotation for free, with splitRingAtSeam()/splitLineAtSeam() doing the cut and
 * g.projectDelta() (never g.project()) projecting the pieces.
 *
 * Copied rather than shared because every page in this family is self-contained. If a
 * third page needs them they should move to shared/js/, not be copied again.
 * ------------------------------------------------------------------------ */

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


/* ---- the latitude belt ------------------------------------------------- */

/*
 * The belt is a pair of complete parallels, so it never needs the seam CLIP that split
 * geometry does -- it only needs to be walked in longitude DELTAS from the current
 * central meridian rather than in absolute longitudes. Walking absolute longitude and
 * calling project() would have each point independently re-wrapped against the centre,
 * which puts a jump in the middle of a shape that has no business having one.
 *
 * The epsilon keeps the two ends off the exact antimeridian, which robinsonForward()
 * normalises to a single value -- asking for both -180 and +180 exactly would collapse
 * the map's right edge onto its left.
 */
const BELT_EPS = 0.01;

function beltLongitudes(globe) {
  const out = [];
  const step = 3;
  if (globe.projection === 'robinson') {
    for (let d = -180 + BELT_EPS; d <= 180 - BELT_EPS; d += step) out.push(d);
    out.push(180 - BELT_EPS);
  } else {
    for (let lon = -180; lon <= 180; lon += step) out.push(lon);
  }
  return out;
}

function projectBelt(globe, dLon, lat) {
  return globe.projection === 'robinson'
    ? globe.projectDelta(dLon, lat)
    : globe.project(dLon, lat);
}


/**
 * Shade the latitude band the current knob defines.
 *
 * Drawn as nested strips whose opacity follows the weighting function, so the hard edge
 * and the cosine taper share one code path and the difference between them is visible as
 * a shape rather than as a label: a crisp stripe becomes a soft gradient, and the reader
 * sees that "+-15 degrees" was never a physical statement about where weathering stops.
 *
 * Each strip is built by walking longitudes and projecting its two bounding parallels,
 * filling only the runs where both project. That handles the orthographic horizon (where
 * projectVec3 returns null behind the limb) and, in Robinson, the antimeridian -- where a
 * strip that wrapped would otherwise be filled straight across the whole map.
 */
function drawLatitudeBelt(ctx, globe, st) {
  const band = st.band;
  if (band == null) return;
  const weightFn = WEIGHTINGS[st.weighting].weight;
  const strips = st.weighting === 'step' ? 1 : BELT_STRIPS;

  ctx.save();
  for (let s = 0; s < strips; s++) {
    const latA = (band * s) / strips;
    const latB = (band * (s + 1)) / strips;
    const w = weightFn((latA + latB) / 2, band);
    if (w <= 0) continue;

    for (const sign of [1, -1]) {
      const top = [];
      const bottom = [];
      for (const dLon of beltLongitudes(globe)) {
        top.push(projectBelt(globe, dLon, sign * latB));
        bottom.push(projectBelt(globe, dLon, sign * latA));
      }
      fillStrip(ctx, globe, top, bottom, `rgba(255, 196, 92, ${0.06 * w})`);
    }
  }

  // The edges themselves, drawn once regardless of weighting -- under a taper they mark
  // where the weight reaches zero, which is still the number the knob reports.
  ctx.strokeStyle = 'rgba(255, 196, 92, 0.5)';
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1.2;
  for (const lat of [band, -band]) {
    let started = false;
    ctx.beginPath();
    for (const dLon of beltLongitudes(globe)) {
      const p = projectBelt(globe, dLon, lat);
      if (!p) { started = false; continue; }
      if (!started) { ctx.moveTo(p[0], p[1]); started = true; } else ctx.lineTo(p[0], p[1]);
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();
}

function fillStrip(ctx, globe, top, bottom, style) {
  let run = [];
  const flush = () => {
    if (run.length < 2) { run = []; return; }
    ctx.beginPath();
    ctx.moveTo(run[0].t[0], run[0].t[1]);
    for (let i = 1; i < run.length; i++) ctx.lineTo(run[i].t[0], run[i].t[1]);
    for (let i = run.length - 1; i >= 0; i--) ctx.lineTo(run[i].b[0], run[i].b[1]);
    ctx.closePath();
    ctx.fillStyle = style;
    ctx.fill();
    run = [];
  };

  for (let i = 0; i < top.length; i++) {
    const t = top[i];
    const b = bottom[i];
    // With the belt walked in deltas there is no seam jump left to guard against; a
    // null only ever means "behind the orthographic horizon".
    if (!t || !b) { flush(); continue; }
    run.push({ t, b });
  }
  flush();
}

/* ---- knob panel --------------------------------------------------------- */

function buildKnobs(onChange) {
  const host = document.getElementById('knobs');

  /*
   * Every knob declares where its RANGE came from, and the UI says so.
   *
   * A page objecting to unexamined parameter choices that quietly made its own would not
   * be worth reading. 'sourced' means the options are ones the source dataset or its
   * author enumerated; 'ours' means this page invented them, and those default to fixed
   * rather than contributing to the drawn bundle.
   */
  const groups = [
    {
      key: 'model',
      title: 'Plate model',
      provenance: 'sourced',
      note: 'This page assigns no plate IDs. The source\'s own attribute table carries a '
          + 'column per frame — PLATEID1 here, PLATEID_CE for both CEED entries (and '
          + 'PLATEID_M for Matthews2016, not built) — and each model is reconstructed on '
          + 'the anchor plate that model is meant to be used with. The two CEED entries '
          + 'are the same named model from two different rotation files: one as gprm '
          + 'distributes it, one as the source\'s own repository ships it. They place '
          + 'Laurentia 13° apart in latitude at 445 Ma.',
      options: Object.entries(MODELS).map(([k, m]) => ({
        value: k,
        label: m.label,
        sub: m.lineage + (m.topologies ? '' : ' · rotations only'),
      })),
    },
    {
      key: 'definition',
      title: 'When is a suture active?',
      provenance: 'sourced',
      note: 'All four intervals are tabulated by the source. Its published curve used the '
          + 'exhumation interval.',
      options: Object.entries(DEFINITIONS).map(([k, d]) => ({
        value: k, label: d.label, sub: d.note,
      })),
    },
    {
      key: 'band',
      title: 'How wide is "tropical"?',
      provenance: 'sourced',
      note: 'The four bands the source\'s own output file tabulates. Its published figure '
          + 'used ±15°.',
      options: BANDS.map((b) => ({ value: b, label: `±${b}°`, sub: '' })),
    },
    {
      key: 'weighting',
      title: 'Band edge',
      provenance: 'mixed',
      note: 'The hard edge is what every published version does. The taper is this page\'s '
          + 'own and is marked as such.',
      options: Object.entries(WEIGHTINGS).map(([k, w]) => ({
        value: k, label: w.label, sub: w.sourced ? '' : 'this page\'s own', ours: !w.sourced,
      })),
    },
  ];

  const inputs = [];

  for (const g of groups) {
    const section = document.createElement('section');
    section.className = 'knob';
    section.innerHTML =
      `<h3>${escapeHtml(g.title)}`
      + `<span class="prov prov-${g.provenance}">${g.provenance === 'sourced'
          ? 'range from source' : 'part ours'}</span></h3>`
      + `<p class="knob-note">${escapeHtml(g.note)}</p>`;

    const list = document.createElement('div');
    list.className = 'knob-options';
    for (const opt of g.options) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'knob-opt' + (opt.ours ? ' is-ours' : '');
      btn.innerHTML = `<span>${escapeHtml(opt.label)}</span>`
        + (opt.sub ? `<em>${escapeHtml(opt.sub)}</em>` : '');
      btn.addEventListener('click', () => {
        state[g.key] = opt.value;
        sync();
        onChange();
      });
      list.appendChild(btn);
      inputs.push({ group: g.key, value: opt.value, el: btn });
    }
    section.appendChild(list);

    const vary = document.createElement('label');
    vary.className = 'knob-vary';
    vary.innerHTML = `<input type="checkbox"${state.vary[g.key] ? ' checked' : ''}>`
      + '<span>vary across the bundle</span>';
    vary.querySelector('input').addEventListener('change', (e) => {
      state.vary[g.key] = e.currentTarget.checked;
      onChange();
    });
    section.appendChild(vary);

    host.appendChild(section);
  }

  function sync() {
    for (const i of inputs) {
      i.el.classList.toggle('is-on', state[i.group] === i.value);
    }
  }
  sync();
  return { sync };
}

/**
 * Popup body for one suture.
 *
 * Every field is either verbatim from the source's attribute table or measured from the
 * reconstruction, and the popup says which. The three age intervals are all shown, not
 * just the one the current definition uses, so a reader can see how much the activity
 * knob has to work with before touching it -- and the one in force is marked.
 */
function formatSuture(hit, st) {
  const s = hit.suture;
  const defn = DEFINITIONS[st.definition];

  const interval = (label, max, min, key) => {
    const live = key === st.definition
      || (key === 'ex_max_min' && st.definition === 'ex_max');
    return `<dt${live ? ' class="is-live"' : ''}>${label}</dt>`
         + `<dd${live ? ' class="is-live"' : ''}>${max}–${min} Ma</dd>`;
  };

  const pct = hit.lengthKm > 0 ? Math.round(100 * hit.countedKm / hit.lengthKm) : 0;
  const blocks = (s.blocks || []).length
    ? (s.blocks || []).map(([n, f]) =>
        `${escapeHtml(n)} <em>${Math.round(f * 100)}%</em>`).join(' · ')
    : '<em>no named polygon within 120 km in this model</em>';

  return (
    `<h3>${escapeHtml(s.name)}</h3>`
    + `<p class="pp-blocks">${blocks}</p>`
    + `<p class="pp-sub">blocks either side, as this model's polygons name them — `
    + `measured, not from the source table</p>`
    + '<dl>'
    + interval('Exhumation', s.exmax, s.exmin, 'ex_max_min')
    + interval('Metamorphic', s.metmax, s.metmin, 'metamorphic')
    + interval('Magmatic', s.magmax, s.magmin, 'magmatic')
    + `<dt>Latitude now</dt><dd>${hit.latMin.toFixed(1)}° to ${hit.latMax.toFixed(1)}°</dd>`
    + `<dt>Length</dt><dd>${Math.round(hit.lengthKm).toLocaleString()} km`
    + ` <span class="pp-dim">(${s.length_km.toLocaleString()} km present-day)</span></dd>`
    + `<dt>Counted</dt><dd>${pct}% of it, at ±${st.band}°`
    + ` ${escapeHtml(WEIGHTINGS[st.weighting].label.toLowerCase())}</dd>`
    + `<dt>Plate ID</dt><dd>${s.plate_ids[st.model]} `
    + `<span class="pp-dim">(${escapeHtml(MODELS[st.model].label)})</span></dd>`
    + '</dl>'
    + `<p class="pp-ref">${escapeHtml(s.ref)}</p>`
    + `<p class="pp-sub">Active under “${escapeHtml(defn.label)}”. `
    + `Suture, intervals and reference: Macdonald et al. (2019).</p>`
  );
}

/* ---- shared plumbing (as ../zircons) ------------------------------------ */

function parseHash(hash) {
  const parts = hash.replace('#', '').split(',').map(Number);
  if (parts.length < 2 || parts.some(Number.isNaN)) return {};
  return { lon: parts[0], lat: parts[1], zoom: parts[2] ?? START.zoom, time: parts[3] };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function attachCollapse(panelEl, toggleEl) {
  toggleEl.addEventListener('click', () => {
    const collapsed = panelEl.classList.toggle('is-collapsed');
    toggleEl.setAttribute('aria-expanded', String(!collapsed));
    toggleEl.textContent = collapsed ? '+' : '−';
  });
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
    // Robinson has no tilt -- only a pannable central meridian -- so a vertical drag
    // must not change the view or the map would slide off its own frame.
    if (globe.projection === 'orthographic') {
      view.lat += (e.clientY - lastY) * scale;
      view.lat = Math.max(-89.9, Math.min(89.9, view.lat));
    }
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
