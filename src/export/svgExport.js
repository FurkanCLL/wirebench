/**
 * Publication-Grade Vector SVG Schematic Exporter.
 * Exports any KIRCHHOFF schematic as a crisp, standalone SVG file with
 * proper IEEE/IEC electronic symbols, junction dots, designators, and SI values.
 */

import { GRID_SIZE, LED_MODELS, PROBE_COLORS, getComponentPins } from '../engine/components.js';
import { formatCompactSI } from '../engine/units.js';

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function getComponentValueLabel(comp) {
  const p = comp.params || {};
  switch (comp.type) {
    case 'resistor':
      return formatCompactSI(p.resistance, 'Ω');
    case 'potentiometer':
      return `${formatCompactSI(p.resistance, 'Ω')} (${Math.round((p.wiper ?? 0.5) * 100)}%)`;
    case 'capacitor':
      return formatCompactSI(p.capacitance, 'F');
    case 'inductor':
      return formatCompactSI(p.inductance, 'H');
    case 'voltage_source':
      if (!p.waveform || p.waveform === 'dc') return `${formatCompactSI(p.dc, 'V')}`;
      return `${formatCompactSI(p.amplitude, 'V')} ${formatCompactSI(p.frequency, 'Hz')}`;
    case 'current_source':
      return formatCompactSI(p.current, 'A');
    case 'diode':
      return p.model === 'zener' ? `Vz ${p.vBreakdown}V` : p.model === 'schottky' ? 'Schottky' : '1N4148';
    case 'led':
      return (p.color || 'green').toUpperCase();
    case 'npn':
    case 'pnp':
      return `β=${Math.round(p.betaF || 120)}`;
    case 'nmos':
    case 'pmos':
      return `Vt ${p.vth || 1.5}V`;
    case 'opamp':
      return `±${Math.abs(p.vPos || 12)}V`;
    case 'switch':
    case 'pushbutton':
      return p.closed ? 'ON' : 'OFF';
    case 'spdt':
      return Number(p.position) === 1 ? 'B' : 'A';
    case 'transformer':
      return `1:${p.ratio || 0.5}`;
    case 'logic_in':
      return p.state ? 'HIGH' : 'LOW';
    case 'voltmeter':
      return 'V';
    case 'ammeter':
      return 'A';
    case 'gate_and':
      return 'AND';
    case 'gate_or':
      return 'OR';
    case 'gate_not':
      return 'NOT';
    case 'gate_nand':
      return 'NAND';
    case 'gate_xor':
      return 'XOR';
    case 'probe':
      return p.label || `CH${p.channel}`;
    default:
      return '';
  }
}

/**
 * Render local-space SVG markup for a component symbol centered at (0,0), scaled by GRID_SIZE = 20.
 */
