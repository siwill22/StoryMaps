/*
 * Macdonald's ophiolite-bearing suture compilation, reconstructed, plus the reductions
 * the page's knobs perform over it.
 *
 * The page's argument lives in one sentence: "tropical suture length" is not a
 * measurement, it is the result of three choices -- which plate model puts the suture at
 * a latitude, which age interval counts as "active", and how wide "tropical" is. This
 * module holds the data those choices are applied to, and applies them.
 *
 * Nothing here decides anything. Every definition below is one the source author
 * tabulated; the page picks among them at runtime and can show all of them at once.
 */

import { lonLatToVec3 } from '../../shared/vendor/deep-time-map/js/index.js';
import { splitLineAtSeam } from '../../shared/js/robinsonSeams.js';

const EARTH_RADIUS_KM = 6371.009;

/** Stroke width for every suture, in or out of band -- see draw(). */
export const SUTURE_WIDTH = 4.5;

/** Pointer slop for hitTest(), px. */
const HIT_TOLERANCE = 7;
const DEG = Math.PI / 180;

/*
 * When is a suture "active"?
 *
 * The source tabulates three intervals per suture -- magmatic, metamorphic and
 * exhumation -- each with a max (older) and min (younger) age. The published curve uses
 * exhumation. The authors' own output directories carry two readings of it:
 *
 *   Ex_max       [EXMAX, 0]       active from exhumation onset to the present
 *   Ex_max_min   [EXMAX, EXMIN]   active only through the exhumation interval
 *
 * Those two are the same data read two ways, and they are not close to each other: under
 * Ex_max a suture never stops counting once it starts, so the curve accumulates; under
 * Ex_max_min it is a moving window. The magmatic and metamorphic intervals are tabulated
 * by the source but were not used for the published curve, so they are offered here as
 * what they are -- alternatives the author recorded and did not take.
 *
 * `sourced: true` marks a definition that exists in the source dataset rather than one
 * this page invented. Every definition here is sourced. If that ever stops being true,
 * the flag is what the UI reads to say so.
 */
export const DEFINITIONS = {
  ex_max: {
    label: 'Exhumation, max → present',
    short: 'Ex_max',
    note: 'Active from exhumation onset to the present — the curve accumulates.',
    sourced: true,
    active: (s, t) => t <= s.exmax,
  },
  ex_max_min: {
    label: 'Exhumation interval',
    short: 'Ex_max_min',
    note: 'Active only between EXMAX and EXMIN — a moving window.',
    sourced: true,
    active: (s, t) => t <= s.exmax && t >= s.exmin,
  },
  magmatic: {
    label: 'Magmatic interval',
    short: 'Mag',
    note: 'Tabulated by the source, not used for its published curve.',
    sourced: true,
    active: (s, t) => t <= s.magmax && t >= s.magmin,
  },
  metamorphic: {
    label: 'Metamorphic interval',
    short: 'Met',
    note: 'Tabulated by the source, not used for its published curve.',
    sourced: true,
    active: (s, t) => t <= s.metmax && t >= s.metmin,
  },
};

/*
 * Latitude band half-widths, in degrees.
 *
 * These four are not a range this page chose. They are the bands Macdonald's own output
 * file tabulates (within_10/15/20_suture and greater_40_suture), and the published figure
 * uses 15. A freely sliding 0-90 knob would make the spread of curves OUR artefact rather
 * than the literature's, which on this page would be self-defeating -- so the knob snaps
 * to these, and strand enumeration samples exactly this set.
 */
export const BANDS = [10, 15, 20, 40];

/*
 * How the band edge behaves.
 *
 * 'step' is what the source does and what every published version of this argument does:
 * a suture at 14.9 degrees counts in full, one at 15.1 counts for nothing.
 *
 * 'cosine' exists because that edge is a fiction -- silicate weathering does not switch
 * off at 15.1 degrees -- and because it is the one knob on the page whose effect is
 * visible on the globe as a shape change rather than a number change. It is NOT sourced:
 * no published version of this argument uses it, this page made it up, and the UI marks
 * it accordingly. It is deliberately parameterised by the same band half-width so the two
 * shapes are comparable rather than being two unrelated knobs.
 */
