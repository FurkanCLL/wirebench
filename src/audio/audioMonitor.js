/**
 * Live Web Audio API Oscilloscope Probe Monitor.
 * Resamples the actual simulated CH1 waveform at true 1:1 physical time
 * (extracting the latest clean cycle from the simulation ring buffer) so you can
 * hear analog diode clipping, filter attenuation, and oscillator pitch live!
 */

export class AudioMonitor {
  constructor() {
    this.enabled = false;
    this.ctx = null;
    this.gainNode = null;
    this.procNode = null;
    this.volume = 0.18;

    // Resampled single-cycle or multi-cycle wavetable in normalized audio [-1, 1]
    this.table = new Float32Array(2048);
    this.tableLen = 2048;
    this.phase = 0;
    this.phaseInc = 0; // samples per audio frame
    this.dcOffset = 0;
    this.signalPresent = false;
  }

  toggle() {
    if (this.enabled) {
      this.stop();
      return false;
    }
    this.start();
    return true;
  }

  start() {
    if (this.enabled) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    if (!this.ctx) {
      this.ctx = new AudioCtx();
      this.gainNode = this.ctx.createGain();
      this.gainNode.gain.value = 0;
      this.gainNode.connect(this.ctx.destination);

      // Clean low-latency stereo/mono processor reading the live simulated waveform table
      this.procNode = this.ctx.createScriptProcessor(1024, 0, 1);
      this.procNode.onaudioprocess = (ev) => {
        const out = ev.outputBuffer.getChannelData(0);
        if (!this.enabled || !this.signalPresent || this.phaseInc <= 0) {
          out.fill(0);
          return;
        }
        const tbl = this.table;
        const len = this.tableLen;
        let ph = this.phase;
        const inc = this.phaseInc;
        for (let i = 0; i < out.length; i++) {
          const idx0 = Math.floor(ph) % len;
          const idx1 = (idx0 + 1) % len;
          const frac = ph - Math.floor(ph);
          out[i] = tbl[idx0] + (tbl[idx1] - tbl[idx0]) * frac;
          ph += inc;
          if (ph >= len) ph -= len;
        }
        this.phase = ph;
      };
      this.procNode.connect(this.gainNode);
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    this.enabled = true;
    const now = this.ctx.currentTime;
    this.gainNode.gain.cancelScheduledValues(now);
    this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
    this.gainNode.gain.linearRampToValueAtTime(this.volume, now + 0.04);
  }

  stop() {
    if (!this.enabled) return;
    this.enabled = false;
    if (this.ctx && this.gainNode) {
      const now = this.ctx.currentTime;
      this.gainNode.gain.cancelScheduledValues(now);
      this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
      this.gainNode.gain.linearRampToValueAtTime(0, now + 0.04);
    }
  }

  /**
   * Feed latest oscilloscope waveform history (CH1) to update the audio wavetable smoothly.
   * Extracts one exact rising-edge-to-rising-edge period for seamless click-free looping!
   * @param {{ count: number, times: Float64Array, channels: Record<number, Float64Array> }} history
   * @param {number} [channel=1]
   */
  updateFromHistory(history, channel = 1) {
    if (!this.enabled || !this.ctx || history.count < 64) return;
    const times = history.times;
    const data = history.channels[channel];
    const n = history.count;

    // Inspect recent window (last 1024 samples)
    const startIdx = Math.max(0, n - 1024);
    let minV = Infinity;
    let maxV = -Infinity;
    let sum = 0;
    for (let i = startIdx; i < n; i++) {
      const v = data[i];
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
      sum += v;
    }
    const vpp = maxV - minV;
    if (vpp < 0.02) {
      this.signalPresent = false;
      return;
    }
    const mid = sum / (n - startIdx);
    const hyst = vpp * 0.08;

    // Find last two rising crossings of `mid` to isolate one exact period
    const crossings = [];
    let armed = false;
    for (let i = startIdx + 1; i < n; i++) {
      if (data[i - 1] < mid - hyst) armed = true;
      if (armed && data[i - 1] <= mid && data[i] > mid) {
        const frac = (mid - data[i - 1]) / Math.max(1e-12, data[i] - data[i - 1]);
        crossings.push({
          idx: i - 1 + frac,
          t: times[i - 1] + frac * (times[i] - times[i - 1]),
        });
        armed = false;
      }
    }

    if (crossings.length < 2) {
      this.signalPresent = false;
      return;
    }

    const c2 = crossings[crossings.length - 1];
    const c1 = crossings[crossings.length - 2];
    const period = c2.t - c1.t;
    if (period <= 1e-6 || period > 0.2) {
      // Outside audible range (~5 Hz to 1 MHz; clamp nicely to audible 25 Hz - 8 kHz)
      if (period > 0.2) {
        this.signalPresent = false;
        return;
      }
    }

    const freq = 1 / period;
    if (freq < 25 || freq > 10000) {
      this.signalPresent = false;
      return;
    }

    // Resample exact single cycle [c1.idx, c2.idx] into normalized wavetable with soft limiter
    const len = this.tableLen;
    const spanIdx = c2.idx - c1.idx;
    const normScale = 1 / Math.max(0.75, vpp * 0.55); // preserves clipping loudness feel safely
    for (let k = 0; k < len; k++) {
      const fIdx = c1.idx + (k / len) * spanIdx;
      const i0 = Math.min(n - 2, Math.max(0, Math.floor(fIdx)));
      const frac = fIdx - i0;
      const rawV = data[i0] + (data[i0 + 1] - data[i0]) * frac;
      // Remove DC offset and soft-limit safely
      this.table[k] = Math.tanh((rawV - mid) * normScale * 0.85);
    }

    this.phaseInc = (freq * len) / this.ctx.sampleRate;
    this.signalPresent = true;
  }
}
