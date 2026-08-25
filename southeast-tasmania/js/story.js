import { Globe } from '../../shared/js/globe.js';
import { ScrollDriver, easeInOut, ramp, lerp, prefersReducedMotion } from '../../shared/js/scroll.js';
import { cameraInterpolate, smallCirclePoints } from '../../shared/js/geo.js';

const OLDEST_AVAILABLE_TEXTURE_AGE = 300;

const EPOCHS = [
  [0.0, 'Holocene'],
  [2.58, 'Quaternary'],
  [66.0, 'Paleogene'],
  [145.0, 'Cretaceous'],
  [201.0, 'Jurassic'],
  [251.0, 'Triassic'],
  [300.0, 'Permian'],
];

function epochFor(age) {
  for (const [limit, name] of EPOCHS) {
    if (age <= limit) return name;
  }
  return 'Permian';
}

const CAMERA = {
  gondwana: { lon: 120, lat: -58, zoom: 0.96 },
  tasmania: { lon: 145, lat: -59, zoom: 1.28 },
  southPolar: { lon: 115, lat: -74, zoom: 1.12 },
};

// Each scene owns one monotone span of the narrative. ScrollDriver reports
// progress per scene, so the age has to be interpolated per scene too --
// driving a story-wide age curve from a per-scene 0..1 makes the globe
// replay the whole journey in every section. Consecutive spans share an
// endpoint, so the scene overlap in scroll.js hands over continuously.
//
// A span is a *sweep* ([a0, a1] with a0 !== a1) only where the prose narrates
// change over time -- the intro's journey back, and the Permian-Triassic
// basin transition. Everywhere else the chapter's photos and text all refer
// to one moment (e.g. scene-d/e are both the 180 Ma dolerite event, shown
// through different photos and a schematic), so the span is a *hold*
// ([a, a]) and the globe stays put while the reader scrolls through it. The
// jump between a held age and the next chapter's age happens at the scene
// boundary, eased by the same onFrame smoothing as everything else.
const SCENE_AGES = {
  'scene-a': [0, 300],    // intro, Gondwana -- the one journey back
  'scene-b': [300, 250],  // Permian-Triassic basins: an explicit transition
  'scene-c': [250, 250],  // fossils and paleoenvironments: still Permian
  'scene-d': [180, 180],  // Mesozoic volcanism: the 180 Ma dolerite event
  'scene-e': [180, 180],  // why dykes/sills matter: same 180 Ma event
  'scene-f': [180, 0],    // Port Arthur and Eaglehawk Neck: back to today
  'scene-g': [0, 0],      // synthesis, hold at present
};

