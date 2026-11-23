/**
 * Real-Time Transient Circuit Simulator.
 * - 2nd-order Trapezoidal integration with automatic Backward-Euler damping on discontinuities.
 * - Newton-Raphson with SPICE pnjlim + automatic half-step subdivision on stiff edges.
 * - Exact per-wire-segment KCL current solver for realistic animated current flow across T-junctions.
 * - Circular oscilloscope waveform ring buffer.
 */

import { isLogicGateType } from './components.js';
import { LinearWorkspace } from './matrix.js';
import { solveDCOperatingPoint } from './dcAnalysis.js';
import {
  DEFAULT_GMIN,
  createNonlinearState,
  evaluateSolution,
  getNodeV,
  stampMNA,
  updateNonlinearState,
} from './mna.js';

const V_ABSTOL = 1e-7;
const V_RELTOL = 1e-5;

export class TransientSimulator {
  /**
   * @param {object} netlist - CompiledNetlist
   * @param {object} [options]
   * @param {number} [options.dt=2e-5] - Default timestep (seconds)
   * @param {'dc'|'zero'} [options.initialMode='dc'] - 'dc' solves DC op first; 'zero' starts caps/inductors at initialVoltage/0
   * @param {number} [options.historySize=4096]
   */
  constructor(netlist, options = {}) {
    this.netlist = netlist;
    this.dt = options.dt || 2e-5;
    this.initialMode = options.initialMode || 'dc';
    this.historySize = options.historySize || 4096;

    this.ws = new LinearWorkspace(netlist.matrixSize);
    this.wireWs = new LinearWorkspace(16);
    this.x = new Float64Array(netlist.matrixSize);
    this.nlState = createNonlinearState(netlist);
    this.reactiveState = new Map();

    this.time = 0;
    this.stepCount = 0;
    this.lastIterations = 0;
    this.converged = true;
    this.beStepsRemaining = 2; // Start with 2 Backward-Euler steps to damp startup transients

    this.lastEvaluation = null;
    this.segmentCurrents = new Float64Array(netlist.segments.length);

    // Precompute wire net sub-graphs for fast per-segment KCL current solve
    this._wireNetGraphs = this._buildWireNetGraphs(netlist);

    // Oscilloscope ring buffer (stores time + voltages for channels 1..4)
    this.historyTime = new Float64Array(this.historySize);
    this.historyChannels = {
      1: new Float64Array(this.historySize),
      2: new Float64Array(this.historySize),
      3: new Float64Array(this.historySize),
      4: new Float64Array(this.historySize),
    };
    this.historyHead = 0;
    this.historyCount = 0;

    this.reset();
  }

  /**
   * Build lightweight per-net vertex/edge tables for solving exact wire-segment currents.
   */
  _buildWireNetGraphs(netlist) {
    const graphs = [];
    for (const [nodeId, segs] of netlist.segmentsByNode.entries()) {
      if (segs.length === 0) continue;
      const keyToIdx = new Map();
      const idxToKey = [];
      const addV = (k) => {
        if (!keyToIdx.has(k)) {
          keyToIdx.set(k, idxToKey.length);
          idxToKey.push(k);
        }
        return keyToIdx.get(k);
      };
      const edges = segs.map((s) => ({
        segIndex: s.index,
        u: addV(s.k1),
        v: addV(s.k2),
      }));
      graphs.push({ nodeId, edges, idxToKey, numVerts: idxToKey.length });
    }
    return graphs;
  }