function renderComponentSVG(comp, palette) {
  const g = GRID_SIZE;
  const stroke = palette.ink;
  const accent = palette.accent;
  const p = comp.params || {};

  switch (comp.type) {
    case 'ground':
      return `
        <line x1="0" y1="0" x2="0" y2="${g * 0.7}" stroke="${stroke}" stroke-width="2" />
        <line x1="${-g * 0.65}" y1="${g * 0.7}" x2="${g * 0.65}" y2="${g * 0.7}" stroke="${stroke}" stroke-width="2.2" />
        <line x1="${-g * 0.42}" y1="${g * 1.05}" x2="${g * 0.42}" y2="${g * 1.05}" stroke="${stroke}" stroke-width="2" />
        <line x1="${-g * 0.18}" y1="${g * 1.4}" x2="${g * 0.18}" y2="${g * 1.4}" stroke="${stroke}" stroke-width="2" />
      `;

    case 'resistor':
      return `
        <line x1="${-2 * g}" y1="0" x2="${-1.2 * g}" y2="0" stroke="${stroke}" stroke-width="2" />
        <line x1="${1.2 * g}" y1="0" x2="${2 * g}" y2="0" stroke="${stroke}" stroke-width="2" />
        <polyline points="${-1.2 * g},0 ${-1.0 * g},${-0.45 * g} ${-0.6 * g},${0.45 * g} ${-0.2 * g},${-0.45 * g} ${0.2 * g},${0.45 * g} ${0.6 * g},${-0.45 * g} ${1.0 * g},${0.45 * g} ${1.2 * g},0" fill="none" stroke="${stroke}" stroke-width="2" stroke-linejoin="round" />
      `;

    case 'potentiometer': {
      const w = Math.min(0.99, Math.max(0.01, Number(p.wiper) ?? 0.5));
      const wx = (-1.0 + 2.0 * w) * g;
      return `
        <line x1="${-2 * g}" y1="0" x2="${-1.2 * g}" y2="0" stroke="${stroke}" stroke-width="2" />
        <line x1="${1.2 * g}" y1="0" x2="${2 * g}" y2="0" stroke="${stroke}" stroke-width="2" />
        <polyline points="${-1.2 * g},0 ${-1.0 * g},${-0.42 * g} ${-0.6 * g},${0.42 * g} ${-0.2 * g},${-0.42 * g} ${0.2 * g},${0.42 * g} ${0.6 * g},${-0.42 * g} ${1.0 * g},${0.42 * g} ${1.2 * g},0" fill="none" stroke="${stroke}" stroke-width="2" stroke-linejoin="round" />
        <polyline points="0,${-2 * g} 0,${-1.25 * g} ${wx},${-1.25 * g} ${wx},${-0.55 * g}" fill="none" stroke="${accent}" stroke-width="2" />
        <polygon points="${wx},${-0.45 * g} ${wx - 5},${-0.85 * g} ${wx + 5},${-0.85 * g}" fill="${accent}" />
      `;
    }

    case 'capacitor':
      return `
        <line x1="${-2 * g}" y1="0" x2="${-0.28 * g}" y2="0" stroke="${stroke}" stroke-width="2" />
        <line x1="${0.28 * g}" y1="0" x2="${2 * g}" y2="0" stroke="${stroke}" stroke-width="2" />
        <line x1="${-0.28 * g}" y1="${-0.85 * g}" x2="${-0.28 * g}" y2="${0.85 * g}" stroke="${stroke}" stroke-width="2.6" />
        <line x1="${0.28 * g}" y1="${-0.85 * g}" x2="${0.28 * g}" y2="${0.85 * g}" stroke="${stroke}" stroke-width="2.6" />
      `;

    case 'inductor':
      return `
        <line x1="${-2 * g}" y1="0" x2="${-1.2 * g}" y2="0" stroke="${stroke}" stroke-width="2" />
        <line x1="${1.2 * g}" y1="0" x2="${2 * g}" y2="0" stroke="${stroke}" stroke-width="2" />
        <path d="M ${-1.2 * g} 0 A ${0.3 * g} ${0.42 * g} 0 0 1 ${-0.6 * g} 0 A ${0.3 * g} ${0.42 * g} 0 0 1 0 0 A ${0.3 * g} ${0.42 * g} 0 0 1 ${0.6 * g} 0 A ${0.3 * g} ${0.42 * g} 0 0 1 ${1.2 * g} 0" fill="none" stroke="${stroke}" stroke-width="2.2" />
      `;

    case 'voltage_source': {
      const wf = p.waveform || 'dc';
      const inner = wf === 'dc'
        ? `<line x1="-5" y1="-9" x2="5" y2="-9" stroke="${accent}" stroke-width="2" />
           <line x1="0" y1="-14" x2="0" y2="-4" stroke="${accent}" stroke-width="2" />
           <line x1="-5" y1="10" x2="5" y2="10" stroke="${stroke}" stroke-width="2" />`
        : `<path d="M -11 0 Q -5.5 -10 0 0 T 11 0" fill="none" stroke="${accent}" stroke-width="2.2" />`;
      return `
        <line x1="0" y1="${-2 * g}" x2="0" y2="${-1.05 * g}" stroke="${stroke}" stroke-width="2" />
        <line x1="0" y1="${1.05 * g}" x2="0" y2="${2 * g}" stroke="${stroke}" stroke-width="2" />
        <circle cx="0" cy="0" r="${1.05 * g}" fill="${palette.bg}" stroke="${stroke}" stroke-width="2.2" />
        ${inner}
      `;
    }

    case 'current_source':
      return `
        <line x1="0" y1="${-2 * g}" x2="0" y2="${-1.05 * g}" stroke="${stroke}" stroke-width="2" />
        <line x1="0" y1="${1.05 * g}" x2="0" y2="${2 * g}" stroke="${stroke}" stroke-width="2" />
        <circle cx="0" cy="0" r="${1.05 * g}" fill="${palette.bg}" stroke="${stroke}" stroke-width="2.2" />
        <line x1="0" y1="11" x2="0" y2="-10" stroke="${accent}" stroke-width="2.2" />
        <polygon points="0,-13 -5,-5 5,-5" fill="${accent}" />
      `;

    case 'diode':
    case 'led': {
      const col = comp.type === 'led' ? (LED_MODELS[p.color]?.color || '#2de08f') : stroke;
      const zenerBar = p.model === 'zener'
        ? `<polyline points="${0.6 * g - 4},${-0.65 * g} ${0.6 * g},${-0.65 * g} ${0.6 * g},${0.65 * g} ${0.6 * g + 4},${0.65 * g}" fill="none" stroke="${stroke}" stroke-width="2.2" />`
        : `<line x1="${0.55 * g}" y1="${-0.65 * g}" x2="${0.55 * g}" y2="${0.65 * g}" stroke="${stroke}" stroke-width="2.4" />`;
      return `
        <line x1="${-2 * g}" y1="0" x2="${-0.55 * g}" y2="0" stroke="${stroke}" stroke-width="2" />
        <line x1="${0.55 * g}" y1="0" x2="${2 * g}" y2="0" stroke="${stroke}" stroke-width="2" />
        <polygon points="${-0.55 * g},${-0.62 * g} ${-0.55 * g},${0.62 * g} ${0.55 * g},0" fill="${comp.type === 'led' ? col : 'none'}" fill-opacity="0.3" stroke="${col}" stroke-width="2.2" stroke-linejoin="round" />
        ${zenerBar}
      `;
    }

    case 'npn':
    case 'pnp': {
      const isPnp = comp.type === 'pnp';
      return `
        <circle cx="0" cy="0" r="${1.25 * g}" fill="${palette.bg}" stroke="${stroke}" stroke-width="1.6" stroke-opacity="0.65" />
        <line x1="${-2 * g}" y1="0" x2="${-0.45 * g}" y2="0" stroke="${stroke}" stroke-width="2" />
        <line x1="${-0.45 * g}" y1="${-0.85 * g}" x2="${-0.45 * g}" y2="${0.85 * g}" stroke="${stroke}" stroke-width="3" />
        <polyline points="${-0.45 * g},${-0.4 * g} ${g},${-1.15 * g} ${g},${-2 * g}" fill="none" stroke="${stroke}" stroke-width="2" />
        <polyline points="${-0.45 * g},${0.4 * g} ${g},${1.15 * g} ${g},${2 * g}" fill="none" stroke="${stroke}" stroke-width="2" />
        ${isPnp
          ? `<polygon points="${-0.2 * g},${-0.52 * g} ${0.35 * g},${-0.6 * g} ${0.15 * g},${-1.02 * g}" fill="${accent}" />`
          : `<polygon points="${0.62 * g},${0.95 * g} ${0.15 * g},${0.92 * g} ${0.38 * g},${0.55 * g}" fill="${accent}" />`}
      `;
    }

    case 'opamp':
      return `
        <line x1="${-2 * g}" y1="${-g}" x2="${-1.2 * g}" y2="${-g}" stroke="${stroke}" stroke-width="2" />
        <line x1="${-2 * g}" y1="${g}" x2="${-1.2 * g}" y2="${g}" stroke="${stroke}" stroke-width="2" />
        <line x1="${1.4 * g}" y1="0" x2="${2 * g}" y2="0" stroke="${stroke}" stroke-width="2" />
        <polygon points="${-1.2 * g},${-1.65 * g} ${-1.2 * g},${1.65 * g} ${1.4 * g},0" fill="${palette.bg}" stroke="${stroke}" stroke-width="2.2" stroke-linejoin="round" />
        <text x="${-0.82 * g}" y="${-0.75 * g}" fill="${accent}" font-size="13" font-family="monospace" font-weight="700">+</text>
        <text x="${-0.82 * g}" y="${1.15 * g}" fill="${stroke}" font-size="13" font-family="monospace" font-weight="700">−</text>
      `;

    case 'switch':
    case 'pushbutton': {
      const closed = !!p.closed;
      return `
        <line x1="${-2 * g}" y1="0" x2="${-0.8 * g}" y2="0" stroke="${stroke}" stroke-width="2" />
        <line x1="${0.8 * g}" y1="0" x2="${2 * g}" y2="0" stroke="${stroke}" stroke-width="2" />
        <circle cx="${-0.8 * g}" cy="0" r="3.5" fill="${palette.bg}" stroke="${stroke}" stroke-width="2" />
        <circle cx="${0.8 * g}" cy="0" r="3.5" fill="${palette.bg}" stroke="${stroke}" stroke-width="2" />
        <line x1="${-0.8 * g}" y1="0" x2="${0.8 * g}" y2="${closed ? 0 : -0.65 * g}" stroke="${accent}" stroke-width="2.5" stroke-linecap="round" />
      `;
    }

    case 'nmos':
    case 'pmos':
      return `
        <circle cx="0" cy="0" r="${1.25 * g}" fill="${palette.bg}" stroke="${stroke}" stroke-width="1.6" stroke-opacity="0.65" />
        <line x1="${-2 * g}" y1="0" x2="${-0.65 * g}" y2="0" stroke="${stroke}" stroke-width="2" />
        <line x1="${-0.65 * g}" y1="${-0.8 * g}" x2="${-0.65 * g}" y2="${0.8 * g}" stroke="${stroke}" stroke-width="2.2" />
        <line x1="${-0.25 * g}" y1="${-0.85 * g}" x2="${-0.25 * g}" y2="${-0.35 * g}" stroke="${stroke}" stroke-width="2.4" />
        <line x1="${-0.25 * g}" y1="${-0.2 * g}" x2="${-0.25 * g}" y2="${0.2 * g}" stroke="${stroke}" stroke-width="2.4" />
        <line x1="${-0.25 * g}" y1="${0.35 * g}" x2="${-0.25 * g}" y2="${0.85 * g}" stroke="${stroke}" stroke-width="2.4" />
        <polyline points="${-0.25 * g},${-0.6 * g} ${g},${-0.6 * g} ${g},${-2 * g}" fill="none" stroke="${stroke}" stroke-width="2" />
        <polyline points="${-0.25 * g},${0.6 * g} ${g},${0.6 * g} ${g},${2 * g}" fill="none" stroke="${stroke}" stroke-width="2" />
      `;

    case 'spdt': {
      const pos = Number(p.position) === 1 ? 1 : 0;
      return `
        <line x1="${-2 * g}" y1="0" x2="${-0.8 * g}" y2="0" stroke="${stroke}" stroke-width="2" />
        <line x1="${0.8 * g}" y1="${-g}" x2="${2 * g}" y2="${-g}" stroke="${stroke}" stroke-width="2" />
        <line x1="${0.8 * g}" y1="${g}" x2="${2 * g}" y2="${g}" stroke="${stroke}" stroke-width="2" />
        <line x1="${-0.8 * g}" y1="0" x2="${0.8 * g}" y2="${pos === 0 ? -g : g}" stroke="${accent}" stroke-width="2.4" />
      `;
    }

    case 'voltmeter':
    case 'ammeter':
      return `
        <line x1="${-2 * g}" y1="0" x2="${-1.05 * g}" y2="0" stroke="${stroke}" stroke-width="2" />
        <line x1="${1.05 * g}" y1="0" x2="${2 * g}" y2="0" stroke="${stroke}" stroke-width="2" />
        <circle cx="0" cy="0" r="${1.05 * g}" fill="${palette.bg}" stroke="${stroke}" stroke-width="2.1" />
        <text x="0" y="4" text-anchor="middle" fill="${accent}" font-size="13" font-family="monospace" font-weight="700">${comp.type === 'voltmeter' ? 'V' : 'A'}</text>
      `;

    case 'logic_in':
      return `
        <line x1="${0.9 * g}" y1="0" x2="${2 * g}" y2="0" stroke="${stroke}" stroke-width="2" />
        <rect x="${-1.1 * g}" y="${-0.9 * g}" width="${2 * g}" height="${1.8 * g}" rx="5" fill="${palette.bg}" stroke="${p.state ? accent : stroke}" stroke-width="2.1" />
        <text x="${-0.1 * g}" y="5" text-anchor="middle" fill="${p.state ? accent : stroke}" font-size="14" font-family="monospace" font-weight="700">${p.state ? '1' : '0'}</text>
      `;

    case 'transformer':
      return `
        <line x1="${-2 * g}" y1="${-2 * g}" x2="${-0.9 * g}" y2="${-2 * g}" stroke="${stroke}" stroke-width="2" />
        <line x1="${-2 * g}" y1="${2 * g}" x2="${-0.9 * g}" y2="${2 * g}" stroke="${stroke}" stroke-width="2" />
        <line x1="${0.9 * g}" y1="${-2 * g}" x2="${2 * g}" y2="${-2 * g}" stroke="${stroke}" stroke-width="2" />
        <line x1="${0.9 * g}" y1="${2 * g}" x2="${2 * g}" y2="${2 * g}" stroke="${stroke}" stroke-width="2" />
        <line x1="${-0.22 * g}" y1="${-1.5 * g}" x2="${-0.22 * g}" y2="${1.5 * g}" stroke="${stroke}" stroke-width="2" />
        <line x1="${0.22 * g}" y1="${-1.5 * g}" x2="${0.22 * g}" y2="${1.5 * g}" stroke="${stroke}" stroke-width="2" />
        <rect x="${-1.1 * g}" y="${-1.6 * g}" width="${0.65 * g}" height="${3.2 * g}" rx="4" fill="none" stroke="${stroke}" stroke-width="1.8" />
        <rect x="${0.45 * g}" y="${-1.6 * g}" width="${0.65 * g}" height="${3.2 * g}" rx="4" fill="none" stroke="${stroke}" stroke-width="1.8" />
      `;

    case 'gate_and':
    case 'gate_or':
    case 'gate_not':
    case 'gate_nand':
    case 'gate_xor': {
      const lbl = comp.type.replace('gate_', '').toUpperCase();
      return `
        ${comp.type === 'gate_not'
          ? `<line x1="${-2 * g}" y1="0" x2="${-g}" y2="0" stroke="${stroke}" stroke-width="2" />`
          : `<line x1="${-2 * g}" y1="${-g}" x2="${-g}" y2="${-g}" stroke="${stroke}" stroke-width="2" />
             <line x1="${-2 * g}" y1="${g}" x2="${-g}" y2="${g}" stroke="${stroke}" stroke-width="2" />`}
        <line x1="${1.1 * g}" y1="0" x2="${2 * g}" y2="0" stroke="${stroke}" stroke-width="2" />
        <rect x="${-g}" y="${-1.35 * g}" width="${2.1 * g}" height="${2.7 * g}" rx="6" fill="${palette.bg}" stroke="${stroke}" stroke-width="2" />
        <text x="1" y="4" text-anchor="middle" fill="${stroke}" font-size="10" font-family="monospace" font-weight="700">${lbl}</text>
      `;
    }

    case 'probe': {
      const col = PROBE_COLORS[p.channel] || '#34d399';
      return `
        <circle cx="0" cy="0" r="4" fill="${col}" />
        <line x1="0" y1="0" x2="10" y2="-18" stroke="${col}" stroke-width="2" />
        <rect x="8" y="-34" width="44" height="18" rx="4" fill="${col}" fill-opacity="0.18" stroke="${col}" stroke-width="1.4" />
        <text x="30" y="-21" text-anchor="middle" fill="${col}" font-size="10" font-family="monospace" font-weight="700">${esc(p.label || 'CH' + p.channel)}</text>
      `;
    }

    default:
      return '';
  }
}

