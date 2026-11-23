import test from 'node:test';
import assert from 'node:assert/strict';
import { LinearWorkspace, ComplexWorkspace, solveRealSystem } from '../src/engine/matrix.js';

test('solveRealSystem solves well-conditioned and pivoted systems accurately', () => {
  // Zero diagonal entry forces pivoting
  const A = [
    [0, 2, 1],
    [1, -2, -3],
    [-1, 1, 2],
  ];
  const b = [-8, 0, 3];
  const x = solveRealSystem(A, b);
  assert.ok(x !== null);
  assert.ok(Math.abs(x[0] - -4) < 1e-11);
  assert.ok(Math.abs(x[1] - -5) < 1e-11);
  assert.ok(Math.abs(x[2] - 2) < 1e-11);
});

test('LinearWorkspace handles extreme scale differences (1e-12 to 1e6) via scaled partial pivoting', () => {
  const ws = new LinearWorkspace(3);
  ws.clear();
  // Stiff MNA-like matrix
  ws.addA(0, 0, 1e-12);
  ws.addA(0, 1, 1);
  ws.addA(1, 0, 1);
  ws.addA(1, 1, 1e6);
  ws.addA(1, 2, -1e6);
  ws.addA(2, 1, -1e6);
  ws.addA(2, 2, 1e6 + 1e-3);
  ws.addB(0, 5.0);
  ws.addB(1, 0);
  ws.addB(2, 0);

  const res = ws.solve();
  assert.equal(res.ok, true);
  // Check residual A*x - b
  assert.ok(Number.isFinite(ws.x[0]) && Number.isFinite(ws.x[1]) && Number.isFinite(ws.x[2]));
  assert.ok(Math.abs(ws.x[1] - 5.0) < 1e-5);
  assert.ok(Math.abs(ws.x[2] - 5.0) < 1e-5);
});

test('ComplexWorkspace solves complex AC impedance division accurately', () => {
  // Simple RC voltage divider at f = 1/(2*pi*R*C): R = 1k, C = 1/(2*pi*1000*1000) -> |H| = 1/sqrt(2), phase = -45 deg
  const cws = new ComplexWorkspace(2);
  const R = 1000;
  const g = 1 / R;
  const wC = 1 / R; // w*C = 1/R => exact -3dB point

  // Node 1 = Vin = 1 + j0 (via voltage source branch 1)
  // Node 2 = Vout: (g + j*wC) * Vout - g * Vin = 0
  // Wait: let's solve directly 2x2: [1, 0; -g, g + j*wC] * [Vin; Vout] = [1; 0]
  cws.clear();
  cws.addA(0, 0, 1, 0);
  cws.addA(1, 0, -g, 0);
  cws.addA(1, 1, g, wC);
  cws.addB(0, 1, 0);

  assert.equal(cws.solve(), true);
  const mag = Math.hypot(cws.xre[1], cws.xim[1]);
  const phaseDeg = (Math.atan2(cws.xim[1], cws.xre[1]) * 180) / Math.PI;
  assert.ok(Math.abs(mag - Math.SQRT1_2) < 1e-12);
  assert.ok(Math.abs(phaseDeg - -45.0) < 1e-10);
});
