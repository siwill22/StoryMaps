/*
 * Orthographic globe: a WebGL raster layer with a 2D vector overlay on top.
 *
 * The raster layer is a single full-screen quad whose fragment shader does the
 * inverse orthographic projection and samples an equirectangular paleogeography
 * texture. Doing it in the shader rather than per-pixel on the CPU is what makes
 * a full-viewport globe redraw cheaply enough to be driven by scrolling.
 *
 * The overlay is a plain 2D canvas using the identical camera maths from geo.js,
 * so vectors register with the raster exactly. It draws strokes only -- never
 * filled polygons -- which sidesteps the awkward business of clipping filled
 * shapes to the horizon, since the raster already supplies the fill.
 */

import {
  DEG,
  lonLatToVec3,
  quatFromPoleAngle,
  quatSlerp,
  quatToMat3,
  mat3Multiply,
  viewMatrix,
  spilhausForward,
  spilhausViewMatrix,
} from './geo.js';

const VERT_SRC = `
attribute vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG_SRC = `
precision highp float;

uniform vec2  uCentre;     // globe centre in pixels
uniform float uRadius;     // globe radius in pixels
uniform vec3  uEast;       // camera basis, world coords
uniform vec3  uNorth;
uniform vec3  uOut;
uniform sampler2D uTexA;
uniform sampler2D uTexB;
uniform float uMix;
uniform float uOpacity;

const float PI = 3.141592653589793;

// Spilhaus projection parameters
const float SPILHAUS_SCALE = 0.917;
const vec2 SPILHAUS_CENTER = vec2(142.0 * PI / 180.0, -71.0 * PI / 180.0);

