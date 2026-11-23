/**
 * Wirebench Component Catalog, Integer-Grid Pin Geometry, Physical Models & Parameter Schemas.
 * Supports passive, source, semiconductor (Diode, LED, BJT, MOSFET, Op-Amp),
 * electromechanical (SPST, SPDT, Pushbutton, Transformer), measurement (Probe, Voltmeter, Ammeter),
 * and mixed-signal CMOS logic (Logic Input, AND, OR, NOT, NAND, XOR).
 */

export const GRID_SIZE = 20;

export const LED_MODELS = {
  red: { label: 'Red (635 nm)', color: '#f87171', glow: 'rgba(248, 113, 113, 0.9)', is: 1e-18, n: 1.85, vfNom: 1.85 },
  amber: { label: 'Amber (590 nm)', color: '#f59e0b', glow: 'rgba(245, 158, 11, 0.9)', is: 2e-19, n: 1.95, vfNom: 2.05 },
  green: { label: 'Emerald (525 nm)', color: '#34d399', glow: 'rgba(52, 211, 153, 0.9)', is: 5e-20, n: 2.05, vfNom: 2.2 },
  blue: { label: 'Cobalt (465 nm)', color: '#60a5fa', glow: 'rgba(96, 165, 250, 0.9)', is: 1e-22, n: 2.55, vfNom: 3.05 },
};

export const DIODE_MODELS = {
  silicon: { label: '1N4148 Silicon', is: 2.52e-9, n: 1.752, bv: 100 },
  schottky: { label: '1N5819 Schottky', is: 1.5e-5, n: 1.08, bv: 40 },
  zener: { label: 'Zener Diode', is: 2.52e-9, n: 1.752, bv: 5.1 },
};

export const PROBE_COLORS = {
  1: '#34d399', // Signal Emerald
  2: '#f59e0b', // Warm Amber
  3: '#60a5fa', // Technical Blue
  4: '#f87171', // Coral Red
};