  /**
   * Reset simulation to t = 0 and initialize reactive state.
   */
  reset() {
    this.time = 0;
    this.stepCount = 0;
    this.historyHead = 0;
    this.historyCount = 0;
    this.beStepsRemaining = 2;
    this.reactiveState.clear();
    this.nlState = createNonlinearState(this.netlist);

    const hasExplicitIC = this.netlist.components.some(
      (c) => c.type === 'capacitor' && Math.abs(Number(c.params.initialVoltage) || 0) > 1e-9
    );

    if (this.initialMode === 'dc' && !hasExplicitIC) {
      const dc = solveDCOperatingPoint(this.netlist);
      this.x.set(dc.x);
      this.converged = dc.converged;
      this.lastIterations = dc.iterations;
      this.lastEvaluation = dc.evaluation;
      updateNonlinearState(this.netlist, this.x, this.x, this.nlState, false);

      // Seed capacitors, inductors, and BJT junction caps from exact DC operating point
      for (const cc of this.netlist.components) {
        if (cc.type === 'capacitor') {
          const va = dc.evaluation.nodeVoltages[cc.pinNodes.a];
          const vb = dc.evaluation.nodeVoltages[cc.pinNodes.b];
          this.reactiveState.set(cc.id, { vPrev: va - vb, iPrev: 0 });
        } else if (cc.type === 'inductor') {
          const tel = dc.evaluation.compTelemetry.get(cc.id);
          this.reactiveState.set(cc.id, {
            vPrev: tel ? tel.voltage : 0,
            iPrev: tel ? tel.current : 0,
          });
        } else if (cc.type === 'npn' || cc.type === 'pnp') {
          const vc = dc.evaluation.nodeVoltages[cc.pinNodes.c];
          const vb = dc.evaluation.nodeVoltages[cc.pinNodes.b];
          const ve = dc.evaluation.nodeVoltages[cc.pinNodes.e];
          this.reactiveState.set(cc.id, { vBePrev: vb - ve, vBcPrev: vb - vc });
        } else if (cc.type === 'nmos' || cc.type === 'pmos') {
          const vd = dc.evaluation.nodeVoltages[cc.pinNodes.d];
          const vg = dc.evaluation.nodeVoltages[cc.pinNodes.g];
          const vs = dc.evaluation.nodeVoltages[cc.pinNodes.s];
          this.reactiveState.set(cc.id, { vGsPrev: vg - vs, vGdPrev: vg - vd });
        } else if (isLogicGateType(cc.type)) {
          this.reactiveState.set(cc.id, { vOutPrev: dc.evaluation.nodeVoltages[cc.pinNodes.out] });
        }
      }
    } else {
      // Zero / Initial-Condition startup (caps start at initialVoltage, inductors at 0A)
      this.x.fill(0);
      for (const cc of this.netlist.components) {
        if (cc.type === 'capacitor') {
          this.reactiveState.set(cc.id, {
            vPrev: Number(cc.params.initialVoltage) || 0,
            iPrev: 0,
          });
        } else if (cc.type === 'inductor') {
          this.reactiveState.set(cc.id, { vPrev: 0, iPrev: 0 });
        } else if (cc.type === 'npn' || cc.type === 'pnp') {
          this.reactiveState.set(cc.id, { vBePrev: 0, vBcPrev: 0 });
        } else if (cc.type === 'nmos' || cc.type === 'pmos') {
          this.reactiveState.set(cc.id, { vGsPrev: 0, vGdPrev: 0 });
        } else if (isLogicGateType(cc.type)) {
          this.reactiveState.set(cc.id, { vOutPrev: 0 });
        }
      }
      // Compute clean initial state at t=0 via a tiny Backward Euler solve
      const initDt = Math.min(this.dt, 1e-6);
      this._solveSingleStep(0, initDt, 'be', false);
      // Sync parasitic semiconductor voltages to t=0 initial solution
      for (const cc of this.netlist.components) {
        if (cc.type === 'npn' || cc.type === 'pnp') {
          const vc = getNodeV(this.x, cc.pinNodes.c);
          const vb = getNodeV(this.x, cc.pinNodes.b);
          const ve = getNodeV(this.x, cc.pinNodes.e);
          this.reactiveState.set(cc.id, { vBePrev: vb - ve, vBcPrev: vb - vc });
        } else if (cc.type === 'nmos' || cc.type === 'pmos') {
          const vd = getNodeV(this.x, cc.pinNodes.d);
          const vg = getNodeV(this.x, cc.pinNodes.g);
          const vs = getNodeV(this.x, cc.pinNodes.s);
          this.reactiveState.set(cc.id, { vGsPrev: vg - vs, vGdPrev: vg - vd });
        } else if (isLogicGateType(cc.type)) {
          this.reactiveState.set(cc.id, { vOutPrev: getNodeV(this.x, cc.pinNodes.out) });
        }
      }
      this.lastEvaluation = evaluateSolution(this.netlist, this.x, {
        mode: 'transient',
        t: 0,
        dt: initDt,
        integrator: 'be',
        reactiveState: this.reactiveState,
      });
    }

    this._computeWireSegmentCurrents();
    this._recordHistorySample();
  }

