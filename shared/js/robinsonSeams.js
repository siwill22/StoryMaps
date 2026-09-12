/*
 * Splits a reconstructed ring or line at the antimeridian relative to a pannable
 * central meridian, using the vendored d3-geo clip algorithm
 * (shared/vendor/d3-geo-clip/) -- see that directory's own README for what it is and
 * why it is not reimplemented here. This file is the small adapter between it and this
 * codebase's own world: plain [lonDeg, latDeg] pairs already reconstructed to the
 * current age (this codebase's own plate-rotation math, nothing to do with d3-geo) in,
 * [dLonDeg, latDeg] pairs -- already a longitude DELTA from centreLonDeg, not an
 * absolute longitude -- out.
 *
 * d3-geo's clip always cuts at lambda = +-pi in whatever frame it is given. This
 * codebase's Robinson mode has a PANNABLE central meridian (state.lon), not a fixed
 * one, so every point is shifted by -centreLon before clipping -- a plain longitude
 * subtraction, not a full 3-axis rotation (d3-geo's own rotation.js was not vendored
 * for this reason, see the README). The output is handed back AS that shifted delta,
 * deliberately not re-added to centreLonDeg and re-wrapped back to an absolute
 * longitude: a piece that hugs the +180 side of the cut is only correct as long as its
 * points stay on the +180 side, and any wrap that treats +180 and -180 as
 * interchangeable (they are the same point on the sphere, but not interchangeable for
 * a piece of geometry that approaches the seam from one particular side) would
 * silently flip some of them back, reintroducing the very jump this module exists to
 * remove. Project each output point with `Globe.projectDelta(dLon, lat)`
 * (shared/js/globe.js), never `Globe.project(lon, lat)` -- the latter re-derives the
 * delta by subtracting centreLonDeg and re-wrapping, undoing this.
 */

import clipAntimeridian from '../vendor/d3-geo-clip/clip/antimeridian.js';

const DEG = Math.PI / 180;

/** Wraps a longitude DELTA in DEGREES into (-180, 180]. Exported for callers that need
 *  to keep a short segment's two endpoints consistently on one side of the seam
 *  themselves (see robinsonSeams.js's own top comment) without going through the full
 *  ring/line clip below -- e.g. a two-point velocity arrow, too short to ever need
 *  actual clipping, but still wrong if its endpoints are wrapped independently. */
export function wrapLon(dLonDeg) {
  return ((dLonDeg + 180) % 360 + 360) % 360 - 180;
}

/**
 * Sign of a ring's winding, computed on the SPHERE (unit vectors), not from its
 * lon/lat numbers -- a flat shoelace test on raw lon/lat breaks down for exactly the
 * rings this module cares about most: one that already straddles raw +-180 reads, to a
 * flat x/y shoelace formula, as if its long way round the sphere (the ~340 degree-wide
 * side) were its interior, rather than the ~20 degree-wide side actually intended,
 * because the formula cannot tell "jumped 340 degrees one way" from "jumped 20 degrees
 * the other way" using the numbers alone. A ring's winding sense (which side of it is
 * "inside") is a topological property of the ring itself, invariant under rotation --
 * so the sign of `sum((v_i x v_i+1) . centroid)`, using each vertex's own unit vector
 * and their (unnormalised) centroid as a stand-in outward direction, answers the same
 * question with no seam or wraparound ambiguity at all. The sign that means "already
 * correctly wound, no reversal needed" was determined empirically against the vendored
 * clip (a small test ring nowhere near the seam, checked by hand against its own
 * correct output) -- see this module's test coverage, not asserted from d3-geo's own
 * (differently-framed) documentation of the convention. This codebase's own ring data
 * has no guaranteed winding to begin with (`polygons.js`'s screen-space drawing
 * normalises the same way, post-projection, for the identical reason), so every ring is
 * checked and fixed here rather than assumed.
 */