export const COMPONENT_DEFS = {
  // =========================================================================
  // SOURCES
  // =========================================================================
  ground: {
    type: 'ground',
    name: 'Ground',
    category: 'Sources',
    prefix: 'GND',
    shortcut: 'G',
    pins: [{ id: 'gnd', label: 'GND', dx: 0, dy: 0 }],
    bounds: { x: -1, y: 0, w: 2, h: 1.8 },
    defaults: {},
    params: [],
  },

  voltage_source: {
    type: 'voltage_source',
    name: 'Voltage Source',
    category: 'Sources',
    prefix: 'V',
    shortcut: 'S',
    pins: [
      { id: 'pos', label: '+', dx: 0, dy: -2 },
      { id: 'neg', label: '−', dx: 0, dy: 2 },
    ],
    bounds: { x: -1.4, y: -2, w: 2.8, h: 4 },
    defaults: {
      waveform: 'dc',
      dc: 5,
      amplitude: 5,
      frequency: 1000,
      phase: 0,
      duty: 0.5,
      acMag: 1,
    },
    params: [
      {
        key: 'waveform',
        label: 'Waveform',
        kind: 'select',
        options: [
          { value: 'dc', label: 'DC Constant' },
          { value: 'sine', label: 'AC Sine' },
          { value: 'square', label: 'Square Wave' },
          { value: 'triangle', label: 'Triangle Wave' },
          { value: 'pulse', label: 'Pulse Train' },
        ],
      },
      { key: 'dc', label: 'DC Offset', kind: 'number', unit: 'V', min: -100, max: 100, step: 0.1 },
      {
        key: 'amplitude',
        label: 'Amplitude (Peak)',
        kind: 'number',
        unit: 'V',
        min: 0,
        max: 100,
        step: 0.1,
        visibleWhen: (p) => p.waveform !== 'dc',
      },
      {
        key: 'frequency',
        label: 'Frequency',
        kind: 'number',
        unit: 'Hz',
        min: 0.1,
        max: 1e6,
        log: true,
        visibleWhen: (p) => p.waveform !== 'dc',
      },
      {
        key: 'phase',
        label: 'Phase',
        kind: 'number',
        unit: '°',
        min: -180,
        max: 180,
        step: 5,
        visibleWhen: (p) => p.waveform !== 'dc',
      },
      {
        key: 'duty',
        label: 'Duty Cycle',
        kind: 'number',
        unit: '',
        min: 0.05,
        max: 0.95,
        step: 0.05,
        visibleWhen: (p) => p.waveform === 'square' || p.waveform === 'pulse',
      },
      { key: 'acMag', label: 'AC Sweep Mag', kind: 'number', unit: 'V', min: 0, max: 100, step: 0.1 },
    ],
  },

  current_source: {
    type: 'current_source',
    name: 'Current Source',
    category: 'Sources',
    prefix: 'I',
    shortcut: 'I',
    pins: [
      { id: 'out', label: '+', dx: 0, dy: -2 },
      { id: 'in', label: '−', dx: 0, dy: 2 },
    ],
    bounds: { x: -1.4, y: -2, w: 2.8, h: 4 },
    defaults: { current: 0.01 },
    params: [
      { key: 'current', label: 'Current', kind: 'number', unit: 'A', min: -10, max: 10, step: 0.001 },
    ],
  },

  logic_in: {
    type: 'logic_in',
    name: 'Logic Input',
    category: 'Logic',
    prefix: 'IN',
    shortcut: '',
    pins: [{ id: 'out', label: 'OUT', dx: 2, dy: 0 }],
    bounds: { x: -1.2, y: -1.1, w: 3.2, h: 2.2 },
    defaults: { state: false, vHigh: 5 },
    params: [
      { key: 'state', label: 'Logic Level', kind: 'toggle', onLabel: 'HIGH (1)', offLabel: 'LOW (0)' },
      { key: 'vHigh', label: 'Logic VDD', kind: 'number', unit: 'V', min: 1.8, max: 15, step: 0.1 },
    ],
  },

  // =========================================================================
  // PASSIVES
  // =========================================================================
  resistor: {
    type: 'resistor',
    name: 'Resistor',
    category: 'Passives',
    prefix: 'R',
    shortcut: 'R',
    pins: [
      { id: 'a', label: 'A', dx: -2, dy: 0 },
      { id: 'b', label: 'B', dx: 2, dy: 0 },
    ],
    bounds: { x: -2, y: -1, w: 4, h: 2 },
    defaults: { resistance: 1000, powerRating: 0.25 },
    params: [
      { key: 'resistance', label: 'Resistance', kind: 'number', unit: 'Ω', min: 0.1, max: 1e8, log: true },
      { key: 'powerRating', label: 'Max Power', kind: 'number', unit: 'W', min: 0.05, max: 100, log: true },
    ],
  },

  potentiometer: {
    type: 'potentiometer',
    name: 'Potentiometer',
    category: 'Passives',
    prefix: 'RV',
    shortcut: 'O',
    pins: [
      { id: 'a', label: 'A', dx: -2, dy: 0 },
      { id: 'b', label: 'B', dx: 2, dy: 0 },
      { id: 'wiper', label: 'W', dx: 0, dy: -2 },
    ],
    bounds: { x: -2, y: -2, w: 4, h: 3 },
    defaults: { resistance: 10000, wiper: 0.5 },
    params: [
      { key: 'resistance', label: 'Total Resistance', kind: 'number', unit: 'Ω', min: 10, max: 1e7, log: true },
      { key: 'wiper', label: 'Wiper Position', kind: 'slider', min: 0.01, max: 0.99, step: 0.01, format: (v) => `${Math.round(v * 100)}%` },
    ],
  },

  capacitor: {
    type: 'capacitor',
    name: 'Capacitor',
    category: 'Passives',
    prefix: 'C',
    shortcut: 'C',
    pins: [
      { id: 'a', label: '+', dx: -2, dy: 0 },
      { id: 'b', label: '−', dx: 2, dy: 0 },
    ],
    bounds: { x: -2, y: -1.2, w: 4, h: 2.4 },
    defaults: { capacitance: 10e-6, initialVoltage: 0 },
    params: [
      { key: 'capacitance', label: 'Capacitance', kind: 'number', unit: 'F', min: 1e-12, max: 1, log: true },
      { key: 'initialVoltage', label: 'Initial Voltage', kind: 'number', unit: 'V', min: -100, max: 100, step: 0.1 },
    ],
  },

  inductor: {
    type: 'inductor',
    name: 'Inductor',
    category: 'Passives',
    prefix: 'L',
    shortcut: 'L',
    pins: [
      { id: 'a', label: 'A', dx: -2, dy: 0 },
      { id: 'b', label: 'B', dx: 2, dy: 0 },
    ],
    bounds: { x: -2, y: -1.1, w: 4, h: 2.2 },
    defaults: { inductance: 10e-3, seriesResistance: 0.5 },
    params: [
      { key: 'inductance', label: 'Inductance', kind: 'number', unit: 'H', min: 1e-9, max: 100, log: true },
      { key: 'seriesResistance', label: 'Coil ESR', kind: 'number', unit: 'Ω', min: 1e-3, max: 1000, log: true },
    ],
  },

  transformer: {
    type: 'transformer',
    name: 'Transformer',
    category: 'Passives',
    prefix: 'T',
    shortcut: '',
    pins: [
      { id: 'p1', label: 'P+', dx: -2, dy: -2 },
      { id: 'p2', label: 'P−', dx: -2, dy: 2 },
      { id: 's1', label: 'S+', dx: 2, dy: -2 },
      { id: 's2', label: 'S−', dx: 2, dy: 2 },
    ],
    bounds: { x: -2, y: -2, w: 4, h: 4 },
    defaults: { ratio: 0.5, rWinding: 0.1 },
    params: [
      { key: 'ratio', label: 'Turns Ratio (Ns/Np)', kind: 'number', unit: '', min: 0.05, max: 20, log: true },
      { key: 'rWinding', label: 'Winding Resistance', kind: 'number', unit: 'Ω', min: 0.01, max: 100, log: true },
    ],
  },

  // =========================================================================
  // SEMICONDUCTORS & ACTIVE ICS
  // =========================================================================
  diode: {
    type: 'diode',
    name: 'Diode',
    category: 'Active',
    prefix: 'D',
    shortcut: 'D',
    pins: [
      { id: 'anode', label: 'A', dx: -2, dy: 0 },
      { id: 'cathode', label: 'K', dx: 2, dy: 0 },
    ],
    bounds: { x: -2, y: -1.1, w: 4, h: 2.2 },
    defaults: { model: 'silicon', vBreakdown: 5.1 },
    params: [
      {
        key: 'model',
        label: 'Diode Model',
        kind: 'select',
        options: [
          { value: 'silicon', label: '1N4148 Silicon (0.68V)' },
          { value: 'schottky', label: '1N5819 Schottky (0.30V)' },
          { value: 'zener', label: 'Zener Diode' },
        ],
      },
      {
        key: 'vBreakdown',
        label: 'Zener Voltage',
        kind: 'number',
        unit: 'V',
        min: 1.8,
        max: 50,
        step: 0.1,
        visibleWhen: (p) => p.model === 'zener',
      },
    ],
  },

  led: {
    type: 'led',
    name: 'LED',
    category: 'Active',
    prefix: 'LED',
    shortcut: 'E',
    pins: [
      { id: 'anode', label: 'A', dx: -2, dy: 0 },
      { id: 'cathode', label: 'K', dx: 2, dy: 0 },
    ],
    bounds: { x: -2, y: -1.3, w: 4, h: 2.6 },
    defaults: { color: 'green', nominalCurrent: 0.015 },
    params: [
      {
        key: 'color',
        label: 'Color',
        kind: 'select',
        options: [
          { value: 'red', label: 'Red (1.85V)' },
          { value: 'amber', label: 'Amber (2.05V)' },
          { value: 'green', label: 'Emerald (2.20V)' },
          { value: 'blue', label: 'Cobalt (3.05V)' },
        ],
      },
      { key: 'nominalCurrent', label: 'Rated Current', kind: 'number', unit: 'A', min: 0.001, max: 0.2, log: true },
    ],
  },

  npn: {
    type: 'npn',
    name: 'NPN Transistor',
    category: 'Active',
    prefix: 'Q',
    shortcut: 'N',
    pins: [
      { id: 'b', label: 'B', dx: -2, dy: 0 },
      { id: 'c', label: 'C', dx: 1, dy: -2 },
      { id: 'e', label: 'E', dx: 1, dy: 2 },
    ],
    bounds: { x: -2, y: -2, w: 3.5, h: 4 },
    defaults: { betaF: 120, betaR: 2, is: 1e-14 },
    params: [
      { key: 'betaF', label: 'Current Gain (βF)', kind: 'number', unit: '', min: 10, max: 800, log: true },
      { key: 'is', label: 'Saturation Current', kind: 'number', unit: 'A', min: 1e-16, max: 1e-11, log: true },
    ],
  },

  pnp: {
    type: 'pnp',
    name: 'PNP Transistor',
    category: 'Active',
    prefix: 'Q',
    shortcut: 'B',
    pins: [
      { id: 'b', label: 'B', dx: -2, dy: 0 },
      { id: 'e', label: 'E', dx: 1, dy: -2 },
      { id: 'c', label: 'C', dx: 1, dy: 2 },
    ],
    bounds: { x: -2, y: -2, w: 3.5, h: 4 },
    defaults: { betaF: 120, betaR: 2, is: 1e-14 },
    params: [
      { key: 'betaF', label: 'Current Gain (βF)', kind: 'number', unit: '', min: 10, max: 800, log: true },
      { key: 'is', label: 'Saturation Current', kind: 'number', unit: 'A', min: 1e-16, max: 1e-11, log: true },
    ],
  },

  nmos: {
    type: 'nmos',
    name: 'N-MOSFET',
    category: 'Active',
    prefix: 'M',
    shortcut: 'M',
    pins: [
      { id: 'g', label: 'G', dx: -2, dy: 0 },
      { id: 'd', label: 'D', dx: 1, dy: -2 },
      { id: 's', label: 'S', dx: 1, dy: 2 },
    ],
    bounds: { x: -2, y: -2, w: 3.5, h: 4 },
    defaults: { vth: 1.5, kp: 0.08, lambda: 0.02 },
    params: [
      { key: 'vth', label: 'Threshold (Vth)', kind: 'number', unit: 'V', min: 0.3, max: 8, step: 0.1 },
      { key: 'kp', label: 'Transconductance (Kp)', kind: 'number', unit: '', min: 0.001, max: 5, log: true },
    ],
  },

  pmos: {
    type: 'pmos',
    name: 'P-MOSFET',
    category: 'Active',
    prefix: 'M',
    shortcut: '',
    pins: [
      { id: 'g', label: 'G', dx: -2, dy: 0 },
      { id: 's', label: 'S', dx: 1, dy: -2 },
      { id: 'd', label: 'D', dx: 1, dy: 2 },
    ],
    bounds: { x: -2, y: -2, w: 3.5, h: 4 },
    defaults: { vth: 1.5, kp: 0.08, lambda: 0.02 },
    params: [
      { key: 'vth', label: 'Threshold (|Vth|)', kind: 'number', unit: 'V', min: 0.3, max: 8, step: 0.1 },
      { key: 'kp', label: 'Transconductance (Kp)', kind: 'number', unit: '', min: 0.001, max: 5, log: true },
    ],
  },

  opamp: {
    type: 'opamp',
    name: 'Op-Amp',
    category: 'Active',
    prefix: 'U',
    shortcut: 'A',
    pins: [
      { id: 'inPos', label: '+', dx: -2, dy: -1 },
      { id: 'inNeg', label: '−', dx: -2, dy: 1 },
      { id: 'out', label: 'OUT', dx: 2, dy: 0 },
    ],
    bounds: { x: -2, y: -2, w: 4, h: 4 },
    defaults: { gain: 1e5, vPos: 12, vNeg: -12, rOut: 50 },
    params: [
      { key: 'gain', label: 'Open-Loop Gain', kind: 'number', unit: '', min: 100, max: 1e7, log: true },
      { key: 'vPos', label: '+V Rail', kind: 'number', unit: 'V', min: 1, max: 50, step: 0.5 },
      { key: 'vNeg', label: '−V Rail', kind: 'number', unit: 'V', min: -50, max: 0, step: 0.5 },
      { key: 'rOut', label: 'Output Impedance', kind: 'number', unit: 'Ω', min: 1, max: 10000, log: true },
    ],
  },

  // =========================================================================
  // SWITCHES & METERS
  // =========================================================================
  switch: {
    type: 'switch',
    name: 'SPST Switch',
    category: 'Controls',
    prefix: 'SW',
    shortcut: 'K',
    pins: [
      { id: 'a', label: 'A', dx: -2, dy: 0 },
      { id: 'b', label: 'B', dx: 2, dy: 0 },
    ],
    bounds: { x: -2, y: -1.3, w: 4, h: 2.3 },
    defaults: { closed: false, rOn: 0.05 },
    params: [
      { key: 'closed', label: 'State', kind: 'toggle', onLabel: 'CLOSED', offLabel: 'OPEN' },
      { key: 'rOn', label: 'Contact R', kind: 'number', unit: 'Ω', min: 0.001, max: 100, log: true },
    ],
  },

  spdt: {
    type: 'spdt',
    name: 'SPDT Switch',
    category: 'Controls',
    prefix: 'SW',
    shortcut: '',
    pins: [
      { id: 'com', label: 'COM', dx: -2, dy: 0 },
      { id: 'a', label: 'A', dx: 2, dy: -1 },
      { id: 'b', label: 'B', dx: 2, dy: 1 },
    ],
    bounds: { x: -2, y: -1.5, w: 4, h: 3 },
    defaults: { position: 0, rOn: 0.05 },
    params: [
      {
        key: 'position',
        label: 'Throw',
        kind: 'select',
        options: [
          { value: 0, label: 'Position A (Top)' },
          { value: 1, label: 'Position B (Bottom)' },
        ],
      },
    ],
  },

  pushbutton: {
    type: 'pushbutton',
    name: 'Pushbutton',
    category: 'Controls',
    prefix: 'PB',
    shortcut: 'U',
    pins: [
      { id: 'a', label: 'A', dx: -2, dy: 0 },
      { id: 'b', label: 'B', dx: 2, dy: 0 },
    ],
    bounds: { x: -2, y: -1.6, w: 4, h: 2.6 },
    defaults: { closed: false, rOn: 0.05 },
    params: [
      { key: 'closed', label: 'Contact', kind: 'toggle', onLabel: 'PRESSED', offLabel: 'RELEASED' },
    ],
  },

  voltmeter: {
    type: 'voltmeter',
    name: 'Voltmeter',
    category: 'Meters',
    prefix: 'VM',
    shortcut: '',
    pins: [
      { id: 'pos', label: '+', dx: -2, dy: 0 },
      { id: 'neg', label: '−', dx: 2, dy: 0 },
    ],
    bounds: { x: -2, y: -1.3, w: 4, h: 2.6 },
    defaults: {},
    params: [],
  },

  ammeter: {
    type: 'ammeter',
    name: 'Ammeter',
    category: 'Meters',
    prefix: 'AM',
    shortcut: '',
    pins: [
      { id: 'pos', label: '+', dx: -2, dy: 0 },
      { id: 'neg', label: '−', dx: 2, dy: 0 },
    ],
    bounds: { x: -2, y: -1.3, w: 4, h: 2.6 },
    defaults: {},
    params: [],
  },

  probe: {
    type: 'probe',
    name: 'Scope Probe',
    category: 'Meters',
    prefix: 'TP',
    shortcut: 'P',
    pins: [{ id: 'p', label: 'P', dx: 0, dy: 0 }],
    bounds: { x: -0.9, y: -2.2, w: 2.6, h: 2.4 },
    defaults: { channel: 1, label: 'CH1' },
    params: [
      {
        key: 'channel',
        label: 'Channel',
        kind: 'select',
        options: [
          { value: 1, label: 'CH1 (Emerald)' },
          { value: 2, label: 'CH2 (Amber)' },
          { value: 3, label: 'CH3 (Blue)' },
          { value: 4, label: 'CH4 (Coral)' },
        ],
      },
      { key: 'label', label: 'Label', kind: 'text' },
    ],
  },

  // =========================================================================
  // MIXED-SIGNAL DIGITAL LOGIC GATES
  // =========================================================================
  gate_and: {
    type: 'gate_and',
    name: 'AND Gate',
    category: 'Logic',
    prefix: 'U',
    shortcut: '',
    pins: [
      { id: 'a', label: 'A', dx: -2, dy: -1 },
      { id: 'b', label: 'B', dx: -2, dy: 1 },
      { id: 'out', label: 'Y', dx: 2, dy: 0 },
    ],
    bounds: { x: -2, y: -1.6, w: 4, h: 3.2 },
    defaults: { vdd: 5 },
    params: [{ key: 'vdd', label: 'Supply VDD', kind: 'number', unit: 'V', min: 1.8, max: 15, step: 0.1 }],
  },

  gate_or: {
    type: 'gate_or',
    name: 'OR Gate',
    category: 'Logic',
    prefix: 'U',
    shortcut: '',
    pins: [
      { id: 'a', label: 'A', dx: -2, dy: -1 },
      { id: 'b', label: 'B', dx: -2, dy: 1 },
      { id: 'out', label: 'Y', dx: 2, dy: 0 },
    ],
    bounds: { x: -2, y: -1.6, w: 4, h: 3.2 },
    defaults: { vdd: 5 },
    params: [{ key: 'vdd', label: 'Supply VDD', kind: 'number', unit: 'V', min: 1.8, max: 15, step: 0.1 }],
  },

  gate_not: {
    type: 'gate_not',
    name: 'NOT Gate',
    category: 'Logic',
    prefix: 'U',
    shortcut: '',
    pins: [
      { id: 'a', label: 'A', dx: -2, dy: 0 },
      { id: 'out', label: 'Y', dx: 2, dy: 0 },
    ],
    bounds: { x: -2, y: -1.4, w: 4, h: 2.8 },
    defaults: { vdd: 5 },
    params: [{ key: 'vdd', label: 'Supply VDD', kind: 'number', unit: 'V', min: 1.8, max: 15, step: 0.1 }],
  },

  gate_nand: {
    type: 'gate_nand',
    name: 'NAND Gate',
    category: 'Logic',
    prefix: 'U',
    shortcut: '',
    pins: [
      { id: 'a', label: 'A', dx: -2, dy: -1 },
      { id: 'b', label: 'B', dx: -2, dy: 1 },
      { id: 'out', label: 'Y', dx: 2, dy: 0 },
    ],
    bounds: { x: -2, y: -1.6, w: 4, h: 3.2 },
    defaults: { vdd: 5 },
    params: [{ key: 'vdd', label: 'Supply VDD', kind: 'number', unit: 'V', min: 1.8, max: 15, step: 0.1 }],
  },

  gate_xor: {
    type: 'gate_xor',
    name: 'XOR Gate',
    category: 'Logic',
    prefix: 'U',
    shortcut: '',
    pins: [
      { id: 'a', label: 'A', dx: -2, dy: -1 },
      { id: 'b', label: 'B', dx: -2, dy: 1 },
      { id: 'out', label: 'Y', dx: 2, dy: 0 },
    ],
    bounds: { x: -2, y: -1.6, w: 4, h: 3.2 },
    defaults: { vdd: 5 },
    params: [{ key: 'vdd', label: 'Supply VDD', kind: 'number', unit: 'V', min: 1.8, max: 15, step: 0.1 }],
  },
};

