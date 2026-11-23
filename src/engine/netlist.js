/**
 * Schematic-to-Electrical-Netlist Compiler.
 * - Splits wires cleanly at T-junctions (where pins or wire endpoints land on a wire interior).
 * - Resolves connected electrical nets via Disjoint-Set (Union-Find).
 * - Assigns Ground components to Node 0 (or elects a virtual reference with warning).
 * - Produces exact junction dot locations and per-net wire graphs for segment current animation.
 */

import { getComponentPins, isLogicGateType } from './components.js';

/**
 * @param {number} gx
 * @param {number} gy
 * @returns {string}
 */
export function pointKey(gx, gy) {
  return `${Math.round(gx)},${Math.round(gy)}`;
}

/**
 * Check whether integer point (px, py) lies strictly between endpoints (x1, y1) and (x2, y2).
 */
function isStrictlyOnSegment(px, py, x1, y1, x2, y2) {
  if ((px === x1 && py === y1) || (px === x2 && py === y2)) return false;
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  if (px < minX || px > maxX || py < minY || py > maxY) return false;
  // Exact integer cross product == 0 guarantees collinearity
  const cross = (px - x1) * (y2 - y1) - (py - y1) * (x2 - x1);
  return cross === 0;
}

class UnionFind {
  constructor() {
    this.parent = new Map();
  }
  add(k) {
    if (!this.parent.has(k)) this.parent.set(k, k);
  }
  find(k) {
    this.add(k);
    let root = k;
    while (this.parent.get(root) !== root) {
      root = this.parent.get(root);
    }
    let cur = k;
    while (cur !== root) {
      const next = this.parent.get(cur);
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }
  union(a, b) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

/**
 * Compile a schematic { components, wires } into a ready-to-solve CompiledNetlist.
 * @param {{ components: Array<object>, wires: Array<object> }} schematic
 */
export function compileNetlist(schematic) {
  const components = schematic.components || [];
  const rawWires = schematic.wires || [];
  const diagnostics = [];

  // 1. Collect all candidate split points (all wire endpoints + all component pins)
  const candidatePoints = new Map(); // key -> { gx, gy }
  const registerPt = (gx, gy) => {
    const rx = Math.round(gx);
    const ry = Math.round(gy);
    const k = `${rx},${ry}`;
    if (!candidatePoints.has(k)) candidatePoints.set(k, { gx: rx, gy: ry });
    return k;
  };

  const compPinList = new Map(); // comp.id -> pins[]
  for (const comp of components) {
    const pins = getComponentPins(comp);
    compPinList.set(comp.id, pins);
    for (const p of pins) {
      registerPt(p.gx, p.gy);
    }
  }

  for (const w of rawWires) {
    if (w.x1 === w.x2 && w.y1 === w.y2) continue;
    registerPt(w.x1, w.y1);
    registerPt(w.x2, w.y2);
  }

  // 2. Split wire segments at any interior pin or wire endpoint (T-junctions)
  const splitSegments = [];
  const seenSeg = new Set();

  for (const w of rawWires) {
    const x1 = Math.round(w.x1);
    const y1 = Math.round(w.y1);
    const x2 = Math.round(w.x2);
    const y2 = Math.round(w.y2);
    if (x1 === x2 && y1 === y2) continue;

    const interior = [];
    for (const pt of candidatePoints.values()) {
      if (isStrictlyOnSegment(pt.gx, pt.gy, x1, y1, x2, y2)) {
        interior.push(pt);
      }
    }

    const pts = [{ gx: x1, gy: y1 }, ...interior, { gx: x2, gy: y2 }];
    // Sort along wire direction
    const dx = x2 - x1;
    const dy = y2 - y1;
    pts.sort((a, b) => (a.gx - x1) * dx + (a.gy - y1) * dy - ((b.gx - x1) * dx + (b.gy - y1) * dy));

    for (let i = 0; i < pts.length - 1; i++) {
      const pA = pts[i];
      const pB = pts[i + 1];
      if (pA.gx === pB.gx && pA.gy === pB.gy) continue;
      const kA = pointKey(pA.gx, pA.gy);
      const kB = pointKey(pB.gx, pB.gy);
      const segKey = kA < kB ? `${kA}|${kB}` : `${kB}|${kA}`;
      if (seenSeg.has(segKey)) continue;
      seenSeg.add(segKey);
      splitSegments.push({
        wireId: w.id,
        x1: pA.gx,
        y1: pA.gy,
        x2: pB.gx,
        y2: pB.gy,
        k1: kA,
        k2: kB,
      });
    }
  }

  // 3. Build Union-Find connectivity over wire segments & count vertex degree for junction dots
  const uf = new UnionFind();
  const vertexDegree = new Map(); // pointKey -> number of incident wire sub-segments + component pins
  const incDeg = (k) => vertexDegree.set(k, (vertexDegree.get(k) || 0) + 1);

  for (const ptKey of candidatePoints.keys()) {
    uf.add(ptKey);
  }

  for (const seg of splitSegments) {
    uf.union(seg.k1, seg.k2);
    incDeg(seg.k1);
    incDeg(seg.k2);
  }

  // Every component pin contributes 1 to visual/topological degree at its point
  const pinCountAtPoint = new Map();
  for (const comp of components) {
    const pins = compPinList.get(comp.id);
    for (const p of pins) {
      const k = pointKey(p.gx, p.gy);
      uf.add(k);
      incDeg(k);
      pinCountAtPoint.set(k, (pinCountAtPoint.get(k) || 0) + 1);
    }
  }

  // 4. Identify Ground roots
  const groundRoots = new Set();
  for (const comp of components) {
    if (comp.type === 'ground') {
      const pins = compPinList.get(comp.id);
      for (const p of pins) {
        groundRoots.add(uf.find(pointKey(p.gx, p.gy)));
      }
    }
  }

  const hasImplicitGroundRef = components.some((c) => c.type === 'logic_in' || isLogicGateType(c.type));
  let hasExplicitGround = groundRoots.size > 0;
  if (!hasExplicitGround && !hasImplicitGroundRef && components.length > 0) {
    // Elect fallback reference: negative pin of first voltage source, else highest-degree point
    let fallbackKey = null;
    for (const comp of components) {
      if (comp.type === 'voltage_source' || comp.type === 'current_source') {
        const pins = compPinList.get(comp.id);
        const neg = pins[1] || pins[0];
        if (neg) {
          fallbackKey = pointKey(neg.gx, neg.gy);
          break;
        }
      }
    }
    if (!fallbackKey) {
      let bestDeg = -1;
      for (const [k, deg] of vertexDegree.entries()) {
        if (deg > bestDeg) {
          bestDeg = deg;
          fallbackKey = k;
        }
      }
    }
    if (fallbackKey) {
      groundRoots.add(uf.find(fallbackKey));
      diagnostics.push({
        severity: 'warning',
        code: 'NO_GROUND',
        message: 'No Ground symbol placed - using an automatic virtual reference node.',
      });
    }
  }

  // 5. Assign compact integer Node IDs: 0 = GND, 1..numNodes-1 = active nodes
  const rootToNode = new Map();
  let nextNodeId = 1;
  const assignNode = (ptKey) => {
    const root = uf.find(ptKey);
    if (groundRoots.has(root)) return 0;
    if (!rootToNode.has(root)) {
      rootToNode.set(root, nextNodeId++);
    }
    return rootToNode.get(root);
  };

  const pointToNode = new Map();
  for (const ptKey of candidatePoints.keys()) {
    pointToNode.set(ptKey, assignNode(ptKey));
  }

  // Map each component's pins to integer node IDs
  const compiledComponents = [];
  const probes = [];
  const voltageBranchIndices = new Map(); // comp.id -> extra MNA variable index
  let extraBranchCount = 0;

  for (const comp of components) {
    const pins = compPinList.get(comp.id);
    const pinNodes = {};
    const pinKeys = {};
    for (const p of pins) {
      const k = pointKey(p.gx, p.gy);
      pinNodes[p.id] = pointToNode.get(k);
      pinKeys[p.id] = k;
    }

    if (comp.type === 'probe') {
      probes.push({
        id: comp.id,
        designator: comp.designator,
        channel: Number(comp.params.channel) || 1,
        label: comp.params.label || `CH${comp.params.channel || 1}`,
        node: pinNodes.p,
        pointKey: pinKeys.p,
        comp,
      });
    }

    let branchIdx = -1;
    if (comp.type === 'voltage_source' || comp.type === 'transformer') {
      branchIdx = extraBranchCount++;
      voltageBranchIndices.set(comp.id, branchIdx);
    }

    compiledComponents.push({
      id: comp.id,
      type: comp.type,
      designator: comp.designator,
      params: comp.params,
      comp,
      pins,
      pinNodes,
      pinKeys,
      branchIdx,
    });
  }

  // Sort probes by channel number for consistent scope ordering
  probes.sort((a, b) => a.channel - b.channel);

  // 6. Attach node IDs to split segments and group segments by node (for per-segment current calculation)
  const segmentsByNode = new Map();
  for (let i = 0; i < splitSegments.length; i++) {
    const seg = splitSegments[i];
    seg.index = i;
    seg.node = pointToNode.get(seg.k1);
    if (!segmentsByNode.has(seg.node)) segmentsByNode.set(seg.node, []);
    segmentsByNode.get(seg.node).push(seg);
  }

  // 7. Compute true schematic junction dots (where >= 3 connections meet at one grid vertex)
  const junctions = [];
  for (const [k, deg] of vertexDegree.entries()) {
    // Draw a solder dot when 3+ wires/pins meet (or 2+ wire segments meet a component pin)
    if (deg >= 3) {
      const pt = candidatePoints.get(k);
      junctions.push({ gx: pt.gx, gy: pt.gy, key: k, node: pointToNode.get(k) });
    }
  }

  // 8. Check for disconnected islands (using BFS through all non-ground, non-probe components)
  const numNodes = nextNodeId; // includes node 0
  const adj = Array.from({ length: numNodes }, () => new Set());
  for (const cc of compiledComponents) {
    if (cc.type === 'ground' || cc.type === 'probe') continue;
    const nodes = Object.values(cc.pinNodes);
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        adj[nodes[i]].add(nodes[j]);
        adj[nodes[j]].add(nodes[i]);
      }
    }
    // Active IC outputs & logic blocks have internal supply/ground reference paths
    if (cc.type === 'logic_in' || isLogicGateType(cc.type) || cc.type === 'opamp') {
      for (const n of nodes) {
        adj[0].add(n);
        adj[n].add(0);
      }
    }
  }

