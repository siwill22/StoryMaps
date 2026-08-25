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

/**
 * Quaternion for a finite rotation given as an Euler pole and angle -- the form
 * plate reconstructions come in.
 */
export function quatFromPoleAngle(poleLonDeg, poleLatDeg, angleDeg) {
  const axis = lonLatToVec3(poleLonDeg, poleLatDeg);
  const half = angleDeg * DEG * 0.5;
  const s = Math.sin(half);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(half)];
}

/**
 * Spherical linear interpolation. This is what makes motion between the 1 Myr
 * reconstruction steps follow a great circle rather than cutting across it.
 */
export function quatSlerp(a, b, t, out) {
  out = out || [0, 0, 0, 1];
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];

  // q and -q are the same rotation; pick the nearer one so we take the short way.
  let bx = b[0], by = b[1], bz = b[2], bw = b[3];
  if (dot < 0) {
    dot = -dot;
    bx = -bx; by = -by; bz = -bz; bw = -bw;
  }

  let s0, s1;
  if (dot > 0.9995) {
    // Nearly parallel: slerp is numerically unstable, and lerp is indistinguishable.
    s0 = 1 - t;
    s1 = t;
  } else {
    const theta = Math.acos(dot);
    const sinTheta = Math.sin(theta);
    s0 = Math.sin((1 - t) * theta) / sinTheta;
    s1 = Math.sin(t * theta) / sinTheta;
  }

  out[0] = s0 * a[0] + s1 * bx;
  out[1] = s0 * a[1] + s1 * by;
  out[2] = s0 * a[2] + s1 * bz;
  out[3] = s0 * a[3] + s1 * bw;

  const n = Math.hypot(out[0], out[1], out[2], out[3]) || 1;
  out[0] /= n; out[1] /= n; out[2] /= n; out[3] /= n;
  return out;
}

/** Row-major 3x3 rotation matrix from a unit quaternion. */
export function quatToMat3(q, out) {
  out = out || new Float64Array(9);
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;

  out[0] = 1 - (yy + zz); out[1] = xy - wz;       out[2] = xz + wy;
  out[3] = xy + wz;       out[4] = 1 - (xx + zz); out[5] = yz - wx;
  out[6] = xz - wy;       out[7] = yz + wx;       out[8] = 1 - (xx + yy);
  return out;
}

export function mat3Multiply(a, b, out) {
  out = out || new Float64Array(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out[r * 3 + c] =
        a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    }
  }
  return out;
}

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