export function isLogicGateType(type) {
  return (
    type === 'gate_and' ||
    type === 'gate_or' ||
    type === 'gate_not' ||
    type === 'gate_nand' ||
    type === 'gate_xor'
  );
}

/**
 * Transform a local integer pin offset (dx, dy) by rotation (0/90/180/270) and flipX.
 */
export function transformOffset(dx, dy, rotation = 0, flipX = false) {
  let x = flipX ? -dx : dx;
  let y = dy;
  const r = (((rotation % 360) + 360) % 360) | 0;
  if (r === 90) return { dx: -y, dy: x };
  if (r === 180) return { dx: -x, dy: -y };
  if (r === 270) return { dx: y, dy: -x };
  return { dx: x, dy: y };
}

export function getComponentPins(comp) {
  const def = COMPONENT_DEFS[comp.type];
  if (!def) return [];
  return def.pins.map((pin) => {
    const t = transformOffset(pin.dx, pin.dy, comp.rotation || 0, !!comp.flipX);
    return {
      id: pin.id,
      label: pin.label,
      gx: comp.gx + t.dx,
      gy: comp.gy + t.dy,
    };
  });
}

export function createComponent(type, overrides = {}) {
  const def = COMPONENT_DEFS[type];
  if (!def) throw new Error(`Unknown component type: ${type}`);
  return {
    id: overrides.id || `${type}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    designator: overrides.designator || def.prefix,
    gx: Math.round(overrides.gx ?? 0),
    gy: Math.round(overrides.gy ?? 0),
    rotation: (((overrides.rotation ?? 0) % 360) + 360) % 360,
    flipX: !!overrides.flipX,
    params: { ...def.defaults, ...(overrides.params || {}) },
  };
}

export function getDiodePhysics(comp) {
  if (comp.type === 'led') {
    const led = LED_MODELS[comp.params.color] || LED_MODELS.green;
    return { is: led.is, n: led.n, bv: 25, isZener: false, led };
  }
  const m = DIODE_MODELS[comp.params.model] || DIODE_MODELS.silicon;
  const isZener = comp.params.model === 'zener';
  const bv = isZener ? Math.max(1.2, Number(comp.params.vBreakdown) || 5.1) : m.bv;
  return { is: m.is, n: m.n, bv, isZener, led: null };
}