void main() {
  vec2 d = (gl_FragCoord.xy - uCentre) / uRadius;
  float rho2 = dot(d, d);
  
  // Discard points outside the Spilhaus projection bounds
  if (rho2 > 1.0) discard;
  
  // Convert pixel coordinates to Spilhaus projected coordinates
  vec2 p = d * (1.0 / SPILHAUS_SCALE);
  float rho = sqrt(rho2) / SPILHAUS_SCALE;
  
  // Inverse Spilhaus: convert projected coords to lon/lat
  float c = 2.0 * atan(rho / (2.0 * SPILHAUS_SCALE));
  float sinc = sin(c);
  
  // Angular distance from center
  float cos_c = cos(c);
  float lat = asin(cos_c * sin(SPILHAUS_CENTER.y) + 
                   (p.y * sinc * cos(SPILHAUS_CENTER.y)) / rho);
  
  float lon = SPILHAUS_CENTER.x + atan(p.x * sinc, 
                   rho * cos(SPILHAUS_CENTER.y) * cos_c - 
                   p.y * sin(SPILHAUS_CENTER.y) * sinc);
  
  // WebGL 1 NPOT textures must not use REPEAT wrapping. The longitudes are
  // wrapped by fract() rather than a repeating wrap mode so the antimeridian is
  // still continuous without creating incomplete textures on 3600x1800 maps.
  float u = fract(lon / (2.0 * PI) + 0.5);
  float v = clamp(0.5 - lat / PI, 0.0, 1.0);
  vec2 uv = vec2(u, v);
  
  vec3 col = mix(texture2D(uTexA, uv).rgb, texture2D(uTexB, uv).rgb, uMix);
  
  // Feather the limb
  float rho_raw = sqrt(rho2);
  float feather = 1.5 / uRadius;
  float alpha = smoothstep(1.0, 1.0 - feather, rho_raw) * uOpacity;
  
  gl_FragColor = vec4(col * alpha, alpha);
}`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error('shader: ' + gl.getShaderInfoLog(sh));
  }
  return sh;
}

export class Globe {
  constructor(container) {
    this.container = container;

    this.rasterCanvas = document.createElement('canvas');
    this.rasterCanvas.className = 'globe-raster';
    container.appendChild(this.rasterCanvas);

    this.overlayCanvas = document.createElement('canvas');
    this.overlayCanvas.className = 'globe-overlay';
    container.appendChild(this.overlayCanvas);

    this.gl = this.rasterCanvas.getContext('webgl', {
      alpha: true,
      antialias: false,
      premultipliedAlpha: true,
    });
    if (!this.gl) throw new Error('WebGL unavailable');

    this.ctx = this.overlayCanvas.getContext('2d');

    this.state = { age: 0, lon: 135, lat: -60, zoom: 1, opacity: 1 };
    this.frames = [];
    this.textures = new Map();   // age -> { tex, image, loading }
    this.coast = null;
    this.overlays = [];

    this._view = new Float64Array(9);
    this._plateMat = new Map();
    this._qa = [0, 0, 0, 1];
    this._qb = [0, 0, 0, 1];
    this._q = [0, 0, 0, 1];
    this._m = new Float64Array(9);

    this._initGL();
    this._resize();
    window.addEventListener('resize', () => { this._resize(); this.render(); });
  }

  _initGL() {
    const gl = this.gl;
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT_SRC));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('link: ' + gl.getProgramInfoLog(prog));
    }
    gl.useProgram(prog);
    this.prog = prog;

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this.u = {};
    for (const n of ['uCentre', 'uRadius', 'uEast', 'uNorth', 'uOut',
                     'uTexA', 'uTexB', 'uMix', 'uOpacity']) {
      this.u[n] = gl.getUniformLocation(prog, n);
    }

    gl.uniform1i(this.u.uTexA, 0);
    gl.uniform1i(this.u.uTexB, 1);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    this.blankTex = this._makeTexture(null);
  }

  _makeTexture(image) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (image) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB,
        gl.UNSIGNED_BYTE, new Uint8Array([10, 20, 40]));
    }
    const width = image ? image.width : 1;
    const height = image ? image.height : 1;
    const isNpot = (width & (width - 1)) !== 0 || (height & (height - 1)) !== 0;

    // WebGL 1 makes NPOT textures with REPEAT wrapping incomplete, which renders
    // as a fully black sample even though the upload succeeded.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, isNpot ? gl.CLAMP_TO_EDGE : gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    for (const c of [this.rasterCanvas, this.overlayCanvas]) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      c.style.width = w + 'px';
      c.style.height = h + 'px';
    }
    this.dpr = dpr;
    this.cssWidth = w;
    this.cssHeight = h;
    this.gl.viewport(0, 0, this.rasterCanvas.width, this.rasterCanvas.height);
  }

  /* ---- data ------------------------------------------------------------- */

  async loadTextures(url) {
    this.cacheBuster = Date.now();
    const manifestUrl = `${url}${url.includes('?') ? '&' : '?'}v=${this.cacheBuster}`;
    const manifest = await (await fetch(manifestUrl, { cache: 'no-store' })).json();
    this.frames = manifest.frames.slice().sort((a, b) => a.age - b.age);
    this.textureBase = url.replace(/[^/]*$/, '');
    // Pull in the two endpoints up front so there is always something to show.
    await Promise.all([
      this._loadTexture(this.frames[0]),
      this._loadTexture(this.frames[this.frames.length - 1]),
    ]);
  }

  _loadTexture(frame) {
    const existing = this.textures.get(frame.age);
    if (existing) return existing.promise;

    const entry = { tex: null };
    entry.promise = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        entry.tex = this._makeTexture(img);
        resolve(entry);
        this.render();
      };
      img.onerror = () => resolve(entry);
      img.src = `${this.textureBase}${frame.file}?v=${this.cacheBuster ?? Date.now()}`;
    });
    this.textures.set(frame.age, entry);
    return entry.promise;
  }

  /** Warm the cache so scrolling does not stall on first paint of each frame. */
  prefetchAll() {
    for (const f of this.frames) this._loadTexture(f);
  }

  async loadCoastlines(url) {
    const data = await (await fetch(url)).json();
    this.coast = data;
    this.coast.times = data.times;

    // Pre-convert every vertex to a unit vector once. Per frame we only need a
    // matrix multiply per point, no trigonometry.
    let total = 0;
    for (const f of data.features) total += f.xy.length / 2;

    const xyz = new Float64Array(total * 3);
    const meta = [];
    let o = 0;
    const tmp = [0, 0, 0];
    for (const f of data.features) {
      const n = f.xy.length / 2;
      meta.push({ plate: String(f.p), closed: !!f.c, begin: f.b, end: f.e,
                  offset: o, count: n });
      for (let i = 0; i < n; i++) {
        lonLatToVec3(f.xy[i * 2], f.xy[i * 2 + 1], tmp);
        xyz[(o + i) * 3] = tmp[0];
        xyz[(o + i) * 3 + 1] = tmp[1];
        xyz[(o + i) * 3 + 2] = tmp[2];
      }
      o += n;
    }
    this.coastXYZ = xyz;
    this.coastMeta = meta;

    // Pre-convert the rotation series to quaternions, again once.
    this.quats = new Map();
    for (const [plate, series] of Object.entries(data.rotations)) {
      this.quats.set(plate, series.map(
        ([lon, lat, ang]) => quatFromPoleAngle(lon, lat, ang)));
    }
  }

  /* ---- state ------------------------------------------------------------ */

  set(state) {
    Object.assign(this.state, state);
    return this;
  }

  addOverlay(fn) {
    this.overlays.push(fn);
    return this;
  }

  /* ---- projection helpers used by overlays ------------------------------ */

  /** Project lon/lat to overlay canvas coords. Returns null if over the horizon. */
  project(lonDeg, latDeg) {
    // Use Spilhaus projection for the Southern Ocean view
    const result = spilhausForward(lonDeg, latDeg);
    if (!result) return null;
    
    const [x, y] = result;
    // Scale and center for display
    const scale = this.radius * 0.5;  // Adjust scale to fit the view
    return [this.cx + x * scale, this.cy - y * scale];
  }

  get geometry() {
    return { cx: this.cx, cy: this.cy, radius: this.radius };
  }

  /* ---- rotations -------------------------------------------------------- */

  _plateMatrices(age) {
    const times = this.coast.times;
    const clamped = Math.max(times[0], Math.min(times[times.length - 1], age));

    // Bracketing 1 Myr steps, then slerp: motion between steps follows the
    // great circle traced by the Euler rotation, not a lon/lat shortcut.
    let i = Math.floor(clamped);
    if (i >= times.length - 1) i = times.length - 2;
    const t = clamped - times[i];

    this._plateMat.clear();
    for (const [plate, series] of this.quats) {
      const q = quatSlerp(series[i], series[i + 1], t, this._q);
      quatToMat3(q, this._m);
      // Fold the camera in now so each vertex needs one matrix multiply, not two.
      this._plateMat.set(plate, mat3Multiply(this._view, this._m,
        new Float64Array(9)));
    }
  }

  /* ---- render ----------------------------------------------------------- */

  render() {
    const { age, lon, lat, zoom, opacity } = this.state;

    // Spilhaus projection center is fixed at 71°S, 142°E
    // But allow override for different views
    const spilhausLon = lon !== undefined ? lon : 142;
    const spilhausLat = lat !== undefined ? lat : -71;
    
    this.radius = Math.min(this.cssWidth, this.cssHeight) * 0.42 * zoom;
    this.cx = this.cssWidth / 2;
    this.cy = this.cssHeight / 2;

    spilhausViewMatrix(spilhausLon, spilhausLat, this._view);
    this._renderRaster(age, opacity);
    this._renderOverlay(age);
  }

  _renderRaster(age, opacity) {
    const gl = this.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!this.frames.length) return;

    // Bracketing texture frames, so the paleogeography cross-fades rather than
    // jumping between the 5 Myr maps.
    let i = 0;
    while (i < this.frames.length - 1 && this.frames[i + 1].age <= age) i++;
    const a = this.frames[i];
    const b = this.frames[Math.min(i + 1, this.frames.length - 1)];
    const span = b.age - a.age;
    const mix = span > 0 ? Math.max(0, Math.min(1, (age - a.age) / span)) : 0;

    this._loadTexture(a);
    this._loadTexture(b);
    const ta = this.textures.get(a.age)?.tex || this.blankTex;
    const tb = this.textures.get(b.age)?.tex || ta;

    const m = this._view;
    gl.useProgram(this.prog);
    gl.uniform2f(this.u.uCentre, this.cx * this.dpr,
      (this.cssHeight - this.cy) * this.dpr);
    gl.uniform1f(this.u.uRadius, this.radius * this.dpr);
    gl.uniform3f(this.u.uEast, m[0], m[1], m[2]);
    gl.uniform3f(this.u.uNorth, m[3], m[4], m[5]);
    gl.uniform3f(this.u.uOut, m[6], m[7], m[8]);
    gl.uniform1f(this.u.uMix, mix);
    gl.uniform1f(this.u.uOpacity, opacity ?? 1);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, ta);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, tb);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  _renderOverlay(age) {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);

    if (this.coast) {
      this._plateMatrices(age);
      this._drawCoastlines(age);
    }
    for (const fn of this.overlays) fn(ctx, this, age);
  }

  _drawCoastlines(age) {
    const ctx = this.ctx;
    const xyz = this.coastXYZ;
    const R = this.radius;

    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 0.9;
    ctx.lineJoin = 'round';
    ctx.beginPath();

    for (const f of this.coastMeta) {
      if (age > f.begin || age < f.end) continue;
      const m = this._plateMat.get(f.plate);
      if (!m) continue;

      let pen = false;
      const start = f.offset;
      const n = f.count;
      // Closed rings repeat their first vertex so the outline joins up.
      const limit = f.closed ? n + 1 : n;

      for (let k = 0; k < limit; k++) {
        const idx = (start + (k % n)) * 3;
        const vx = xyz[idx], vy = xyz[idx + 1], vz = xyz[idx + 2];

        const depth = m[6] * vx + m[7] * vy + m[8] * vz;
        if (depth <= 0) { pen = false; continue; }

        const px = this.cx + (m[0] * vx + m[1] * vy + m[2] * vz) * R;
        const py = this.cy - (m[3] * vx + m[4] * vy + m[5] * vz) * R;

        if (pen) ctx.lineTo(px, py);
        else { ctx.moveTo(px, py); pen = true; }
      }
    }
    ctx.stroke();
    ctx.restore();
  }
}
