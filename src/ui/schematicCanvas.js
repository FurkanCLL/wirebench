/**
 * High-DPI Interactive Luminous Atelier Schematic Canvas.
 * Features:
 * - Daylight Atelier (#FAF4E8 sunlit parchment) & Starlight Atelier (#181624 cozy twilight) worlds.
 * - Whisper-soft warm sepia drafting micro-dots (calm field-journal aesthetic).
 * - Warm paper-shadow wires, brushed brass solder pearls, and KCL-exact glowing golden firefly droplets.
 * - Direct-on-canvas tactile controls: clickable brass switches, pushbuttons, rotary potentiometer knobs.
 * - Enchanting Learn Mode breathing aura + bouncing storybook pointer tag.
 * - Dual render styles: 'illustrated' (default) & 'schematic' (classic IEEE).
 */

import { COMPONENT_DEFS, GRID_SIZE, getComponentPins, transformOffset } from '../engine/components.js';
import { pointKey } from '../engine/netlist.js';
import { drawComponentSymbol, roundRect } from './symbols.js';

const THEMES = {
  light: {
    isDark: false,
    bg: '#faf4e8',
    surface: '#fffdf8',
    tray: '#f3ebd9',
    probeBg: '#fffdf8',
    gridDot: 'rgba(111, 93, 80, 0.19)',
    gridDotMajor: 'rgba(111, 93, 80, 0.36)',
    ink: '#2d221c',
    inkSoft: '#6f5d50',
    inkMuted: '#9e8c7e',
    label: '#6f5d50',
    wireNeutral: '#7d6654',
    wireShadow: 'rgba(64, 42, 24, 0.13)',
    shadow: 'rgba(64, 42, 24, 0.14)',
    copper: '#b87246',
    copperHi: '#e4a778',
    brass: '#cc9738',
    brassHi: '#f7d887',
    vPos: '#2e7d60',
    vNeg: '#d1495b',
    accent: '#d45d44',
    accentSoft: 'rgba(212, 93, 68, 0.14)',
    amber: '#e39d34',
    honey: '#e39d34',
    danger: '#d1495b',
    indigo: '#465d8c',
    select: '#d45d44',
    hover: '#b84831',
    particle: '#f2b53e',
    particleCore: '#fff9e6',
    particleGlow: 'rgba(227, 157, 52, 0.40)',
    pinRing: 'rgba(212, 93, 68, 0.72)',
    marqueeBg: 'rgba(212, 93, 68, 0.08)',
    marqueeBorder: '#d45d44',
    calloutBg: '#fffdf8',
    calloutBorder: '#d45d44',
    calloutInk: '#2d221c',
  },
  dark: {
    isDark: true,
    bg: '#181624',
    surface: '#232034',
    tray: '#2c2840',
    probeBg: '#252136',
    gridDot: 'rgba(246, 238, 224, 0.11)',
    gridDotMajor: 'rgba(245, 188, 88, 0.24)',
    ink: '#f6eee0',
    inkSoft: '#b8ac9e',
    inkMuted: '#80768f',
    label: '#c5b9aa',
    wireNeutral: '#8a7e94',
    wireShadow: 'rgba(6, 4, 14, 0.46)',
    shadow: 'rgba(6, 4, 14, 0.44)',
    copper: '#d08b5c',
    copperHi: '#f0b98a',
    brass: '#dfb055',
    brassHi: '#fbe19d',
    vPos: '#52d1a0',
    vNeg: '#f26d7d',
    accent: '#f07a60',
    accentSoft: 'rgba(240, 122, 96, 0.16)',
    amber: '#f5bc58',
    honey: '#f5bc58',
    danger: '#f26d7d',
    indigo: '#8ca7e0',
    select: '#f07a60',
    hover: '#f69882',
    particle: '#ffcf6b',
    particleCore: '#fff9e6',
    particleGlow: 'rgba(245, 188, 88, 0.50)',
    pinRing: 'rgba(240, 122, 96, 0.80)',
    marqueeBg: 'rgba(240, 122, 96, 0.10)',
    marqueeBorder: '#f07a60',
    calloutBg: '#2a263e',
    calloutBorder: '#f07a60',
    calloutInk: '#f6eee0',
  },
};

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function voltageToColor(v, themeName) {
  const safeV = Number.isFinite(v) ? v : 0;
  const clamped = Math.max(-1, Math.min(1, safeV / 8.5));
  if (Math.abs(clamped) < 0.025) {
    return themeName === 'dark' ? '#8a7e94' : '#7d6654';
  }
  const t = Math.pow(Math.abs(clamped), 0.72);
  if (themeName === 'dark') {
    if (clamped > 0) {
      // Twilight bronze -> moonlit emerald #52d1a0 (82, 209, 160)
      const r = Math.round(lerp(138, 82, t));
      const g = Math.round(lerp(126, 209, t));
      const b = Math.round(lerp(148, 160, t));
      return `rgb(${r},${g},${b})`;
    }
    // Twilight bronze -> warm lantern blush #f26d7d (242, 109, 125)
    const r = Math.round(lerp(138, 242, t));
    const g = Math.round(lerp(126, 109, t));
    const b = Math.round(lerp(148, 125, t));
    return `rgb(${r},${g},${b})`;
  } else {
    if (clamped > 0) {
      // Warm sepia-bronze #7d6654 -> botanical forest sage #2e7d60 (46, 125, 96)
      const r = Math.round(lerp(125, 46, t));
      const g = Math.round(lerp(102, 125, t));
      const b = Math.round(lerp(84, 96, t));
      return `rgb(${r},${g},${b})`;
    }
    // Warm sepia-bronze -> rose blush #d1495b (209, 73, 91)
    const r = Math.round(lerp(125, 209, t));
    const g = Math.round(lerp(102, 73, t));
    const b = Math.round(lerp(84, 91, t));
    return `rgb(${r},${g},${b})`;
  }
}

/**
 * Signed visual drift velocity (pixels/sec) mapped logarithmically from amperes
 * so both microamp base currents and tens-of-mA load currents glide gracefully.
 */
