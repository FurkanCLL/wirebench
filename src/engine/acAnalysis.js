/**
 * Linearized Complex Small-Signal AC Frequency Sweep (Bode Plot Engine).
 * 1. Computes exact DC operating point to linearize nonlinear elements (Diodes, BJTs, Op-Amps).
 * 2. Solves complex MNA system (G + j*w*C) * X(jw) = B(jw) across a logarithmic frequency sweep.
 * 3. Extracts Magnitude (dB), continuous unwrapped Phase (deg), -3 dB cutoffs, and resonant peaks.
 */

import { isLogicGateType } from './components.js';
import { ComplexWorkspace } from './matrix.js';
import { solveDCOperatingPoint } from './dcAnalysis.js';
import {
  DEFAULT_GMIN,
  VOLTAGE_SOURCE_RINT,
  evalBJT,
  evalDiode,
  evalLogicGate,
  evalMOSFET,
  evalOpAmp,
  getNodeV,
} from './mna.js';

function stampComplexConductance(cws, a, b, re, im = 0) {
  if (a > 0) cws.addA(a - 1, a - 1, re, im);
  if (b > 0) cws.addA(b - 1, b - 1, re, im);
  if (a > 0 && b > 0) {
    cws.addA(a - 1, b - 1, -re, -im);
    cws.addA(b - 1, a - 1, -re, -im);
  }
}

/**
 * Pick the best default AC excitation voltage source in a netlist.
 */
export function selectDefaultACSource(netlist) {
  const sources = netlist.components.filter((c) => c.type === 'voltage_source');
  if (sources.length === 0) return null;
  // Prefer an explicit AC waveform source first
  const acWave = sources.find((s) => s.params.waveform && s.params.waveform !== 'dc');
  if (acWave) return acWave.id;
  // Next prefer one with acMag > 0
  const withAc = sources.find((s) => Number(s.params.acMag) > 0);
  return (withAc || sources[0]).id;
}

/**
 * Run a full AC Small-Signal frequency sweep.
 * @param {object} netlist - CompiledNetlist
 * @param {object} [options]
 * @param {number} [options.fStart=1]
 * @param {number} [options.fStop=1e6]
 * @param {number} [options.points=180]
 * @param {string|null} [options.sourceId=null] - Excitation voltage source component ID
 * @param {number|null} [options.outputNode=null] - Specific node ID to measure (defaults to last probe or non-source node)
 */
