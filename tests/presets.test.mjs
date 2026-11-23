import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESET_CIRCUITS, getPresetById } from '../src/presets/circuits.js';
import { compileNetlist } from '../src/engine/netlist.js';
import { TransientSimulator } from '../src/engine/transient.js';
import { runACSweep } from '../src/engine/acAnalysis.js';

test('All 8 built-in preset circuits compile cleanly with zero warnings and converge with low KCL residual', () => {
  for (const preset of PRESET_CIRCUITS) {
    const built = preset.build();
    const net = compileNetlist(built);
    assert.equal(net.hasExplicitGround, true, `${preset.id}: missing explicit ground`);
    assert.equal(
      net.diagnostics.length,
      0,
      `${preset.id}: unexpected diagnostics: ${JSON.stringify(net.diagnostics)}`
    );

    const sim = new TransientSimulator(net, {
      dt: built.simConfig.dt,
      initialMode: built.simConfig.initialMode,
    });
    sim.advance(200, built.simConfig.dt);
    assert.equal(sim.converged, true, `${preset.id}: transient failed to converge`);
    assert.ok(
      sim.lastEvaluation.maxKclResidual < 1e-6,
      `${preset.id}: KCL residual too high: ${sim.lastEvaluation.maxKclResidual}`
    );
    const shortWarn = sim.lastEvaluation.warnings.find((w) => w.code === 'SHORT_CIRCUIT');
    assert.equal(shortWarn, undefined, `${preset.id}: unexpected short circuit warning`);
  }
});

test('Preset 1 (Astable Multivibrator) genuinely self-oscillates with alternating LEDs', () => {
  const built = getPresetById('astable-multivibrator').build();
  const net = compileNetlist(built);
  const sim = new TransientSimulator(net, { dt: 2.5e-4, initialMode: 'zero' });

  let minC1 = Infinity;
  let maxC1 = -Infinity;
  let minC2 = Infinity;
  let maxC2 = -Infinity;
  let transitions = 0;
  let prevHigh = null;

  // Simulate 0.6 seconds (2400 steps of 250 us)
  for (let i = 0; i < 2400; i++) {
    sim.step(2.5e-4, false);
    const v1 = sim.x[net.probes[0].node - 1];
    const v3 = sim.x[net.probes[2].node - 1];
    if (v1 < minC1) minC1 = v1;
    if (v1 > maxC1) maxC1 = v1;
    if (v3 < minC2) minC2 = v3;
    if (v3 > maxC2) maxC2 = v3;
    const isHigh = v1 > 3.5;
    if (prevHigh !== null && isHigh !== prevHigh) transitions++;
    prevHigh = isHigh;
  }

  assert.ok(maxC1 - minC1 > 4.0, `Expected wide collector 1 swing, got [${minC1}, ${maxC1}]`);
  assert.ok(maxC2 - minC2 > 4.0, `Expected wide collector 2 swing, got [${minC2}, ${maxC2}]`);
  assert.ok(transitions >= 2, `Expected multiple astable flip transitions, got ${transitions}`);
});

test('Preset 2 (Bridge Rectifier) produces positive filtered DC (~10V) and higher ripple when SW1 opens', () => {
  const built = getPresetById('bridge-rectifier').build();
  const net = compileNetlist(built);
  const sim = new TransientSimulator(net, { dt: 1.5e-4, initialMode: 'zero' });
  // Run 3 full 60Hz cycles (50 ms)
  sim.advance(340, 1.5e-4);
  const hist = sim.getWaveformHistory();
  // Measure last 100 samples
  let minV = Infinity;
  let maxV = -Infinity;
  for (let i = hist.count - 100; i < hist.count; i++) {
    const v = hist.channels[1][i];
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }
  assert.ok(maxV > 9.5 && maxV < 11.2, `Expected rectified DC peak ~10.4V, got ${maxV}`);
  assert.ok(minV > 7.5, `Expected smoothed DC min > 7.5V with C1 closed, got ${minV}`);
});

test('Preset 3 (Sallen-Key Low-Pass Filter) shows exact ~1 kHz cutoff and -40 dB/dec rolloff in AC Bode', () => {
  const built = getPresetById('sallen-key-filter').build();
  const net = compileNetlist(built);
  const ac = runACSweep(net, { fStart: 10, fStop: 100000, points: 241 });
  assert.equal(ac.ok, true);
  const outCh = ac.channels.find((c) => c.channel === 2);
  assert.ok(outCh);
  // DC gain K = 1/0.63 ≈ 1.587 => +4.0 dB
  assert.ok(Math.abs(outCh.magDb[0] - 4.0) < 0.3, `Expected passband gain ~+4 dB, got ${outCh.magDb[0]}`);
  // Cutoff near 1 kHz
  const fc = outCh.metrics.cutoffs[0]?.freq || 0;
  assert.ok(fc > 750 && fc < 1350, `Expected -3dB cutoff near 1 kHz, got ${fc}`);
  // Steep 2nd-order rolloff: check attenuation between 10 kHz and 100 kHz ≈ -40 dB
  const db10k = outCh.magDb[180]; // 10^(1 + 3) = 10 kHz
  const db100k = outCh.magDb[240]; // 100 kHz
  const slope = db100k - db10k;
  assert.ok(slope < -37 && slope > -43, `Expected -40 dB/dec rolloff, got ${slope} dB/dec`);
});

