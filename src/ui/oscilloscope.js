/**
 * Multi-Channel Luminous Atelier Virtual Digital Storage Oscilloscope.
 * Harmonizes with Daylight Atelier (#fbf6ec / #fffdf7 paper plot) and Starlight Atelier (#181624 / #211e30 twilight screen).
 * Features:
 * - 10x8 soft warm sepia / twilight graticule with central subdivision ticks.
 * - Sub-sample interpolated Rising/Falling Edge Trigger with draggable trigger level.
 * - Up to 4 simultaneous voltage channels in rich botanical/terracotta/indigo/honey ink.
 * - Interactive dual measurement cursors (Δt, 1/Δt Hz, ΔV).
 * - Analog X-Y Lissajous mode (CH1 vs CH2 with graceful fade trail).
 * - Live automated measurements (Vpp, Vrms, Vavg, Freq).
 */

import { PROBE_COLORS } from '../engine/components.js';
import { formatSI } from '../engine/units.js';
import { roundRect } from './symbols.js';

export const TIMEBASE_STEPS = [
  10e-6, 20e-6, 50e-6,
  100e-6, 200e-6, 500e-6,
  1e-3, 2e-3, 5e-3,
  10e-3, 20e-3, 50e-3,
  100e-3, 200e-3, 500e-3,
];

export const VOLTS_DIV_STEPS = [0.05, 0.1, 0.2, 0.5, 1, 2, 2.5, 5, 10, 20];

const SCOPE_CHANNEL_PALETTE = {
  light: {
    1: '#267d5d', // Botanical forest sage
    2: '#cc7b18', // Warm honey ochre
    3: '#3f62a6', // Ceramic twilight indigo
    4: '#d45044', // Artisanal terracotta coral
  },
  dark: {
    1: '#52d1a0', // Moonlit emerald
    2: '#f5bc58', // Firefly gold
    3: '#8ca7e0', // Starlight blue
    4: '#f26d7d', // Lantern coral rose
  },
};

function getScopeColor(ch, isDark) {
  const map = isDark ? SCOPE_CHANNEL_PALETTE.dark : SCOPE_CHANNEL_PALETTE.light;
  return map[ch] || PROBE_COLORS[ch] || (isDark ? '#52d1a0' : '#267d5d');
}

