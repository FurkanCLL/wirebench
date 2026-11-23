/**
 * Modified Nodal Analysis (MNA) Stamping, Semiconductor Physics (Shockley + Ebers-Moll + Op-Amp),
 * SPICE pnjlim Newton-Raphson damping, and exact terminal current/telemetry evaluation.
 */

import { getDiodePhysics, isLogicGateType } from './components.js';

export const VT = 0.02585199; // Thermal voltage kT/q at 300K (~25.85 mV)
export const DEFAULT_GMIN = 1e-12;
export const VOLTAGE_SOURCE_RINT = 1e-6; // 1 micro-ohm prevents singular parallel source loops
export const BJT_CJE = 35e-12; // 35 pF base-emitter junction capacitance (2N2222 typical)
export const BJT_CJC = 15e-12; // 15 pF base-collector junction capacitance (2N2222 typical)
export const MOS_CGS = 40e-12; // 40 pF MOSFET gate-source capacitance
export const MOS_CGD = 15e-12; // 15 pF MOSFET gate-drain capacitance
export const GATE_COUT = 25e-12; // 25 pF CMOS gate output load capacitance
const MAX_EXP_ARG = 38; // exp(38) ~ 3.18e16, safely inside float64 without overflow

/**
 * SPICE3f5 logarithmic junction voltage limiting (Laurence Nagel).
 * Prevents Newton-Raphson iterates from exploding across exponential PN junctions.
 * @param {number} vNew
 * @param {number} vOld
 * @param {number} vt - Effective thermal voltage (n * VT)
 * @param {number} vCrit - Critical junction voltage
 * @returns {number}
 */
export function pnjlim(vNew, vOld, vt, vCrit) {
  if (vNew > vCrit && Math.abs(vNew - vOld) > 2 * vt) {
    if (vOld > 0) {
      const arg = 1 + (vNew - vOld) / vt;
      if (arg > 0) {
        return vOld + vt * Math.log(arg);
      }
      return vCrit;
    }
    return vt * Math.log(Math.max(1e-12, vNew / vt));
  }
  // Gently limit huge reverse jumps too for Zener stability
  if (vNew < -100) return -100;
  return vNew;
}

/**
 * Critical voltage for SPICE pnjlim.
 * @param {number} is
 * @param {number} nVt
 */
export function calcVCrit(is, nVt) {
  return nVt * Math.log(Math.max(1.0, nVt / (Math.SQRT2 * Math.max(is, 1e-24))));
}

/**
 * Smooth C1-continuous Shockley exponential junction I(v) and dI/dv.
 * Linearly continues above MAX_EXP_ARG so float64 never overflows.
 * @param {number} v
 * @param {number} is
 * @param {number} nVt
 * @returns {{ i: number, g: number }}
 */
export function evalExpJunction(v, is, nVt) {
  const arg = v / nVt;
  if (arg <= MAX_EXP_ARG) {
    if (arg < -40) {
      return { i: -is, g: 1e-15 };
    }
    const e = Math.exp(arg);
    return {
      i: is * (e - 1),
      g: (is / nVt) * e,
    };
  }
  const eMax = Math.exp(MAX_EXP_ARG);
  const gMax = (is / nVt) * eMax;
  const vMax = MAX_EXP_ARG * nVt;
  return {
    i: is * (eMax - 1) + gMax * (v - vMax),
    g: gMax,
  };
}

/**
 * Evaluate diode or LED I-V curve (forward Shockley + optional Zener reverse breakdown + Gmin).
 * @param {number} vd - V(anode) - V(cathode)
 * @param {object} comp
 * @param {number} [gmin=DEFAULT_GMIN]
 * @returns {{ i: number, g: number, region: string }}
 */
export function evalDiode(vd, comp, gmin = DEFAULT_GMIN) {
  const phys = getDiodePhysics(comp);
  const nVt = phys.n * VT;
  const fwd = evalExpJunction(vd, phys.is, nVt);

  let i = fwd.i + gmin * vd;
  let g = fwd.g + gmin;
  let region = vd > 0.25 && fwd.i > 1e-6 ? 'FORWARD' : vd < -0.1 ? 'REVERSE' : 'OFF';

  if (phys.isZener && vd < 0) {
    const vRev = -vd - phys.bv;
    const bvVt = 1.5 * VT;
    const ibv = 1e-3; // 1 mA knee current at Vz
    if (vRev > -25 * bvVt) {
      const rev = evalExpJunction(vRev, ibv, bvVt);
      // Reverse current flows cathode -> anode (negative vd direction)
      i -= rev.i;
      g += rev.g;
      if (rev.i > 1e-4) region = 'BREAKDOWN';
    }
  }

  return { i, g, region };
}

/**
 * Evaluate full Ebers-Moll BJT currents (entering collector, base, emitter) and exact 3x3 Jacobian.
 * @param {number} vc
 * @param {number} vb
 * @param {number} ve
 * @param {object} comp
 * @param {number} [gmin=DEFAULT_GMIN]
 */
export function evalBJT(vc, vb, ve, comp, gmin = DEFAULT_GMIN) {
  const s = comp.type === 'pnp' ? -1 : 1;
  const betaF = Math.max(2, Number(comp.params.betaF) || 120);
  const betaR = Math.max(0.2, Number(comp.params.betaR) || 2);
  const is = Math.max(1e-18, Number(comp.params.is) || 1e-14);

  const vbe = s * (vb - ve);
  const vbc = s * (vb - vc);

  const fwd = evalExpJunction(vbe, is, VT);
  const rev = evalExpJunction(vbc, is, VT);

  const iF = fwd.i;
  const gF = fwd.g;
  const iR = rev.i;
  const gR = rev.g;

  const invBF = 1 / betaF;
  const invBR = 1 / betaR;

  // Currents entering C, B, E terminals (KCL: ic + ib + ie === 0)
  const ic = s * (iF - iR * (1 + invBR)) + gmin * (vc - vb);
  const ib = s * (iF * invBF + iR * invBR) + gmin * (vb - ve) + gmin * (vb - vc);
  const ie = s * (-iF * (1 + invBF) + iR) + gmin * (ve - vb);

  // Exact partial derivatives (notice s^2 === 1 so signs are identical for NPN & PNP!)
  const dIc_dVc = gR * (1 + invBR) + gmin;
  const dIc_dVb = gF - gR * (1 + invBR) - gmin;
  const dIc_dVe = -gF;

  const dIb_dVc = -gR * invBR - gmin;
  const dIb_dVb = gF * invBF + gR * invBR + 2 * gmin;
  const dIb_dVe = -gF * invBF - gmin;

  const dIe_dVc = -gR;
  const dIe_dVb = -gF * (1 + invBF) + gR - gmin;
  const dIe_dVe = gF * (1 + invBF) + gmin;

  let region = 'CUTOFF';
  if (vbe > 0.45 && vbc > 0.35) region = 'SATURATION';
  else if (vbe > 0.45) region = 'ACTIVE';
  else if (vbc > 0.45) region = 'REV-ACTIVE';

  return {
    ic,
    ib,
    ie,
    vbe,
    vbc,
    region,
    jac: {
      cc: dIc_dVc, cb: dIc_dVb, ce: dIc_dVe,
      bc: dIb_dVc, bb: dIb_dVb, be: dIb_dVe,
      ec: dIe_dVc, eb: dIe_dVb, ee: dIe_dVe,
    },
  };
}

