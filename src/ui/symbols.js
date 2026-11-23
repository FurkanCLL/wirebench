/**
 * Luminous Atelier Illustrated & IEEE Schematic Symbol Renderer (Canvas 2D + Parts Tray SVGs).
 * Every symbol adheres strictly to integer GRID_SIZE = 20 pin geometry so wires connect
 * pixel-perfectly in both 'illustrated' (default storybook miniature) and 'schematic' (classic IEEE) modes.
 */

import { GRID_SIZE, LED_MODELS, PROBE_COLORS, transformOffset } from '../engine/components.js';
import { formatCompactSI, formatSignedVoltage } from '../engine/units.js';
import { getComponentValueLabel } from '../export/svgExport.js';

// ============================================================================
// Color & Geometry Craft Helpers (Strict Mock-Canvas Safe - Zero NaN)
// ============================================================================

const IEC_DIGIT_COLORS = [
  '#26211e', // 0 Black
  '#7c4627', // 1 Brown
  '#c93b3b', // 2 Red
  '#e07b28', // 3 Orange
  '#e8c238', // 4 Yellow
  '#2f8a58', // 5 Green
  '#3b6db3', // 6 Blue
  '#8452a3', // 7 Violet
  '#7a7570', // 8 Grey
  '#f7f3ea', // 9 White
];

const IEC_GOLD = '#d8a63c';
const IEC_SILVER = '#b8b5ae';

const LED_RGB = {
  red: [242, 88, 78],
  amber: [245, 168, 52],
  green: [54, 208, 146],
  blue: [92, 164, 248],
};

/**
 * Compute authentic 4-band IEC 60062 color code from a resistance in ohms.
 * Returns [band1, band2, multiplierBand, toleranceBand].
 */
export function computeResistorBands(ohms) {
  const val = Number.isFinite(ohms) && ohms > 0 ? Math.max(0.1, Math.min(9.9e8, ohms)) : 1000;
  let exp = Math.floor(Math.log10(val)) - 1;
  let sig = Math.round(val / Math.pow(10, exp));
  if (sig >= 100) {
    sig = Math.round(sig / 10);
    exp += 1;
  }
  if (sig < 10) sig = 10;
  const d1 = Math.max(0, Math.min(9, Math.floor(sig / 10)));
  const d2 = Math.max(0, Math.min(9, sig % 10));
  const multExp = Math.max(-2, Math.min(7, exp));
  const multColor =
    multExp === -2
      ? IEC_SILVER
      : multExp === -1
        ? IEC_GOLD
        : IEC_DIGIT_COLORS[multExp] || IEC_DIGIT_COLORS[2];
  return [IEC_DIGIT_COLORS[d1], IEC_DIGIT_COLORS[d2], multColor, IEC_GOLD];
}

function safeLinearGrad(ctx, x0, y0, x1, y1, stops, fallback) {
  if (typeof ctx.createLinearGradient === 'function') {
    const grad = ctx.createLinearGradient(x0, y0, x1, y1);
    for (let i = 0; i < stops.length; i++) {
      grad.addColorStop(stops[i][0], stops[i][1]);
    }
    return grad;
  }
  return fallback;
}

function resolvePalette(theme, flags) {
  const isDark =
    theme.isDark !== undefined
      ? Boolean(theme.isDark)
      : theme.bg === '#181624' || theme.bg === '#141413';
  const select = theme.select || (isDark ? '#f07a60' : '#d45d44');
  const hover = theme.hover || (isDark ? '#f69882' : '#b84831');
  return {
    isDark,
    select,
    hover,
    outline: flags.selected ? select : flags.hovered ? hover : isDark ? '#574e70' : '#574236',
    ink: theme.ink || (isDark ? '#f6eee0' : '#2d221c'),
    inkSoft: theme.inkSoft || theme.label || (isDark ? '#b8ac9e' : '#6f5d50'),
    inkMuted: theme.inkMuted || (isDark ? '#80768f' : '#9e8c7e'),
    surface: theme.surface || (isDark ? '#232034' : '#fffdf8'),
    bg: theme.bg || (isDark ? '#181624' : '#faf4e8'),
    shadow: theme.shadow || (isDark ? 'rgba(6, 4, 14, 0.44)' : 'rgba(64, 42, 24, 0.14)'),
    copper: flags.selected ? select : theme.copper || (isDark ? '#d08b5c' : '#b87246'),
    copperHi: flags.selected ? hover : theme.copperHi || (isDark ? '#f0b98a' : '#e4a778'),
    brass: theme.brass || (isDark ? '#dfb055' : '#cc9738'),
    brassHi: theme.brassHi || (isDark ? '#fbe19d' : '#f7d887'),
    brassDark: isDark ? '#9a7128' : '#8f631e',
    ceramic: isDark ? '#2e2942' : '#fbf4e4',
    ceramicShade: isDark ? '#242036' : '#ecdfc6',
    ceramicHi: isDark ? 'rgba(255, 248, 232, 0.14)' : 'rgba(255, 255, 255, 0.72)',
    sage: theme.vPos || (isDark ? '#52d1a0' : '#2e7d60'),
    sageDeep: isDark ? '#2a8464' : '#23634b',
    honey: theme.honey || theme.amber || (isDark ? '#f5bc58' : '#e39d34'),
    blush: theme.vNeg || theme.danger || (isDark ? '#f26d7d' : '#d1495b'),
    accent: theme.accent || select,
    indigo: theme.indigo || (isDark ? '#8ca7e0' : '#465d8c'),
  };
}

function drawCopperLeads(ctx, segments, pal) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = pal.copper;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  for (let i = 0; i < segments.length; i++) {
    const [x1, y1, x2, y2] = segments[i];
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
  }
  ctx.stroke();

  // Warm metallic top sheen
  ctx.strokeStyle = pal.copperHi;
  ctx.lineWidth = 0.85;
  ctx.globalAlpha = 0.65;
  ctx.beginPath();
  for (let i = 0; i < segments.length; i++) {
    const [x1, y1, x2, y2] = segments[i];
    ctx.moveTo(x1, y1 - 0.55);
    ctx.lineTo(x2, y2 - 0.55);
  }
  ctx.stroke();
  ctx.restore();
}