  /**
   * Call whenever the user flips a switch, drags a potentiometer, or tweaks a parameter live
   * without rebuilding topology. Triggers 2 Backward-Euler steps to avoid trapezoidal ringing.
   */
  notifyDiscontinuity() {
    this.beStepsRemaining = Math.max(this.beStepsRemaining, 2);
  }

  /**
   * Hot-update netlist when user edits schematic while running, preserving reactive energy
   * for surviving capacitors and inductors by component ID!
   */
  hotSwapNetlist(newNetlist) {
    const oldReactive = this.reactiveState;
    this.netlist = newNetlist;
    this.ws.resize(newNetlist.matrixSize);
    this.x = new Float64Array(newNetlist.matrixSize);
    this.nlState = createNonlinearState(newNetlist);
    this.reactiveState = new Map();
    for (const cc of newNetlist.components) {
      if (cc.type === 'capacitor') {
        const prev = oldReactive.get(cc.id);
        this.reactiveState.set(cc.id, prev ? { ...prev } : { vPrev: Number(cc.params.initialVoltage) || 0, iPrev: 0 });
      } else if (cc.type === 'inductor') {
        const prev = oldReactive.get(cc.id);
        this.reactiveState.set(cc.id, prev ? { ...prev } : { vPrev: 0, iPrev: 0 });
      } else if (cc.type === 'npn' || cc.type === 'pnp') {
        const prev = oldReactive.get(cc.id);
        this.reactiveState.set(cc.id, prev ? { ...prev } : { vBePrev: 0, vBcPrev: 0 });
      } else if (cc.type === 'nmos' || cc.type === 'pmos') {
        const prev = oldReactive.get(cc.id);
        this.reactiveState.set(cc.id, prev ? { ...prev } : { vGsPrev: 0, vGdPrev: 0 });
      } else if (isLogicGateType(cc.type)) {
        const prev = oldReactive.get(cc.id);
        this.reactiveState.set(cc.id, prev ? { ...prev } : { vOutPrev: 0 });
      }
    }
    this.segmentCurrents = new Float64Array(newNetlist.segments.length);
    this._wireNetGraphs = this._buildWireNetGraphs(newNetlist);
    this.beStepsRemaining = 2;

    if (newNetlist.matrixSize > 0) {
      this.step(this.dt);
    } else {
      this.lastEvaluation = evaluateSolution(newNetlist, this.x, { mode: 'dc' });
    }
  }