/**
 * Evaluate smooth rail-limited Op-Amp output transfer function V_target(vd) and slope dV_target/dvd.
 * @param {number} vPosIn
 * @param {number} vNegIn
 * @param {object} comp
 */
export function evalOpAmp(vPosIn, vNegIn, comp) {
  const gain = Math.max(10, Number(comp.params.gain) || 1e5);
  const vPos = Number.isFinite(Number(comp.params.vPos)) ? Number(comp.params.vPos) : 12;
  const vNeg = Number.isFinite(Number(comp.params.vNeg)) ? Number(comp.params.vNeg) : -12;
  const rOut = Math.max(0.5, Number(comp.params.rOut) || 50);

  const vMid = 0.5 * (vPos + vNeg);
  const vSpan = Math.max(0.1, 0.5 * (vPos - vNeg));
  const vd = vPosIn - vNegIn;
  const u = (gain * vd) / vSpan;

  let t;
  let sech2;
  if (u > 18) {
    t = 1;
    sech2 = 0;
  } else if (u < -18) {
    t = -1;
    sech2 = 0;
  } else {
    t = Math.tanh(u);
    sech2 = 1 - t * t;
  }

  const vTarget = vMid + vSpan * t;
  const gm = gain * sech2; // dV_target / dvd

  let region = 'LINEAR';
  if (t > 0.98) region = 'RAIL+';
  else if (t < -0.98) region = 'RAIL−';

  return { vTarget, gm, rOut, vd, region };
}

/**
 * Evaluate smooth Shichman-Hodges Level-1 MOSFET (NMOS & PMOS) with bidirectional
 * drain-source symmetry and exact analytical partial derivatives.
 */
export function evalMOSFET(vd, vg, vs, comp, gmin = DEFAULT_GMIN) {
  const p = comp.type === 'pmos' ? -1 : 1;
  const vth = Math.max(0.1, Math.abs(Number(comp.params.vth) || 1.5));
  const kp = Math.max(1e-5, Number(comp.params.kp) || 0.08);
  const lambda = Math.max(0, Number(comp.params.lambda) ?? 0.02);

  const vdsRaw = p * (vd - vs);
  const rev = vdsRaw < 0;
  const vds = rev ? -vdsRaw : vdsRaw;
  const vgs = rev ? p * (vg - vd) : p * (vg - vs);

  // Smooth softplus overdrive eliminates derivative discontinuity at Vgs = Vth
  const etaVt = 0.05;
  const z = (vgs - vth) / etaVt;
  let vov;
  let sig;
  if (z > 25) {
    vov = vgs - vth;
    sig = 1;
  } else if (z < -25) {
    vov = 0;
    sig = 0;
  } else {
    const ez = Math.exp(z);
    vov = etaVt * Math.log(1 + ez);
    sig = ez / (1 + ez);
  }

  let iCh;
  let gm;
  let gds;
  const mod = 1 + lambda * vds;

  if (vds < vov) {
    // Linear / Triode (Ohmic) region
    const base = kp * (vov * vds - 0.5 * vds * vds);
    iCh = base * mod;
    gm = kp * vds * mod * sig;
    gds = kp * (vov - vds) * mod + base * lambda;
  } else {
    // Saturation (Active) region
    const base = 0.5 * kp * vov * vov;
    iCh = base * mod;
    gm = kp * vov * mod * sig;
    gds = base * lambda;
  }

  const sign = rev ? -p : p;
  const id = sign * iCh + gmin * (vd - vs);

  // Exact partial derivatives of id (entering drain) wrt (vd, vg, vs)
  let dId_dVd;
  let dId_dVg;
  let dId_dVs;
  if (!rev) {
    dId_dVg = gm;
    dId_dVd = gds + gmin;
    dId_dVs = -(gm + gds + gmin);
  } else {
    dId_dVg = -gm;
    dId_dVs = -(gds + gmin);
    dId_dVd = gm + gds + gmin;
  }

  let region = 'CUTOFF';
  if (vgs > vth + 0.05) {
    region = vds < vov ? 'LINEAR' : 'SATURATION';
  }

  return {
    id,
    vgs: p * (vg - vs),
    vds: vdsRaw,
    gm,
    gds,
    dId_dVd,
    dId_dVg,
    dId_dVs,
    region,
  };
}

/**
 * Evaluate smooth mixed-signal CMOS Logic Gate transfer function & exact input derivatives.
 */
export function evalLogicGate(type, va, vb, comp) {
  const vdd = Math.max(1.2, Number(comp.params.vdd) || 5);
  const vMid = 0.5 * vdd;
  const k = 10;
  const rOut = 50;

  const evalSig = (v) => {
    const u = k * (v - vMid);
    if (u > 25) return { s: 1, ds: 0 };
    if (u < -25) return { s: 0, ds: 0 };
    const s = 1 / (1 + Math.exp(-u));
    return { s, ds: k * s * (1 - s) };
  };

  const A = evalSig(va);
  const B = type === 'gate_not' ? { s: 0, ds: 0 } : evalSig(vb);

  let y = 0;
  let dyA = 0;
  let dyB = 0;
  switch (type) {
    case 'gate_not':
      y = 1 - A.s;
      dyA = -A.ds;
      break;
    case 'gate_and':
      y = A.s * B.s;
      dyA = A.ds * B.s;
      dyB = A.s * B.ds;
      break;
    case 'gate_nand':
      y = 1 - A.s * B.s;
      dyA = -A.ds * B.s;
      dyB = -A.s * B.ds;
      break;
    case 'gate_or':
      y = A.s + B.s - A.s * B.s;
      dyA = A.ds * (1 - B.s);
      dyB = (1 - A.s) * B.ds;
      break;
    case 'gate_xor':
      y = A.s + B.s - 2 * A.s * B.s;
      dyA = A.ds * (1 - 2 * B.s);
      dyB = B.ds * (1 - 2 * A.s);
      break;
  }

  return {
    vTarget: vdd * y,
    gma: vdd * dyA,
    gmb: vdd * dyB,
    rOut,
    logicHigh: y >= 0.5,
  };
}

/**
 * Evaluate instantaneous voltage of a voltage source at time t.
 * Square and pulse waveforms include a realistic 0.5% edge transition to prevent
 * unphysical Dirac current spikes across capacitive loads.
 * @param {object} params
 * @param {number} t
 * @param {boolean} [isDC=false]
 */
