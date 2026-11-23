import test from 'node:test';
import assert from 'node:assert/strict';
import { createComponent } from '../src/engine/components.js';
import { compileNetlist } from '../src/engine/netlist.js';
import { solveDCOperatingPoint } from '../src/engine/dcAnalysis.js';
import { TransientSimulator } from '../src/engine/transient.js';
import { runACSweep } from '../src/engine/acAnalysis.js';

function w(id, x1, y1, x2, y2) {
  return { id, x1, y1, x2, y2 };
}

test('DC Voltage Divider & KCL conservation to machine precision', () => {
  const schematic = {
    components: [
      createComponent('voltage_source', { id: 'v1', gx: 0, gy: 0, params: { waveform: 'dc', dc: 12 } }),
      createComponent('resistor', { id: 'r1', gx: 4, gy: -2, params: { resistance: 2000 } }),
      createComponent('resistor', { id: 'r2', gx: 8, gy: 0, rotation: 90, params: { resistance: 6000 } }),
      createComponent('ground', { id: 'g1', gx: 0, gy: 2 }),
      createComponent('probe', { id: 'p1', gx: 8, gy: -2, params: { channel: 1 } }),
    ],
    wires: [
      w('w1', 0, -2, 2, -2),
      w('w2', 6, -2, 8, -2),
      w('w3', 0, 2, 8, 2),
    ],
  };

  const net = compileNetlist(schematic);
  const dc = solveDCOperatingPoint(net);
  assert.equal(dc.converged, true);
  assert.ok(dc.evaluation.maxKclResidual < 1e-10, `KCL residual too high: ${dc.evaluation.maxKclResidual}`);

  const vOut = dc.evaluation.nodeVoltages[net.probes[0].node];
  assert.ok(Math.abs(vOut - 9.0) < 1e-5, `Expected 9.0 V, got ${vOut}`);
});

test('RC Step Response matches exact analytical V_s * (1 - exp(-t / RC)) within 0.2%', () => {
  // V = 10V, R = 1k, C = 1uF -> tau = 1 ms
  const R = 1000;
  const C = 1e-6;
  const tau = R * C;
  const schematic = {
    components: [
      createComponent('voltage_source', { id: 'v1', gx: 0, gy: 0, params: { waveform: 'dc', dc: 10 } }),
      createComponent('resistor', { id: 'r1', gx: 4, gy: -2, params: { resistance: R } }),
      createComponent('capacitor', { id: 'c1', gx: 8, gy: 0, rotation: 90, params: { capacitance: C, initialVoltage: 0 } }),
      createComponent('ground', { id: 'g1', gx: 0, gy: 2 }),
      createComponent('probe', { id: 'p1', gx: 8, gy: -2, params: { channel: 1 } }),
    ],
    wires: [
      w('w1', 0, -2, 2, -2),
      w('w2', 6, -2, 8, -2),
      w('w3', 0, 2, 8, 2),
    ],
  };

  const net = compileNetlist(schematic);
  const sim = new TransientSimulator(net, { dt: 1e-5, initialMode: 'zero' });

  // Advance to t = 1*tau (100 steps of 10 us)
  sim.advance(100, 1e-5);
  const vAt1Tau = sim.lastEvaluation.nodeVoltages[net.probes[0].node];
  const expected1 = 10 * (1 - Math.exp(-sim.time / tau));
  assert.ok(Math.abs(vAt1Tau - expected1) / expected1 < 0.002, `At 1 tau: got ${vAt1Tau}, expected ${expected1}`);

  // Advance to t = 3*tau
  sim.advance(200, 1e-5);
  const vAt3Tau = sim.lastEvaluation.nodeVoltages[net.probes[0].node];
  const expected3 = 10 * (1 - Math.exp(-sim.time / tau));
  assert.ok(Math.abs(vAt3Tau - expected3) / expected3 < 0.002, `At 3 tau: got ${vAt3Tau}, expected ${expected3}`);
});

