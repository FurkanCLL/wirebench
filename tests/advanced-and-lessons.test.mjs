import test from 'node:test';
import assert from 'node:assert/strict';
import { createComponent } from '../src/engine/components.js';
import { compileNetlist } from '../src/engine/netlist.js';
import { solveDCOperatingPoint } from '../src/engine/dcAnalysis.js';
import { TransientSimulator } from '../src/engine/transient.js';
import { PRESET_CIRCUITS, getPresetById } from '../src/presets/circuits.js';
import { LESSONS, LEARN_LESSONS, getLessonById } from '../src/presets/lessons.js';
import { CircuitStore } from '../src/state/store.js';
import { StudioWorkspace } from '../src/state/workspace.js';

function w(id, x1, y1, x2, y2) {
  return { id, x1, y1, x2, y2 };
}

test('All 5 CMOS Logic Gates (AND, OR, NOT, NAND, XOR) obey exact truth tables in MNA', () => {
  const cases = [
    ['gate_and', [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 1]]],
    ['gate_or', [[0, 0, 0], [1, 0, 1], [0, 1, 1], [1, 1, 1]]],
    ['gate_nand', [[0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 0]]],
    ['gate_xor', [[0, 0, 0], [1, 0, 1], [0, 1, 1], [1, 1, 0]]],
  ];

  for (const [gateType, table] of cases) {
    for (const [a, b, expected] of table) {
      const schem = {
        components: [
          createComponent('logic_in', { id: 'a', gx: -6, gy: -1, params: { state: !!a, vHigh: 5 } }),
          createComponent('logic_in', { id: 'b', gx: -6, gy: 1, params: { state: !!b, vHigh: 5 } }),
          createComponent(gateType, { id: 'g', gx: 0, gy: 0, params: { vdd: 5 } }),
        ],
        wires: [w('w1', -4, -1, -2, -1), w('w2', -4, 1, -2, 1)],
      };
      const dc = solveDCOperatingPoint(compileNetlist(schem));
      assert.equal(dc.converged, true);
      const outV = dc.evaluation.compTelemetry.get('g').voltage;
      if (expected === 1) assert.ok(outV > 4.5, `${gateType}(${a},${b}) expected HIGH, got ${outV}`);
      else assert.ok(outV < 0.5, `${gateType}(${a},${b}) expected LOW, got ${outV}`);
    }
  }

  // NOT gate
  for (const [a, expected] of [[0, 1], [1, 0]]) {
    const schem = {
      components: [
        createComponent('logic_in', { id: 'a', gx: -6, gy: 0, params: { state: !!a, vHigh: 5 } }),
        createComponent('gate_not', { id: 'g', gx: 0, gy: 0, params: { vdd: 5 } }),
      ],
      wires: [w('w1', -4, 0, -2, 0)],
    };
    const dc = solveDCOperatingPoint(compileNetlist(schem));
    const outV = dc.evaluation.compTelemetry.get('g').voltage;
    assert.ok(expected ? outV > 4.5 : outV < 0.5, `NOT(${a}) got ${outV}`);
  }
});

test('CMOS Inverter preset cleanly inverts input ramp across threshold', () => {
  const built = getPresetById('cmos-inverter').build();
  const net = compileNetlist(built);
  const sim = new TransientSimulator(net, { dt: 2e-5, initialMode: 'dc' });
  sim.advance(120, 2e-5);
  const hist = sim.getWaveformHistory();
  let highWhenLow = false;
  let lowWhenHigh = false;
  for (let i = 0; i < hist.count; i++) {
    const vin = hist.channels[1][i];
    const vout = hist.channels[2][i];
    if (vin < 1.0 && vout > 4.5) highWhenLow = true;
    if (vin > 4.0 && vout < 0.5) lowWhenHigh = true;
  }
  assert.equal(highWhenLow, true, 'CMOS inverter should output ~5V when Vin < 1V');
  assert.equal(lowWhenHigh, true, 'CMOS inverter should output ~0V when Vin > 4V');
});

