/**
 * Curated Library of 8 Physics-Verified Electronic Circuits.
 * Every circuit uses exact integer grid coordinates, zero fake animations,
 * pre-placed scope probes, and realistic default simulation timescales.
 */

import { createComponent } from '../engine/components.js';

function w(id, x1, y1, x2, y2) {
  return { id, x1, y1, x2, y2 };
}

function makePreset(spec) {
  return {
    ...spec,
    build() {
      return {
        name: spec.name,
        components: spec.components.map((c) => createComponent(c.type, c)),
        wires: spec.wires.map((seg) => ({ ...seg })),
        simConfig: { ...spec.simConfig },
      };
    },
  };
}

export const PRESET_CIRCUITS = [
  // =========================================================================
  // 1. ASTABLE MULTIVIBRATOR (2x BJT Oscillator)
  // =========================================================================
  makePreset({
    id: 'astable-multivibrator',
    name: 'Astable Multivibrator',
    category: 'Oscillators',
    subtitle: 'Self-oscillating dual-BJT LED flasher',
    description:
      'Two cross-coupled NPN transistors charge and discharge timing capacitors C1 and C2 through base resistors R2 and R3. Every LED blink emerges purely from Ebers-Moll transistor physics and Kirchhoff’s laws.',
    formula: 'f ≈ 1 / (1.38 · R_eff · C)',
    tips: [
      'Drag the Speed potentiometer (RV1) directly on the canvas to sweep blink frequency live.',
      'Watch CH2 (Amber) show the classic exponential base-voltage ramp crossing +0.65 V to trigger switching.',
    ],
    simConfig: {
      dt: 2.5e-4,
      simRate: 0.45, // 0.45 sim-seconds per real second -> visually rhythmic LED blinking
      initialMode: 'zero',
      scopeTimeDiv: 0.05, // 50 ms/div
      scopeVoltsDiv: 2.5,
      triggerChannel: 1,
      triggerLevel: 4.0,
      defaultInstrument: 'scope',
    },
    components: [
      { id: 'v1', type: 'voltage_source', designator: 'V1', gx: -14, gy: 0, params: { waveform: 'dc', dc: 9 } },
      { id: 'gnd1', type: 'ground', designator: 'GND', gx: -14, gy: 10 },

      { id: 'r1', type: 'resistor', designator: 'R1', gx: -8, gy: -7, rotation: 90, params: { resistance: 390 } },
      { id: 'led1', type: 'led', designator: 'LED1', gx: -8, gy: -3, rotation: 90, params: { color: 'green', nominalCurrent: 0.015 } },

      { id: 'r4', type: 'resistor', designator: 'R4', gx: 12, gy: -7, rotation: 90, params: { resistance: 390 } },
      { id: 'led2', type: 'led', designator: 'LED2', gx: 12, gy: -3, rotation: 90, params: { color: 'amber', nominalCurrent: 0.015 } },

      { id: 'rv1', type: 'potentiometer', designator: 'RV1', gx: 2, gy: -8, rotation: 0, params: { resistance: 30000, wiper: 0.3 } },
      { id: 'r2', type: 'resistor', designator: 'R2', gx: -2, gy: -4, rotation: 90, params: { resistance: 18000 } },
      { id: 'r3', type: 'resistor', designator: 'R3', gx: 6, gy: -4, rotation: 90, params: { resistance: 18500 } },

      { id: 'c1', type: 'capacitor', designator: 'C1', gx: 2, gy: 0, rotation: 0, params: { capacitance: 4.7e-6, initialVoltage: 4.0 } },
      { id: 'c2', type: 'capacitor', designator: 'C2', gx: 2, gy: 3, rotation: 0, params: { capacitance: 4.7e-6, initialVoltage: 0.0 } },

      { id: 'q1', type: 'npn', designator: 'Q1', gx: -7, gy: 6, flipX: true, params: { betaF: 140 } },
      { id: 'q2', type: 'npn', designator: 'Q2', gx: 11, gy: 6, flipX: false, params: { betaF: 140 } },

      { id: 'tp1', type: 'probe', designator: 'TP1', gx: -8, gy: 2, params: { channel: 1, label: 'Q1 Col' } },
      { id: 'tp2', type: 'probe', designator: 'TP2', gx: 6, gy: 6, params: { channel: 2, label: 'Q2 Base' } },
      { id: 'tp3', type: 'probe', designator: 'TP3', gx: 12, gy: 2, params: { channel: 3, label: 'Q2 Col' } },
    ],
    wires: [
      // Power rails
      w('w1', -14, -2, -14, -10),
      w('w2', -14, -10, 12, -10),
      w('w3', -14, 2, -14, 10),
      w('w4', -14, 10, 12, 10),

      // Collector columns
      w('w5', -8, -10, -8, -9),
      w('w6', -8, -1, -8, 4),
      w('w7', -8, 8, -8, 10),
      w('w8', 12, -10, 12, -9),
      w('w9', 12, -1, 12, 4),
      w('w10', 12, 8, 12, 10),

      // Speed rheostat RV1 -> base bias bus
      w('w11', 4, -8, 4, -10),
      w('w12', 0, -8, 0, -6),
      w('w13', -2, -6, 6, -6),

      // Cross-coupling: C1 (Q1 collector -> Q2 base)
      w('w14', -8, 0, 0, 0),
      w('w15', 4, 0, 6, 0),
      w('w16', 6, -2, 6, 6),
      w('w17', 6, 6, 9, 6),

      // Cross-coupling: C2 (Q2 collector -> Q1 base)
      w('w18', 4, 3, 12, 3),
      w('w19', -2, 3, 0, 3),
      w('w20', -2, -2, -2, 6),
      w('w21', -2, 6, -5, 6),
    ],
  }),

  // =========================================================================
  // 2. FULL-WAVE BRIDGE RECTIFIER & SMOOTHING FILTER
  // =========================================================================
  makePreset({
    id: 'bridge-rectifier',
    name: 'Bridge Rectifier & Filter',
    category: 'Power',
    subtitle: '4-diode AC-to-DC converter with live ripple switch',
    description:
      'Four 1N4148 silicon diodes steer both positive and negative AC half-cycles through load resistor R1 in the same direction. Switch SW1 engages smoothing capacitor C1 to convert pulsating DC into low-ripple DC.',
    formula: 'V_dc ≈ V_pk − 2·V_f   |   V_ripple ≈ I_load / (2·f·C)',
    tips: [
      'Click switch SW1 directly on the schematic to disconnect C1 and watch unfiltered 120 Hz half-sine pulses appear.',
      'Lower R1 (heavier load) to watch capacitor ripple voltage deepen in real time.',
    ],
    simConfig: {
      dt: 1.2e-4,
      simRate: 0.04,
      initialMode: 'zero',
      scopeTimeDiv: 0.005, // 5 ms/div
      scopeVoltsDiv: 5.0,
      triggerChannel: 2,
      triggerLevel: 0.0,
      defaultInstrument: 'scope',
    },
    components: [
      { id: 'v1', type: 'voltage_source', designator: 'V1', gx: -14, gy: 0, params: { waveform: 'sine', dc: 0, amplitude: 12, frequency: 60 } },
      { id: 'd1', type: 'diode', designator: 'D1', gx: -6, gy: -2, rotation: 270, params: { model: 'silicon' } },
      { id: 'd2', type: 'diode', designator: 'D2', gx: -6, gy: 2, rotation: 270, params: { model: 'silicon' } },
      { id: 'd3', type: 'diode', designator: 'D3', gx: 0, gy: -2, rotation: 270, params: { model: 'silicon' } },
      { id: 'd4', type: 'diode', designator: 'D4', gx: 0, gy: 2, rotation: 270, params: { model: 'silicon' } },
      { id: 'sw1', type: 'switch', designator: 'SW1', gx: 6, gy: -2, rotation: 90, params: { closed: true } },
      { id: 'c1', type: 'capacitor', designator: 'C1', gx: 6, gy: 2, rotation: 90, params: { capacitance: 220e-6 } },
      { id: 'r1', type: 'resistor', designator: 'R1', gx: 12, gy: 0, rotation: 90, params: { resistance: 470, powerRating: 1.0 } },
      { id: 'gnd1', type: 'ground', designator: 'GND', gx: 12, gy: 4 },
      { id: 'tp1', type: 'probe', designator: 'TP1', gx: 12, gy: -4, params: { channel: 1, label: 'DC Out' } },
      { id: 'tp2', type: 'probe', designator: 'TP2', gx: -10, gy: -2, params: { channel: 2, label: 'AC In' } },
    ],
    wires: [
      // AC feed to bridge midpoints
      w('w1', -14, -2, -10, -2),
      w('w2', -10, -2, -10, 0),
      w('w3', -10, 0, -6, 0),
      w('w4', -14, 2, -14, 6),
      w('w5', -14, 6, -3, 6),
      w('w6', -3, 6, -3, 0),
      w('w7', -3, 0, 0, 0),

      // DC rails
      w('w8', -6, -4, 12, -4),
      w('w9', -6, 4, 12, 4),

      // Load connections
      w('w10', 12, -4, 12, -2),
      w('w11', 12, 2, 12, 4),
    ],
  }),

  // =========================================================================
  // 3. SALLEN-KEY 2ND-ORDER ACTIVE LOW-PASS FILTER
  // =========================================================================
  makePreset({
    id: 'sallen-key-filter',
    name: 'Sallen-Key Low-Pass Filter',
    category: 'Filters & Audio',
    subtitle: '2nd-order active Op-Amp filter with live Q-factor tuning',
    description:
      'A classic unity/non-inverting Sallen-Key topology yielding a steep −40 dB/decade rolloff above 1 kHz. Feedback potentiometer RV1 sets passband gain K = 1/w, sweeping the response from overdamped to Butterworth to resonant Chebyshev.',
    formula: 'f_0 = 1 / (2π·R·C) ≈ 1.0 kHz   |   Q = 1 / (3 − K)',
    tips: [
      'Open the AC Bode Plot tab below to inspect the live −40 dB/decade rolloff and exact −3 dB cutoff.',
      'Drag RV1 wiper down toward 40% to push K → 2.5 and watch a sharp resonant peak rise at 1 kHz!',
    ],
    simConfig: {
      dt: 1.5e-5,
      simRate: 0.0025,
      initialMode: 'dc',
      scopeTimeDiv: 0.0005, // 500 us/div
      scopeVoltsDiv: 2.0,
      triggerChannel: 1,
      triggerLevel: 0.0,
      defaultInstrument: 'bode',
      bodeStart: 10,
      bodeStop: 100000,
    },
    components: [
      { id: 'v1', type: 'voltage_source', designator: 'V1', gx: -17, gy: 0, params: { waveform: 'sine', dc: 0, amplitude: 2, frequency: 1000, acMag: 1 } },
      { id: 'gnd1', type: 'ground', designator: 'GND', gx: -17, gy: 6 },
      { id: 'r1', type: 'resistor', designator: 'R1', gx: -10, gy: -2, params: { resistance: 1600 } },
      { id: 'r2', type: 'resistor', designator: 'R2', gx: -4, gy: -2, params: { resistance: 1600 } },
      { id: 'c1', type: 'capacitor', designator: 'C1', gx: 0, gy: -6, params: { capacitance: 100e-9 } },
      { id: 'c2', type: 'capacitor', designator: 'C2', gx: -2, gy: 2, rotation: 90, params: { capacitance: 100e-9 } },
      { id: 'u1', type: 'opamp', designator: 'U1', gx: 2, gy: -1, params: { gain: 1e5, vPos: 12, vNeg: -12 } },
      { id: 'rv1', type: 'potentiometer', designator: 'RV1', gx: 6, gy: 3, rotation: 270, params: { resistance: 10000, wiper: 0.63 } },
      { id: 'tp1', type: 'probe', designator: 'TP1', gx: -17, gy: -2, params: { channel: 1, label: 'Input' } },
      { id: 'tp2', type: 'probe', designator: 'TP2', gx: 9, gy: -1, params: { channel: 2, label: 'LPF Out' } },
    ],
    wires: [
      w('w1', -17, -2, -12, -2),
      w('w2', -8, -2, -6, -2),
      w('w3', -2, -2, 0, -2),
      w('w4', -17, 2, -17, 6),
      w('w5', -17, 6, 6, 6),
      w('w6', -2, -2, -2, 0),
      w('w7', -2, 4, -2, 6),
      // Positive feedback cap C1
      w('w8', -7, -2, -7, -6),
      w('w9', -7, -6, -2, -6),
      w('w10', 2, -6, 6, -6),
      w('w11', 6, -6, 6, -1),
      // Op-Amp out & gain divider RV1
      w('w12', 4, -1, 9, -1),
      w('w13', 6, -1, 6, 1),
      w('w14', 6, 5, 6, 6),
      w('w15', 4, 3, 0, 3),
      w('w16', 0, 3, 0, 0),
    ],
  }),

  // =========================================================================
  // 4. RLC RESONANT TANK & DAMPING LAB
  // =========================================================================
  makePreset({
    id: 'rlc-resonator',
    name: 'RLC Resonant Tank Lab',
    category: 'Filters & Audio',
    subtitle: 'Underdamped, critical & overdamped step response',
    description:
      'A series RLC circuit excited by a 150 Hz square wave. Drag damping potentiometer RV1 across the critical resistance R_crit = 2·√(L/C) = 200 Ω to transition smoothly from resonant ringing to critical damping.',
    formula: 'f_0 = 1 / (2π√LC) = 1.59 kHz   |   R_crit = 2√(L/C) = 200 Ω',
    tips: [
      'Drag RV1 toward 2% (20 Ω) for dramatic high-Q ringing, then to 20% (200 Ω) for textbook critical damping.',
      'Switch to the AC Bode Plot tab to measure the sharp resonant gain peak right at 1.59 kHz.',
    ],
    simConfig: {
      dt: 1.5e-5,
      simRate: 0.005,
      initialMode: 'zero',
      scopeTimeDiv: 0.001, // 1 ms/div
      scopeVoltsDiv: 2.5,
      triggerChannel: 1,
      triggerLevel: 0.0,
      defaultInstrument: 'scope',
      bodeStart: 50,
      bodeStop: 50000,
    },
    components: [
      { id: 'v1', type: 'voltage_source', designator: 'V1', gx: -12, gy: 0, params: { waveform: 'square', dc: 0, amplitude: 5, frequency: 150, acMag: 1 } },
      { id: 'gnd1', type: 'ground', designator: 'GND', gx: -12, gy: 5 },
      { id: 'rv1', type: 'potentiometer', designator: 'RV1', gx: -6, gy: -2, params: { resistance: 1000, wiper: 0.04 } },
      { id: 'l1', type: 'inductor', designator: 'L1', gx: 1, gy: -2, params: { inductance: 10e-3, seriesResistance: 2 } },
      { id: 'c1', type: 'capacitor', designator: 'C1', gx: 6, gy: 1, rotation: 90, params: { capacitance: 1e-6 } },
      { id: 'tp1', type: 'probe', designator: 'TP1', gx: -10, gy: -2, params: { channel: 1, label: 'Step In' } },
      { id: 'tp2', type: 'probe', designator: 'TP2', gx: 6, gy: -2, params: { channel: 2, label: 'Vc Ring' } },
    ],
    wires: [
      w('w1', -12, -2, -8, -2),
      w('w2', -6, -4, -4, -4),
      w('w3', -4, -4, -4, -2),
      w('w4', -4, -2, -1, -2),
      w('w5', 3, -2, 6, -2),
      w('w6', 6, -2, 6, -1),
      w('w7', 6, 3, 6, 5),
      w('w8', -12, 2, -12, 5),
      w('w9', -12, 5, 6, 5),
    ],
  }),

  // =========================================================================
  // 5. DIODE SOFT-CLIPPER (ANALOG GUITAR OVERDRIVE)
  // =========================================================================
  makePreset({
    id: 'diode-clipper',
    name: 'Diode Soft-Clipper Overdrive',
    category: 'Nonlinear',
    subtitle: 'Anti-parallel silicon overdrive with live audio output',
    description:
      'The core harmonic-saturation stage found in classic overdrive pedals (like the Tube Screamer). Anti-parallel diodes D1 and D2 smoothly round waveform peaks near ±0.68 V as you increase input drive RV1.',
    formula: 'V_clip ≈ ±n·V_T·ln(I / I_s) ≈ ±0.68 V',
    tips: [
      'Drag Drive potentiometer RV1 from 10% (clean sine) to 95% (rich symmetrical clipping).',
      'Click the Audio button in the top toolbar to hear the live simulated 440 Hz tone distort in real time!',
    ],
    simConfig: {
      dt: 2.5e-5,
      simRate: 0.004,
      initialMode: 'dc',
      scopeTimeDiv: 0.0005, // 500 us/div
      scopeVoltsDiv: 1.0,
      triggerChannel: 2,
      triggerLevel: 0.0,
      defaultInstrument: 'scope',
    },
    components: [
      { id: 'v1', type: 'voltage_source', designator: 'V1', gx: -12, gy: 1, params: { waveform: 'sine', dc: 0, amplitude: 5, frequency: 440, acMag: 1 } },
      { id: 'gnd1', type: 'ground', designator: 'GND', gx: -12, gy: 5 },
      { id: 'rv1', type: 'potentiometer', designator: 'RV1', gx: -6, gy: 3, params: { resistance: 1000, wiper: 0.7 } },
      { id: 'r1', type: 'resistor', designator: 'R1', gx: -1, gy: 1, params: { resistance: 2200 } },
      { id: 'd1', type: 'diode', designator: 'D1', gx: 4, gy: 3, rotation: 90, params: { model: 'silicon' } },
      { id: 'd2', type: 'diode', designator: 'D2', gx: 7, gy: 3, rotation: 270, params: { model: 'silicon' } },
      { id: 'r2', type: 'resistor', designator: 'R2', gx: 10, gy: 3, rotation: 90, params: { resistance: 10000 } },
      { id: 'tp1', type: 'probe', designator: 'TP1', gx: 10, gy: 1, params: { channel: 1, label: 'Clipped' } },
      { id: 'tp2', type: 'probe', designator: 'TP2', gx: -6, gy: 1, params: { channel: 2, label: 'Drive In' } },
    ],
    wires: [
      w('w1', -12, -1, -4, -1),
      w('w2', -4, -1, -4, 3),
      w('w3', -12, 3, -12, 5),
      w('w4', -12, 5, 10, 5),
      w('w5', -8, 3, -8, 5),
      w('w6', -6, 1, -3, 1),
      w('w7', 1, 1, 10, 1),
    ],
  }),

  // =========================================================================
  // 6. COMMON-EMITTER BJT VOLTAGE AMPLIFIER
  // =========================================================================
  makePreset({
    id: 'bjt-amplifier',
    name: 'Common-Emitter Amplifier',
    category: 'Amplifiers',
    subtitle: 'Class-A NPN gain stage with switchable emitter bypass',
    description:
      'Voltage-divider biased NPN amplifier demonstrating exact DC operating point biasing, 180° AC phase inversion, and high-pass coupling rolloff. Close SW1 to bypass RE with CE and boost small-signal gain dramatically.',
    formula: 'A_v ≈ −(R_C ∥ R_L) / R_E  (SW1 open)  |  −g_m·(R_C ∥ R_L)  (SW1 closed)',
    tips: [
      'Compare CH1 (Output) and CH2 (Input): notice the crisp 180° phase inversion!',
      'Click switch SW1 to connect emitter bypass capacitor CE and watch gain leap (and clip if V1 amplitude is raised).',
    ],
    simConfig: {
      dt: 1.8e-5,
      simRate: 0.003,
      initialMode: 'dc',
      scopeTimeDiv: 0.0005,
      scopeVoltsDiv: 0.5,
      triggerChannel: 2,
      triggerLevel: 0.0,
      defaultInstrument: 'scope',
      bodeStart: 1,
      bodeStop: 100000,
    },
    components: [
      { id: 'vcc', type: 'voltage_source', designator: 'VCC', gx: 12, gy: 0, params: { waveform: 'dc', dc: 12, acMag: 0 } },
      { id: 'gnd1', type: 'ground', designator: 'GND', gx: 12, gy: 7 },
      { id: 'vin', type: 'voltage_source', designator: 'VIN', gx: -14, gy: 1, params: { waveform: 'sine', dc: 0, amplitude: 0.12, frequency: 1000, acMag: 1 } },
      { id: 'c1', type: 'capacitor', designator: 'C1', gx: -10, gy: -1, params: { capacitance: 10e-6 } },
      { id: 'r1', type: 'resistor', designator: 'R1', gx: -5, gy: -4, rotation: 90, params: { resistance: 33000 } },
      { id: 'r2', type: 'resistor', designator: 'R2', gx: -5, gy: 3, rotation: 90, params: { resistance: 6800 } },
      { id: 'q1', type: 'npn', designator: 'Q1', gx: 0, gy: -1, params: { betaF: 150 } },
      { id: 'rc', type: 'resistor', designator: 'RC', gx: 1, gy: -5, rotation: 90, params: { resistance: 2200 } },
      { id: 're', type: 'resistor', designator: 'RE', gx: 1, gy: 4, rotation: 90, params: { resistance: 470 } },
      { id: 'sw1', type: 'switch', designator: 'SW1', gx: 5, gy: 1, rotation: 0, params: { closed: false } },
      { id: 'ce', type: 'capacitor', designator: 'CE', gx: 5, gy: 4, rotation: 90, params: { capacitance: 47e-6 } },
      { id: 'c2', type: 'capacitor', designator: 'C2', gx: 5, gy: -3, params: { capacitance: 10e-6 } },
      { id: 'rl', type: 'resistor', designator: 'RL', gx: 9, gy: 2, rotation: 90, params: { resistance: 10000 } },
      { id: 'tp1', type: 'probe', designator: 'TP1', gx: 9, gy: -3, params: { channel: 1, label: 'V_out' } },
      { id: 'tp2', type: 'probe', designator: 'TP2', gx: -14, gy: -1, params: { channel: 2, label: 'V_in' } },
    ],
    wires: [
      // Rails
      w('w1', -5, -7, 12, -7),
      w('w2', 12, -7, 12, -2),
      w('w3', 12, 2, 12, 7),
      w('w4', -14, 7, 12, 7),

      // Input & Bias
      w('w5', -14, -1, -12, -1),
      w('w6', -14, 3, -14, 7),
      w('w7', -8, -1, -2, -1),
      w('w8', -5, -7, -5, -6),
      w('w9a', -5, -2, -5, -1),
      w('w9b', -5, -1, -5, 1),
      w('w10', -5, 5, -5, 7),

      // Emitter + Switchable Bypass Branch
      w('w11', 1, 1, 1, 2),
      w('w12', 1, 6, 1, 7),
      w('w13', 1, 1, 3, 1),
      w('w14', 7, 1, 7, 2),
      w('w15', 7, 2, 5, 2),
      w('w16', 5, 6, 5, 7),

      // Collector & AC Output
      w('w17', 1, -3, 3, -3),
      w('w18', 7, -3, 9, -3),
      w('w19', 9, -3, 9, 0),
      w('w20', 9, 4, 9, 7),
    ],
  }),

  // =========================================================================
  // 7. SCHMITT TRIGGER RELAXATION OSCILLATOR
  // =========================================================================
  makePreset({
    id: 'schmitt-oscillator',
    name: 'Schmitt Relaxation Oscillator',
    category: 'Oscillators',
    subtitle: 'Op-Amp square + exponential triangle wave generator',
    description:
      'Positive feedback (R1, R2) creates ±5 V hysteresis thresholds while negative RC feedback (RV1, C1) continuously charges and discharges between them, synthesizing synchronized square and triangle waves with zero external clock.',
    formula: 'f = 1 / (2·R·C·ln((1+β)/(1−β)))   where β = R2 / (R1 + R2)',
    tips: [
      'Drag RV1 right on the canvas to tune pitch continuously across an octave+.',
      'Enable Audio Output to hear the pure analog relaxation square wave!',
    ],
    simConfig: {
      dt: 2.0e-5,
      simRate: 0.004,
      initialMode: 'zero',
      scopeTimeDiv: 0.001, // 1 ms/div
      scopeVoltsDiv: 5.0,
      triggerChannel: 1,
      triggerLevel: 0.0,
      defaultInstrument: 'scope',
    },
    components: [
      { id: 'u1', type: 'opamp', designator: 'U1', gx: 0, gy: 0, params: { gain: 1e5, vPos: 10, vNeg: -10, rOut: 50 } },
      { id: 'r1', type: 'resistor', designator: 'R1', gx: 0, gy: -5, params: { resistance: 10000 } },
      { id: 'r2', type: 'resistor', designator: 'R2', gx: -7, gy: -2, rotation: 90, params: { resistance: 10000 } },
      { id: 'rv1', type: 'potentiometer', designator: 'RV1', gx: 0, gy: 4, params: { resistance: 20000, wiper: 0.45 } },
      { id: 'c1', type: 'capacitor', designator: 'C1', gx: -4, gy: 7, rotation: 90, params: { capacitance: 100e-9, initialVoltage: 0.6 } },
      { id: 'gnd1', type: 'ground', designator: 'GND', gx: -4, gy: 9 },
      { id: 'tp1', type: 'probe', designator: 'TP1', gx: 5, gy: 0, params: { channel: 1, label: 'Square' } },
      { id: 'tp2', type: 'probe', designator: 'TP2', gx: -4, gy: 4, params: { channel: 2, label: 'Triangle' } },
    ],
    wires: [
      // Output bus
      w('w1', 2, 0, 5, 0),
      w('w2', 4, 0, 4, -5),
      w('w3', 4, -5, 2, -5),
      w('w4', 4, 0, 4, 4),
      w('w5', 4, 4, 2, 4),

      // Positive feedback hysteresis divider
      w('w6', -7, -5, -2, -5),
      w('w7', -7, -5, -7, -4),
      w('w8', -4, -5, -4, -1),
      w('w9', -4, -1, -2, -1),

      // Negative RC feedback
      w('w10', 0, 2, 2, 2),
      w('w11', 2, 2, 2, 4),
      w('w12', -4, 4, -2, 4),
      w('w13', -4, 4, -4, 1),
      w('w14', -4, 1, -2, 1),
      w('w15', -4, 4, -4, 5),

      // Ground
      w('w16', -7, 0, -7, 9),
      w('w17', -7, 9, -4, 9),
    ],
  }),

  // =========================================================================
  // 8. RC PHASE SHIFTER & X-Y LISSAJOUS LAB
  // =========================================================================
  makePreset({
    id: 'rc-lissajous',
    name: 'Phase Shifter & Lissajous',
    category: 'Filters & Audio',
    subtitle: '2-stage RC network for phase lag & X-Y Lissajous figures',
    description:
      'Cascaded RC stages introduce frequency-dependent phase lag up to −180°. Switch the Oscilloscope into X-Y Mode and drag RV1 to morph the glowing Lissajous figure between a diagonal line, ellipse, and circle.',
    formula: 'φ(f) = −arctan(2πfRC) per stage',
    tips: [
      'Click the "X-Y" button in the Oscilloscope toolbar to view CH1 vs CH2 as an analog Lissajous figure!',
      'Drag RV1 to rotate and expand the phase ellipse continuously.',
    ],
    simConfig: {
      dt: 1.2e-5,
      simRate: 0.0025,
      initialMode: 'dc',
      scopeTimeDiv: 0.0005,
      scopeVoltsDiv: 2.0,
      triggerChannel: 1,
      triggerLevel: 0.0,
      defaultInstrument: 'scope',
      xyMode: true,
      bodeStart: 10,
      bodeStop: 200000,
    },
    components: [
      { id: 'v1', type: 'voltage_source', designator: 'V1', gx: -12, gy: 0, params: { waveform: 'sine', dc: 0, amplitude: 5, frequency: 1000, acMag: 1 } },
      { id: 'gnd1', type: 'ground', designator: 'GND', gx: -12, gy: 5 },
      { id: 'rv1', type: 'potentiometer', designator: 'RV1', gx: -6, gy: -2, params: { resistance: 5000, wiper: 0.35 } },
      { id: 'c1', type: 'capacitor', designator: 'C1', gx: -1, gy: 1, rotation: 90, params: { capacitance: 100e-9 } },
      { id: 'r2', type: 'resistor', designator: 'R2', gx: 3, gy: -2, params: { resistance: 1600 } },
      { id: 'c2', type: 'capacitor', designator: 'C2', gx: 7, gy: 1, rotation: 90, params: { capacitance: 100e-9 } },
      { id: 'tp1', type: 'probe', designator: 'TP1', gx: -10, gy: -2, params: { channel: 1, label: 'Source' } },
      { id: 'tp2', type: 'probe', designator: 'TP2', gx: 7, gy: -2, params: { channel: 2, label: '−90° Out' } },
      { id: 'tp3', type: 'probe', designator: 'TP3', gx: -1, gy: -2, params: { channel: 3, label: 'Stage 1' } },
    ],
    wires: [
      w('w1', -12, -2, -8, -2),
      w('w2', -6, -4, -4, -4),
      w('w3', -4, -4, -4, -2),
      w('w4', -4, -2, 1, -2),
      w('w5', -1, -2, -1, -1),
      w('w6', -1, 3, -1, 5),
      w('w7', 5, -2, 7, -2),
      w('w8', 7, -2, 7, -1),
      w('w9', 7, 3, 7, 5),
      w('w10', -12, 2, -12, 5),
      w('w11', -12, 5, 7, 5),
    ],
  }),

  // =========================================================================
  // 9. CMOS INVERTER (PMOS + NMOS)
  // =========================================================================
  makePreset({
    id: 'cmos-inverter',
    name: 'CMOS Inverter (PMOS + NMOS)',
    category: 'Digital & MOSFET',
    subtitle: 'Complementary MOSFET logic gate driven by a triangle ramp',
    description:
      'A real physical CMOS inverter built from paired P-channel and N-channel MOSFETs. Watch the output snap cleanly between 5 V and 0 V as the input triangle wave crosses the 2.5 V threshold.',
    formula: 'V_out = HIGH when V_in < V_DD/2   |   V_out = LOW when V_in > V_DD/2',
    tips: [
      'Watch CH1 (triangle input) and CH2 (sharp inverted rail-to-rail output) on the scope.',
      'Adjust M1 or M2 threshold voltage (Vth) to shift the switching midpoint.',
    ],
    simConfig: {
      dt: 2e-5,
      simRate: 0.004,
      initialMode: 'dc',
      scopeTimeDiv: 0.0005,
      scopeVoltsDiv: 2.0,
      triggerChannel: 1,
      triggerLevel: 2.5,
      defaultInstrument: 'scope',
    },
    components: [
      { id: 'vdd', type: 'voltage_source', designator: 'VDD', gx: -10, gy: -2, params: { waveform: 'dc', dc: 5, acMag: 0 } },
      { id: 'gnd1', type: 'ground', designator: 'GND', gx: -10, gy: 6 },
      { id: 'vin', type: 'voltage_source', designator: 'VIN', gx: -6, gy: 2, params: { waveform: 'triangle', dc: 2.5, amplitude: 2.5, frequency: 500, acMag: 1 } },
      { id: 'm1', type: 'pmos', designator: 'M1', gx: 2, gy: -2, params: { vth: 1.5, kp: 0.08 } },
      { id: 'm2', type: 'nmos', designator: 'M2', gx: 2, gy: 4, params: { vth: 1.5, kp: 0.08 } },
      { id: 'c1', type: 'capacitor', designator: 'CL', gx: 8, gy: 3, rotation: 90, params: { capacitance: 10e-9 } },
      { id: 'tp1', type: 'probe', designator: 'TP1', gx: -2, gy: 0, params: { channel: 1, label: 'In' } },
      { id: 'tp2', type: 'probe', designator: 'TP2', gx: 8, gy: 1, params: { channel: 2, label: 'Out' } },
    ],
    wires: [
      w('w1', -10, -4, 3, -4),
      w('w2', -10, 0, -10, 6),
      w('w3', -10, 6, 8, 6),
      w('w4', -6, 4, -6, 6),
      w('w5', -6, 0, -2, 0),
      w('w6', -2, -2, -2, 4),
      w('w7', -2, -2, 0, -2),
      w('w8', -2, 4, 0, 4),
      w('w9', 3, 0, 3, 2),
      w('w10', 3, 1, 8, 1),
      w('w11', 8, 5, 8, 6),
    ],
  }),

  // =========================================================================
  // 10. BINARY HALF-ADDER (MIXED-SIGNAL CMOS LOGIC)
  // =========================================================================
  makePreset({
    id: 'half-adder',
    name: 'Binary Half-Adder',
    category: 'Digital & MOSFET',
    subtitle: 'Interactive 1-bit binary adder with XOR (SUM) and AND (CARRY)',
    description:
      'Click inputs A and B directly on the canvas to toggle 0 and 1. Real mixed-signal CMOS gates drive physical LEDs through 220 Ω resistors to compute binary A + B.',
    formula: 'SUM = A ⊕ B   |   CARRY = A · B',
    tips: [
      'Click the A and B input tiles to test all four binary combinations (0+0, 1+0, 0+1, 1+1).',
      'When both A=1 and B=1, SUM turns OFF and CARRY lights up (1 + 1 = 10 in binary).',
    ],
    simConfig: {
      dt: 5e-5,
      simRate: 0.02,
      initialMode: 'dc',
      scopeTimeDiv: 0.005,
      scopeVoltsDiv: 2.0,
      triggerChannel: 1,
      triggerLevel: 2.5,
      defaultInstrument: 'scope',
    },
    components: [
      { id: 'ina', type: 'logic_in', designator: 'A', gx: -10, gy: -3, params: { state: true, vHigh: 5 } },
      { id: 'inb', type: 'logic_in', designator: 'B', gx: -10, gy: 3, params: { state: false, vHigh: 5 } },
      { id: 'u1', type: 'gate_xor', designator: 'XOR1', gx: 0, gy: -2, params: { vdd: 5 } },
      { id: 'u2', type: 'gate_and', designator: 'AND1', gx: 0, gy: 3, params: { vdd: 5 } },
      { id: 'r1', type: 'resistor', designator: 'R1', gx: 5, gy: -2, params: { resistance: 220 } },
      { id: 'led1', type: 'led', designator: 'SUM', gx: 10, gy: -2, params: { color: 'green', nominalCurrent: 0.015 } },
      { id: 'r2', type: 'resistor', designator: 'R2', gx: 5, gy: 3, params: { resistance: 220 } },
      { id: 'led2', type: 'led', designator: 'CARRY', gx: 10, gy: 3, params: { color: 'amber', nominalCurrent: 0.015 } },
      { id: 'gnd1', type: 'ground', designator: 'GND', gx: 12, gy: 5 },
      { id: 'tp1', type: 'probe', designator: 'TP1', gx: 2, gy: -2, params: { channel: 1, label: 'SUM' } },
      { id: 'tp2', type: 'probe', designator: 'TP2', gx: 2, gy: 3, params: { channel: 2, label: 'CARRY' } },
    ],
    wires: [
      w('w1', -8, -3, -2, -3),
      w('w2', -6, -3, -6, 2),
      w('w3', -6, 2, -2, 2),
      w('w4', -8, 3, -4, 3),
      w('w5', -4, -1, -4, 4),
      w('w6', -4, -1, -2, -1),
      w('w7', -4, 4, -2, 4),
      w('w8', 2, -2, 3, -2),
      w('w9', 7, -2, 8, -2),
      w('w10', 2, 3, 3, 3),
      w('w11', 7, 3, 8, 3),
      w('w12', 12, -2, 12, 5),
    ],
  }),

  // =========================================================================
  // 11. TRANSFORMER STEP-DOWN 5V ZENER POWER SUPPLY
  // =========================================================================
  makePreset({
    id: 'transformer-psu',
    name: '5V Zener Power Supply',
    category: 'Power',
    subtitle: '120V AC step-down transformer, rectifier, filter & Zener regulator',
    description:
      'A complete isolated linear power supply: transformer T1 steps 120 Vpk mains down 10:1 to 12 Vpk, diode D1 and capacitor C1 rectify & smooth it, and Zener diode Z1 clamps the output to a steady 5.1 V.',
    formula: 'V_sec = N · V_pri   |   V_out ≈ V_z = 5.1 V',
    tips: [
      'Read the regulated DC output live right on inline Voltmeter VM1.',
      'Select Z1 to change the Zener voltage (e.g. 3.3 V or 6.8 V) and watch VM1 track it instantly.',
    ],
    simConfig: {
      dt: 1.5e-4,
      simRate: 0.04,
      initialMode: 'zero',
      scopeTimeDiv: 0.005,
      scopeVoltsDiv: 5.0,
      triggerChannel: 2,
      triggerLevel: 0.0,
      defaultInstrument: 'scope',
    },
    components: [
      { id: 'v1', type: 'voltage_source', designator: 'AC', gx: -16, gy: 0, params: { waveform: 'sine', dc: 0, amplitude: 120, frequency: 60 } },
      { id: 'gnd1', type: 'ground', designator: 'GND', gx: -16, gy: 4 },
      { id: 't1', type: 'transformer', designator: 'T1', gx: -10, gy: 0, params: { ratio: 0.1, rWinding: 0.2 } },
      { id: 'gnd2', type: 'ground', designator: 'GND', gx: -8, gy: 4 },
      { id: 'd1', type: 'diode', designator: 'D1', gx: -4, gy: -2, params: { model: 'silicon' } },
      { id: 'c1', type: 'capacitor', designator: 'C1', gx: 0, gy: 1, rotation: 90, params: { capacitance: 470e-6 } },
      { id: 'r1', type: 'resistor', designator: 'R1', gx: 4, gy: -2, params: { resistance: 220, powerRating: 1.0 } },
      { id: 'z1', type: 'diode', designator: 'Z1', gx: 8, gy: 1, rotation: 270, params: { model: 'zener', vBreakdown: 5.1 } },
      { id: 'vm1', type: 'voltmeter', designator: 'VM1', gx: 12, gy: 1, rotation: 90 },
      { id: 'tp1', type: 'probe', designator: 'TP1', gx: 12, gy: -2, params: { channel: 1, label: '5V Out' } },
      { id: 'tp2', type: 'probe', designator: 'TP2', gx: -6, gy: -2, params: { channel: 2, label: 'Sec AC' } },
    ],
    wires: [
      w('w1', -16, -2, -12, -2),
      w('w2', -16, 2, -12, 2),
      w('w3', -16, 2, -16, 4),
      w('w4', -8, -2, -6, -2),
      w('w5', -8, 2, -8, 4),
      w('w6', -8, 4, 12, 4),
      w('w7', -2, -2, 2, -2),
      w('w8', 0, -2, 0, -1),
      w('w9', 0, 3, 0, 4),
      w('w10', 6, -2, 12, -2),
      w('w11', 8, -2, 8, -1),
      w('w12', 8, 3, 8, 4),
      w('w13', 12, -2, 12, -1),
      w('w14', 12, 3, 12, 4),
    ],
  }),
];

export function getPresetById(id) {
  return PRESET_CIRCUITS.find((p) => p.id === id) || PRESET_CIRCUITS[0];
}
