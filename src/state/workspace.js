/**
 * Wirebench Multi-Tab Persistent Studio Workspace Manager.
 *
 * Guarantees total isolation between Studio tabs and Learn lessons:
 * - Switching from Studio -> Learn -> Studio NEVER loses components, wires,
 *   parameter tweaks, undo/redo history, or camera pan/zoom.
 * - Opening a preset or "Open Copy in Studio" opens a clean tab without
 *   clobbering custom user work.
 * - Studio tabs auto-persist to localStorage across page reloads.
 */

import { COMPONENT_DEFS } from '../engine/components.js';

const STORAGE_KEY = 'wirebench.studio.tabs.v3';

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function makeTabId() {
  return `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export class StudioWorkspace {
  /**
   * @param {import('./store.js').CircuitStore} store
   * @param {{ getCamera?: () => {panX:number,panY:number,zoom:number}|null, setCamera?: (cam:any) => void }} [cameraBridge]
   */
  constructor(store, cameraBridge = {}) {
    this.store = store;
    this.cameraBridge = cameraBridge;
    /** @type {Array<{id:string, name:string, presetId:string|null, dirty:boolean, session:any, camera:any}>} */
    this.tabs = [];
    this.activeTabId = null;
    this.isInStudio = false;
    this.hasSavedWorkspace = false;
    this._saveTimer = null;
    this._listeners = new Set();

    this._loadFromStorage();
  }

  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _emit() {
    for (const fn of this._listeners) fn(this);
  }

  getActiveTab() {
    return this.tabs.find((tab) => tab.id === this.activeTabId) || this.tabs[0] || null;
  }

  /** Capture current live store & camera into the active Studio tab (only when in Studio mode) */
  snapshotActiveTab(markDirty = false) {
    if (!this.isInStudio) return;
    const tab = this.getActiveTab();
    if (!tab) return;
    tab.session = this.store.exportSession();
    tab.name = tab.session.schematic.name || tab.name;
    tab.presetId = tab.session.activePresetId;
    if (markDirty) tab.dirty = true;
    if (this.cameraBridge.getCamera) {
      tab.camera = this.cameraBridge.getCamera();
    }
    this._schedulePersist();
  }

  /** Called right before entering Learn mode so Studio state is safely frozen */
  suspendStudio() {
    if (this.isInStudio) {
      this.snapshotActiveTab(false);
      this.persistNow();
      this.isInStudio = false;
    }
  }

  /** Called when entering Studio mode: restores the active Studio tab verbatim */
  resumeStudio(fallbackPreset = null) {
    if (this.tabs.length === 0) {
      if (fallbackPreset) {
        this.createTabFromSchematic(fallbackPreset.name, fallbackPreset.build(), fallbackPreset.id, false);
      } else {
        this.createBlankTab();
      }
    }
    const tab = this.getActiveTab();
    this.activeTabId = tab.id;
    this.isInStudio = true;
    this.store.restoreSession(tab.session);
    if (tab.camera && this.cameraBridge.setCamera) {
      this.cameraBridge.setCamera(tab.camera);
    }
    this._emit();
    return tab;
  }

  /** Create a fresh empty Studio tab */
  createBlankTab(title = null) {
    if (this.isInStudio) this.snapshotActiveTab(false);

    let name = title;
    if (!name) {
      const used = new Set(this.tabs.map((t) => t.name));
      for (let i = 1; i < 99; i++) {
        const cand = `Untitled ${i}`;
        if (!used.has(cand)) {
          name = cand;
          break;
        }
      }
      name = name || 'Untitled';
    }

    const tab = {
      id: makeTabId(),
      name,
      presetId: null,
      dirty: false,
      camera: null,
      session: {
        activePresetId: null,
        schematic: {
          name,
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
        },
        undoStack: [],
        redoStack: [],
        selectedIds: [],
      },
    };
    this.tabs.push(tab);
    this.activeTabId = tab.id;
    if (this.isInStudio) {
      this.store.restoreSession(tab.session);
    }
    this._schedulePersist();
    this._emit();
    return tab;
  }

  /**
   * Open a preset or copied schematic in Studio WITHOUT destroying existing user tabs.
   * If an untouched tab already holds the exact same presetId, switch to it instead of duplicating.
   */
  createTabFromSchematic(name, schematic, presetId = null, activateNow = true) {
    if (this.isInStudio) this.snapshotActiveTab(false);

    if (presetId) {
      const existing = this.tabs.find((t) => t.presetId === presetId && !t.dirty);
      if (existing) {
        this.activeTabId = existing.id;
        if (activateNow && this.isInStudio) {
          this.store.restoreSession(existing.session);
          if (existing.camera && this.cameraBridge.setCamera) {
            this.cameraBridge.setCamera(existing.camera);
          }
        }
        this._emit();
        return existing;
      }
    }

    const cleanSch = deepClone(schematic);
    cleanSch.name = name || cleanSch.name || 'Circuit';

    const tab = {
      id: makeTabId(),
      name: cleanSch.name,
      presetId,
      dirty: false,
      camera: null,
      session: {
        activePresetId: presetId,
        schematic: cleanSch,
        undoStack: [],
        redoStack: [],
        selectedIds: [],
      },
    };
    this.tabs.push(tab);
    if (activateNow || !this.activeTabId) {
      this.activeTabId = tab.id;
      if (this.isInStudio) {
        this.store.restoreSession(tab.session);
      }
    }
    this._schedulePersist();
    this._emit();
    return tab;
  }

  switchTab(tabId) {
    const next = this.tabs.find((t) => t.id === tabId);
    if (!next) return null;
    if (next.id === this.activeTabId && this.isInStudio) return next;
    if (this.isInStudio) this.snapshotActiveTab(false);
    this.activeTabId = next.id;
    if (this.isInStudio) {
      this.store.restoreSession(next.session);
      if (next.camera && this.cameraBridge.setCamera) {
        this.cameraBridge.setCamera(next.camera);
      }
    }
    this._schedulePersist();
    this._emit();
    return next;
  }

  renameTab(tabId, newName) {
    const tab = this.tabs.find((t) => t.id === tabId);
    if (!tab || !newName.trim()) return;
    tab.name = newName.trim();
    if (tab.session?.schematic) tab.session.schematic.name = tab.name;
    if (this.isInStudio && tab.id === this.activeTabId) {
      this.store.schematic.name = tab.name;
    }
    this._schedulePersist();
    this._emit();
  }

  closeTab(tabId) {
    const idx = this.tabs.findIndex((t) => t.id === tabId);
    if (idx === -1) return;
    if (this.tabs.length <= 1) {
      // Closing the last tab cleanly resets it to a blank circuit
      this.tabs.splice(0, 1);
      this.createBlankTab();
      return;
    }
    const wasActive = this.activeTabId === tabId;
    this.tabs.splice(idx, 1);
    if (wasActive) {
      const next = this.tabs[Math.min(idx, this.tabs.length - 1)];
      this.activeTabId = next.id;
      if (this.isInStudio) {
        this.store.restoreSession(next.session);
        if (next.camera && this.cameraBridge.setCamera) {
          this.cameraBridge.setCamera(next.camera);
        }
      }
    }
    this._schedulePersist();
    this._emit();
  }

  _schedulePersist() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.persistNow(), 220);
  }

  persistNow() {
    try {
      if (typeof localStorage === 'undefined') return;
      const payload = {
        version: 3,
        activeTabId: this.activeTabId,
        tabs: this.tabs.slice(0, 12).map((tab) => ({
          id: tab.id,
          name: tab.name,
          presetId: tab.presetId,
          dirty: tab.dirty,
          camera: tab.camera,
          // Persist schematic cleanly (omit deep undo stack to stay well under quota)
          session: {
            activePresetId: tab.presetId,
            schematic: tab.session?.schematic,
            undoStack: [],
            redoStack: [],
            selectedIds: [],
          },
        })),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      this.hasSavedWorkspace = this.tabs.some(
        (tab) => tab.dirty || (tab.session?.schematic?.components?.length || 0) > 0
      );
    } catch {
      // Ignore storage quota errors
    }
  }

  _loadFromStorage() {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.tabs) || parsed.tabs.length === 0) return;

      const validTabs = [];
      for (const t of parsed.tabs) {
        const sch = t?.session?.schematic;
        if (!sch || !Array.isArray(sch.components) || !Array.isArray(sch.wires)) continue;
        const ok = sch.components.every((c) => Boolean(COMPONENT_DEFS[c.type]));
        if (!ok) continue;
        validTabs.push({
          id: t.id || makeTabId(),
          name: t.name || sch.name || 'Circuit',
          presetId: t.presetId ?? null,
          dirty: Boolean(t.dirty),
          camera: t.camera || null,
          session: {
            activePresetId: t.presetId ?? null,
            schematic: sch,
            undoStack: [],
            redoStack: [],
            selectedIds: [],
          },
        });
      }
      if (validTabs.length > 0) {
        this.tabs = validTabs;
        this.activeTabId =
          validTabs.find((t) => t.id === parsed.activeTabId)?.id || validTabs[0].id;
        this.hasSavedWorkspace = validTabs.some((t) => t.dirty);
      }
    } catch {
      // Ignore corrupt storage
    }
  }
}