test('Transformer 5V Zener Power Supply steps 120V AC down and regulates output near 5.1V DC', () => {
  const built = getPresetById('transformer-psu').build();
  const net = compileNetlist(built);
  const sim = new TransientSimulator(net, { dt: 1.5e-4, initialMode: 'zero' });
  sim.advance(350, 1.5e-4); // ~52 ms (>3 cycles of 60 Hz)
  const vm = sim.lastEvaluation.compTelemetry.get('vm1');
  assert.ok(vm.voltage > 4.7 && vm.voltage < 5.5, `Expected Zener regulated ~5.1V on VM1, got ${vm.voltage}`);
});

test('All 11 Studio presets and all 6 Learn lessons compile cleanly with zero warnings', () => {
  for (const preset of PRESET_CIRCUITS) {
    const built = preset.build();
    const net = compileNetlist(built);
    assert.equal(net.diagnostics.length, 0, `Preset ${preset.id} diagnostics: ${JSON.stringify(net.diagnostics)}`);
  }
  for (const lesson of LEARN_LESSONS) {
    const built = lesson.build();
    const net = compileNetlist(built);
    assert.equal(net.diagnostics.length, 0, `Lesson ${lesson.id} diagnostics: ${JSON.stringify(net.diagnostics)}`);
    const sim = new TransientSimulator(net, { dt: built.simConfig.dt, initialMode: built.simConfig.initialMode });
    sim.advance(40, built.simConfig.dt);
    assert.equal(sim.converged, true, `Lesson ${lesson.id} failed to converge`);
    assert.ok(sim.lastEvaluation.maxKclResidual < 1e-6, `Lesson ${lesson.id} high KCL: ${sim.lastEvaluation.maxKclResidual}`);
  }
});

function makeEvalCtx(schem, net, sim) {
  return {
    schematic: schem,
    netlist: net,
    simulator: sim,
    eval: {
      ...sim.lastEvaluation,
      compMetrics: sim.lastEvaluation.compTelemetry,
    },
  };
}

test('Learn Lessons physics goal checkers evaluate accurately as user interacts', () => {
  // Lab 1: Ohm's Law & LEDs
  const l1 = getLessonById('lesson-1-ohms-law');
  const s1 = l1.build();
  let net = compileNetlist(s1);
  let sim = new TransientSimulator(net, { dt: s1.simConfig.dt, initialMode: 'dc' });
  assert.equal(l1.goals[0].check(makeEvalCtx(s1, net, sim)), false);

  // Step 1: Close SW1
  s1.components.find((c) => c.id === 'sw1').params.closed = true;
  sim.notifyDiscontinuity();
  sim.advance(10, s1.simConfig.dt);
  assert.equal(l1.goals[0].check(makeEvalCtx(s1, net, sim)), true);
  assert.equal(l1.goals[1].check(makeEvalCtx(s1, net, sim)), false);

  // Step 2: Lower R1 to 390 Ohm -> ~18 mA (inside 15-22 mA safe band)
  s1.components.find((c) => c.id === 'r1').params.resistance = 390;
  sim.notifyDiscontinuity();
  sim.advance(10, s1.simConfig.dt);
  assert.equal(l1.goals[1].check(makeEvalCtx(s1, net, sim)), true);

  // Step 3: Raise V1 to 12V and re-tune R1 to 560 Ohm
  s1.components.find((c) => c.id === 'v1').params.dc = 12;
  s1.components.find((c) => c.id === 'r1').params.resistance = 560;
  sim.notifyDiscontinuity();
  sim.advance(10, s1.simConfig.dt);
  assert.equal(l1.goals[2].check(makeEvalCtx(s1, net, sim)), true);

  // Lab 2: Voltage Divider
  const l2 = getLessonById('lesson-2-voltage-divider');
  const s2 = l2.build();
  net = compileNetlist(s2);
  sim = new TransientSimulator(net, { dt: s2.simConfig.dt, initialMode: 'dc' });
  assert.equal(l2.goals[0].check(makeEvalCtx(s2, net, sim)), false);
  s2.components.find((c) => c.id === 'rv1').params.wiper = 0.5;
  sim.advance(10, s2.simConfig.dt);
  assert.equal(l2.goals[0].check(makeEvalCtx(s2, net, sim)), true);
  s2.components.find((c) => c.id === 'rv1').params.wiper = 0.33;
  sim.advance(10, s2.simConfig.dt);
  assert.equal(l2.goals[1].check(makeEvalCtx(s2, net, sim)), true);

  // Lab 3: RC Charging & Discharging
  const l3 = getLessonById('lesson-3-rc-time');
  const s3 = l3.build();
  net = compileNetlist(s3);
  sim = new TransientSimulator(net, { dt: s3.simConfig.dt, initialMode: 'zero' });
  assert.equal(l3.goals[0].check(makeEvalCtx(s3, net, sim)), false);
  s3.components.find((c) => c.id === 's1').params.position = 0; // Charge (5V)
  sim.notifyDiscontinuity();
  sim.advance(1800, s3.simConfig.dt); // 360 ms (> 3.5 tau)
  assert.equal(l3.goals[0].check(makeEvalCtx(s3, net, sim)), true);
  s3.components.find((c) => c.id === 's1').params.position = 1; // Discharge (0V)
  sim.notifyDiscontinuity();
  sim.advance(1800, s3.simConfig.dt);
  assert.equal(l3.goals[1].check(makeEvalCtx(s3, net, sim)), true);

  // Lab 5: MOSFET Switch
  const l5 = getLessonById('lesson-5-mosfet-switch');
  const s5 = l5.build();
  net = compileNetlist(s5);
  sim = new TransientSimulator(net, { dt: s5.simConfig.dt, initialMode: 'dc' });
  assert.equal(l5.goals[0].check(makeEvalCtx(s5, net, sim)), false);
  s5.components.find((c) => c.id === 'in1').params.state = 1;
  sim.advance(10, s5.simConfig.dt);
  assert.equal(l5.goals[0].check(makeEvalCtx(s5, net, sim)), true);
  s5.components.find((c) => c.id === 'in1').params.state = 0;
  sim.advance(10, s5.simConfig.dt);
  assert.equal(l5.goals[1].check(makeEvalCtx(s5, net, sim)), true);

  // Lab 6: Binary Half-Adder
  const l6 = getLessonById('lesson-6-binary-logic');
  const s6 = l6.build();
  net = compileNetlist(s6);
  sim = new TransientSimulator(net, { dt: s6.simConfig.dt, initialMode: 'dc' });
  s6.components.find((c) => c.id === 'inA').params.state = 1;
  sim.advance(10, s6.simConfig.dt);
  assert.equal(l6.goals[0].check(makeEvalCtx(s6, net, sim)), true);
  s6.components.find((c) => c.id === 'inB').params.state = 1;
  sim.advance(10, s6.simConfig.dt);
  assert.equal(l6.goals[1].check(makeEvalCtx(s6, net, sim)), true);
});

