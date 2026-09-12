/*
 * Pie-chart glyphs for the detrital zircon page: each pie is a conic-gradient sweep of
 * its own sample's lag-time distribution (lag = grain age minus depositional age, i.e.
 * how long before the grain ended up in this sediment), not a set of flat wedges -- see
 * drawPieGlyphs()'s own comment for why and how the gradient stops approximate the
 * sample's empirical CDF of lag time from its binned counts.
 *
 * Deliberately NOT a change to the vendored PointLayer (js/points.js in deep-time-map) --
 * that class draws one fixed symbol per point and has no notion of a multi-valued
 * glyph, and a pie chart is this one page's business, not the library's. Instead
 * js/story.js loads the samples into an ordinary PointLayer with every default symbol
 * made fully transparent, which still gives it position tracking through plate
 * rotation, hover/pick, and spiderfy clustering for free -- then drawPieGlyphs() below
 * reads the SAME `_screen`/`_live` arrays layer.draw() just populated (the same reach
 * into private-by-convention fields the page's now-removed density overlay used) and
 * paints pies on top of the invisible symbols, at exactly the positions and (for a
 * fanned cluster) the exact fanned-out offsets the layer just computed.
 */

// Colour by lag time: a diverging red-white-blue ramp (the same family as matplotlib's
// "seismic"/"RdBu"), red at zero lag, white at the midpoint, blue from 500 Myr on. Only
// three stops, not a rainbow -- a diverging map reads "short lag" vs "long lag" as two
// opposed colours either side of a neutral middle, rather than implying an ordered
// sequence of hues the way the rainbow ramp this replaced did. lagColour() clamps beyond
// the last stop rather than extrapolating, so everything from 500 Myr to the record's
// maximum (4400 Myr) draws the same saturated blue -- deliberately compressed, since the
// distinction that matters for a provenance spectrum is "recycled quickly" vs "sat around
// a long time", not exactly how many hundred Myr past 500 a given grain's lag reached.
const LAG_STOPS = [
  [0,   [214,  57,  50]],   // no lag: red
  [250, [255, 255, 255]],   // midpoint: white
  [500, [ 51,  95, 204]],   // 500 Myr and beyond: blue (saturates, does not extrapolate)
];

/** Interpolated colour for a lag time in Myr, as an rgb() string. Clamped beyond either
 *  end of LAG_STOPS rather than extrapolated. */
export function lagColour(myr) {
  const stops = LAG_STOPS;
  if (myr <= stops[0][0]) return rgb(stops[0][1]);
  if (myr >= stops[stops.length - 1][0]) return rgb(stops[stops.length - 1][1]);

  for (let i = 0; i < stops.length - 1; i++) {
    const [a0, c0] = stops[i];
    const [a1, c1] = stops[i + 1];
    if (myr < a0 || myr > a1) continue;
    const t = (myr - a0) / (a1 - a0);
    return rgb([
      c0[0] + (c1[0] - c0[0]) * t,
      c0[1] + (c1[1] - c0[1]) * t,
      c0[2] + (c1[2] - c0[2]) * t,
    ]);
  }
  return rgb(stops[stops.length - 1][1]);
}

/** CSS gradient stops for a legend swatch -- the exact same control points lagColour()
 *  interpolates between, so the legend can never drift out of sync with the map. */
export function lagRampCss() {
  const span = LAG_STOPS[LAG_STOPS.length - 1][0] - LAG_STOPS[0][0];
  return LAG_STOPS
    .map(([lag, c]) => `${rgb(c)} ${((lag - LAG_STOPS[0][0]) / span * 100).toFixed(1)}%`)
    .join(', ');
}

function rgb([r, g, b]) {
  return `rgb(${r | 0}, ${g | 0}, ${b | 0})`;
}

// Colour by tectonic-setting class instead of lag time: flat fill, one colour per class,
// rather than a gradient -- a class is one categorical value for the whole sample, there
// is nothing to sweep. Colours follow the tectonic setting each class stands for, not an
// arbitrary palette: Cawood's A/B/C are convergent/collisional/divergent-or-intraplate
// margins, by user request mapped to red/blue/green respectively (the conventional sense
// of those three settings) -- but drawn from the Okabe-Ito colour-universal-design
// palette (vermillion/blue/bluish-green, not literal RGB primaries) so the three stay
// distinguishable under protanopia, deuteranopia and tritanopia, not just for standard
// vision. Barham's method only ever yields two classes, not three -- no collisional
// middle category -- so its 'A' (low ratio: a single well-fit source, i.e. convergent-
// like) and 'B' (high ratio: a broad/mixed source, i.e. divergent-or-intraplate-like)
// reuse Cawood's A and C colours exactly, rather than a separate two-colour scheme, since
// the user asked for the same setting to always read as the same colour across both
// classifications.
export const CAWOOD_COLOURS = { A: '#D55E00', B: '#0072B2', C: '#009E73' };
export const BARHAM_COLOURS = { A: CAWOOD_COLOURS.A, B: CAWOOD_COLOURS.C };

// Shared by both class modes: a sample with no defined class (Cawood: none should occur;
// Barham: fewer than 2 dated grains) still gets a glyph, so a reader can see it exists
// and isn't quietly dropped -- just in a neutral grey rather than a real class colour.
export const UNCLASSIFIED_COLOUR = 'rgba(150, 160, 170, 0.45)';

