/*
 * The chart under the globe: a bundle of driver strands, with the observational record
 * drawn beneath it.
 *
 * The two are drawn in deliberately different visual languages, and the distinction is
 * the most important thing in this file:
 *
 *   STRANDS are constructed. Each one is a discrete, nameable combination of choices
 *   (model, activity definition, band, weighting) that somebody could defend. They are
 *   drawn as individual lines -- never as a filled envelope -- because a translucent hull
 *   reads as a confidence interval to anyone who has ever seen one, and the spread of
 *   these curves is not an uncertainty. It is a set of alternatives. The bundle is not a
 *   summary of the choice space; it IS the choice space, enumerated.
 *
 *   THE RECORD is measured. It gets the shaded treatment, because its spread is genuine
 *   error with a published source.
 *
 * A reader who picks up that "shaded = measured, strands = constructed" has understood
 * the page's method without being told it.
 */

/*
 * Vertical padding only. The horizontal gutters come from CSS (--chart-pad-left /
 * --chart-pad-right) because the time SLIDER below this canvas has to be inset by exactly
 * the same amounts, or the two share a panel without sharing an axis. Reading them here
 * rather than duplicating the numbers means there is one place to change them.
 */
const PAD = { top: 10, bottom: 4 };

const FALLBACK_PAD = { left: 66, right: 14 };
const ROW_GAP = 8;

/* Glaciation strip -- see _drawGlaciations() for why it is its own row. */
const GLACIATION_H = 27;
// Gaskiers lasted ~1 Myr. On an 800 Myr axis that is well under a pixel, so it would
// otherwise be invisible next to a 59 Myr Sturtian. Widened to stay findable; the
// distortion is real, so the page says so rather than letting the bar be read as duration.
const MIN_BAR_PX = 4;

export class Chart {
  /**
   * @param element   container
   * @param times     shared time axis, Ma, ascending
   * @param options   { thumbWidth } so the time marker lands on the slider thumb
   */
  constructor(element, times, { thumbWidth = 14 } = {}) {
    this.el = element;
    this.times = times;
    this.thumbWidth = thumbWidth;

    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.el.appendChild(this.canvas);

    this.strands = [];         // [{ curve, key, label, contributors }]
    this.highlight = -1;       // index of the strand matching the current knobs
    this.hover = -1;
    this.record = null;        // { times, values, label } -- measured, shaded
    this.reference = null;     // { times, values, label } -- a source's published curve
    this.time = 0;
    this.truncatedBy = 0;      // strands dropped to stay legible; 0 when none were

    this.onPick = null;        // (strand) => void, when a strand is clicked

    this.canvas.addEventListener('pointermove', (e) => this._onMove(e));
    this.canvas.addEventListener('pointerleave', () => {
      if (this.hover !== -1) { this.hover = -1; this.draw(); this._emitHover(null); }
    });
    this.canvas.addEventListener('click', () => {
      if (this.hover !== -1 && this.onPick) this.onPick(this.strands[this.hover]);
    });
  }

  setStrands(strands, { truncatedBy = 0 } = {}) {
    this.strands = strands;
    this.truncatedBy = truncatedBy;
    this.draw();
  }

  setHighlight(key) {
    this.highlight = this.strands.findIndex((s) => s.key === key);
    this.draw();
  }

  setRecord(record) {
    this.record = record;
    this.draw();
  }

  /** A published curve, shipped verbatim, drawn in the driver panel as a named line. */
  setReference(reference) {
    this.reference = reference;
    this.draw();
  }

  /** Dated glaciation intervals -- see _drawGlaciations(). */
  setGlaciations(glaciations) {
    this.glaciations = glaciations;
    this.draw();
  }

  setTime(t) {
    this.time = t;
    this.draw();
  }

  /* ---- geometry --------------------------------------------------------- */

  _layout() {
    const w = this.el.clientWidth;
    const h = this.el.clientHeight;
    const cs = getComputedStyle(this.el);
    const padLeft = parseFloat(cs.getPropertyValue('--chart-pad-left')) || FALLBACK_PAD.left;
    const padRight = parseFloat(cs.getPropertyValue('--chart-pad-right')) || FALLBACK_PAD.right;
    // The plot is inset by half a thumb at each end so the time marker sits exactly over
    // the slider thumb below it -- one time axis on this panel, not two that nearly agree.
    const x0 = padLeft + this.thumbWidth / 2;
    const x1 = w - padRight - this.thumbWidth / 2;
    const glacH = this.glaciations?.length ? GLACIATION_H : 0;
    const recordH = this.record ? Math.max(34, (h - PAD.top - PAD.bottom) * 0.28) : 0;
    const driverH = h - PAD.top - PAD.bottom - recordH - (this.record ? ROW_GAP : 0) - glacH;
    const recordY0 = PAD.top + driverH + ROW_GAP;
    return {
      w, h, x0, x1,
      driver: { y0: PAD.top, y1: PAD.top + driverH },
      record: { y0: recordY0, y1: recordY0 + recordH },
      glac: { y0: recordY0 + recordH, y1: recordY0 + recordH + glacH },
    };
  }