test('StudioWorkspace preserves custom Studio circuit, undo history & camera across Learn mode round-trip', () => {
  const store = new CircuitStore();
  let fakeCam = { panX: 120, panY: 85, zoom: 1.4 };
  const ws = new StudioWorkspace(store, {
    getCamera: () => ({ ...fakeCam }),
    setCamera: (c) => { fakeCam = { ...c }; },
  });

  // 1. User enters Studio and builds a custom circuit in a blank tab
  ws.resumeStudio(getPresetById('astable-multivibrator'));
  const customTab = ws.createBlankTab('My Custom Amp');
  store.addComponent('voltage_source', -6, 0);
  store.addComponent('resistor', 0, 0);
  store.addWire(-4, 0, -2, 0);
  ws.snapshotActiveTab(true);
  assert.equal(store.schematic.components.length, 2);
  assert.equal(store.schematic.wires.length, 1);
  assert.equal(store.canUndo(), true);

  // 2. User switches to Learn Mode and loads Lab 1 (overwriting active store with Lab 1)
  ws.suspendStudio();
  store.loadSchematic(LESSONS[0].build(), null);
  assert.equal(store.schematic.name, "Lab 1: Ohm's Law & LEDs");
  fakeCam = { panX: 0, panY: 0, zoom: 0.8 };

  // 3. User switches BACK to Studio Mode -> exact custom circuit, undo stack & camera restored!
  const restored = ws.resumeStudio();
  assert.equal(restored.id, customTab.id);
  assert.equal(store.schematic.name, 'My Custom Amp');
  assert.equal(store.schematic.components.length, 2);
  assert.equal(store.schematic.wires.length, 1);
  assert.equal(store.canUndo(), true);
  assert.equal(fakeCam.zoom, 1.4);
  assert.equal(fakeCam.panX, 120);
});
