/*
 * Spherical geometry for the globe: plate rotations and orthographic projection.
 *
 * Everything here treats the Earth as a sphere and works in 3D unit vectors.
 * Nothing interpolates lon/lat pairs directly -- that is a flat-plane operation
 * that misbehaves near the poles and across the antimeridian, which is precisely
 * where this story happens.
 */

import {
  ROBINSON_KX, ROBINSON_KY, ROBINSON_STEP, ROBINSON_X, ROBINSON_Y,
  robinsonForward as robinsonUnits,
} from '../vendor/deep-time-map/js/robinson.js';

export const DEG = Math.PI / 180;

/* ---- unit vectors -------------------------------------------------------- */

export function lonLatToVec3(lonDeg, latDeg, out) {
  const lon = lonDeg * DEG;
  const lat = latDeg * DEG;
  const cosLat = Math.cos(lat);
  out = out || [0, 0, 0];
  out[0] = cosLat * Math.cos(lon);
  out[1] = cosLat * Math.sin(lon);
  out[2] = Math.sin(lat);
  return out;
}

export function vec3ToLonLat(v) {
  return [Math.atan2(v[1], v[0]) / DEG, Math.asin(Math.max(-1, Math.min(1, v[2]))) / DEG];
}

/** Great-circle angular distance in degrees between two unit vectors. */
export function angularDistance(a, b) {
  const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  return Math.acos(dot) / DEG;
}

/* ---- quaternions --------------------------------------------------------- */

/*
 * These live in deep-time-map, not here.
 *
 * They were duplicated for a while: the library cannot import from its host, and the
 * host had them first. Now that PointLayer needs the same finite-rotation maths as the
 * coastlines do, two copies of ~70 lines of quaternion numerics is a liability -- fix a
 * sign convention in one and the other silently disagrees. Re-exported rather than
 * removed so the names stay available to anything else under shared/.
 */
export {
  quatFromPoleAngle,
  quatSlerp,
  quatToMat3,
  mat3Multiply,
  mat3Apply,
} from '../vendor/deep-time-map/js/rotations.js';


/* ---- orthographic camera ------------------------------------------------- */

/**
 * Build the view matrix for an orthographic globe centred on (lon, lat).
 *
 * Rows are the east, north and outward unit vectors at the centre point, so
 * multiplying a point's unit vector by this matrix yields
 *   [ screen x, screen y, depth ]
 * with depth > 0 meaning the point is on the visible hemisphere. Handling the
 * horizon this way is exact -- there is no planar approximation anywhere.
 */
export function viewMatrix(centreLonDeg, centreLatDeg, out) {
  out = out || new Float64Array(9);
  const lon = centreLonDeg * DEG;
  const lat = centreLatDeg * DEG;
  const sinLon = Math.sin(lon), cosLon = Math.cos(lon);
  const sinLat = Math.sin(lat), cosLat = Math.cos(lat);

  // east
  out[0] = -sinLon;          out[1] = cosLon;           out[2] = 0;
  // north
  out[3] = -sinLat * cosLon; out[4] = -sinLat * sinLon; out[5] = cosLat;
  // outward (the centre direction itself)
  out[6] = cosLat * cosLon;  out[7] = cosLat * sinLon;  out[8] = sinLat;
  return out;
}

/* ---- Spilhaus view matrix ---------------------------------------------- */

/**
 * Build the camera setup for a Spilhaus projection centered on (lon, lat).
 * The Spilhaus projection is an azimuthal equal-area projection.
 */
export function spilhausViewMatrix(centreLonDeg, centreLatDeg, out) {
  out = out || new Float64Array(9);
  const lon = centreLonDeg * DEG;
  const lat = centreLatDeg * DEG;
  const sinLon = Math.sin(lon), cosLon = Math.cos(lon);
  const sinLat = Math.sin(lat), cosLat = Math.cos(lat);

  // For Spilhaus, we need the camera basis vectors
  // east, north, and outward (center direction)
  out[0] = -sinLon;          out[1] = cosLon;           out[2] = 0;
  out[3] = -sinLat * cosLon; out[4] = -sinLat * sinLon; out[5] = cosLat;
  out[6] = cosLat * cosLon;  out[7] = cosLat * sinLon;  out[8] = sinLat;
  return out;
}

/**
 * Interpolate between two camera positions along a great circle.
 *
 * Independently lerping the centre longitude and latitude would swing the camera
 * along a path that is not a great circle, and would spin wildly when passing
 * near a pole -- unavoidable here, since half this story is viewed from over
 * Antarctica.
 */