function currentToFlowSpeed(amps) {
  if (!Number.isFinite(amps)) return 0;
  const abs = Math.abs(amps);
  if (abs < 2e-6) return 0;
  const sign = amps >= 0 ? 1 : -1;
  return sign * Math.min(180, Math.log10(1 + abs * 25000) * 44);
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

export class SchematicCanvas {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} store - CircuitStore
   * @param {object} callbacks - { onHoverChange, onLiveParamChange }
   */
  constructor(canvas, store, callbacks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.store = store;
    this.callbacks = callbacks;

    this.themeName = 'light';
    this.renderStyle = 'illustrated';
    this.showCurrentFlow = true;
    this.showVoltageColors = true;
    this.showGrid = true;
    this.lockLayout = false;

    // Camera transform: screenX = worldX * zoom + panX
    this.panX = 0;
    this.panY = 0;
    this.zoom = 1.15;

    // Live simulation reference (attached by App controller)
    this.netlist = null;
    this.simulator = null;

    // Per-segment accumulated flow animation phases (segKey -> phasePx)
    this.segFlowPhase = new Map();
    this.compFlowPhase = new Map();

    // Pointer / Interaction state
    this.pointerWorld = { x: 0, y: 0, gx: 0, gy: 0 };
    this.pointerInside = false;
    this.hoveredCompId = null;
    this.hoveredWireId = null;
    this.hoveredSegIndex = -1;
    this.spacePressed = false;

    // Active gestures
    this.panDrag = null;
    this.moveDrag = null;
    this.marquee = null;
    this.wireAnchor = null; // { gx, gy, horizFirst }
    this.potDrag = null; // { comp }
    this.activePushbutton = null; // comp

    // Guided Learn Mode spotlight overlay & continuous animation clock
    this.guideTarget = null; // { compId: string, label: string } | null
    this._pulseTime = 0;
    this._animTime = 0;

    this._dpr = window.devicePixelRatio || 1;
    this._width = 800;
    this._height = 500;

    this._bindEvents();
    this.resize();
  }

  setGuideTarget(compId, label = '') {
    this.guideTarget = compId ? { compId, label } : null;
  }

  setRenderStyle(style) {
    this.renderStyle = style === 'schematic' ? 'schematic' : 'illustrated';
  }

  getCamera() {
    return { panX: this.panX, panY: this.panY, zoom: this.zoom };
  }

  setCamera(cam) {
    if (!cam) return;
    if (Number.isFinite(cam.zoom)) this.zoom = cam.zoom;
    if (Number.isFinite(cam.panX)) this.panX = cam.panX;
    if (Number.isFinite(cam.panY)) this.panY = cam.panY;
  }

  setSimulation(netlist, simulator) {
    this.netlist = netlist;
    this.simulator = simulator;
  }

  setTheme(themeName) {
    this.themeName = themeName === 'dark' ? 'dark' : 'light';
  }

  resize() {
    const rect = this.canvas.parentElement?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    this._dpr = Math.min(2, window.devicePixelRatio || 1);
    this._width = rect.width;
    this._height = rect.height;
    this.canvas.width = Math.round(rect.width * this._dpr);
    this.canvas.height = Math.round(rect.height * this._dpr);
  }

  screenToWorld(sx, sy) {
    const x = (sx - this.panX) / this.zoom;
    const y = (sy - this.panY) / this.zoom;
    return { x, y, gx: Math.round(x / GRID_SIZE), gy: Math.round(y / GRID_SIZE) };
  }

  worldToScreen(wx, wy) {
    return { x: wx * this.zoom + this.panX, y: wy * this.zoom + this.panY };
  }

  /**
   * Smoothly frame all components and wires inside the unobstructed safe viewport area.
   * @param {{ top?: number, right?: number, bottom?: number, left?: number }} [insets]
   */
  zoomToFit(insets = {}) {
    const padL = insets.left || 0;
    const padR = insets.right || 0;
    const padT = insets.top || 0;
    const padB = insets.bottom || 0;
    const availW = Math.max(220, this._width - padL - padR);
    const availH = Math.max(180, this._height - padT - padB);
    const centerX = padL + availW * 0.5;
    const centerY = padT + availH * 0.5;

    const comps = this.store.schematic.components;
    const wires = this.store.schematic.wires;
    if (comps.length === 0 && wires.length === 0) {
      this.zoom = 1.15;
      this.panX = centerX;
      this.panY = centerY;
      return;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const expand = (gx, gy) => {
      if (gx < minX) minX = gx;
      if (gy < minY) minY = gy;
      if (gx > maxX) maxX = gx;
      if (gy > maxY) maxY = gy;
    };
    for (const c of comps) {
      expand(c.gx - 2, c.gy - 2);
      expand(c.gx + 2, c.gy + 2);
      for (const p of getComponentPins(c)) expand(p.gx, p.gy);
    }
    for (const w of wires) {
      expand(w.x1, w.y1);
      expand(w.x2, w.y2);
    }

    const wWorld = Math.max(8, maxX - minX + 5) * GRID_SIZE;
    const hWorld = Math.max(6, maxY - minY + 5) * GRID_SIZE;
    const cx = ((minX + maxX) * 0.5) * GRID_SIZE;
    const cy = ((minY + maxY) * 0.5) * GRID_SIZE;

    const fitZoom = Math.min((availW * 0.84) / wWorld, (availH * 0.80) / hWorld);
    this.zoom = Math.max(0.45, Math.min(1.65, fitZoom));
    this.panX = centerX - cx * this.zoom;
    this.panY = centerY - cy * this.zoom;
  }

  cancelActiveTool() {
    this.wireAnchor = null;
    this.marquee = null;
    this.moveDrag = null;
    this.potDrag = null;
  }

  flipWireCorner() {
    if (this.wireAnchor) {
      this.wireAnchor.horizFirst = !this.wireAnchor.horizFirst;
    }
  }

  // -------------------------------------------------------------------------
  // Hit Testing Helpers
  // -------------------------------------------------------------------------

  _hitPotentiometerHandle(wx, wy) {
    for (let i = this.store.schematic.components.length - 1; i >= 0; i--) {
      const c = this.store.schematic.components[i];
      if (c.type !== 'potentiometer') continue;
      const { lx, ly } = this._worldToLocal(c, wx, wy);
      if (this.lockLayout) {
        // In guided Learn mode, dragging anywhere on a potentiometer turns its knob effortlessly
        if (Math.abs(lx) <= 2 * GRID_SIZE && ly >= -2 * GRID_SIZE && ly <= 1.4 * GRID_SIZE) {
          return c;
        }
      }
      // In Illustrated mode, grabbing the tactile brass rotary dial turns it directly!
      if (this.renderStyle !== 'schematic' && Math.hypot(lx, ly) <= 15.5) {
        return c;
      }
      // Classic wiper handle (also works cleanly in Schematic mode)
      const w = Math.min(0.99, Math.max(0.01, Number(c.params.wiper) ?? 0.5));
      const localX = (-1.0 + 2.0 * w) * GRID_SIZE;
      const localY = -1.25 * GRID_SIZE;
      const pt = this._localToWorld(c, localX, localY);
      if (Math.hypot(wx - pt.x, wy - pt.y) <= 17) {
        return c;
      }
    }
    return null;
  }

  _localToWorld(comp, lx, ly) {
    const fx = comp.flipX ? -lx : lx;
    const rad = ((comp.rotation || 0) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return {
      x: comp.gx * GRID_SIZE + fx * cos - ly * sin,
      y: comp.gy * GRID_SIZE + fx * sin + ly * cos,
    };
  }

  _worldToLocal(comp, wx, wy) {
    const dx = wx - comp.gx * GRID_SIZE;
    const dy = wy - comp.gy * GRID_SIZE;
    const rad = -((comp.rotation || 0) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    let lx = dx * cos - dy * sin;
    const ly = dx * sin + dy * cos;
    if (comp.flipX) lx = -lx;
    return { lx, ly };
  }

  _hitComponent(wx, wy) {
    for (let i = this.store.schematic.components.length - 1; i >= 0; i--) {
      const c = this.store.schematic.components[i];
      const def = COMPONENT_DEFS[c.type];
      if (!def) continue;
      if (c.type === 'probe') {
        const px = c.gx * GRID_SIZE;
        const py = c.gy * GRID_SIZE;
        if (Math.hypot(wx - px, wy - py) < 12 || (wx >= px + 4 && wx <= px + 90 && wy >= py - 42 && wy <= py - 14)) {
          return c;
        }
        continue;
      }
      const { lx, ly } = this._worldToLocal(c, wx, wy);
      const b = def.bounds;
      const pad = 0.35;
      if (
        lx >= (b.x - pad) * GRID_SIZE &&
        lx <= (b.x + b.w + pad) * GRID_SIZE &&
        ly >= (b.y - pad) * GRID_SIZE &&
        ly <= (b.y + b.h + pad) * GRID_SIZE
      ) {
        return c;
      }
    }
    return null;
  }

  _hitWire(wx, wy) {
    const thresh = 9 / Math.max(0.6, this.zoom);
    let best = null;
    let bestD = thresh;
    for (const w of this.store.schematic.wires) {
      const d = distToSegment(wx, wy, w.x1 * GRID_SIZE, w.y1 * GRID_SIZE, w.x2 * GRID_SIZE, w.y2 * GRID_SIZE);
      if (d < bestD) {
        bestD = d;
        best = w;
      }
    }
    return best;
  }

  _hitCompiledSegment(wx, wy) {
    if (!this.netlist) return -1;
    const thresh = 9 / Math.max(0.6, this.zoom);
    let bestIdx = -1;
    let bestD = thresh;
    for (const s of this.netlist.segments) {
      const d = distToSegment(wx, wy, s.x1 * GRID_SIZE, s.y1 * GRID_SIZE, s.x2 * GRID_SIZE, s.y2 * GRID_SIZE);
      if (d < bestD) {
        bestD = d;
        bestIdx = s.index;
      }
    }
    return bestIdx;
  }

  // -------------------------------------------------------------------------
  // Pointer & Wheel Event Handling
  // -------------------------------------------------------------------------

  _bindEvents() {
    const el = this.canvas;

    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this._suppressNextContextMenu) {
        this._suppressNextContextMenu = false;
        return;
      }
      if (this.wireAnchor) {
        this.wireAnchor = null;
      } else if (this.store.tool.startsWith('place:')) {
        this.store.rotateSelected(90);
      } else {
        this.store.setTool('select');
      }
    });

    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const before = this.screenToWorld(sx, sy);
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      this.zoom = Math.max(0.35, Math.min(3.2, this.zoom * factor));
      this.panX = sx - before.x * this.zoom;
      this.panY = sy - before.y * this.zoom;
    }, { passive: false });

    // Drag-and-drop components straight from the Studio Parts Tray
    el.addEventListener('dragover', (e) => {
      if (this.lockLayout) return;
      if (e.dataTransfer?.types?.includes('application/x-wirebench-part')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        const rect = el.getBoundingClientRect();
        this.pointerWorld = this.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        this.pointerInside = true;
      }
    });

    el.addEventListener('drop', (e) => {
      if (this.lockLayout) return;
      const type = e.dataTransfer?.getData('application/x-wirebench-part');
      if (type && COMPONENT_DEFS[type]) {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const pt = this.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        this.store.addComponent(type, pt.gx, pt.gy, 0, false);
        this.store.setTool('select');
      }
    });

    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const pt = this.screenToWorld(sx, sy);
      this.pointerWorld = pt;

      // Middle click, Right-drag, Alt+drag, Space+drag, or Pan tool
      if (e.button === 1 || e.button === 2 || e.altKey || this.spacePressed || this.store.tool === 'pan') {
        this.panDrag = {
          startX: sx,
          startY: sy,
          origPanX: this.panX,
          origPanY: this.panY,
          isRightBtn: e.button === 2,
          moved: false,
        };
        el.style.cursor = 'grabbing';
        return;
      }
      if (e.button !== 0) return;

      const tool = this.store.tool;

      // Placement Mode
      if (tool.startsWith('place:')) {
        const type = tool.slice(6);
        this.store.addComponent(type, pt.gx, pt.gy, this.store.placeRotation, this.store.placeFlipX);
        return;
      }

      // Wire Routing Mode
      if (tool === 'wire') {
        if (!this.wireAnchor) {
          this.wireAnchor = { gx: pt.gx, gy: pt.gy, horizFirst: true };
        } else {
          if (pt.gx !== this.wireAnchor.gx || pt.gy !== this.wireAnchor.gy) {
            this.store.addOrthogonalWires(
              this.wireAnchor.gx,
              this.wireAnchor.gy,
              pt.gx,
              pt.gy,
              this.wireAnchor.horizFirst
            );
            const destKey = pointKey(pt.gx, pt.gy);
            const landedOnPin = this.store.schematic.components.some((c) =>
              getComponentPins(c).some((p) => pointKey(p.gx, p.gy) === destKey)
            );
            this.wireAnchor = landedOnPin ? null : { gx: pt.gx, gy: pt.gy, horizFirst: !this.wireAnchor.horizFirst };
          } else {
            this.wireAnchor = null;
          }
        }
        return;
      }

      // Delete Tool
      if (tool === 'delete') {
        const hitC = this._hitComponent(pt.x, pt.y);
        if (hitC) {
          this.store.deleteById(hitC.id);
          return;
        }
        const hitW = this._hitWire(pt.x, pt.y);
        if (hitW) {
          this.store.deleteById(hitW.id);
        }
        return;
      }

      // Select / Interact Mode
      // 1. Check potentiometer rotary dial / wiper handle FIRST for smooth tactile dragging!
      const hitPot = this._hitPotentiometerHandle(pt.x, pt.y);
      if (hitPot) {
        this.store.setSelection([hitPot.id]);
        this.potDrag = { comp: hitPot, pushedHistory: false };
        return;
      }

      const hitC = this._hitComponent(pt.x, pt.y);
      if (hitC) {
        // Momentary pushbutton engages immediately on press
        if (hitC.type === 'pushbutton' && !e.shiftKey) {
          this.activePushbutton = hitC;
          this.store.updateComponentParam(hitC.id, 'closed', true, false);
          this.callbacks.onLiveParamChange?.();
        }

        if (e.shiftKey) {
          const next = new Set(this.store.selectedIds);
          if (next.has(hitC.id)) next.delete(hitC.id);
          else next.add(hitC.id);
          this.store.setSelection(next);
        } else if (!this.store.selectedIds.has(hitC.id)) {
          this.store.setSelection([hitC.id]);
        }

        const origins = new Map();
        for (const id of this.store.selectedIds) {
          const comp = this.store.getComponent(id);
          if (comp) origins.set(id, { gx: comp.gx, gy: comp.gy });
          const wire = this.store.schematic.wires.find((w) => w.id === id);
          if (wire) origins.set(id, { x1: wire.x1, y1: wire.y1, x2: wire.x2, y2: wire.y2 });
        }
        this.moveDrag = {
          startGx: pt.gx,
          startGy: pt.gy,
          startSx: sx,
          startSy: sy,
          moved: false,
          historyPushed: false,
          clickedInteractive:
            hitC.type === 'switch' || hitC.type === 'spdt' || hitC.type === 'logic_in' ? hitC : null,
          origins,
        };
        return;
      }

      const hitW = this._hitWire(pt.x, pt.y);
      if (hitW) {
        if (e.shiftKey) {
          const next = new Set(this.store.selectedIds);
          if (next.has(hitW.id)) next.delete(hitW.id);
          else next.add(hitW.id);
          this.store.setSelection(next);
        } else {
          this.store.setSelection([hitW.id]);
        }
        return;
      }

      // Empty canvas click -> start marquee box selection
      if (!e.shiftKey) this.store.setSelection([]);
      this.marquee = { x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y };
    });

    el.addEventListener('pointermove', (e) => {
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const pt = this.screenToWorld(sx, sy);
      this.pointerWorld = pt;
      this.pointerInside = true;

      if (this.panDrag) {
        const dx = sx - this.panDrag.startX;
        const dy = sy - this.panDrag.startY;
        if (Math.hypot(dx, dy) > 5) this.panDrag.moved = true;
        this.panX = this.panDrag.origPanX + dx;
        this.panY = this.panDrag.origPanY + dy;
        return;
      }

      if (this.potDrag) {
        const { comp } = this.potDrag;
        const { lx } = this._worldToLocal(comp, pt.x, pt.y);
        const rawW = (lx / GRID_SIZE + 1.0) / 2.0;
        const clamped = Math.round(Math.min(0.99, Math.max(0.01, rawW)) * 100) / 100;
        if (clamped !== comp.params.wiper) {
          const push = !this.potDrag.pushedHistory;
          this.potDrag.pushedHistory = true;
          this.store.updateComponentParam(comp.id, 'wiper', clamped, push);
          this.callbacks.onLiveParamChange?.();
        }
        return;
      }

      if (this.moveDrag) {
        if (this.lockLayout) return;
        const dScreen = Math.hypot(sx - this.moveDrag.startSx, sy - this.moveDrag.startSy);
        const dgx = pt.gx - this.moveDrag.startGx;
        const dgy = pt.gy - this.moveDrag.startGy;
        if (dScreen > 7 && (dgx !== 0 || dgy !== 0)) {
          this.moveDrag.moved = true;
          const nextMap = new Map();
          for (const [id, orig] of this.moveDrag.origins.entries()) {
            if ('gx' in orig) {
              nextMap.set(id, { gx: orig.gx + dgx, gy: orig.gy + dgy });
            } else {
              nextMap.set(id, {
                x1: orig.x1 + dgx,
                y1: orig.y1 + dgy,
                x2: orig.x2 + dgx,
                y2: orig.y2 + dgy,
              });
            }
          }
          const push = !this.moveDrag.historyPushed;
          this.moveDrag.historyPushed = true;
          this.store.moveItems(nextMap, push);
        }
        return;
      }

      if (this.marquee) {
        this.marquee.x2 = pt.x;
        this.marquee.y2 = pt.y;
        return;
      }

      const hitPot = this.store.tool === 'select' ? this._hitPotentiometerHandle(pt.x, pt.y) : null;
      const hitC = this._hitComponent(pt.x, pt.y);
      const hitW = hitC ? null : this._hitWire(pt.x, pt.y);
      const hitSeg = hitC ? -1 : this._hitCompiledSegment(pt.x, pt.y);

      this.hoveredCompId = hitC ? hitC.id : null;
      this.hoveredWireId = hitW ? hitW.id : null;
      this.hoveredSegIndex = hitSeg;

      if (this.spacePressed || this.store.tool === 'pan') {
        el.style.cursor = 'grab';
      } else if (this.store.tool === 'wire' || this.store.tool.startsWith('place:')) {
        el.style.cursor = 'crosshair';
      } else if (this.store.tool === 'delete') {
        el.style.cursor = hitC || hitW ? 'pointer' : 'not-allowed';
      } else if (hitPot) {
        el.style.cursor = 'ew-resize';
      } else if (hitC && (hitC.type === 'switch' || hitC.type === 'spdt' || hitC.type === 'pushbutton' || hitC.type === 'logic_in')) {
        el.style.cursor = 'pointer';
      } else if (hitC || hitW) {
        el.style.cursor = this.lockLayout ? 'default' : 'move';
      } else {
        el.style.cursor = 'default';
      }

      this.callbacks.onHoverChange?.({
        compId: this.hoveredCompId,
        wireId: this.hoveredWireId,
        segIndex: this.hoveredSegIndex,
      });
    });

    el.addEventListener('pointerup', (e) => {
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);

      if (this.panDrag) {
        if (this.panDrag.isRightBtn && this.panDrag.moved) {
          this._suppressNextContextMenu = true;
        }
        this.panDrag = null;
        el.style.cursor = this.spacePressed ? 'grab' : 'default';
      }

      if (this.potDrag) {
        this.potDrag = null;
      }

      if (this.activePushbutton) {
        const pb = this.activePushbutton;
        this.activePushbutton = null;
        this.store.updateComponentParam(pb.id, 'closed', false, false);
        this.callbacks.onLiveParamChange?.();
      }

      if (this.moveDrag) {
        if (!this.moveDrag.moved && this.moveDrag.clickedInteractive) {
          const item = this.moveDrag.clickedInteractive;
          if (item.type === 'switch') {
            this.store.updateComponentParam(item.id, 'closed', !item.params.closed, true);
          } else if (item.type === 'spdt') {
            this.store.updateComponentParam(item.id, 'position', Number(item.params.position) === 1 ? 0 : 1, true);
          } else if (item.type === 'logic_in') {
            this.store.updateComponentParam(item.id, 'state', !item.params.state, true);
          }
          this.callbacks.onLiveParamChange?.();
        }
        this.moveDrag = null;
      }

      if (this.marquee) {
        const xMin = Math.min(this.marquee.x1, this.marquee.x2);
        const xMax = Math.max(this.marquee.x1, this.marquee.x2);
        const yMin = Math.min(this.marquee.y1, this.marquee.y2);
        const yMax = Math.max(this.marquee.y1, this.marquee.y2);
        if (xMax - xMin > 6 || yMax - yMin > 6) {
          const picked = new Set();
          for (const c of this.store.schematic.components) {
            const cx = c.gx * GRID_SIZE;
            const cy = c.gy * GRID_SIZE;
            if (cx >= xMin && cx <= xMax && cy >= yMin && cy <= yMax) picked.add(c.id);
          }
          for (const w of this.store.schematic.wires) {
            const wx1 = w.x1 * GRID_SIZE, wy1 = w.y1 * GRID_SIZE;
            const wx2 = w.x2 * GRID_SIZE, wy2 = w.y2 * GRID_SIZE;
            if (
              Math.min(wx1, wx2) >= xMin &&
              Math.max(wx1, wx2) <= xMax &&
              Math.min(wy1, wy2) >= yMin &&
              Math.max(wy1, wy2) <= yMax
            ) {
              picked.add(w.id);
            }
          }
          this.store.setSelection(picked);
        }
        this.marquee = null;
      }
    });

    el.addEventListener('pointerleave', () => {
      this.pointerInside = false;
      this.hoveredCompId = null;
      this.hoveredWireId = null;
      this.hoveredSegIndex = -1;
      this.callbacks.onHoverChange?.({ compId: null, wireId: null, segIndex: -1 });
    });
  }

  // -------------------------------------------------------------------------
  // Main 60fps Frame Renderer
  // -------------------------------------------------------------------------

  /**
   * Render one crisp frame of the Luminous Atelier parchment, wires, glowing firefly droplets,
   * handcrafted components, probes, and interactive overlays.
   * @param {number} dtFrameSec - Real wall-clock seconds since last animation frame
   * @param {boolean} isRunning - Whether simulation is actively playing
   */
  render(dtFrameSec, isRunning) {
    const ctx = this.ctx;
    const theme = THEMES[this.themeName] || THEMES.light;
    const w = this._width;
    const h = this._height;
    const safeDt = Math.min(0.05, Math.max(0, Number.isFinite(dtFrameSec) ? dtFrameSec : 0.016));
    if (isRunning) {
      this._animTime += safeDt;
    }

    ctx.save();
    ctx.scale(this._dpr, this._dpr);

    // 1. Sunlit Parchment / Cozy Twilight Canvas Ground
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, w, h);

    // 2. Whisper-Soft Warm Sepia Micro-Dot Field Journal Grid
    if (this.showGrid) {
      this._drawGrid(ctx, theme, w, h);
    }

    // Enter World Coordinate Space
    ctx.save();
    ctx.translate(this.panX, this.panY);
    ctx.scale(this.zoom, this.zoom);

    const evalData = this.simulator?.lastEvaluation || null;
    const nodeVoltages = evalData?.nodeVoltages || null;
    const compTelemetry = evalData?.compTelemetry || null;

    // 3. Draw Wires (with soft paper drop shadows & KCL golden firefly ember droplets!)
    this._drawWiresAndFlow(ctx, theme, nodeVoltages, safeDt, isRunning);

    // 4. Draw Brass Solder Pearls at True Schematic Junctions (degree >= 3)
    if (this.netlist) {
      const isIllust = this.renderStyle !== 'schematic';
      for (const j of this.netlist.junctions) {
        const jx = j.gx * GRID_SIZE;
        const jy = j.gy * GRID_SIZE;
        const v = nodeVoltages ? nodeVoltages[j.node] : 0;
        const vCol = this.showVoltageColors && nodeVoltages ? voltageToColor(v, this.themeName) : theme.ink;

        if (isIllust) {
          // Soft cast shadow beneath brass solder bead
          ctx.fillStyle = theme.shadow;
          ctx.beginPath();
          ctx.arc(jx + 0.8, jy + 1.8, 4.3, 0, Math.PI * 2);
          ctx.fill();

          // Warm brushed brass solder pearl rimmed by live voltage tone
          ctx.fillStyle = theme.brass;
          ctx.strokeStyle = vCol;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(jx, jy, 4.1, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Tiny sunlit highlight bead
          ctx.fillStyle = theme.brassHi;
          ctx.beginPath();
          ctx.arc(jx - 1.2, jy - 1.2, 1.35, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = vCol;
          ctx.beginPath();
          ctx.arc(jx, jy, 3.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // 5. Draw Components (non-probes first, probes above so pennant flags are never obscured)
    const probes = [];
    for (const comp of this.store.schematic.components) {
      if (comp.type === 'probe') {
        probes.push(comp);
        continue;
      }
      const tel = compTelemetry?.get(comp.id) || null;
      const selected = this.store.selectedIds.has(comp.id);
      const hovered = this.hoveredCompId === comp.id;

      if (selected) {
        this._drawSelectionHighlight(ctx, comp, theme);
      }

      drawComponentSymbol(ctx, comp, tel, theme, {
        selected,
        hovered,
        potDragActive: this.potDrag?.comp.id === comp.id,
        renderStyle: this.renderStyle,
        animTime: this._animTime,
      });

      // Subtle golden ember droplets gliding along active 2-terminal leads
      if (this.showCurrentFlow && tel && Math.abs(tel.current) > 1e-5) {
        this._drawComponentCurrentDot(ctx, comp, tel, theme, safeDt, isRunning);
      }
    }

    // Probes rendered above components
    for (const pr of probes) {
      const tel = compTelemetry?.get(pr.id) || null;
      drawComponentSymbol(ctx, pr, tel, theme, {
        selected: this.store.selectedIds.has(pr.id),
        hovered: this.hoveredCompId === pr.id,
        renderStyle: this.renderStyle,
        animTime: this._animTime,
      });
    }

    // 6. Wire Routing Preview & Pin Snap Highlights
    if (this.store.tool === 'wire' || this.store.tool.startsWith('place:')) {
      this._drawPinTargets(ctx, theme);
    }

    if (this.store.tool === 'wire' && this.pointerInside) {
      this._drawWirePreview(ctx, theme);
    }

    // 7. Component Placement Ghost
    if (this.store.tool.startsWith('place:') && this.pointerInside) {
      const type = this.store.tool.slice(6);
      const def = COMPONENT_DEFS[type];
      if (def) {
        const ghost = {
          id: '__ghost__',
          type,
          designator: def.prefix,
          gx: this.pointerWorld.gx,
          gy: this.pointerWorld.gy,
          rotation: this.store.placeRotation,
          flipX: this.store.placeFlipX,
          params: { ...def.defaults },
        };
        drawComponentSymbol(ctx, ghost, null, theme, {
          ghost: true,
          renderStyle: this.renderStyle,
          animTime: this._animTime,
        });
      }
    }

    // 8. Marquee Selection Box
    if (this.marquee) {
      const mx = Math.min(this.marquee.x1, this.marquee.x2);
      const my = Math.min(this.marquee.y1, this.marquee.y2);
      const mw = Math.abs(this.marquee.x2 - this.marquee.x1);
      const mh = Math.abs(this.marquee.y2 - this.marquee.y1);
      ctx.fillStyle = theme.marqueeBg;
      ctx.strokeStyle = theme.marqueeBorder;
      ctx.lineWidth = 1.35 / this.zoom;
      ctx.setLineDash([5 / this.zoom, 4 / this.zoom]);
      roundRect(ctx, mx, my, mw, mh, 6 / this.zoom);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 9. Enchanting Learn Mode Storybook Spotlight Aura & Floating Pointer Tag
    if (this.guideTarget?.compId) {
      this._pulseTime += safeDt;
      this._drawGuideSpotlight(ctx, theme);
    }

    ctx.restore();
    ctx.restore();
  }

  _drawGuideSpotlight(ctx, theme) {
    const comp = this.store.schematic.components.find((c) => c.id === this.guideTarget.compId);
    if (!comp) return;
    const cx = comp.gx * GRID_SIZE;
    const cy = comp.gy * GRID_SIZE;
    const pulse = 0.5 + 0.5 * Math.sin(this._pulseTime * 3.4);
    const bounce = Math.sin(this._pulseTime * 4.4) * 3.2;

    const haloR = 34 + pulse * 6;
    const auraR = 48 + pulse * 8;

    ctx.save();
    // 1. Soft warm golden-terracotta breathing aura (fading cleanly to own RGB alpha 0!)
    const aura = ctx.createRadialGradient(cx, cy, 10, cx, cy, auraR);
    if (theme.isDark) {
      aura.addColorStop(0, `rgba(245, 188, 88, ${(0.18 + pulse * 0.12).toFixed(3)})`);
      aura.addColorStop(0.55, `rgba(240, 122, 96, ${(0.12 + pulse * 0.08).toFixed(3)})`);
      aura.addColorStop(1, 'rgba(240, 122, 96, 0)');
    } else {
      aura.addColorStop(0, `rgba(227, 157, 52, ${(0.20 + pulse * 0.12).toFixed(3)})`);
      aura.addColorStop(0.55, `rgba(212, 93, 68, ${(0.12 + pulse * 0.08).toFixed(3)})`);
      aura.addColorStop(1, 'rgba(212, 93, 68, 0)');
    }
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(cx, cy, auraR, 0, Math.PI * 2);
    ctx.fill();

    // 2. Gentle warm dashed storybook halo ring around target component
    ctx.strokeStyle = theme.accent;
    ctx.globalAlpha = 0.58 + pulse * 0.32;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // 3. Animated bouncing pointer chevron + warm sculpted storybook micro-tag above component
    const isTall =
      comp.type === 'voltage_source' ||
      comp.type === 'current_source' ||
      comp.type === 'opamp' ||
      comp.type === 'transformer';
    const baseOffset = isTall ? 78 : 70;
    const tagY = cy - baseOffset + bounce;
    const text = this.guideTarget.label;

    if (text) {
      ctx.font = '700 11px "Plus Jakarta Sans", "Segoe UI", system-ui, sans-serif';
      const tw = ctx.measureText(text).width;
      const pw = tw + 28;
      const ph = 26;
      const px = cx - pw * 0.5;
      const py = tagY - ph;

      // Soft warm paper drop shadow
      ctx.fillStyle = theme.shadow;
      roundRect(ctx, px + 1.2, py + 3, pw, ph, 13);
      ctx.fill();

      // Sculpted ivory / dusk velvet pill
      ctx.fillStyle = theme.calloutBg;
      ctx.strokeStyle = theme.calloutBorder;
      ctx.lineWidth = 1.6;
      roundRect(ctx, px, py, pw, ph, 13);
      ctx.fill();
      ctx.stroke();

      // Tiny warm golden-terracotta lantern dot inside pill
      ctx.fillStyle = theme.accent;
      ctx.beginPath();
      ctx.arc(px + 11.5, py + ph * 0.5, 3.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff9e6';
      ctx.beginPath();
      ctx.arc(px + 10.7, py + ph * 0.5 - 0.9, 1.1, 0, Math.PI * 2);
      ctx.fill();

      // Warm friendly tag copy
      ctx.fillStyle = theme.calloutInk;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, px + 19, py + ph * 0.5 + 0.5);
    }

    // Animated bouncing downward pointer chevron right beneath the pill
    const chevY = tagY + 6;
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 5.5, chevY);
    ctx.lineTo(cx, chevY + 5.5);
    ctx.lineTo(cx + 5.5, chevY);
    ctx.stroke();

    ctx.restore();
  }

  _drawGrid(ctx, theme, w, h) {
    const step = GRID_SIZE * this.zoom;
    if (step < 11) return;

    const majorEvery = 5;
    const startGx = Math.floor(-this.panX / step) - 1;
    const endGx = Math.ceil((w - this.panX) / step) + 1;
    const startGy = Math.floor(-this.panY / step) - 1;
    const endGy = Math.ceil((h - this.panY) / step) + 1;

    // Quiet warm sepia micro-dots on minor grid (batched into a single path for silky 60fps!)
    if (step >= 18) {
      const rMinor = step >= 28 ? 1.05 : 0.85;
      ctx.fillStyle = theme.gridDot;
      ctx.beginPath();
      for (let gx = startGx; gx <= endGx; gx++) {
        const x = Math.round(gx * step + this.panX) + 0.5;
        const isMajorX = gx % majorEvery === 0;
        for (let gy = startGy; gy <= endGy; gy++) {
          if (isMajorX && gy % majorEvery === 0) continue;
          const y = Math.round(gy * step + this.panY) + 0.5;
          ctx.moveTo(x + rMinor, y);
          ctx.arc(x, y, rMinor, 0, Math.PI * 2);
        }
      }
      ctx.fill();
    }

    // Gentle warm field-journal anchor dots every 5 grid units (NO harsh '+' crosses!)
    const rMajor = step >= 22 ? 1.8 : 1.35;
    ctx.fillStyle = theme.gridDotMajor;
    ctx.beginPath();
    for (let gx = startGx; gx <= endGx; gx++) {
      if (gx % majorEvery !== 0) continue;
      const x = Math.round(gx * step + this.panX) + 0.5;
      for (let gy = startGy; gy <= endGy; gy++) {
        if (gy % majorEvery !== 0) continue;
        const y = Math.round(gy * step + this.panY) + 0.5;
        ctx.moveTo(x + rMajor, y);
        ctx.arc(x, y, rMajor, 0, Math.PI * 2);
      }
    }
    ctx.fill();
  }

  _drawWiresAndFlow(ctx, theme, nodeVoltages, dtFrameSec, isRunning) {
    const segs = this.netlist ? this.netlist.segments : [];
    const segCurrents = this.simulator?.segmentCurrents || null;
    const isIllust = this.renderStyle !== 'schematic';

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Pass 1: Soft warm paper drop-shadow depth under all wires in Illustrated mode
    if (isIllust && segs.length > 0) {
      ctx.strokeStyle = theme.wireShadow;
      ctx.lineWidth = 3.6;
      ctx.beginPath();
      for (const seg of segs) {
        ctx.moveTo(seg.x1 * GRID_SIZE + 0.8, seg.y1 * GRID_SIZE + 2.2);
        ctx.lineTo(seg.x2 * GRID_SIZE + 0.8, seg.y2 * GRID_SIZE + 2.2);
      }
      ctx.stroke();
    }

    // Pass 2: Main voltage-colored wires & selection washes
    for (const seg of segs) {
      const x1 = seg.x1 * GRID_SIZE;
      const y1 = seg.y1 * GRID_SIZE;
      const x2 = seg.x2 * GRID_SIZE;
      const y2 = seg.y2 * GRID_SIZE;

      const selected = this.store.selectedIds.has(seg.wireId);
      const hovered = this.hoveredWireId === seg.wireId || this.hoveredSegIndex === seg.index;
      const v = nodeVoltages ? nodeVoltages[seg.node] : 0;

      if (selected || hovered) {
        ctx.strokeStyle = selected ? theme.accentSoft : theme.isDark ? 'rgba(240, 122, 96, 0.14)' : 'rgba(212, 93, 68, 0.12)';
        ctx.lineWidth = 7.5;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      ctx.strokeStyle = selected
        ? theme.select
        : this.showVoltageColors && nodeVoltages
          ? voltageToColor(v, this.themeName)
          : theme.wireNeutral;
      ctx.lineWidth = selected ? 3.2 : isIllust ? 2.75 : 2.3;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      // Pass 3: Glowing Golden Firefly / Ember Droplets gliding at exact KCL current velocity!
      if (this.showCurrentFlow && segCurrents) {
        const iSeg = segCurrents[seg.index] || 0;
        const speed = currentToFlowSpeed(iSeg);
        const len = Math.hypot(x2 - x1, y2 - y1);
        if (Math.abs(speed) > 1.5 && len > 6) {
          const segKey = `${seg.k1}|${seg.k2}`;
          const spacing = 22;
          let phase = this.segFlowPhase.get(segKey) || 0;
          if (isRunning) {
            phase = (phase + speed * dtFrameSec) % spacing;
            if (phase < 0) phase += spacing;
            this.segFlowPhase.set(segKey, phase);
          }

          const ux = (x2 - x1) / len;
          const uy = (y2 - y1) / len;
          const radius = Math.min(3.3, 2.0 + Math.log10(1 + Math.abs(iSeg) * 2000) * 0.5);

          for (let d = phase; d < len; d += spacing) {
            const px = x1 + ux * d;
            const py = y1 + uy * d;

            // Soft golden firefly glow halo
            ctx.fillStyle = theme.particleGlow;
            ctx.beginPath();
            ctx.arc(px, py, radius * 2.1, 0, Math.PI * 2);
            ctx.fill();

            // Honey-gold ember droplet
            ctx.fillStyle = theme.particle;
            ctx.beginPath();
            ctx.arc(px, py, radius, 0, Math.PI * 2);
            ctx.fill();

            // Tiny sunlit core sparkle
            ctx.fillStyle = theme.particleCore;
            ctx.beginPath();
            ctx.arc(px - radius * 0.25, py - radius * 0.25, radius * 0.45, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }
  }

  _drawComponentCurrentDot(ctx, comp, tel, theme, dtFrameSec, isRunning) {
    const def = COMPONENT_DEFS[comp.type];
    if (!def || def.pins.length !== 2) return;
    const speed = currentToFlowSpeed(tel.current);
    if (Math.abs(speed) < 2) return;

    const p0 = transformOffset(def.pins[0].dx, def.pins[0].dy, comp.rotation, comp.flipX);
    const p1 = transformOffset(def.pins[1].dx, def.pins[1].dy, comp.rotation, comp.flipX);
    const x1 = (comp.gx + p0.dx) * GRID_SIZE;
    const y1 = (comp.gy + p0.dy) * GRID_SIZE;
    const x2 = (comp.gx + p1.dx) * GRID_SIZE;
    const y2 = (comp.gy + p1.dy) * GRID_SIZE;

    const dir = comp.type === 'voltage_source' || comp.type === 'current_source' ? -1 : 1;
    let phase = this.compFlowPhase.get(comp.id) || 0;
    if (isRunning) {
      phase = (phase + dir * speed * dtFrameSec) % 24;
      if (phase < 0) phase += 24;
      this.compFlowPhase.set(comp.id, phase);
    }

    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len < 1) return;
    const ux = (x2 - x1) / len;
    const uy = (y2 - y1) / len;
    for (let d = phase; d < len; d += 24) {
      if (d > 15 && d < len - 15) continue;
      const px = x1 + ux * d;
      const py = y1 + uy * d;
      ctx.fillStyle = theme.particleGlow;
      ctx.beginPath();
      ctx.arc(px, py, 4.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = theme.particle;
      ctx.beginPath();
      ctx.arc(px, py, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawSelectionHighlight(ctx, comp, theme) {
    const def = COMPONENT_DEFS[comp.type];
    if (!def) return;
    ctx.save();
    ctx.translate(comp.gx * GRID_SIZE, comp.gy * GRID_SIZE);
    ctx.rotate(((comp.rotation || 0) * Math.PI) / 180);
    if (comp.flipX) ctx.scale(-1, 1);
    const b = def.bounds;
    const pad = 6;
    const x = b.x * GRID_SIZE - pad;
    const y = b.y * GRID_SIZE - pad;
    const w = b.w * GRID_SIZE + pad * 2;
    const h = b.h * GRID_SIZE + pad * 2;

    // Soft warm terracotta sculpted halo selection frame
    ctx.fillStyle = theme.accentSoft;
    ctx.strokeStyle = theme.select;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([5, 4]);
    roundRect(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  _drawPinTargets(ctx, theme) {
    ctx.save();
    for (const c of this.store.schematic.components) {
      for (const pin of getComponentPins(c)) {
        const px = pin.gx * GRID_SIZE;
        const py = pin.gy * GRID_SIZE;
        const isSnap = this.pointerInside && pin.gx === this.pointerWorld.gx && pin.gy === this.pointerWorld.gy;
        if (isSnap) {
          ctx.fillStyle = theme.accentSoft;
          ctx.beginPath();
          ctx.arc(px, py, 8.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.strokeStyle = isSnap ? theme.accent : theme.pinRing;
        ctx.lineWidth = isSnap ? 2.2 : 1.3;
        ctx.beginPath();
        ctx.arc(px, py, isSnap ? 5.8 : 3.2, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  _drawWirePreview(ctx, theme) {
    const gx = this.pointerWorld.gx;
    const gy = this.pointerWorld.gy;
    const px = gx * GRID_SIZE;
    const py = gy * GRID_SIZE;

    ctx.save();
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 1.9;
    ctx.beginPath();
    ctx.arc(px, py, 5.5, 0, Math.PI * 2);
    ctx.stroke();

    if (this.wireAnchor) {
      const ax = this.wireAnchor.gx * GRID_SIZE;
      const ay = this.wireAnchor.gy * GRID_SIZE;
      const mx = this.wireAnchor.horizFirst ? px : ax;
      const my = this.wireAnchor.horizFirst ? ay : py;

      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(mx, my);
      ctx.lineTo(px, py);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = theme.accent;
      ctx.beginPath();
      ctx.arc(ax, ay, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
