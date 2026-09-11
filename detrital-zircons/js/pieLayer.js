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

const DEFAULT_OPTIONS = {
  binWidth: 20,
  radius: 7,      // every pie the same size -- see drawPieGlyphs' own comment on why
  keyline: 'rgba(8, 14, 24, 0.65)',
  keylineWidth: 0.6,
  highlight: 'rgba(255, 255, 255, 0.95)',
  highlightWidth: 1.6,
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

    const spectrum = point.spectrum;
    if (!spectrum || spectrum.length === 0) continue;
    const total = spectrum.reduce((sum, pair) => sum + pair[1], 0);
    if (total <= 0) continue;

    const [cx, cy] = p;
    const r = o.radius;

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

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
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
