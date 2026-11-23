/**
 * Luminous Atelier Dual-Pane AC Small-Signal Bode Plot Analyzer.
 * Harmonizes with Daylight Atelier (#fbf6ec / #fffdf7 paper plot) and Starlight Atelier (#181624 / #211e30 twilight screen).
 * Top chart: Magnitude |H(jw)| in dB with automatic -3 dB cutoff & resonant peak markers.
 * Bottom chart: Continuous unwrapped Phase ∠H(jw) in degrees.
 * Full interactive crosshair cursor across logarithmic frequency decades.
 */

import { PROBE_COLORS } from '../engine/components.js';
import { formatSI } from '../engine/units.js';
import { roundRect } from './symbols.js';

const BODE_CHANNEL_PALETTE = {
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

function getBodeColor(ch, isDark) {
  const map = isDark ? BODE_CHANNEL_PALETTE.dark : BODE_CHANNEL_PALETTE.light;
  return map[ch] || PROBE_COLORS[ch] || (isDark ? '#52d1a0' : '#267d5d');
}

export class BodePlotView {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.acResult = null;
    this.themeName = 'light';
    this.hoverX = null;

    this._dpr = window.devicePixelRatio || 1;
    this._width = 640;
    this._height = 180;

    this._bindEvents();
    this.resize();
  }

  setTheme(name) {
    this.themeName = name === 'dark' ? 'dark' : 'light';
    this.render();
  }

  setData(acResult) {
    this.acResult = acResult;
    this.render();
  }

  resize() {
    const rect = this.canvas.parentElement?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    this._dpr = Math.min(2, window.devicePixelRatio || 1);
    this._width = rect.width;
    this._height = rect.height;
    this.canvas.width = Math.round(rect.width * this._dpr);
    this.canvas.height = Math.round(rect.height * this._dpr);
    this.render();
  }

  _bindEvents() {
    this.canvas.addEventListener('pointermove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.hoverX = e.clientX - rect.left;
      this.render();
    });
    this.canvas.addEventListener('pointerleave', () => {
      this.hoverX = null;
      this.render();
    });
  }

  render() {
    const ctx = this.ctx;
    const w = this._width;
    const h = this._height;
    const isDark = this.themeName === 'dark';

    ctx.save();
    ctx.scale(this._dpr, this._dpr);

    ctx.fillStyle = isDark ? '#181624' : '#fbf6ec';
    ctx.fillRect(0, 0, w, h);

    const ac = this.acResult;
    if (!ac || !ac.ok || !ac.channels || ac.channels.length === 0) {
      ctx.fillStyle = isDark ? '#9c92a8' : '#8d7a6c';
      ctx.font = '500 11px "Plus Jakarta Sans", "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        ac?.reason || 'Add a Voltage Source and Scope Probe to run Complex AC Small-Signal Sweep',
        w * 0.5,
        h * 0.5
      );
      ctx.restore();
      return;
    }

    const leftPad = 52;
    const rightPad = 18;
    const topPad = 10;
    const botPad = 24;
    const gap = 10;
    const plotW = Math.max(80, w - leftPad - rightPad);
    const totalPlotH = Math.max(80, h - topPad - botPad - gap);
    const magRect = { x: leftPad, y: topPad, w: plotW, h: Math.floor(totalPlotH * 0.6) };
    const phRect = { x: leftPad, y: topPad + magRect.h + gap, w: plotW, h: totalPlotH - magRect.h };

    let maxDb = 6;
    let minDb = -60;
    let rawMax = -Infinity;
    let rawMin = Infinity;
    for (const ch of ac.channels) {
      for (let i = 0; i < ch.magDb.length; i++) {
        const v = ch.magDb[i];
        if (v > rawMax) rawMax = v;
        if (v < rawMin) rawMin = v;
      }
    }
    if (Number.isFinite(rawMax)) {
      maxDb = Math.max(10, Math.ceil((rawMax + 6) / 10) * 10);
      minDb = Math.max(-80, Math.min(-40, Math.floor((rawMin - 5) / 20) * 20));
    }

    const logMin = Math.log10(ac.fStart);
    const logMax = Math.log10(ac.fStop);
    const freqToX = (f) => magRect.x + ((Math.log10(f) - logMin) / (logMax - logMin)) * magRect.w;
    const dbToY = (db) => {
      const clamped = Math.max(minDb, Math.min(maxDb, db));
      return magRect.y + ((maxDb - clamped) / (maxDb - minDb)) * magRect.h;
    };

    let minPh = -180;
    let maxPh = 90;
    for (const ch of ac.channels) {
      for (let i = 0; i < ch.phaseDeg.length; i++) {
        if (ch.phaseDeg[i] < minPh) minPh = -270;
        if (ch.phaseDeg[i] > maxPh) maxPh = 180;
      }
    }
    const phToY = (deg) => {
      const clamped = Math.max(minPh, Math.min(maxPh, deg));
      return phRect.y + ((maxPh - clamped) / (maxPh - minPh)) * phRect.h;
    };

    const labelCol = isDark ? '#a89d93' : '#6f5d50';
    const gridMajor = isDark ? 'rgba(245, 188, 88, 0.22)' : 'rgba(111, 93, 80, 0.24)';
    const gridMinor = isDark ? 'rgba(246, 238, 224, 0.06)' : 'rgba(111, 93, 80, 0.08)';
    const accentGold = isDark ? '#f5bc58' : '#d45d44';

    // Sculpted paper / twilight plot wells
    for (const r of [magRect, phRect]) {
      ctx.fillStyle = isDark ? '#211e30' : '#fffdf7';
      ctx.strokeStyle = isDark ? 'rgba(246, 238, 224, 0.12)' : 'rgba(111, 93, 80, 0.22)';
      ctx.lineWidth = 1;
      roundRect(ctx, r.x, r.y, r.w, r.h, 7);
      ctx.fill();
      ctx.stroke();
    }

    // Logarithmic vertical decade + sub-decade gridlines
    const firstDec = Math.floor(logMin);
    const lastDec = Math.ceil(logMax);
    ctx.font = '500 9.5px "JetBrains Mono", Consolas, monospace';
    for (let dec = firstDec; dec <= lastDec; dec++) {
      const base = Math.pow(10, dec);
      for (let m = 1; m <= 9; m++) {
        const f = base * m;
        if (f < ac.fStart * 0.999 || f > ac.fStop * 1.001) continue;
        const x = Math.round(freqToX(f)) + 0.5;
        ctx.strokeStyle = m === 1 ? gridMajor : gridMinor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, magRect.y + 1);
        ctx.lineTo(x, magRect.y + magRect.h - 1);
        ctx.moveTo(x, phRect.y + 1);
        ctx.lineTo(x, phRect.y + phRect.h - 1);
        ctx.stroke();

        if (m === 1) {
          ctx.fillStyle = labelCol;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(formatSI(f, 'Hz', 2).replace(' ', ''), x, phRect.y + phRect.h + 5);
        }
      }
    }

    // Horizontal Magnitude dB gridlines
    const dbStep = maxDb - minDb > 70 ? 20 : 10;
    for (let db = Math.ceil(minDb / dbStep) * dbStep; db <= maxDb; db += dbStep) {
      const y = Math.round(dbToY(db)) + 0.5;
      ctx.strokeStyle = db === 0 ? gridMajor : gridMinor;
      ctx.beginPath();
      ctx.moveTo(magRect.x + 1, y);
      ctx.lineTo(magRect.x + magRect.w - 1, y);
      ctx.stroke();

      ctx.fillStyle = labelCol;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${db}dB`, magRect.x - 6, y);
    }

    // Horizontal Phase deg gridlines
    for (let deg = minPh; deg <= maxPh; deg += 90) {
      const y = Math.round(phToY(deg)) + 0.5;
      ctx.strokeStyle = deg === 0 ? gridMajor : gridMinor;
      ctx.beginPath();
      ctx.moveTo(phRect.x + 1, y);
      ctx.lineTo(phRect.x + phRect.w - 1, y);
      ctx.stroke();

      ctx.fillStyle = labelCol;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${deg}°`, phRect.x - 6, y);
    }

    // Plot each channel's Magnitude & Phase curves
    const freqs = ac.frequencies;
    for (const ch of ac.channels) {
      const col = getBodeColor(ch.channel, isDark);

      // Magnitude curve
      ctx.save();
      roundRect(ctx, magRect.x + 1, magRect.y + 1, magRect.w - 2, magRect.h - 2, 6);
      ctx.clip();
      ctx.beginPath();
      for (let i = 0; i < freqs.length; i++) {
        const x = freqToX(freqs[i]);
        const y = dbToY(ch.magDb[i]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.save();
      ctx.strokeStyle = col;
      ctx.globalAlpha = isDark ? 0.22 : 0.13;
      ctx.lineWidth = isDark ? 5 : 4;
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.restore();

      ctx.strokeStyle = col;
      ctx.lineWidth = 2.1;
      ctx.lineJoin = 'round';
      ctx.stroke();

      // Annotate -3 dB cutoff & resonant peak for the primary output channel
      if (ch.metrics.cutoffs.length > 0 && Math.abs(ch.magDb[0] - ch.magDb[freqs.length - 1]) > 1.5) {
        for (const cut of ch.metrics.cutoffs.slice(0, 2)) {
          const cx = freqToX(cut.freq);
          const cy = dbToY(cut.db);
          ctx.strokeStyle = col;
          ctx.globalAlpha = 0.55;
          ctx.setLineDash([3, 3]);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(cx, magRect.y);
          ctx.lineTo(cx, magRect.y + magRect.h);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;

          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(cx, cy, 3.6, 0, Math.PI * 2);
          ctx.fill();

          const tag = `−3dB: ${formatSI(cut.freq, 'Hz', 3)}`;
          ctx.font = '600 9.5px "JetBrains Mono", monospace';
          ctx.textAlign = cx > magRect.x + magRect.w - 110 ? 'right' : 'left';
          ctx.textBaseline = 'bottom';
          ctx.fillText(tag, cx + (cx > magRect.x + magRect.w - 110 ? -6 : 6), Math.max(magRect.y + 14, cy - 4));
        }
      }

      if (ch.metrics.hasResonantPeak) {
        const px = freqToX(ch.metrics.peakFreq);
        const py = dbToY(ch.metrics.peakGainDb);
        ctx.fillStyle = accentGold;
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = '600 9.5px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(
          `f₀ ${formatSI(ch.metrics.peakFreq, 'Hz', 3)} (${ch.metrics.peakGainDb >= 0 ? '+' : ''}${ch.metrics.peakGainDb.toFixed(1)} dB)`,
          Math.min(magRect.x + magRect.w - 140, px + 6),
          Math.max(magRect.y + 4, py + 2)
        );
      }
      ctx.restore();

      // Phase curve
      ctx.save();
      roundRect(ctx, phRect.x + 1, phRect.y + 1, phRect.w - 2, phRect.h - 2, 6);
      ctx.clip();
      ctx.beginPath();
      for (let i = 0; i < freqs.length; i++) {
        const x = freqToX(freqs[i]);
        const y = phToY(ch.phaseDeg[i]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.88;
      ctx.lineWidth = 1.75;
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.restore();
    }

    // Interactive Crosshair Inspector
    if (this.hoverX !== null && this.hoverX >= magRect.x && this.hoverX <= magRect.x + magRect.w) {
      const frac = (this.hoverX - magRect.x) / magRect.w;
      const idx = Math.min(freqs.length - 1, Math.max(0, Math.round(frac * (freqs.length - 1))));
      const f = freqs[idx];
      const cx = freqToX(f);

      ctx.strokeStyle = accentGold;
      ctx.lineWidth = 1.1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(cx, magRect.y + 1);
      ctx.lineTo(cx, phRect.y + phRect.h - 1);
      ctx.stroke();
      ctx.setLineDash([]);

      const parts = [`f = ${formatSI(f, 'Hz', 3)}`];
      for (const ch of ac.channels) {
        parts.push(`${ch.label}: ${ch.magDb[idx].toFixed(1)} dB (${ch.phaseDeg[idx].toFixed(0)}°)`);
        const col = getBodeColor(ch.channel, isDark);
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(cx, dbToY(ch.magDb[idx]), 3.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, phToY(ch.phaseDeg[idx]), 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
      const txt = parts.join('   ·   ');
      ctx.font = '600 9.5px "JetBrains Mono", monospace';
      const tw = ctx.measureText(txt).width + 18;
      const bx = Math.max(magRect.x + 4, magRect.x + magRect.w - tw - 6);
      const by = magRect.y + 5;
      ctx.fillStyle = isDark ? 'rgba(35, 32, 52, 0.94)' : 'rgba(255, 253, 248, 0.96)';
      ctx.strokeStyle = accentGold;
      ctx.lineWidth = 1.1;
      roundRect(ctx, bx, by, tw, 19, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = isDark ? '#f6eee0' : '#2d221c';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(txt, bx + 9, by + 10);
    }

    ctx.restore();
  }
}