  /**
   * Solve one Newton-Raphson transient step at time tNext with step size dt.
   */
  _solveSingleStep(tNext, dt, integrator, commitReactive = true, gmin = DEFAULT_GMIN) {
    const n = this.netlist.matrixSize;
    if (n === 0) {
      this.converged = true;
      this.lastIterations = 0;
      return true;
    }

    const xCurr = new Float64Array(this.x);
    const savedNl = new Map();
    for (const [id, st] of this.nlState.entries()) {
      savedNl.set(id, { ...st });
    }

    const maxIter = this.netlist.hasNonlinear ? 50 : 1;
    let converged = false;
    let iters = 0;

    for (let iter = 1; iter <= maxIter; iter++) {
      iters = iter;
      stampMNA(this.ws, this.netlist, xCurr, {
        mode: 'transient',
        t: tNext,
        dt,
        integrator,
        reactiveState: this.reactiveState,
        nlState: this.netlist.hasNonlinear ? this.nlState : null,
        gmin,
      });

      const res = this.ws.solve();
      if (!res.ok) {
        converged = false;
        break;
      }

      const xNext = this.ws.x;
      if (!this.netlist.hasNonlinear) {
        xCurr.set(xNext);
        converged = true;
        break;
      }

      // Apply gentle damping on late iterations to suppress 2-cycles near fold bifurcations
      const alpha = iter > 20 ? 0.5 : 1.0;
      let maxStep = 0;
      for (let i = 0; i < n; i++) {
        const stepped = alpha === 1.0 ? xNext[i] : xCurr[i] + alpha * (xNext[i] - xCurr[i]);
        const diff = Math.abs(xNext[i] - xCurr[i]);
        const tol = V_ABSTOL + V_RELTOL * Math.max(Math.abs(xNext[i]), Math.abs(xCurr[i]));
        const norm = diff / tol;
        if (norm > maxStep) maxStep = norm;
        xNext[i] = stepped;
      }

      const maxNlDelta = updateNonlinearState(this.netlist, xCurr, xNext, this.nlState, true);
      xCurr.set(xNext);

      if (maxStep <= 1.0 && maxNlDelta < 1e-5) {
        converged = true;
        break;
      }
    }

    if (!converged) {
      // Restore nlState on failure so subdivision can retry cleanly
      this.nlState = savedNl;
      this.lastIterations = iters;
      return false;
    }

    this.x.set(xCurr);
    this.lastIterations = iters;
    this.converged = true;

    if (commitReactive) {
      this._updateReactiveHistory(dt, integrator);
    }
    return true;
  }

  /**
   * Commit capacitor voltages/currents and inductor voltages/currents after a converged step.
   */
  _updateReactiveHistory(dt, integrator) {
    for (const cc of this.netlist.components) {
      if (cc.type === 'capacitor') {
        const cap = Math.max(1e-15, Number(cc.params.capacitance) || 1e-6);
        const vNew = getNodeV(this.x, cc.pinNodes.a) - getNodeV(this.x, cc.pinNodes.b);
        const st = this.reactiveState.get(cc.id) || { vPrev: 0, iPrev: 0 };
        const iNew =
          integrator === 'trap'
            ? ((2 * cap) / dt) * (vNew - st.vPrev) - st.iPrev
            : (cap / dt) * (vNew - st.vPrev);
        st.vPrev = vNew;
        st.iPrev = iNew;
        this.reactiveState.set(cc.id, st);
      } else if (cc.type === 'inductor') {
        const ind = Math.max(1e-12, Number(cc.params.inductance) || 1e-3);
        const esr = Math.max(1e-4, Number(cc.params.seriesResistance) || 0.5);
        const vNew = getNodeV(this.x, cc.pinNodes.a) - getNodeV(this.x, cc.pinNodes.b);
        const st = this.reactiveState.get(cc.id) || { vPrev: 0, iPrev: 0 };
        let iNew;
        if (integrator === 'trap') {
          const rL = (2 * ind) / dt;
          const vLPrev = st.vPrev - esr * st.iPrev;
          iNew = (vNew + rL * st.iPrev + vLPrev) / (rL + esr);
        } else {
          const rL = ind / dt;
          iNew = (vNew + rL * st.iPrev) / (rL + esr);
        }
        st.vPrev = vNew;
        st.iPrev = iNew;
        this.reactiveState.set(cc.id, st);
      } else if (cc.type === 'npn' || cc.type === 'pnp') {
        const vc = getNodeV(this.x, cc.pinNodes.c);
        const vb = getNodeV(this.x, cc.pinNodes.b);
        const ve = getNodeV(this.x, cc.pinNodes.e);
        this.reactiveState.set(cc.id, { vBePrev: vb - ve, vBcPrev: vb - vc });
      } else if (cc.type === 'nmos' || cc.type === 'pmos') {
        const vd = getNodeV(this.x, cc.pinNodes.d);
        const vg = getNodeV(this.x, cc.pinNodes.g);
        const vs = getNodeV(this.x, cc.pinNodes.s);
        this.reactiveState.set(cc.id, { vGsPrev: vg - vs, vGdPrev: vg - vd });
      } else if (isLogicGateType(cc.type)) {
        this.reactiveState.set(cc.id, { vOutPrev: getNodeV(this.x, cc.pinNodes.out) });
      }
    }
  }

