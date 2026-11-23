import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { COMPONENT_DEFS } from '../src/engine/components.js';
import { compileNetlist } from '../src/engine/netlist.js';
import { TransientSimulator } from '../src/engine/transient.js';
import { runACSweep } from '../src/engine/acAnalysis.js';
import { PRESET_CIRCUITS } from '../src/presets/circuits.js';
import { LEARN_LESSONS } from '../src/presets/lessons.js';
import { CircuitStore } from '../src/state/store.js';
import { uiIcon } from '../src/ui/icons.js';
import { getPaletteIconSVG } from '../src/ui/symbols.js';
import { SchematicCanvas } from '../src/ui/schematicCanvas.js';
import { OscilloscopeView } from '../src/ui/oscilloscope.js';
import { BodePlotView } from '../src/ui/bodePlot.js';

function createStrictMockCanvas(width = 960, height = 560) {
  let drawCalls = 0;
  const assertFinite = (name, ...vals) => {
    for (const v of vals) {
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        throw new Error(`Non-finite value passed to ctx.${name}: ${vals.join(', ')}`);
      }
    }
  };

  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    globalAlpha: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    save() {},
    restore() {},
    beginPath() {},
    closePath() {},
    clip() {},
    stroke() { drawCalls++; },
    fill() { drawCalls++; },
    setLineDash() {},
    translate(x, y) { assertFinite('translate', x, y); },
    scale(x, y) { assertFinite('scale', x, y); },
    rotate(a) { assertFinite('rotate', a); },
    moveTo(x, y) { assertFinite('moveTo', x, y); },
    lineTo(x, y) { assertFinite('lineTo', x, y); },
    quadraticCurveTo(a, b, c, d) { assertFinite('quadraticCurveTo', a, b, c, d); },
    arc(x, y, r, s, e) { assertFinite('arc', x, y, r, s, e); if (r < 0) throw new Error(`Negative arc radius ${r}`); },
    rect(x, y, w, h) { assertFinite('rect', x, y, w, h); },
    roundRect(x, y, w, h, r) { assertFinite('roundRect', x, y, w, h, typeof r === 'number' ? r : 0); },
    fillRect(x, y, w, h) { assertFinite('fillRect', x, y, w, h); drawCalls++; },
    strokeRect(x, y, w, h) { assertFinite('strokeRect', x, y, w, h); drawCalls++; },
    fillText(txt, x, y) { assertFinite('fillText', x, y); drawCalls++; },
    strokeText(txt, x, y) { assertFinite('strokeText', x, y); drawCalls++; },
    measureText(txt) { return { width: String(txt).length * 6.5 }; },
    createRadialGradient(x0, y0, r0, x1, y1, r1) {
      assertFinite('createRadialGradient', x0, y0, r0, x1, y1, r1);
      return { addColorStop() {} };
    },
  };

  const listeners = new Map();
  const canvas = {
    width,
    height,
    style: {},
    parentElement: {
      getBoundingClientRect: () => ({ width, height, left: 0, top: 0 }),
    },
    getBoundingClientRect: () => ({ width, height, left: 0, top: 0 }),
    getContext: () => ctx,
    addEventListener: (ev, fn) => listeners.set(ev, fn),
    setPointerCapture() {},
    releasePointerCapture() {},
    hasPointerCapture: () => false,
    getDrawCalls: () => drawCalls,
  };
  return canvas;
}

test('Every component type and UI toolbar control has a valid SVG icon', () => {
  for (const type of ['select', 'wire', 'delete', ...Object.keys(COMPONENT_DEFS)]) {
    const svg = getPaletteIconSVG(type);
    assert.ok(svg.startsWith('<svg ') && svg.endsWith('</svg>'), `Invalid icon SVG for ${type}`);
  }
  for (const key of ['play', 'pause', 'step', 'reset', 'undo', 'redo', 'fit', 'search', 'audio', 'sliders', 'download', 'help', 'catSources', 'catPassives', 'catActive', 'catControls', 'catLogic']) {
    const svg = uiIcon(key);
    assert.ok(svg.startsWith('<svg ') && svg.endsWith('</svg>'), `Invalid UI SVG for ${key}`);
  }
});

test('SchematicCanvas, OscilloscopeView, and BodePlotView render all 11 presets & 6 lessons with zero NaN coordinates in dark and light themes', () => {
  globalThis.window = globalThis.window || { devicePixelRatio: 1 };

  const store = new CircuitStore();
  const schemEl = createStrictMockCanvas(1024, 600);
  const scopeEl = createStrictMockCanvas(800, 200);
  const bodeEl = createStrictMockCanvas(800, 200);

  const schemView = new SchematicCanvas(schemEl, store);
  const scopeView = new OscilloscopeView(scopeEl);
  const bodeView = new BodePlotView(bodeEl);

  const allCircuits = [...PRESET_CIRCUITS, ...LEARN_LESSONS];
  for (const item of allCircuits) {
    const built = item.build();
    store.loadSchematic(built, item.id);
    const net = compileNetlist(store.schematic);
    const sim = new TransientSimulator(net, {
      dt: built.simConfig.dt,
      initialMode: built.simConfig.initialMode,
    });
    sim.advance(60, built.simConfig.dt);

    schemView.setSimulation(net, sim);
    schemView.zoomToFit();
    scopeView.configure(built.simConfig);

    for (const theme of ['dark', 'light']) {
      schemView.setTheme(theme);
      scopeView.setTheme(theme);
      bodeView.setTheme(theme);

      schemView.setGuideTarget(store.schematic.components[0]?.id || null, 'Click here');
      schemView.render(0.016, true);
      schemView.setGuideTarget(null, '');

      scopeView.xyMode = false;
      scopeView.cursorsEnabled = true;
      scopeView.render(sim, net.probes);

      scopeView.xyMode = true;
      scopeView.render(sim, net.probes);

      const ac = runACSweep(net, { fStart: 10, fStop: 100000, points: 61 });
      bodeView.hoverX = 320;
      bodeView.setData(ac);
    }
  }

  schemView.pointerInside = true;
  schemView.pointerWorld = { x: 40, y: 40, gx: 2, gy: 2 };
  for (const type of Object.keys(COMPONENT_DEFS)) {
    store.setTool(`place:${type}`);
    schemView.render(0.016, false);
  }

  assert.ok(schemEl.getDrawCalls() > 800, 'Expected substantial schematic draw calls');
  assert.ok(scopeEl.getDrawCalls() > 300, 'Expected substantial scope draw calls');
  assert.ok(bodeEl.getDrawCalls() > 300, 'Expected substantial Bode draw calls');
});

test('Standalone dist/wirebench.html bundle loads and registers all modules cleanly without runtime errors', () => {
  const html = fs.readFileSync('dist/wirebench.html', 'utf8');
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(m, 'Missing bundled <script> tag in dist/wirebench.html');

  let domReadyCb = null;
  const sandbox = {
    window: {
      devicePixelRatio: 1,
      addEventListener(ev, fn) {
        if (ev === 'DOMContentLoaded') domReadyCb = fn;
      },
    },
    document: { addEventListener() {} },
    console,
    Math,
    Number,
    String,
    Array,
    Object,
    Map,
    Set,
    Float64Array,
    Float32Array,
    Int32Array,
    Uint8Array,
    JSON,
    Date,
    Error,
    RegExp,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    setTimeout,
    clearTimeout,
  };

  vm.runInNewContext(m[1], sandbox);
  assert.equal(typeof domReadyCb, 'function', 'Expected WirebenchApp DOMContentLoaded hook to register cleanly');
});