export class OscilloscopeView {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} [callbacks] - { onStatsUpdate }
   */
  constructor(canvas, callbacks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.callbacks = callbacks;

    this.timePerDiv = 1e-3; // 1 ms/div -> 10 ms full screen (10 divs)
    this.voltsPerDiv = 2.0; // 2 V/div -> ±8 V (8 divs)
    this.autoScaleV = false;
    this.triggerChannel = 1;
    this.triggerSlope = 'rising'; // 'rising' | 'falling' | 'free'
    this.triggerLevel = 0;
    this.triggerPosFrac = 0.2;
    this.xyMode = false;
    this.hold = false;
    this.heldSnapshot = null;

    // Interactive measurement cursors (normalized screen X in [0, 1])
    this.cursorsEnabled = false;
    this.cursorA = 0.25;
    this.cursorB = 0.65;
    this._dragging = null; // 'cursorA' | 'cursorB' | 'trigger'

    this.themeName = 'light';
    this._dpr = window.devicePixelRatio || 1;
    this._width = 640;
    this._height = 180;
    this._lastTriggerFlash = 0;
    this.triggered = false;

    this._bindEvents();
    this.resize();
  }

  setTheme(name) {
    this.themeName = name === 'dark' ? 'dark' : 'light';
  }

  configure(simConfig = {}) {
    if (simConfig.scopeTimeDiv) this.timePerDiv = simConfig.scopeTimeDiv;
    if (simConfig.scopeVoltsDiv) this.voltsPerDiv = simConfig.scopeVoltsDiv;
    if (simConfig.triggerChannel) this.triggerChannel = simConfig.triggerChannel;
    if (simConfig.triggerLevel !== undefined) this.triggerLevel = simConfig.triggerLevel;
    this.xyMode = !!simConfig.xyMode;
    this.hold = false;
    this.heldSnapshot = null;
  }

  resize() {
    const rect = this.canvas.parentElement?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    this._dpr = Math.min(2, window.devicePixelRatio || 1);
    this._width = rect.width;
    this._height = rect.height;
    this.canvas.width = Math.round(rect.width * this._dpr);
    this.canvas.height = Math.round(rect.height * this._dpr);
  }

  _plotRect() {
    return {
      x: 48,
      y: 12,
      w: Math.max(80, this._width - 68),
      h: Math.max(60, this._height - 32),
    };
  }

  _bindEvents() {
    const el = this.canvas;
    el.addEventListener('pointerdown', (e) => {
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const pr = this._plotRect();

      const trigY = this._voltsToY(this.triggerLevel, pr);
      if (!this.xyMode && Math.abs(sx - (pr.x + pr.w)) < 18 && Math.abs(sy - trigY) < 14) {
        this._dragging = 'trigger';
        el.setPointerCapture(e.pointerId);
        return;
      }

      if (this.cursorsEnabled && !this.xyMode) {
        const ax = pr.x + this.cursorA * pr.w;
        const bx = pr.x + this.cursorB * pr.w;
        if (Math.abs(sx - ax) < 12) {
          this._dragging = 'cursorA';
          el.setPointerCapture(e.pointerId);
          return;
        }
        if (Math.abs(sx - bx) < 12) {
          this._dragging = 'cursorB';
          el.setPointerCapture(e.pointerId);
          return;
        }
      }
    });

    el.addEventListener('pointermove', (e) => {
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const pr = this._plotRect();

      if (this._dragging === 'cursorA') {
        this.cursorA = Math.min(0.98, Math.max(0.02, (sx - pr.x) / pr.w));
        return;
      }
      if (this._dragging === 'cursorB') {
        this.cursorB = Math.min(0.98, Math.max(0.02, (sx - pr.x) / pr.w));
        return;
      }
      if (this._dragging === 'trigger') {
        const vNorm = 0.5 - (sy - pr.y) / pr.h;
        this.triggerLevel = Math.round(vNorm * 8 * this.voltsPerDiv * 20) / 20;
        return;
      }

      const trigY = this._voltsToY(this.triggerLevel, pr);
      if (!this.xyMode && Math.abs(sx - (pr.x + pr.w)) < 18 && Math.abs(sy - trigY) < 14) {
        el.style.cursor = 'ns-resize';
      } else if (
        this.cursorsEnabled &&
        !this.xyMode &&
        (Math.abs(sx - (pr.x + this.cursorA * pr.w)) < 10 || Math.abs(sx - (pr.x + this.cursorB * pr.w)) < 10)
      ) {
        el.style.cursor = 'ew-resize';
      } else {
        el.style.cursor = 'default';
      }
    });

    el.addEventListener('pointerup', (e) => {
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      this._dragging = null;
    });
  }

  _voltsToY(v, pr) {
    const halfSpan = this.voltsPerDiv * 4;
    return pr.y + pr.h * 0.5 - (v / halfSpan) * (pr.h * 0.5);
  }

  _findTriggerTime(history, windowSpan) {
    const n = history.count;
    if (n < 4) return null;
    const times = history.times;
    const chData = history.channels[this.triggerChannel];
    const newestT = times[n - 1];
    const postTimeNeeded = windowSpan * (1 - this.triggerPosFrac);
    const maxTrigT = newestT - postTimeNeeded * 0.85;
    const minTrigT = times[0] + windowSpan * this.triggerPosFrac * 0.3;

    if (this.triggerSlope === 'free' || !chData) {
      this.triggered = false;
      return newestT - windowSpan * (1 - this.triggerPosFrac);
    }

    const level = this.triggerLevel;
    const hyst = Math.max(0.02, this.voltsPerDiv * 0.08);
    const rising = this.triggerSlope === 'rising';

    for (let i = n - 2; i >= 1; i--) {
      if (times[i] > maxTrigT) continue;
      if (times[i] < minTrigT) break;
      const v0 = chData[i];
      const v1 = chData[i + 1];
      if (rising && v0 <= level && v1 > level) {
        let armed = false;
        for (let k = i; k >= Math.max(0, i - 40); k--) {
          if (chData[k] < level - hyst) {
            armed = true;
            break;
          }
        }
        if (armed) {
          const frac = (level - v0) / Math.max(1e-12, v1 - v0);
          this.triggered = true;
          return times[i] + frac * (times[i + 1] - times[i]);
        }
      } else if (!rising && v0 >= level && v1 < level) {
        let armed = false;
        for (let k = i; k >= Math.max(0, i - 40); k--) {
          if (chData[k] > level + hyst) {
            armed = true;
            break;
          }
        }
        if (armed) {
          const frac = (v0 - level) / Math.max(1e-12, v0 - v1);
          this.triggered = true;
          return times[i] + frac * (times[i + 1] - times[i]);
        }
      }
    }

    this.triggered = false;
    return newestT - windowSpan * (1 - this.triggerPosFrac);
  }

  _computeStats(history, probes, tStart, tEnd) {
    const stats = [];
    const n = history.count;
    if (n < 2) return stats;
    const times = history.times;
    const isDark = this.themeName === 'dark';

    let i0 = 0;
    while (i0 < n - 1 && times[i0] < tStart) i0++;
    let i1 = n - 1;
    while (i1 > i0 && times[i1] > tEnd) i1--;
    if (i1 - i0 < 4) {
      i0 = Math.max(0, n - 512);
      i1 = n - 1;
    }

    for (const pr of probes) {
      const ch = pr.channel;
      const arr = history.channels[ch];
      let minV = Infinity, maxV = -Infinity, sum = 0, sumSq = 0;
      const count = i1 - i0 + 1;
      for (let i = i0; i <= i1; i++) {
        const v = arr[i];
        if (v < minV) minV = v;
        if (v > maxV) maxV = v;
        sum += v;
        sumSq += v * v;
      }
      const vAvg = sum / count;
      const vRms = Math.sqrt(sumSq / count);
      const vpp = maxV - minV;

      let freq = null;
      if (vpp > 0.05) {
        const mid = 0.5 * (minV + maxV);
        const hyst = vpp * 0.12;
        const crossings = [];
        let armed = false;
        const scanStart = Math.max(0, n - 2048);
        for (let i = scanStart + 1; i < n; i++) {
          if (arr[i - 1] < mid - hyst) armed = true;
          if (armed && arr[i - 1] <= mid && arr[i] > mid) {
            const frac = (mid - arr[i - 1]) / Math.max(1e-12, arr[i] - arr[i - 1]);
            crossings.push(times[i - 1] + frac * (times[i] - times[i - 1]));
            armed = false;
          }
        }
        if (crossings.length >= 2) {
          const totalPeriod = crossings[crossings.length - 1] - crossings[0];
          const avgPer = totalPeriod / (crossings.length - 1);
          if (avgPer > 1e-9) freq = 1 / avgPer;
        }
      }

      stats.push({
        channel: ch,
        label: pr.label || `CH${ch}`,
        color: getScopeColor(ch, isDark),
        vNow: arr[n - 1],
        vpp,
        vAvg,
        vRms,
        minV,
        maxV,
        freq,
      });
    }
    return stats;
  }

  render(simulator, probes) {
    if (!simulator) return;
    const history = this.hold && this.heldSnapshot ? this.heldSnapshot : simulator.getWaveformHistory();
    if (this.hold && !this.heldSnapshot) {
      this.heldSnapshot = history;
    }

    const ctx = this.ctx;
    const w = this._width;
    const h = this._height;
    const pr = this._plotRect();
    const isDark = this.themeName === 'dark';

    ctx.save();
    ctx.scale(this._dpr, this._dpr);

    // Warm Daylight Atelier oat-parchment surround vs cozy Starlight Atelier twilight surround
    ctx.fillStyle = isDark ? '#181624' : '#fbf6ec';
    ctx.fillRect(0, 0, w, h);

    // Sculpted paper / twilight plot well with gentle rounded corners
    ctx.fillStyle = isDark ? '#211e30' : '#fffdf7';
    ctx.strokeStyle = isDark ? 'rgba(246, 238, 224, 0.12)' : 'rgba(111, 93, 80, 0.22)';
    ctx.lineWidth = 1;
    roundRect(ctx, pr.x, pr.y, pr.w, pr.h, 8);
    ctx.fill();
    ctx.stroke();

    // 10x8 Soft Sepia / Twilight Graticule
    this._drawGraticule(ctx, pr, isDark);

    // Auto vertical scale if requested
    if (this.autoScaleV && history.count > 8 && probes.length > 0) {
      let peak = 0.2;
      const scanFrom = Math.max(0, history.count - 512);
      for (const p of probes) {
        const arr = history.channels[p.channel];
        for (let i = scanFrom; i < history.count; i++) {
          const a = Math.abs(arr[i]);
          if (a > peak) peak = a;
        }
      }
      const needed = peak / 3.4;
      const chosen = VOLTS_DIV_STEPS.find((s) => s >= needed) || VOLTS_DIV_STEPS[VOLTS_DIV_STEPS.length - 1];
      this.voltsPerDiv = chosen;
    }

    const windowSpan = this.timePerDiv * 10;
    const trigT = this._findTriggerTime(history, windowSpan);
    const tStart = trigT !== null ? trigT - windowSpan * this.triggerPosFrac : 0;
    const tEnd = tStart + windowSpan;

    // Warm walnut / sandstone Y-axis voltage labels
    ctx.font = '500 9.5px "JetBrains Mono", Consolas, monospace';
    ctx.fillStyle = isDark ? '#a89d93' : '#6f5d50';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const vSteps = [4, 2, 0, -2, -4];
    for (const div of vSteps) {
      const val = div * this.voltsPerDiv;
      const y = pr.y + pr.h * 0.5 - (div / 4) * (pr.h * 0.5);
      const txt = div === 0 ? '0V' : `${val > 0 ? '+' : ''}${formatSI(val, 'V', 2).replace(' ', '')}`;
      ctx.fillText(txt, pr.x - 6, y);
    }

    if (this.xyMode) {
      this._drawXYMode(ctx, pr, history, probes, isDark);
    } else {
      this._drawTimeTraces(ctx, pr, history, probes, tStart, tEnd, isDark);
      this._drawTriggerIndicator(ctx, pr, isDark);
      if (this.cursorsEnabled) {
        this._drawCursors(ctx, pr, history, probes, tStart, tEnd, isDark);
      }
    }

    if (probes.length === 0) {
      ctx.fillStyle = isDark ? '#9c92a8' : '#8d7a6c';
      ctx.font = '500 11px "Plus Jakarta Sans", "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        'Place a Scope Probe (P) on any wire or pin to trace live waveforms',
        pr.x + pr.w * 0.5,
        pr.y + pr.h * 0.5
      );
    }

    ctx.restore();

    const stats = this._computeStats(history, probes, tStart, tEnd);
    this.callbacks.onStatsUpdate?.(stats, this.triggered);
  }

  _drawGraticule(ctx, pr, isDark) {
    ctx.save();
    roundRect(ctx, pr.x + 1, pr.y + 1, pr.w - 2, pr.h - 2, 7);
    ctx.clip();

    ctx.strokeStyle = isDark ? 'rgba(246, 238, 224, 0.07)' : 'rgba(111, 93, 80, 0.11)';
    ctx.lineWidth = 1;

    for (let i = 1; i < 10; i++) {
      const x = Math.round(pr.x + (i / 10) * pr.w) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, pr.y);
      ctx.lineTo(x, pr.y + pr.h);
      ctx.stroke();
    }
    for (let j = 1; j < 8; j++) {
      const y = Math.round(pr.y + (j / 8) * pr.h) + 0.5;
      ctx.beginPath();
      ctx.moveTo(pr.x, y);
      ctx.lineTo(pr.x + pr.w, y);
      ctx.stroke();
    }

    // Soft sepia / candlelight center axes with fine subdivision ticks
    ctx.strokeStyle = isDark ? 'rgba(245, 188, 88, 0.22)' : 'rgba(111, 93, 80, 0.26)';
    const cx = Math.round(pr.x + pr.w * 0.5) + 0.5;
    const cy = Math.round(pr.y + pr.h * 0.5) + 0.5;
    ctx.beginPath();
    ctx.moveTo(pr.x, cy);
    ctx.lineTo(pr.x + pr.w, cy);
    ctx.moveTo(cx, pr.y);
    ctx.lineTo(cx, pr.y + pr.h);
    for (let k = 0; k <= 50; k++) {
      const tx = pr.x + (k / 50) * pr.w;
      ctx.moveTo(tx, cy - 2.5);
      ctx.lineTo(tx, cy + 2.5);
    }
    for (let k = 0; k <= 40; k++) {
      const ty = pr.y + (k / 40) * pr.h;
      ctx.moveTo(cx - 2.5, ty);
      ctx.lineTo(cx + 2.5, ty);
    }
    ctx.stroke();
    ctx.restore();
  }

  _drawTimeTraces(ctx, pr, history, probes, tStart, tEnd, isDark) {
    const n = history.count;
    if (n < 2) return;
    const times = history.times;
    const span = Math.max(1e-12, tEnd - tStart);

    ctx.save();
    roundRect(ctx, pr.x + 1, pr.y + 1, pr.w - 2, pr.h - 2, 7);
    ctx.clip();

    let startIdx = 0;
    while (startIdx < n - 1 && times[startIdx + 1] < tStart) startIdx++;

    for (const prb of probes) {
      const ch = prb.channel;
      const arr = history.channels[ch];
      const col = getScopeColor(ch, isDark);

      ctx.beginPath();
      let started = false;
      for (let i = startIdx; i < n; i++) {
        const t = times[i];
        if (t > tEnd + span * 0.05) break;
        const sx = pr.x + ((t - tStart) / span) * pr.w;
        const sy = this._voltsToY(arr[i], pr);
        if (!started) {
          ctx.moveTo(sx, sy);
          started = true;
        } else {
          ctx.lineTo(sx, sy);
        }
      }

      // Soft warm glow behind trace
      ctx.save();
      ctx.strokeStyle = col;
      ctx.globalAlpha = isDark ? 0.24 : 0.14;
      ctx.lineWidth = isDark ? 5.2 : 4.2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.restore();

      // Rich crisp ink trace
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    ctx.restore();

    // Bottom axis metadata
    ctx.font = '500 9.5px "JetBrains Mono", Consolas, monospace';
    ctx.fillStyle = isDark ? '#a89d93' : '#6f5d50';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`H: ${formatSI(this.timePerDiv, 's/div', 2)}`, pr.x + 4, pr.y + pr.h + 4);
    ctx.textAlign = 'center';
    ctx.fillText(`V: ${formatSI(this.voltsPerDiv, 'V/div', 2)}`, pr.x + pr.w * 0.5, pr.y + pr.h + 4);
    ctx.textAlign = 'right';
    const trigTag = this.triggerSlope === 'free' ? 'FREE' : this.triggered ? 'TRIG ●' : 'AUTO ○';
    ctx.fillStyle = this.triggered ? (isDark ? '#52d1a0' : '#2e7d60') : isDark ? '#a89d93' : '#6f5d50';
    ctx.fillText(trigTag, pr.x + pr.w - 4, pr.y + pr.h + 4);
  }

  _drawXYMode(ctx, pr, history, probes, isDark) {
    const n = history.count;
    if (n < 4) return;
    const chX = history.channels[1];
    const chY = history.channels[2];
    const halfSpan = this.voltsPerDiv * 4;
    const cx = pr.x + pr.w * 0.5;
    const cy = pr.y + pr.h * 0.5;
    const scale = (Math.min(pr.w, pr.h) * 0.48) / halfSpan;

    ctx.save();
    roundRect(ctx, pr.x + 1, pr.y + 1, pr.w - 2, pr.h - 2, 7);
    ctx.clip();

    const totalPts = Math.min(n, 900);
    const startIdx = n - totalPts;
    const buckets = 6;
    const bucketSize = Math.max(2, Math.floor(totalPts / buckets));

    for (let b = 0; b < buckets; b++) {
      const i0 = startIdx + b * bucketSize;
      const i1 = b === buckets - 1 ? n - 1 : Math.min(n - 1, i0 + bucketSize + 1);
      const ageFrac = (b + 1) / buckets;
      ctx.beginPath();
      for (let i = i0; i <= i1; i++) {
        const sx = cx + chX[i] * scale;
        const sy = cy - chY[i] * scale;
        if (i === i0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.strokeStyle = isDark ? '#52d1a0' : '#267d5d';
      ctx.globalAlpha = 0.14 + 0.86 * ageFrac * ageFrac;
      ctx.lineWidth = 1.3 + ageFrac * 1.1;
      ctx.stroke();
    }

    const lastX = cx + chX[n - 1] * scale;
    const lastY = cy - chY[n - 1] * scale;
    ctx.globalAlpha = 1;
    ctx.fillStyle = isDark ? '#fff7e0' : '#d45d44';
    ctx.beginPath();
    ctx.arc(lastX, lastY, 3.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    ctx.font = '600 9.5px "JetBrains Mono", Consolas, monospace';
    ctx.fillStyle = isDark ? '#52d1a0' : '#267d5d';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('X-Y LISSAJOUS  (X: CH1 · Y: CH2)', pr.x + 4, pr.y + pr.h + 4);
    ctx.textAlign = 'right';
    ctx.fillStyle = isDark ? '#a89d93' : '#6f5d50';
    ctx.fillText(`${formatSI(this.voltsPerDiv, 'V/div', 2)}`, pr.x + pr.w - 4, pr.y + pr.h + 4);
  }

  _drawTriggerIndicator(ctx, pr, isDark) {
    if (this.triggerSlope === 'free') return;
    const trigY = Math.max(pr.y + 5, Math.min(pr.y + pr.h - 5, this._voltsToY(this.triggerLevel, pr)));
    const trigX = pr.x + this.triggerPosFrac * pr.w;
    const col = getScopeColor(this.triggerChannel, isDark);

    ctx.save();
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(trigX, pr.y + 7);
    ctx.lineTo(trigX - 4, pr.y + 1);
    ctx.lineTo(trigX + 4, pr.y + 1);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(pr.x + pr.w + 1, trigY);
    ctx.lineTo(pr.x + pr.w + 9, trigY - 5);
    ctx.lineTo(pr.x + pr.w + 9, trigY + 5);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = col;
    ctx.globalAlpha = this._dragging === 'trigger' ? 0.8 : 0.22;
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pr.x + 2, trigY);
    ctx.lineTo(pr.x + pr.w - 2, trigY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  _drawCursors(ctx, pr, history, probes, tStart, tEnd, isDark) {
    const ax = pr.x + this.cursorA * pr.w;
    const bx = pr.x + this.cursorB * pr.w;
    const span = tEnd - tStart;
    const tA = tStart + this.cursorA * span;
    const tB = tStart + this.cursorB * span;
    const dt = Math.abs(tB - tA);
    const invDt = dt > 1e-12 ? 1 / dt : 0;

    const primaryCh = probes[0]?.channel || 1;
    const sampleAt = (tTarget) => {
      const times = history.times;
      const arr = history.channels[primaryCh];
      if (history.count < 2) return 0;
      for (let i = 0; i < history.count - 1; i++) {
        if (times[i] <= tTarget && times[i + 1] >= tTarget) {
          const f = (tTarget - times[i]) / Math.max(1e-15, times[i + 1] - times[i]);
          return arr[i] + (arr[i + 1] - arr[i]) * f;
        }
      }
      return 0;
    };
    const vA = sampleAt(tA);
    const vB = sampleAt(tB);
    const dV = vB - vA;

    const curCol = isDark ? '#f5bc58' : '#d45d44';

    ctx.save();
    for (const [x, tag] of [
      [ax, 'A'],
      [bx, 'B'],
    ]) {
      ctx.strokeStyle = curCol;
      ctx.lineWidth = 1.25;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, pr.y + 1);
      ctx.lineTo(x, pr.y + pr.h - 1);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = curCol;
      roundRect(ctx, x - 7.5, pr.y + 2, 15, 13.5, 4);
      ctx.fill();
      ctx.fillStyle = isDark ? '#181624' : '#fffdf8';
      ctx.font = '700 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tag, x, pr.y + 8.8);
    }

    const pillText = `Δt = ${formatSI(dt, 's', 3)}  (${formatSI(invDt, 'Hz', 3)})  ·  ΔV = ${dV >= 0 ? '+' : ''}${formatSI(dV, 'V', 3)}`;
    ctx.font = '600 10px "JetBrains Mono", monospace';
    const tw = ctx.measureText(pillText).width + 18;
    const px = pr.x + pr.w - tw - 8;
    const py = pr.y + 6;
    ctx.fillStyle = isDark ? 'rgba(35, 32, 52, 0.94)' : 'rgba(255, 253, 248, 0.96)';
    ctx.strokeStyle = curCol;
    ctx.lineWidth = 1.15;
    roundRect(ctx, px, py, tw, 21, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = isDark ? '#f6eee0' : '#2d221c';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(pillText, px + 9, py + 11);
    ctx.restore();
  }
}