export function evalVoltageSource(params, t, isDC = false) {
  const dc = Number(params.dc) || 0;
  const wf = params.waveform || 'dc';
  if (wf === 'dc' || isDC) {
    if (wf === 'sine') {
      // At t=0 for DC operating point, use DC offset + sin(phase) if phase != 0?
      // Standard SPICE: DC op uses dc offset (time-zero value for sine with phase=0 is also dc!).
      const phaseRad = ((Number(params.phase) || 0) * Math.PI) / 180;
      return dc + (Number(params.amplitude) || 0) * Math.sin(phaseRad);
    }
    return dc;
  }

  const amp = Number(params.amplitude) || 0;
  const freq = Math.max(1e-6, Number(params.frequency) || 1000);
  const phaseFrac = ((Number(params.phase) || 0) / 360) % 1;
  const cyc = (freq * t + phaseFrac) % 1;
  const p = cyc < 0 ? cyc + 1 : cyc;

  if (wf === 'sine') {
    return dc + amp * Math.sin(2 * Math.PI * p);
  }
  if (wf === 'triangle') {
    // Starts at 0, peaks at 0.25 (+amp), troughs at 0.75 (-amp)
    if (p < 0.25) return dc + amp * (4 * p);
    if (p < 0.75) return dc + amp * (2 - 4 * p);
    return dc + amp * (4 * p - 4);
  }
  if (wf === 'square' || wf === 'pulse') {
    const duty = Math.min(0.95, Math.max(0.05, Number(params.duty) || 0.5));
    const edge = 0.008; // 0.8% rise/fall time
    const low = wf === 'pulse' ? dc : dc - amp;
    const high = dc + amp;
    if (p < edge) {
      return low + (high - low) * (p / edge);
    }
    if (p < duty) {
      return high;
    }
    if (p < duty + edge) {
      return high - (high - low) * ((p - duty) / edge);
    }
    return low;
  }
  return dc;
}

/**
 * Helper: stamp a 2-terminal conductance g between node a and node b.
 */
function stampConductance(ws, a, b, g) {
  if (a > 0) ws.addA(a - 1, a - 1, g);
  if (b > 0) ws.addA(b - 1, b - 1, g);
  if (a > 0 && b > 0) {
    ws.addA(a - 1, b - 1, -g);
    ws.addA(b - 1, a - 1, -g);
  }
}

/**
 * Helper: stamp an independent current source flowing FROM node a TO node b (leaving a, entering b).
 */
function stampCurrent(ws, a, b, i) {
  if (a > 0) ws.addB(a - 1, -i);
  if (b > 0) ws.addB(b - 1, +i);
}

/**
 * Read voltage of node n from solution vector x (node 0 is always 0V).
 * @param {Float64Array} x
 * @param {number} n
 */
export function getNodeV(x, n) {
  return n > 0 ? x[n - 1] : 0;
}

/**
 * Create nonlinear junction state cache for pnjlim across Newton-Raphson iterations.
 * @param {object} netlist
 */
export function createNonlinearState(netlist) {
  const map = new Map();
  for (const cc of netlist.components) {
    if (cc.type === 'diode' || cc.type === 'led') {
      map.set(cc.id, { vd: 0.0 });
    } else if (cc.type === 'npn' || cc.type === 'pnp') {
      map.set(cc.id, { vbe: 0.0, vbc: 0.0 });
    } else if (cc.type === 'opamp' || isLogicGateType(cc.type)) {
      map.set(cc.id, { vTargetPrev: 0.0 });
    }
  }
  return map;
}

/**
 * Limit proposed nonlinear junction voltages using SPICE pnjlim and update cache.
 * Returns max junction/nonlinear residual delta after limiting.
 */
export function updateNonlinearState(netlist, xPrev, xCurr, nlState, useLimiting = true) {
  let maxDelta = 0;
  for (const cc of netlist.components) {
    if (cc.type === 'diode' || cc.type === 'led') {
      const st = nlState.get(cc.id);
      const va = getNodeV(xCurr, cc.pinNodes.anode);
      const vk = getNodeV(xCurr, cc.pinNodes.cathode);
      const vRaw = va - vk;
      const phys = getDiodePhysics(cc);
      const nVt = phys.n * VT;
      const vCrit = calcVCrit(phys.is, nVt);
      const vLim = useLimiting ? pnjlim(vRaw, st.vd, nVt, vCrit) : vRaw;
      maxDelta = Math.max(maxDelta, Math.abs(vRaw - st.vd));
      st.vd = vLim;
    } else if (cc.type === 'npn' || cc.type === 'pnp') {
      const st = nlState.get(cc.id);
      const s = cc.type === 'pnp' ? -1 : 1;
      const vc = getNodeV(xCurr, cc.pinNodes.c);
      const vb = getNodeV(xCurr, cc.pinNodes.b);
      const ve = getNodeV(xCurr, cc.pinNodes.e);
      const vbeRaw = s * (vb - ve);
      const vbcRaw = s * (vb - vc);
      const is = Math.max(1e-18, Number(cc.params.is) || 1e-14);
      const vCrit = calcVCrit(is, VT);
      const vbeLim = useLimiting ? pnjlim(vbeRaw, st.vbe, VT, vCrit) : vbeRaw;
      const vbcLim = useLimiting ? pnjlim(vbcRaw, st.vbc, VT, vCrit) : vbcRaw;
      // Only gate convergence on active/forward junctions where exponential current matters
      if (vbeRaw > 0.1 || st.vbe > 0.1) maxDelta = Math.max(maxDelta, Math.abs(vbeRaw - st.vbe));
      if (vbcRaw > 0.1 || st.vbc > 0.1) maxDelta = Math.max(maxDelta, Math.abs(vbcRaw - st.vbc));
      st.vbe = vbeLim;
      st.vbc = vbcLim;
    } else if (cc.type === 'opamp') {
      const st = nlState.get(cc.id);
      const vP = getNodeV(xCurr, cc.pinNodes.inPos);
      const vN = getNodeV(xCurr, cc.pinNodes.inNeg);
      const { vTarget } = evalOpAmp(vP, vN, cc);
      maxDelta = Math.max(maxDelta, Math.abs(vTarget - st.vTargetPrev));
      st.vTargetPrev = vTarget;
    } else if (isLogicGateType(cc.type)) {
      const st = nlState.get(cc.id);
      const va = getNodeV(xCurr, cc.pinNodes.a);
      const vb = cc.type === 'gate_not' ? 0 : getNodeV(xCurr, cc.pinNodes.b);
      const { vTarget } = evalLogicGate(cc.type, va, vb, cc);
      maxDelta = Math.max(maxDelta, Math.abs(vTarget - st.vTargetPrev));
      st.vTargetPrev = vTarget;
    }
  }
  return maxDelta;
}