  const reachableFromGnd = new Uint8Array(numNodes);
  if (numNodes > 0) {
    const queue = [0];
    reachableFromGnd[0] = 1;
    for (let q = 0; q < queue.length; q++) {
      const u = queue[q];
      for (const v of adj[u]) {
        if (!reachableFromGnd[v]) {
          reachableFromGnd[v] = 1;
          queue.push(v);
        }
      }
    }
  }

  const floatingNodes = [];
  for (let n = 1; n < numNodes; n++) {
    if (!reachableFromGnd[n]) floatingNodes.push(n);
  }
  if (floatingNodes.length > 0 && compiledComponents.some((c) => c.type !== 'ground' && c.type !== 'probe')) {
    diagnostics.push({
      severity: 'warning',
      code: 'FLOATING_NODES',
      message: `${floatingNodes.length} floating node${floatingNodes.length > 1 ? 's' : ''} with no DC path to Ground (stabilized via Gmin).`,
      nodes: floatingNodes,
    });
  }

  // Map each node to a clean human-readable name (e.g. "GND", probe label, or "N1")
  const nodeNames = new Array(numNodes);
  nodeNames[0] = 'GND';
  for (let n = 1; n < numNodes; n++) {
    nodeNames[n] = `N${n}`;
  }
  for (const pr of probes) {
    if (pr.node > 0 && pr.label) {
      nodeNames[pr.node] = `${pr.label} (N${pr.node})`;
    }
  }

  const hasNonlinear = compiledComponents.some(
    (c) =>
      c.type === 'diode' ||
      c.type === 'led' ||
      c.type === 'npn' ||
      c.type === 'pnp' ||
      c.type === 'nmos' ||
      c.type === 'pmos' ||
      c.type === 'opamp' ||
      isLogicGateType(c.type)
  );

  return {
    numNodes, // includes node 0 (ground)
    numVoltageNodes: Math.max(0, numNodes - 1),
    extraBranchCount,
    matrixSize: Math.max(0, numNodes - 1) + extraBranchCount,
    components: compiledComponents,
    probes,
    segments: splitSegments,
    segmentsByNode,
    junctions,
    pointToNode,
    nodeNames,
    hasExplicitGround,
    hasNonlinear,
    diagnostics,
  };
}
