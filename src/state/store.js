/**
 * Schematic State Store with Undo/Redo History, Auto-Designator Numbering,
 * Selection Management, and Validated JSON Import/Export.
 */

import { COMPONENT_DEFS, createComponent } from '../engine/components.js';

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export class CircuitStore {
  constructor() {
    this.schematic = {
      name: 'Untitled Circuit',
      components: [],
      wires: [],
      simConfig: {
        dt: 2e-5,
        simRate: 0.005,
        initialMode: 'dc',
        scopeTimeDiv: 0.001,
        scopeVoltsDiv: 2.0,
        triggerChannel: 1,
        triggerLevel: 0,
      },
    };
    this.activePresetId = null;

    this.undoStack = [];
    this.redoStack = [];
    this.maxHistory = 80;

    this.selectedIds = new Set(); // component IDs and wire IDs
    this.tool = 'select'; // 'select' | 'wire' | 'pan' | 'delete' | 'place:<type>'
    this.placeRotation = 0;
    this.placeFlipX = false;

    this._listeners = new Set();
  }

  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _emit(changeKind = 'topology') {
    for (const fn of this._listeners) {
      fn(changeKind, this);
    }
  }

  _snapshot() {
    return {
      name: this.schematic.name,
      components: deepClone(this.schematic.components),
      wires: deepClone(this.schematic.wires),
      simConfig: deepClone(this.schematic.simConfig),
    };
  }

  pushHistory() {
    this.undoStack.push(this._snapshot());
    if (this.undoStack.length > this.maxHistory) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  undo() {
    if (!this.canUndo()) return false;
    this.redoStack.push(this._snapshot());
    this.schematic = this.undoStack.pop();
    this.selectedIds.clear();
    this._emit('topology');
    return true;
  }

  redo() {
    if (!this.canRedo()) return false;
    this.undoStack.push(this._snapshot());
    this.schematic = this.redoStack.pop();
    this.selectedIds.clear();
    this._emit('topology');
    return true;
  }

  loadSchematic(data, presetId = null) {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.selectedIds.clear();
    this.activePresetId = presetId;
    this.schematic = {
      name: data.name || 'Circuit',
      components: (data.components || []).map((c) => createComponent(c.type, c)),
      wires: (data.wires || []).map((w) => ({
        id: w.id || `w_${Math.random().toString(36).slice(2, 8)}`,
        x1: Math.round(w.x1),
        y1: Math.round(w.y1),
        x2: Math.round(w.x2),
        y2: Math.round(w.y2),
      })),
      simConfig: {
        dt: 2e-5,
        simRate: 0.005,
        initialMode: 'dc',
        scopeTimeDiv: 0.001,
        scopeVoltsDiv: 2.0,
        triggerChannel: 1,
        triggerLevel: 0,
        ...(data.simConfig || {}),
      },
    };
    this._emit('load');
  }

  clearCircuit() {
    this.pushHistory();
    this.activePresetId = null;
    this.selectedIds.clear();
    this.schematic = {
      name: 'New Schematic',
      components: [],
      wires: [],
      simConfig: {
        dt: 2e-5,
        simRate: 0.005,
        initialMode: 'dc',
        scopeTimeDiv: 0.001,
        scopeVoltsDiv: 2.0,
        triggerChannel: 1,
        triggerLevel: 0,
      },
    };
    this._emit('load');
  }

  nextDesignator(type) {
    const def = COMPONENT_DEFS[type];
    const prefix = def ? def.prefix : 'X';
    if (type === 'ground') return 'GND';
    const used = new Set(this.schematic.components.map((c) => c.designator));
    for (let i = 1; i < 999; i++) {
      const cand = `${prefix}${i}`;
      if (!used.has(cand)) return cand;
    }
    return `${prefix}${Date.now() % 1000}`;
  }

  nextProbeChannel() {
    const used = new Set(
      this.schematic.components
        .filter((c) => c.type === 'probe')
        .map((c) => Number(c.params.channel) || 1)
    );
    for (let ch = 1; ch <= 4; ch++) {
      if (!used.has(ch)) return ch;
    }
    return 1;
  }

  addComponent(type, gx, gy, rotation = this.placeRotation, flipX = this.placeFlipX) {
    this.pushHistory();
    const extraParams = {};
    if (type === 'probe') {
      const ch = this.nextProbeChannel();
      extraParams.channel = ch;
      extraParams.label = `CH${ch}`;
    }
    const comp = createComponent(type, {
      designator: this.nextDesignator(type),
      gx: Math.round(gx),
      gy: Math.round(gy),
      rotation,
      flipX,
      params: extraParams,
    });
    this.schematic.components.push(comp);
    this.selectedIds = new Set([comp.id]);
    this._emit('topology');
    return comp;
  }

  addWire(x1, y1, x2, y2, recordHistory = true) {
    const rx1 = Math.round(x1);
    const ry1 = Math.round(y1);
    const rx2 = Math.round(x2);
    const ry2 = Math.round(y2);
    if (rx1 === rx2 && ry1 === ry2) return null;

    // Avoid exact duplicate wire
    const dup = this.schematic.wires.find(
      (w) =>
        (w.x1 === rx1 && w.y1 === ry1 && w.x2 === rx2 && w.y2 === ry2) ||
        (w.x1 === rx2 && w.y1 === ry2 && w.x2 === rx1 && w.y2 === ry1)
    );
    if (dup) return dup;

    if (recordHistory) this.pushHistory();
    const wire = {
      id: `w_${Math.random().toString(36).slice(2, 9)}`,
      x1: rx1,
      y1: ry1,
      x2: rx2,
      y2: ry2,
    };
    this.schematic.wires.push(wire);
    this._emit('topology');
    return wire;
  }

  addOrthogonalWires(x1, y1, x2, y2, horizontalFirst = true) {
    const rx1 = Math.round(x1);
    const ry1 = Math.round(y1);
    const rx2 = Math.round(x2);
    const ry2 = Math.round(y2);
    if (rx1 === rx2 && ry1 === ry2) return [];
    this.pushHistory();
    const added = [];
    if (rx1 === rx2 || ry1 === ry2) {
      const w = this.addWire(rx1, ry1, rx2, ry2, false);
      if (w) added.push(w);
    } else {
      const mx = horizontalFirst ? rx2 : rx1;
      const my = horizontalFirst ? ry1 : ry2;
      const w1 = this.addWire(rx1, ry1, mx, my, false);
      const w2 = this.addWire(mx, my, rx2, ry2, false);
      if (w1) added.push(w1);
      if (w2) added.push(w2);
    }
    return added;
  }

  getComponent(id) {
    return this.schematic.components.find((c) => c.id === id) || null;
  }

  getSelectedComponent() {
    if (this.selectedIds.size !== 1) return null;
    const [only] = this.selectedIds;
    return this.getComponent(only);
  }

  setSelection(ids) {
    this.selectedIds = new Set(ids);
    this._emit('selection');
  }

  setTool(tool) {
    this.tool = tool;
    this._emit('tool');
  }

  updateComponentParam(id, key, value, recordHistory = false) {
    const comp = this.getComponent(id);
    if (!comp) return;
    if (recordHistory) this.pushHistory();
    comp.params[key] = value;
    // Probe channel changes affect netlist probe mapping; other params are live parameter updates
    this._emit(comp.type === 'probe' ? 'topology' : 'param');
  }

  updateComponentDesignator(id, designator) {
    const comp = this.getComponent(id);
    if (!comp) return;
    this.pushHistory();
    comp.designator = designator.trim() || comp.designator;
    this._emit('topology');
  }

  rotateSelected(deltaDeg = 90) {
    const comps = this.schematic.components.filter((c) => this.selectedIds.has(c.id));
    if (comps.length === 0) {
      this.placeRotation = (this.placeRotation + deltaDeg + 360) % 360;
      this._emit('tool');
      return;
    }
    this.pushHistory();
    for (const c of comps) {
      c.rotation = ((c.rotation || 0) + deltaDeg + 360) % 360;
    }
    this._emit('topology');
  }

  flipSelected() {
    const comps = this.schematic.components.filter((c) => this.selectedIds.has(c.id));
    if (comps.length === 0) {
      this.placeFlipX = !this.placeFlipX;
      this._emit('tool');
      return;
    }
    this.pushHistory();
    for (const c of comps) {
      c.flipX = !c.flipX;
    }
    this._emit('topology');
  }

  duplicateSelected() {
    const comps = this.schematic.components.filter((c) => this.selectedIds.has(c.id));
    if (comps.length === 0) return;
    this.pushHistory();
    const newIds = [];
    for (const src of comps) {
      const copy = createComponent(src.type, {
        designator: this.nextDesignator(src.type),
        gx: src.gx + 3,
        gy: src.gy + 2,
        rotation: src.rotation,
        flipX: src.flipX,
        params: { ...src.params },
      });
      this.schematic.components.push(copy);
      newIds.push(copy.id);
    }
    this.selectedIds = new Set(newIds);
    this._emit('topology');
  }

  deleteSelected() {
    if (this.selectedIds.size === 0) return false;
    this.pushHistory();
    this.schematic.components = this.schematic.components.filter((c) => !this.selectedIds.has(c.id));
    this.schematic.wires = this.schematic.wires.filter((w) => !this.selectedIds.has(w.id));
    this.selectedIds.clear();
    this._emit('topology');
    return true;
  }

  deleteById(id) {
    const existed =
      this.schematic.components.some((c) => c.id === id) ||
      this.schematic.wires.some((w) => w.id === id);
    if (!existed) return false;
    this.pushHistory();
    this.schematic.components = this.schematic.components.filter((c) => c.id !== id);
    this.schematic.wires = this.schematic.wires.filter((w) => w.id !== id);
    this.selectedIds.delete(id);
    this._emit('topology');
    return true;
  }

  moveItems(deltas, recordHistory = false) {
    if (recordHistory) this.pushHistory();
    for (const [id, pos] of deltas.entries()) {
      const comp = this.getComponent(id);
      if (comp) {
        comp.gx = Math.round(pos.gx);
        comp.gy = Math.round(pos.gy);
      } else {
        const wire = this.schematic.wires.find((w) => w.id === id);
        if (wire) {
          wire.x1 = Math.round(pos.x1);
          wire.y1 = Math.round(pos.y1);
          wire.x2 = Math.round(pos.x2);
          wire.y2 = Math.round(pos.y2);
        }
      }
    }
    this._emit('topology');
  }

  exportJSON() {
    return JSON.stringify(
      {
        format: 'wirebench-circuit-v1',
        name: this.schematic.name,
        simConfig: this.schematic.simConfig,
        components: this.schematic.components,
        wires: this.schematic.wires,
      },
      null,
      2
    );
  }

  importJSON(jsonText) {
    const parsed = JSON.parse(jsonText);
    if (!parsed || !Array.isArray(parsed.components) || !Array.isArray(parsed.wires)) {
      throw new Error('Invalid Wirebench circuit JSON: missing components or wires arrays.');
    }
    for (const c of parsed.components) {
      if (!COMPONENT_DEFS[c.type]) {
        throw new Error(`Unsupported component type in JSON: "${c.type}"`);
      }
    }
    this.loadSchematic(parsed, null);
  }

  /** Capture full mutable session (schematic + undo/redo + selection) without losing history */
  exportSession() {
    return {
      activePresetId: this.activePresetId,
      schematic: this._snapshot(),
      undoStack: deepClone(this.undoStack),
      redoStack: deepClone(this.redoStack),
      selectedIds: Array.from(this.selectedIds),
    };
  }

  /** Restore a previously captured session verbatim */
  restoreSession(session) {
    if (!session || !session.schematic) return;
    this.activePresetId = session.activePresetId ?? null;
    this.schematic = {
      name: session.schematic.name || 'Untitled',
      components: (session.schematic.components || []).map((c) => createComponent(c.type, c)),
      wires: (session.schematic.wires || []).map((w) => ({
        id: w.id || `w_${Math.random().toString(36).slice(2, 8)}`,
        x1: Math.round(w.x1),
        y1: Math.round(w.y1),
        x2: Math.round(w.x2),
        y2: Math.round(w.y2),
      })),
      simConfig: {
        dt: 2e-5,
        simRate: 0.005,
        initialMode: 'dc',
        scopeTimeDiv: 0.001,
        scopeVoltsDiv: 2.0,
        triggerChannel: 1,
        triggerLevel: 0,
        ...(session.schematic.simConfig || {}),
      },
    };
    this.undoStack = Array.isArray(session.undoStack) ? deepClone(session.undoStack) : [];
    this.redoStack = Array.isArray(session.redoStack) ? deepClone(session.redoStack) : [];
    this.selectedIds = new Set(session.selectedIds || []);
    this._emit('load');
  }
}