/**
 * Stamp the complete MNA linear system A * x = b for either DC or Transient Newton-Raphson step.
 * @param {object} ws - LinearWorkspace
 * @param {object} netlist - CompiledNetlist
 * @param {Float64Array} xGuess - Current Newton iterate
 * @param {object} options
 * @param {'dc'|'transient'} options.mode
 * @param {number} [options.t=0]
 * @param {number} [options.dt=1e-5]
 * @param {'be'|'trap'} [options.integrator='trap']
 * @param {Map} [options.reactiveState] - Map<compId, { vPrev, iPrev }>
 * @param {Map} [options.nlState] - Optional pnjlim cached junction voltages
 * @param {number} [options.sourceScale=1]
 * @param {number} [options.gmin=DEFAULT_GMIN]
 */
export function stampMNA(ws, netlist, xGuess, options) {
  const {
    mode = 'dc',
    t = 0,
    dt = 1e-5,
    integrator = 'trap',
    reactiveState = null,
    nlState = null,
    sourceScale = 1,
    gmin = DEFAULT_GMIN,
  } = options;

  ws.clear();
  const nV = netlist.numVoltageNodes;

  // Tiny Gmin shunt from every active node to ground ensures non-singularity on floating islands
  for (let i = 0; i < nV; i++) {
    ws.addA(i, i, gmin);
  }

  for (const cc of netlist.components) {
    const p = cc.params;
    const nodes = cc.pinNodes;

    switch (cc.type) {
      case 'ground':
      case 'probe':
        break;

      case 'resistor': {
        const r = Math.max(1e-6, Number(p.resistance) || 1000);
        stampConductance(ws, nodes.a, nodes.b, 1 / r);
        break;
      }

      case 'potentiometer': {
        const rTotal = Math.max(1e-3, Number(p.resistance) || 10000);
        const w = Math.min(0.999, Math.max(0.001, Number(p.wiper) ?? 0.5));
        const r1 = rTotal * w;
        const r2 = rTotal * (1 - w);
        stampConductance(ws, nodes.a, nodes.wiper, 1 / r1);
        stampConductance(ws, nodes.wiper, nodes.b, 1 / r2);
        break;
      }

      case 'switch':
      case 'pushbutton': {
        const g = p.closed ? 1 / Math.max(1e-4, Number(p.rOn) || 0.05) : 1e-11;
        stampConductance(ws, nodes.a, nodes.b, g);
        break;
      }

      case 'current_source': {
        const iVal = (Number(p.current) || 0) * sourceScale;
        // Arrow points into 'out' pin (so current flows from 'in' to 'out' inside source)
        stampCurrent(ws, nodes.in, nodes.out, iVal);
        break;
      }

      case 'voltage_source': {
        const row = nV + cc.branchIdx;
        const pos = nodes.pos;
        const neg = nodes.neg;
        const vVal = evalVoltageSource(p, t, mode === 'dc') * sourceScale;

        // KCL contribution of branch current iV (defined flowing from pos -> neg inside source,
        // i.e., leaving node pos, entering node neg; wait: let's follow standard SPICE MNA:
        // +iV leaves pos, -iV leaves neg, so v(pos) - v(neg) + Rint * iV = Vs!)
        if (pos > 0) {
          ws.addA(pos - 1, row, 1);
          ws.addA(row, pos - 1, 1);
        }
        if (neg > 0) {
          ws.addA(neg - 1, row, -1);
          ws.addA(row, neg - 1, -1);
        }
        ws.addA(row, row, -VOLTAGE_SOURCE_RINT);
        ws.addB(row, vVal);
        break;
      }

      case 'capacitor': {
        const cap = Math.max(1e-15, Number(p.capacitance) || 1e-6);
        if (mode === 'dc') {
          // Open circuit in DC (tiny leakage conductance)
          stampConductance(ws, nodes.a, nodes.b, gmin);
        } else {
          const st = reactiveState?.get(cc.id) || { vPrev: Number(p.initialVoltage) || 0, iPrev: 0 };
          let gEq;
          let iEq;
          if (integrator === 'trap') {
            gEq = (2 * cap) / dt;
            iEq = gEq * st.vPrev + st.iPrev;
          } else {
            // Backward Euler
            gEq = cap / dt;
            iEq = gEq * st.vPrev;
          }
          // i_ab = gEq * v_ab - iEq  =>  stamps conductance gEq and current source iEq from b -> a
          stampConductance(ws, nodes.a, nodes.b, gEq);
          stampCurrent(ws, nodes.b, nodes.a, iEq);
        }
        break;
      }

      case 'inductor': {
        const ind = Math.max(1e-12, Number(p.inductance) || 1e-3);
        const esr = Math.max(1e-4, Number(p.seriesResistance) || 0.5);
        if (mode === 'dc') {
          // Short circuit with coil ESR in DC
          stampConductance(ws, nodes.a, nodes.b, 1 / esr);
        } else {
          const st = reactiveState?.get(cc.id) || { vPrev: 0, iPrev: 0 };
          // Combine ideal inductor companion model in series with coil ESR analytically:
          // Ideal L: v_L = (2L/dt)*(i - iPrev) - vL_prev  (Trap), v_total = v_L + esr * i
          // => v_total = (rEq) * i - vEq => i = gEq * v_total + iNorton
          let rL;
          let vHistory;
          if (integrator === 'trap') {
            rL = (2 * ind) / dt;
            // vL_prev = vPrev - esr * iPrev
            const vLPrev = st.vPrev - esr * st.iPrev;
            vHistory = rL * st.iPrev + vLPrev;
          } else {
            rL = ind / dt;
            vHistory = rL * st.iPrev;
          }
          const rTotal = rL + esr;
          const gEq = 1 / rTotal;
          const iEq = vHistory / rTotal; // current flowing a -> b
          stampConductance(ws, nodes.a, nodes.b, gEq);
          stampCurrent(ws, nodes.a, nodes.b, iEq);
        }
        break;
      }

      case 'diode':
      case 'led': {
        const na = nodes.anode;
        const nk = nodes.cathode;
        const vd = nlState?.has(cc.id)
          ? nlState.get(cc.id).vd
          : getNodeV(xGuess, na) - getNodeV(xGuess, nk);
        const { i, g } = evalDiode(vd, cc, gmin);
        // i_ak(v) ≈ g * v + (i - g * vd)
        const iEq = i - g * vd;
        stampConductance(ws, na, nk, g);
        stampCurrent(ws, na, nk, iEq);
        break;
      }

      case 'npn':
      case 'pnp': {
        const nc = nodes.c;
        const nb = nodes.b;
        const ne = nodes.e;
        let vc = getNodeV(xGuess, nc);
        let vb = getNodeV(xGuess, nb);
        let ve = getNodeV(xGuess, ne);

        if (nlState?.has(cc.id)) {
          // Reconstruct effective terminal voltages consistent with pnjlim-limited vbe & vbc
          const st = nlState.get(cc.id);
          const s = cc.type === 'pnp' ? -1 : 1;
          ve = vb - s * st.vbe;
          vc = vb - s * st.vbc;
        }

        const res = evalBJT(vc, vb, ve, cc, gmin);
        const { jac } = res;
        const terms = [
          { n: nc, iVal: res.ic, jc: jac.cc, jb: jac.cb, je: jac.ce },
          { n: nb, iVal: res.ib, jc: jac.bc, jb: jac.bb, je: jac.be },
          { n: ne, iVal: res.ie, jc: jac.ec, jb: jac.eb, je: jac.ee },
        ];

        for (const rowT of terms) {
          if (rowT.n <= 0) continue;
          const r = rowT.n - 1;
          if (nc > 0) ws.addA(r, nc - 1, rowT.jc);
          if (nb > 0) ws.addA(r, nb - 1, rowT.jb);
          if (ne > 0) ws.addA(r, ne - 1, rowT.je);

          const iEq = rowT.iVal - (rowT.jc * vc + rowT.jb * vb + rowT.je * ve);
          ws.addB(r, -iEq);
        }

        // Physical parasitic junction capacitances (Cje, Cjc) in transient mode
        // give transistors realistic switching rise times and regularize regenerative flips
        if (mode === 'transient' && reactiveState) {
          const bst = reactiveState.get(cc.id) || { vBePrev: 0, vBcPrev: 0 };
          const gBe = BJT_CJE / dt;
          const gBc = BJT_CJC / dt;
          stampConductance(ws, nb, ne, gBe);
          stampCurrent(ws, ne, nb, gBe * bst.vBePrev);
          stampConductance(ws, nb, nc, gBc);
          stampCurrent(ws, nc, nb, gBc * bst.vBcPrev);
        }
        break;
      }

      case 'opamp': {
        const nP = nodes.inPos;
        const nN = nodes.inNeg;
        const nO = nodes.out;
        const vP = getNodeV(xGuess, nP);
        const vN = getNodeV(xGuess, nN);
        const { vTarget, gm, rOut } = evalOpAmp(vP, vN, cc);
        const gOut = 1 / rOut;

        // High input impedance (10 Megohm) keeps differential inputs cleanly referenced
        stampConductance(ws, nP, nN, 1e-7);

        // Output equation (current leaving node nO into op-amp output stage):
        // I_out_in = gOut * (vO - vTarget(vP - vN))
        // Linearized: gOut * vO - (gOut * gm) * vP + (gOut * gm) * vN + I_eq
        // where I_eq = -gOut * (vTarget - gm * (vP - vN))
        if (nO > 0) {
          const r = nO - 1;
          ws.addA(r, r, gOut);
          if (nP > 0) ws.addA(r, nP - 1, -gOut * gm);
          if (nN > 0) ws.addA(r, nN - 1, +gOut * gm);
          const vConst = vTarget - gm * (vP - vN);
          ws.addB(r, gOut * vConst);
        }
        break;
      }

      case 'spdt': {
        const pos = Number(p.position) === 1 ? 1 : 0;
        const gOn = 1 / Math.max(1e-4, Number(p.rOn) || 0.05);
        const gOff = 1e-11;
        stampConductance(ws, nodes.com, nodes.a, pos === 0 ? gOn : gOff);
        stampConductance(ws, nodes.com, nodes.b, pos === 1 ? gOn : gOff);
        break;
      }

      case 'voltmeter': {
        stampConductance(ws, nodes.pos, nodes.neg, 1e-7); // 10 MOhm input impedance
        break;
      }

      case 'ammeter': {
        stampConductance(ws, nodes.pos, nodes.neg, 100); // 10 mOhm precision shunt
        break;
      }

      case 'logic_in': {
        const nO = nodes.out;
        const vHi = Number(p.vHigh) || 5;
        const vTarget = (p.state ? vHi : 0) * sourceScale;
        const gOut = 1 / 20; // 20 Ohm CMOS driver impedance
        if (nO > 0) {
          ws.addA(nO - 1, nO - 1, gOut);
          ws.addB(nO - 1, gOut * vTarget);
        }
        break;
      }

      case 'transformer': {
        const row = nV + cc.branchIdx;
        const ratio = Math.max(0.02, Number(p.ratio) || 0.5);
        const rW = Math.max(1e-4, Number(p.rWinding) || 0.1);
        const { p1, p2, s1, s2 } = nodes;

        // Tiny core/winding magnetizing bleed keeps isolated windings numerically well-conditioned
        stampConductance(ws, p1, p2, 1e-7);
        stampConductance(ws, s1, s2, 1e-7);

        // Secondary branch variable i_s enters s1, leaves s2.
        // Reflected primary current: -ratio * i_s enters p1, +ratio * i_s enters p2.
        // Voltage law: (v_s1 - v_s2) - ratio*(v_p1 - v_p2) - rW*i_s = 0
        if (s1 > 0) {
          ws.addA(s1 - 1, row, 1);
          ws.addA(row, s1 - 1, 1);
        }
        if (s2 > 0) {
          ws.addA(s2 - 1, row, -1);
          ws.addA(row, s2 - 1, -1);
        }
        if (p1 > 0) {
          ws.addA(p1 - 1, row, -ratio);
          ws.addA(row, p1 - 1, -ratio);
        }
        if (p2 > 0) {
          ws.addA(p2 - 1, row, +ratio);
          ws.addA(row, p2 - 1, +ratio);
        }
        ws.addA(row, row, -rW);
        break;
      }

      case 'nmos':
      case 'pmos': {
        const nd = nodes.d;
        const ng = nodes.g;
        const ns = nodes.s;
        const vd = getNodeV(xGuess, nd);
        const vg = getNodeV(xGuess, ng);
        const vs = getNodeV(xGuess, ns);

        const m = evalMOSFET(vd, vg, vs, cc, gmin);
        // Drain current id enters nd, leaves ns (-id enters ns)
        const iEq = m.id - (m.dId_dVd * vd + m.dId_dVg * vg + m.dId_dVs * vs);

        if (nd > 0) {
          const r = nd - 1;
          if (nd > 0) ws.addA(r, nd - 1, m.dId_dVd);
          if (ng > 0) ws.addA(r, ng - 1, m.dId_dVg);
          if (ns > 0) ws.addA(r, ns - 1, m.dId_dVs);
          ws.addB(r, -iEq);
        }
        if (ns > 0) {
          const r = ns - 1;
          if (nd > 0) ws.addA(r, nd - 1, -m.dId_dVd);
          if (ng > 0) ws.addA(r, ng - 1, -m.dId_dVg);
          if (ns > 0) ws.addA(r, ns - 1, -m.dId_dVs);
          ws.addB(r, +iEq);
        }

        // Physical gate oxide leak (1 GOhm) + parasitic gate capacitances in transient mode
        stampConductance(ws, ng, ns, gmin);
        if (mode === 'transient' && reactiveState) {
          const mst = reactiveState.get(cc.id) || { vGsPrev: 0, vGdPrev: 0 };
          const gGs = MOS_CGS / dt;
          const gGd = MOS_CGD / dt;
          stampConductance(ws, ng, ns, gGs);
          stampCurrent(ws, ns, ng, gGs * mst.vGsPrev);
          stampConductance(ws, ng, nd, gGd);
          stampCurrent(ws, nd, ng, gGd * mst.vGdPrev);
        }
        break;
      }

      case 'gate_and':
      case 'gate_or':
      case 'gate_not':
      case 'gate_nand':
      case 'gate_xor': {
        const na = nodes.a;
        const nb = cc.type === 'gate_not' ? 0 : nodes.b;
        const nO = nodes.out;
        const va = getNodeV(xGuess, na);
        const vb = cc.type === 'gate_not' ? 0 : getNodeV(xGuess, nb);

        // Weak 10 MOhm input pull-down keeps unconnected gate pins cleanly at LOW (0V)
        if (na > 0) ws.addA(na - 1, na - 1, 1e-7);
        if (nb > 0) ws.addA(nb - 1, nb - 1, 1e-7);

        const g = evalLogicGate(cc.type, va, vb, cc);
        const gOut = 1 / g.rOut;
        if (nO > 0) {
          const r = nO - 1;
          ws.addA(r, r, gOut);
          if (na > 0) ws.addA(r, na - 1, -gOut * g.gma);
          if (nb > 0) ws.addA(r, nb - 1, -gOut * g.gmb);
          const vConst = (g.vTarget - g.gma * va - g.gmb * vb) * sourceScale;
          ws.addB(r, gOut * vConst);

          // Tiny parasitic CMOS output capacitance gives realistic switching dynamics
          if (mode === 'transient' && reactiveState) {
            const gst = reactiveState.get(cc.id) || { vOutPrev: 0 };
            const gCap = GATE_COUT / dt;
            ws.addA(r, r, gCap);
            ws.addB(r, gCap * gst.vOutPrev);
          }
        }
        break;
      }
    }
  }
}