/**
 * Export full schematic as a standalone SVG string.
 * @param {object} schematic
 * @param {object} netlist
 * @param {'dark'|'light'} [theme='light']
 */
export function exportSchematicSVG(schematic, netlist, theme = 'light') {
  const palette = theme === 'dark'
    ? { bg: '#0f1115', grid: '#1b1f27', ink: '#f1f3f5', wire: '#7c8696', label: '#9aa4b2', accent: '#34d399' }
    : { bg: '#f8f6f1', grid: '#e8e4da', ink: '#181b20', wire: '#3a4554', label: '#576170', accent: '#0f8f63' };

  // Compute tight bounding box around all wires and component pins
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const expand = (gx, gy) => {
    if (gx < minX) minX = gx;
    if (gy < minY) minY = gy;
    if (gx > maxX) maxX = gx;
    if (gy > maxY) maxY = gy;
  };
  for (const seg of schematic.wires || []) {
    expand(seg.x1, seg.y1);
    expand(seg.x2, seg.y2);
  }
  for (const comp of schematic.components || []) {
    expand(comp.gx, comp.gy);
    for (const pin of getComponentPins(comp)) expand(pin.gx, pin.gy);
  }
  if (!Number.isFinite(minX)) {
    minX = -10; maxX = 10; minY = -8; maxY = 8;
  }

  const pad = 4;
  const vx = (minX - pad) * GRID_SIZE;
  const vy = (minY - pad) * GRID_SIZE;
  const vw = (maxX - minX + pad * 2) * GRID_SIZE;
  const vh = (maxY - minY + pad * 2) * GRID_SIZE;

  const wireMarkup = (schematic.wires || [])
    .map(
      (w) =>
        `<line x1="${w.x1 * GRID_SIZE}" y1="${w.y1 * GRID_SIZE}" x2="${w.x2 * GRID_SIZE}" y2="${w.y2 * GRID_SIZE}" stroke="${palette.wire}" stroke-width="2.2" stroke-linecap="round" />`
    )
    .join('\n    ');

  const junctionMarkup = (netlist?.junctions || [])
    .map(
      (j) =>
        `<circle cx="${j.gx * GRID_SIZE}" cy="${j.gy * GRID_SIZE}" r="3.6" fill="${palette.ink}" />`
    )
    .join('\n    ');

  const compMarkup = (schematic.components || [])
    .map((c) => {
      const cx = c.gx * GRID_SIZE;
      const cy = c.gy * GRID_SIZE;
      const scaleX = c.flipX ? -1 : 1;
      const rot = c.rotation || 0;
      const val = getComponentValueLabel(c);
      const labelBlock =
        c.type !== 'ground' && c.type !== 'probe'
          ? `<text x="${cx}" y="${cy - 24}" text-anchor="middle" fill="${palette.ink}" font-size="11" font-family="monospace" font-weight="700">${esc(c.designator)}</text>
             <text x="${cx}" y="${cy + 33}" text-anchor="middle" fill="${palette.label}" font-size="10" font-family="monospace">${esc(val)}</text>`
          : '';
      return `<g transform="translate(${cx},${cy}) rotate(${rot}) scale(${scaleX},1)">${renderComponentSVG(c, palette)}</g>\n    ${labelBlock}`;
    })
    .join('\n    ');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${vw} ${vh}" width="${Math.round(vw)}" height="${Math.round(vh)}">
  <defs>
    <pattern id="kgrid" width="${GRID_SIZE}" height="${GRID_SIZE}" patternUnits="userSpaceOnUse">
      <path d="M ${GRID_SIZE} 0 L 0 0 0 ${GRID_SIZE}" fill="none" stroke="${palette.grid}" stroke-width="0.8" />
    </pattern>
  </defs>
  <rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="${palette.bg}" />
  <rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="url(#kgrid)" />
  <text x="${vx + 16}" y="${vy + 24}" fill="${palette.ink}" font-size="13" font-family="monospace" font-weight="700">${esc(schematic.name || 'Wirebench Schematic')}</text>
  <g id="wires">
    ${wireMarkup}
  </g>
  <g id="junctions">
    ${junctionMarkup}
  </g>
  <g id="components">
    ${compMarkup}
  </g>
</svg>`;
}