  /**
   * Advance the simulation by one target timestep `dt`.
   * Uses adaptive substep shrinking + growth to cross stiff regenerative switching edges
   * (like BJT multivibrator flips) in a handful of substeps without ever freezing.
   * @param {number} [dt=this.dt]
   * @param {boolean} [recordSample=true]
   */
  step(dt = this.dt, recordSample = true) {
    const tEnd = this.time + dt;
    let remaining = dt;
    let h = dt;
    const minH = Math.min(dt * 1e-6, 1e-9);
    let subSteps = 0;
    let allOk = true;

    while (remaining > 1e-15 && subSteps < 120) {
      subSteps++;
      const stepDt = Math.min(h, remaining);
      const integrator = this.beStepsRemaining > 0 || stepDt < dt * 0.99 ? 'be' : 'trap';
      const tNext = this.time + stepDt;

      const preReactive = new Map();
      for (const [id, st] of this.reactiveState.entries()) {
        preReactive.set(id, { ...st });
      }

      if (this._solveSingleStep(tNext, stepDt, integrator, true)) {
        this.time = tNext;
        remaining = Math.max(0, tEnd - this.time);
        this._lastStepMeta = { t: tNext, dt: stepDt, integrator, preReactive };
        if (this.beStepsRemaining > 0) this.beStepsRemaining--;
        // Grow step size back toward target dt smoothly once converged cleanly
        if (this.lastIterations <= 12) {
          h = Math.min(dt, stepDt * 2.0);
        }
      } else if (stepDt > minH) {
        h = Math.max(minH, stepDt * 0.25);
        this.beStepsRemaining = Math.max(this.beStepsRemaining, 2);
      } else {
        // Fallback: gently relax Gmin for this tiny micro-substep to cross fold bifurcation
        const relaxedOk = this._solveSingleStep(tNext, stepDt, 'be', true, 1e-6);
        this.time = tNext;
        remaining = Math.max(0, tEnd - this.time);
        this._lastStepMeta = { t: tNext, dt: stepDt, integrator: 'be', preReactive };
        if (!relaxedOk) allOk = false;
      }
    }

    this.converged = allOk;
    this.stepCount++;
    if (recordSample) {
      this._recordHistorySample();
    }
    return allOk;
  }

  /**
   * Advance multiple substeps efficiently (typical frame: 20-80 substeps),
   * computing full component telemetry and wire-segment currents once at the end of the batch.
   * @param {number} numSteps
   * @param {number} [dt=this.dt]
   * @param {number} [recordEvery=1]
   */
  advance(numSteps, dt = this.dt, recordEvery = 1) {
    for (let i = 0; i < numSteps; i++) {
      const record = (i + 1) % recordEvery === 0 || i === numSteps - 1;
      this.step(dt, record);
    }
    this.refreshTelemetry();
  }

  /**
   * Refresh full component telemetry, KCL residual, warnings, and exact per-wire-segment currents.
   */
  refreshTelemetry() {
    const meta = this._lastStepMeta;
    if (meta) {
      this.lastEvaluation = evaluateSolution(this.netlist, this.x, {
        mode: 'transient',
        t: meta.t,
        dt: meta.dt,
        integrator: meta.integrator,
        reactiveState: meta.preReactive,
        gmin: DEFAULT_GMIN,
      });
    } else {
      this.lastEvaluation = evaluateSolution(this.netlist, this.x, { mode: 'dc', gmin: DEFAULT_GMIN });
    }
    this._computeWireSegmentCurrents();
    return this.lastEvaluation;
  }