export const WEIGHTINGS = {
  step: {
    label: 'Hard edge',
    sourced: true,
    note: 'In or out at the band edge — what the published versions do.',
    weight: (absLat, band) => (absLat <= band ? 1 : 0),
  },
  cosine: {
    label: 'Cosine taper',
    sourced: false,
    note: 'Full weight at the equator falling to zero at the band edge. Not a published '
        + 'choice — this page\'s own, and marked as such.',
    weight: (absLat, band) => (absLat >= band ? 0 : Math.cos((Math.PI / 2) * absLat / band)),
  },
};

/** Great-circle length of one segment, km. */
function segmentKm(lon1, lat1, lon2, lat2) {
  const p1 = lat1 * DEG;
  const p2 = lat2 * DEG;
  const dp = (lat2 - lat1) * DEG;
  const dl = (lon2 - lon1) * DEG;
  const a = Math.sin(dp / 2) ** 2
          + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export class SutureSet {
  constructor(data) {
    this.meta = data.meta;
    this.sutures = data.sutures;
    this.times = data.meta.times;

    /** frame geometry by time: Map<time, Array<[sutureIndex, xy]>> */
    this.frames = new Map();
    for (const f of data.frames) this.frames.set(f.t, f.geom);

    this._reduce();
  }

  static async load(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    return new SutureSet(await res.json());
  }

  /*
   * Pre-reduce every frame to per-suture band totals, once, on load.
   *
   * Why not reduce on demand: a strand is a full curve over all ~201 times, and the page
   * draws dozens of strands at once and redraws them whenever a knob moves. Walking
   * ~2,500 segments per time per strand would be ~16 million operations per knob drag.
   * Reduced up front, a strand costs one lookup per suture per time -- about 23,000
   * operations -- and the knobs stay live.
   *
   * What is NOT precomputed: the per-latitude histogram and the drawn geometry, which are
   * only ever wanted for the single time on screen and are cheap to walk on demand.
   */
  _reduce() {
    const nS = this.sutures.length;
    const nT = this.times.length;
    const nB = BANDS.length;
    const shapes = Object.keys(WEIGHTINGS);

    this._timeIndex = new Map();
    this.times.forEach((t, i) => this._timeIndex.set(t, i));

    // [shape][time * nS * nB + suture * nB + band] -> weighted km
    this._bandKm = {};
    for (const shape of shapes) {
      this._bandKm[shape] = new Float32Array(nT * nS * nB);
    }
    // Unbanded total, for the "no latitude filter" series.
    this._totalKm = new Float32Array(nT * nS);
    // Whether this suture has geometry at all at this time (it may have been clamped
    // out by the build where its plate's rotation chain does not reach).
    this._present = new Uint8Array(nT * nS);

    for (let ti = 0; ti < nT; ti++) {
      const geom = this.frames.get(this.times[ti]);
      if (!geom) continue;
      for (const [si, xy] of geom) {
        this._present[ti * nS + si] = 1;
        let total = 0;
        for (let k = 0; k + 3 < xy.length; k += 2) {
          const lon1 = xy[k], lat1 = xy[k + 1];
          const lon2 = xy[k + 2], lat2 = xy[k + 3];
          const km = segmentKm(lon1, lat1, lon2, lat2);
          // Segment midpoint latitude. At 0.5 degree tessellation a segment spans well
          // under one degree of latitude, so the midpoint is not a meaningful
          // approximation -- it is the segment's latitude to within the bin width the
          // histogram uses anyway.
          const absLat = Math.abs((lat1 + lat2) / 2);
          total += km;
          for (const shape of shapes) {
            const w = WEIGHTINGS[shape].weight;
            const base = ti * nS * nB + si * nB;
            for (let b = 0; b < nB; b++) {
              this._bandKm[shape][base + b] += km * w(absLat, BANDS[b]);
            }
          }
        }
        this._totalKm[ti * nS + si] = total;
      }
    }
  }

  /** Is this suture active at this time under this definition, AND reconstructable? */
  isActive(si, ti, definitionKey) {
    if (!this._present[ti * this.sutures.length + si]) return false;
    return DEFINITIONS[definitionKey].active(this.sutures[si], this.times[ti]);
  }

  /**
   * One strand: weighted active suture length, km, at every time.
   *
   * `band` of null means no latitude filter at all (the source's `total_suture`).
   */
  curve({ definition = 'ex_max_min', band = 15, weighting = 'step' } = {}) {
    const nS = this.sutures.length;
    const nB = BANDS.length;
    const bi = BANDS.indexOf(band);
    const out = new Float64Array(this.times.length);

    for (let ti = 0; ti < this.times.length; ti++) {
      let sum = 0;
      for (let si = 0; si < nS; si++) {
        if (!this.isActive(si, ti, definition)) continue;
        sum += band === null
          ? this._totalKm[ti * nS + si]
          : this._bandKm[weighting][ti * nS * nB + si * nB + bi];
      }
      out[ti] = sum;
    }
    return out;
  }

  /** Which sutures are drawn at this time, with their geometry. */
  visibleAt(time, definitionKey) {
    const ti = this._timeIndex.get(time);
    if (ti === undefined) return [];
    const geom = this.frames.get(time) || [];
    const out = [];
    for (const [si, xy] of geom) {
      if (!DEFINITIONS[definitionKey].active(this.sutures[si], time)) continue;
      out.push({ index: si, suture: this.sutures[si], xy });
    }
    return out;
  }

  /**
   * Active suture length per 1-degree latitude bin at one time, signed latitude
   * (-90..90). This is what the histogram beside the map draws, and it is deliberately
   * computed from the geometry rather than from the reduction above: the reduction folds
   * north and south together, and the whole point of the histogram is to show that
   * sutures are not symmetric about the equator.
   */
  latitudeHistogram(time, definitionKey) {
    const bins = new Float64Array(180);
    for (const { xy } of this.visibleAt(time, definitionKey)) {
      for (let k = 0; k + 3 < xy.length; k += 2) {
        const km = segmentKm(xy[k], xy[k + 1], xy[k + 2], xy[k + 3]);
        const lat = (xy[k + 1] + xy[k + 3]) / 2;
        let b = Math.floor(lat + 90);
        if (b < 0) b = 0;
        if (b > 179) b = 179;
        bins[b] += km;
      }
    }
    return bins;
  }

  /**
   * Draw the sutures at one time, coloured by their weight under the current band.
   *
   * This is the page's central gesture: the colour of a suture is not a property of the
   * suture, it is the value of the knob evaluated at that suture's latitude. Drag the
   * band and named sutures light up or go out. Under the cosine weighting the same line
   * is drawn at intermediate opacity, which is the visible form of the argument that the
   * hard edge was never a physical statement.
   */
  draw(ctx, globe, { time, definition, band, weighting, inColour, outColour }) {
    const weightFn = WEIGHTINGS[weighting].weight;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const { xy } of this.visibleAt(time, definition)) {
      for (const piece of this._projectPieces(xy, globe)) {
        // Each segment is stroked on its own because its weight -- and therefore its
        // colour -- depends on its own latitude. A suture crossing the band edge is
        // half lit, which is exactly what the reader needs to see, so this cannot be
        // one path per suture.
        for (let i = 0; i + 1 < piece.length; i++) {
          const a = piece[i];
          const b = piece[i + 1];
          if (!a.p || !b.p) continue;
          const w = band === null ? 1 : weightFn(Math.abs((a.lat + b.lat) / 2), band);

          ctx.beginPath();
          ctx.moveTo(a.p[0], a.p[1]);
          ctx.lineTo(b.p[0], b.p[1]);
          ctx.strokeStyle = w <= 0 ? outColour : mix(outColour, inColour, w);
          // Same width in and out of the band. Only COLOUR encodes the weight: a thinner
          // line out of band would say the suture is a smaller feature, when the only
          // thing that changed is whether the current knob setting counts it.
          ctx.lineWidth = SUTURE_WIDTH;
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  /**
   * Which drawn suture is under the pointer, if any.
   *
   * Tested against the same projected geometry draw() strokes, so what is hoverable is
   * exactly what is visible -- including sutures outside the band, which are dimmed but
   * still real features and still worth being able to interrogate.
   */
  hitTest(globe, { time, definition, band, weighting }, px, py) {
    const weightFn = WEIGHTINGS[weighting].weight;
    let best = null;
    let bestD = HIT_TOLERANCE ** 2;

    for (const entry of this.visibleAt(time, definition)) {
      for (const piece of this._projectPieces(entry.xy, globe)) {
        for (let i = 0; i + 1 < piece.length; i++) {
          const a = piece[i];
          const b = piece[i + 1];
          if (!a.p || !b.p) continue;
          const d = segDistSq(px, py, a.p[0], a.p[1], b.p[0], b.p[1]);
          if (d < bestD) {
            bestD = d;
            best = { entry, lat: (a.lat + b.lat) / 2 };
          }
        }
      }
    }
    if (!best) return null;

    // Latitude span of the whole suture at this time, and how much of its length the
    // current band actually counts -- the two numbers a reader hovering it wants.
    const xy = best.entry.xy;
    let lo = Infinity;
    let hi = -Infinity;
    let total = 0;
    let counted = 0;
    for (let k = 0; k + 3 < xy.length; k += 2) {
      const km = segmentKm(xy[k], xy[k + 1], xy[k + 2], xy[k + 3]);
      const lat = (xy[k + 1] + xy[k + 3]) / 2;
      lo = Math.min(lo, lat);
      hi = Math.max(hi, lat);
      total += km;
      counted += km * (band === null ? 1 : weightFn(Math.abs(lat), band));
    }

    return {
      suture: best.entry.suture,
      latMin: lo,
      latMax: hi,
      lengthKm: total,
      countedKm: counted,
    };
  }

  /**
   * One suture's flat [lon, lat, ...] array as projected `{p, lat}` runs.
   *
   * Robinson needs the antimeridian cut before projection, or a suture straddling it is
   * stroked straight across the map -- the same failure the sibling pages hit with rings
   * and boundary lines. splitLineAtSeam() returns longitude DELTAS from the current
   * central meridian, which must be projected with projectDelta() and never project();
   * see robinsonSeams.js's own comment on why the two are not interchangeable.
   *
   * Orthographic has no seam but does have a horizon: projectVec3() returns null behind
   * it, so the run is broken there instead. Either way the caller gets runs of points it
   * can stroke pairwise without checking which projection produced them.
   */
  _projectPieces(xy, globe) {
    const lonLat = [];
    for (let k = 0; k + 1 < xy.length; k += 2) lonLat.push([xy[k], xy[k + 1]]);

    if (globe.projection === 'robinson') {
      const centreLon = globe.state.lon ?? 0;
      return splitLineAtSeam(lonLat, centreLon).map(
        (piece) => piece.map(([dLon, lat]) => ({ p: globe.projectDelta(dLon, lat), lat })));
    }

    return [lonLat.map(([lon, lat]) => ({ p: globe.projectVec3(lonLatToVec3(lon, lat)), lat }))];
  }
}

/** Squared distance from a point to a segment, screen space. */
function segDistSq(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  let t = len === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + t * dx;
  const qy = ay + t * dy;
  return (px - qx) ** 2 + (py - qy) ** 2;
}

/** Linear blend between two 'r,g,b,a' colour strings, for the cosine taper's midtones. */
function mix(from, to, t) {
  const f = parseRgba(from);
  const g = parseRgba(to);
  const c = (i) => Math.round(f[i] + (g[i] - f[i]) * t);
  const alpha = (f[3] + (g[3] - f[3]) * t).toFixed(3);
  return `rgba(${c(0)},${c(1)},${c(2)},${alpha})`;
}

function parseRgba(s) {
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (!m) return [255, 255, 255, 1];
  const p = m[1].split(',').map((x) => parseFloat(x));
  return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
}