test('Preset 4 (RLC Resonant Tank) resonates right at f0 = 1/(2*pi*sqrt(LC)) ≈ 1.59 kHz', () => {
  const built = getPresetById('rlc-resonator').build();
  const net = compileNetlist(built);
  const ac = runACSweep(net, { fStart: 50, fStop: 50000, points: 241 });
  assert.equal(ac.ok, true);
  const vcCh = ac.channels.find((c) => c.channel === 2);
  assert.ok(vcCh.metrics.hasResonantPeak, 'Expected resonant peak in underdamped RLC');
  assert.ok(
    Math.abs(vcCh.metrics.peakFreq - 1591) < 150,
    `Expected resonance near 1591 Hz, got ${vcCh.metrics.peakFreq}`
  );
  assert.ok(vcCh.metrics.peakGainDb > 4.0, `Expected positive resonant gain peak, got ${vcCh.metrics.peakGainDb} dB`);
});

test('Preset 5 (Diode Soft-Clipper) symmetrically clips sine peaks near ±0.7V', () => {
  const built = getPresetById('diode-clipper').build();
  const net = compileNetlist(built);
  const sim = new TransientSimulator(net, { dt: 2.5e-5, initialMode: 'dc' });
  sim.advance(200, 2.5e-5); // ~2.2 cycles of 440Hz
  const hist = sim.getWaveformHistory();
  let minOut = Infinity;
  let maxOut = -Infinity;
  let maxIn = -Infinity;
  for (let i = 0; i < hist.count; i++) {
    minOut = Math.min(minOut, hist.channels[1][i]);
    maxOut = Math.max(maxOut, hist.channels[1][i]);
    maxIn = Math.max(maxIn, hist.channels[2][i]);
  }
  assert.ok(maxIn > 2.5, `Expected drive input > 2.5V, got ${maxIn}`);
  assert.ok(maxOut > 0.55 && maxOut < 0.85, `Expected clipped positive peak ~0.68V, got ${maxOut}`);
  assert.ok(minOut < -0.55 && minOut > -0.85, `Expected clipped negative peak ~-0.68V, got ${minOut}`);
});

test('Preset 6 (Common-Emitter Amplifier) operates in ACTIVE region and amplifies with 180° inversion', () => {
  const built = getPresetById('bjt-amplifier').build();
  const net = compileNetlist(built);
  const sim = new TransientSimulator(net, { dt: 2e-5, initialMode: 'dc' });
  assert.equal(sim.lastEvaluation.compTelemetry.get('q1').state, 'ACTIVE');

  // Run 2 cycles of 1 kHz
  sim.advance(100, 2e-5);
  const hist = sim.getWaveformHistory();
  let maxOut = -Infinity;
  let minOut = Infinity;
  let corr = 0;
  for (let i = 20; i < hist.count; i++) {
    const vOut = hist.channels[1][i];
    const vIn = hist.channels[2][i];
    maxOut = Math.max(maxOut, vOut);
    minOut = Math.min(minOut, vOut);
    corr += vOut * vIn;
  }
  const vppOut = maxOut - minOut;
  // Input is 0.12 Vpk (0.24 Vpp); gain ~3.8x => output ~0.9 Vpp
  assert.ok(vppOut > 0.65 && vppOut < 1.5, `Expected amplified Vpp around ~0.9V, got ${vppOut}`);
  assert.ok(corr < 0, `Expected 180° inverted output (negative correlation), got ${corr}`);
});

test('Preset 7 (Schmitt Relaxation Oscillator) generates synchronized square and ±5V triangle waves', () => {
  const built = getPresetById('schmitt-oscillator').build();
  const net = compileNetlist(built);
  const sim = new TransientSimulator(net, { dt: 2e-5, initialMode: 'zero' });
  sim.advance(300, 2e-5); // 6 ms (~3 full cycles at ~500 Hz)
  const hist = sim.getWaveformHistory();
  let sqMin = Infinity, sqMax = -Infinity;
  let triMin = Infinity, triMax = -Infinity;
  let flips = 0;
  let prevPos = null;
  for (let i = 0; i < hist.count; i++) {
    const sq = hist.channels[1][i];
    const tri = hist.channels[2][i];
    sqMin = Math.min(sqMin, sq);
    sqMax = Math.max(sqMax, sq);
    triMin = Math.min(triMin, tri);
    triMax = Math.max(triMax, tri);
    const pos = sq > 0;
    if (prevPos !== null && pos !== prevPos) flips++;
    prevPos = pos;
  }
  assert.ok(sqMax > 9.0 && sqMin < -9.0, `Expected ±10V square wave, got [${sqMin}, ${sqMax}]`);
  assert.ok(triMax > 4.5 && triMin < -4.5, `Expected ±5V triangle wave, got [${triMin}, ${triMax}]`);
  assert.ok(flips >= 3, `Expected continuous relaxation oscillation, got ${flips} flips`);
});