test('RL Step Current Rise matches exact analytical (V/R)*(1 - exp(-Rt/L)) within 0.3%', () => {
  const R = 100;
  const L = 10e-3;
  const tau = L / R; // 0.1 ms
  const schematic = {
    components: [
      createComponent('voltage_source', { id: 'v1', gx: 0, gy: 0, params: { waveform: 'dc', dc: 10 } }),
      createComponent('resistor', { id: 'r1', gx: 4, gy: -2, params: { resistance: R } }),
      createComponent('inductor', { id: 'l1', gx: 8, gy: 0, rotation: 90, params: { inductance: L, seriesResistance: 1e-4 } }),
      createComponent('ground', { id: 'g1', gx: 0, gy: 2 }),
    ],
    wires: [
      w('w1', 0, -2, 2, -2),
      w('w2', 6, -2, 8, -2),
      w('w3', 0, 2, 8, 2),
    ],
  };

  const net = compileNetlist(schematic);
  const sim = new TransientSimulator(net, { dt: 2e-6, initialMode: 'zero' });
  sim.advance(50, 2e-6); // t = 0.1 ms = 1*tau
  const iL = sim.lastEvaluation.compTelemetry.get('l1').current;
  const expectedI = (10 / R) * (1 - Math.exp(-sim.time / tau));
  assert.ok(Math.abs(iL - expectedI) / expectedI < 0.003, `At 1 tau: got ${iL} A, expected ${expectedI} A`);
});

test('Silicon Diode forward drop (~0.68V) and Zener Diode reverse voltage regulation (~5.1V)', () => {
  // Forward silicon diode: 5V -> 470 Ohm -> D1 -> GND
  const fwdSchem = {
    components: [
      createComponent('voltage_source', { id: 'v1', gx: 0, gy: 0, params: { waveform: 'dc', dc: 5 } }),
      createComponent('resistor', { id: 'r1', gx: 4, gy: -2, params: { resistance: 470 } }),
      createComponent('diode', { id: 'd1', gx: 8, gy: 0, rotation: 90, params: { model: 'silicon' } }),
      createComponent('ground', { id: 'g1', gx: 0, gy: 2 }),
    ],
    wires: [w('w1', 0, -2, 2, -2), w('w2', 6, -2, 8, -2), w('w3', 0, 2, 8, 2)],
  };
  const dcFwd = solveDCOperatingPoint(compileNetlist(fwdSchem));
  assert.equal(dcFwd.converged, true);
  const dTel = dcFwd.evaluation.compTelemetry.get('d1');
  assert.ok(dTel.voltage > 0.62 && dTel.voltage < 0.76, `Unexpected Si Vf: ${dTel.voltage}`);
  assert.equal(dTel.state, 'FORWARD');

  // Reverse Zener regulator: 12V -> 470 Ohm -> Zener (cathode UP, rot=270, Vz=5.1V) -> GND
  const zenerSchem = {
    components: [
      createComponent('voltage_source', { id: 'v1', gx: 0, gy: 0, params: { waveform: 'dc', dc: 12 } }),
      createComponent('resistor', { id: 'r1', gx: 4, gy: -2, params: { resistance: 470 } }),
      createComponent('diode', { id: 'z1', gx: 8, gy: 0, rotation: 270, params: { model: 'zener', vBreakdown: 5.1 } }),
      createComponent('ground', { id: 'g1', gx: 0, gy: 2 }),
      createComponent('probe', { id: 'p1', gx: 8, gy: -2, params: { channel: 1 } }),
    ],
    wires: [w('w1', 0, -2, 2, -2), w('w2', 6, -2, 8, -2), w('w3', 0, 2, 8, 2)],
  };
  const zNet = compileNetlist(zenerSchem);
  const dcZ = solveDCOperatingPoint(zNet);
  assert.equal(dcZ.converged, true);
  const vReg = dcZ.evaluation.nodeVoltages[zNet.probes[0].node];
  assert.ok(Math.abs(vReg - 5.1) < 0.25, `Expected Zener regulation ~5.1V, got ${vReg}`);
  assert.equal(dcZ.evaluation.compTelemetry.get('z1').state, 'BREAKDOWN');
});

