# Wirebench

A browser-based electronic circuit simulator written in plain JavaScript with no external dependencies.

You can use it in two ways:
- **Learn**: 6 short interactive labs covering Ohm's law, voltage dividers, RC charging, diode rectifiers, MOSFET switching, and a binary half-adder.
- **Studio**: A sandbox with 24 components, live oscilloscope, AC Bode plot, SPICE netlist export, and multiple saved tabs.

Switching between Learn and Studio keeps your Studio tabs untouched.

## Running it

Requires Node.js 20 or newer. No `npm install` needed.

```bash
# Start local dev server (http://127.0.0.1:3470)
npm start

# Run tests
npm test

# Rebuild single-file browser version (dist/wirebench.html)
npm run build
```

If you don't want to run a server, open `dist/wirebench.html` directly in your browser.

## CLI

You can also run DC, transient, AC Bode, SPICE, and SVG exports from the terminal:

```bash
npm run cli -- list
npm run cli -- dc bjt-amplifier
npm run cli -- tran schmitt-oscillator --duration 6m
npm run cli -- ac sallen-key-filter
npm run cli -- spice cmos-inverter
npm run cli -- svg transformer-psu --theme light > psu.svg
```

## Included parts (24)

- **Sources**: DC/AC voltage source (sine, square, triangle, pulse), current source, ground, logic input (`0`/`1`)
- **Passives**: Resistor, potentiometer, capacitor, inductor, ideal transformer
- **Semiconductors**: Diode (silicon, Schottky, Zener), LED, NPN/PNP BJT, N/P-MOSFET, op-amp
- **Switches & meters**: SPST switch, SPDT switch, pushbutton, voltmeter, ammeter, 4-channel scope probe
- **Logic gates**: `AND`, `OR`, `NOT`, `NAND`, `XOR`

## Built-in example circuits

- Astable Multivibrator
- Bridge Rectifier & Filter
- Sallen-Key Low-Pass Filter
- RLC Resonant Tank
- Diode Soft-Clipper
- Common-Emitter Amplifier
- Schmitt Relaxation Oscillator
- Phase Shifter & Lissajous
- CMOS Inverter
- Binary Half-Adder
- 5V Zener Power Supply

## Project layout

```text
server.mjs               Local HTTP server
cli/wirebench.mjs        Headless CLI runner
scripts/                 Single-file HTML bundler
dist/wirebench.html      Standalone browser build
public/                  HTML entry and CSS
src/engine/              MNA solver, LU/complex math, DC/transient/AC analysis
src/presets/             Example circuits and 6 Learn labs
src/state/               Undo/redo store and multi-tab workspace
src/export/              SPICE (.cir), SVG, and CSV exporters
src/audio/               Web Audio monitor for probe CH1
src/ui/                  Canvas renderer, illustrated parts, scope, Bode, Learn & Studio UI
tests/                   Automated solver, preset, CLI, and canvas tests
```