export function cameraInterpolate(a, b, t) {
  const va = lonLatToVec3(a.lon, a.lat);
  const vb = lonLatToVec3(b.lon, b.lat);

  let dot = Math.max(-1, Math.min(1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]));
  const omega = Math.acos(dot);

  let v;
  if (omega < 1e-6) {
    v = va;
  } else {
    const sinOmega = Math.sin(omega);
    const s0 = Math.sin((1 - t) * omega) / sinOmega;
    const s1 = Math.sin(t * omega) / sinOmega;
    v = [
      s0 * va[0] + s1 * vb[0],
      s0 * va[1] + s1 * vb[1],
      s0 * va[2] + s1 * vb[2],
    ];
    const n = Math.hypot(v[0], v[1], v[2]) || 1;
    v = [v[0] / n, v[1] / n, v[2] / n];
  }

  const [lon, lat] = vec3ToLonLat(v);
  return {
    lon,
    lat,
    zoom: (a.zoom ?? 1) + ((b.zoom ?? 1) - (a.zoom ?? 1)) * t,
  };
}

/** Points along the great circle from a to b, for drawing flow paths. */
export function greatCirclePoints(lon1, lat1, lon2, lat2, n = 48) {
  const va = lonLatToVec3(lon1, lat1);
  const vb = lonLatToVec3(lon2, lat2);
  const dot = Math.max(-1, Math.min(1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]));
  const omega = Math.acos(dot);
  const out = [];
  if (omega < 1e-9) return [[lon1, lat1]];
  const sinOmega = Math.sin(omega);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const s0 = Math.sin((1 - t) * omega) / sinOmega;
    const s1 = Math.sin(t * omega) / sinOmega;
    out.push(vec3ToLonLat([
      s0 * va[0] + s1 * vb[0],
      s0 * va[1] + s1 * vb[1],
      s0 * va[2] + s1 * vb[2],
    ]));
  }
  return out;
}