test('NPN BJT forward-active current gain Ic = betaF * Ib and Saturation check', () => {
  // Vcc = 10V, Rc = 1k, Vb_src = 2.7V -> Rb = 100k -> Ib ≈ 20 uA -> Ic ≈ 2 mA (betaF=100), Vce ≈ 8V (ACTIVE)
  const activeSchem = {
    components: [
      createComponent('voltage_source', { id: 'vcc', gx: 10, gy: 0, params: { waveform: 'dc', dc: 10 } }),
      createComponent('voltage_source', { id: 'vb', gx: -6, gy: 2, params: { waveform: 'dc', dc: 2.7 } }),
      createComponent('resistor', { id: 'rb', gx: -2, gy: 0, params: { resistance: 100000 } }),
      createComponent('resistor', { id: 'rc', gx: 4, gy: -4, rotation: 90, params: { resistance: 1000 } }),
      createComponent('npn', { id: 'q1', gx: 3, gy: 0, params: { betaF: 100 } }),
      createComponent('ground', { id: 'g1', gx: 4, gy: 4 }),
    ],
    wires: [
      w('w1', -6, 0, -4, 0),
      w('w2', 0, 0, 1, 0),
      w('w3', 4, -6, 10, -6),
      w('w4', 10, -6, 10, -2),
      w('w5', 4, 2, 4, 4),
      w('w6', -6, 4, 10, 4),
      w('w7', 10, 2, 10, 4),
    ],
  };

  const dc = solveDCOperatingPoint(compileNetlist(activeSchem));
  assert.equal(dc.converged, true);
  const q = dc.evaluation.compTelemetry.get('q1');
  assert.equal(q.state, 'ACTIVE');
  const ratio = q.ic / q.ib;
  assert.ok(Math.abs(ratio - 100) < 0.5, `Expected Ic/Ib ≈ 100, got ${ratio}`);
  assert.ok(q.vbe > 0.58 && q.vbe < 0.72, `Unexpected Vbe: ${q.vbe}`);
});

test('Op-Amp Non-Inverting Amplifier matches exact gain (1 + Rf/R1) and clips at rails', () => {
  // Gain = 1 + 20k/10k = 3.0. Input = 2V -> Output = 6V. Input = 6V -> clips at +12V rail!
  const buildOpAmp = (vin) => ({
    components: [
      createComponent('voltage_source', { id: 'vin', gx: -6, gy: 0, params: { waveform: 'dc', dc: vin } }),
      createComponent('opamp', { id: 'u1', gx: 0, gy: -1, params: { gain: 1e5, vPos: 12, vNeg: -12 } }),
      createComponent('resistor', { id: 'rf', gx: 0, gy: 3, params: { resistance: 20000 } }),
      createComponent('resistor', { id: 'r1', gx: -4, gy: 5, rotation: 90, params: { resistance: 10000 } }),
      createComponent('ground', { id: 'g1', gx: -6, gy: 7 }),
      createComponent('probe', { id: 'p1', gx: 4, gy: -1, params: { channel: 1 } }),
    ],
    wires: [
      w('w1', -6, -2, -2, -2),
      w('w2', -6, 2, -6, 7),
      w('w3', -6, 7, -4, 7),
      w('w4', -4, 3, -2, 3),
      w('w5', -2, 3, -2, 0),
      w('w6', 2, -1, 4, -1),
      w('w7', 4, -1, 4, 3),
      w('w8', 4, 3, 2, 3),
    ],
  });

  // Linear region: 2V * 3 = 6V
  const netLin = compileNetlist(buildOpAmp(2.0));
  const dcLin = solveDCOperatingPoint(netLin);
  assert.equal(dcLin.converged, true);
  const vOutLin = dcLin.evaluation.nodeVoltages[netLin.probes[0].node];
  assert.ok(Math.abs(vOutLin - 6.0) < 1e-3, `Expected 6.0V, got ${vOutLin}`);
  assert.equal(dcLin.evaluation.compTelemetry.get('u1').state, 'LINEAR');

  // Rail saturation: 6V * 3 = 18V -> clamped at +12V
  const netSat = compileNetlist(buildOpAmp(6.0));
  const dcSat = solveDCOperatingPoint(netSat);
  assert.equal(dcSat.converged, true);
  const vOutSat = dcSat.evaluation.nodeVoltages[netSat.probes[0].node];
  assert.ok(Math.abs(vOutSat - 12.0) < 0.05, `Expected rail clip ~12V, got ${vOutSat}`);
  assert.equal(dcSat.evaluation.compTelemetry.get('u1').state, 'RAIL+');
});

