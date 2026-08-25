/*
 * Scroll engine.
 *
 * Scenes are tall sections that scroll over a fixed full-viewport stage. Each
 * reports a 0..1 progress value: 0 when its top reaches the top of the viewport,
 * 1 when its bottom reaches the bottom. Story-specific behaviour lives in
 * story.js; this file only turns scroll position into numbers.
 *
 * Rendering is coalesced into a single requestAnimationFrame loop, so a burst of
 * scroll events causes one redraw, not dozens.
 */

export const prefersReducedMotion =
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export class ScrollDriver {
  constructor({ onFrame }) {
    this.scenes = [];
    this.onFrame = onFrame;
    this.needsFrame = true;
    this.running = false;

    this._tick = this._tick.bind(this);
    const request = () => { this.needsFrame = true; };
    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', request);
  }

  addScene(el, handlers = {}) {
    this.scenes.push({ el, handlers, active: false, progress: 0 });
    return this;
  }

  start() {
    if (this.running) return;
    this.running = true;
    requestAnimationFrame(this._tick);
  }

  _tick(now) {
    if (this.needsFrame) {
      this.needsFrame = false;
      this._measure();
    }
    // Elapsed seconds, clamped so a backgrounded tab does not resume with one
    // enormous step. Passed to onFrame so easing can be time-based rather than
    // per-frame, which would otherwise settle twice as fast on a 120 Hz display.
    const dt = this._last ? Math.min((now - this._last) / 1000, 0.1) : 1 / 60;
    this._last = now;

    if (this.onFrame) this.onFrame(dt);
    requestAnimationFrame(this._tick);
  }

  _measure() {
    const vh = window.innerHeight;

    for (const scene of this.scenes) {
      const rect = scene.el.getBoundingClientRect();

      // Scrubbable distance is the scene height minus one viewport. Guard against
      // scenes shorter than the viewport, which would divide by zero.
      const scrub = Math.max(1, rect.height - vh);
      const progress = Math.max(0, Math.min(1, -rect.top / scrub));

      // Deliberately generous, so consecutive scenes overlap briefly rather than
      // leaving a gap where nothing is driving the stage. Scenes are handled in
      // document order, so during an overlap the later scene wins and the
      // handover is continuous.
      const active = rect.top < vh && rect.bottom > 0;

      if (active && !scene.active) {
        scene.active = true;
        scene.el.classList.add('is-active');
        scene.handlers.onEnter?.(scene);
      } else if (!active && scene.active) {
        scene.active = false;
        scene.el.classList.remove('is-active');
        scene.handlers.onExit?.(scene);
      }

      scene.progress = progress;
      if (scene.active) scene.handlers.onProgress?.(progress, scene);

      this._updateSteps(scene, vh);
    }
  }

  _updateSteps(scene, vh) {
    const steps = scene.el.querySelectorAll('.step');
    for (const step of steps) {
      const r = step.getBoundingClientRect();
      const centre = r.top + r.height / 2;
      const on = centre > vh * 0.15 && centre < vh * 0.85;
      step.classList.toggle('is-visible', on);
    }
  }
}

/** Smooth 0..1 ramp; gentler at both ends than a raw linear scrub. */
export function easeInOut(t) {
  t = Math.max(0, Math.min(1, t));
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/** Map x from [a,b] to [0,1], clamped. */
export function ramp(x, a, b) {
  if (b === a) return x >= b ? 1 : 0;
  return Math.max(0, Math.min(1, (x - a) / (b - a)));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}
