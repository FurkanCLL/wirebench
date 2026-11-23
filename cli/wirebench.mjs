#!/usr/bin/env node
/**
 * Wirebench Headless SPICE Circuit Simulation CLI.
 *
 * Commands:
 *   list                                    List built-in Studio circuits & Learn lessons
 *   dc    <preset|lesson|file.json>         Solve DC operating point & verify KCL
 *   tran  <preset|lesson|file.json>         Run transient analysis (+ ASCII waveform or --csv)
 *   ac    <preset|lesson|file.json>         Run complex AC Bode sweep (+ ASCII plot or --csv)
 *   spice <preset|lesson|file.json>         Export standard SPICE3 .cir netlist
 *   svg   <preset|lesson|file.json>         Export standalone vector SVG schematic
 */

import fs from 'node:fs/promises';
import { PRESET_CIRCUITS } from '../src/presets/circuits.js';
import { LEARN_LESSONS } from '../src/presets/lessons.js';
import { compileNetlist } from '../src/engine/netlist.js';
import { solveDCOperatingPoint } from '../src/engine/dcAnalysis.js';
import { TransientSimulator } from '../src/engine/transient.js';
import { runACSweep } from '../src/engine/acAnalysis.js';
import { formatSI, formatSignedCurrent, formatSignedVoltage, parseSI } from '../src/engine/units.js';
import { exportSpiceNetlist } from '../src/export/spiceExport.js';
import { exportSchematicSVG } from '../src/export/svgExport.js';
import { exportBodeCSV, exportScopeCSV } from '../src/export/csvExport.js';

function printHelp() {
  console.log(`
Wirebench - Headless SPICE Circuit Simulator CLI

Usage:
  node cli/wirebench.mjs <command> [target] [options]

Commands:
  list                                     List all 11 Studio presets & 6 Learn lessons
  dc    <preset|lesson|file.json>          Solve DC operating point & node voltages
  tran  <preset|lesson|file.json>          Run transient simulation + ASCII waveform
        [--duration 20m] [--dt 20u] [--csv]
  ac    <preset|lesson|file.json>          Run Complex AC Small-Signal Bode sweep
        [--start 10] [--stop 100k] [--csv]
  spice <preset|lesson|file.json>          Print standard SPICE3 .cir netlist
  svg   <preset|lesson|file.json>          Print standalone vector SVG schematic
        [--theme light|dark]
`);
}

function getFlag(args, name, fallback = null) {
  const idx = args.indexOf(name);
  if (idx === -1) return fallback;
  return args[idx + 1] ?? true;
}

async function loadTarget(target) {
  if (!target) {
    throw new Error('Missing preset ID, lesson ID, or JSON file path. Run "list" to inspect available circuits.');
  }
  const preset = PRESET_CIRCUITS.find((p) => p.id === target);
  if (preset) return preset.build();

  const lesson = LEARN_LESSONS.find((l) => l.id === target);
  if (lesson) return lesson.build();

  const raw = await fs.readFile(target, 'utf8');
  return JSON.parse(raw);
}