test('AC Small-Signal Bode Sweep computes exact -3 dB cutoff & -45 deg phase for RC Low-Pass', () => {
  // R = 1k, C = 159.155 nF -> fc = 1000.0 Hz
  const R = 1000;
  const C = 1 / (2 * Math.PI * R * 1000);
  const schematic = {
    components: [
      createComponent('voltage_source', { id: 'v1', gx: 0, gy: 0, params: { waveform: 'sine', amplitude: 1, frequency: 1000, acMag: 1 } }),
      createComponent('resistor', { id: 'r1', gx: 4, gy: -2, params: { resistance: R } }),
      createComponent('capacitor', { id: 'c1', gx: 8, gy: 0, rotation: 90, params: { capacitance: C } }),
      createComponent('ground', { id: 'g1', gx: 0, gy: 2 }),
      createComponent('probe', { id: 'p1', gx: 8, gy: -2, params: { channel: 1, label: 'Out' } }),
    ],
    wires: [w('w1', 0, -2, 2, -2), w('w2', 6, -2, 8, -2), w('w3', 0, 2, 8, 2)],
  };

  const net = compileNetlist(schematic);
  const ac = runACSweep(net, { fStart: 10, fStop: 100000, points: 241 });
  assert.equal(ac.ok, true);
  const ch = ac.channels[0];
  assert.equal(ch.metrics.cutoffs.length, 1);
  const fc = ch.metrics.cutoffs[0].freq;
  assert.ok(Math.abs(fc - 1000) / 1000 < 0.005, `Expected fc ≈ 1000 Hz, got ${fc}`);

  // Exact midpoint index 120 corresponds to 10^(1 + 0.5*4) = 1000 Hz
  assert.ok(Math.abs(ac.frequencies[120] - 1000) < 1e-6);
  assert.ok(Math.abs(ch.magDb[120] - -3.0103) < 0.01);
  assert.ok(Math.abs(ch.phaseDeg[120] - -45.0) < 0.05);
});

test('Parallel wire-segment current solver splits current in exact 2:1 ratio across T-junction', () => {
  // 10V -> horizontal bus with T-junction splitting to R1=1k (10mA) and R2=2k (5mA) -> total 15mA
  const schematic = {
    components: [
      createComponent('voltage_source', { id: 'v1', gx: 0, gy: 0, params: { waveform: 'dc', dc: 10 } }),
      createComponent('resistor', { id: 'r1', gx: 4, gy: 0, rotation: 90, params: { resistance: 1000 } }),
      createComponent('resistor', { id: 'r2', gx: 8, gy: 0, rotation: 90, params: { resistance: 2000 } }),
      createComponent('ground', { id: 'g1', gx: 0, gy: 2 }),
    ],
    wires: [
      w('topBus', 0, -2, 8, -2),
      w('gndBus', 0, 2, 8, 2),
    ],
  };

  const net = compileNetlist(schematic);
  // topBus should be split at (4,-2) into (0,-2)->(4,-2) carrying 15mA and (4,-2)->(8,-2) carrying 5mA!
  const sim = new TransientSimulator(net, { dt: 1e-4, initialMode: 'dc' });
  const segLeft = net.segments.find((s) => s.x1 === 0 && s.y1 === -2 && s.x2 === 4 && s.y2 === -2);
  const segRight = net.segments.find((s) => s.x1 === 4 && s.y1 === -2 && s.x2 === 8 && s.y2 === -2);
  assert.ok(segLeft && segRight, 'Expected T-junction wire split at (4,-2)');
  const iLeft = sim.segmentCurrents[segLeft.index];
  const iRight = sim.segmentCurrents[segRight.index];
  assert.ok(Math.abs(iLeft - 0.015) < 1e-5, `Expected 15mA on feeder segment, got ${iLeft}`);
  assert.ok(Math.abs(iRight - 0.005) < 1e-5, `Expected 5mA on branch segment, got ${iRight}`);
});
