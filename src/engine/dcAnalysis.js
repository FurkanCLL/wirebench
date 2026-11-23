/**
 * DC Operating Point Solver.
 * Uses Newton-Raphson with SPICE pnjlim junction limiting.
 * Automatically falls back to Gmin stepping and Source Stepping for stiff nonlinear topologies.
 */

import { LinearWorkspace } from './matrix.js';
import {
  DEFAULT_GMIN,
  createNonlinearState,
  evaluateSolution,
  stampMNA,
  updateNonlinearState,
} from './mna.js';

const V_ABSTOL = 1e-7;
const V_RELTOL = 1e-6;

/**
 * Run Newton-Raphson iterations at a given (sourceScale, gmin).
 */
function runNewtonRaphson(ws, netlist, xInit, nlState, opts) {
  const { maxIter = 60, sourceScale = 1, gmin = DEFAULT_GMIN, mode = 'dc', t = 0, dt = 1e-5, integrator = 'trap', reactiveState = null } = opts;
  const n = netlist.matrixSize;
  const xCurr = new Float64Array(n);
  if (xInit && xInit.length === n) xCurr.set(xInit);

  if (!netlist.hasNonlinear) {
    stampMNA(ws, netlist, xCurr, { mode, t, dt, integrator, reactiveState, sourceScale, gmin });
    const res = ws.solve();
    if (!res.ok) return { converged: false, iterations: 1, x: xCurr };
    xCurr.set(ws.x);
    return { converged: true, iterations: 1, x: xCurr };
  }

  for (let iter = 1; iter <= maxIter; iter++) {
    stampMNA(ws, netlist, xCurr, {
      mode,
      t,
      dt,
      integrator,
      reactiveState,
      nlState,
      sourceScale,
      gmin,
    });

    const res = ws.solve();
    if (!res.ok) {
      return { converged: false, iterations: iter, x: xCurr };
    }

    const xNext = ws.x;
    let maxStep = 0;
    for (let i = 0; i < n; i++) {
      const diff = Math.abs(xNext[i] - xCurr[i]);
      const tol = V_ABSTOL + V_RELTOL * Math.max(Math.abs(xNext[i]), Math.abs(xCurr[i]));
      const norm = diff / tol;
      if (norm > maxStep) maxStep = norm;
    }

    const maxNlDelta = updateNonlinearState(netlist, xCurr, xNext, nlState, true);
    xCurr.set(xNext);

    if (maxStep <= 1.0 && maxNlDelta < 1e-5) {
      return { converged: true, iterations: iter, x: xCurr };
    }
  }

  return { converged: false, iterations: maxIter, x: xCurr };
}

/**
 * Solve the DC operating point of a compiled netlist.
 * @param {object} netlist
 * @param {Float64Array|null} [xGuess=null]
 */
export function solveDCOperatingPoint(netlist, xGuess = null) {
  const n = netlist.matrixSize;
  if (n === 0) {
    const emptyX = new Float64Array(0);
    return {
      converged: true,
      iterations: 0,
      method: 'empty',
      x: emptyX,
      evaluation: evaluateSolution(netlist, emptyX, { mode: 'dc' }),
    };
  }

  const ws = new LinearWorkspace(n);
  const nlState = createNonlinearState(netlist);

  // Attempt 1: Direct Newton-Raphson with pnjlim
  let attempt = runNewtonRaphson(ws, netlist, xGuess, nlState, {
    maxIter: 80,
    sourceScale: 1,
    gmin: DEFAULT_GMIN,
    mode: 'dc',
  });

  if (attempt.converged) {
    return {
      converged: true,
      iterations: attempt.iterations,
      method: 'direct',
      x: attempt.x,
      evaluation: evaluateSolution(netlist, attempt.x, { mode: 'dc', gmin: DEFAULT_GMIN }),
    };
  }

  // Attempt 2: Source Stepping (ramp sources 0.1 -> 1.0)
  let totalIters = attempt.iterations;
  const xStep = new Float64Array(n);
  const stepNl = createNonlinearState(netlist);
  const scales = [0.05, 0.15, 0.35, 0.6, 0.85, 1.0];
  let sourceSteppingOk = true;

  for (const s of scales) {
    const r = runNewtonRaphson(ws, netlist, xStep, stepNl, {
      maxIter: 60,
      sourceScale: s,
      gmin: 1e-9,
      mode: 'dc',
    });
    totalIters += r.iterations;
    if (!r.converged) {
      sourceSteppingOk = false;
      break;
    }
    xStep.set(r.x);
  }

  if (sourceSteppingOk) {
    // Polish at final DEFAULT_GMIN
    const polish = runNewtonRaphson(ws, netlist, xStep, stepNl, {
      maxIter: 40,
      sourceScale: 1.0,
      gmin: DEFAULT_GMIN,
      mode: 'dc',
    });
    totalIters += polish.iterations;
    return {
      converged: polish.converged,
      iterations: totalIters,
      method: 'source-stepping',
      x: polish.x,
      evaluation: evaluateSolution(netlist, polish.x, { mode: 'dc', gmin: DEFAULT_GMIN }),
    };
  }

  // Attempt 3: Gmin Stepping (1e-3 -> 1e-12)
  const xGmin = new Float64Array(n);
  const gminNl = createNonlinearState(netlist);
  const gmins = [1e-3, 1e-5, 1e-7, 1e-9, 1e-11, DEFAULT_GMIN];
  let lastGmin = DEFAULT_GMIN;
  let gminOk = true;

  for (const g of gmins) {
    const r = runNewtonRaphson(ws, netlist, xGmin, gminNl, {
      maxIter: 60,
      sourceScale: 1.0,
      gmin: g,
      mode: 'dc',
    });
    totalIters += r.iterations;
    if (!r.converged) {
      gminOk = false;
      break;
    }
    xGmin.set(r.x);
    lastGmin = g;
  }

  return {
    converged: gminOk,
    iterations: totalIters,
    method: gminOk ? 'gmin-stepping' : 'fallback',
    x: xGmin,
    evaluation: evaluateSolution(netlist, xGmin, { mode: 'dc', gmin: lastGmin }),
  };
}