function drawSparkStar(ctx, cx, cy, r, color, alpha = 1) {
  if (r <= 0 || alpha <= 0.02) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.quadraticCurveTo(cx + r * 0.18, cy - r * 0.18, cx + r, cy);
  ctx.quadraticCurveTo(cx + r * 0.18, cy + r * 0.18, cx, cy + r);
  ctx.quadraticCurveTo(cx - r * 0.18, cy + r * 0.18, cx - r, cy);
  ctx.quadraticCurveTo(cx - r * 0.18, cy - r * 0.18, cx, cy - r);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ============================================================================
// Main Public Symbol Renderer
// ============================================================================

/**
 * Draw a component's symbol in its local coordinate frame (origin at comp.gx, comp.gy).
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} comp
 * @param {object} telemetry - Live evaluation entry for this component
 * @param {object} theme - Resolved theme colors
 * @param {object} flags - { selected, hovered, ghost, potDragActive, renderStyle, animTime }
 */
export function drawComponentSymbol(ctx, comp, telemetry, theme, flags = {}) {
  const style = flags.renderStyle === 'schematic' ? 'schematic' : 'illustrated';
  const animT = Number.isFinite(flags.animTime) ? flags.animTime : 0;

  if (style === 'schematic') {
    drawSchematicSymbol(ctx, comp, telemetry, theme, flags);
    return;
  }

  const g = GRID_SIZE;
  const p = comp.params || {};
  const pal = resolvePalette(theme, flags);

  ctx.save();
  if (flags.ghost) ctx.globalAlpha = 0.58;
  ctx.translate(comp.gx * g, comp.gy * g);
  ctx.rotate(((comp.rotation || 0) * Math.PI) / 180);
  if (comp.flipX) ctx.scale(-1, 1);

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  let ledOverloaded = false;

  switch (comp.type) {
    case 'ground': {
      // Warm handcrafted hammered-copper earth anchor
      ctx.save();
      ctx.fillStyle = pal.shadow;
      roundRect(ctx, -13, g * 0.68 + 2, 26, 4.5, 2.2);
      ctx.fill();
      roundRect(ctx, -8.5, g * 1.05 + 2, 17, 4, 2);
      ctx.fill();
      roundRect(ctx, -4, g * 1.42 + 2, 8, 3.6, 1.8);
      ctx.fill();
      ctx.restore();

      drawCopperLeads(ctx, [[0, 0, 0, g * 0.72]], pal);

      // Anchor bars in hammered copper + specular highlight
      const bars = [
        [-13, g * 0.65, 26, 4.4],
        [-8.8, g * 1.03, 17.6, 4.0],
        [-4.2, g * 1.4, 8.4, 3.6],
      ];
      for (const [bx, by, bw, bh] of bars) {
        ctx.fillStyle = safeLinearGrad(
          ctx,
          bx,
          by,
          bx,
          by + bh,
          [
            [0, pal.copperHi],
            [0.45, pal.copper],
            [1, pal.brassDark],
          ],
          pal.copper
        );
        ctx.strokeStyle = pal.outline;
        ctx.lineWidth = 1.1;
        roundRect(ctx, bx, by, bw, bh, bh * 0.5);
        ctx.fill();
        ctx.stroke();
      }
      break;
    }

    case 'voltage_source': {
      const wf = p.waveform || 'dc';
      const isShort = telemetry?.state === 'SHORT!';
      drawCopperLeads(
        ctx,
        [
          [0, -2 * g, 0, -1.25 * g],
          [0, 1.18 * g, 0, 2 * g],
        ],
        pal
      );

      if (wf === 'dc') {
        // Cute forest-sage & warm-cream cylindrical lantern battery with golden brass top nub!
        // Cast paper shadow
        ctx.fillStyle = pal.shadow;
        roundRect(ctx, -13.5, -21 + 2.6, 29, 46, 7);
        ctx.fill();

        // Glossy golden brass positive nub at top
        ctx.fillStyle = safeLinearGrad(
          ctx,
          -6,
          -27,
          6,
          -27,
          [
            [0, pal.brassDark],
            [0.35, pal.brassHi],
            [0.7, pal.brass],
            [1, pal.brassDark],
          ],
          pal.brass
        );
        ctx.strokeStyle = pal.outline;
        ctx.lineWidth = 1.3;
        roundRect(ctx, -6.5, -27.5, 13, 6.5, 2.6);
        ctx.fill();
        ctx.stroke();

        // Battery cylinder body (clipped so sage top, brass band & cream skirt align cleanly)
        ctx.save();
        roundRect(ctx, -14.5, -22, 29, 45, 6.5);
        ctx.clip();

        // Upper forest-sage jacket
        ctx.fillStyle = safeLinearGrad(
          ctx,
          -14.5,
          0,
          14.5,
          0,
          [
            [0, pal.isDark ? '#256c52' : '#24664e'],
            [0.32, pal.isDark ? '#43ab84' : '#389171'],
            [0.75, pal.isDark ? '#2e7d60' : '#2c775b'],
            [1, pal.isDark ? '#1e5440' : '#1f5742'],
          ],
          pal.sage
        );
        ctx.fillRect(-15, -22, 30, 26);

        // Lower warm sculpted cream band
        ctx.fillStyle = safeLinearGrad(
          ctx,
          -14.5,
          0,
          14.5,
          0,
          [
            [0, pal.isDark ? '#d9cbb3' : '#e6d8be'],
            [0.32, '#fffaf0'],
            [0.78, pal.isDark ? '#e6dac4' : '#f4e9d3'],
            [1, pal.isDark ? '#bfb097' : '#d8c7a8'],
          ],
          '#f6ecd8'
        );
        ctx.fillRect(-15, 4, 30, 20);

        // Gleaming brass waist collar
        ctx.fillStyle = safeLinearGrad(
          ctx,
          -14.5,
          0,
          14.5,
          0,
          [
            [0, pal.brassDark],
            [0.35, pal.brassHi],
            [1, pal.brass],
          ],
          pal.brass
        );
        ctx.fillRect(-15, 2.2, 30, 3.6);

        // Subtle cylindrical gloss streak on left
        ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
        ctx.fillRect(-10.5, -21, 3.8, 43);
        ctx.restore();

        // Crisp cylinder outline
        ctx.strokeStyle = isShort ? pal.blush : pal.outline;
        ctx.lineWidth = flags.selected || isShort ? 2.1 : 1.45;
        roundRect(ctx, -14.5, -22, 29, 45, 6.5);
        ctx.stroke();

        // Embossed brass '+' on upper sage half
        ctx.strokeStyle = '#fff5db';
        ctx.lineWidth = 2.1;
        ctx.beginPath();
        ctx.moveTo(-4.5, -10.5);
        ctx.lineTo(4.5, -10.5);
        ctx.moveTo(0, -15);
        ctx.lineTo(0, -6);
        ctx.stroke();

        // Subtle espresso '−' on lower cream half
        ctx.strokeStyle = '#6c5646';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-4.2, 13.5);
        ctx.lineTo(4.2, 13.5);
        ctx.stroke();
      } else {
        // Warm brass & ivory wave-orb with dancing warm sine / waveform inside!
        const r = 21;
        ctx.fillStyle = pal.shadow;
        ctx.beginPath();
        ctx.arc(1.4, 2.8, r, 0, Math.PI * 2);
        ctx.fill();

        // Outer brushed brass bezel
        ctx.fillStyle = safeLinearGrad(
          ctx,
          -r,
          -r,
          r,
          r,
          [
            [0, pal.brassHi],
            [0.5, pal.brass],
            [1, pal.brassDark],
          ],
          pal.brass
        );
        ctx.strokeStyle = isShort ? pal.blush : pal.outline;
        ctx.lineWidth = flags.selected || isShort ? 2.1 : 1.4;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Inner warm ivory / dusk velvet glass orb face
        const ir = 16.5;
        const orbGrad = ctx.createRadialGradient(-5, -6, 2, 0, 0, ir);
        if (pal.isDark) {
          orbGrad.addColorStop(0, '#36304e');
          orbGrad.addColorStop(1, '#201c30');
        } else {
          orbGrad.addColorStop(0, '#fffef9');
          orbGrad.addColorStop(1, '#f0e4cc');
        }
        ctx.fillStyle = orbGrad;
        ctx.beginPath();
        ctx.arc(0, 0, ir, 0, Math.PI * 2);
        ctx.fill();

        // Subtle warm glass crescent highlight
        ctx.strokeStyle = pal.isDark ? 'rgba(255, 246, 224, 0.16)' : 'rgba(255, 255, 255, 0.85)';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(0, 0, ir - 3.2, -Math.PI * 0.82, -Math.PI * 0.28);
        ctx.stroke();

        // Dancing warm waveform inside orb
        ctx.strokeStyle = pal.accent;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        if (wf === 'sine') {
          const phase = animT * 4.2;
          const samples = 20;
          for (let i = 0; i <= samples; i++) {
            const u = i / samples;
            const wx = -11.5 + u * 23;
            const wy = -Math.sin(u * Math.PI * 2 + phase) * 6.5;
            if (i === 0) ctx.moveTo(wx, wy);
            else ctx.lineTo(wx, wy);
          }
        } else if (wf === 'square' || wf === 'pulse') {
          ctx.moveTo(-10.5, 4.8);
          ctx.lineTo(-10.5, -5.5);
          ctx.lineTo(0, -5.5);
          ctx.lineTo(0, 5.5);
          ctx.lineTo(10.5, 5.5);
          ctx.lineTo(10.5, -4.8);
        } else {
          ctx.moveTo(-11, 3.8);
          ctx.lineTo(-4, -6.5);
          ctx.lineTo(4, 6.5);
          ctx.lineTo(11, -3.8);
        }
        ctx.stroke();
      }
      break;
    }

    case 'current_source': {
      drawCopperLeads(
        ctx,
        [
          [0, -2 * g, 0, -1.05 * g],
          [0, 1.05 * g, 0, 2 * g],
        ],
        pal
      );
      const r = 20;
      ctx.fillStyle = pal.shadow;
      ctx.beginPath();
      ctx.arc(1.4, 2.8, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = pal.ceramic;
      ctx.strokeStyle = flags.selected ? pal.select : pal.brass;
      ctx.lineWidth = flags.selected ? 2.4 : 2.6;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Inner subtle rim
      ctx.strokeStyle = pal.outline;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, r + 1.1, 0, Math.PI * 2);
      ctx.stroke();

      // Hand-inked terracotta flow arrow jewel
      ctx.strokeStyle = pal.accent;
      ctx.fillStyle = pal.accent;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(0, 9.5);
      ctx.lineTo(0, -6.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -12.5);
      ctx.lineTo(-5.5, -4.5);
      ctx.lineTo(5.5, -4.5);
      ctx.closePath();
      ctx.fill();
      break;
    }

    case 'resistor': {
      const thermal = telemetry?.thermalRatio || 0;
      // Warm coral thermal blush halo when overloaded (fading to own RGB alpha 0!)
      if (thermal > 0.35) {
        const heatAlpha = Math.min(0.55, (thermal - 0.35) * 0.45);
        const hr = g * 1.45;
        const grad = ctx.createRadialGradient(0, 0, 3, 0, 0, hr);
        if (thermal > 1) {
          grad.addColorStop(0, `rgba(218, 76, 86, ${heatAlpha.toFixed(3)})`);
          grad.addColorStop(1, 'rgba(218, 76, 86, 0)');
        } else {
          grad.addColorStop(0, `rgba(227, 157, 52, ${(heatAlpha * 0.8).toFixed(3)})`);
          grad.addColorStop(1, 'rgba(227, 157, 52, 0)');
        }
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, hr, 0, Math.PI * 2);
        ctx.fill();
      }

      drawCopperLeads(
        ctx,
        [
          [-2 * g, 0, -1.25 * g, 0],
          [1.25 * g, 0, 2 * g, 0],
        ],
        pal
      );

      // Helper path for plump porcelain axial "peanut" resistor body
      const tracePeanut = (ox = 0, oy = 0) => {
        ctx.beginPath();
        ctx.moveTo(-25 + ox, -4 + oy);
        ctx.quadraticCurveTo(-25 + ox, -10.8 + oy, -17.5 + ox, -10.8 + oy);
        ctx.quadraticCurveTo(-11.5 + ox, -10.8 + oy, -8.5 + ox, -8.5 + oy);
        ctx.lineTo(8.5 + ox, -8.5 + oy);
        ctx.quadraticCurveTo(11.5 + ox, -10.8 + oy, 17.5 + ox, -10.8 + oy);
        ctx.quadraticCurveTo(25 + ox, -10.8 + oy, 25 + ox, -4 + oy);
        ctx.lineTo(25 + ox, 4 + oy);
        ctx.quadraticCurveTo(25 + ox, 10.8 + oy, 17.5 + ox, 10.8 + oy);
        ctx.quadraticCurveTo(11.5 + ox, 10.8 + oy, 8.5 + ox, 8.5 + oy);
        ctx.lineTo(-8.5 + ox, 8.5 + oy);
        ctx.quadraticCurveTo(-11.5 + ox, 10.8 + oy, -17.5 + ox, 10.8 + oy);
        ctx.quadraticCurveTo(-25 + ox, 10.8 + oy, -25 + ox, 4 + oy);
        ctx.closePath();
      };

      // Cast paper shadow
      ctx.fillStyle = pal.shadow;
      tracePeanut(1.2, 2.7);
      ctx.fill();

      // Glazed warm porcelain body + live 4-band IEC color rings clipped cleanly inside
      ctx.save();
      tracePeanut(0, 0);
      ctx.clip();

      const bodyFill = safeLinearGrad(
        ctx,
        0,
        -11,
        0,
        11,
        thermal > 1
          ? [
              [0, '#fde0d4'],
              [0.45, '#f4b5a6'],
              [1, '#d98170'],
            ]
          : [
              [0, pal.isDark ? '#f2dfc0' : '#fff7e6'],
              [0.45, pal.isDark ? '#e0c69a' : '#f2dfba'],
              [1, pal.isDark ? '#b89a6e' : '#d8be90'],
            ],
        '#f2dfba'
      );
      ctx.fillStyle = bodyFill;
      ctx.fillRect(-26, -12, 52, 24);

      // Compute & paint REAL dynamic 4-band IEC color rings!
      const bands = computeResistorBands(p.resistance);
      const bandSpecs = [
        [-14.5, 4.3, bands[0]],
        [-5.8, 4.3, bands[1]],
        [2.9, 4.3, bands[2]],
        [13.6, 3.6, bands[3]],
      ];
      for (const [bx, bw, col] of bandSpecs) {
        ctx.fillStyle = col;
        ctx.fillRect(bx, -12, bw, 24);
      }

      // Cylindrical bottom shade & top porcelain specular highlight across body + bands
      ctx.fillStyle = 'rgba(45, 30, 18, 0.14)';
      ctx.fillRect(-26, 4.8, 52, 7.5);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.34)';
      roundRect(ctx, -21, -7.2, 42, 3.2, 1.6);
      ctx.fill();
      ctx.restore();

      // Crisp warm ceramic contour
      tracePeanut(0, 0);
      ctx.strokeStyle = thermal > 1 ? pal.blush : pal.outline;
      ctx.lineWidth = flags.selected || thermal > 1 ? 2 : 1.4;
      ctx.stroke();
      break;
    }

    case 'potentiometer': {
      const w = Math.min(0.99, Math.max(0.01, Number(p.wiper) ?? 0.5));
      // Copper leads meeting (-2g, 0), (2g, 0), and (0, -2g) pixel-perfectly
      drawCopperLeads(
        ctx,
        [
          [-2 * g, 0, -15.5, 0],
          [15.5, 0, 2 * g, 0],
          [0, -2 * g, 0, -15.5],
        ],
        pal
      );

      // Tiny brass wiper collar at top of dial
      ctx.fillStyle = pal.brass;
      ctx.strokeStyle = pal.outline;
      ctx.lineWidth = 1.1;
      roundRect(ctx, -3.8, -20.2, 7.6, 5.5, 2);
      ctx.fill();
      ctx.stroke();

      // Cast paper shadow under ceramic base
      ctx.fillStyle = pal.shadow;
      ctx.beginPath();
      ctx.arc(1.2, 2.5, 16.8, 0, Math.PI * 2);
      ctx.fill();

      // Warm ceramic circular base plate
      ctx.fillStyle = pal.ceramic;
      ctx.strokeStyle = flags.potDragActive || flags.selected ? pal.select : pal.outline;
      ctx.lineWidth = flags.potDragActive || flags.selected ? 2.1 : 1.4;
      ctx.beginPath();
      ctx.arc(0, 0, 16.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Engraved warm sepia scale dots sweeping -135 deg to +135 deg around the top!
      const startDeg = -225; // 7:30 o'clock (-90 - 135)
      const sweepDeg = 270;
      for (let k = 0; k < 7; k++) {
        const frac = k / 6;
        const rad = ((startDeg + sweepDeg * frac) * Math.PI) / 180;
        const dx = Math.cos(rad) * 13.8;
        const dy = Math.sin(rad) * 13.8;
        ctx.fillStyle = frac <= w + 0.04 ? pal.accent : pal.inkMuted;
        ctx.beginPath();
        ctx.arc(dx, dy, frac <= w + 0.04 ? 1.45 : 1.1, 0, Math.PI * 2);
        ctx.fill();
      }

      // Tactile brushed-brass & ivory rotary knob cap
      ctx.fillStyle = pal.shadow;
      ctx.beginPath();
      ctx.arc(0.8, 1.6, 10.8, 0, Math.PI * 2);
      ctx.fill();

      const knobGrad = ctx.createRadialGradient(-3, -3.5, 1.4, 0, 0, 11);
      knobGrad.addColorStop(0, pal.brassHi);
      knobGrad.addColorStop(0.65, pal.brass);
      knobGrad.addColorStop(1, pal.brassDark);
      ctx.fillStyle = knobGrad;
      ctx.strokeStyle = pal.outline;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, 10.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Recessed warm ivory top disk on knob
      ctx.fillStyle = pal.isDark ? '#3a3452' : '#fffaf0';
      ctx.beginPath();
      ctx.arc(0, 0, 7.6, 0, Math.PI * 2);
      ctx.fill();

      // Live rotating terracotta pointer notch!
      const ptrRad = ((startDeg + sweepDeg * w) * Math.PI) / 180;
      const px1 = Math.cos(ptrRad) * 2.2;
      const py1 = Math.sin(ptrRad) * 2.2;
      const px2 = Math.cos(ptrRad) * 9.4;
      const py2 = Math.sin(ptrRad) * 9.4;
      ctx.strokeStyle = pal.accent;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(px1, py1);
      ctx.lineTo(px2, py2);
      ctx.stroke();

      // Subtle interactive glow ring when hovered or actively dragging
      if (flags.potDragActive || flags.hovered) {
        ctx.strokeStyle = pal.accent;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = flags.potDragActive ? 0.85 : 0.45;
        ctx.beginPath();
        ctx.arc(0, 0, 19.5, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }

    case 'capacitor': {
      const vCap = telemetry?.voltage || 0;
      const absV = Math.abs(vCap);
      // Smooth energy level clamped 0..10V (gentle curve so low voltages glow visibly)
      const normV = Math.max(0, Math.min(1, absV / 10));
      const fillFrac = normV > 0.01 ? Math.pow(normV, 0.84) : 0;

      // Soft glowing honey-gold outer aura when storing charge (fading to own RGB alpha 0!)
      if (fillFrac > 0.04) {
        const glowR = g * (1.15 + fillFrac * 0.55);
        const grad = ctx.createRadialGradient(0, 0, 3, 0, 0, glowR);
        if (vCap >= -0.05) {
          grad.addColorStop(0, `rgba(245, 188, 88, ${(0.36 * fillFrac).toFixed(3)})`);
          grad.addColorStop(1, 'rgba(245, 188, 88, 0)');
        } else {
          grad.addColorStop(0, `rgba(232, 118, 128, ${(0.34 * fillFrac).toFixed(3)})`);
          grad.addColorStop(1, 'rgba(232, 118, 128, 0)');
        }
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, glowR, 0, Math.PI * 2);
        ctx.fill();
      }

      drawCopperLeads(
        ctx,
        [
          [-2 * g, 0, -21, 0],
          [21, 0, 2 * g, 0],
        ],
        pal
      );

      // Cast paper shadow beneath glass energy jar
      ctx.fillStyle = pal.shadow;
      roundRect(ctx, -21 + 1.2, -14 + 2.8, 42, 28, 7);
      ctx.fill();

      // Translucent miniature glass cylinder chamber
      ctx.save();
      roundRect(ctx, -21, -14, 42, 28, 7);
      ctx.clip();

      // Glass interior tint
      ctx.fillStyle = pal.isDark ? 'rgba(48, 44, 72, 0.82)' : 'rgba(255, 252, 244, 0.86)';
      ctx.fillRect(-22, -15, 44, 30);

      // Glowing honey-gold liquid light inside chamber!
      // Fills from +x toward -x so when vertical (rot=90, +x is bottom) liquid rises bottom-to-top!
      const chamberLeft = -13.5;
      const chamberRight = 13.5;
      const chamberSpan = chamberRight - chamberLeft;
      if (fillFrac > 0.015) {
        const fillLen = chamberSpan * fillFrac;
        const fx = chamberRight - fillLen;
        const liqGrad = safeLinearGrad(
          ctx,
          fx,
          -12,
          chamberRight,
          12,
          vCap >= -0.05
            ? [
                [0, '#ffe49e'],
                [0.45, '#f5bc58'],
                [1, '#d88824'],
              ]
            : [
                [0, '#ffc4ca'],
                [0.45, '#eb7b88'],
                [1, '#c94c5c'],
              ],
          pal.honey
        );
        ctx.fillStyle = liqGrad;
        ctx.fillRect(fx, -13, fillLen + 1, 26);

        // Luminous meniscus shimmer edge
        ctx.strokeStyle = 'rgba(255, 253, 240, 0.82)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(fx, -12);
        ctx.quadraticCurveTo(fx - 2.2, 0, fx, 12);
        ctx.stroke();

        // Tiny glowing energy bubbles inside liquid
        if (fillFrac > 0.22) {
          ctx.fillStyle = 'rgba(255, 252, 232, 0.72)';
          const b1x = fx + fillLen * 0.35;
          const b2x = fx + fillLen * 0.68;
          ctx.beginPath();
          ctx.arc(b1x, -4, 1.6, 0, Math.PI * 2);
          ctx.arc(b2x, 3.8, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Brushed brass & ceramic end-caps on left (+ side) and right (− side)
      const capGradL = safeLinearGrad(
        ctx,
        -21,
        -14,
        -21,
        14,
        [
          [0, pal.brassHi],
          [0.48, pal.brass],
          [1, pal.brassDark],
        ],
        pal.brass
      );
      ctx.fillStyle = capGradL;
      ctx.fillRect(-21, -14, 7.6, 28);
      ctx.fillRect(13.4, -14, 7.6, 28);

      // Subtle glass rim reflection along upper belly
      ctx.fillStyle = pal.isDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(255, 255, 255, 0.72)';
      roundRect(ctx, -11.5, -10.5, 23, 3.8, 1.9);
      ctx.fill();

      // Tiny '+' mark on left brass cap
      ctx.strokeStyle = pal.isDark ? '#251e18' : '#573c18';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-19.2, 0);
      ctx.lineTo(-15.2, 0);
      ctx.moveTo(-17.2, -2);
      ctx.lineTo(-17.2, 2);
      ctx.stroke();
      ctx.restore();

      // Outer glass jar contour
      roundRect(ctx, -21, -14, 42, 28, 7);
      ctx.strokeStyle = pal.outline;
      ctx.lineWidth = flags.selected ? 2.1 : 1.45;
      ctx.stroke();
      break;
    }

    case 'inductor': {
      const iL = Math.abs(telemetry?.current || 0);
      // Warm golden magnetic flux halo proportional to current (fading strictly to own RGB alpha 0!)
      if (iL > 1e-4) {
        const flux = Math.min(0.5, Math.log10(1 + iL * 220) * 0.34);
        const r = g * 1.5;
        const grad = ctx.createRadialGradient(0, 0, 3, 0, 0, r);
        grad.addColorStop(0, `rgba(245, 188, 88, ${flux.toFixed(3)})`);
        grad.addColorStop(1, 'rgba(245, 188, 88, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
      }

      drawCopperLeads(
        ctx,
        [
          [-2 * g, 0, -25, 0],
          [25, 0, 2 * g, 0],
        ],
        pal
      );

      // Cast paper shadow beneath iron core & coils
      ctx.fillStyle = pal.shadow;
      roundRect(ctx, -24 + 1.2, -9 + 2.8, 48, 19, 6);
      ctx.fill();

      // Warm charcoal-iron cylindrical core bar
      ctx.fillStyle = safeLinearGrad(
        ctx,
        0,
        -6,
        0,
        6,
        [
          [0, pal.isDark ? '#6c667c' : '#655c57'],
          [0.5, pal.isDark ? '#464156' : '#453e3b'],
          [1, pal.isDark ? '#2c2838' : '#2d2724'],
        ],
        '#453e3b'
      );
      ctx.strokeStyle = pal.outline;
      ctx.lineWidth = 1.2;
      roundRect(ctx, -25, -5.5, 50, 11, 3.8);
      ctx.fill();
      ctx.stroke();

      // 5 rich wound copper wire coils wrapping plumply over the iron core
      for (let k = 0; k < 5; k++) {
        const cx = -18 + k * 9;
        // Copper turn back/body
        ctx.fillStyle = safeLinearGrad(
          ctx,
          cx - 3.6,
          -11,
          cx + 3.6,
          11,
          [
            [0, '#f3b988'],
            [0.45, '#c97845'],
            [1, '#7e4220'],
          ],
          '#c97845'
        );
        ctx.strokeStyle = pal.outline;
        ctx.lineWidth = 1.1;
        roundRect(ctx, cx - 3.4, -10.5, 6.8, 21, 3.4);
        ctx.fill();
        ctx.stroke();

        // Warm sunlit copper glint on upper shoulder of each winding
        ctx.fillStyle = 'rgba(255, 240, 214, 0.55)';
        roundRect(ctx, cx - 1.6, -8.2, 2.2, 5.5, 1.1);
        ctx.fill();
      }
      break;
    }

    case 'transformer': {
      const iT = Math.abs(telemetry?.current || 0);
      if (iT > 1e-4) {
        const flux = Math.min(0.45, Math.log10(1 + iT * 200) * 0.3);
        const grad = ctx.createRadialGradient(0, 0, 4, 0, 0, g * 1.9);
        grad.addColorStop(0, `rgba(245, 188, 88, ${flux.toFixed(3)})`);
        grad.addColorStop(1, 'rgba(245, 188, 88, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, g * 1.9, 0, Math.PI * 2);
        ctx.fill();
      }

      // Leads from all 4 exact corner pins
      drawCopperLeads(
        ctx,
        [
          [-2 * g, -2 * g, -18, -2 * g],
          [-18, -2 * g, -18, -24],
          [-2 * g, 2 * g, -18, 2 * g],
          [-18, 2 * g, -18, 24],
          [2 * g, -2 * g, 18, -2 * g],
          [18, -2 * g, 18, -24],
          [2 * g, 2 * g, 18, 2 * g],
          [18, 2 * g, 18, 24],
        ],
        pal
      );

      // Cast paper shadow
      ctx.fillStyle = pal.shadow;
      roundRect(ctx, -23 + 1.5, -28 + 3, 46, 56, 7);
      ctx.fill();

      // Charcoal-iron laminated core frame
      ctx.fillStyle = safeLinearGrad(
        ctx,
        -22,
        -28,
        22,
        28,
        [
          [0, pal.isDark ? '#585269' : '#5f5651'],
          [1, pal.isDark ? '#322e42' : '#3a3330'],
        ],
        '#4a4340'
      );
      ctx.strokeStyle = pal.outline;
      ctx.lineWidth = flags.selected ? 2.1 : 1.4;
      roundRect(ctx, -22, -28, 44, 56, 6.5);
      ctx.fill();
      ctx.stroke();

      // Inner recessed core window with twin iron lamination stripes
      ctx.fillStyle = pal.bg;
      roundRect(ctx, -6, -19, 12, 38, 3);
      ctx.fill();
      ctx.strokeStyle = pal.brass;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-2, -22);
      ctx.lineTo(-2, 22);
      ctx.moveTo(2, -22);
      ctx.lineTo(2, 22);
      ctx.stroke();

      // Twin neatly wound copper coil bobbins (primary left, secondary right)
      for (const side of [-1, 1]) {
        const bx = side < 0 ? -24.5 : 8.5;
        for (let k = 0; k < 5; k++) {
          const cy = -18 + k * 9;
          ctx.fillStyle = safeLinearGrad(
            ctx,
            bx,
            cy - 3.5,
            bx + 16,
            cy + 3.5,
            [
              [0, '#f3b988'],
              [0.5, '#c97845'],
              [1, '#7e4220'],
            ],
            '#c97845'
          );
          ctx.strokeStyle = pal.outline;
          ctx.lineWidth = 1;
          roundRect(ctx, bx, cy - 3.6, 16, 7.2, 3.2);
          ctx.fill();
          ctx.stroke();
        }
      }

      // Warm brass polarity dots
      ctx.fillStyle = pal.accent;
      ctx.beginPath();
      ctx.arc(-26, -26, 2.7, 0, Math.PI * 2);
      ctx.arc(26, -26, 2.7, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'led': {
      const led = LED_MODELS[p.color] || LED_MODELS.green;
      const rgb = LED_RGB[p.color] || LED_RGB.green;
      const b = Math.max(0, telemetry?.brightness || 0);
      const iAbs = Math.abs(telemetry?.current || 0);
      ledOverloaded = iAbs > 0.028;

      // Living Firefly Radial Halo (strictly fading to own RGB alpha 0 - NEVER rgba(0,0,0,0)!)
      if (b > 0.02) {
        const bClamped = Math.min(1.35, b);
        const radius = g * (1.25 + bClamped * 1.45);
        const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, radius);
        grad.addColorStop(0, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${Math.min(0.88, 0.35 + bClamped * 0.45).toFixed(3)})`);
        grad.addColorStop(0.38, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${(0.38 * Math.min(1, bClamped)).toFixed(3)})`);
        grad.addColorStop(0.72, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${(0.12 * Math.min(1, bClamped)).toFixed(3)})`);
        grad.addColorStop(1, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Coral blush overload aura when current > 28 mA
      if (ledOverloaded) {
        const blushR = g * 1.55;
        const bGrad = ctx.createRadialGradient(0, 0, 10, 0, 0, blushR);
        bGrad.addColorStop(0, 'rgba(209, 73, 91, 0.36)');
        bGrad.addColorStop(1, 'rgba(209, 73, 91, 0)');
        ctx.fillStyle = bGrad;
        ctx.beginPath();
        ctx.arc(0, 0, blushR, 0, Math.PI * 2);
        ctx.fill();
      }

      drawCopperLeads(
        ctx,
        [
          [-2 * g, 0, -17, 0],
          [17, 0, 2 * g, 0],
        ],
        pal
      );

      // Cast paper shadow under jewel dome
      ctx.fillStyle = pal.shadow;
      ctx.beginPath();
      ctx.arc(1.2, 2.8, 16.5, 0, Math.PI * 2);
      ctx.fill();

      // Delicate brass cathode rim flange on +x side so polarity reads like real hardware
      ctx.fillStyle = pal.brass;
      ctx.strokeStyle = pal.outline;
      ctx.lineWidth = 1.1;
      roundRect(ctx, 13.2, -10.5, 4.6, 21, 2.2);
      ctx.fill();
      ctx.stroke();

      // Crystal-glass domed jewel bulb
      const domeR = 16;
      const domeGrad = ctx.createRadialGradient(-5, -5.5, 1.5, 0, 0, domeR);
      if (b > 0.04) {
        const lum = Math.min(1, b);
        domeGrad.addColorStop(0, '#fffdf5');
        domeGrad.addColorStop(0.28, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${(0.75 + lum * 0.25).toFixed(3)})`);
        domeGrad.addColorStop(0.85, led.color);
        domeGrad.addColorStop(1, `rgba(${Math.round(rgb[0] * 0.6)}, ${Math.round(rgb[1] * 0.6)}, ${Math.round(rgb[2] * 0.6)}, 0.95)`);
      } else {
        domeGrad.addColorStop(0, pal.isDark ? `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.32)` : '#fffdf8');
        domeGrad.addColorStop(0.65, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${pal.isDark ? '0.24' : '0.28'})`);
        domeGrad.addColorStop(1, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${pal.isDark ? '0.45' : '0.42'})`);
      }
      ctx.fillStyle = domeGrad;
      ctx.beginPath();
      ctx.arc(0, 0, domeR, 0, Math.PI * 2);
      ctx.fill();

      // Visible tiny metallic inner anvil & emitter cup inside crystal dome
      ctx.strokeStyle = b > 0.25 ? 'rgba(255, 250, 232, 0.75)' : pal.isDark ? 'rgba(220, 210, 200, 0.45)' : 'rgba(92, 72, 58, 0.45)';
      ctx.fillStyle = b > 0.25 ? 'rgba(255, 250, 232, 0.85)' : pal.isDark ? 'rgba(210, 200, 190, 0.45)' : 'rgba(110, 90, 76, 0.45)';
      ctx.lineWidth = 1.5;
      // Anode post + anvil cup
      ctx.beginPath();
      ctx.moveTo(-12, 0);
      ctx.lineTo(-4, 0);
      ctx.moveTo(12, 0);
      ctx.lineTo(3, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(2.5, -4.5);
      ctx.lineTo(6.5, -2.5);
      ctx.lineTo(6.5, 2.5);
      ctx.lineTo(2.5, 4.5);
      ctx.closePath();
      ctx.fill();

      // Tiny radiant die filament spark when lit
      if (b > 0.04) {
        drawSparkStar(ctx, -0.5, 0, 3.2 + Math.min(3.2, b * 2.8), '#fffdf2', Math.min(1, 0.5 + b * 0.5));
      }

      // Glossy white crescent glass reflection on upper-left dome
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.78)';
      ctx.lineWidth = 2.3;
      ctx.beginPath();
      ctx.arc(0, 0, domeR - 3.6, -Math.PI * 0.85, -Math.PI * 0.35);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.beginPath();
      ctx.arc(-7.8, -6.2, 1.5, 0, Math.PI * 2);
      ctx.fill();

      // Crisp jewel dome rim
      ctx.strokeStyle = ledOverloaded ? pal.blush : b > 0.08 ? led.color : pal.outline;
      ctx.lineWidth = flags.selected || ledOverloaded ? 2.1 : 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, domeR, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }

    case 'diode': {
      const fwd = telemetry?.state === 'FORWARD' || telemetry?.state === 'BREAKDOWN';
      drawCopperLeads(
        ctx,
        [
          [-2 * g, 0, -21, 0],
          [21, 0, 2 * g, 0],
        ],
        pal
      );

      // Cast paper shadow
      ctx.fillStyle = pal.shadow;
      roundRect(ctx, -21 + 1.2, -9.5 + 2.6, 42, 19, 7.5);
      ctx.fill();

      // Glossy espresso-glass capsule
      ctx.save();
      roundRect(ctx, -21, -9.5, 42, 19, 7.5);
      ctx.clip();

      ctx.fillStyle = safeLinearGrad(
        ctx,
        0,
        -10,
        0,
        10,
        [
          [0, '#5a453c'],
          [0.45, '#3b2b25'],
          [1, '#241915'],
        ],
        '#3b2b25'
      );
      ctx.fillRect(-22, -11, 44, 22);

      // Brushed silver-ivory cathode band (or warm gold/amber accent for Schottky/Zener)
      const bandCol = p.model === 'zener' ? '#e8b954' : p.model === 'schottky' ? '#d49a6a' : '#e7e2d8';
      ctx.fillStyle = bandCol;
      ctx.fillRect(9.5, -11, 5.2, 22);

      // Curved glass specular highlight along top
      ctx.fillStyle = 'rgba(255, 252, 245, 0.25)';
      roundRect(ctx, -17, -7, 34, 3.2, 1.6);
      ctx.fill();
      ctx.restore();

      // Capsule rim
      roundRect(ctx, -21, -9.5, 42, 19, 7.5);
      ctx.strokeStyle = fwd ? pal.sage : pal.outline;
      ctx.lineWidth = flags.selected || fwd ? 1.9 : 1.4;
      ctx.stroke();

      // Center sage one-way arrow jewel that illuminates when conducting!
      if (fwd) {
        const gRad = ctx.createRadialGradient(-2, 0, 1, -2, 0, 12);
        gRad.addColorStop(0, 'rgba(82, 209, 160, 0.55)');
        gRad.addColorStop(1, 'rgba(82, 209, 160, 0)');
        ctx.fillStyle = gRad;
        ctx.beginPath();
        ctx.arc(-2, 0, 12, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = fwd ? '#5ce0ac' : '#a89c92';
      ctx.beginPath();
      ctx.moveTo(-7.5, -4.5);
      ctx.lineTo(-7.5, 4.5);
      ctx.lineTo(2.5, 0);
      ctx.closePath();
      ctx.fill();
      break;
    }

    case 'switch':
    case 'pushbutton': {
      const closed = !!p.closed;
      const energized = closed && Math.abs(telemetry?.current || 0) > 1e-4;
      drawCopperLeads(
        ctx,
        [
          [-2 * g, 0, -18, 0],
          [18, 0, 2 * g, 0],
        ],
        pal
      );

      if (comp.type === 'switch') {
        // Warm walnut/ceramic mounting baseplate
        ctx.fillStyle = pal.shadow;
        roundRect(ctx, -23 + 1.2, -11 + 2.6, 46, 22, 8);
        ctx.fill();

        ctx.fillStyle = safeLinearGrad(
          ctx,
          0,
          -11,
          0,
          11,
          pal.isDark
            ? [
                [0, '#3a324d'],
                [1, '#262136'],
              ]
            : [
                [0, '#f5e7ce'],
                [1, '#dfcaa4'],
              ],
          pal.ceramic
        );
        ctx.strokeStyle = pal.outline;
        ctx.lineWidth = flags.selected ? 2 : 1.4;
        roundRect(ctx, -23, -11, 46, 22, 8);
        ctx.fill();
        ctx.stroke();

        // Recessed contact slot groove
        ctx.fillStyle = pal.isDark ? 'rgba(14, 11, 24, 0.45)' : 'rgba(92, 66, 44, 0.14)';
        roundRect(ctx, -16, -3.5, 32, 7, 3.5);
        ctx.fill();

        // Two glossy brass terminal studs
        for (const tx of [-14, 14]) {
          ctx.fillStyle = pal.brass;
          ctx.strokeStyle = pal.outline;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(tx, 0, 4.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = pal.brassHi;
          ctx.beginPath();
          ctx.arc(tx - 1, -1.2, 1.4, 0, Math.PI * 2);
          ctx.fill();
        }

        // Clickable brushed-brass toggle lever
        const tipX = closed ? 14 : 11.5;
        const tipY = closed ? 0 : -14.5;
        ctx.strokeStyle = pal.shadow;
        ctx.lineWidth = 4.2;
        ctx.beginPath();
        ctx.moveTo(-14, 2);
        ctx.lineTo(tipX, tipY + 2.5);
        ctx.stroke();

        ctx.strokeStyle = closed ? pal.sage : pal.brass;
        ctx.lineWidth = 3.6;
        ctx.beginPath();
        ctx.moveTo(-14, 0);
        ctx.lineTo(tipX, tipY);
        ctx.stroke();

        // Cute terracotta grip bead on lever tip
        ctx.fillStyle = closed ? pal.sage : pal.accent;
        ctx.strokeStyle = pal.outline;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.arc(tipX, tipY, 4.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.beginPath();
        ctx.arc(tipX - 1.2, tipY - 1.3, 1.3, 0, Math.PI * 2);
        ctx.fill();

        // Tiny golden spark star when closed & energized!
        if (energized) {
          const tw = 0.72 + 0.28 * Math.sin(animT * 7.5);
          drawSparkStar(ctx, 0, -0.5, 6.2 * tw, '#ffe484', 0.95);
          drawSparkStar(ctx, 14, -7.5, 3.8 * tw, '#fff7d4', 0.85);
        }
      } else {
        // Pushbutton: ceramic square housing + plump terracotta push-dome!
        ctx.fillStyle = pal.shadow;
        roundRect(ctx, -19 + 1.2, -16 + 2.8, 38, 32, 8);
        ctx.fill();

        ctx.fillStyle = pal.ceramic;
        ctx.strokeStyle = pal.outline;
        ctx.lineWidth = flags.selected ? 2 : 1.4;
        roundRect(ctx, -19, -16, 38, 32, 8);
        ctx.fill();
        ctx.stroke();

        // Tiny brass corner screws
        ctx.fillStyle = pal.brass;
        for (const [sx, sy] of [
          [-13.5, -10.5],
          [13.5, -10.5],
          [-13.5, 10.5],
          [13.5, 10.5],
        ]) {
          ctx.beginPath();
          ctx.arc(sx, sy, 1.6, 0, Math.PI * 2);
          ctx.fill();
        }

        // Plump terracotta push-dome cap (depresses slightly when pressed!)
        const domeY = closed ? 1 : -1.5;
        const domeR = closed ? 10.2 : 11.2;
        if (!closed) {
          ctx.fillStyle = pal.shadow;
          ctx.beginPath();
          ctx.arc(0.8, 2.2, domeR, 0, Math.PI * 2);
          ctx.fill();
        }
        const capGrad = ctx.createRadialGradient(-3.5, domeY - 3.5, 1.5, 0, domeY, domeR);
        if (closed) {
          capGrad.addColorStop(0, '#f3a18d');
          capGrad.addColorStop(0.55, pal.accent);
          capGrad.addColorStop(1, '#983724');
        } else {
          capGrad.addColorStop(0, '#f9b39f');
          capGrad.addColorStop(0.55, pal.accent);
          capGrad.addColorStop(1, '#a93f2b');
        }
        ctx.fillStyle = capGrad;
        ctx.strokeStyle = pal.outline;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.arc(0, domeY, domeR, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Glossy dome highlight crescent
        ctx.strokeStyle = 'rgba(255, 250, 240, 0.65)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, domeY, domeR - 3.2, -Math.PI * 0.82, -Math.PI * 0.25);
        ctx.stroke();

        if (energized) {
          const tw = 0.72 + 0.28 * Math.sin(animT * 8);
          drawSparkStar(ctx, 11, -11, 5.2 * tw, '#ffe484', 0.95);
        }
      }
      break;
    }

    case 'spdt': {
      const pos = Number(p.position) === 1 ? 1 : 0;
      drawCopperLeads(
        ctx,
        [
          [-2 * g, 0, -17, 0],
          [17, -g, 2 * g, -g],
          [17, g, 2 * g, g],
        ],
        pal
      );

      // Warm ceramic-wood oval mounting plate
      ctx.fillStyle = pal.shadow;
      roundRect(ctx, -22 + 1.2, -26 + 2.8, 44, 52, 11);
      ctx.fill();

      ctx.fillStyle = pal.ceramic;
      ctx.strokeStyle = pal.outline;
      ctx.lineWidth = flags.selected ? 2 : 1.4;
      roundRect(ctx, -22, -26, 44, 52, 11);
      ctx.fill();
      ctx.stroke();

      // Three gleaming brass studs
      const studs = [
        [-13.5, 0, true],
        [13.5, -16, pos === 0],
        [13.5, 16, pos === 1],
      ];
      for (const [tx, ty, hot] of studs) {
        ctx.fillStyle = hot ? pal.brassHi : pal.brass;
        ctx.strokeStyle = hot ? pal.sage : pal.outline;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(tx, ty, 3.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Brass toggle selector lever with terracotta grip bead
      const targetY = pos === 0 ? -16 : 16;
      ctx.strokeStyle = pal.brass;
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(-13.5, 0);
      ctx.lineTo(13.5, targetY);
      ctx.stroke();

      ctx.fillStyle = pal.accent;
      ctx.strokeStyle = pal.outline;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(0, targetY * 0.5, 3.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    }

    case 'npn':
    case 'pnp':
    case 'nmos':
    case 'pmos': {
      const isP = comp.type === 'pnp' || comp.type === 'pmos';
      const isMos = comp.type === 'nmos' || comp.type === 'pmos';
      const conducting =
        telemetry?.state === 'ACTIVE' ||
        telemetry?.state === 'SATURATION' ||
        telemetry?.state === 'LINEAR';

      // Copper leads meeting exact pins (-2g, 0), (g, -2g), (g, 2g)
      drawCopperLeads(
        ctx,
        [
          [-2 * g, 0, -18, 0],
          [g, -2 * g, g, -20],
          [g, 2 * g, g, 20],
        ],
        pal
      );

      const cx = 1;
      const r = 24;

      // Soft conducting glow behind capsule (pure RGB fade to alpha 0)
      if (conducting) {
        const gRad = ctx.createRadialGradient(cx, 0, 6, cx, 0, r + 12);
        gRad.addColorStop(0, 'rgba(82, 209, 160, 0.36)');
        gRad.addColorStop(1, 'rgba(82, 209, 160, 0)');
        ctx.fillStyle = gRad;
        ctx.beginPath();
        ctx.arc(cx, 0, r + 12, 0, Math.PI * 2);
        ctx.fill();
      }

      // Cast paper shadow
      ctx.fillStyle = pal.shadow;
      ctx.beginPath();
      ctx.arc(cx + 1.4, 2.8, r, 0, Math.PI * 2);
      ctx.fill();

      // Charming rounded ceramic-and-brass capsule
      ctx.fillStyle = pal.ceramic;
      ctx.strokeStyle = flags.selected ? pal.select : conducting ? pal.sage : isP ? pal.indigo : pal.brass;
      ctx.lineWidth = flags.selected ? 2.4 : 2.5;
      ctx.beginPath();
      ctx.arc(cx, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Inner hairline bevel
      ctx.strokeStyle = pal.outline;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.arc(cx, 0, r + 1.1, 0, Math.PI * 2);
      ctx.stroke();

      // Internal illuminated gate/channel bridge geometry
      const bridgeCol = conducting ? pal.sage : pal.ink;
      if (!isMos) {
        // BJT base bar + collector/emitter legs
        ctx.strokeStyle = pal.inkSoft;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-20, 0);
        ctx.lineTo(-9, 0);
        ctx.stroke();

        ctx.strokeStyle = bridgeCol;
        ctx.lineWidth = 3.4;
        ctx.beginPath();
        ctx.moveTo(-9, -13.5);
        ctx.lineTo(-9, 13.5);
        ctx.stroke();

        ctx.strokeStyle = conducting ? pal.honey : pal.ink;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(-9, -6.5);
        ctx.lineTo(13, -16);
        ctx.lineTo(g, -20);
        ctx.moveTo(-9, 6.5);
        ctx.lineTo(13, 16);
        ctx.lineTo(g, 20);
        ctx.stroke();

        // Emitter arrow
        ctx.fillStyle = conducting ? pal.sage : pal.accent;
        ctx.beginPath();
        if (!isP) {
          ctx.moveTo(11.5, 15.2);
          ctx.lineTo(2.5, 15.2);
          ctx.lineTo(6.2, 8.8);
        } else {
          ctx.moveTo(-4.8, -8.5);
          ctx.lineTo(4.2, -9.2);
          ctx.lineTo(1.2, -15.6);
        }
        ctx.closePath();
        ctx.fill();
      } else {
        // MOSFET insulated gate + glowing 3-bar channel bridge
        ctx.strokeStyle = pal.inkSoft;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-20, 0);
        ctx.lineTo(-11, 0);
        ctx.moveTo(-11, -13);
        ctx.lineTo(-11, 13);
        ctx.stroke();

        ctx.strokeStyle = bridgeCol;
        ctx.lineWidth = conducting ? 3.2 : 2.6;
        ctx.beginPath();
        ctx.moveTo(-4, -14);
        ctx.lineTo(-4, -5.5);
        ctx.moveTo(-4, -3);
        ctx.lineTo(-4, 3);
        ctx.moveTo(-4, 5.5);
        ctx.lineTo(-4, 14);
        ctx.stroke();

        // Drain/Source/Bulk leads inside capsule
        ctx.strokeStyle = conducting ? pal.honey : pal.ink;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-4, -10.5);
        ctx.lineTo(15, -10.5);
        ctx.lineTo(g, -20);
        ctx.moveTo(-4, 10.5);
        ctx.lineTo(15, 10.5);
        ctx.lineTo(g, 20);
        ctx.moveTo(-4, 0);
        ctx.lineTo(15, 0);
        ctx.lineTo(15, isP ? -10.5 : 10.5);
        ctx.stroke();

        // Substrate arrow
        ctx.fillStyle = conducting ? pal.sage : pal.accent;
        ctx.beginPath();
        if (!isP) {
          ctx.moveTo(-2.5, 0);
          ctx.lineTo(5.5, -4);
          ctx.lineTo(5.5, 4);
        } else {
          ctx.moveTo(9.5, 0);
          ctx.lineTo(1.5, -4);
          ctx.lineTo(1.5, 4);
        }
        ctx.closePath();
        ctx.fill();
      }

      // Live glowing core jewel dot when conducting
      if (conducting) {
        ctx.fillStyle = '#fff9df';
        ctx.beginPath();
        ctx.arc(-6, 0, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    case 'opamp': {
      const rail = telemetry?.state === 'RAIL+' || telemetry?.state === 'RAIL−';
      const vOut = telemetry?.voltage || 0;
      drawCopperLeads(
        ctx,
        [
          [-2 * g, -g, -23, -g],
          [-2 * g, g, -23, g],
          [26, 0, 2 * g, 0],
        ],
        pal
      );

      // Softly rounded clay-ceramic studio triangle tile
      const traceTri = (ox = 0, oy = 0) => {
        ctx.beginPath();
        ctx.moveTo(-23 + ox, -26 + oy);
        ctx.quadraticCurveTo(-23 + ox, -33 + oy, -16 + ox, -29 + oy);
        ctx.lineTo(24 + ox, -4 + oy);
        ctx.quadraticCurveTo(30 + ox, 0 + oy, 24 + ox, 4 + oy);
        ctx.lineTo(-16 + ox, 29 + oy);
        ctx.quadraticCurveTo(-23 + ox, 33 + oy, -23 + ox, 26 + oy);
        ctx.closePath();
      };

      ctx.fillStyle = pal.shadow;
      traceTri(1.5, 3);
      ctx.fill();

      ctx.fillStyle = safeLinearGrad(
        ctx,
        -22,
        -30,
        24,
        30,
        pal.isDark
          ? [
              [0, '#36304e'],
              [1, '#252036'],
            ]
          : [
              [0, '#fffbf2'],
              [1, '#efe2c8'],
            ],
        pal.ceramic
      );
      ctx.strokeStyle = flags.selected ? pal.select : rail ? pal.honey : pal.outline;
      ctx.lineWidth = flags.selected || rail ? 2.1 : 1.5;
      traceTri(0, 0);
      ctx.fill();
      ctx.stroke();

      // Embossed + and - signs
      ctx.strokeStyle = pal.sage;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-17, -18);
      ctx.lineTo(-10, -18);
      ctx.moveTo(-13.5, -21.5);
      ctx.lineTo(-13.5, -14.5);
      ctx.stroke();

      ctx.strokeStyle = pal.inkSoft;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-17, 18);
      ctx.lineTo(-10, 18);
      ctx.stroke();

      // Live glowing output pearl near apex!
      const pearlCol = Math.abs(vOut) < 0.15 ? pal.inkMuted : vOut > 0 ? pal.sage : pal.blush;
      if (Math.abs(vOut) >= 0.15) {
        const pGrad = ctx.createRadialGradient(13, 0, 1, 13, 0, 10);
        pGrad.addColorStop(0, vOut > 0 ? 'rgba(82, 209, 160, 0.5)' : 'rgba(242, 109, 125, 0.5)');
        pGrad.addColorStop(1, vOut > 0 ? 'rgba(82, 209, 160, 0)' : 'rgba(242, 109, 125, 0)');
        ctx.fillStyle = pGrad;
        ctx.beginPath();
        ctx.arc(13, 0, 10, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = pearlCol;
      ctx.beginPath();
      ctx.arc(13, 0, 3.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.beginPath();
      ctx.arc(12, -1.1, 1.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'gate_and':
    case 'gate_or':
    case 'gate_not':
    case 'gate_nand':
    case 'gate_xor': {
      const high = !!telemetry?.logicHigh;
      const isNot = comp.type === 'gate_not';
      const hasBubble = isNot || comp.type === 'gate_nand';

      drawCopperLeads(
        ctx,
        isNot
          ? [
              [-2 * g, 0, -18, 0],
              [24, 0, 2 * g, 0],
            ]
          : [
              [-2 * g, -g, -16, -g],
              [-2 * g, g, -16, g],
              [hasBubble ? 26 : 20, 0, 2 * g, 0],
            ],
        pal
      );

      const traceGate = (ox = 0, oy = 0) => {
        if (isNot) {
          ctx.beginPath();
          ctx.moveTo(-18 + ox, -18 + oy);
          ctx.quadraticCurveTo(-18 + ox, -23 + oy, -13 + ox, -20 + oy);
          ctx.lineTo(15 + ox, -3 + oy);
          ctx.quadraticCurveTo(20 + ox, 0 + oy, 15 + ox, 3 + oy);
          ctx.lineTo(-13 + ox, 20 + oy);
          ctx.quadraticCurveTo(-18 + ox, 23 + oy, -18 + ox, 18 + oy);
          ctx.closePath();
        } else if (comp.type === 'gate_and' || comp.type === 'gate_nand') {
          ctx.beginPath();
          ctx.moveTo(-13 + ox, -24 + oy);
          ctx.lineTo(0 + ox, -24 + oy);
          ctx.arc(0 + ox, 0 + oy, 24, -Math.PI / 2, Math.PI / 2, false);
          ctx.lineTo(-13 + ox, 24 + oy);
          ctx.quadraticCurveTo(-18 + ox, 24 + oy, -18 + ox, 19 + oy);
          ctx.lineTo(-18 + ox, -19 + oy);
          ctx.quadraticCurveTo(-18 + ox, -24 + oy, -13 + ox, -24 + oy);
          ctx.closePath();
        } else {
          ctx.beginPath();
          ctx.moveTo(-17 + ox, -24 + oy);
          ctx.quadraticCurveTo(6 + ox, -24 + oy, 21 + ox, 0 + oy);
          ctx.quadraticCurveTo(6 + ox, 24 + oy, -17 + ox, 24 + oy);
          ctx.quadraticCurveTo(-6 + ox, 0 + oy, -17 + ox, -24 + oy);
          ctx.closePath();
        }
      };

      // Cast paper shadow
      ctx.fillStyle = pal.shadow;
      traceGate(1.4, 2.8);
      ctx.fill();

      // XOR secondary curved crest
      if (comp.type === 'gate_xor') {
        ctx.strokeStyle = pal.outline;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(-23, -23);
        ctx.quadraticCurveTo(-11.5, 0, -23, 23);
        ctx.stroke();
      }

      // Warm glazed clay-ceramic studio tile
      ctx.fillStyle = safeLinearGrad(
        ctx,
        -18,
        -24,
        18,
        24,
        pal.isDark
          ? [
              [0, '#37314f'],
              [1, '#262138'],
            ]
          : [
              [0, '#fffbf0'],
              [1, '#efe1c4'],
            ],
        pal.ceramic
      );
      ctx.strokeStyle = flags.selected ? pal.select : high ? pal.sage : pal.outline;
      ctx.lineWidth = flags.selected || high ? 2.1 : 1.5;
      traceGate(0, 0);
      ctx.fill();
      ctx.stroke();

      // Bubble for NOT / NAND
      if (hasBubble) {
        const bx = isNot ? 21.5 : 27.5;
        ctx.fillStyle = high ? pal.sage : pal.ceramic;
        ctx.strokeStyle = flags.selected ? pal.select : high ? pal.sage : pal.outline;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(bx, 0, 4.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Live glowing output pearl nestled inside tile!
      const px = isNot ? 4 : 9.5;
      if (high) {
        const pGrad = ctx.createRadialGradient(px, 0, 1, px, 0, 11);
        pGrad.addColorStop(0, 'rgba(82, 209, 160, 0.55)');
        pGrad.addColorStop(1, 'rgba(82, 209, 160, 0)');
        ctx.fillStyle = pGrad;
        ctx.beginPath();
        ctx.arc(px, 0, 11, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = high ? '#4fd19d' : pal.isDark ? '#4a4361' : '#cfc2ae';
      ctx.beginPath();
      ctx.arc(px, 0, 4.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = high ? 'rgba(255, 255, 240, 0.85)' : 'rgba(255, 255, 255, 0.4)';
      ctx.beginPath();
      ctx.arc(px - 1.2, -1.3, 1.3, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'voltmeter':
    case 'ammeter': {
      // Copper leads in rotated frame, vintage brass analog needle dial upright in world space!
      drawCopperLeads(
        ctx,
        [
          [-2 * g, 0, -22, 0],
          [22, 0, 2 * g, 0],
        ],
        pal
      );
      ctx.restore();
      drawAnalogGauge(ctx, comp, telemetry, theme, flags);
      return;
    }

    case 'logic_in': {
      const high = !!p.state;
      ctx.strokeStyle = high ? pal.sage : pal.copper;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(0.85 * g, 0);
      ctx.lineTo(2 * g, 0);
      ctx.stroke();
      ctx.restore();
      drawDominoKeycap(ctx, comp, theme, flags);
      return;
    }

    case 'probe': {
      ctx.restore();
      drawWatercolorPennant(ctx, comp, telemetry, theme, flags);
      return;
    }
  }

  ctx.restore();

  // Rising curly smoke wisps in UPRIGHT world space when LED is overloaded (> 28 mA)!
  if (ledOverloaded) {
    drawOverloadSmokeWisps(ctx, comp.gx * g, comp.gy * g, animT, pal);
  }

  // Crisp upright designator & value labels outside rotated transform
  if (comp.type !== 'ground' && comp.type !== 'probe') {
    drawComponentLabels(ctx, comp, telemetry, theme, flags, 'illustrated');
  }
}

/**
 * Adorable rising curly smoke wisps drawn upright above an overloaded LED (> 28 mA).
 */
function drawOverloadSmokeWisps(ctx, cx, cy, animT, pal) {
  ctx.save();
  ctx.lineCap = 'round';
  const wisps = [
    { ox: -7, phase: 0, h: 18 },
    { ox: 0, phase: 0.38, h: 23 },
    { ox: 7, phase: 0.72, h: 17 },
  ];
  for (const w of wisps) {
    const cycle = (animT * 0.75 + w.phase) % 1;
    const baseY = cy - 17 - cycle * 11;
    const alpha = Math.sin(cycle * Math.PI) * (pal.isDark ? 0.55 : 0.45);
    if (alpha <= 0.02) continue;
    const sway = Math.sin(animT * 3.5 + w.phase * 6) * 2.4;
    ctx.strokeStyle = pal.isDark ? `rgba(246, 232, 224, ${alpha.toFixed(3)})` : `rgba(116, 88, 76, ${alpha.toFixed(3)})`;
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.moveTo(cx + w.ox, baseY);
    ctx.quadraticCurveTo(cx + w.ox - 4.5 + sway, baseY - w.h * 0.35, cx + w.ox + 1.5, baseY - w.h * 0.65);
    ctx.quadraticCurveTo(cx + w.ox + 5.5 - sway, baseY - w.h * 0.88, cx + w.ox - 1, baseY - w.h);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Vintage miniature brass-bezel analog needle dial gauge for Voltmeter & Ammeter!
 */
function drawAnalogGauge(ctx, comp, telemetry, theme, flags) {
  const g = GRID_SIZE;
  const cx = comp.gx * g;
  const cy = comp.gy * g;
  const isV = comp.type === 'voltmeter';
  const pal = resolvePalette(theme, flags);

  const raw = Number.isFinite(isV ? telemetry?.voltage : telemetry?.current)
    ? isV
      ? telemetry.voltage
      : telemetry.current
    : 0;
  const readout = isV
    ? `${raw >= 0 ? '' : '−'}${Math.abs(raw) >= 10 ? Math.abs(raw).toFixed(1) : Math.abs(raw).toFixed(2)}V`
    : formatCompactSI(Math.abs(raw) < 1e-6 ? 0 : raw, 'A');

  // Smooth real-physics needle deflection angle (-62 deg .. +62 deg around straight-up -90 deg)
  const norm = isV ? Math.tanh(raw / 8) : Math.tanh(raw * 42);
  const needleAngle = -Math.PI / 2 + norm * ((62 * Math.PI) / 180);

  ctx.save();
  if (flags.ghost) ctx.globalAlpha = 0.58;

  const r = 24;
  // Soft paper drop shadow
  ctx.fillStyle = pal.shadow;
  ctx.beginPath();
  ctx.arc(cx + 1.4, cy + 3, r, 0, Math.PI * 2);
  ctx.fill();

  // Vintage brushed brass outer bezel
  ctx.fillStyle = safeLinearGrad(
    ctx,
    cx - r,
    cy - r,
    cx + r,
    cy + r,
    [
      [0, pal.brassHi],
      [0.45, pal.brass],
      [1, pal.brassDark],
    ],
    pal.brass
  );
  ctx.strokeStyle = flags.selected ? pal.select : pal.outline;
  ctx.lineWidth = flags.selected ? 2.2 : 1.4;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Warm cream / twilight recessed dial face
  const ir = 19.6;
  ctx.fillStyle = pal.isDark ? '#252136' : '#fffbf1';
  ctx.beginPath();
  ctx.arc(cx, cy, ir, 0, Math.PI * 2);
  ctx.fill();

  // Delicate warm sepia scale arc
  const pivotY = cy + 6.5;
  const arcR = 16.5;
  const aStart = -Math.PI / 2 - (62 * Math.PI) / 180;
  const aEnd = -Math.PI / 2 + (62 * Math.PI) / 180;
  ctx.strokeStyle = pal.isDark ? 'rgba(246, 238, 224, 0.28)' : 'rgba(111, 93, 80, 0.34)';
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.arc(cx, pivotY, arcR, aStart, aEnd);
  ctx.stroke();

  // Subtle colored zone hint on right end of scale (sage for V, blush for high A)
  ctx.strokeStyle = isV ? pal.sage : pal.blush;
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.arc(cx, pivotY, arcR, aEnd - 0.34, aEnd);
  ctx.stroke();

  // 7 tiny hand-drafted dial tick marks
  ctx.strokeStyle = pal.isDark ? 'rgba(246, 238, 224, 0.5)' : 'rgba(84, 64, 50, 0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let k = 0; k <= 6; k++) {
    const a = aStart + (k / 6) * (aEnd - aStart);
    const len = k === 3 ? 4.2 : 2.8;
    ctx.moveTo(cx + Math.cos(a) * (arcR - len), pivotY + Math.sin(a) * (arcR - len));
    ctx.lineTo(cx + Math.cos(a) * arcR, pivotY + Math.sin(a) * arcR);
  }
  ctx.stroke();

  // Subtle dial type emblem ('V' or 'A') tucked behind needle
  ctx.font = '700 7.5px "Plus Jakarta Sans", "Segoe UI", sans-serif';
  ctx.fillStyle = pal.inkMuted;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(isV ? 'V' : 'A', cx, cy - 3.5);

  // REAL LIVE SWINGING TERRACOTTA NEEDLE!
  const nx = cx + Math.cos(needleAngle) * (arcR - 1.5);
  const ny = pivotY + Math.sin(needleAngle) * (arcR - 1.5);
  ctx.strokeStyle = pal.accent;
  ctx.lineWidth = 1.9;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx, pivotY);
  ctx.lineTo(nx, ny);
  ctx.stroke();

  // Tiny brass pivot cap
  ctx.fillStyle = pal.brass;
  ctx.strokeStyle = pal.outline;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.arc(cx, pivotY, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Clean miniature micro readout pill nestled cleanly below dial
  ctx.font = '700 9px "JetBrains Mono", Consolas, monospace';
  const tw = ctx.measureText(readout).width;
  const pw = Math.max(38, tw + 10);
  const ph = 14.5;
  const px = cx - pw * 0.5;
  const py = cy + 16.5;

  ctx.fillStyle = pal.surface;
  ctx.strokeStyle = isV ? pal.sage : pal.honey;
  ctx.lineWidth = 1.25;
  roundRect(ctx, px, py, pw, ph, 5);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = isV ? pal.sage : pal.honey;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(readout, cx, py + ph * 0.5 + 0.4);

  // Warm upright designator above brass bezel
  ctx.font = '700 10px "Plus Jakarta Sans", "Segoe UI", sans-serif';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = pal.bg;
  ctx.lineWidth = 3.2;
  ctx.strokeText(comp.designator, cx, cy - r - 8);
  ctx.fillStyle = flags.selected ? pal.select : pal.inkSoft;
  ctx.fillText(comp.designator, cx, cy - r - 8);
  ctx.restore();
}

/**
 * Chunky tactile wooden/enamel domino keycap for Logic Input (0 calm slate-cream, 1 glowing honey-emerald).
 */
function drawDominoKeycap(ctx, comp, theme, flags) {
  const g = GRID_SIZE;
  const cx = comp.gx * g;
  const cy = comp.gy * g;
  const high = !!comp.params.state;
  const pal = resolvePalette(theme, flags);

  ctx.save();
  if (flags.ghost) ctx.globalAlpha = 0.58;

  const size = 34;
  const x = cx - size * 0.5;
  const y = cy - size * 0.5;

  // Soft honey-emerald halo when HIGH
  if (high) {
    const grad = ctx.createRadialGradient(cx, cy, 8, cx, cy, 28);
    grad.addColorStop(0, 'rgba(82, 209, 160, 0.34)');
    grad.addColorStop(1, 'rgba(82, 209, 160, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, 28, 0, Math.PI * 2);
    ctx.fill();
  }

  // Stamp shadow & tactile keycap skirt (deeper when unpressed, snugger when HIGH)
  const lift = high ? 1.5 : 3;
  ctx.fillStyle = pal.shadow;
  roundRect(ctx, x + 1, y + lift + 2, size, size, 9);
  ctx.fill();

  ctx.fillStyle = high ? pal.sageDeep : pal.isDark ? '#1e1b2d' : '#d5c7b0';
  roundRect(ctx, x, y + lift, size, size, 9);
  ctx.fill();

  // Keycap enamel top face
  ctx.fillStyle = high
    ? safeLinearGrad(
        ctx,
        x,
        y,
        x,
        y + size,
        [
          [0, '#44b88a'],
          [1, '#2a7d5e'],
        ],
        pal.sage
      )
    : safeLinearGrad(
        ctx,
        x,
        y,
        x,
        y + size,
        pal.isDark
          ? [
              [0, '#36314c'],
              [1, '#28233a'],
            ]
          : [
              [0, '#fffdf7'],
              [1, '#ece1cd'],
            ],
        pal.ceramic
      );
  ctx.strokeStyle = flags.selected ? pal.select : high ? '#6ee2b3' : pal.outline;
  ctx.lineWidth = flags.selected ? 2.1 : 1.5;
  roundRect(ctx, x, y, size, size, 9);
  ctx.fill();
  ctx.stroke();

  // Soft glossy upper bevel on keycap
  ctx.fillStyle = high ? 'rgba(255, 252, 232, 0.24)' : pal.ceramicHi;
  roundRect(ctx, x + 4, y + 3, size - 8, 5, 2.5);
  ctx.fill();

  // Crisp numeral
  ctx.font = '800 15.5px "JetBrains Mono", Consolas, monospace';
  ctx.fillStyle = high ? '#fffdf5' : pal.inkSoft;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(high ? '1' : '0', cx, cy + 1);

  // Warm upright designator above keycap
  ctx.font = '700 10px "Plus Jakarta Sans", "Segoe UI", sans-serif';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = pal.bg;
  ctx.lineWidth = 3.2;
  ctx.strokeText(comp.designator, cx, y - 9);
  ctx.fillStyle = flags.selected ? pal.select : pal.ink;
  ctx.fillText(comp.designator, cx, y - 9);
  ctx.restore();
}

/**
 * Cute watercolor pennant tag tethered to the wire for Scope Probes.
 */
function drawWatercolorPennant(ctx, comp, telemetry, theme, flags) {
  const g = GRID_SIZE;
  const px = comp.gx * g;
  const py = comp.gy * g;
  const ch = Number(comp.params.channel) || 1;
  const pal = resolvePalette(theme, flags);

  // Harmonized Atelier channel palette (crisp on both sunlit parchment and twilight indigo)
  const channelCols = pal.isDark
    ? { 1: '#52d1a0', 2: '#f5bc58', 3: '#8ca7e0', 4: '#f26d7d' }
    : { 1: '#267d5d', 2: '#cc7c19', 3: '#3e62a6', 4: '#d45044' };
  const col = channelCols[ch] || PROBE_COLORS[ch] || pal.sage;
  const label = comp.params.label || `CH${ch}`;
  const vStr = telemetry ? formatSignedVoltage(telemetry.voltage).trim() : '';

  ctx.save();
  if (flags.ghost) ctx.globalAlpha = 0.58;

  // Delicate brass tether line up to pennant
  ctx.strokeStyle = pal.brass;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.quadraticCurveTo(px + 3, py - 11, px + 8, py - 19);
  ctx.stroke();

  // Gleaming contact jewel bead on wire
  ctx.fillStyle = col;
  ctx.strokeStyle = pal.surface;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(px, py, 4.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Watercolor paper pennant flag (preserving hit bounds: px+4..px+85, py-40..py-14)
  const text = vStr ? `${label} ${vStr}` : label;
  ctx.font = '600 10.5px "JetBrains Mono", Consolas, monospace';
  const tw = ctx.measureText(text).width;
  const bw = Math.max(48, tw + 19);
  const bh = 21;
  const bx = px + 6;
  const by = py - 38;

  const tracePennant = (ox = 0, oy = 0) => {
    ctx.beginPath();
    ctx.moveTo(bx + 4 + ox, by + oy);
    ctx.lineTo(bx + bw - 6 + ox, by + oy);
    ctx.quadraticCurveTo(bx + bw + 3 + ox, by + bh * 0.5 + oy, bx + bw - 6 + ox, by + bh + oy);
    ctx.lineTo(bx + 4 + ox, by + bh + oy);
    ctx.quadraticCurveTo(bx + ox, by + bh + oy, bx + ox, by + bh - 4 + oy);
    ctx.lineTo(bx + ox, by + 4 + oy);
    ctx.quadraticCurveTo(bx + ox, by + oy, bx + 4 + ox, by + oy);
    ctx.closePath();
  };

  // Soft cast paper shadow
  ctx.fillStyle = pal.shadow;
  tracePennant(1.2, 2.4);
  ctx.fill();

  // Parchment flag fill
  ctx.fillStyle = pal.surface;
  ctx.strokeStyle = flags.selected ? pal.select : col;
  ctx.lineWidth = flags.selected ? 2 : 1.45;
  tracePennant(0, 0);
  ctx.fill();
  ctx.stroke();

  // Cute watercolor ribbon dot on left edge
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(bx + 7.5, by + bh * 0.5, 3, 0, Math.PI * 2);
  ctx.fill();

  // Crisp measurement text
  ctx.fillStyle = pal.ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, bx + 13.5, by + bh * 0.5 + 0.4);
  ctx.restore();
}

// ============================================================================
// Classic IEEE Schematic Mode Renderer (Toggleable via Settings)
// ============================================================================

function drawSchematicSymbol(ctx, comp, telemetry, theme, flags) {
  const g = GRID_SIZE;
  const p = comp.params || {};
  const stroke = flags.selected ? theme.select : flags.hovered ? theme.hover : theme.ink;
  const lead = flags.selected ? theme.select : theme.inkMuted;

  ctx.save();
  if (flags.ghost) ctx.globalAlpha = 0.55;
  ctx.translate(comp.gx * g, comp.gy * g);
  ctx.rotate(((comp.rotation || 0) * Math.PI) / 180);
  if (comp.flipX) ctx.scale(-1, 1);

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  switch (comp.type) {
    case 'ground': {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, g * 0.7);
      ctx.moveTo(-g * 0.65, g * 0.7);
      ctx.lineTo(g * 0.65, g * 0.7);
      ctx.moveTo(-g * 0.42, g * 1.05);
      ctx.lineTo(g * 0.42, g * 1.05);
      ctx.moveTo(-g * 0.18, g * 1.4);
      ctx.lineTo(g * 0.18, g * 1.4);
      ctx.stroke();
      break;
    }

    case 'resistor': {
      const thermal = telemetry?.thermalRatio || 0;
      if (thermal > 0.35) {
        const heatAlpha = Math.min(0.6, (thermal - 0.35) * 0.48);
        const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, g * 1.4);
        grad.addColorStop(0, thermal > 1 ? `rgba(209, 73, 91, ${heatAlpha.toFixed(3)})` : `rgba(227, 157, 52, ${(heatAlpha * 0.7).toFixed(3)})`);
        grad.addColorStop(1, thermal > 1 ? 'rgba(209, 73, 91, 0)' : 'rgba(227, 157, 52, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, g * 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = lead;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-2 * g, 0);
      ctx.lineTo(-1.2 * g, 0);
      ctx.moveTo(1.2 * g, 0);
      ctx.lineTo(2 * g, 0);
      ctx.stroke();

      ctx.strokeStyle = thermal > 1 ? theme.danger : stroke;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-1.2 * g, 0);
      ctx.lineTo(-1.0 * g, -0.44 * g);
      ctx.lineTo(-0.6 * g, 0.44 * g);
      ctx.lineTo(-0.2 * g, -0.44 * g);
      ctx.lineTo(0.2 * g, 0.44 * g);
      ctx.lineTo(0.6 * g, -0.44 * g);
      ctx.lineTo(1.0 * g, 0.44 * g);
      ctx.lineTo(1.2 * g, 0);
      ctx.stroke();
      break;
    }

    case 'potentiometer': {
      const w = Math.min(0.99, Math.max(0.01, Number(p.wiper) ?? 0.5));
      const wx = (-1.0 + 2.0 * w) * g;

      ctx.strokeStyle = lead;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-2 * g, 0);
      ctx.lineTo(-1.2 * g, 0);
      ctx.moveTo(1.2 * g, 0);
      ctx.lineTo(2 * g, 0);
      ctx.stroke();

      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-1.2 * g, 0);
      ctx.lineTo(-1.0 * g, -0.42 * g);
      ctx.lineTo(-0.6 * g, 0.42 * g);
      ctx.lineTo(-0.2 * g, -0.42 * g);
      ctx.lineTo(0.2 * g, 0.42 * g);
      ctx.lineTo(0.6 * g, -0.42 * g);
      ctx.lineTo(1.0 * g, 0.42 * g);
      ctx.lineTo(1.2 * g, 0);
      ctx.stroke();

      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -2 * g);
      ctx.lineTo(0, -1.25 * g);
      ctx.lineTo(wx, -1.25 * g);
      ctx.lineTo(wx, -0.52 * g);
      ctx.stroke();

      ctx.fillStyle = theme.accent;
      ctx.beginPath();
      ctx.moveTo(wx, -0.42 * g);
      ctx.lineTo(wx - 4.5, -0.82 * g);
      ctx.lineTo(wx + 4.5, -0.82 * g);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = flags.potDragActive ? theme.select : theme.bg;
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(wx, -1.25 * g, flags.potDragActive || flags.hovered ? 5.2 : 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    }

    case 'capacitor': {
      const vCap = telemetry?.voltage || 0;
      const absV = Math.abs(vCap);
      if (absV > 0.15) {
        const intensity = Math.min(0.45, absV / 14);
        ctx.fillStyle = vCap > 0 ? `rgba(227, 157, 52, ${intensity.toFixed(3)})` : `rgba(209, 73, 91, ${intensity.toFixed(3)})`;
        ctx.fillRect(-0.26 * g, -0.78 * g, 0.52 * g, 1.56 * g);
      }

      ctx.strokeStyle = lead;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-2 * g, 0);
      ctx.lineTo(-0.28 * g, 0);
      ctx.moveTo(0.28 * g, 0);
      ctx.lineTo(2 * g, 0);
      ctx.stroke();

      ctx.lineWidth = 2.8;
      ctx.strokeStyle = absV > 0.25 ? (vCap > 0 ? theme.vPos : theme.vNeg) : stroke;
      ctx.beginPath();
      ctx.moveTo(-0.28 * g, -0.85 * g);
      ctx.lineTo(-0.28 * g, 0.85 * g);
      ctx.stroke();

      ctx.strokeStyle = absV > 0.25 ? (vCap > 0 ? theme.vNeg : theme.vPos) : stroke;
      ctx.beginPath();
      ctx.moveTo(0.28 * g, -0.85 * g);
      ctx.lineTo(0.28 * g, 0.85 * g);
      ctx.stroke();
      break;
    }

    case 'inductor': {
      const iL = Math.abs(telemetry?.current || 0);
      if (iL > 1e-4) {
        const flux = Math.min(0.5, Math.log10(1 + iL * 200) * 0.35);
        const grad = ctx.createRadialGradient(0, -3, 2, 0, -3, g * 1.45);
        grad.addColorStop(0, `rgba(227, 157, 52, ${flux.toFixed(3)})`);
        grad.addColorStop(1, 'rgba(227, 157, 52, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, -3, g * 1.45, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = lead;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-2 * g, 0);
      ctx.lineTo(-1.2 * g, 0);
      ctx.moveTo(1.2 * g, 0);
      ctx.lineTo(2 * g, 0);
      ctx.stroke();

      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2.3;
      ctx.beginPath();
      for (let k = 0; k < 4; k++) {
        const cx = (-0.9 + k * 0.6) * g;
        ctx.arc(cx, 0, 0.3 * g, Math.PI, 0, false);
      }
      ctx.stroke();
      break;
    }

    case 'voltage_source': {
      const wf = p.waveform || 'dc';
      const isShort = telemetry?.state === 'SHORT!';
      ctx.strokeStyle = lead;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -2 * g);
      ctx.lineTo(0, -1.05 * g);
      ctx.moveTo(0, 1.05 * g);
      ctx.lineTo(0, 2 * g);
      ctx.stroke();

      ctx.fillStyle = theme.surface;
      ctx.strokeStyle = isShort ? theme.danger : stroke;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(0, 0, 1.05 * g, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.lineWidth = 2;
      if (wf === 'dc') {
        ctx.strokeStyle = theme.vPos;
        ctx.beginPath();
        ctx.moveTo(-5, -9);
        ctx.lineTo(5, -9);
        ctx.moveTo(0, -14);
        ctx.lineTo(0, -4);
        ctx.stroke();
        ctx.strokeStyle = theme.inkMuted;
        ctx.beginPath();
        ctx.moveTo(-5, 10);
        ctx.lineTo(5, 10);
        ctx.stroke();
      } else if (wf === 'sine') {
        ctx.strokeStyle = theme.accent;
        ctx.beginPath();
        ctx.moveTo(-11, 0);
        ctx.quadraticCurveTo(-5.5, -11, 0, 0);
        ctx.quadraticCurveTo(5.5, 11, 11, 0);
        ctx.stroke();
      } else if (wf === 'square' || wf === 'pulse') {
        ctx.strokeStyle = theme.accent;
        ctx.beginPath();
        ctx.moveTo(-11, 5);
        ctx.lineTo(-11, -6);
        ctx.lineTo(0, -6);
        ctx.lineTo(0, 6);
        ctx.lineTo(11, 6);
        ctx.lineTo(11, -5);
        ctx.stroke();
      } else {
        ctx.strokeStyle = theme.accent;
        ctx.beginPath();
        ctx.moveTo(-11, 4);
        ctx.lineTo(-4, -7);
        ctx.lineTo(4, 7);
        ctx.lineTo(11, -4);
        ctx.stroke();
      }
      break;
    }

    case 'current_source': {
      ctx.strokeStyle = lead;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -2 * g);
      ctx.lineTo(0, -1.05 * g);
      ctx.moveTo(0, 1.05 * g);
      ctx.lineTo(0, 2 * g);
      ctx.stroke();

      ctx.fillStyle = theme.surface;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(0, 0, 1.05 * g, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = theme.accent;
      ctx.fillStyle = theme.accent;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(0, 10);
      ctx.lineTo(0, -8);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -13);
      ctx.lineTo(-5, -5);
      ctx.lineTo(5, -5);
      ctx.closePath();
      ctx.fill();
      break;
    }

    case 'diode': {
      const fwd = telemetry?.state === 'FORWARD' || telemetry?.state === 'BREAKDOWN';
      ctx.strokeStyle = lead;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-2 * g, 0);
      ctx.lineTo(-0.55 * g, 0);
      ctx.moveTo(0.55 * g, 0);
      ctx.lineTo(2 * g, 0);
      ctx.stroke();

      ctx.strokeStyle = fwd ? theme.accent : stroke;
      ctx.fillStyle = fwd ? theme.accentSoft : 'transparent';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-0.55 * g, -0.6 * g);
      ctx.lineTo(-0.55 * g, 0.6 * g);
      ctx.lineTo(0.55 * g, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      if (p.model === 'zener') {
        ctx.moveTo(0.55 * g - 4, -0.65 * g);
        ctx.lineTo(0.55 * g, -0.65 * g);
        ctx.lineTo(0.55 * g, 0.65 * g);
        ctx.lineTo(0.55 * g + 4, 0.65 * g);
      } else if (p.model === 'schottky') {
        ctx.moveTo(0.55 * g + 4, -0.52 * g);
        ctx.lineTo(0.55 * g + 4, -0.65 * g);
        ctx.lineTo(0.55 * g, -0.65 * g);
        ctx.lineTo(0.55 * g, 0.65 * g);
        ctx.lineTo(0.55 * g - 4, 0.65 * g);
        ctx.lineTo(0.55 * g - 4, 0.52 * g);
      } else {
        ctx.moveTo(0.55 * g, -0.65 * g);
        ctx.lineTo(0.55 * g, 0.65 * g);
      }
      ctx.stroke();
      break;
    }

    case 'led': {
      const led = LED_MODELS[p.color] || LED_MODELS.green;
      const rgb = LED_RGB[p.color] || LED_RGB.green;
      const b = Math.max(0, telemetry?.brightness || 0);
      const iAbs = Math.abs(telemetry?.current || 0);
      const overloaded = iAbs > 0.028;

      if (b > 0.03) {
        const radius = g * (1.2 + Math.min(1.5, b) * 1.45);
        const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, radius);
        grad.addColorStop(0, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${Math.min(0.85, 0.35 + b * 0.5).toFixed(3)})`);
        grad.addColorStop(0.35, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${(0.45 * Math.min(1, b)).toFixed(3)})`);
        grad.addColorStop(1, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      if (overloaded) {
        ctx.save();
        ctx.strokeStyle = theme.danger;
        ctx.lineWidth = 1.8;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.arc(0, 0, g * 1.35, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      ctx.strokeStyle = lead;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-2 * g, 0);
      ctx.lineTo(-0.55 * g, 0);
      ctx.moveTo(0.55 * g, 0);
      ctx.lineTo(2 * g, 0);
      ctx.stroke();

      ctx.strokeStyle = b > 0.05 ? led.color : stroke;
      ctx.fillStyle = b > 0.05 ? led.color : 'transparent';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-0.55 * g, -0.62 * g);
      ctx.lineTo(-0.55 * g, 0.62 * g);
      ctx.lineTo(0.55 * g, 0);
      ctx.closePath();
      if (b > 0.05) {
        ctx.save();
        ctx.globalAlpha = Math.min(0.95, 0.2 + b * 0.75);
        ctx.fill();
        ctx.restore();
      }
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0.55 * g, -0.65 * g);
      ctx.lineTo(0.55 * g, 0.65 * g);
      ctx.stroke();

      ctx.strokeStyle = b > 0.08 ? led.color : theme.inkMuted;
      ctx.lineWidth = 1.4;
      for (const ox of [-4, 4]) {
        ctx.beginPath();
        ctx.moveTo(ox, -0.82 * g);
        ctx.lineTo(ox + 6, -1.28 * g);
        ctx.stroke();
      }
      break;
    }

    case 'npn':
    case 'pnp': {
      const isPnp = comp.type === 'pnp';
      const active = telemetry?.state === 'ACTIVE' || telemetry?.state === 'SATURATION';

      ctx.fillStyle = theme.surface;
      ctx.strokeStyle = active ? theme.accent : theme.inkMuted;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0.05 * g, 0, 1.25 * g, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-2 * g, 0);
      ctx.lineTo(-0.45 * g, 0);
      ctx.stroke();

      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(-0.45 * g, -0.82 * g);
      ctx.lineTo(-0.45 * g, 0.82 * g);
      ctx.stroke();

      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-0.45 * g, -0.38 * g);
      ctx.lineTo(g, -1.15 * g);
      ctx.lineTo(g, -2 * g);
      ctx.moveTo(-0.45 * g, 0.38 * g);
      ctx.lineTo(g, 1.15 * g);
      ctx.lineTo(g, 2 * g);
      ctx.stroke();

      ctx.fillStyle = active ? theme.accent : stroke;
      ctx.beginPath();
      if (!isPnp) {
        ctx.moveTo(0.75 * g, 1.02 * g);
        ctx.lineTo(0.18 * g, 0.98 * g);
        ctx.lineTo(0.45 * g, 0.56 * g);
      } else {
        ctx.moveTo(-0.22 * g, -0.5 * g);
        ctx.lineTo(0.35 * g, -0.58 * g);
        ctx.lineTo(0.14 * g, -1.0 * g);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }

    case 'opamp': {
      const rail = telemetry?.state === 'RAIL+' || telemetry?.state === 'RAIL−';
      ctx.strokeStyle = lead;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-2 * g, -g);
      ctx.lineTo(-1.2 * g, -g);
      ctx.moveTo(-2 * g, g);
      ctx.lineTo(-1.2 * g, g);
      ctx.moveTo(1.4 * g, 0);
      ctx.lineTo(2 * g, 0);
      ctx.stroke();

      ctx.fillStyle = theme.surface;
      ctx.strokeStyle = rail ? theme.amber : stroke;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-1.2 * g, -1.65 * g);
      ctx.lineTo(-1.2 * g, 1.65 * g);
      ctx.lineTo(1.4 * g, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = theme.vPos;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-0.92 * g, -g);
      ctx.lineTo(-0.56 * g, -g);
      ctx.moveTo(-0.74 * g, -g - 3.6);
      ctx.lineTo(-0.74 * g, -g + 3.6);
      ctx.stroke();

      ctx.strokeStyle = theme.inkMuted;
      ctx.beginPath();
      ctx.moveTo(-0.92 * g, g);
      ctx.lineTo(-0.56 * g, g);
      ctx.stroke();
      break;
    }

    case 'switch':
    case 'pushbutton': {
      const closed = !!p.closed;
      ctx.strokeStyle = lead;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-2 * g, 0);
      ctx.lineTo(-0.85 * g, 0);
      ctx.moveTo(0.85 * g, 0);
      ctx.lineTo(2 * g, 0);
      ctx.stroke();

      ctx.fillStyle = theme.bg;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      for (const tx of [-0.85 * g, 0.85 * g]) {
        ctx.beginPath();
        ctx.arc(tx, 0, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      ctx.strokeStyle = closed ? theme.accent : theme.amber;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      if (comp.type === 'switch') {
        ctx.moveTo(-0.85 * g, 0);
        ctx.lineTo(0.85 * g, closed ? 0 : -0.7 * g);
      } else {
        const yBar = closed ? -2 : -0.52 * g;
        ctx.moveTo(-0.85 * g, yBar);
        ctx.lineTo(0.85 * g, yBar);
        ctx.moveTo(0, yBar);
        ctx.lineTo(0, yBar - 0.58 * g);
        ctx.moveTo(-0.42 * g, yBar - 0.58 * g);
        ctx.lineTo(0.42 * g, yBar - 0.58 * g);
      }
      ctx.stroke();
      break;
    }

    case 'spdt': {
      const pos = Number(p.position) === 1 ? 1 : 0;
      ctx.strokeStyle = lead;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-2 * g, 0);
      ctx.lineTo(-0.85 * g, 0);
      ctx.moveTo(0.85 * g, -g);
      ctx.lineTo(2 * g, -g);
      ctx.moveTo(0.85 * g, g);
      ctx.lineTo(2 * g, g);
      ctx.stroke();

      ctx.fillStyle = theme.bg;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      for (const [tx, ty] of [
        [-0.85 * g, 0],
        [0.85 * g, -g],
        [0.85 * g, g],
      ]) {
        ctx.beginPath();
        ctx.arc(tx, ty, 3.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(-0.85 * g, 0);
      ctx.lineTo(0.85 * g, pos === 0 ? -g : g);
      ctx.stroke();
      break;
    }

    case 'nmos':
    case 'pmos': {
      const isP = comp.type === 'pmos';
      const conducting = telemetry?.state === 'LINEAR' || telemetry?.state === 'SATURATION';

      ctx.fillStyle = theme.surface;
      ctx.strokeStyle = conducting ? theme.accent : theme.inkMuted;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0.05 * g, 0, 1.28 * g, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-2 * g, 0);
      ctx.lineTo(-0.62 * g, 0);
      ctx.moveTo(-0.62 * g, -0.78 * g);
      ctx.lineTo(-0.62 * g, 0.78 * g);
      ctx.stroke();

      ctx.strokeStyle = conducting ? theme.accent : stroke;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(-0.22 * g, -0.82 * g);
      ctx.lineTo(-0.22 * g, -0.34 * g);
      ctx.moveTo(-0.22 * g, -0.18 * g);
      ctx.lineTo(-0.22 * g, 0.18 * g);
      ctx.moveTo(-0.22 * g, 0.34 * g);
      ctx.lineTo(-0.22 * g, 0.82 * g);
      ctx.stroke();

      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-0.22 * g, -0.58 * g);
      ctx.lineTo(g, -0.58 * g);
      ctx.lineTo(g, -2 * g);
      ctx.moveTo(-0.22 * g, 0.58 * g);
      ctx.lineTo(g, 0.58 * g);
      ctx.lineTo(g, 2 * g);
      ctx.moveTo(-0.22 * g, 0);
      ctx.lineTo(g, 0);
      ctx.lineTo(g, isP ? -0.58 * g : 0.58 * g);
      ctx.stroke();

      ctx.fillStyle = conducting ? theme.accent : stroke;
      ctx.beginPath();
      if (!isP) {
        ctx.moveTo(-0.15 * g, 0);
        ctx.lineTo(0.32 * g, -0.24 * g);
        ctx.lineTo(0.32 * g, 0.24 * g);
      } else {
        ctx.moveTo(0.55 * g, 0);
        ctx.lineTo(0.08 * g, -0.24 * g);
        ctx.lineTo(0.08 * g, 0.24 * g);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }

    case 'transformer': {
      ctx.strokeStyle = lead;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-2 * g, -2 * g);
      ctx.lineTo(-0.75 * g, -2 * g);
      ctx.lineTo(-0.75 * g, -1.2 * g);
      ctx.moveTo(-2 * g, 2 * g);
      ctx.lineTo(-0.75 * g, 2 * g);
      ctx.lineTo(-0.75 * g, 1.2 * g);

      ctx.moveTo(2 * g, -2 * g);
      ctx.lineTo(0.75 * g, -2 * g);
      ctx.lineTo(0.75 * g, -1.2 * g);
      ctx.moveTo(2 * g, 2 * g);
      ctx.lineTo(0.75 * g, 2 * g);
      ctx.lineTo(0.75 * g, 1.2 * g);
      ctx.stroke();

      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2.1;
      ctx.beginPath();
      for (let k = 0; k < 4; k++) {
        const cy = (-0.9 + k * 0.6) * g;
        ctx.moveTo(-0.75 * g, cy - 0.3 * g);
        ctx.arc(-0.75 * g, cy, 0.3 * g, -Math.PI / 2, Math.PI / 2, false);
      }
      for (let k = 0; k < 4; k++) {
        const cy = (-0.9 + k * 0.6) * g;
        ctx.moveTo(0.75 * g, cy - 0.3 * g);
        ctx.arc(0.75 * g, cy, 0.3 * g, -Math.PI / 2, Math.PI / 2, true);
      }
      ctx.stroke();

      ctx.strokeStyle = theme.inkMuted;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-0.18 * g, -1.4 * g);
      ctx.lineTo(-0.18 * g, 1.4 * g);
      ctx.moveTo(0.18 * g, -1.4 * g);
      ctx.lineTo(0.18 * g, 1.4 * g);
      ctx.stroke();

      ctx.fillStyle = theme.accent;
      ctx.beginPath();
      ctx.arc(-1.15 * g, -1.3 * g, 2.5, 0, Math.PI * 2);
      ctx.arc(1.15 * g, -1.3 * g, 2.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'voltmeter':
    case 'ammeter': {
      ctx.strokeStyle = lead;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-2 * g, 0);
      ctx.lineTo(-1.1 * g, 0);
      ctx.moveTo(1.1 * g, 0);
      ctx.lineTo(2 * g, 0);
      ctx.stroke();
      ctx.restore();
      drawInlineMeter(ctx, comp, telemetry, theme, flags);
      return;
    }

    case 'logic_in': {
      const high = !!p.state;
      ctx.strokeStyle = high ? theme.vPos : lead;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(0.9 * g, 0);
      ctx.lineTo(2 * g, 0);
      ctx.stroke();
      ctx.restore();
      drawLogicInputTile(ctx, comp, theme, flags);
      return;
    }

    case 'gate_and':
    case 'gate_or':
    case 'gate_not':
    case 'gate_nand':
    case 'gate_xor': {
      const high = !!telemetry?.logicHigh;
      const isNot = comp.type === 'gate_not';
      const hasBubble = isNot || comp.type === 'gate_nand';

      ctx.strokeStyle = lead;
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (isNot) {
        ctx.moveTo(-2 * g, 0);
        ctx.lineTo(-0.95 * g, 0);
      } else {
        ctx.moveTo(-2 * g, -g);
        ctx.lineTo(-0.85 * g, -g);
        ctx.moveTo(-2 * g, g);
        ctx.lineTo(-0.85 * g, g);
      }
      ctx.moveTo(hasBubble ? 1.28 * g : 0.98 * g, 0);
      ctx.lineTo(2 * g, 0);
      ctx.stroke();

      ctx.fillStyle = theme.surface;
      ctx.strokeStyle = high ? theme.vPos : stroke;
      ctx.lineWidth = 2.1;

      if (isNot) {
        ctx.beginPath();
        ctx.moveTo(-0.95 * g, -1.05 * g);
        ctx.lineTo(-0.95 * g, 1.05 * g);
        ctx.lineTo(0.85 * g, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (comp.type === 'gate_and' || comp.type === 'gate_nand') {
        ctx.beginPath();
        ctx.moveTo(-0.9 * g, -1.25 * g);
        ctx.lineTo(0.05 * g, -1.25 * g);
        ctx.arc(0.05 * g, 0, 1.25 * g, -Math.PI / 2, Math.PI / 2, false);
        ctx.lineTo(-0.9 * g, 1.25 * g);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else {
        if (comp.type === 'gate_xor') {
          ctx.beginPath();
          ctx.moveTo(-1.18 * g, -1.22 * g);
          ctx.quadraticCurveTo(-0.52 * g, 0, -1.18 * g, 1.22 * g);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.moveTo(-0.9 * g, -1.25 * g);
        ctx.quadraticCurveTo(0.25 * g, -1.25 * g, 1.0 * g, 0);
        ctx.quadraticCurveTo(0.25 * g, 1.25 * g, -0.9 * g, 1.25 * g);
        ctx.quadraticCurveTo(-0.28 * g, 0, -0.9 * g, -1.25 * g);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      if (hasBubble) {
        ctx.fillStyle = theme.surface;
        ctx.beginPath();
        ctx.arc(1.06 * g, 0, 4.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      break;
    }

    case 'probe': {
      ctx.restore();
      drawProbeFlag(ctx, comp, telemetry, theme, flags);
      return;
    }
  }

  ctx.restore();

  if (comp.type !== 'ground' && comp.type !== 'probe') {
    drawComponentLabels(ctx, comp, telemetry, theme, flags, 'schematic');
  }
}

function drawInlineMeter(ctx, comp, telemetry, theme, flags) {
  const g = GRID_SIZE;
  const cx = comp.gx * g;
  const cy = comp.gy * g;
  const isV = comp.type === 'voltmeter';
  const raw = isV ? telemetry?.voltage || 0 : telemetry?.current || 0;
  const readout = isV
    ? `${raw >= 0 ? '' : '−'}${Math.abs(raw) >= 10 ? Math.abs(raw).toFixed(1) : Math.abs(raw).toFixed(2)}V`
    : formatCompactSI(Math.abs(raw) < 1e-6 ? 0 : raw, 'A');

  ctx.save();
  if (flags.ghost) ctx.globalAlpha = 0.55;
  const bw = 62;
  const bh = 28;
  ctx.fillStyle = theme.probeBg;
  ctx.strokeStyle = flags.selected ? theme.select : isV ? theme.vPos : theme.amber;
  ctx.lineWidth = flags.selected ? 2 : 1.7;
  roundRect(ctx, cx - bw / 2, cy - bh / 2, bw, bh, 6);
  ctx.fill();
  ctx.stroke();

  ctx.font = '700 10.5px "JetBrains Mono", Consolas, monospace';
  ctx.fillStyle = isV ? theme.vPos : theme.amber;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(readout, cx, cy + 0.5);

  ctx.font = '700 9.5px "Plus Jakarta Sans", "Segoe UI", sans-serif';
  ctx.fillStyle = theme.label;
  ctx.fillText(comp.designator, cx, cy - bh / 2 - 8);
  ctx.restore();
}

function drawLogicInputTile(ctx, comp, theme, flags) {
  const g = GRID_SIZE;
  const cx = comp.gx * g;
  const cy = comp.gy * g;
  const high = !!comp.params.state;

  ctx.save();
  if (flags.ghost) ctx.globalAlpha = 0.55;
  const size = 32;
  const x = cx - size / 2;
  const y = cy - size / 2;

  ctx.fillStyle = high ? theme.accentSoft : theme.surface;
  ctx.strokeStyle = flags.selected ? theme.select : high ? theme.vPos : theme.inkMuted;
  ctx.lineWidth = flags.selected ? 2.2 : 1.9;
  roundRect(ctx, x, y, size, size, 7);
  ctx.fill();
  ctx.stroke();

  ctx.font = '800 15px "JetBrains Mono", Consolas, monospace';
  ctx.fillStyle = high ? theme.vPos : theme.inkMuted;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(high ? '1' : '0', cx, cy + 1);

  ctx.font = '700 10px "Plus Jakarta Sans", "Segoe UI", sans-serif';
  ctx.fillStyle = theme.ink;
  ctx.fillText(comp.designator, cx, y - 10);
  ctx.restore();
}

function drawProbeFlag(ctx, comp, telemetry, theme, flags) {
  const g = GRID_SIZE;
  const px = comp.gx * g;
  const py = comp.gy * g;
  const ch = Number(comp.params.channel) || 1;
  const col = PROBE_COLORS[ch] || '#2e7d60';
  const label = comp.params.label || `CH${ch}`;
  const vStr = telemetry ? formatSignedVoltage(telemetry.voltage).trim() : '';

  ctx.save();
  if (flags.ghost) ctx.globalAlpha = 0.55;

  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(px, py, 4.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = col;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(px + 9, py - 18);
  ctx.stroke();

  const text = vStr ? `${label} ${vStr}` : label;
  ctx.font = '600 10.5px "JetBrains Mono", Consolas, monospace';
  const tw = ctx.measureText(text).width;
  const bw = Math.max(46, tw + 14);
  const bh = 20;
  const bx = px + 6;
  const by = py - 37;

  ctx.fillStyle = theme.probeBg;
  ctx.strokeStyle = flags.selected ? theme.select : col;
  ctx.lineWidth = flags.selected ? 2 : 1.4;
  roundRect(ctx, bx, by, bw, bh, 5);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = col;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, bx + 7, by + bh * 0.5 + 0.5);
  ctx.restore();
}

// ============================================================================
// Warm Legible Component Labels (Zero Collisions, Zero Gate Duplication)
// ============================================================================

function drawComponentLabels(ctx, comp, telemetry, theme, flags, style = 'illustrated') {
  const g = GRID_SIZE;
  const cx = comp.gx * g;
  const cy = comp.gy * g;
  const rot = (((comp.rotation || 0) % 360) + 360) % 360;
  const vertical = rot === 90 || rot === 270;
  const val = getComponentValueLabel(comp);
  const isIllust = style !== 'schematic';

  ctx.save();
  if (flags.ghost) ctx.globalAlpha = 0.55;

  let dx = 0;
  let dy = -28;
  let align = 'center';

  if (comp.type === 'voltage_source' || comp.type === 'current_source') {
    dx = isIllust ? -28 : -28;
    dy = -7;
    align = 'right';
  } else if (comp.type === 'npn' || comp.type === 'pnp' || comp.type === 'nmos' || comp.type === 'pmos') {
    dx = comp.flipX ? -32 : 32;
    dy = -6;
    align = comp.flipX ? 'right' : 'left';
  } else if (comp.type === 'opamp' || comp.type === 'transformer') {
    dx = 0;
    dy = -44;
    align = 'center';
  } else if (comp.type.startsWith('gate_')) {
    dx = 0;
    dy = -35;
    align = 'center';
  } else if (comp.type === 'potentiometer') {
    // Always place potentiometer label on the clear side opposite its wiper pin!
    const wOff = transformOffset(0, -2, comp.rotation || 0, !!comp.flipX);
    if (wOff.dx !== 0) {
      const side = wOff.dx > 0 ? -1 : 1;
      dx = side * 25;
      dy = -5;
      align = side > 0 ? 'left' : 'right';
    } else {
      const below = wOff.dy <= 0;
      dx = 0;
      dy = below ? (isIllust ? 22.5 : 16) : (isIllust ? -32 : -26);
      align = 'center';
    }
  } else if (vertical) {
    dx = comp.type === 'capacitor' || comp.type === 'led' || comp.type === 'switch' ? 26 : 22;
    dy = -6;
    align = 'left';
  } else if (comp.type === 'capacitor') {
    dx = 0;
    dy = isIllust ? -31 : -34;
    align = 'center';
  } else if (comp.type === 'led') {
    dx = 0;
    dy = isIllust ? -31 : -28;
    align = 'center';
  } else if (comp.type === 'pushbutton' || comp.type === 'spdt') {
    dx = 0;
    dy = comp.type === 'spdt' ? -38 : -29;
    align = 'center';
  } else {
    dx = 0;
    dy = isIllust ? -28 : -27;
    align = 'center';
  }

  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = theme.bg;
  ctx.lineWidth = 3.6;

  ctx.font = '700 10.5px "Plus Jakarta Sans", "Segoe UI", system-ui, sans-serif';
  ctx.strokeText(comp.designator, cx + dx, cy + dy);
  ctx.fillStyle = flags.selected ? theme.select : theme.ink;
  ctx.fillText(comp.designator, cx + dx, cy + dy);

  const desigUpper = String(comp.designator || '').trim().toUpperCase();
  const valUpper = String(val || '').trim().toUpperCase();
  const isDuplicateGate =
    comp.type.startsWith('gate_') &&
    valUpper &&
    (desigUpper === valUpper || desigUpper.startsWith(valUpper));

  if (val && valUpper !== desigUpper && !isDuplicateGate) {
    const gap = comp.type === 'potentiometer' && !vertical ? 9.5 : 12;
    ctx.font = '500 9.5px "JetBrains Mono", Consolas, monospace';
    ctx.strokeText(val, cx + dx, cy + dy + gap);
    ctx.fillStyle = telemetry?.state === 'OVERLOAD' ? theme.danger : theme.label;
    ctx.fillText(val, cx + dx, cy + dy + gap);
  }
  ctx.restore();
}

export function roundRect(ctx, x, y, w, h, r) {
  const rad = Math.max(0, Math.min(r, Math.abs(w) * 0.5, Math.abs(h) * 0.5));
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

// ============================================================================
// Illustrated Miniature Parts Tray & Tool SVGs (All 24 Components + 4 Tools)
// ============================================================================

/**
 * Charming multi-tone illustrated 28x28 inline SVG miniatures for the Luminous Atelier Parts Tray.
 */
export function getPaletteIconSVG(type) {
  const icons = {
    // Tools
    select: `<svg viewBox="0 0 28 28" fill="none"><path d="M7.5 4.5l13 10.2-6 1.5-2.8 6.5-4.2-18.2z" fill="var(--bg-tray, #f3ebd9)" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`,
    wire: `<svg viewBox="0 0 28 28" fill="none"><path d="M5 21h8V7h10" stroke="#c57948" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="5" cy="21" r="2.7" fill="#d9a441" stroke="#5c4328" stroke-width="1.2"/><circle cx="23" cy="7" r="2.7" fill="#d9a441" stroke="#5c4328" stroke-width="1.2"/></svg>`,
    probe: `<svg viewBox="0 0 28 28" fill="none"><path d="M6.5 21.5L11 14" stroke="#cc9738" stroke-width="2" stroke-linecap="round"/><circle cx="6.5" cy="21.5" r="2.8" fill="#2e7d60" stroke="#1e5340" stroke-width="1.1"/><path d="M10.5 7.5h11l3 4-3 4h-11a1.5 1.5 0 0 1-1.5-1.5V9a1.5 1.5 0 0 1 1.5-1.5z" fill="#fffaf0" stroke="#2e7d60" stroke-width="1.6" stroke-linejoin="round"/><circle cx="13.5" cy="11.5" r="1.6" fill="#2e7d60"/></svg>`,
    delete: `<svg viewBox="0 0 28 28" fill="none"><circle cx="14" cy="14" r="9.5" fill="#d1495b" fill-opacity="0.16" stroke="#d1495b" stroke-width="1.6"/><path d="M10.5 10.5l7 7M17.5 10.5l-7 7" stroke="#d1495b" stroke-width="2" stroke-linecap="round"/></svg>`,

    // Sources
    voltage_source: `<svg viewBox="0 0 28 28" fill="none"><rect x="11" y="3" width="6" height="3.2" rx="1.2" fill="#dfb055" stroke="#5c4328" stroke-width="1.1"/><rect x="7.5" y="6" width="13" height="19" rx="3.2" fill="#f6ead3" stroke="#5c4639" stroke-width="1.3"/><path d="M7.5 9.2a3.2 3.2 0 0 1 3.2-3.2h6.6a3.2 3.2 0 0 1 3.2 3.2V16h-13V9.2z" fill="#2e7d60"/><rect x="7.5" y="15.5" width="13" height="2" fill="#dfb055"/><path d="M12 11h4M14 9v4" stroke="#fff8e8" stroke-width="1.6" stroke-linecap="round"/><path d="M12.2 21h3.6" stroke="#6f5d50" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    current_source: `<svg viewBox="0 0 28 28" fill="none"><line x1="14" y1="2.5" x2="14" y2="6" stroke="#c57948" stroke-width="2" stroke-linecap="round"/><line x1="14" y1="22" x2="14" y2="25.5" stroke="#c57948" stroke-width="2" stroke-linecap="round"/><circle cx="14" cy="14" r="8.2" fill="#fbf3e2" stroke="#cc9738" stroke-width="2"/><path d="M14 18.5V9.8m0 0l-3.2 3.2M14 9.8l3.2 3.2" stroke="#d45d44" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    ground: `<svg viewBox="0 0 28 28" fill="none"><path d="M14 4v9.5" stroke="#c57948" stroke-width="2.2" stroke-linecap="round"/><rect x="5" y="13.5" width="18" height="3" rx="1.5" fill="#c57948" stroke="#6b3e22" stroke-width="1"/><rect x="8" y="18" width="12" height="2.8" rx="1.4" fill="#c57948" stroke="#6b3e22" stroke-width="1"/><rect x="11" y="22.2" width="6" height="2.4" rx="1.2" fill="#c57948" stroke="#6b3e22" stroke-width="1"/></svg>`,

    // Passives
    resistor: `<svg viewBox="0 0 28 28" fill="none"><line x1="2" y1="14" x2="6" y2="14" stroke="#c57948" stroke-width="2.2" stroke-linecap="round"/><line x1="22" y1="14" x2="26" y2="14" stroke="#c57948" stroke-width="2.2" stroke-linecap="round"/><rect x="5.5" y="8.5" width="17" height="11" rx="4.5" fill="#f3dfc0" stroke="#5c4639" stroke-width="1.3"/><rect x="9" y="9.1" width="2.4" height="9.8" fill="#7c4627"/><rect x="12.6" y="9.1" width="2.4" height="9.8" fill="#26211e"/><rect x="16.2" y="9.1" width="2.4" height="9.8" fill="#c93b3b"/><rect x="19.6" y="9.1" width="1.7" height="9.8" fill="#d8a63c"/></svg>`,
    potentiometer: `<svg viewBox="0 0 28 28" fill="none"><line x1="2" y1="15" x2="6" y2="15" stroke="#c57948" stroke-width="2" stroke-linecap="round"/><line x1="22" y1="15" x2="26" y2="15" stroke="#c57948" stroke-width="2" stroke-linecap="round"/><line x1="14" y1="2.5" x2="14" y2="6.5" stroke="#c57948" stroke-width="2" stroke-linecap="round"/><circle cx="14" cy="15" r="8.8" fill="#fbf3e2" stroke="#5c4639" stroke-width="1.3"/><circle cx="14" cy="15" r="5.6" fill="#dfb055" stroke="#6e4d1c" stroke-width="1.1"/><circle cx="14" cy="15" r="3.6" fill="#fffaf0"/><path d="M14 15l3.6-3.6" stroke="#d45d44" stroke-width="2.2" stroke-linecap="round"/></svg>`,
    capacitor: `<svg viewBox="0 0 28 28" fill="none"><line x1="2" y1="14" x2="6" y2="14" stroke="#c57948" stroke-width="2.2" stroke-linecap="round"/><line x1="22" y1="14" x2="26" y2="14" stroke="#c57948" stroke-width="2.2" stroke-linecap="round"/><rect x="5.5" y="7" width="17" height="14" rx="3.5" fill="#fffaf0" stroke="#5c4639" stroke-width="1.3"/><rect x="12" y="7.8" width="7.2" height="12.4" fill="#f5bc58"/><rect x="5.8" y="7.5" width="3.8" height="13" rx="1.6" fill="#cc9738"/><rect x="18.4" y="7.5" width="3.8" height="13" rx="1.6" fill="#cc9738"/></svg>`,
    inductor: `<svg viewBox="0 0 28 28" fill="none"><line x1="2" y1="14" x2="5.5" y2="14" stroke="#c57948" stroke-width="2.2" stroke-linecap="round"/><line x1="22.5" y1="14" x2="26" y2="14" stroke="#c57948" stroke-width="2.2" stroke-linecap="round"/><rect x="5" y="11" width="18" height="6" rx="2" fill="#574e4a"/><rect x="6.5" y="8" width="3.4" height="12" rx="1.7" fill="#d08350" stroke="#6b3e22" stroke-width="1"/><rect x="10.4" y="8" width="3.4" height="12" rx="1.7" fill="#d08350" stroke="#6b3e22" stroke-width="1"/><rect x="14.3" y="8" width="3.4" height="12" rx="1.7" fill="#d08350" stroke="#6b3e22" stroke-width="1"/><rect x="18.2" y="8" width="3.4" height="12" rx="1.7" fill="#d08350" stroke="#6b3e22" stroke-width="1"/></svg>`,
    transformer: `<svg viewBox="0 0 28 28" fill="none"><rect x="6.5" y="4.5" width="15" height="19" rx="2.8" fill="#574e4a" stroke="#7c706a" stroke-width="1.1"/><rect x="12" y="8" width="4" height="12" rx="1" fill="#faf4e8"/><rect x="4.5" y="7" width="6.5" height="14" rx="2" fill="#d08350" stroke="#6b3e22" stroke-width="1.1"/><rect x="17" y="7" width="6.5" height="14" rx="2" fill="#d08350" stroke="#6b3e22" stroke-width="1.1"/><circle cx="7.5" cy="5.5" r="1.4" fill="#d45d44"/><circle cx="20.5" cy="5.5" r="1.4" fill="#d45d44"/></svg>`,

    // Semiconductors & Active
    diode: `<svg viewBox="0 0 28 28" fill="none"><line x1="2" y1="14" x2="6" y2="14" stroke="#c57948" stroke-width="2.2" stroke-linecap="round"/><line x1="22" y1="14" x2="26" y2="14" stroke="#c57948" stroke-width="2.2" stroke-linecap="round"/><rect x="5.5" y="9" width="17" height="10" rx="4" fill="#3e2e27" stroke="#856e62" stroke-width="1.2"/><rect x="17.5" y="9.5" width="2.8" height="9" fill="#e8e2d7"/><polygon points="9.5,11.4 9.5,16.6 15,14" fill="#52d1a0"/></svg>`,
    led: `<svg viewBox="0 0 28 28" fill="none"><line x1="2" y1="15" x2="7.5" y2="15" stroke="#c57948" stroke-width="2.2" stroke-linecap="round"/><line x1="20.5" y1="15" x2="26" y2="15" stroke="#c57948" stroke-width="2.2" stroke-linecap="round"/><circle cx="14" cy="14.5" r="8.2" fill="#f36c62" fill-opacity="0.22"/><circle cx="14" cy="14.5" r="6.8" fill="#f26b61" stroke="#8c352e" stroke-width="1.2"/><path d="M10.4 12.2a4.6 4.6 0 0 1 3.8-2.3" stroke="#fffdf8" stroke-width="1.8" stroke-linecap="round"/><path d="M19.5 6.5l2.2-2.2M14.5 5V2.8M22 10l2.2-1" stroke="#e39d34" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    npn: `<svg viewBox="0 0 28 28" fill="none"><circle cx="14.5" cy="14" r="8.8" fill="#fbf3e2" stroke="#cc9738" stroke-width="1.8"/><path d="M3 14h7.5M10.5 8.5v11M10.5 11.5L18 7.5V4M10.5 16.5L18 20.5V24" stroke="#4a372d" stroke-width="1.65" stroke-linecap="round"/><polygon points="17.5,20 13.5,20 15.5,16.8" fill="#2e7d60"/></svg>`,
    pnp: `<svg viewBox="0 0 28 28" fill="none"><circle cx="14.5" cy="14" r="8.8" fill="#fbf3e2" stroke="#465d8c" stroke-width="1.8"/><path d="M3 14h7.5M10.5 8.5v11M10.5 11.5L18 7.5V4M10.5 16.5L18 20.5V24" stroke="#4a372d" stroke-width="1.65" stroke-linecap="round"/><polygon points="11.2,11 15.2,10.5 13.5,7.6" fill="#d45d44"/></svg>`,
    nmos: `<svg viewBox="0 0 28 28" fill="none"><circle cx="14.5" cy="14" r="8.8" fill="#fbf3e2" stroke="#cc9738" stroke-width="1.8"/><path d="M3 14h6.5M9.5 8.5v11M12.5 8.5v3M12.5 12.5v3M12.5 16.5v3M12.5 10h6V4.5M12.5 18h6v5.5M12.5 14h6v4" stroke="#4a372d" stroke-width="1.55" stroke-linecap="round"/><polygon points="13,14 16.2,12.2 16.2,15.8" fill="#2e7d60"/></svg>`,
    pmos: `<svg viewBox="0 0 28 28" fill="none"><circle cx="14.5" cy="14" r="8.8" fill="#fbf3e2" stroke="#465d8c" stroke-width="1.8"/><path d="M3 14h6.5M9.5 8.5v11M12.5 8.5v3M12.5 12.5v3M12.5 16.5v3M12.5 10h6V4.5M12.5 18h6v5.5M12.5 14h6v-4" stroke="#4a372d" stroke-width="1.55" stroke-linecap="round"/><polygon points="17.8,14 14.5,12.2 14.5,15.8" fill="#d45d44"/></svg>`,
    opamp: `<svg viewBox="0 0 28 28" fill="none"><path d="M2.5 10h4M2.5 18h4M23.5 14h2" stroke="#c57948" stroke-width="2" stroke-linecap="round"/><path d="M6.5 5.8a1.5 1.5 0 0 1 2.3-1.3l14 8.2a1.5 1.5 0 0 1 0 2.6l-14 8.2a1.5 1.5 0 0 1-2.3-1.3V5.8z" fill="#fbf3e2" stroke="#5c4639" stroke-width="1.45"/><path d="M9.2 10.5h3M10.7 9v3" stroke="#2e7d60" stroke-width="1.5" stroke-linecap="round"/><path d="M9.2 17.5h3" stroke="#6f5d50" stroke-width="1.5" stroke-linecap="round"/><circle cx="17.5" cy="14" r="2" fill="#e39d34"/></svg>`,

    // Controls
    switch: `<svg viewBox="0 0 28 28" fill="none"><line x1="2" y1="16" x2="6" y2="16" stroke="#c57948" stroke-width="2.2" stroke-linecap="round"/><line x1="22" y1="16" x2="26" y2="16" stroke="#c57948" stroke-width="2.2" stroke-linecap="round"/><rect x="5" y="11" width="18" height="10" rx="4" fill="#efe1c6" stroke="#5c4639" stroke-width="1.25"/><path d="M9.2 16l9.2-6.8" stroke="#cc9738" stroke-width="2.5" stroke-linecap="round"/><circle cx="9.2" cy="16" r="2.2" fill="#dfb055" stroke="#5c4639" stroke-width="1"/><circle cx="18.8" cy="16" r="2.2" fill="#dfb055" stroke="#5c4639" stroke-width="1"/><circle cx="18.4" cy="9.2" r="2.4" fill="#d45d44" stroke="#6e2e20" stroke-width="1"/></svg>`,
    spdt: `<svg viewBox="0 0 28 28" fill="none"><rect x="6" y="4.5" width="16" height="19" rx="4.5" fill="#efe1c6" stroke="#5c4639" stroke-width="1.25"/><path d="M2 14h6.5M19.5 9.5H26M19.5 18.5H26" stroke="#c57948" stroke-width="2" stroke-linecap="round"/><path d="M9.5 14l9-4.5" stroke="#cc9738" stroke-width="2.4" stroke-linecap="round"/><circle cx="9.5" cy="14" r="2" fill="#dfb055" stroke="#5c4639" stroke-width="1"/><circle cx="18.5" cy="9.5" r="2" fill="#2e7d60" stroke="#1e5340" stroke-width="1"/><circle cx="18.5" cy="18.5" r="2" fill="#dfb055" stroke="#5c4639" stroke-width="1"/></svg>`,
    pushbutton: `<svg viewBox="0 0 28 28" fill="none"><line x1="2" y1="14" x2="6" y2="14" stroke="#c57948" stroke-width="2.2" stroke-linecap="round"/><line x1="22" y1="14" x2="26" y2="14" stroke="#c57948" stroke-width="2.2" stroke-linecap="round"/><rect x="5.5" y="6" width="17" height="16" rx="4" fill="#fbf3e2" stroke="#5c4639" stroke-width="1.3"/><circle cx="14" cy="14" r="5.5" fill="#d45d44" stroke="#7d2f20" stroke-width="1.1"/><path d="M11.4 11.8a3.2 3.2 0 0 1 3.4-1.2" stroke="#fff8ef" stroke-width="1.5" stroke-linecap="round"/></svg>`,

    // Meters
    voltmeter: `<svg viewBox="0 0 28 28" fill="none"><circle cx="14" cy="14" r="9.5" fill="#fffaf0" stroke="#cc9738" stroke-width="2.4"/><path d="M8.5 14.5a6 6 0 0 1 11 0" stroke="#9e8c7e" stroke-width="1.3" stroke-linecap="round"/><path d="M14 16.5l3.8-5.5" stroke="#d45d44" stroke-width="2" stroke-linecap="round"/><circle cx="14" cy="16.5" r="1.6" fill="#cc9738"/><text x="14" y="21.5" text-anchor="middle" font-size="6.5" font-weight="700" fill="#2e7d60" font-family="sans-serif">V</text></svg>`,
    ammeter: `<svg viewBox="0 0 28 28" fill="none"><circle cx="14" cy="14" r="9.5" fill="#fffaf0" stroke="#cc9738" stroke-width="2.4"/><path d="M8.5 14.5a6 6 0 0 1 11 0" stroke="#9e8c7e" stroke-width="1.3" stroke-linecap="round"/><path d="M14 16.5l-3.2-5.5" stroke="#d45d44" stroke-width="2" stroke-linecap="round"/><circle cx="14" cy="16.5" r="1.6" fill="#cc9738"/><text x="14" y="21.5" text-anchor="middle" font-size="6.5" font-weight="700" fill="#d47a1c" font-family="sans-serif">A</text></svg>`,

    // Digital Logic
    logic_in: `<svg viewBox="0 0 28 28" fill="none"><line x1="19" y1="14" x2="25.5" y2="14" stroke="#2e7d60" stroke-width="2.2" stroke-linecap="round"/><rect x="4" y="6.5" width="15" height="16" rx="4" fill="#23634b"/><rect x="4" y="5" width="15" height="15.5" rx="4" fill="#359571" stroke="#1d523e" stroke-width="1.1"/><path d="M11.5 9.5v6.5" stroke="#fffdf7" stroke-width="2.3" stroke-linecap="round"/></svg>`,
    gate_and: `<svg viewBox="0 0 28 28" fill="none"><path d="M2.5 10h4.5M2.5 18h4.5M21 14h4.5" stroke="#c57948" stroke-width="2" stroke-linecap="round"/><path d="M7 6.5h6.5a7.5 7.5 0 0 1 0 15H7a1.5 1.5 0 0 1-1.5-1.5V8A1.5 1.5 0 0 1 7 6.5z" fill="#fbf3e2" stroke="#5c4639" stroke-width="1.45"/><circle cx="16.5" cy="14" r="2.2" fill="#2e7d60"/></svg>`,
    gate_or: `<svg viewBox="0 0 28 28" fill="none"><path d="M2.5 10h5M2.5 18h5M21 14h4.5" stroke="#c57948" stroke-width="2" stroke-linecap="round"/><path d="M6.5 6.5q7.5 0 14.5 7.5-7 7.5-14.5 7.5 3.6-7.5 0-15z" fill="#fbf3e2" stroke="#5c4639" stroke-width="1.45" stroke-linejoin="round"/><circle cx="15.5" cy="14" r="2.2" fill="#e39d34"/></svg>`,
    gate_not: `<svg viewBox="0 0 28 28" fill="none"><path d="M2.5 14h4M22 14h3.5" stroke="#c57948" stroke-width="2" stroke-linecap="round"/><path d="M6.5 7.2l11.5 6.8-11.5 6.8V7.2z" fill="#fbf3e2" stroke="#5c4639" stroke-width="1.45" stroke-linejoin="round"/><circle cx="20" cy="14" r="2.2" fill="#2e7d60" stroke="#1e5340" stroke-width="1.2"/></svg>`,
    gate_nand: `<svg viewBox="0 0 28 28" fill="none"><path d="M2.5 10h4M2.5 18h4M22.5 14h3" stroke="#c57948" stroke-width="2" stroke-linecap="round"/><path d="M6.5 7H12a7 7 0 0 1 0 14H6.5V7z" fill="#fbf3e2" stroke="#5c4639" stroke-width="1.45" stroke-linejoin="round"/><circle cx="20.8" cy="14" r="2.1" fill="#d45d44" stroke="#7d2f20" stroke-width="1.2"/></svg>`,
    gate_xor: `<svg viewBox="0 0 28 28" fill="none"><path d="M2.5 10h4M2.5 18h4M21.5 14h4" stroke="#c57948" stroke-width="2" stroke-linecap="round"/><path d="M5.5 7.2q3 6.8 0 13.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M8.5 6.8q6.8 0 13 7.2-6.2 7.2-13 7.2 3.2-7.2 0-14.4z" fill="#fbf3e2" stroke="#5c4639" stroke-width="1.45" stroke-linejoin="round"/><circle cx="16.2" cy="14" r="2.1" fill="#465d8c"/></svg>`,
  };
  return icons[type] || icons.resistor;
}

export const getComponentSVG = getPaletteIconSVG;
export const getToolSVG = getPaletteIconSVG;
