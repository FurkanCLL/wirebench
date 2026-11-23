/**
 * SI Engineering Unit Parser & Formatter.
 * Supports standard prefixes (f, p, n, u/µ, m, k/K, M/Meg, G, T),
 * scientific notation (1e-6), and IEC shorthand (4k7 -> 4700, 2u2 -> 2.2e-6).
 */

const PREFIX_FACTORS = {
  f: 1e-15,
  p: 1e-12,
  n: 1e-9,
  u: 1e-6,
  'µ': 1e-6,
  'μ': 1e-6,
  m: 1e-3,
  k: 1e3,
  K: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
};

const DISPLAY_SCALES = [
  { factor: 1e12, prefix: 'T' },
  { factor: 1e9, prefix: 'G' },
  { factor: 1e6, prefix: 'M' },
  { factor: 1e3, prefix: 'k' },
  { factor: 1, prefix: '' },
  { factor: 1e-3, prefix: 'm' },
  { factor: 1e-6, prefix: 'µ' },
  { factor: 1e-9, prefix: 'n' },
  { factor: 1e-12, prefix: 'p' },
  { factor: 1e-15, prefix: 'f' },
];

const TRAILING_UNIT_RE = /(?:ohm|ohms|Ω|Hz|V|A|F|H|W|s|dB|deg|°|%)$/i;

/**
 * Parse a human-entered engineering string into a raw SI number.
 * Returns NaN if invalid.
 * @param {string|number} input
 * @returns {number}
 */
export function parseSI(input) {
  if (typeof input === 'number') {
    return Number.isFinite(input) ? input : NaN;
  }
  if (typeof input !== 'string') return NaN;

  let raw = input.trim().replace(/,/g, '.');
  if (!raw) return NaN;

  // Strip trailing unit symbols like Hz, V, Ω, F, H, s, W, A
  // Careful not to strip 'm' or 'f' prefix when followed by nothing vs 'mF', 'mH', 'ms'
  raw = raw.replace(/\s+/g, '');

  // Handle "Meg" SPICE prefix explicitly before stripping units
  raw = raw.replace(/meg/i, 'M');

  // Strip multi-char units first
  raw = raw.replace(/(?:ohms?|Hz|dB|deg)$/i, '');
  // Strip single-char units only if preceded by digit or prefix (so "100m" keeps 'm', "100mA" -> "100m", "10V" -> "10")
  if (/[0-9fpnuµμmkKMGT][ΩVAFHWs°%]$/u.test(raw)) {
    raw = raw.slice(0, -1);
  } else if (/[0-9][vafhws]$/i.test(raw)) {
    // Only strip lowercase 'v', 'a', 'h', 'w', 's' when directly after a digit (NOT 'f' = femto, NOT 'm' = milli)
    const last = raw[raw.length - 1];
    if ('vahwsVAHWS'.includes(last)) {
      raw = raw.slice(0, -1);
    }
  }

  // IEC RKM shorthand like "4k7", "2u2", "1M5", "4R7", "0R1"
  const rkmMatch = raw.match(/^([+-]?\d+)([fpnuµμmkKMGT]|R)(\d+)$/u);
  if (rkmMatch) {
    const [, whole, sym, frac] = rkmMatch;
    const base = parseFloat(`${whole}.${frac}`);
    const factor = sym === 'R' ? 1 : PREFIX_FACTORS[sym];
    return Number.isFinite(base) && factor ? base * factor : NaN;
  }

  // Standard number + optional SI prefix (not confused with scientific 'e' exponent)
  const stdMatch = raw.match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)([fpnuµμmkKMGT])?$/u);
  if (stdMatch) {
    const [, numStr, prefix] = stdMatch;
    const base = parseFloat(numStr);
    if (!Number.isFinite(base)) return NaN;
    const factor = prefix ? PREFIX_FACTORS[prefix] : 1;
    return base * factor;
  }

  // Final fallback: strip any remaining known unit token
  const cleaned = raw.replace(TRAILING_UNIT_RE, '');
  if (cleaned !== raw) {
    return parseSI(cleaned);
  }
  return NaN;
}

/**
 * Format a numeric value in SI engineering notation.
 * @param {number} value
 * @param {string} [unit='']
 * @param {number} [precision=3] - Significant digits
 * @returns {string}
 */