/**
 * Evaluate exact component terminal currents, voltages, power dissipation,
 * operating regions, LED luminance, and node KCL residuals after a solve.
 *
 * Pin current convention: positive current enters the component pin from the circuit node.
 * (So sum of pin currents into all components connected to any node equals 0 by KCL!)
 */
export function evaluateSolution(netlist, x, options) {
  const {
    mode = 'dc',
    t = 0,
    dt = 1e-5,
    integrator = 'trap',
    reactiveState = null,
    gmin = DEFAULT_GMIN,
  } = options;

  const numNodes = netlist.numNodes;
  const nodeVoltages = new Float64Array(numNodes);
  for (let n = 1; n < numNodes; n++) {
    nodeVoltages[n] = x[n - 1];
  }

  const kclSum = new Float64Array(numNodes);
  const compTelemetry = new Map();
  const pinCurrentsByPoint = new Map(); // pointKey -> net current injected INTO wires at that point (leaving component)
  let totalPower = 0;
  const warnings = [];

  const addPinCurrent = (compNode, ptKey, iIntoComp) => {
    kclSum[compNode] += iIntoComp;
    // Current injected INTO wire graph at ptKey is -iIntoComp (leaving component)
    pinCurrentsByPoint.set(ptKey, (pinCurrentsByPoint.get(ptKey) || 0) - iIntoComp);
  };

  for (const cc of netlist.components) {
    const p = cc.params;
    const nodes = cc.pinNodes;
    const keys = cc.pinKeys;

    switch (cc.type) {
      case 'ground':
        compTelemetry.set(cc.id, { voltage: 0, current: 0, power: 0, state: 'REF' });
        break;

      case 'probe': {
        const vp = nodeVoltages[nodes.p];
        compTelemetry.set(cc.id, { voltage: vp, current: 0, power: 0, state: 'PROBE' });
        break;
      }

      case 'resistor': {
        const va = nodeVoltages[nodes.a];
        const vb = nodeVoltages[nodes.b];
        const v = va - vb;
        const r = Math.max(1e-6, Number(p.resistance) || 1000);
        const i = v / r; // a -> b
        const power = v * i;
        const rated = Math.max(1e-3, Number(p.powerRating) || 0.25);
        const overload = power > rated;
        if (overload) {
          warnings.push({
            severity: 'warning',
            code: 'OVERLOAD',
            compId: cc.id,
            message: `${cc.designator} dissipating ${(power * 1000).toFixed(0)} mW (rated ${(rated * 1000).toFixed(0)} mW).`,
          });
        }
        addPinCurrent(nodes.a, keys.a, i);
        addPinCurrent(nodes.b, keys.b, -i);
        totalPower += Math.max(0, power);
        compTelemetry.set(cc.id, {
          voltage: v,
          current: i,
          power,
          thermalRatio: Math.min(2, power / rated),
          state: overload ? 'OVERLOAD' : 'OK',
        });
        break;
      }

      case 'potentiometer': {
        const va = nodeVoltages[nodes.a];
        const vb = nodeVoltages[nodes.b];
        const vw = nodeVoltages[nodes.wiper];
        const rTotal = Math.max(1e-3, Number(p.resistance) || 10000);
        const w = Math.min(0.999, Math.max(0.001, Number(p.wiper) ?? 0.5));
        const r1 = rTotal * w;
        const r2 = rTotal * (1 - w);
        const ia = (va - vw) / r1; // entering pin a
        const ib = (vb - vw) / r2; // entering pin b
        const iw = -(ia + ib); // entering wiper
        const power = (va - vw) * ia + (vb - vw) * ib;
        addPinCurrent(nodes.a, keys.a, ia);
        addPinCurrent(nodes.b, keys.b, ib);
        addPinCurrent(nodes.wiper, keys.wiper, iw);
        totalPower += Math.max(0, power);
        compTelemetry.set(cc.id, {
          voltage: vw,
          vSpan: va - vb,
          current: Math.abs(ia) >= Math.abs(ib) ? ia : -ib,
          iw,
          power,
          state: `${Math.round(w * 100)}%`,
        });
        break;
      }

      case 'switch':
      case 'pushbutton': {
        const va = nodeVoltages[nodes.a];
        const vb = nodeVoltages[nodes.b];
        const v = va - vb;
        const g = p.closed ? 1 / Math.max(1e-4, Number(p.rOn) || 0.05) : 1e-11;
        const i = v * g;
        addPinCurrent(nodes.a, keys.a, i);
        addPinCurrent(nodes.b, keys.b, -i);
        compTelemetry.set(cc.id, {
          voltage: v,
          current: i,
          power: v * i,
          state: p.closed ? 'CLOSED' : 'OPEN',
        });
        break;
      }

      case 'current_source': {
        const vOut = nodeVoltages[nodes.out];
        const vIn = nodeVoltages[nodes.in];
        const iVal = Number(p.current) || 0;
        addPinCurrent(nodes.in, keys.in, iVal);
        addPinCurrent(nodes.out, keys.out, -iVal);
        compTelemetry.set(cc.id, {
          voltage: vOut - vIn,
          current: iVal,
          power: (vIn - vOut) * iVal,
          state: 'SOURCE',
        });
        break;
      }

      case 'voltage_source': {
        const vPos = nodeVoltages[nodes.pos];
        const vNeg = nodeVoltages[nodes.neg];
        const iBranch = x[netlist.numVoltageNodes + cc.branchIdx]; // flows pos -> neg inside source
        const iSupplied = -iBranch; // conventional current delivered OUT of pos terminal
        addPinCurrent(nodes.pos, keys.pos, iBranch);
        addPinCurrent(nodes.neg, keys.neg, -iBranch);
        const vTerm = vPos - vNeg;
        const shortCircuit = Math.abs(iSupplied) > 50;
        if (shortCircuit) {
          warnings.push({
            severity: 'error',
            code: 'SHORT_CIRCUIT',
            compId: cc.id,
            message: `${cc.designator} overcurrent (${iSupplied.toFixed(1)} A) - possible short circuit!`,
          });
        }
        compTelemetry.set(cc.id, {
          voltage: vTerm,
          current: iSupplied,
          power: -vTerm * iSupplied, // negative means supplying power
          state: shortCircuit ? 'SHORT!' : (p.waveform || 'dc').toUpperCase(),
        });
        break;
      }

      case 'capacitor': {
        const va = nodeVoltages[nodes.a];
        const vb = nodeVoltages[nodes.b];
        const v = va - vb;
        const cap = Math.max(1e-15, Number(p.capacitance) || 1e-6);
        let i = gmin * v;
        if (mode === 'transient' && reactiveState) {
          const st = reactiveState.get(cc.id) || { vPrev: 0, iPrev: 0 };
          if (integrator === 'trap') {
            i = ((2 * cap) / dt) * (v - st.vPrev) - st.iPrev;
          } else {
            i = (cap / dt) * (v - st.vPrev);
          }
        }
        addPinCurrent(nodes.a, keys.a, i);
        addPinCurrent(nodes.b, keys.b, -i);
        const energy = 0.5 * cap * v * v;
        compTelemetry.set(cc.id, {
          voltage: v,
          current: i,
          power: v * i,
          energy,
          state: Math.abs(i) < 1e-7 ? 'CHARGED' : i * v > 0 ? 'CHARGING' : 'DISCHARGING',
        });
        break;
      }

      case 'inductor': {
        const va = nodeVoltages[nodes.a];
        const vb = nodeVoltages[nodes.b];
        const v = va - vb;
        const ind = Math.max(1e-12, Number(p.inductance) || 1e-3);
        const esr = Math.max(1e-4, Number(p.seriesResistance) || 0.5);
        let i;
        if (mode === 'dc') {
          i = v / esr;
        } else {
          const st = reactiveState?.get(cc.id) || { vPrev: 0, iPrev: 0 };
          if (integrator === 'trap') {
            const rL = (2 * ind) / dt;
            const vLPrev = st.vPrev - esr * st.iPrev;
            i = (v + rL * st.iPrev + vLPrev) / (rL + esr);
          } else {
            const rL = ind / dt;
            i = (v + rL * st.iPrev) / (rL + esr);
          }
        }
        addPinCurrent(nodes.a, keys.a, i);
        addPinCurrent(nodes.b, keys.b, -i);
        const energy = 0.5 * ind * i * i;
        compTelemetry.set(cc.id, {
          voltage: v,
          current: i,
          power: v * i,
          energy,
          state: Math.abs(i) > 1e-5 ? 'ENERGIZED' : 'IDLE',
        });
        break;
      }

      case 'diode':
      case 'led': {
        const va = nodeVoltages[nodes.anode];
        const vk = nodeVoltages[nodes.cathode];
        const vd = va - vk;
        const { i, region } = evalDiode(vd, cc, gmin);
        addPinCurrent(nodes.anode, keys.anode, i);
        addPinCurrent(nodes.cathode, keys.cathode, -i);
        const power = Math.max(0, vd * i);
        totalPower += power;
        let brightness = 0;
        if (cc.type === 'led' && i > 1e-5) {
          const nom = Math.max(1e-3, Number(p.nominalCurrent) || 0.015);
          // Perceptual gamma curve so faint 0.5 mA glow is visible and saturates smoothly near 1.5x rated
          brightness = Math.min(1.25, Math.pow(i / nom, 0.55));
        }
        compTelemetry.set(cc.id, {
          voltage: vd,
          current: i,
          power,
          brightness,
          state: cc.type === 'led' ? (brightness > 0.05 ? 'LIT' : 'OFF') : region,
        });
        break;
      }

      case 'npn':
      case 'pnp': {
        const vc = nodeVoltages[nodes.c];
        const vb = nodeVoltages[nodes.b];
        const ve = nodeVoltages[nodes.e];
        const res = evalBJT(vc, vb, ve, cc, gmin);
        let iCbe = 0;
        let iCbc = 0;
        if (mode === 'transient' && reactiveState) {
          const bst = reactiveState.get(cc.id) || { vBePrev: 0, vBcPrev: 0 };
          iCbe = (BJT_CJE / dt) * ((vb - ve) - bst.vBePrev);
          iCbc = (BJT_CJC / dt) * ((vb - vc) - bst.vBcPrev);
        }
        const icTot = res.ic - iCbc;
        const ibTot = res.ib + iCbe + iCbc;
        const ieTot = res.ie - iCbe;
        addPinCurrent(nodes.c, keys.c, icTot);
        addPinCurrent(nodes.b, keys.b, ibTot);
        addPinCurrent(nodes.e, keys.e, ieTot);
        const power = Math.max(0, (vc - ve) * res.ic + (vb - ve) * res.ib);
        totalPower += power;
        compTelemetry.set(cc.id, {
          voltage: vc - ve,
          vbe: res.vbe,
          vce: cc.type === 'pnp' ? ve - vc : vc - ve,
          current: icTot,
          ic: icTot,
          ib: ibTot,
          ie: ieTot,
          power,
          state: res.region,
        });
        break;
      }

      case 'opamp': {
        const vP = nodeVoltages[nodes.inPos];
        const vN = nodeVoltages[nodes.inNeg];
        const vO = nodeVoltages[nodes.out];
        const { vTarget, rOut, vd, region } = evalOpAmp(vP, vN, cc);
        const iIn = (vP - vN) * 1e-7;
        const iOutIntoAmp = (vO - vTarget) / rOut;
        addPinCurrent(nodes.inPos, keys.inPos, iIn);
        addPinCurrent(nodes.inNeg, keys.inNeg, -iIn);
        addPinCurrent(nodes.out, keys.out, iOutIntoAmp);
        compTelemetry.set(cc.id, {
          voltage: vO,
          vd,
          current: -iOutIntoAmp,
          power: Math.abs((vO - vTarget) * iOutIntoAmp),
          state: region,
        });
        break;
      }

      case 'spdt': {
        const pos = Number(p.position) === 1 ? 1 : 0;
        const gOn = 1 / Math.max(1e-4, Number(p.rOn) || 0.05);
        const gOff = 1e-11;
        const vc = nodeVoltages[nodes.com];
        const va = nodeVoltages[nodes.a];
        const vb = nodeVoltages[nodes.b];
        const ia = (vc - va) * (pos === 0 ? gOn : gOff);
        const ib = (vc - vb) * (pos === 1 ? gOn : gOff);
        addPinCurrent(nodes.com, keys.com, ia + ib);
        addPinCurrent(nodes.a, keys.a, -ia);
        addPinCurrent(nodes.b, keys.b, -ib);
        compTelemetry.set(cc.id, {
          voltage: pos === 0 ? vc - va : vc - vb,
          current: pos === 0 ? ia : ib,
          power: Math.abs((vc - va) * ia) + Math.abs((vc - vb) * ib),
          state: pos === 0 ? 'POS A' : 'POS B',
        });
        break;
      }

      case 'voltmeter': {
        const v = nodeVoltages[nodes.pos] - nodeVoltages[nodes.neg];
        const i = v * 1e-7;
        addPinCurrent(nodes.pos, keys.pos, i);
        addPinCurrent(nodes.neg, keys.neg, -i);
        compTelemetry.set(cc.id, { voltage: v, current: i, power: 0, state: 'METER' });
        break;
      }

      case 'ammeter': {
        const v = nodeVoltages[nodes.pos] - nodeVoltages[nodes.neg];
        const i = v * 100;
        addPinCurrent(nodes.pos, keys.pos, i);
        addPinCurrent(nodes.neg, keys.neg, -i);
        compTelemetry.set(cc.id, { voltage: v, current: i, power: Math.abs(v * i), state: 'METER' });
        break;
      }

      case 'logic_in': {
        const vO = nodeVoltages[nodes.out];
        const vTarget = p.state ? Number(p.vHigh) || 5 : 0;
        const iInto = (vO - vTarget) / 20;
        addPinCurrent(nodes.out, keys.out, iInto);
        compTelemetry.set(cc.id, {
          voltage: vO,
          current: -iInto,
          power: Math.abs((vO - vTarget) * iInto),
          state: p.state ? 'HIGH' : 'LOW',
        });
        break;
      }

      case 'transformer': {
        const ratio = Math.max(0.02, Number(p.ratio) || 0.5);
        const vp = nodeVoltages[nodes.p1] - nodeVoltages[nodes.p2];
        const vs = nodeVoltages[nodes.s1] - nodeVoltages[nodes.s2];
        const iSec = x[netlist.numVoltageNodes + cc.branchIdx];
        const iMagP = vp * 1e-7;
        const iMagS = vs * 1e-7;
        const iP1 = -ratio * iSec + iMagP;
        const iS1 = iSec + iMagS;
        addPinCurrent(nodes.p1, keys.p1, iP1);
        addPinCurrent(nodes.p2, keys.p2, -iP1);
        addPinCurrent(nodes.s1, keys.s1, iS1);
        addPinCurrent(nodes.s2, keys.s2, -iS1);
        compTelemetry.set(cc.id, {
          voltage: vs,
          vPrimary: vp,
          current: -iSec,
          power: Math.abs(vs * iSec),
          state: `1:${ratio}`,
        });
        break;
      }

      case 'nmos':
      case 'pmos': {
        const vd = nodeVoltages[nodes.d];
        const vg = nodeVoltages[nodes.g];
        const vs = nodeVoltages[nodes.s];
        const m = evalMOSFET(vd, vg, vs, cc, gmin);
        let iCgs = gmin * (vg - vs);
        let iCgd = 0;
        if (mode === 'transient' && reactiveState) {
          const mst = reactiveState.get(cc.id) || { vGsPrev: 0, vGdPrev: 0 };
          iCgs += (MOS_CGS / dt) * ((vg - vs) - mst.vGsPrev);
          iCgd += (MOS_CGD / dt) * ((vg - vd) - mst.vGdPrev);
        }
        const idTot = m.id - iCgd;
        const igTot = iCgs + iCgd;
        const isTot = -m.id - iCgs;
        addPinCurrent(nodes.d, keys.d, idTot);
        addPinCurrent(nodes.g, keys.g, igTot);
        addPinCurrent(nodes.s, keys.s, isTot);
        const power = Math.max(0, (vd - vs) * m.id);
        totalPower += power;
        compTelemetry.set(cc.id, {
          voltage: m.vds,
          vgs: m.vgs,
          vds: m.vds,
          current: idTot,
          power,
          state: m.region,
        });
        break;
      }

      case 'gate_and':
      case 'gate_or':
      case 'gate_not':
      case 'gate_nand':
      case 'gate_xor': {
        const va = nodeVoltages[nodes.a];
        const vb = cc.type === 'gate_not' ? 0 : nodeVoltages[nodes.b];
        const vO = nodeVoltages[nodes.out];
        const g = evalLogicGate(cc.type, va, vb, cc);
        const iInA = va * 1e-7;
        const iInB = cc.type === 'gate_not' ? 0 : vb * 1e-7;
        let iOutInto = (vO - g.vTarget) / g.rOut;
        if (mode === 'transient' && reactiveState) {
          const gst = reactiveState.get(cc.id) || { vOutPrev: 0 };
          iOutInto += (GATE_COUT / dt) * (vO - gst.vOutPrev);
        }
        addPinCurrent(nodes.a, keys.a, iInA);
        if (cc.type !== 'gate_not') addPinCurrent(nodes.b, keys.b, iInB);
        addPinCurrent(nodes.out, keys.out, iOutInto);
        compTelemetry.set(cc.id, {
          voltage: vO,
          current: -iOutInto,
          power: Math.abs((vO - g.vTarget) * iOutInto),
          logicHigh: g.logicHigh,
          state: g.logicHigh ? 'HIGH' : 'LOW',
        });
        break;
      }
    }
  }

  // Account for Gmin node shunts when computing true numerical KCL residual
  let maxKclResidual = 0;
  for (let n = 1; n < numNodes; n++) {
    const residual = Math.abs(kclSum[n] + gmin * nodeVoltages[n]);
    if (residual > maxKclResidual) maxKclResidual = residual;
  }

  return {
    nodeVoltages,
    compTelemetry,
    pinCurrentsByPoint,
    maxKclResidual,
    totalPower,
    warnings,
  };
}