async function main() {
  const globeEl = document.getElementById('globe');
  const timecodeEl = document.getElementById('timecode');
  const loadingEl = document.getElementById('loading');

  const globe = new Globe(globeEl);

  await Promise.all([
    globe.loadTextures('../../shared/data/textures.json'),
  ]);

  // This story is written to a 300 Ma narrative span, and the project now
  // includes the older 5 Myr PALEOMAP raster series through 300 Ma, so the
  // visible globe can track the full Permian–Triassic range without inventing
  // missing palaeogeography frames.

  const accRing = smallCirclePoints(0, -90, 42, 240);
  let accAlpha = 0;

  globe.addOverlay((ctx, g) => {
    if (accAlpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = accAlpha;

    const pts = accRing.map(([lon, lat]) => g.project(lon, lat));
    ctx.strokeStyle = 'rgba(143,212,240,0.95)';
    ctx.lineWidth = 2.4;
    ctx.shadowColor = 'rgba(143,212,240,0.85)';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    let pen = false;
    for (const p of pts) {
      if (!p) { pen = false; continue; }
      if (pen) ctx.lineTo(p[0], p[1]); else { ctx.moveTo(p[0], p[1]); pen = true; }
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
  });

  const target = {
    age: 0,
    displayAge: 0,
    camera: { ...CAMERA.tasmania },
    globeOpacity: 1,
    acc: 0,
    timecode: false,
  };

  const current = {
    age: 0,
    displayAge: 0,
    camera: { ...CAMERA.tasmania },
    globeOpacity: 1,
    acc: 0,
  };

  const TAU = 0.12;

  const driver = new ScrollDriver({
    onFrame: (dt) => {
      const EASE = prefersReducedMotion ? 1 : 1 - Math.exp(-dt / TAU);
      current.age += (target.age - current.age) * EASE;
      current.displayAge += (target.displayAge - current.displayAge) * EASE;
      current.camera = cameraInterpolate(current.camera, target.camera, EASE);
      current.globeOpacity += (target.globeOpacity - current.globeOpacity) * EASE;
      current.acc += (target.acc - current.acc) * EASE;

      accAlpha = current.acc;
      const globeAge = Math.min(Math.max(current.age, 0), OLDEST_AVAILABLE_TEXTURE_AGE);
      globe.set({
        age: globeAge,
        lon: current.camera.lon,
        lat: current.camera.lat,
        zoom: current.camera.zoom,
      });
      globe.render();

      timecodeEl.classList.toggle('is-on', target.timecode);
      const a = Math.max(0, current.displayAge);
      timecodeEl.innerHTML =
        `<span class="age">${a.toFixed(1)}<small> Ma</small></span>` +
        `<span class="epoch">${epochFor(a)}</span>`;
    },
  });

  // Age comes from the scene's own span; the callback only has to say where the
  // camera is looking and how strongly the accretion ring shows.
  function addScene(id, onProgress) {
    const [a0, a1] = SCENE_AGES[id];
    driver.addScene(document.getElementById(id), {
      onProgress(p) {
        const age = lerp(a0, a1, easeInOut(p));
        target.displayAge = age;
        target.age = Math.min(Math.max(age, 0), OLDEST_AVAILABLE_TEXTURE_AGE);
        target.globeOpacity = 1;
        target.timecode = id !== 'scene-a';
        onProgress(p, age);
      },
    });
  }

  addScene('scene-a', (p) => {
    target.camera = cameraInterpolate(CAMERA.gondwana, CAMERA.tasmania, easeInOut(p));
    target.acc = ramp(p, 0.1, 0.5) * 0.95;
  });

  addScene('scene-b', (p, age) => {
    target.camera = cameraInterpolate(CAMERA.gondwana, CAMERA.tasmania, easeInOut(p));
    target.acc = ramp(age, 300, 180) * 0.85;
  });

  addScene('scene-c', (p, age) => {
    target.camera = cameraInterpolate(CAMERA.tasmania, CAMERA.southPolar, easeInOut(p));
    target.acc = ramp(age, 250, 100) * 0.75;
  });

  addScene('scene-d', (p) => {
    target.camera = cameraInterpolate(CAMERA.tasmania, CAMERA.southPolar, easeInOut(p));
    target.acc = lerp(0.75, 0.25, ramp(p, 0.1, 0.9));
  });

  addScene('scene-e', (p) => {
    target.camera = cameraInterpolate(CAMERA.southPolar, CAMERA.tasmania, easeInOut(p));
    target.acc = lerp(0.25, 0.0, ramp(p, 0.1, 0.9));
  });

  addScene('scene-f', (p) => {
    target.camera = cameraInterpolate(CAMERA.tasmania, { lon: 140, lat: -48, zoom: 1.45 }, easeInOut(p));
    target.acc = lerp(0.12, 0.05, ramp(p, 0.1, 0.9));
  });

  addScene('scene-g', (p) => {
    target.camera = cameraInterpolate({ lon: 140, lat: -48, zoom: 1.45 }, CAMERA.tasmania, easeInOut(p));
    target.acc = lerp(0.08, 0.0, ramp(p, 0.1, 0.9));
  });

  driver.start();
  loadingEl.classList.add('is-done');
  setTimeout(() => {
    loadingEl.style.display = 'none';
  }, 1100);

  const m = /(?:^|#|&)p=([0-9.]+)/.exec(location.hash);
  if (m) {
    const frac = Math.max(0, Math.min(1, parseFloat(m[1])));
    const total = document.body.scrollHeight - window.innerHeight;
    window.scrollTo({ top: frac * total, behavior: 'instant' });
    for (let i = 0; i < 200; i++) driver._measure();
    Object.assign(current, {
      age: target.age,
      displayAge: target.displayAge,
      camera: { ...target.camera },
      globeOpacity: target.globeOpacity,
      acc: target.acc,
    });
  }

  setTimeout(() => globe.prefetchAll(), 1500);
}

main().catch((err) => {
  console.error(err);
  const el = document.getElementById('loading');
  if (el) el.textContent = 'Could not load: ' + err.message;
});