export function formatSI(value, unit = '', precision = 3) {
  if (!Number.isFinite(value)) return `-${unit ? ' ' + unit : ''}`;
  const abs = Math.abs(value);
  if (abs === 0 || abs < 1e-18) {
    return unit ? `0 ${unit}` : '0';
  }

  let chosen = DISPLAY_SCALES[DISPLAY_SCALES.length - 1];
  for (const scale of DISPLAY_SCALES) {
    if (abs >= scale.factor * 0.9995) {
      chosen = scale;
      break;
    }
  }

  const scaled = value / chosen.factor;
  const formatted = formatCompactNumber(scaled, precision);
  const suffix = `${chosen.prefix}${unit}`;
  return suffix ? `${formatted} ${suffix}` : formatted;
}

/**
 * Format value compactly for schematic labels (e.g. "4.7kΩ", "100µF", "10mH").
 * @param {number} value
 * @param {string} [unit='']
 * @returns {string}
 */
export function formatCompactSI(value, unit = '') {
  if (!Number.isFinite(value)) return '-';
  const abs = Math.abs(value);
  if (abs === 0 || abs < 1e-18) return `0${unit}`;

  let chosen = DISPLAY_SCALES[DISPLAY_SCALES.length - 1];
  for (const scale of DISPLAY_SCALES) {
    if (abs >= scale.factor * 0.9995) {
      chosen = scale;
      break;
    }
  }

  const scaled = value / chosen.factor;
  const numStr = formatCompactNumber(scaled, 3);
  return `${numStr}${chosen.prefix}${unit}`;
}

/**
 * Format value using standard SPICE numeric suffixes (e.g. 4.7k, 100u, 1Meg).
 * @param {number} value
 * @returns {string}
 */
export function formatSpiceValue(value) {
  if (!Number.isFinite(value) || value === 0) return '0';
  const abs = Math.abs(value);
  const spiceScales = [
    { factor: 1e9, prefix: 'G' },
    { factor: 1e6, prefix: 'Meg' },
    { factor: 1e3, prefix: 'k' },
    { factor: 1, prefix: '' },
    { factor: 1e-3, prefix: 'm' },
    { factor: 1e-6, prefix: 'u' },
    { factor: 1e-9, prefix: 'n' },
    { factor: 1e-12, prefix: 'p' },
    { factor: 1e-15, prefix: 'f' },
  ];
  for (const s of spiceScales) {
    if (abs >= s.factor * 0.9999) {
      return `${formatCompactNumber(value / s.factor, 4)}${s.prefix}`;
    }
  }
  return value.toExponential(4);
}

/**
 * Format a scaled number without ugly floating noise or trailing zeros.
 * @param {number} n
 * @param {number} sigFigs
 * @returns {string}
 */
function formatCompactNumber(n, sigFigs = 3) {
  const abs = Math.abs(n);
  let decimals;
  if (abs >= 100) decimals = Math.max(0, sigFigs - 3);
  else if (abs >= 10) decimals = Math.max(0, sigFigs - 2);
  else decimals = Math.max(0, sigFigs - 1);

  const fixed = n.toFixed(decimals);
  // Strip trailing fractional zeros
  return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
}

/**
 * Format signed voltage with fixed width for live tabular readouts.
 * @param {number} v
 * @returns {string}
 */
export function formatSignedVoltage(v) {
  if (!Number.isFinite(v)) return '  - V';
  if (Math.abs(v) < 1e-6) return ' 0.00 V';
  const sign = v >= 0 ? '+' : '-';
  const abs = Math.abs(v);
  if (abs >= 100) return `${sign}${abs.toFixed(1)} V`;
  if (abs >= 1) return `${sign}${abs.toFixed(2)} V`;
  if (abs >= 1e-3) return `${sign}${(abs * 1e3).toFixed(1)} mV`;
  return `${sign}${(abs * 1e6).toFixed(0)} µV`;
}

/**
 * Format signed current cleanly for live readouts.
 * @param {number} i
 * @returns {string}
 */
export function formatSignedCurrent(i) {
  if (!Number.isFinite(i)) return '- A';
  if (Math.abs(i) < 1e-12) return '0.00 A';
  const sign = i >= 0 ? '+' : '-';
  return `${sign}${formatSI(Math.abs(i), 'A', 3)}`;
}