function renderAsciiPlot(values, minVal, maxVal, width = 64, height = 10, unit = 'V') {
  const grid = Array.from({ length: height }, () => new Array(width).fill(' '));
  const span = Math.max(1e-9, maxVal - minVal);

  if (minVal < 0 && maxVal > 0) {
    const zRow = Math.round(((maxVal - 0) / span) * (height - 1));
    for (let x = 0; x < width; x++) grid[zRow][x] = '─';
  }

  for (let x = 0; x < width; x++) {
    const idx = Math.min(values.length - 1, Math.round((x / (width - 1)) * (values.length - 1)));
    const v = values[idx];
    const row = Math.max(0, Math.min(height - 1, Math.round(((maxVal - v) / span) * (height - 1))));
    grid[row][x] = '●';
  }

  const lines = [];
  for (let r = 0; r < height; r++) {
    const tick =
      r === 0
        ? `${maxVal.toFixed(1)}${unit}`.padStart(8)
        : r === height - 1
          ? `${minVal.toFixed(1)}${unit}`.padStart(8)
          : r === Math.floor(height / 2)
            ? `${((maxVal + minVal) / 2).toFixed(1)}${unit}`.padStart(8)
            : '        ';
    lines.push(`${tick} │${grid[r].join('')}`);
  }
  lines.push(`         └${'─'.repeat(width)}`);
  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  if (!cmd || cmd === '--help' || cmd === '-h') {
    printHelp();
    return;
  }

  if (cmd === 'list') {
    console.log('\nWirebench Studio Circuits (11):\n');
    for (const p of PRESET_CIRCUITS) {
      console.log(`  ${p.id.padEnd(24)} [${p.category.padEnd(16)}]  ${p.name}`);
    }
    console.log('\nWirebench Learn Lessons (6):\n');
    for (const l of LEARN_LESSONS) {
      console.log(`  ${l.id.padEnd(24)} [Lesson ${l.number}]          ${l.title} (${l.concept})`);
    }
    console.log('');
    return;
  }

  const target = args[1];
  const schematic = await loadTarget(target);
  const net = compileNetlist(schematic);

  if (cmd === 'spice') {
    console.log(exportSpiceNetlist(schematic, net, schematic.simConfig));
    return;
  }

  if (cmd === 'svg') {
    const theme = getFlag(args, '--theme', 'light');
    console.log(exportSchematicSVG(schematic, net, theme));
    return;
  }

  if (cmd === 'dc') {
    const dc = solveDCOperatingPoint(net);
    const ev = dc.evaluation;
    console.log(`\n=== DC Operating Point: ${schematic.name} ===`);
    console.log(`Converged: ${dc.converged} (${dc.method}, ${dc.iterations} iterations)`);
    console.log(`Matrix: ${net.matrixSize}x${net.matrixSize}  |  Max KCL Residual: ${ev.maxKclResidual.toExponential(2)} A  |  Total Power: ${formatSI(ev.totalPower, 'W', 3)}\n`);

    console.log('Node Voltages:');
    for (let n = 0; n < net.numNodes; n++) {
      console.log(`  ${(net.nodeNames[n] || 'N' + n).padEnd(20)} ${formatSignedVoltage(ev.nodeVoltages[n])}`);
    }

    console.log('\nComponent Telemetry:');
    for (const cc of net.components) {
      if (cc.type === 'ground' || cc.type === 'probe') continue;
      const t = ev.compTelemetry.get(cc.id);
      if (!t) continue;
      console.log(
        `  ${cc.designator.padEnd(8)} ${cc.type.padEnd(15)} V=${formatSignedVoltage(t.voltage).padStart(9)}  I=${formatSignedCurrent(t.current).padStart(11)}  P=${formatSI(Math.abs(t.power || 0), 'W', 3).padStart(9)}  [${t.state}]`
      );
    }
    console.log('');
    return;
  }

  if (cmd === 'tran') {
    const cfg = schematic.simConfig || {};
    const dtFlag = getFlag(args, '--dt', null);
    const durFlag = getFlag(args, '--duration', null);
    const dt = dtFlag ? parseSI(dtFlag) : cfg.dt || 2e-5;
    const duration = durFlag ? parseSI(durFlag) : (cfg.scopeTimeDiv || 0.001) * 10;
    const steps = Math.max(10, Math.min(20000, Math.round(duration / dt)));

    const sim = new TransientSimulator(net, {
      dt,
      initialMode: cfg.initialMode || 'dc',
      historySize: Math.min(8192, steps + 4),
    });
    sim.advance(steps, dt, 1);
    const hist = sim.getWaveformHistory();

    if (args.includes('--csv')) {
      console.log(exportScopeCSV(hist, net.probes));
      return;
    }

    console.log(`\n=== Transient Analysis: ${schematic.name} ===`);
    console.log(`Duration: ${formatSI(sim.time, 's', 3)}  |  dt: ${formatSI(dt, 's', 3)}  |  Steps: ${steps}  |  Max KCL: ${sim.lastEvaluation.maxKclResidual.toExponential(2)} A\n`);

    for (const pr of net.probes) {
      const arr = hist.channels[pr.channel];
      let minV = Infinity, maxV = -Infinity, sumSq = 0;
      for (let i = 0; i < hist.count; i++) {
        minV = Math.min(minV, arr[i]);
        maxV = Math.max(maxV, arr[i]);
        sumSq += arr[i] * arr[i];
      }
      const rms = Math.sqrt(sumSq / hist.count);
      console.log(`CH${pr.channel} (${pr.label}): min=${formatSignedVoltage(minV).trim()}  max=${formatSignedVoltage(maxV).trim()}  Vpp=${formatSI(maxV - minV, 'V', 3)}  Vrms=${formatSI(rms, 'V', 3)}`);
    }

    if (net.probes.length > 0) {
      const p0 = net.probes[0];
      const arr = Array.from(hist.channels[p0.channel]);
      const minV = Math.min(...arr);
      const maxV = Math.max(...arr);
      console.log(`\nWaveform CH${p0.channel} (${p0.label}):`);
      console.log(renderAsciiPlot(arr, minV - 0.1, maxV + 0.1, 64, 10, 'V'));
    }
    console.log('');
    return;
  }

  if (cmd === 'ac') {
    const cfg = schematic.simConfig || {};
    const fStart = getFlag(args, '--start', null) ? parseSI(getFlag(args, '--start')) : cfg.bodeStart || 10;
    const fStop = getFlag(args, '--stop', null) ? parseSI(getFlag(args, '--stop')) : cfg.bodeStop || 100000;
    const ac = runACSweep(net, { fStart, fStop, points: 181 });

    if (!ac.ok) {
      console.error(`AC Sweep failed: ${ac.reason}`);
      process.exit(1);
    }

    if (args.includes('--csv')) {
      console.log(exportBodeCSV(ac));
      return;
    }

    console.log(`\n=== AC Small-Signal Bode Sweep: ${schematic.name} ===`);
    console.log(`Range: ${formatSI(ac.fStart, 'Hz', 3)} → ${formatSI(ac.fStop, 'Hz', 3)}  (DC Bias Converged: ${ac.dcConverged})\n`);

    for (const ch of ac.channels) {
      const m = ch.metrics;
      const cuts = m.cutoffs.map((c) => `${formatSI(c.freq, 'Hz', 3)} (${c.kind})`).join(', ') || 'none';
      console.log(`CH${ch.channel} (${ch.label}):`);
      console.log(`  Low-Freq Gain: ${m.dcGainDb.toFixed(2)} dB  |  Peak: ${m.peakGainDb.toFixed(2)} dB @ ${formatSI(m.peakFreq, 'Hz', 3)}  |  -3 dB Cutoffs: ${cuts}`);
    }

    const plotCh = ac.channels[ac.channels.length - 1];
    if (plotCh) {
      const vals = Array.from(plotCh.magDb);
      const maxDb = Math.ceil((Math.max(...vals) + 4) / 10) * 10;
      const minDb = Math.max(-60, Math.floor((Math.min(...vals) - 4) / 10) * 10);
      console.log(`\nMagnitude Bode Plot - ${plotCh.label} (${formatSI(ac.fStart, 'Hz')} to ${formatSI(ac.fStop, 'Hz')} log):`);
      console.log(renderAsciiPlot(vals, minDb, maxDb, 64, 10, 'dB'));
    }
    console.log('');
    return;
  }

  console.error(`Unknown command: ${cmd}`);
  printHelp();
  process.exit(1);
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
