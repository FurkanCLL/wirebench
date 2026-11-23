import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSI, formatSI, formatCompactSI, formatSpiceValue } from '../src/engine/units.js';

test('parseSI handles standard SI prefixes and units', () => {
  assert.ok(Math.abs(parseSI('4.7k') - 4700) < 1e-9);
  assert.ok(Math.abs(parseSI('4.7 kΩ') - 4700) < 1e-9);
  assert.ok(Math.abs(parseSI('100uF') - 100e-6) < 1e-12);
  assert.ok(Math.abs(parseSI('100µ') - 100e-6) < 1e-12);
  assert.ok(Math.abs(parseSI('22nF') - 22e-9) < 1e-15);
  assert.ok(Math.abs(parseSI('10mH') - 10e-3) < 1e-12);
  assert.ok(Math.abs(parseSI('1.5Meg') - 1.5e6) < 1e-3);
  assert.ok(Math.abs(parseSI('2.2MΩ') - 2.2e6) < 1e-3);
  assert.ok(Math.abs(parseSI('440Hz') - 440) < 1e-9);
  assert.ok(Math.abs(parseSI('-12.5V') - -12.5) < 1e-9);
  assert.ok(Math.abs(parseSI('1e-9') - 1e-9) < 1e-18);
});

test('parseSI handles IEC RKM shorthand (4k7, 2u2, 0R1)', () => {
  assert.ok(Math.abs(parseSI('4k7') - 4700) < 1e-9);
  assert.ok(Math.abs(parseSI('2u2') - 2.2e-6) < 1e-12);
  assert.ok(Math.abs(parseSI('4R7') - 4.7) < 1e-9);
  assert.ok(Math.abs(parseSI('0R1') - 0.1) < 1e-9);
  assert.ok(Math.abs(parseSI('1M5') - 1.5e6) < 1e-3);
});

test('parseSI rejects invalid strings', () => {
  assert.ok(Number.isNaN(parseSI('')));
  assert.ok(Number.isNaN(parseSI('abc')));
  assert.ok(Number.isNaN(parseSI('10xx')));
});

test('formatSI and formatSpiceValue round-trip cleanly', () => {
  assert.equal(formatSI(4700, 'Ω'), '4.7 kΩ');
  assert.equal(formatSI(100e-6, 'F'), '100 µF');
  assert.equal(formatCompactSI(10e-3, 'H'), '10mH');
  assert.equal(formatSpiceValue(1.5e6), '1.5Meg');
  assert.equal(formatSpiceValue(4700), '4.7k');
  assert.equal(formatSpiceValue(22e-9), '22n');
});