export function cawoodColour(cls) {
  return CAWOOD_COLOURS[cls] ?? UNCLASSIFIED_COLOUR;
}

/** Barham et al. (2022) ships only continuous statistics (chi_square, percentile); this
 *  page stores their ratio (percentile / chi_square) and thresholds it here so the split
 *  can be moved live with a slider rather than fixed at build time. `ratio == null` means
 *  the sample had fewer than 2 dated grains and has no defined ratio at all. */
export function barhamClassify(ratio, threshold) {
  if (ratio == null || !Number.isFinite(ratio)) return null;
  return ratio > threshold ? 'B' : 'A';
}

export function barhamColour(cls) {
  return BARHAM_COLOURS[cls] ?? UNCLASSIFIED_COLOUR;
}

const DEFAULT_OPTIONS = {
  binWidth: 20,
  radius: 7,      // every pie the same size -- see drawPieGlyphs' own comment on why
  keyline: 'rgba(8, 14, 24, 0.65)',
  keylineWidth: 0.6,
  highlight: 'rgba(255, 255, 255, 0.95)',
  highlightWidth: 1.6,
  mode: 'lag',           // 'lag' | 'cawood' | 'barham'
  barhamThreshold: 20,
};

/**
 * Paint one pie per live, visible, on-screen point in `layer`.
 *
 * Must run AFTER layer.draw(ctx, projector) in the same animation frame: that call is
 * what populates `_screen`/`_live` and resolves any open spiderfy fan, so a fanned
 * cluster's members land exactly where this reads them, with no separate bookkeeping
 * here for clustering at all.
 *
 * Every pie draws at the SAME radius (`options.radius`) -- an earlier version scaled
 * radius by grain count, but that made a sparse, thinly-dated sample look like a minor
 * detail next to a heavily-dated one, when both are one sample with equal standing on
 * the map. Grain count is still in the popup for a reader who wants it.
 *
 * Each pie is a CONIC GRADIENT, not a set of flat-coloured wedges -- an earlier version
 * drew one solid wedge per bin, which read as chunky/banded rather than a smooth
 * distribution. A colour stop is placed at each non-empty bin's cumulative-fraction
 * MIDPOINT (i.e. the sample's own empirical CDF of lag time, reconstructed from its
 * binned counts), and the canvas interpolates every colour in between -- so the sweep
 * around the circle reads as a continuous gradation from short lag to long lag. The
 * underlying bin width (20 Myr, `build/build_detrital_zircons.py`'s BIN_WIDTH) sets how
 * many control points that gradation has to work with -- finer bins follow the sample's
 * true CDF more closely -- but even the original 100 Myr bins already rendered smoothly
 * once wedges became a gradient; this is a sharpening, not a fix for banding.
 *
 * `options.mode` switches what a pie's colour means: 'lag' (default) is the gradient
 * above; 'cawood'/'barham' instead paint the WHOLE disc a single flat colour for that
 * sample's tectonic-setting class -- a class is one categorical value per sample, not a
 * distribution, so there is nothing to sweep a gradient across. Position, size and
 * hover/spiderfy behaviour are identical in every mode; only the fill changes.
 */
export function drawPieGlyphs(ctx, layer, options = {}) {
  const o = { ...DEFAULT_OPTIONS, ...options };
  const screen = layer._screen;
  const live = layer._live;
  const points = layer.points;

  ctx.save();
  ctx.lineJoin = 'round';

  for (let i = 0; i < layer.count; i++) {
    if (!live[i]) continue;
    const p = screen[i];
    if (!p) continue;
    const point = points[i];
    if (!layer.isTypeVisible(point)) continue;

    const [cx, cy] = p;
    const r = o.radius;
    let fillStyle;

    if (o.mode === 'cawood') {
      fillStyle = cawoodColour(point.cawood_class);
    } else if (o.mode === 'barham') {
      fillStyle = barhamColour(barhamClassify(point.barham_ratio, o.barhamThreshold));
    } else {
      const spectrum = point.spectrum;
      if (!spectrum || spectrum.length === 0) continue;
      const total = spectrum.reduce((sum, pair) => sum + pair[1], 0);
      if (total <= 0) continue;

      // -Math.PI / 2 (12 o'clock) as the start, matching the old wedge sweep's own
      // orientation; a conic gradient's offset increases clockwise from there, same
      // direction the old per-bin `angle += slice` walked.
      const gradient = ctx.createConicGradient(-Math.PI / 2, cx, cy);
      let cumulative = 0;
      for (const [binLo, count] of spectrum) {
        const midFraction = (cumulative + count / 2) / total;
        gradient.addColorStop(midFraction, lagColour(binLo + o.binWidth / 2));
        cumulative += count;
      }
      fillStyle = gradient;
    }

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = fillStyle;
    ctx.fill();
    ctx.strokeStyle = o.keyline;
    ctx.lineWidth = o.keylineWidth;
    ctx.stroke();

    if (layer.hovered === i) {
      ctx.beginPath();
      ctx.arc(cx, cy, r + 2.5, 0, Math.PI * 2);
      ctx.strokeStyle = o.highlight;
      ctx.lineWidth = o.highlightWidth;
      ctx.stroke();
    }
  }

  ctx.restore();
}