  _xFor(time, L) {
    const [tMin, tMax] = [this.times[0], this.times[this.times.length - 1]];
    // Deep time on the left, present on the right -- the slider reads the same way.
    return L.x1 - ((time - tMin) / (tMax - tMin)) * (L.x1 - L.x0);
  }

  /* ---- drawing ---------------------------------------------------------- */

  draw() {
    const dpr = window.devicePixelRatio || 1;
    const L = this._layout();
    if (L.w <= 0 || L.h <= 0) return;

    if (this.canvas.width !== Math.round(L.w * dpr)
        || this.canvas.height !== Math.round(L.h * dpr)) {
      this.canvas.width = Math.round(L.w * dpr);
      this.canvas.height = Math.round(L.h * dpr);
      this.canvas.style.width = `${L.w}px`;
      this.canvas.style.height = `${L.h}px`;
    }

    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, L.w, L.h);

    this._drawDrivers(ctx, L);
    if (this.record) this._drawRecord(ctx, L);
    if (this.glaciations?.length) this._drawGlaciations(ctx, L);
    this._drawMarker(ctx, L);
  }

  _drawDrivers(ctx, L) {
    if (!this.strands.length) return;
    const { y0, y1 } = L.driver;

    let max = 0;
    for (const s of this.strands) for (const v of s.curve) if (v > max) max = v;
    // The published curve shares the strands' axis -- it is the same quantity in the same
    // units, so giving it its own scale would flatter or flatten it arbitrarily.
    if (this.reference) for (const v of this.reference.values) if (v > max) max = v;
    if (max <= 0) max = 1;
    this._driverMax = max;

    const yFor = (v) => y1 - (v / max) * (y1 - y0);

    // Axis furniture first, so strands sit on top of it.
    ctx.strokeStyle = 'rgba(143, 180, 210, 0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(L.x0, y1 + 0.5); ctx.lineTo(L.x1, y1 + 0.5);
    ctx.stroke();

    ctx.fillStyle = 'rgba(159, 180, 200, 0.75)';
    ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.round(max / 1000)}k`, L.x0 - 6, yFor(max));
    ctx.fillText('0', L.x0 - 6, y1);
    ctx.save();
    ctx.translate(12, (y0 + y1) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('active suture length, km', 0, 0);
    ctx.restore();

    const strokeOne = (s, style, width) => {
      ctx.beginPath();
      for (let i = 0; i < this.times.length; i++) {
        const x = this._xFor(this.times[i], L);
        const y = yFor(s.curve[i]);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      ctx.stroke();
    };

    // Every strand faint; then the hovered one; then the one the knobs are actually set
    // to, brightest and last so it is never buried.
    for (let i = 0; i < this.strands.length; i++) {
      if (i === this.highlight || i === this.hover) continue;
      strokeOne(this.strands[i], 'rgba(126, 200, 232, 0.22)', 1);
    }
    if (this.hover !== -1 && this.hover !== this.highlight) {
      strokeOne(this.strands[this.hover], 'rgba(255, 214, 138, 0.95)', 1.8);
    }
    if (this.highlight !== -1) {
      strokeOne(this.strands[this.highlight], 'rgba(126, 232, 200, 1)', 2.2);
    }

    // The published curve last, dashed and white, so it reads as a different KIND of
    // object from the strands without reading as more authoritative than them.
    if (this.reference) {
      const r = this.reference;
      ctx.save();
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      for (let i = 0; i < r.times.length; i++) {
        const x = this._xFor(r.times[i], L);
        const y = yFor(r.values[i]);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(r.label, L.x1, y0 + 1);
    }

    if (this.truncatedBy > 0) {
      ctx.fillStyle = 'rgba(255, 190, 120, 0.9)';
      ctx.textAlign = 'left';
      ctx.fillText(
        `${this.strands.length} of ${this.strands.length + this.truncatedBy} combinations drawn`,
        L.x0 + 4, y0 + 7);
    }
  }

  _drawRecord(ctx, L) {
    const { y0, y1 } = L.record;
    const r = this.record;
    let max = 0;
    for (const v of r.values) if (v != null && v > max) max = v;
    if (max <= 0) max = 1;

    // Filled, not stroked. This is the measured series and it is meant to look
    // categorically unlike the strands above it.
    ctx.beginPath();
    ctx.moveTo(this._xFor(r.times[0], L), y1);
    for (let i = 0; i < r.times.length; i++) {
      const v = r.values[i];
      ctx.lineTo(this._xFor(r.times[i], L), y1 - ((v ?? 0) / max) * (y1 - y0));
    }
    ctx.lineTo(this._xFor(r.times[r.times.length - 1], L), y1);
    ctx.closePath();
    ctx.fillStyle = 'rgba(150, 190, 255, 0.28)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(170, 205, 255, 0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = 'rgba(159, 180, 200, 0.75)';
    ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(r.label, L.x0 - 6, (y0 + y1) / 2);
  }

  /*
   * Dated glaciations, as interval bars in their own strip.
   *
   * They are NOT folded into the record curve above, because they are not the same kind of
   * measurement. `ice_extent` is a continuous latitude-of-ice-margin series and it stops at
   * 525 Ma; the Cryogenian record is a set of brackets -- "the onset lies between these two
   * dated horizons". Drawing the second as a curve would invent a continuity the
   * geochronology does not have.
   *
   * Each boundary is drawn at the real width of its bracket: solid where the age is pinned,
   * fading out across the range where it is not. That is the whole point of the encoding.
   * Three of the four Cryogenian boundaries are known to a little over 1 Myr and read as
   * hard edges; the Marinoan onset is loose over 10.9 Myr and visibly dissolves. No
   * annotation makes that claim -- the bar just looks like what the data is.
   */
  _drawGlaciations(ctx, L) {
    const { y0, y1 } = L.glac;
    // Two rows: bars on top at their true positions, names underneath. They were one row
    // to begin with, and a name displaced sideways to clear its neighbour ended up sitting
    // on top of the NEXT glaciation's bar -- all three fall within a fifth of the axis, so
    // there is no horizontal arrangement that keeps names off bars. Separating the rows
    // does, and leaves the bars unmoved, which is the part that has to stay honest.
    const top = y0 + 2;
    const h = 7;
    const labelY = top + h + 6;

    ctx.save();
    ctx.textBaseline = 'middle';

    ctx.fillStyle = 'rgba(159, 180, 200, 0.75)';
    ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('glaciations', L.x0 - 6, top + h / 2);

    const bars = [];
    for (const g of this.glaciations) {
      // Bracket ends, oldest first. onset[0] is the oldest the onset could be, onset[1] the
      // youngest; likewise for the termination.
      const xOnsetOld = this._xFor(g.onset[0], L);
      const xOnsetYoung = this._xFor(g.onset[1], L);
      const xEndOld = this._xFor(g.termination[0], L);
      let xEndYoung = this._xFor(g.termination[1], L);

      if (xEndYoung - xOnsetOld < MIN_BAR_PX) xEndYoung = xOnsetOld + MIN_BAR_PX;

      // Left (older) edge fades in across the onset bracket; right edge fades out across
      // the termination bracket. A zero-width bracket produces a hard edge, which is
      // correct -- it means the boundary is dated to better than a pixel.
      const on = this.hoverGlac === bars.length;
      const grad = ctx.createLinearGradient(xOnsetOld, 0, xEndYoung, 0);
      const span = Math.max(1e-6, xEndYoung - xOnsetOld);
      const solid = on ? 'rgba(208, 230, 255, 0.95)' : 'rgba(176, 208, 255, 0.72)';
      const clear = 'rgba(176, 208, 255, 0)';
      const inAt = Math.min(1, Math.max(0, (xOnsetYoung - xOnsetOld) / span));
      const outAt = Math.min(1, Math.max(0, (xEndOld - xOnsetOld) / span));
      grad.addColorStop(0, clear);
      grad.addColorStop(inAt, solid);
      grad.addColorStop(Math.max(inAt, outAt), solid);
      grad.addColorStop(1, g.bracketing ? solid : clear);

      ctx.fillStyle = grad;
      ctx.fillRect(xOnsetOld, top, xEndYoung - xOnsetOld, h);

      bars.push({ g, xOnsetOld, xEndYoung, top, h });
    }

    /*
     * Names, in their own row. Each is centred under its bar, then nudged right if it
     * would touch the previous one -- so the order always reads left to right even when
     * two bars are a few pixels apart. A tick joins a name back to its bar whenever the
     * nudge moved it far enough for the pairing to be in doubt.
     */
    ctx.font = '9px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'left';
    const LABEL_GAP = 7;
    let cursor = L.x0;

    for (let i = 0; i < bars.length; i++) {
      const { g, xOnsetOld, xEndYoung } = bars[i];
      const wLabel = ctx.measureText(g.name).width;
      const barMid = (xOnsetOld + xEndYoung) / 2;
      const lx = Math.max(barMid - wLabel / 2, cursor);
      const labelMid = lx + wLabel / 2;

      if (Math.abs(labelMid - barMid) > 2) {
        ctx.strokeStyle = 'rgba(176, 208, 255, 0.28)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(barMid + 0.5, top + h);
        ctx.lineTo(labelMid + 0.5, labelY - 5);
        ctx.stroke();
      }

      ctx.fillStyle = this.hoverGlac === i
        ? 'rgba(226, 240, 255, 0.95)' : 'rgba(200, 222, 255, 0.8)';
      ctx.fillText(g.name, lx, labelY);
      cursor = lx + wLabel + LABEL_GAP;
    }
    ctx.restore();
  }

  _drawMarker(ctx, L) {
    const x = this._xFor(this.time, L);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, L.driver.y0);
    ctx.lineTo(x + 0.5, this.glaciations?.length ? L.glac.y1
      : this.record ? L.record.y1 : L.driver.y1);
    ctx.stroke();
  }

  /* ---- hover ------------------------------------------------------------ */

  _onMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const L = this._layout();

    /*
     * The glaciation strip carries its dates on hover rather than on the chart.
     *
     * That is not a fallback, it is forced by the axis: across 800 Myr a pixel is about
     * 1.5 Myr, so three of the four Cryogenian brackets are narrower than the line used to
     * draw them and Gaskiers' whole duration is under a pixel. The bars can honestly show
     * WHERE and ROUGHLY HOW LONG; the numbers have to be read, not measured off the strip.
     */
    if (this.glaciations?.length && py >= L.glac.y0 && py <= L.glac.y1) {
      const hit = this._glaciationAt(px, L);
      if (hit !== this.hoverGlac) {
        this.hoverGlac = hit;
        this.draw();
        this._emitHover(hit == null ? null
          : { glaciation: this.glaciations[hit], x: e.clientX, y: e.clientY });
      }
      return;
    }
    if (this.hoverGlac != null) { this.hoverGlac = null; this.draw(); this._emitHover(null); }

    if (py < L.driver.y0 || py > L.driver.y1 || !this.strands.length) {
      if (this.hover !== -1) { this.hover = -1; this.draw(); this._emitHover(null); }
      return;
    }

    // Which time is under the pointer, then which strand passes closest to it.
    const [tMin, tMax] = [this.times[0], this.times[this.times.length - 1]];
    const frac = (L.x1 - px) / (L.x1 - L.x0);
    const t = tMin + frac * (tMax - tMin);
    let idx = Math.round((t - tMin) / (tMax - tMin) * (this.times.length - 1));
    idx = Math.max(0, Math.min(this.times.length - 1, idx));

    const max = this._driverMax || 1;
    const yFor = (v) => L.driver.y1 - (v / max) * (L.driver.y1 - L.driver.y0);

    let best = -1;
    let bestD = 12;            // px; beyond this nothing is hovered
    for (let i = 0; i < this.strands.length; i++) {
      const d = Math.abs(yFor(this.strands[i].curve[idx]) - py);
      if (d < bestD) { bestD = d; best = i; }
    }

    if (best !== this.hover) {
      this.hover = best;
      this.draw();
      this._emitHover(best === -1 ? null : {
        strand: this.strands[best],
        value: this.strands[best].curve[idx],
        time: this.times[idx],
        x: e.clientX,
        y: e.clientY,
      });
    }
  }

  /** Index of the glaciation under `px`, with a generous pad so Gaskiers is reachable. */
  _glaciationAt(px, L) {
    const PAD_PX = 4;
    for (let i = 0; i < this.glaciations.length; i++) {
      const g = this.glaciations[i];
      const a = this._xFor(g.onset[0], L);
      const b = Math.max(this._xFor(g.termination[1], L), a + MIN_BAR_PX);
      if (px >= a - PAD_PX && px <= b + PAD_PX) return i;
    }
    return null;
  }

  _emitHover(payload) {
    this.onHover?.(payload);
  }
}