function sphericalRingSign(ring) {
  const vecs = ring.map(([lon, lat]) => {
    const l = lon * DEG, p = lat * DEG, c = Math.cos(p);
    return [c * Math.cos(l), c * Math.sin(l), Math.sin(p)];
  });
  let cx = 0, cy = 0, cz = 0;
  for (const [x, y, z] of vecs) { cx += x; cy += y; cz += z; }
  let sum = 0;
  const n = vecs.length;
  for (let k = 0; k < n; k++) {
    const [ax, ay, az] = vecs[k];
    const [bx, by, bz] = vecs[(k + 1) % n];
    sum += (ay * bz - az * by) * cx + (az * bx - ax * bz) * cy + (ax * by - ay * bx) * cz;
  }
  return sum;
}

/** Cheap pre-check: does any edge of this already-shifted ring/line jump more than
 *  halfway round the world? If not, it cannot have crossed the seam, and the full
 *  clip (winding fix + clip/rejoin machinery) can be skipped entirely -- the large
 *  majority of rings on any given frame, since most continents/terranes sit nowhere
 *  near wherever the seam currently is. */
function crossesSeam(shiftedPoints) {
  for (let i = 0; i < shiftedPoints.length - 1; i++) {
    if (Math.abs(shiftedPoints[i + 1][0] - shiftedPoints[i][0]) >= 180) return true;
  }
  return false;
}

function makeRingSink(out) {
  let ring = null;
  return {
    polygonStart() {},
    polygonEnd() {},
    lineStart() { ring = []; out.push(ring); },
    lineEnd() {},
    point(lambda, phi) { ring.push([lambda / DEG, phi / DEG]); },
  };
}

/**
 * Split a closed ring -- `[[lonDeg, latDeg], ...]`, first point repeated as last, same
 * convention `PolygonLayer`'s own rings use -- at the antimeridian relative to
 * `centreLonDeg`. Returns one or more valid closed rings, each fillable independently,
 * as `[dLonDeg, latDeg]` pairs (see this module's own top comment on why a delta, not
 * an absolute longitude); a ring that does not cross the seam at all comes back as a
 * single-element array.
 */
export function splitRingAtSeam(ring, centreLonDeg) {
  const naive = ring.map(([lon, lat]) => [wrapLon(lon - centreLonDeg), lat]);
  if (!crossesSeam(naive)) return [naive];

  // Winding is a property of the ring itself, not of how it's currently centred --
  // check it on the ORIGINAL ring, once, before the seam-relative shift below.
  const wound = sphericalRingSign(ring) > 0 ? ring.slice().reverse() : ring;
  const shifted = wound.map(([lon, lat]) => [wrapLon(lon - centreLonDeg), lat]);

  const out = [];
  const clip = clipAntimeridian(makeRingSink(out));
  clip.polygonStart();
  clip.lineStart();
  for (const [lon, lat] of shifted) clip.point(lon * DEG, lat * DEG);
  clip.lineEnd();
  clip.polygonEnd();
  return out;
}

/**
 * Split an OPEN line -- `[[lonDeg, latDeg], ...]`, not closed -- at the antimeridian
 * relative to `centreLonDeg`. Returns one or more polyline segments, as `[dLonDeg,
 * latDeg]` pairs (see this module's own top comment); a line that never crosses the
 * seam comes back as a single-element array. Unlike a ring, an open line needs no
 * winding normalisation -- there is no "inside" to get backwards, only a pen to lift.
 */
export function splitLineAtSeam(line, centreLonDeg) {
  const shifted = line.map(([lon, lat]) => [wrapLon(lon - centreLonDeg), lat]);
  if (!crossesSeam(shifted)) return [shifted];

  const out = [];
  const clip = clipAntimeridian(makeRingSink(out));
  clip.lineStart();
  for (const [lon, lat] of shifted) clip.point(lon * DEG, lat * DEG);
  clip.lineEnd();
  return out;
}
