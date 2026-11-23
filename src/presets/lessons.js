/**
 * Wirebench Interactive Learn Mode Curriculum (6 Visual Storybook Labs)
 *
 * Designed for instant visual intuition ("Show, Don't Explain"):
 * - Ultra-short, warm, beginner-friendly prompts (EN & TR)
 * - Soft golden on-canvas spotlight pointing directly at the interactive part
 * - Synchronized tactile controls + glowing sweet-spot star meter
 * - Optional on-demand live formula (`fx`) - zero textbook clutter by default
 * - Every goal verified directly against live MNA solver telemetry
 */

import { formatSI } from '../engine/units.js';

function getCompCurrent(ctx, id) {
  const m = ctx.eval?.compMetrics?.get(id);
  return m ? Math.abs(m.current) : 0;
}

function getCompVoltage(ctx, id) {
  const m = ctx.eval?.compMetrics?.get(id);
  return m ? m.voltage : 0;
}

function getComp(ctx, id) {
  return ctx.schematic?.components?.find((c) => c.id === id) || null;
}

function getProbeStats(ctx, ch) {
  if (!ctx.simulator || !ctx.netlist) return null;
  const probe = ctx.netlist.probes.find((p) => p.channel === ch);
  if (!probe) return null;
  const hist = ctx.simulator.getWaveformHistory();
  if (!hist || hist.count < 4) return null;
  const samples = hist.channels[ch];
  if (!samples) return null;
  const n = hist.count;
  const start = Math.max(0, n - 400);
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (let i = start; i < n; i++) {
    const v = samples[i];
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  const count = n - start;
  return { min, max, avg: sum / count, vpp: max - min, latest: samples[n - 1] };
}

export const LESSONS = [
  // =========================================================================
  // LAB 1: OHM'S LAW & LEDs
  // =========================================================================
  {
    id: 'lesson-1-ohms-law',
    number: 1,
    title: { en: "Ohm's Law & LED", tr: 'Ohm ve LED Işığı' },
    concept: { en: 'I = V / R', tr: 'I = V / R' },
    summary: {
      en: 'Wake a tiny ruby LED and keep its glow happy.',
      tr: 'Küçük yakut LED’i uyandır ve ışığını dengede tut.',
    },
    showScope: false,
    build() {
      return {
        name: "Lab 1: Ohm's Law & LEDs",
        simConfig: {
          dt: 5e-5,
          simRate: 0.01,
          initialMode: 'dc',
          scopeTimeDiv: 0.005,
          scopeVoltsDiv: 2,
          triggerChannel: 1,
          triggerLevel: 0,
        },
        components: [
          { id: 'v1', type: 'voltage_source', designator: 'V1', gx: -12, gy: 0, rotation: 0, params: { waveform: 'dc', dc: 9, amplitude: 0, frequency: 1000, phase: 0, duty: 0.5, acMag: 0 } },
          { id: 'sw1', type: 'switch', designator: 'SW1', gx: -7, gy: -4, rotation: 0, params: { closed: false, rOn: 0.01, rOff: 1e9 } },
          { id: 'r1', type: 'resistor', designator: 'R1', gx: -1, gy: -4, rotation: 0, params: { resistance: 1000 } },
          { id: 'am1', type: 'ammeter', designator: 'AM1', gx: 5, gy: -4, rotation: 0, params: { rShunt: 0.01 } },
          { id: 'd1', type: 'led', designator: 'D1', gx: 10, gy: 0, rotation: 90, params: { color: 'red', is: 1e-18, n: 1.9 } },
          { id: 'g1', type: 'ground', designator: 'GND', gx: -12, gy: 6, rotation: 0, params: {} },
        ],
        wires: [
          { id: 'w1', x1: -12, y1: -2, x2: -12, y2: -4 },
          { id: 'w2', x1: -12, y1: -4, x2: -9, y2: -4 },
          { id: 'w3', x1: -5, y1: -4, x2: -3, y2: -4 },
          { id: 'w4', x1: 1, y1: -4, x2: 3, y2: -4 },
          { id: 'w5', x1: 7, y1: -4, x2: 10, y2: -4 },
          { id: 'w6', x1: 10, y1: -4, x2: 10, y2: -2 },
          { id: 'w7', x1: 10, y1: 2, x2: 10, y2: 4 },
          { id: 'w8', x1: 10, y1: 4, x2: -12, y2: 4 },
          { id: 'w9', x1: -12, y1: 2, x2: -12, y2: 4 },
          { id: 'w10', x1: -12, y1: 4, x2: -12, y2: 6 },
        ],
      };
    },
    liveFormula(ctx) {
      const v1 = getComp(ctx, 'v1')?.params?.dc ?? 9;
      const r1 = getComp(ctx, 'r1')?.params?.resistance ?? 1000;
      const sw = Boolean(getComp(ctx, 'sw1')?.params?.closed);
      const i = getCompCurrent(ctx, 'am1');
      const vLed = Math.abs(getCompVoltage(ctx, 'd1'));
      if (!sw) {
        return {
          expr: { en: 'SW1 Open  →  I = 0.0 mA', tr: 'SW1 Açık  →  I = 0.0 mA' },
          note: { en: 'Loop is open - no sparks flow yet', tr: 'Devre açık - henüz akım akmıyor' },
        };
      }
      return {
        expr: `I = (${v1.toFixed(1)}V − ${vLed.toFixed(1)}V) / ${formatSI(r1, 'Ω', 3)} = ${(i * 1000).toFixed(1)} mA`,
        note: { en: 'I = V / R  ·  LED takes ~2.0 V', tr: 'I = V / R  ·  LED ~2.0 V alır' },
      };
    },
    goals: [
      {
        id: 'close-loop',
        title: { en: 'Wake the light', tr: 'Işığı uyandır' },
        prompt: {
          en: 'Tap the brass switch to wake the ruby light.',
          tr: 'Yakut ışığı yakmak için pirinç anahtara dokun.',
        },
        callout: { en: 'Tap switch', tr: 'Anahtara dokun' },
        targetCompId: 'sw1',
        controls: [
          { compId: 'sw1', param: 'closed', kind: 'toggle', label: { en: 'Switch SW1', tr: 'SW1 Anahtarı' } },
        ],
        hint: {
          en: 'Click SW1 on the board or flip the switch right here.',
          tr: 'Şemadaki SW1’e dokun ya da buradaki anahtarı çevir.',
        },
        insight: {
          en: 'Bright! Sparks need one unbroken circle to start flowing.',
          tr: 'Harika! Akım yalnızca kesintisiz bir halkada akabilir.',
        },
        check(ctx) {
          return Boolean(getComp(ctx, 'sw1')?.params?.closed) && getCompCurrent(ctx, 'am1') > 0.002;
        },
        reading(ctx) {
          const on = Boolean(getComp(ctx, 'sw1')?.params?.closed);
          return on ? `${(getCompCurrent(ctx, 'am1') * 1000).toFixed(1)} mA` : '0.0 mA';
        },
      },
      {
        id: 'safe-current',
        title: { en: 'Find the sweet glow', tr: 'İdeal parıltıyı bul' },
        prompt: {
          en: 'Slide R1 until the bulb glows in the star zone.',
          tr: 'Ampul yıldız aralığında parlayana kadar R1’i kaydır.',
        },
        callout: { en: 'Slide R1', tr: 'R1’i kaydır' },
        targetCompId: 'r1',
        controls: [
          { compId: 'r1', param: 'resistance', kind: 'slider', log: true, min: 100, max: 2200, unit: 'Ω', label: { en: 'Resistor R1', tr: 'R1 Direnci' } },
        ],
        meter: {
          label: { en: 'LED Glow (AM1)', tr: 'LED Akımı (AM1)' },
          min: 0,
          max: 35,
          targetMin: 15,
          targetMax: 22,
          dangerMin: 28,
          unit: 'mA',
          value: (ctx) => getCompCurrent(ctx, 'am1') * 1000,
        },
        hint: {
          en: 'Try around 390 Ω - too low makes the bulb smoke!',
          tr: '390 Ω civarını dene - çok düşürürsen ampul tüter!',
        },
        insight: {
          en: 'Less resistance lets more sparks through - Ohm’s Law in action!',
          tr: 'Direnç azaldıkça akım artar - işte canlı Ohm Kanunu!',
        },
        check(ctx) {
          const i = getCompCurrent(ctx, 'am1');
          return i >= 0.0148 && i <= 0.0222;
        },
        reading(ctx) {
          return `${(getCompCurrent(ctx, 'am1') * 1000).toFixed(1)} mA`;
        },
      },
      {
        id: 'rebalance-12v',
        title: { en: 'Tame a 12 V battery', tr: '12 V pili dengele' },
        prompt: {
          en: 'Raise V1 to 12 V, then calm the glow with R1.',
          tr: 'V1’i 12 V yap, sonra R1 ile ışığı tekrar dengele.',
        },
        callout: { en: 'Set V1 → 12V', tr: 'V1 → 12V yap' },
        targetCompId: 'v1',
        controls: [
          { compId: 'v1', param: 'dc', kind: 'slider', log: false, min: 5, max: 15, step: 0.5, unit: 'V', label: { en: 'Battery V1', tr: 'V1 Pili' } },
          { compId: 'r1', param: 'resistance', kind: 'slider', log: true, min: 150, max: 2200, unit: 'Ω', label: { en: 'Resistor R1', tr: 'R1 Direnci' } },
        ],
        meter: {
          label: { en: 'LED Glow (AM1)', tr: 'LED Akımı (AM1)' },
          min: 0,
          max: 35,
          targetMin: 15,
          targetMax: 22,
          dangerMin: 28,
          unit: 'mA',
          value: (ctx) => getCompCurrent(ctx, 'am1') * 1000,
        },
        hint: {
          en: 'Set V1 to 12 V, then slide R1 near 560 Ω.',
          tr: 'V1’i 12 V yap, ardından R1’i 560 Ω civarına çek.',
        },
        insight: {
          en: 'Stronger voltage pushes harder, so the bulb needs more resistance.',
          tr: 'Daha güçlü pil daha çok iter; ampulü korumak için direnç de büyür.',
        },
        check(ctx) {
          const v1 = getComp(ctx, 'v1')?.params?.dc ?? 0;
          const i = getCompCurrent(ctx, 'am1');
          return v1 >= 11.5 && i >= 0.0148 && i <= 0.0222;
        },
        reading(ctx) {
          const v1 = getComp(ctx, 'v1')?.params?.dc ?? 0;
          return `${v1.toFixed(1)} V · ${(getCompCurrent(ctx, 'am1') * 1000).toFixed(1)} mA`;
        },
      },
    ],
  },

  // =========================================================================
  // LAB 2: VOLTAGE DIVIDERS
  // =========================================================================
  {
    id: 'lesson-2-voltage-divider',
    number: 2,
    title: { en: 'Voltage Divider', tr: 'Gerilim Bölücü' },
    concept: { en: 'Vout = Vin · α', tr: 'Vout = Vin · α' },
    summary: {
      en: 'Turn a brass dial to slice 10 V into any voltage.',
      tr: 'Pirinç düğmeyi çevirip 10 V’u istediğin gerilime böl.',
    },
    showScope: false,
    build() {
      return {
        name: 'Lab 2: Voltage Divider',
        simConfig: {
          dt: 5e-5,
          simRate: 0.01,
          initialMode: 'dc',
          scopeTimeDiv: 0.005,
          scopeVoltsDiv: 2,
          triggerChannel: 1,
          triggerLevel: 0,
        },
        components: [
          { id: 'v1', type: 'voltage_source', designator: 'V1', gx: -10, gy: 0, rotation: 0, params: { waveform: 'dc', dc: 10, amplitude: 0, frequency: 1000, phase: 0, duty: 0.5, acMag: 0 } },
          { id: 'rv1', type: 'potentiometer', designator: 'RV1', gx: 0, gy: 0, rotation: 90, flipX: true, params: { resistance: 10000, wiper: 0.2 } },
          { id: 'vm1', type: 'voltmeter', designator: 'VM1', gx: 9, gy: 0, rotation: 90, params: { rIn: 1e9 } },
          { id: 'g1', type: 'ground', designator: 'GND', gx: -10, gy: 6, rotation: 0, params: {} },
        ],
        wires: [
          { id: 'w1', x1: -10, y1: -2, x2: -10, y2: -4 },
          { id: 'w2', x1: -10, y1: -4, x2: 0, y2: -4 },
          { id: 'w3', x1: 0, y1: -4, x2: 0, y2: -2 },
          { id: 'w4', x1: 2, y1: 0, x2: 5, y2: 0 },
          { id: 'w5', x1: 5, y1: 0, x2: 5, y2: -2 },
          { id: 'w6', x1: 5, y1: -2, x2: 9, y2: -2 },
          { id: 'w7', x1: 9, y1: 2, x2: 9, y2: 4 },
          { id: 'w8', x1: 9, y1: 4, x2: 0, y2: 4 },
          { id: 'w9', x1: 0, y1: 2, x2: 0, y2: 4 },
          { id: 'w10', x1: 0, y1: 4, x2: -10, y2: 4 },
          { id: 'w11', x1: -10, y1: 2, x2: -10, y2: 4 },
          { id: 'w12', x1: -10, y1: 4, x2: -10, y2: 6 },
        ],
      };
    },
    liveFormula(ctx) {
      const v1 = getComp(ctx, 'v1')?.params?.dc ?? 10;
      const pos = getComp(ctx, 'rv1')?.params?.wiper ?? 0.5;
      const vOut = getCompVoltage(ctx, 'vm1');
      return {
        expr: `Vout = ${v1.toFixed(1)}V × ${Math.round(pos * 100)}% = ${vOut.toFixed(2)} V`,
        note: { en: 'Knob position picks an exact slice of 10 V', tr: 'Düğme konumu 10 V’un tam oranını seçer' },
      };
    },
    goals: [
      {
        id: 'half-voltage',
        title: { en: 'Split 10 V in half', tr: '10 V’u tam ikiye böl' },
        prompt: {
          en: 'Turn the brass knob until the dial reads 5 V.',
          tr: 'İbre tam 5 V’u gösterene kadar düğmeyi çevir.',
        },
        callout: { en: 'Turn knob', tr: 'Düğmeyi çevir' },
        targetCompId: 'rv1',
        controls: [
          { compId: 'rv1', param: 'wiper', kind: 'slider', log: false, min: 0.02, max: 0.98, step: 0.01, unit: '%', scale: 100, label: { en: 'Knob RV1', tr: 'RV1 Düğmesi' } },
        ],
        meter: {
          label: { en: 'Dial (VM1)', tr: 'Çıkış (VM1)' },
          min: 0,
          max: 10,
          targetMin: 4.75,
          targetMax: 5.25,
          unit: 'V',
          value: (ctx) => getCompVoltage(ctx, 'vm1'),
        },
        hint: {
          en: 'Halfway (50%) splits 10 V right down the middle.',
          tr: 'Tam orta (%50), 10 V’u eşit iki parçaya böler.',
        },
        insight: {
          en: 'Half the dial gives half the voltage - a neat ratio!',
          tr: 'Yarı yol, yarı gerilim - pırıl pırıl bir oran!',
        },
        check(ctx) {
          const v = getCompVoltage(ctx, 'vm1');
          return v >= 4.7 && v <= 5.3;
        },
        reading(ctx) {
          return `${getCompVoltage(ctx, 'vm1').toFixed(2)} V`;
        },
      },
      {
        id: 'mcu-rail',
        title: { en: 'Dial a 3.3 V rail', tr: '3.3 V seviyesini yakala' },
        prompt: {
          en: 'Turn the knob gently down to 3.3 V - microchip power.',
          tr: 'Mikroçip gerilimi 3.3 V için düğmeyi yavaşça indir.',
        },
        callout: { en: 'Dial 3.3 V', tr: '3.3 V’a ayarla' },
        targetCompId: 'rv1',
        controls: [
          { compId: 'rv1', param: 'wiper', kind: 'slider', log: false, min: 0.02, max: 0.98, step: 0.01, unit: '%', scale: 100, label: { en: 'Knob RV1', tr: 'RV1 Düğmesi' } },
        ],
        meter: {
          label: { en: 'Dial (VM1)', tr: 'Çıkış (VM1)' },
          min: 0,
          max: 10,
          targetMin: 3.1,
          targetMax: 3.5,
          unit: 'V',
          value: (ctx) => getCompVoltage(ctx, 'vm1'),
        },
        hint: {
          en: '3.3 V is one third of 10 V - try around 33%.',
          tr: '3.3 V, 10 V’un üçte biridir - %33 civarını dene.',
        },
        insight: {
          en: 'Volume knobs and joysticks all use this exact divider trick!',
          tr: 'Ses düğmeleri ve joysticklerin hepsi bu bölme numarasını kullanır!',
        },
        check(ctx) {
          const v = getCompVoltage(ctx, 'vm1');
          return v >= 3.1 && v <= 3.5;
        },
        reading(ctx) {
          return `${getCompVoltage(ctx, 'vm1').toFixed(2)} V`;
        },
      },
    ],
  },

  // =========================================================================
  // LAB 3: CAPACITORS & TIME
  // =========================================================================
  {
    id: 'lesson-3-rc-time',
    number: 3,
    title: { en: 'Capacitors & Time', tr: 'Kondansatör ve Zaman' },
    concept: { en: 'τ = R · C', tr: 'τ = R · C' },
    summary: {
      en: 'Fill and empty a glowing energy jar over time.',
      tr: 'Parlayan enerji kavanozunu zamanla doldurup boşalt.',
    },
    showScope: true,
    build() {
      return {
        name: 'Lab 3: RC Charging Curve',
        simConfig: {
          dt: 2e-4,
          simRate: 0.25,
          initialMode: 'zero',
          scopeTimeDiv: 0.08,
          scopeVoltsDiv: 2,
          triggerChannel: 1,
          triggerLevel: 2.5,
        },
        components: [
          { id: 'v1', type: 'voltage_source', designator: 'V1', gx: -12, gy: -1, rotation: 0, params: { waveform: 'dc', dc: 5, amplitude: 0, frequency: 1000, phase: 0, duty: 0.5, acMag: 0 } },
          { id: 's1', type: 'spdt', designator: 'S1', gx: -5, gy: -2, rotation: 0, flipX: true, params: { position: 1, rOn: 0.05, rOff: 1e9 } },
          { id: 'r1', type: 'resistor', designator: 'R1', gx: 1, gy: -2, rotation: 0, params: { resistance: 1000 } },
          { id: 'c1', type: 'capacitor', designator: 'C1', gx: 6, gy: 1, rotation: 90, params: { capacitance: 100e-6 } },
          { id: 'vm1', type: 'voltmeter', designator: 'VM1', gx: 12, gy: 1, rotation: 90, params: { rIn: 1e9 } },
          { id: 'p1', type: 'probe', designator: 'TP1', gx: 6, gy: -2, rotation: 0, params: { channel: 1, label: 'Vc' } },
          { id: 'g1', type: 'ground', designator: 'GND', gx: -12, gy: 6, rotation: 0, params: {} },
        ],
        wires: [
          { id: 'w1', x1: -12, y1: -3, x2: -7, y2: -3 },
          { id: 'w2', x1: -7, y1: -1, x2: -7, y2: 4 },
          { id: 'w3', x1: -3, y1: -2, x2: -1, y2: -2 },
          { id: 'w4', x1: 3, y1: -2, x2: 6, y2: -2 },
          { id: 'w5', x1: 6, y1: -2, x2: 6, y2: -1 },
          { id: 'w6', x1: 6, y1: -2, x2: 12, y2: -2 },
          { id: 'w7', x1: 12, y1: -2, x2: 12, y2: -1 },
          { id: 'w8', x1: 12, y1: 3, x2: 12, y2: 4 },
          { id: 'w9', x1: 12, y1: 4, x2: 6, y2: 4 },
          { id: 'w10', x1: 6, y1: 3, x2: 6, y2: 4 },
          { id: 'w11', x1: 6, y1: 4, x2: -12, y2: 4 },
          { id: 'w12', x1: -12, y1: 1, x2: -12, y2: 4 },
          { id: 'w13', x1: -12, y1: 4, x2: -12, y2: 6 },
        ],
      };
    },
    liveFormula(ctx) {
      const r = getComp(ctx, 'r1')?.params?.resistance ?? 1000;
      const c = getComp(ctx, 'c1')?.params?.capacitance ?? 100e-6;
      const vc = getCompVoltage(ctx, 'vm1');
      return {
        expr: `τ = R·C = ${formatSI(r * c, 's', 3)}  ·  Vc = ${vc.toFixed(2)} V`,
        note: { en: 'Fills ~99% full in 5·τ seconds', tr: '5·τ sürede ~%99 doluluğa ulaşır' },
      };
    },
    goals: [
      {
        id: 'charge-cap',
        title: { en: 'Fill the energy jar', tr: 'Enerji kabını doldur' },
        prompt: {
          en: 'Flip S1 to Charge and watch C1 fill with light.',
          tr: 'S1’i Şarj’a çevir, C1’in altın ışıkla doluşunu izle.',
        },
        callout: { en: 'Flip to Charge', tr: 'Şarja çevir' },
        targetCompId: 's1',
        controls: [
          { compId: 's1', param: 'position', kind: 'spdt', label: { en: 'Switch S1', tr: 'S1 Konumu' }, optA: { en: 'Charge (5V)', tr: 'Şarj (5V)' }, optB: { en: 'Drain (0V)', tr: 'Deşarj (0V)' } },
        ],
        meter: {
          label: { en: 'Jar Charge (Vc)', tr: 'Doluluk (Vc)' },
          min: 0,
          max: 5.2,
          targetMin: 4.5,
          targetMax: 5.2,
          unit: 'V',
          value: (ctx) => Math.max(0, getCompVoltage(ctx, 'vm1')),
        },
        hint: {
          en: 'Click S1 or tap Charge (5V), then wait a brief second.',
          tr: 'S1’e ya da Şarj (5V) düğmesine dokun ve biraz bekle.',
        },
        insight: {
          en: 'Energy jars never jump instantly - R1 pours charge in smoothly!',
          tr: 'Enerji kabı bir anda dolmaz - R1 yükü yumuşakça akıtır!',
        },
        check(ctx) {
          return getComp(ctx, 's1')?.params?.position === 0 && getCompVoltage(ctx, 'vm1') >= 4.5;
        },
        reading(ctx) {
          return `${getCompVoltage(ctx, 'vm1').toFixed(2)} V`;
        },
      },
      {
        id: 'discharge-cap',
        title: { en: 'Empty the jar gently', tr: 'Kabı yumuşakça boşalt' },
        prompt: {
          en: 'Flip S1 to Drain and watch the golden glow fade.',
          tr: 'S1’i Deşarj’a al ve altın ışığın süzülerek boşalmasını izle.',
        },
        callout: { en: 'Flip to Drain', tr: 'Deşarja çevir' },
        targetCompId: 's1',
        controls: [
          { compId: 's1', param: 'position', kind: 'spdt', label: { en: 'Switch S1', tr: 'S1 Konumu' }, optA: { en: 'Charge (5V)', tr: 'Şarj (5V)' }, optB: { en: 'Drain (0V)', tr: 'Deşarj (0V)' } },
        ],
        meter: {
          label: { en: 'Jar Charge (Vc)', tr: 'Doluluk (Vc)' },
          min: 0,
          max: 5.2,
          targetMin: 0,
          targetMax: 0.5,
          unit: 'V',
          value: (ctx) => Math.max(0, getCompVoltage(ctx, 'vm1')),
        },
        hint: {
          en: 'Tap Drain (0V) to let C1 empty below 0.5 V.',
          tr: 'C1’in 0.5 V altına inmesi için Deşarj (0V)’a dokun.',
        },
        insight: {
          en: 'This gentle curve powers camera flashes, timers, and warm fades.',
          tr: 'Bu zarif eğri flaşları, zamanlayıcıları ve yumuşak geçişleri yönetir.',
        },
        check(ctx) {
          return getComp(ctx, 's1')?.params?.position === 1 && getCompVoltage(ctx, 'vm1') <= 0.5;
        },
        reading(ctx) {
          return `${getCompVoltage(ctx, 'vm1').toFixed(2)} V`;
        },
      },
    ],
  },

  // =========================================================================
  // LAB 4: DIODES - AC TO DC
  // =========================================================================
  {
    id: 'lesson-4-diodes',
    number: 4,
    title: { en: 'Diodes: AC to DC', tr: 'Diyot: AC’den DC’ye' },
    concept: { en: 'One-Way Valve + Filter', tr: 'Tek Yönlü Valf + Filtre' },
    summary: {
      en: 'Turn wavy AC power into calm, steady DC light.',
      tr: 'Dalgalı AC gücünü sakin ve düz DC akışına çevir.',
    },
    showScope: true,
    build() {
      return {
        name: 'Lab 4: Half-Wave Rectifier',
        simConfig: {
          dt: 8e-5,
          simRate: 0.02,
          initialMode: 'zero',
          scopeTimeDiv: 0.005,
          scopeVoltsDiv: 5,
          triggerChannel: 1,
          triggerLevel: 0,
        },
        components: [
          { id: 'v1', type: 'voltage_source', designator: 'V1', gx: -12, gy: 0, rotation: 0, params: { waveform: 'sine', dc: 0, amplitude: 10, frequency: 60, phase: 0, duty: 0.5, acMag: 1 } },
          { id: 'd1', type: 'diode', designator: 'D1', gx: -5, gy: -4, rotation: 0, params: { model: 'silicon' } },
          { id: 'sw1', type: 'switch', designator: 'SW1', gx: 2, gy: -4, rotation: 0, params: { closed: false, rOn: 0.05, rOff: 1e9 } },
          { id: 'c1', type: 'capacitor', designator: 'C1', gx: 6, gy: 0, rotation: 90, params: { capacitance: 220e-6 } },
          { id: 'r1', type: 'resistor', designator: 'R1', gx: 12, gy: 0, rotation: 90, params: { resistance: 680 } },
          { id: 'p1', type: 'probe', designator: 'TP1', gx: -10, gy: -4, rotation: 0, params: { channel: 1, label: 'AC In' } },
          { id: 'p2', type: 'probe', designator: 'TP2', gx: 12, gy: -4, rotation: 0, params: { channel: 2, label: 'DC Out' } },
          { id: 'g1', type: 'ground', designator: 'GND', gx: -12, gy: 6, rotation: 0, params: {} },
        ],
        wires: [
          { id: 'w1', x1: -12, y1: -2, x2: -12, y2: -4 },
          { id: 'w2', x1: -12, y1: -4, x2: -7, y2: -4 },
          { id: 'w3', x1: -3, y1: -4, x2: 0, y2: -4 },
          { id: 'w4', x1: 4, y1: -4, x2: 6, y2: -4 },
          { id: 'w5', x1: 6, y1: -4, x2: 6, y2: -2 },
          { id: 'w6', x1: 0, y1: -4, x2: 0, y2: -6 },
          { id: 'w7', x1: 0, y1: -6, x2: 12, y2: -6 },
          { id: 'w8', x1: 12, y1: -6, x2: 12, y2: -2 },
          { id: 'w9', x1: 6, y1: 2, x2: 6, y2: 4 },
          { id: 'w10', x1: 12, y1: 2, x2: 12, y2: 4 },
          { id: 'w11', x1: 12, y1: 4, x2: -12, y2: 4 },
          { id: 'w12', x1: -12, y1: 2, x2: -12, y2: 4 },
          { id: 'w13', x1: -12, y1: 4, x2: -12, y2: 6 },
        ],
      };
    },
    liveFormula(ctx) {
      const stats = getProbeStats(ctx, 2);
      const sw = Boolean(getComp(ctx, 'sw1')?.params?.closed);
      const avg = stats ? stats.avg : 0;
      const rip = stats ? stats.vpp : 0;
      return {
        expr: `DC Avg = ${avg.toFixed(1)} V  ·  Ripple = ${rip.toFixed(1)} Vpp`,
        note: sw
          ? { en: 'C1 holds voltage steady between peaks', tr: 'C1 tepeler arasında gerilimi yüksek tutar' }
          : { en: 'Diode blocks negative waves (pulses to 0V)', tr: 'Diyot negatif yarıyı keser (çıkış 0V’a düşer)' },
      };
    },
    goals: [
      {
        id: 'enable-filter',
        title: { en: 'Calm the pulsing wave', tr: 'Kesikli dalgayı sakinleştir' },
        prompt: {
          en: 'Close SW1 to add jar C1 and smooth the wave.',
          tr: 'Dalgayı düzleştirmek için SW1 ile C1’i bağla.',
        },
        callout: { en: 'Close SW1', tr: 'SW1’i kapat' },
        targetCompId: 'sw1',
        controls: [
          { compId: 'sw1', param: 'closed', kind: 'toggle', label: { en: 'Filter SW1', tr: 'Filtre SW1' } },
        ],
        meter: {
          label: { en: 'Steady DC', tr: 'Ortalama DC' },
          min: 0,
          max: 10,
          targetMin: 7.2,
          targetMax: 10,
          unit: 'V',
          value: (ctx) => Math.max(0, getProbeStats(ctx, 2)?.avg ?? 0),
        },
        hint: {
          en: 'Tap SW1 - watch the pulsing scope wave lift right up!',
          tr: 'SW1’e dokun - osiloskop dalgasının anında düzleştiğini izle!',
        },
        insight: {
          en: 'Every phone charger starts here: one-way diode + energy jar!',
          tr: 'Her telefon şarjı böyle çalışır: tek yönlü diyot + enerji kabı!',
        },
        check(ctx) {
          const sw = getComp(ctx, 'sw1');
          const stats = getProbeStats(ctx, 2);
          return Boolean(sw?.params?.closed) && stats && stats.avg > 7.0;
        },
        reading(ctx) {
          const stats = getProbeStats(ctx, 2);
          return stats ? `${stats.avg.toFixed(1)} V` : '-';
        },
      },
      {
        id: 'minimize-ripple',
        title: { en: 'Make the wave silk-flat', tr: 'Dalgayı ipek gibi düzle' },
        prompt: {
          en: 'Slide R1 higher until ripple drops into the star zone.',
          tr: 'Dalgalanma yıldız aralığına inene kadar R1’i yükselt.',
        },
        callout: { en: 'Raise R1', tr: 'R1’i yükselt' },
        targetCompId: 'r1',
        controls: [
          { compId: 'r1', param: 'resistance', kind: 'slider', log: true, min: 300, max: 10000, unit: 'Ω', label: { en: 'Load R1', tr: 'Yük R1' } },
        ],
        meter: {
          label: { en: 'Ripple', tr: 'Dalgalanma' },
          min: 0,
          max: 5,
          targetMin: 0,
          targetMax: 1.2,
          unit: 'Vpp',
          value: (ctx) => Math.min(5, getProbeStats(ctx, 2)?.vpp ?? 5),
        },
        hint: {
          en: 'Slide R1 past 2.5 kΩ to quiet the ripple.',
          tr: 'Dalgalanmayı susturmak için R1’i 2.5 kΩ üzerine çek.',
        },
        insight: {
          en: 'Lighter loads sip slowly from C1, leaving super clean DC power!',
          tr: 'Hafif yük C1’den yavaş yudumlar, geriye tertemiz düz DC kalır!',
        },
        check(ctx) {
          const sw = getComp(ctx, 'sw1');
          const r = getComp(ctx, 'r1')?.params?.resistance ?? 0;
          const stats = getProbeStats(ctx, 2);
          return Boolean(sw?.params?.closed) && r >= 2000 && stats && stats.vpp <= 1.3 && stats.avg > 7.8;
        },
        reading(ctx) {
          const stats = getProbeStats(ctx, 2);
          return stats ? `${stats.vpp.toFixed(2)} Vpp` : '-';
        },
      },
    ],
  },

  // =========================================================================
  // LAB 5: TRANSISTOR SWITCHING (MOSFET)
  // =========================================================================
  {
    id: 'lesson-5-mosfet-switch',
    number: 5,
    title: { en: 'MOSFET Switch', tr: 'MOSFET Anahtar' },
    concept: { en: 'Tiny Gate → Heavy Load', tr: 'Küçük Kapı → Güçlü Yük' },
    summary: {
      en: 'Command a strong 12 V lamp with a feather-light tap.',
      tr: 'Tek bir fısıltı sinyaliyle güçlü 12 V lambayı yönet.',
    },
    showScope: false,
    build() {
      return {
        name: 'Lab 5: MOSFET Low-Side Switch',
        simConfig: {
          dt: 5e-5,
          simRate: 0.01,
          initialMode: 'dc',
          scopeTimeDiv: 0.005,
          scopeVoltsDiv: 5,
          triggerChannel: 1,
          triggerLevel: 2.5,
        },
        components: [
          { id: 'in1', type: 'logic_in', designator: 'GATE', gx: -10, gy: 1, rotation: 0, params: { state: 0, vHigh: 5, vLow: 0 } },
          { id: 'r_g', type: 'resistor', designator: 'Rg', gx: -5, gy: 1, rotation: 0, params: { resistance: 1000 } },
          { id: 'm1', type: 'nmos', designator: 'M1', gx: 1, gy: 1, rotation: 0, params: { vth: 1.8, kp: 0.2, lambda: 0.01 } },
          { id: 'd1', type: 'led', designator: 'D1', gx: 2, gy: -4, rotation: 90, params: { color: 'green', is: 1e-18, n: 1.9 } },
          { id: 'r1', type: 'resistor', designator: 'R1', gx: 2, gy: -9, rotation: 90, params: { resistance: 470 } },
          { id: 'am1', type: 'ammeter', designator: 'AM1', gx: 7, gy: -11, rotation: 0, params: { rShunt: 0.01 } },
          { id: 'v1', type: 'voltage_source', designator: 'V12', gx: 12, gy: -4, rotation: 0, params: { waveform: 'dc', dc: 12, amplitude: 0, frequency: 1000, phase: 0, duty: 0.5, acMag: 0 } },
          { id: 'g1', type: 'ground', designator: 'GND', gx: 2, gy: 6, rotation: 0, params: {} },
        ],
        wires: [
          { id: 'w1', x1: -8, y1: 1, x2: -7, y2: 1 },
          { id: 'w2', x1: -3, y1: 1, x2: -1, y2: 1 },
          { id: 'w3', x1: 2, y1: -1, x2: 2, y2: -2 },
          { id: 'w4', x1: 2, y1: -6, x2: 2, y2: -7 },
          { id: 'w5', x1: 2, y1: -11, x2: 5, y2: -11 },
          { id: 'w6', x1: 9, y1: -11, x2: 12, y2: -11 },
          { id: 'w7', x1: 12, y1: -11, x2: 12, y2: -6 },
          { id: 'w8', x1: 12, y1: -2, x2: 12, y2: 4 },
          { id: 'w9', x1: 12, y1: 4, x2: 2, y2: 4 },
          { id: 'w10', x1: 2, y1: 3, x2: 2, y2: 4 },
          { id: 'w11', x1: 2, y1: 4, x2: 2, y2: 6 },
        ],
      };
    },
    liveFormula(ctx) {
      const high = Number(getComp(ctx, 'in1')?.params?.state) > 0;
      const iLoad = getCompCurrent(ctx, 'am1') * 1000;
      return {
        expr: `Vgs = ${high ? '5.0' : '0.0'} V  ·  Igate = 0.00 mA  →  Iload = ${iLoad.toFixed(1)} mA`,
        note: high
          ? { en: 'Vgs > 1.8 V opens the MOSFET channel', tr: 'Vgs > 1.8 V MOSFET kanalını açar' }
          : { en: 'Vgs = 0 V keeps the channel shut', tr: 'Vgs = 0 V kanalı kapalı tutar' },
      };
    },
    goals: [
      {
        id: 'mosfet-on',
        title: { en: 'Wake the 12 V lamp', tr: '12 V lambayı uyandır' },
        prompt: {
          en: 'Tap GATE to 1 and let M1 light the green lamp.',
          tr: 'M1’in yeşil lambayı yakması için GATE’i 1 yap.',
        },
        callout: { en: 'Tap GATE → 1', tr: 'GATE → 1 yap' },
        targetCompId: 'in1',
        controls: [
          { compId: 'in1', param: 'state', kind: 'logic', label: { en: 'GATE Tile', tr: 'GATE Taşı' } },
        ],
        meter: {
          label: { en: '12 V Load (AM1)', tr: '12 V Akımı (AM1)' },
          min: 0,
          max: 28,
          targetMin: 15,
          targetMax: 25,
          unit: 'mA',
          value: (ctx) => getCompCurrent(ctx, 'am1') * 1000,
        },
        hint: {
          en: 'Click the GATE tile on the board or tap 1 here.',
          tr: 'Şemadaki GATE taşına dokun ya da buradan 1’i seç.',
        },
        insight: {
          en: 'Zero gate current needed - pure voltage opens M1 like a magic door!',
          tr: 'Kapı hiç akım çekmez - sadece gerilim M1’i sihirli kapı gibi açar!',
        },
        check(ctx) {
          return Number(getComp(ctx, 'in1')?.params?.state) === 1 && getCompCurrent(ctx, 'am1') > 0.015;
        },
        reading(ctx) {
          return `${(getCompCurrent(ctx, 'am1') * 1000).toFixed(1)} mA`;
        },
      },
      {
        id: 'mosfet-off',
        title: { en: 'Close the magic gate', tr: 'Sihirli kapıyı kapat' },
        prompt: {
          en: 'Tap GATE back to 0 to turn the lamp off.',
          tr: 'Lambayı tamamen söndürmek için GATE’i tekrar 0 yap.',
        },
        callout: { en: 'Tap GATE → 0', tr: 'GATE → 0 yap' },
        targetCompId: 'in1',
        controls: [
          { compId: 'in1', param: 'state', kind: 'logic', label: { en: 'GATE Tile', tr: 'GATE Taşı' } },
        ],
        meter: {
          label: { en: '12 V Load (AM1)', tr: '12 V Akımı (AM1)' },
          min: 0,
          max: 28,
          targetMin: 0,
          targetMax: 0.5,
          unit: 'mA',
          value: (ctx) => getCompCurrent(ctx, 'am1') * 1000,
        },
        hint: {
          en: 'Set GATE back to 0 and watch AM1 fall to zero.',
          tr: 'GATE’i 0’a çevir, AM1 ibresinin sıfıra inişini izle.',
        },
        insight: {
          en: 'Billions of these tiny voltage doors live inside your computer chip!',
          tr: 'Bilgisayar işlemcinin içinde bu minik kapılardan milyarlarcası var!',
        },
        check(ctx) {
          return Number(getComp(ctx, 'in1')?.params?.state) === 0 && getCompCurrent(ctx, 'am1') < 0.0005;
        },
        reading(ctx) {
          return `${(getCompCurrent(ctx, 'am1') * 1000).toFixed(2)} mA`;
        },
      },
    ],
  },

  // =========================================================================
  // LAB 6: BINARY LOGIC & HALF-ADDER
  // =========================================================================
  {
    id: 'lesson-6-binary-logic',
    number: 6,
    title: { en: 'Binary Adder', tr: 'İkili Toplayıcı' },
    concept: { en: 'A + B = Carry · Sum', tr: 'A + B = Elde · Toplam' },
    summary: {
      en: 'Add numbers in binary using two playful ceramic tiles.',
      tr: 'İki seramik mantık taşıyla ikili sistemde toplama yap.',
    },
    showScope: false,
    hasTruthTable: true,
    build() {
      return {
        name: 'Lab 6: Binary Half-Adder',
        simConfig: {
          dt: 5e-5,
          simRate: 0.01,
          initialMode: 'dc',
          scopeTimeDiv: 0.005,
          scopeVoltsDiv: 2,
          triggerChannel: 1,
          triggerLevel: 2.5,
        },
        components: [
          { id: 'inA', type: 'logic_in', designator: 'A', gx: -12, gy: -4, rotation: 0, params: { state: 0, vHigh: 5, vLow: 0 } },
          { id: 'inB', type: 'logic_in', designator: 'B', gx: -12, gy: 4, rotation: 0, params: { state: 0, vHigh: 5, vLow: 0 } },
          { id: 'u1', type: 'gate_xor', designator: 'XOR', gx: -1, gy: -4, rotation: 0, params: { vHigh: 5, vLow: 0, vTh: 2.5, rOut: 40 } },
          { id: 'u2', type: 'gate_and', designator: 'AND', gx: -1, gy: 4, rotation: 0, params: { vHigh: 5, vLow: 0, vTh: 2.5, rOut: 40 } },
          { id: 'r1', type: 'resistor', designator: 'R1', gx: 5, gy: -4, rotation: 0, params: { resistance: 220 } },
          { id: 'r2', type: 'resistor', designator: 'R2', gx: 5, gy: 4, rotation: 0, params: { resistance: 220 } },
          { id: 'dSum', type: 'led', designator: 'SUM', gx: 10, gy: -2, rotation: 90, params: { color: 'green', is: 1e-18, n: 1.9 } },
          { id: 'dCry', type: 'led', designator: 'CARRY', gx: 10, gy: 6, rotation: 90, params: { color: 'amber', is: 1e-18, n: 1.9 } },
          { id: 'g1', type: 'ground', designator: 'GND', gx: 10, gy: 10, rotation: 0, params: {} },
        ],
        wires: [
          { id: 'w1', x1: -10, y1: -4, x2: -6, y2: -4 },
          { id: 'w2', x1: -6, y1: -4, x2: -6, y2: -5 },
          { id: 'w3', x1: -6, y1: -5, x2: -3, y2: -5 },
          { id: 'w4', x1: -6, y1: -4, x2: -6, y2: 3 },
          { id: 'w5', x1: -6, y1: 3, x2: -3, y2: 3 },
          { id: 'w6', x1: -10, y1: 4, x2: -8, y2: 4 },
          { id: 'w7', x1: -8, y1: 4, x2: -8, y2: 5 },
          { id: 'w8', x1: -8, y1: 5, x2: -3, y2: 5 },
          { id: 'w9', x1: -8, y1: 4, x2: -8, y2: -3 },
          { id: 'w10', x1: -8, y1: -3, x2: -3, y2: -3 },
          { id: 'w11', x1: 1, y1: -4, x2: 3, y2: -4 },
          { id: 'w12', x1: 7, y1: -4, x2: 10, y2: -4 },
          { id: 'w13', x1: 1, y1: 4, x2: 3, y2: 4 },
          { id: 'w14', x1: 7, y1: 4, x2: 10, y2: 4 },
          { id: 'w15', x1: 10, y1: 0, x2: 12, y2: 0 },
          { id: 'w16', x1: 12, y1: 0, x2: 12, y2: 8 },
          { id: 'w17', x1: 12, y1: 8, x2: 10, y2: 8 },
          { id: 'w18', x1: 10, y1: 8, x2: 10, y2: 10 },
        ],
      };
    },
    liveFormula(ctx) {
      const a = Number(getComp(ctx, 'inA')?.params?.state) > 0 ? 1 : 0;
      const b = Number(getComp(ctx, 'inB')?.params?.state) > 0 ? 1 : 0;
      const sum = getCompCurrent(ctx, 'dSum') > 0.005 ? 1 : 0;
      const carry = getCompCurrent(ctx, 'dCry') > 0.005 ? 1 : 0;
      return {
        expr: {
          en: `${a} + ${b} = ${carry}${sum}₂  (decimal ${a + b})`,
          tr: `${a} + ${b} = ${carry}${sum}₂  (onluk ${a + b})`,
        },
        note: { en: 'XOR lights Sum · AND lights Carry', tr: 'XOR Toplam’ı · AND Elde’yi yakar' },
      };
    },
    goals: [
      {
        id: 'sum-one',
        title: { en: 'Add 1 + 0', tr: '1 + 0 topla' },
        prompt: {
          en: 'Tap A to 1 (keep B at 0) to light SUM.',
          tr: 'SUM ışığını yakmak için A’yı 1 yap (B = 0).',
        },
        callout: { en: 'Tap A → 1', tr: 'A → 1 yap' },
        targetCompId: 'inA',
        controls: [
          { compId: 'inA', param: 'state', kind: 'logic', label: { en: 'Tile A', tr: 'A Taşı' } },
          { compId: 'inB', param: 'state', kind: 'logic', label: { en: 'Tile B', tr: 'B Taşı' } },
        ],
        hint: {
          en: 'Click tile A on the board so A = 1 and B = 0.',
          tr: 'A = 1 ve B = 0 olacak şekilde A taşına dokun.',
        },
        insight: {
          en: 'XOR glows green whenever A and B differ - that is Sum!',
          tr: 'XOR yalnızca A ve B farklıysa yeşil yanar - işte Toplam!',
        },
        check(ctx) {
          const iSum = getCompCurrent(ctx, 'dSum');
          const iCry = getCompCurrent(ctx, 'dCry');
          return iSum > 0.006 && iCry < 0.001;
        },
        reading(ctx) {
          const sum = getCompCurrent(ctx, 'dSum') > 0.005 ? 1 : 0;
          const carry = getCompCurrent(ctx, 'dCry') > 0.005 ? 1 : 0;
          return `SUM=${sum} · CARRY=${carry}`;
        },
      },
      {
        id: 'carry-out',
        title: { en: 'Make a binary carry', tr: 'İkili elde oluştur' },
        prompt: {
          en: 'Click A and B tiles to 1 - watch CARRY glow!',
          tr: 'A ve B taşlarını birlikte 1 yap - CARRY parlasın!',
        },
        callout: { en: 'Tap B → 1', tr: 'B → 1 yap' },
        targetCompId: 'inB',
        controls: [
          { compId: 'inA', param: 'state', kind: 'logic', label: { en: 'Tile A', tr: 'A Taşı' } },
          { compId: 'inB', param: 'state', kind: 'logic', label: { en: 'Tile B', tr: 'B Taşı' } },
        ],
        hint: {
          en: 'With A = 1, tap B to 1 too. 1 + 1 = 10 in binary!',
          tr: 'A = 1 iken B’ye de dokun. İkilikte 1 + 1 = 10 eder!',
        },
        insight: {
          en: '1 + 1 = 10₂! Chain 64 of these and you build a real CPU!',
          tr: '1 + 1 = 10₂! 64 tanesini dizdiğinde gerçek bir işlemci doğar!',
        },
        check(ctx) {
          const iSum = getCompCurrent(ctx, 'dSum');
          const iCry = getCompCurrent(ctx, 'dCry');
          return iSum < 0.001 && iCry > 0.006;
        },
        reading(ctx) {
          const sum = getCompCurrent(ctx, 'dSum') > 0.005 ? 1 : 0;
          const carry = getCompCurrent(ctx, 'dCry') > 0.005 ? 1 : 0;
          return `SUM=${sum} · CARRY=${carry}`;
        },
      },
    ],
  },
];

export const LEARN_LESSONS = LESSONS;

export function getLessonById(id) {
  return LESSONS.find((l) => l.id === id) || LESSONS[0];
}
