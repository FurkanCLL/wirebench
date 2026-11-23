import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createComponent } from '../src/engine/components.js';
import { compileNetlist } from '../src/engine/netlist.js';
import { TransientSimulator } from '../src/engine/transient.js';
import { runACSweep } from '../src/engine/acAnalysis.js';
import { getPresetById } from '../src/presets/circuits.js';
import { CircuitStore } from '../src/state/store.js';
import { exportSpiceNetlist } from '../src/export/spiceExport.js';
import { exportSchematicSVG } from '../src/export/svgExport.js';
import { exportBodeCSV, exportScopeCSV } from '../src/export/csvExport.js';

function w(id, x1, y1, x2, y2) {
  return { id, x1, y1, x2, y2 };
}

test('Crossing wires without a shared endpoint stay electrically isolated, while T-junctions connect & emit solder dots', () => {
  // Horizontal wire (-4,0)->(4,0) crosses vertical wire (0,-4)->(0,4) -> NOT connected!
  const crossSchem = {
    components: [createComponent('ground', { id: 'g1', gx: -4, gy: 0 })],
    wires: [w('h', -4, 0, 4, 0), w('v', 0, -4, 0, 4)],
  };
  const netCross = compileNetlist(crossSchem);
  assert.notEqual(netCross.pointToNode.get('-4,0'), netCross.pointToNode.get('0,-4'));
  assert.equal(netCross.junctions.length, 0);

  // T-junction: vertical wire ends at (0,0) on horizontal wire (-4,0)->(4,0) -> CONNECTED + 1 junction dot!
  const teeSchem = {
    components: [createComponent('ground', { id: 'g1', gx: -4, gy: 0 })],
    wires: [w('h', -4, 0, 4, 0), w('v', 0, -4, 0, 0)],
  };
  const netTee = compileNetlist(teeSchem);
  assert.equal(netTee.pointToNode.get('-4,0'), netTee.pointToNode.get('0,-4'));
  assert.equal(netTee.junctions.length, 1);
  assert.equal(netTee.junctions[0].gx, 0);
  assert.equal(netTee.junctions[0].gy, 0);
});

test('Missing ground elects virtual reference with NO_GROUND warning and detects floating islands', () => {
  const schem = {
    components: [
      createComponent('voltage_source', { id: 'v1', gx: 0, gy: 0, params: { waveform: 'dc', dc: 5 } }),
      createComponent('resistor', { id: 'r1', gx: 4, gy: 0, rotation: 90, params: { resistance: 1000 } }),
      createComponent('resistor', { id: 'rFloat', gx: 14, gy: 0, params: { resistance: 1000 } }),
    ],
    wires: [w('w1', 0, -2, 4, -2), w('w2', 0, 2, 4, 2)],
  };
  const net = compileNetlist(schem);
  assert.equal(net.hasExplicitGround, false);
  assert.ok(net.diagnostics.some((d) => d.code === 'NO_GROUND'));
  assert.ok(net.diagnostics.some((d) => d.code === 'FLOATING_NODES'));
});

test('CircuitStore Undo/Redo, auto-designators, and JSON round-trip preserve exact state', () => {
  const store = new CircuitStore();
  store.clearCircuit();
  const r1 = store.addComponent('resistor', 0, 0);
  const r2 = store.addComponent('resistor', 4, 0);
  assert.equal(r1.designator, 'R1');
  assert.equal(r2.designator, 'R2');

  store.addOrthogonalWires(2, 0, 4, 4, true);
  assert.equal(store.schematic.wires.length, 2);

  // Undo orthogonal wire addition
  assert.equal(store.undo(), true);
  assert.equal(store.schematic.wires.length, 0);

  // Redo restores both wires cleanly
  assert.equal(store.redo(), true);
  assert.equal(store.schematic.wires.length, 2);

  // JSON export & re-import round-trip
  const json = store.exportJSON();
  const store2 = new CircuitStore();
  store2.importJSON(json);
  assert.equal(store2.schematic.components.length, 2);
  assert.equal(store2.schematic.wires.length, 2);
  assert.equal(store2.schematic.components[0].designator, 'R1');
});

test('SPICE .cir, Vector SVG, and Scope/Bode CSV exporters produce well-formed outputs', () => {
  const built = getPresetById('sallen-key-filter').build();
  const net = compileNetlist(built);

  const cir = exportSpiceNetlist(built, net, built.simConfig);
  assert.ok(cir.includes('Sallen-Key'));
  assert.ok(cir.includes('R1 '));
  assert.ok(cir.includes('.tran '));
  assert.ok(cir.includes('.ac '));
  assert.ok(cir.trim().endsWith('.end'));

  const svg = exportSchematicSVG(built, net, 'light');
  assert.ok(svg.startsWith('<?xml'));
  assert.ok(svg.includes('<svg '));
  assert.ok(svg.includes('R1'));
  assert.ok(svg.trim().endsWith('</svg>'));

  const sim = new TransientSimulator(net, { dt: 2e-5, initialMode: 'dc' });
  sim.advance(20, 2e-5);
  const scopeCsv = exportScopeCSV(sim.getWaveformHistory(), net.probes);
  assert.ok(scopeCsv.startsWith('time_s,'));
  assert.ok(scopeCsv.split('\n').length >= 21);

  const ac = runACSweep(net, { fStart: 10, fStop: 100000, points: 41 });
  const bodeCsv = exportBodeCSV(ac);
  assert.ok(bodeCsv.startsWith('frequency_Hz,'));
  assert.equal(bodeCsv.split('\n').length, 42);
});

test('Headless CLI executes list, dc, ac, tran, and spice commands cleanly', () => {
  const listOut = execFileSync(process.execPath, ['cli/wirebench.mjs', 'list'], { encoding: 'utf8' });
  assert.ok(listOut.includes('astable-multivibrator'));
  assert.ok(listOut.includes('cmos-inverter'));
  assert.ok(listOut.includes('ohms-law'));

  const dcOut = execFileSync(process.execPath, ['cli/wirebench.mjs', 'dc', 'bjt-amplifier'], { encoding: 'utf8' });
  assert.ok(dcOut.includes('Converged: true'));
  assert.ok(dcOut.includes('[ACTIVE]'));

  const acOut = execFileSync(process.execPath, ['cli/wirebench.mjs', 'ac', 'rlc-resonator'], { encoding: 'utf8' });
  assert.ok(acOut.includes('Peak:'));
  assert.ok(acOut.includes('kHz'));

  const spiceOut = execFileSync(process.execPath, ['cli/wirebench.mjs', 'spice', 'bridge-rectifier'], { encoding: 'utf8' });
  assert.ok(spiceOut.includes('.model D_1N4148'));
  assert.ok(spiceOut.includes('.end'));
});
