/*
 * Spherical geometry for the globe: plate rotations and orthographic projection.
 *
 * Everything here treats the Earth as a sphere and works in 3D unit vectors.
 * Nothing interpolates lon/lat pairs directly -- that is a flat-plane operation
 * that misbehaves near the poles and across the antimeridian, which is precisely
 * where this story happens.
 */

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
 * Robinson projection scale factors (Snyder 1993, "Map Projections: A Working
 * Manual", table VII), at latitude 0-90 in 5 degree steps. X shrinks and Y grows
 * moving toward the pole -- the source of the projection's flattened-oval
 * outline. The same published table used by e.g. d3-geo-projection and PROJ; it
 * is not derived here, only interpolated between (linearly -- see
 * robinsonFactors()'s own note on why that is an acceptable simplification).
 */
export const ROBINSON_TABLE = [
  [0, 1.0000, 0.0000], [5, 0.9986, 0.0620], [10, 0.9954, 0.1240],
  [15, 0.9900, 0.1860], [20, 0.9822, 0.2480], [25, 0.9730, 0.3100],
  [30, 0.9600, 0.3720], [35, 0.9427, 0.4340], [40, 0.9216, 0.4958],
  [45, 0.8962, 0.5571], [50, 0.8679, 0.6176], [55, 0.8350, 0.6769],
  [60, 0.7986, 0.7346], [65, 0.7597, 0.7903], [70, 0.7186, 0.8435],
  [75, 0.6732, 0.8936], [80, 0.6213, 0.9394], [85, 0.5722, 0.9761],
  [90, 0.5322, 1.0000],
];

// Overall scale so a full 180 degrees of longitude at the equator maps to
// ROBINSON_XSCALE * PI projection units, and the pole sits at ROBINSON_YSCALE --
// the standard normalisation for this table. GlobeVec3ToRobinson()/the GLSL
// shader in globe.js both share these same two constants, so map and legend
// (and the WebGL raster and the vector overlays) cannot drift out of proportion
// with each other.
export const ROBINSON_XSCALE = 0.8487;
export const ROBINSON_YSCALE = 1.3523;

/**
 * Linear-interpolated [xFactor, yFactor] at |lat| degrees (0-90).
 *
 * Real Robinson implementations often use a cubic/Bessel interpolation across
 * this table for a slightly smoother curve; linear across 5 degree steps is
 * visually indistinguishable at the zoom levels this globe is viewed at, and
 * matches what the GLSL inverse (globe.js's ROBINSON_FRAG) can cheaply invert
 * per-pixel without a more elaborate root-find.
 */
function robinsonFactors(absLatDeg) {
  const clamped = Math.max(0, Math.min(90, absLatDeg));
  const i = Math.min(ROBINSON_TABLE.length - 2, Math.floor(clamped / 5));
  const [lat0, x0, y0] = ROBINSON_TABLE[i];
  const [, x1, y1] = ROBINSON_TABLE[i + 1];
  const t = (clamped - lat0) / 5;
  return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
}

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
  const [xFactor, yFactor] = robinsonFactors(Math.abs(latDeg));
  const x = ROBINSON_XSCALE * xFactor * (dLonDeg * DEG);
  const y = ROBINSON_YSCALE * yFactor * (latDeg < 0 ? -1 : 1);
  return [x, y];
}