export function runACSweep(netlist, options = {}) {
  const fStart = Math.max(1e-3, options.fStart ?? 1);
  const fStop = Math.max(fStart * 10, options.fStop ?? 1e6);
  const points = Math.max(16, Math.min(600, options.points ?? 180));

  const sourceId = options.sourceId || selectDefaultACSource(netlist);
  if (!sourceId || netlist.matrixSize === 0) {
    return {
      ok: false,
      reason: 'No voltage source available for AC excitation.',
      frequencies: [],
      channels: [],
    };
  }

  // 1. Solve DC Operating Point for accurate small-signal linearization
  const dc = solveDCOperatingPoint(netlist);
  const xDC = dc.x;

  // Precompute linearized small-signal conductances for nonlinear devices at DC bias
  const nlLinear = new Map();
  for (const cc of netlist.components) {
    if (cc.type === 'diode' || cc.type === 'led') {
      const vd = getNodeV(xDC, cc.pinNodes.anode) - getNodeV(xDC, cc.pinNodes.cathode);
      nlLinear.set(cc.id, evalDiode(vd, cc, DEFAULT_GMIN).g);
    } else if (cc.type === 'npn' || cc.type === 'pnp') {
      const vc = getNodeV(xDC, cc.pinNodes.c);
      const vb = getNodeV(xDC, cc.pinNodes.b);
      const ve = getNodeV(xDC, cc.pinNodes.e);
      nlLinear.set(cc.id, evalBJT(vc, vb, ve, cc, DEFAULT_GMIN).jac);
    } else if (cc.type === 'opamp') {
      const vP = getNodeV(xDC, cc.pinNodes.inPos);
      const vN = getNodeV(xDC, cc.pinNodes.inNeg);
      const oa = evalOpAmp(vP, vN, cc);
      nlLinear.set(cc.id, { gm: oa.gm, rOut: oa.rOut });
    } else if (cc.type === 'nmos' || cc.type === 'pmos') {
      const vd = getNodeV(xDC, cc.pinNodes.d);
      const vg = getNodeV(xDC, cc.pinNodes.g);
      const vs = getNodeV(xDC, cc.pinNodes.s);
      nlLinear.set(cc.id, evalMOSFET(vd, vg, vs, cc, DEFAULT_GMIN));
    } else if (isLogicGateType(cc.type)) {
      const va = getNodeV(xDC, cc.pinNodes.a);
      const vb = cc.type === 'gate_not' ? 0 : getNodeV(xDC, cc.pinNodes.b);
      nlLinear.set(cc.id, evalLogicGate(cc.type, va, vb, cc));
    }
  }

  // Decide which output nodes to track
  const trackedNodes = [];
  if (options.outputNode && options.outputNode > 0) {
    trackedNodes.push({
      node: options.outputNode,
      channel: 1,
      label: netlist.nodeNames[options.outputNode] || `N${options.outputNode}`,
    });
  } else if (netlist.probes.length > 0) {
    for (const pr of netlist.probes) {
      if (pr.node > 0) {
        trackedNodes.push({ node: pr.node, channel: pr.channel, label: pr.label || `CH${pr.channel}` });
      }
    }
  } else {
    for (let n = 1; n < netlist.numNodes && trackedNodes.length < 4; n++) {
      trackedNodes.push({ node: n, channel: trackedNodes.length + 1, label: `N${n}` });
    }
  }

  const cws = new ComplexWorkspace(netlist.matrixSize);
  const nV = netlist.numVoltageNodes;
  const logStart = Math.log10(fStart);
  const logStop = Math.log10(fStop);

  const frequencies = new Float64Array(points);
  const traces = trackedNodes.map((t) => ({
    ...t,
    magDb: new Float64Array(points),
    magLin: new Float64Array(points),
    phaseDeg: new Float64Array(points),
  }));

  for (let idx = 0; idx < points; idx++) {
    const frac = idx / (points - 1);
    const freq = Math.pow(10, logStart + frac * (logStop - logStart));
    const omega = 2 * Math.PI * freq;
    frequencies[idx] = freq;

    cws.clear();
    for (let i = 0; i < nV; i++) {
      cws.addA(i, i, DEFAULT_GMIN, 0);
    }

    for (const cc of netlist.components) {
      const p = cc.params;
      const nodes = cc.pinNodes;

      switch (cc.type) {
        case 'ground':
        case 'probe':
        case 'current_source': // DC independent current sources are open in AC small-signal
          break;

        case 'resistor': {
          const r = Math.max(1e-6, Number(p.resistance) || 1000);
          stampComplexConductance(cws, nodes.a, nodes.b, 1 / r, 0);
          break;
        }

        case 'potentiometer': {
          const rTotal = Math.max(1e-3, Number(p.resistance) || 10000);
          const w = Math.min(0.999, Math.max(0.001, Number(p.wiper) ?? 0.5));
          stampComplexConductance(cws, nodes.a, nodes.wiper, 1 / (rTotal * w), 0);
          stampComplexConductance(cws, nodes.wiper, nodes.b, 1 / (rTotal * (1 - w)), 0);
          break;
        }

        case 'switch':
        case 'pushbutton': {
          const g = p.closed ? 1 / Math.max(1e-4, Number(p.rOn) || 0.05) : 1e-11;
          stampComplexConductance(cws, nodes.a, nodes.b, g, 0);
          break;
        }

        case 'capacitor': {
          const cap = Math.max(1e-15, Number(p.capacitance) || 1e-6);
          stampComplexConductance(cws, nodes.a, nodes.b, 0, omega * cap);
          break;
        }

        case 'inductor': {
          const ind = Math.max(1e-12, Number(p.inductance) || 1e-3);
          const esr = Math.max(1e-4, Number(p.seriesResistance) || 0.5);
          const xL = omega * ind;
          const denom = esr * esr + xL * xL;
          stampComplexConductance(cws, nodes.a, nodes.b, esr / denom, -xL / denom);
          break;
        }

        case 'voltage_source': {
          const row = nV + cc.branchIdx;
          const pos = nodes.pos;
          const neg = nodes.neg;
          if (pos > 0) {
            cws.addA(pos - 1, row, 1, 0);
            cws.addA(row, pos - 1, 1, 0);
          }
          if (neg > 0) {
            cws.addA(neg - 1, row, -1, 0);
            cws.addA(row, neg - 1, -1, 0);
          }
          cws.addA(row, row, -VOLTAGE_SOURCE_RINT, 0);
          if (cc.id === sourceId) {
            const acMag = Number(p.acMag) > 0 ? Number(p.acMag) : 1;
            cws.addB(row, acMag, 0);
          }
          break;
        }

        case 'diode':
        case 'led': {
          const g = nlLinear.get(cc.id) || DEFAULT_GMIN;
          stampComplexConductance(cws, nodes.anode, nodes.cathode, g, 0);
          break;
        }

        case 'npn':
        case 'pnp': {
          const jac = nlLinear.get(cc.id);
          if (!jac) break;
          const nc = nodes.c;
          const nb = nodes.b;
          const ne = nodes.e;
          const stampRow = (nRow, jc, jb, je) => {
            if (nRow <= 0) return;
            const r = nRow - 1;
            if (nc > 0) cws.addA(r, nc - 1, jc, 0);
            if (nb > 0) cws.addA(r, nb - 1, jb, 0);
            if (ne > 0) cws.addA(r, ne - 1, je, 0);
          };
          stampRow(nc, jac.cc, jac.cb, jac.ce);
          stampRow(nb, jac.bc, jac.bb, jac.be);
          stampRow(ne, jac.ec, jac.eb, jac.ee);
          break;
        }

        case 'opamp': {
          const oa = nlLinear.get(cc.id);
          if (!oa) break;
          const nP = nodes.inPos;
          const nN = nodes.inNeg;
          const nO = nodes.out;
          stampComplexConductance(cws, nP, nN, 1e-7, 0);
          if (nO > 0) {
            const gOut = 1 / oa.rOut;
            const r = nO - 1;
            cws.addA(r, r, gOut, 0);
            if (nP > 0) cws.addA(r, nP - 1, -gOut * oa.gm, 0);
            if (nN > 0) cws.addA(r, nN - 1, +gOut * oa.gm, 0);
          }
          break;
        }

        case 'spdt': {
          const pos = Number(p.position) === 1 ? 1 : 0;
          const gOn = 1 / Math.max(1e-4, Number(p.rOn) || 0.05);
          stampComplexConductance(cws, nodes.com, nodes.a, pos === 0 ? gOn : 1e-11, 0);
          stampComplexConductance(cws, nodes.com, nodes.b, pos === 1 ? gOn : 1e-11, 0);
          break;
        }

        case 'voltmeter':
          stampComplexConductance(cws, nodes.pos, nodes.neg, 1e-7, 0);
          break;

        case 'ammeter':
          stampComplexConductance(cws, nodes.pos, nodes.neg, 100, 0);
          break;

        case 'logic_in':
          if (nodes.out > 0) cws.addA(nodes.out - 1, nodes.out - 1, 1 / 20, 0);
          break;

        case 'transformer': {
          const row = nV + cc.branchIdx;
          const ratio = Math.max(0.02, Number(p.ratio) || 0.5);
          const rW = Math.max(1e-4, Number(p.rWinding) || 0.1);
          const { p1, p2, s1, s2 } = nodes;
          stampComplexConductance(cws, p1, p2, 1e-7, 0);
          stampComplexConductance(cws, s1, s2, 1e-7, 0);
          if (s1 > 0) { cws.addA(s1 - 1, row, 1, 0); cws.addA(row, s1 - 1, 1, 0); }
          if (s2 > 0) { cws.addA(s2 - 1, row, -1, 0); cws.addA(row, s2 - 1, -1, 0); }
          if (p1 > 0) { cws.addA(p1 - 1, row, -ratio, 0); cws.addA(row, p1 - 1, -ratio, 0); }
          if (p2 > 0) { cws.addA(p2 - 1, row, +ratio, 0); cws.addA(row, p2 - 1, +ratio, 0); }
          cws.addA(row, row, -rW, 0);
          break;
        }

        case 'nmos':
        case 'pmos': {
          const m = nlLinear.get(cc.id);
          if (!m) break;
          const nd = nodes.d, ng = nodes.g, ns = nodes.s;
          if (nd > 0) {
            const r = nd - 1;
            cws.addA(r, nd - 1, m.dId_dVd, 0);
            if (ng > 0) cws.addA(r, ng - 1, m.dId_dVg, 0);
            if (ns > 0) cws.addA(r, ns - 1, m.dId_dVs, 0);
          }
          if (ns > 0) {
            const r = ns - 1;
            if (nd > 0) cws.addA(r, nd - 1, -m.dId_dVd, 0);
            if (ng > 0) cws.addA(r, ng - 1, -m.dId_dVg, 0);
            cws.addA(r, ns - 1, -m.dId_dVs, 0);
          }
          break;
        }

        case 'gate_and':
        case 'gate_or':
        case 'gate_not':
        case 'gate_nand':
        case 'gate_xor': {
          const g = nlLinear.get(cc.id);
          if (!g) break;
          const na = nodes.a;
          const nb = cc.type === 'gate_not' ? 0 : nodes.b;
          const nO = nodes.out;
          if (na > 0) cws.addA(na - 1, na - 1, 1e-7, 0);
          if (nb > 0) cws.addA(nb - 1, nb - 1, 1e-7, 0);
          if (nO > 0) {
            const gOut = 1 / g.rOut;
            const r = nO - 1;
            cws.addA(r, r, gOut, 0);
            if (na > 0) cws.addA(r, na - 1, -gOut * g.gma, 0);
            if (nb > 0) cws.addA(r, nb - 1, -gOut * g.gmb, 0);
          }
          break;
        }
      }
    }

    const ok = cws.solve();
    for (const tr of traces) {
      if (!ok || tr.node <= 0) {
        tr.magLin[idx] = 0;
        tr.magDb[idx] = -120;
        tr.phaseDeg[idx] = 0;
        continue;
      }
      const re = cws.xre[tr.node - 1];
      const im = cws.xim[tr.node - 1];
      const mag = Math.hypot(re, im);
      tr.magLin[idx] = mag;
      tr.magDb[idx] = mag > 1e-9 ? 20 * Math.log10(mag) : -180;
      tr.phaseDeg[idx] = (Math.atan2(im, re) * 180) / Math.PI;
    }
  }

  // Unwrap phase smoothly and analyze passband, -3 dB cutoffs, and resonant peaks per channel
  for (const tr of traces) {
    for (let i = 1; i < points; i++) {
      let diff = tr.phaseDeg[i] - tr.phaseDeg[i - 1];
      while (diff > 180) {
        tr.phaseDeg[i] -= 360;
        diff -= 360;
      }
      while (diff < -180) {
        tr.phaseDeg[i] += 360;
        diff += 360;
      }
    }

    let maxDb = -Infinity;
    let peakIdx = 0;
    for (let i = 0; i < points; i++) {
      if (tr.magDb[i] > maxDb) {
        maxDb = tr.magDb[i];
        peakIdx = i;
      }
    }

    // Reference level for -3 dB bandwidth: if passband is flat at low or high end, use maxDb
    // (or DC gain if peak is resonant overshoot? Using maxDb - 3 dB is universal for both flat & bandpass!)
    const targetDb = maxDb - 3.0103;
    const cutoffs = [];
    for (let i = 0; i < points - 1; i++) {
      const a = tr.magDb[i] - targetDb;
      const b = tr.magDb[i + 1] - targetDb;
      if ((a >= 0 && b < 0) || (a < 0 && b >= 0)) {
        const frac = a / (a - b);
        const logF = Math.log10(frequencies[i]) + frac * (Math.log10(frequencies[i + 1]) - Math.log10(frequencies[i]));
        cutoffs.push({
          freq: Math.pow(10, logF),
          kind: a >= 0 ? 'high-cut' : 'low-cut',
          db: targetDb,
        });
      }
    }

    tr.metrics = {
      dcGainDb: tr.magDb[0],
      peakGainDb: maxDb,
      peakFreq: frequencies[peakIdx],
      hasResonantPeak: peakIdx > 2 && peakIdx < points - 3 && maxDb > Math.max(tr.magDb[0], tr.magDb[points - 1]) + 0.5,
      cutoffs,
    };
  }

  return {
    ok: true,
    sourceId,
    dcConverged: dc.converged,
    fStart,
    fStop,
    frequencies,
    channels: traces,
  };
}