/** A small circle of given angular radius about a centre, e.g. the ACC ring. */
export function smallCirclePoints(centreLonDeg, centreLatDeg, radiusDeg, n = 180) {
  const c = lonLatToVec3(centreLonDeg, centreLatDeg);
  // Any vector perpendicular to c works as the starting radius.
  let ref = Math.abs(c[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  let u = [
    ref[1] * c[2] - ref[2] * c[1],
    ref[2] * c[0] - ref[0] * c[2],
    ref[0] * c[1] - ref[1] * c[0],
  ];
  const un = Math.hypot(u[0], u[1], u[2]);
  u = [u[0] / un, u[1] / un, u[2] / un];
  const v = [
    c[1] * u[2] - c[2] * u[1],
    c[2] * u[0] - c[0] * u[2],
    c[0] * u[1] - c[1] * u[0],
  ];

  const r = radiusDeg * DEG;
  const cosR = Math.cos(r), sinR = Math.sin(r);
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * 2 * Math.PI;
    const ca = Math.cos(a), sa = Math.sin(a);
    out.push(vec3ToLonLat([
      cosR * c[0] + sinR * (ca * u[0] + sa * v[0]),
      cosR * c[1] + sinR * (ca * u[1] + sa * v[1]),
      cosR * c[2] + sinR * (ca * u[2] + sa * v[2]),
    ]));
  }
  return out;
}

/* ---- Spilhaus projection ------------------------------------------------- */

/**
 * Spilhaus projection parameters for the Southern Ocean view.
 * The standard Spilhaus projection is centered on 71°S, 142°E.
 */
export const SPILHAUS_CENTER = { lon: 142, lat: -71 };

/**
 * Forward Spilhaus projection: convert lon/lat to projected coordinates.
 * 
 * The Spilhaus projection is a polar azimuthal equal-area projection.
 * It uses a scaling factor of 0.917 to zoom in on the Southern Ocean.
 * 
 * @param {number} lonDeg - Longitude in degrees
 * @param {number} latDeg - Latitude in degrees
 * @returns {[number, number]|null} Projected (x, y) coordinates or null if on far side
 */
export function spilhausForward(lonDeg, latDeg) {
  const lon = lonDeg * DEG;
  const lat = latDeg * DEG;
  
  // Spilhaus center (71°S, 142°E)
  const clat = -71 * DEG;
  const clon = 142 * DEG;
  
  // Angular distance from center
  const cosDelta = Math.sin(lat) * Math.sin(clat) + 
                   Math.cos(lat) * Math.cos(clat) * Math.cos(lon - clon);
  
  if (cosDelta < -0.1) {
    // Point is on far side of globe
    return null;
  }
  
  const k = 0.917 * (1 + cosDelta) / Math.sqrt((1 - cosDelta) * (1 + cosDelta));
  
  const x = k * Math.cos(lat) * Math.sin(lon - clon);
  const y = k * (Math.cos(clat) * Math.sin(lat) - 
                 Math.sin(clat) * Math.cos(lat) * Math.cos(lon - clon));
  
  return [x, y];
}

/**
 * Inverse Spilhaus projection: convert projected coordinates to lon/lat.
 * 
 * @param {number} x - Projected x coordinate
 * @param {number} y - Projected y coordinate
 * @returns {[number, number]} (lon, lat) in degrees
 */
export function spilhausInverse(x, y) {
  // Spilhaus center (71°S, 142°E)
  const clat = -71 * DEG;
  const clon = 142 * DEG;
  
  const rho2 = x * x + y * y;
  const rho = Math.sqrt(rho2);
  
  if (rho < 1e-10) {
    return [142, -71];
  }
  
  const c = 2 * Math.atan(rho / (2 * 0.917));
  const sinc = Math.sin(c);
  
  const lat = Math.asin(Math.cos(c) * Math.sin(clat) + 
                        (y * sinc * Math.cos(clat)) / rho);
  
  const lon = clon + Math.atan2(x * sinc, 
                                 rho * Math.cos(clat) * Math.cos(c) - 
                                 y * Math.sin(clat) * sinc);
  
  return [lon / DEG, lat / DEG];
}

/**
 * Generate points for a Spilhaus grid (meridians and parallels).
 *
 * @param {number} lonStep - Longitude step in degrees
 * @param {number} latStep - Latitude step in degrees
 * @returns {Object} Object with meridians and parallels arrays
 */
export function spilhausGrid(lonStep = 30, latStep = 15) {
  const meridians = [];
  const parallels = [];

  // Generate meridians (lines of constant longitude)
  for (let lon = -180; lon <= 180; lon += lonStep) {
    const points = [];
    for (let lat = -90; lat <= 90; lat += latStep) {
      const p = spilhausForward(lon, lat);
      if (p) points.push(p);
    }
    if (points.length > 1) meridians.push(points);
  }

  // Generate parallels (lines of constant latitude)
  for (let lat = -90; lat <= 90; lat += latStep) {
    const points = [];
    for (let lon = -180; lon <= 180; lon += lonStep) {
      const p = spilhausForward(lon, lat);
      if (p) points.push(p);
    }
    if (points.length > 1) parallels.push(points);
  }

  return { meridians, parallels };
}

/* ---- Robinson projection -------------------------------------------------- */

/**
 * Robinson's scale factors come from deep-time-map, not from a copy here.
 *
 * They used to be a literal table in this file AND a literal table in Geode's
 * `core/robinson.ts` -- the same 19 published rows (Snyder 1993, "Map
 * Projections: A Working Manual", table VII), written out twice by the same
 * author for two different renderers. That is survivable while the numbers
 * agree; what it actually produced was two implementations with *different
 * antimeridian behaviour*, which is the part nobody compares. deep-time-map
 * v0.6.0 took ownership of the arithmetic (see its CHANGELOG), so this file now
 * reads it.
 *
 * What stays here is what genuinely belongs to this renderer: the seam-safe
 * `robinsonForwardDelta` below, the pannable central meridian, and globe.js's
 * GLSL. Upstream exports the table as two parallel arrays; `ROBINSON_TABLE`
 * keeps this codebase's `[lat, x, y]` triples so globe.js's GLSL generator is
 * untouched -- derived from the upstream arrays rather than retyped, which is
 * the entire point.
 */
export const ROBINSON_TABLE = ROBINSON_X.map(
  (x, i) => [i * ROBINSON_STEP, x, ROBINSON_Y[i]],
);

// Aliases for this codebase's own names. Same numbers, one source: globe.js
// interpolates its GLSL from these, so map and legend (and the WebGL raster and
// the vector overlays) cannot drift out of proportion with each other.
export const ROBINSON_XSCALE = ROBINSON_KX;
export const ROBINSON_YSCALE = ROBINSON_KY;

/**
 * Forward Robinson projection, centred on `centreLonDeg` (the pannable central
 * meridian -- Robinson has no camera tilt, so latitude plays no part in centring
 * the view the way it does for the orthographic globe). Returns [x, y] in the
 * projection's own unit system (x up to +-ROBINSON_XSCALE*PI, y up to
 * +-ROBINSON_YSCALE) -- Globe.project() scales this to pixels the same way it
 * scales spilhausForward's output, via a single R factor so the two projections'
 * apparent size matches when a page toggles between them.
 */
export function robinsonForward(lonDeg, latDeg, centreLonDeg = 0) {
  let dLon = lonDeg - centreLonDeg;
  dLon = ((dLon + 180) % 360 + 360) % 360 - 180;
  return robinsonForwardDelta(dLon, latDeg);
}

/**
 * Same as robinsonForward(), but takes a longitude DELTA already known to be safe
 * (already within the map's own -180..180 span relative to whatever centre it was
 * measured from) instead of an absolute longitude to be wrapped. robinsonForward's own
 * wrap picks a single canonical representative for the seam itself (+180 and -180 are
 * the same point on the sphere, and the wrap formula always resolves that point to
 * -180) -- fine for an ordinary point, but wrong for a piece of geometry that has
 * already been split at the seam and approaches it from the +180 side specifically:
 * re-deriving its delta by subtracting centreLonDeg and re-wrapping would silently
 * flip it back to -180, reintroducing the exact jump the split was meant to remove.
 * `shared/js/robinsonSeams.js` is the caller that needs this -- it already computed a
 * safe, unambiguous delta during clipping and must not have it re-wrapped afterwards.
 */
export function robinsonForwardDelta(dLonDeg, latDeg) {
  return robinsonUnits(dLonDeg, latDeg);
}