  /**
   * Record probed node voltages into the circular oscilloscope ring buffer.
   */
  _recordHistorySample() {
    const idx = this.historyHead;
    this.historyTime[idx] = this.time;
    const activeChannels = new Set();
    for (const pr of this.netlist.probes) {
      const ch = pr.channel;
      if (ch >= 1 && ch <= 4) {
        this.historyChannels[ch][idx] = getNodeV(this.x, pr.node);
        activeChannels.add(ch);
      }
    }
    for (let ch = 1; ch <= 4; ch++) {
      if (!activeChannels.has(ch)) {
        this.historyChannels[ch][idx] = 0;
      }
    }
    this.historyHead = (this.historyHead + 1) % this.historySize;
    if (this.historyCount < this.historySize) this.historyCount++;
  }

  /**
   * Compute exact Kirchhoff-conserving current along every individual split wire segment!
   * Treats each electrical net's wire segments as unit-conductance edges with exact external
   * pin currents injected at each vertex. Solves in < 15 microseconds total.
   */
  _computeWireSegmentCurrents() {
    this.segmentCurrents.fill(0);
    if (!this.lastEvaluation) return;
    const pinInj = this.lastEvaluation.pinCurrentsByPoint;

    for (const graph of this._wireNetGraphs) {
      const { edges, idxToKey, numVerts } = graph;
      if (edges.length === 0 || numVerts < 2) continue;

      // Fast path for a single wire segment between 2 vertices
      if (edges.length === 1) {
        const e = edges[0];
        const iFromU = pinInj.get(idxToKey[e.u]) || 0;
        const iFromV = pinInj.get(idxToKey[e.v]) || 0;
        // Positive means current flows u -> v
        this.segmentCurrents[e.segIndex] = 0.5 * (iFromU - iFromV);
        continue;
      }

      // General connected net graph: ground vertex 0 (phi_0 = 0), solve (V-1)x(V-1) Laplacian
      const dim = numVerts - 1;
      if (this.wireWs.n !== dim) this.wireWs.resize(dim);
      this.wireWs.clear();

      for (const e of edges) {
        const u = e.u;
        const v = e.v;
        if (u > 0) this.wireWs.addA(u - 1, u - 1, 1);
        if (v > 0) this.wireWs.addA(v - 1, v - 1, 1);
        if (u > 0 && v > 0) {
          this.wireWs.addA(u - 1, v - 1, -1);
          this.wireWs.addA(v - 1, u - 1, -1);
        }
      }

      // Tiny diagonal regularization for numerical safety on degenerate disconnected wire fragments
      for (let i = 0; i < dim; i++) {
        this.wireWs.addA(i, i, 1e-12);
        const inj = pinInj.get(idxToKey[i + 1]) || 0;
        this.wireWs.addB(i, inj);
      }

      const res = this.wireWs.solve();
      if (!res.ok) continue;

      const phi = this.wireWs.x;
      for (const e of edges) {
        const pu = e.u > 0 ? phi[e.u - 1] : 0;
        const pv = e.v > 0 ? phi[e.v - 1] : 0;
        // Current flowing from u (k1) -> v (k2)
        this.segmentCurrents[e.segIndex] = pu - pv;
      }
    }
  }

  /**
   * Read ordered waveform history slices (oldest -> newest) for Oscilloscope / CSV export.
   */
  getWaveformHistory() {
    const count = this.historyCount;
    const size = this.historySize;
    const start = (this.historyHead - count + size) % size;
    const times = new Float64Array(count);
    const channels = {
      1: new Float64Array(count),
      2: new Float64Array(count),
      3: new Float64Array(count),
      4: new Float64Array(count),
    };
    for (let i = 0; i < count; i++) {
      const idx = (start + i) % size;
      times[i] = this.historyTime[idx];
      channels[1][i] = this.historyChannels[1][idx];
      channels[2][i] = this.historyChannels[2][idx];
      channels[3][i] = this.historyChannels[3][idx];
      channels[4][i] = this.historyChannels[4][idx];
    }
    return { count, times, channels };
  }
}
