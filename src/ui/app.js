/**
 * Wirebench v5 Main Application Controller ("Luminous Atelier").
 *
 * Orchestrates:
 * - Isolated Multi-Tab Studio Workspace (100% preserved across Learn <-> Studio & reloads)
 * - Unified Circuits & Tabs Popover keeping the floating top strip whisper-clean
 * - Single Settings Popover housing EN/TR, Daylight/Starlight, Illustrated/Schematic, & overlays
 * - Airy Floating Storybook Learn Ribbon with live physics truth & on-canvas guide halo
 * - Floating Illustrated Parts Tray (24 real parts, click or drag-and-drop)
 * - Contextual Tactile Paper Inspector (components & wires + 1-click Scope Probe)
 * - Collapsible Warm Instrument Shelf (Scope, Bode, Nodes & KCL, Live SPICE)
 * - Safe-area smart framing across all floating overlays & docked shelf states
 */

import { COMPONENT_DEFS } from '../engine/components.js';
import { compileNetlist } from '../engine/netlist.js';
import { TransientSimulator } from '../engine/transient.js';
import { runACSweep } from '../engine/acAnalysis.js';
import { formatSI, formatSignedVoltage } from '../engine/units.js';
import { CircuitStore } from '../state/store.js';
import { StudioWorkspace } from '../state/workspace.js';
import { PRESET_CIRCUITS, getPresetById } from '../presets/circuits.js';
import { LESSONS, getLessonById } from '../presets/lessons.js';
import { exportSpiceNetlist } from '../export/spiceExport.js';
import { exportSchematicSVG } from '../export/svgExport.js';
import { exportScopeCSV, exportBodeCSV } from '../export/csvExport.js';
import { AudioMonitor } from '../audio/audioMonitor.js';
import { SchematicCanvas } from './schematicCanvas.js';
import { OscilloscopeView } from './oscilloscope.js';
import { BodePlotView } from './bodePlot.js';
import { InspectorPanel } from './inspector.js';
import { LearnController } from './learnController.js';
import { getComponentSVG, getToolSVG } from './symbols.js';
import { uiIcon } from './icons.js';
import { getLang, setLang, t, compLabel, loc } from './i18n.js';

const THEME_STORAGE_KEY = 'wirebench.theme.v5';
const STYLE_STORAGE_KEY = 'wirebench.style.v5';

const PART_CATEGORIES = [
  { id: 'all', key: 'parts.cat.all', types: null },
  { id: 'sources', key: 'parts.cat.sources', types: ['voltage_source', 'current_source', 'logic_in', 'ground'] },
  { id: 'passive', key: 'parts.cat.passive', types: ['resistor', 'potentiometer', 'capacitor', 'inductor', 'transformer'] },
  { id: 'semi', key: 'parts.cat.semi', types: ['diode', 'led', 'npn', 'pnp', 'nmos', 'pmos', 'opamp'] },
  { id: 'switch', key: 'parts.cat.switch', types: ['switch', 'spdt', 'pushbutton'] },
  { id: 'logic', key: 'parts.cat.logic', types: ['gate_and', 'gate_or', 'gate_not', 'gate_nand', 'gate_xor'] },
  { id: 'measure', key: 'parts.cat.measure', types: ['voltmeter', 'ammeter', 'probe'] },
];

const ALL_PART_TYPES = PART_CATEGORIES.slice(1).flatMap((c) => c.types);
const TIME_DIV_OPTIONS = [1e-4, 2e-4, 5e-4, 1e-3, 2e-3, 5e-3, 1e-2, 2e-2, 5e-2, 0.1];
const VOLT_DIV_OPTIONS = [0.5, 1, 2, 5, 10, 20];
const BODE_RANGES = [
  { fStart: 1, fStop: 10000, label: '1 Hz – 10 kHz' },
  { fStart: 10, fStop: 100000, label: '10 Hz – 100 kHz' },
  { fStart: 100, fStop: 1000000, label: '100 Hz – 1 MHz' },
];

function presetCategoryLabel(cat) {
  const key = `preset.sub.${cat}`;
  const translated = t(key);
  return translated === key ? cat : translated;
}

function downloadBlob(filename, content, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 150);
}

class WirebenchApp {
  constructor() {
    this.store = new CircuitStore();
    this.audio = new AudioMonitor();
    this.netlist = null;
    this.simulator = null;
    this.lastAC = null;

    this.mode = 'studio';
    this.running = true;
    this.themeName = this._loadTheme();
    this.renderStyle = this._loadRenderStyle();
    this.activeInstrument = 'scope';
    this.drawerOpen = false;
    this.drawerHeight = 224;
    this.partsOpen = window.innerWidth >= 900;
    this.activePartCat = 'all';
    this.partSearchQuery = '';
    this.bodeRangeIdx = 1;
    this.hoverInfo = { compId: null, wireId: null, segIndex: -1 };

    this.simRate = 0.005;
    this._lastFrameMs = performance.now();
    this._lastHudMs = 0;
    this._bodeTimer = null;
    this._toastTimer = null;
    this._nodeValRefs = new Map();
    this._cmdIndex = 0;
    this._cmdItems = [];

    this._initViews();

    this.workspace = new StudioWorkspace(this.store, {
      getCamera: () => this.schematicCanvas.getCamera(),
      setCamera: (cam) => this.schematicCanvas.setCamera(cam),
    });
    this.workspace.subscribe(() => this._renderCircuitsAndTabs());

    this._hydrateIcons();
    this._buildPartsLibrary();
    this._bindWelcomeAndModes();
    this._bindTopbarAndDock();
    this._bindInstrumentControls();
    this._bindDrawerResizer();
    this._bindCommandPalette();
    this._bindKeyboard();

    this.store.subscribe((kind) => this._onStoreChange(kind));

    this._applyTheme(this.themeName, false);
    this._applyRenderStyle(this.renderStyle, false);
    this._applyLanguage();

    // Quietly load Studio behind the Storybook Welcome Cover (restoring saved workspace if any!)
    const defaultPreset = getPresetById('astable-multivibrator');
    const initTab = this.workspace.resumeStudio(defaultPreset);
    this._renderCircuitsAndTabs();
    this._syncWelcomeState();
    this._setPartsOpen(this.partsOpen, false);
    this._setDrawerOpen(false, false);
    if (!initTab?.camera) {
      requestAnimationFrame(() => this._fitView());
    }

    requestAnimationFrame((ts) => this._tick(ts));
  }

  _loadTheme() {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {
      // Ignore storage errors
    }
    return 'light'; // Daylight Atelier default
  }

  _loadRenderStyle() {
    try {
      const saved = localStorage.getItem(STYLE_STORAGE_KEY);
      if (saved === 'illustrated' || saved === 'schematic') return saved;
    } catch {
      // Ignore storage errors
    }
    return 'illustrated'; // Handcrafted illustrated miniatures default
  }

  _initViews() {
    this.schematicCanvas = new SchematicCanvas(
      document.getElementById('schematic-canvas'),
      this.store,
      {
        onHoverChange: (info) => {
          this.hoverInfo = info;
          this._renderHoverHud();
        },
        onLiveParamChange: () => {
          this.simulator?.notifyDiscontinuity();
          if (this.mode === 'studio') this.workspace.snapshotActiveTab(true);
          this._scheduleACAndSpiceRefresh();
        },
      }
    );

    this.scopeView = new OscilloscopeView(document.getElementById('scope-canvas'), {
      onStatsUpdate: (stats) => this._renderScopeStats(stats),
    });

    this.bodeView = new BodePlotView(document.getElementById('bode-canvas'));

    this.inspector = new InspectorPanel(document.getElementById('inspector-card'), this.store, {
      onLiveParamChange: () => {
        this.simulator?.notifyDiscontinuity();
        if (this.mode === 'studio') this.workspace.snapshotActiveTab(true);
        this._scheduleACAndSpiceRefresh();
      },
      onAttachProbeToWire: (wire) => this._attachProbeToWire(wire),
    });

    this.learnCtrl = new LearnController(
      document.getElementById('learn-stepper'),
      document.getElementById('learn-bar'),
      {
        onSelectLesson: (id) => this.loadLesson(id),
        onResetLesson: (id) => this.loadLesson(id),
        onOpenInStudio: () => this.promoteLessonToStudio(),
        onParamChange: (compId, key, val) => {
          this.store.updateComponentParam(compId, key, val, false);
          this.simulator?.notifyDiscontinuity();
        },
        onSpotlightChange: (compId, label) => {
          this.schematicCanvas.setGuideTarget(this.mode === 'learn' ? compId : null, label);
        },
      }
    );

    let lastW = 0;
    let lastH = 0;
    const ro = new ResizeObserver(() => {
      this.schematicCanvas.resize();
      this.scopeView.resize();
      this.bodeView.resize();
      const stage = document.getElementById('canvas-stage');
      const w = stage?.clientWidth || 0;
      const h = stage?.clientHeight || 0;
      if (this.mode === 'learn' && w > 0 && (Math.abs(w - lastW) > 24 || Math.abs(h - lastH) > 24)) {
        lastW = w;
        lastH = h;
        this._fitView();
      } else if (this.netlist) {
        this.schematicCanvas.render(0, false);
        if (this.drawerOpen && this.activeInstrument === 'scope' && this.simulator) {
          this.scopeView.render(this.simulator, this.netlist.probes);
        }
      }
    });
    const stageEl = document.getElementById('canvas-stage');
    const drawerEl = document.getElementById('instrument-drawer');
    if (stageEl) ro.observe(stageEl);
    if (drawerEl) ro.observe(drawerEl);
  }

  _hydrateIcons() {
    const set = (id, html) => {
      const el = document.getElementById(id);
      if (el && html) el.innerHTML = html;
    };
    set('welcome-arrow-learn', uiIcon('arrowRight'));
    set('welcome-arrow-studio', uiIcon('arrowRight'));
    set('btn-play', uiIcon('pause'));
    set('btn-learn-play', uiIcon('pause'));
    set('btn-step', uiIcon('step'));
    set('btn-reset', uiIcon('reset'));
    set('btn-settings-ico', uiIcon('sliders'));
    set('btn-help-close', uiIcon('close'));
    set('parts-search-ico', uiIcon('search'));
    set('cmd-search-icon', uiIcon('search'));
    set('btn-undo', uiIcon('undo'));
    set('btn-redo', uiIcon('redo'));
    set('btn-fit', uiIcon('fit'));
    set('btn-learn-fit', uiIcon('fit'));
    set('btn-drawer-close', uiIcon('close'));

    set('dock-ico-select', getToolSVG('select'));
    set('dock-ico-wire', getToolSVG('wire'));
    set('dock-ico-probe', getComponentSVG('probe'));
    set('dock-ico-cut', getToolSVG('delete'));
  }

  // -------------------------------------------------------------------------
  // Language, Theme & Component Render Style
  // -------------------------------------------------------------------------

  _applyLanguage() {
    const lang = getLang();
    document.documentElement.lang = lang;

    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.title = t(el.dataset.i18nTitle);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.placeholder = t(el.dataset.i18nPlaceholder);
    });

    document.querySelectorAll('[data-set-lang]').forEach((b) => {
      b.classList.toggle('active', b.dataset.setLang === lang);
    });

    this._syncSettingsMenu();
    this._renderPartCategories();
    this._renderPartsGrid();
    this._renderCircuitsAndTabs();
    if (this.mode === 'learn') {
      this.learnCtrl.refreshLanguage(this.store.schematic);
    } else if (this.netlist) {
      this.inspector.renderStructure(this.netlist, this.simulator, this.mode);
    }
  }

  _applyTheme(name, save = true) {
    this.themeName = name === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', this.themeName);
    const metaScheme = document.querySelector('meta[name="color-scheme"]');
    if (metaScheme) metaScheme.setAttribute('content', this.themeName);

    this.schematicCanvas.setTheme(this.themeName);
    this.scopeView.setTheme(this.themeName);
    this.bodeView.setTheme(this.themeName);

    document.querySelectorAll('[data-set-theme]').forEach((b) => {
      b.classList.toggle('active', b.dataset.setTheme === this.themeName);
    });

    if (save) {
      try {
        localStorage.setItem(THEME_STORAGE_KEY, this.themeName);
      } catch {
        // Ignore storage errors
      }
    }

    if (this.netlist) {
      this.schematicCanvas.render(0, false);
      if (this.drawerOpen && this.activeInstrument === 'scope' && this.simulator) {
        this.scopeView.render(this.simulator, this.netlist.probes);
      } else if (this.drawerOpen && this.activeInstrument === 'bode' && this.lastAC) {
        this.bodeView.setData(this.lastAC);
      }
    }
  }

  _applyRenderStyle(style, save = true) {
    this.renderStyle = style === 'schematic' ? 'schematic' : 'illustrated';
    if (typeof this.schematicCanvas.setRenderStyle === 'function') {
      this.schematicCanvas.setRenderStyle(this.renderStyle);
    }
    this._syncSettingsMenu();

    if (save) {
      try {
        localStorage.setItem(STYLE_STORAGE_KEY, this.renderStyle);
      } catch {
        // Ignore storage errors
      }
    }

    if (this.netlist) {
      this.schematicCanvas.render(0, false);
    }
  }

  // -------------------------------------------------------------------------
  // Storybook Welcome Cover & Isolated Mode Switching
  // -------------------------------------------------------------------------

  _syncWelcomeState() {
    const pill = document.getElementById('welcome-resume-pill');
    if (pill) pill.classList.toggle('hidden', !this.workspace.hasSavedWorkspace);
  }

  _bindWelcomeAndModes() {
    const overlay = document.getElementById('welcome-overlay');

    document.getElementById('choose-learn')?.addEventListener('click', () => {
      overlay?.classList.remove('open');
      this.setMode('learn');
    });

    document.getElementById('choose-studio')?.addEventListener('click', () => {
      overlay?.classList.remove('open');
      this.setMode('studio');
    });

    document.getElementById('btn-home')?.addEventListener('click', () => {
      this._closeAllMenus();
      if (this.mode === 'studio') this.workspace.snapshotActiveTab(false);
      this._syncWelcomeState();
      overlay?.classList.add('open');
    });

    document.getElementById('mode-learn')?.addEventListener('click', () => this.setMode('learn'));
    document.getElementById('mode-studio')?.addEventListener('click', () => this.setMode('studio'));

    document.querySelectorAll('[data-set-lang]').forEach((btn) => {
      btn.addEventListener('click', () => {
        setLang(btn.dataset.setLang);
        this._applyLanguage();
      });
    });

    document.querySelectorAll('[data-set-theme]').forEach((btn) => {
      btn.addEventListener('click', () => this._applyTheme(btn.dataset.setTheme, true));
    });
  }

  setMode(nextMode) {
    const target = nextMode === 'learn' ? 'learn' : 'studio';
    const prevMode = this.mode;
    this.mode = target;
    document.documentElement.setAttribute('data-mode', target);
    document.getElementById('mode-learn')?.classList.toggle('active', target === 'learn');
    document.getElementById('mode-studio')?.classList.toggle('active', target === 'studio');
    this._closeAllMenus();

    if (target === 'learn') {
      this.workspace.suspendStudio();
      this.schematicCanvas.lockLayout = true;
      this.store.setTool('select');
      this.inspector.hide();
      this.loadLesson(this.learnCtrl.activeLessonId);
    } else {
      this.schematicCanvas.lockLayout = false;
      this.schematicCanvas.setGuideTarget(null, '');
      const restored = this.workspace.resumeStudio(getPresetById('astable-multivibrator'));
      this._renderCircuitsAndTabs();
      this._setDrawerOpen(this.drawerOpen, false);
      requestAnimationFrame(() => {
        this.schematicCanvas.resize();
        if (!restored.camera) this._fitView();
        else this.schematicCanvas.render(0, false);
      });
      if (prevMode === 'learn' && restored.dirty) {
        this._showToast(t('status.studioRestored'));
      }
    }
  }

  loadLesson(lessonId) {
    const lesson = getLessonById(lessonId);
    if (!lesson) return;
    this.store.loadSchematic(lesson.build(), null);
    this.learnCtrl.setActiveLesson(lesson.id, this.store.schematic);
    this._setDrawerOpen(Boolean(lesson.showScope), false);
    if (lesson.showScope) this._setInstrumentTab('scope');
    requestAnimationFrame(() => {
      this.schematicCanvas.resize();
      this._fitView();
    });
  }

  promoteLessonToStudio() {
    const lesson = this.learnCtrl.getActiveLesson();
    const copy = JSON.parse(JSON.stringify(this.store.schematic));
    const tabName = `${lesson.number}. ${loc(lesson.title)}`;
    this.mode = 'studio';
    document.documentElement.setAttribute('data-mode', 'studio');
    document.getElementById('mode-learn')?.classList.remove('active');
    document.getElementById('mode-studio')?.classList.add('active');
    this.schematicCanvas.lockLayout = false;
    this.schematicCanvas.setGuideTarget(null, '');

    this.workspace.isInStudio = true;
    this.workspace.createTabFromSchematic(tabName, copy, null, true);
    this._renderCircuitsAndTabs();
    this._showToast(t('status.copiedToStudio'));
    requestAnimationFrame(() => {
      this.schematicCanvas.resize();
      this._fitView();
    });
  }

  // -------------------------------------------------------------------------
  // Unified Circuits & Studio Tabs Popover (#btn-circuits -> #circuits-popover)
  // -------------------------------------------------------------------------

  _renderCircuitsAndTabs() {
    const activeTab = this.workspace.getActiveTab();
    const nameEl = document.getElementById('active-circuit-name');
    const badgeEl = document.getElementById('tab-count-badge');

    if (nameEl) {
      nameEl.textContent = activeTab?.name || this.store.schematic?.name || t('top.circuits');
    }
    if (badgeEl) {
      const count = this.workspace.tabs.length;
      badgeEl.textContent = String(count);
      badgeEl.classList.toggle('hidden', count <= 1);
    }

    const pop = document.getElementById('circuits-popover');
    if (!pop) return;
    pop.innerHTML = '';

    // 1. Currently open Studio tabs
    const tabsLabel = document.createElement('div');
    tabsLabel.className = 'cm-section-label';
    tabsLabel.textContent = t('preset.openTabs');
    pop.appendChild(tabsLabel);

    const tabsList = document.createElement('div');
    tabsList.className = 'cm-tabs-list';

    for (const tab of this.workspace.tabs) {
      const isActive = tab.id === this.workspace.activeTabId;
      const row = document.createElement('div');
      row.className = `cm-tab-row${isActive ? ' active' : ''}`;

      const mainBtn = document.createElement('button');
      mainBtn.type = 'button';
      mainBtn.className = 'cm-tab-main';
      mainBtn.title = tab.name;

      if (tab.dirty) {
        const dot = document.createElement('span');
        dot.className = 'cm-tab-dirty';
        dot.setAttribute('aria-hidden', 'true');
        mainBtn.appendChild(dot);
      }

      const tabNameSpan = document.createElement('span');
      tabNameSpan.className = 'cm-tab-name';
      tabNameSpan.textContent = tab.name;
      mainBtn.appendChild(tabNameSpan);

      mainBtn.addEventListener('click', () => {
        this._closeAllMenus();
        const switched = this.workspace.switchTab(tab.id);
        if (switched && !switched.camera) {
          requestAnimationFrame(() => this._fitView());
        }
      });
      row.appendChild(mainBtn);

      if (this.workspace.tabs.length > 1) {
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'cm-tab-close';
        closeBtn.title = t('top.closeTab');
        closeBtn.setAttribute('aria-label', `${t('top.closeTab')}: ${tab.name}`);
        closeBtn.innerHTML = uiIcon('close');
        closeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.workspace.closeTab(tab.id);
        });
        row.appendChild(closeBtn);
      }

      tabsList.appendChild(row);
    }
    pop.appendChild(tabsList);

    // + New Blank Circuit button
    const blankBtn = document.createElement('button');
    blankBtn.type = 'button';
    blankBtn.className = 'cm-new-btn';
    blankBtn.innerHTML = `${uiIcon('plus')}<span>${t('preset.blank')}</span>`;
    blankBtn.addEventListener('click', () => {
      this._closeAllMenus();
      this.workspace.createBlankTab();
      this._setDrawerOpen(false, false);
      requestAnimationFrame(() => this._fitView());
    });
    pop.appendChild(blankBtn);

    // Divider & Categorized Presets
    const div = document.createElement('div');
    div.className = 'cm-divider';
    pop.appendChild(div);

    const note = document.createElement('div');
    note.className = 'cm-note';
    note.textContent = t('preset.openTip');
    pop.appendChild(note);

    const activePresetId = activeTab?.presetId || null;
    const groups = [
      { key: 'preset.cat.analog', ids: ['astable-multivibrator', 'bjt-amplifier', 'schmitt-oscillator', 'diode-clipper', 'rc-lissajous'] },
      { key: 'preset.cat.power', ids: ['bridge-rectifier', 'sallen-key-filter', 'rlc-resonator', 'transformer-psu'] },
      { key: 'preset.cat.digital', ids: ['cmos-inverter', 'half-adder'] },
    ];

    for (const grp of groups) {
      const catEl = document.createElement('div');
      catEl.className = 'cm-cat';
      catEl.textContent = t(grp.key);
      pop.appendChild(catEl);

      for (const id of grp.ids) {
        const p = getPresetById(id);
        if (!p) continue;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `cm-item${p.id === activePresetId ? ' active' : ''}`;
        btn.innerHTML = `<span>${p.name}</span><span class="cm-sub mono">${presetCategoryLabel(p.category)}</span>`;
        btn.addEventListener('click', () => {
          this._closeAllMenus();
          this.openPresetInStudio(p.id);
        });
        pop.appendChild(btn);
      }
    }
  }

  openPresetInStudio(presetId) {
    const preset = getPresetById(presetId);
    if (!preset) return;
    if (this.mode !== 'studio') this.setMode('studio');
    this.workspace.createTabFromSchematic(preset.name, preset.build(), preset.id, true);
    const hasProbes = this.store.schematic.components.some((c) => c.type === 'probe');
    if (hasProbes) this._setDrawerOpen(true, true);
    requestAnimationFrame(() => {
      this.schematicCanvas.resize();
      this._fitView();
    });
  }

  // -------------------------------------------------------------------------
  // Left Floating Illustrated Parts Tray
  // -------------------------------------------------------------------------

  _buildPartsLibrary() {
    this._renderPartCategories();
    this._renderPartsGrid();

    const search = document.getElementById('parts-search');
    search?.addEventListener('input', () => {
      this.partSearchQuery = search.value.trim().toLowerCase();
      this._renderPartsGrid();
    });
  }

  _renderPartCategories() {
    const host = document.getElementById('parts-cats');
    if (!host) return;
    host.innerHTML = '';
    for (const cat of PART_CATEGORIES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `pcat-btn${cat.id === this.activePartCat ? ' active' : ''}`;
      btn.textContent = t(cat.key);
      btn.addEventListener('click', () => {
        this.activePartCat = cat.id;
        this._renderPartCategories();
        this._renderPartsGrid();
      });
      host.appendChild(btn);
    }
  }

  _renderPartsGrid() {
    const grid = document.getElementById('parts-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const cat = PART_CATEGORIES.find((c) => c.id === this.activePartCat) || PART_CATEGORIES[0];
    const pool = cat.types || ALL_PART_TYPES;
    const q = this.partSearchQuery;

    for (const type of pool) {
      const def = COMPONENT_DEFS[type];
      if (!def) continue;
      const label = compLabel(type);
      if (q && !label.toLowerCase().includes(q) && !def.name.toLowerCase().includes(q) && !type.includes(q)) {
        continue;
      }

      const cell = document.createElement('button');
      cell.type = 'button';
      cell.draggable = true;
      cell.className = `part-cell${this.store.tool === `place:${type}` ? ' active' : ''}`;
      cell.dataset.placeType = type;
      cell.innerHTML = `
        <span class="part-sym">${getComponentSVG(type)}</span>
        <span class="part-lbl">${label}</span>
      `;
      cell.addEventListener('click', () => {
        const toolName = `place:${type}`;
        this.store.setTool(this.store.tool === toolName ? 'select' : toolName);
      });
      cell.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('application/x-wirebench-part', type);
        e.dataTransfer.effectAllowed = 'copy';
      });
      grid.appendChild(cell);
    }
  }

  _setPartsOpen(open, refit = false) {
    this.partsOpen = open;
    document.getElementById('parts-panel')?.classList.toggle('open', open);
    document.getElementById('btn-parts-toggle')?.classList.toggle('active', open);
    requestAnimationFrame(() => {
      this.schematicCanvas.resize();
      if (refit) this._fitView();
      else this.schematicCanvas.render(0, false);
    });
  }

  // -------------------------------------------------------------------------
  // Top Strip, Settings Popover, Export Popover & Studio Tool Pill
  // -------------------------------------------------------------------------

  _bindTopbarAndDock() {
    document.getElementById('btn-circuits')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.mode === 'studio') this.workspace.snapshotActiveTab(false);
      this._renderCircuitsAndTabs();
      this._toggleMenu('circuits-popover');
    });

    const togglePlay = () => {
      this.running = !this.running;
      this._syncPlayButtons();
    };
    document.getElementById('btn-play')?.addEventListener('click', togglePlay);
    document.getElementById('btn-learn-play')?.addEventListener('click', togglePlay);

    document.getElementById('btn-step')?.addEventListener('click', () => {
      this.running = false;
      this._syncPlayButtons();
      if (this.simulator) {
        this.simulator.step(this.simulator.dt);
        this.schematicCanvas.render(0, false);
        if (this.drawerOpen && this.activeInstrument === 'scope') {
          this.scopeView.render(this.simulator, this.netlist.probes);
        }
        this.inspector.updateLiveTelemetry(this.netlist, this.simulator);
        this._updateNodesGrid();
      }
    });

    document.getElementById('btn-reset')?.addEventListener('click', () => {
      this._recompileAndReset(true);
    });

    document.getElementById('btn-speed')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._toggleMenu('speed-popover');
    });
    const speedSlider = document.getElementById('sim-speed');
    speedSlider?.addEventListener('input', () => {
      this.simRate = Math.pow(10, Number(speedSlider.value));
      this._updateSpeedLabel();
    });
    this._updateSpeedLabel();

    document.getElementById('btn-parts-toggle')?.addEventListener('click', () => {
      this._setPartsOpen(!this.partsOpen, false);
    });

    document.getElementById('btn-scope-toggle')?.addEventListener('click', () => {
      this._setDrawerOpen(!this.drawerOpen, false);
    });

    // Unified Settings Popover (#btn-settings -> #settings-popover)
    document.getElementById('btn-settings')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._syncSettingsMenu();
      this._toggleMenu('settings-popover');
    });

    document.getElementById('settings-popover')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-toggle]');
      if (!btn) return;
      const key = btn.dataset.toggle;
      if (key === 'style') {
        this._applyRenderStyle(this.renderStyle === 'illustrated' ? 'schematic' : 'illustrated', true);
        return;
      }
      if (key === 'flow') this.schematicCanvas.showCurrentFlow = !this.schematicCanvas.showCurrentFlow;
      else if (key === 'voltage') this.schematicCanvas.showVoltageColors = !this.schematicCanvas.showVoltageColors;
      else if (key === 'grid') this.schematicCanvas.showGrid = !this.schematicCanvas.showGrid;
      else if (key === 'audio') this.audio.toggle();
      this._syncSettingsMenu();
      if (this.netlist) this.schematicCanvas.render(0, false);
    });

    document.getElementById('act-shortcuts')?.addEventListener('click', () => {
      this._closeAllMenus();
      document.getElementById('help-overlay')?.classList.add('open');
    });

    // Export / File Popover (#btn-export -> #export-popover)
    document.getElementById('btn-export')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._toggleMenu('export-popover');
    });

    const slug = () => (this.store.schematic.name || 'circuit').toLowerCase().replace(/[^a-z0-9]+/g, '-');

    document.getElementById('act-save-json')?.addEventListener('click', () => {
      this._closeAllMenus();
      downloadBlob(`${slug()}.wirebench.json`, this.store.exportJSON(), 'application/json');
    });

    const fileInput = document.getElementById('file-json-input');
    document.getElementById('act-load-json')?.addEventListener('click', () => {
      this._closeAllMenus();
      fileInput?.click();
    });
    fileInput?.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        this.workspace.createTabFromSchematic(parsed.name || file.name.replace(/\.json$/i, ''), parsed, null, true);
        requestAnimationFrame(() => this._fitView());
      } catch (err) {
        alert(`Could not load circuit JSON:\n${err.message}`);
      }
      fileInput.value = '';
    });

    document.getElementById('act-export-svg')?.addEventListener('click', () => {
      this._closeAllMenus();
      const svg = exportSchematicSVG(this.store.schematic, this.netlist, this.simulator?.lastEvaluation);
      downloadBlob(`${slug()}.svg`, svg, 'image/svg+xml');
    });

    document.getElementById('act-export-spice')?.addEventListener('click', () => {
      this._closeAllMenus();
      const cir = exportSpiceNetlist(this.store.schematic, this.netlist, this.store.schematic.simConfig);
      downloadBlob(`${slug()}.cir`, cir, 'text/plain');
    });

    document.getElementById('act-export-csv')?.addEventListener('click', () => {
      this._closeAllMenus();
      if (this.activeInstrument === 'bode' && this.lastAC?.ok) {
        downloadBlob(`${slug()}-bode.csv`, exportBodeCSV(this.lastAC), 'text/csv');
      } else if (this.simulator && this.netlist) {
        downloadBlob(`${slug()}-scope.csv`, exportScopeCSV(this.simulator.getWaveformHistory(), this.netlist.probes), 'text/csv');
      }
    });

    document.getElementById('act-clear')?.addEventListener('click', () => {
      this._closeAllMenus();
      this.store.clearCircuit();
    });

    // Studio Tool Pill & Learn Corner Controls
    document.querySelectorAll('#tool-dock [data-tool]').forEach((btn) => {
      btn.addEventListener('click', () => this.store.setTool(btn.dataset.tool));
    });
    document.getElementById('btn-undo')?.addEventListener('click', () => this.store.undo());
    document.getElementById('btn-redo')?.addEventListener('click', () => this.store.redo());
    document.getElementById('btn-fit')?.addEventListener('click', () => this._fitView());
    document.getElementById('btn-learn-fit')?.addEventListener('click', () => this._fitView());
    document.getElementById('btn-cmd')?.addEventListener('click', () => this._openCommandPalette());

    document.getElementById('btn-help-close')?.addEventListener('click', () => {
      document.getElementById('help-overlay')?.classList.remove('open');
    });
    document.getElementById('help-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'help-overlay') e.currentTarget.classList.remove('open');
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.pop-wrap')) this._closeAllMenus();
      if (!e.target.closest('#learn-bar')) this.learnCtrl.closePopovers();
    });
  }

  _syncPlayButtons() {
    for (const id of ['btn-play', 'btn-learn-play']) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.innerHTML = uiIcon(this.running ? 'pause' : 'play');
      el.classList.toggle('running', this.running);
    }
  }

  _toggleMenu(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const wasOpen = el.classList.contains('open');
    this._closeAllMenus();
    if (!wasOpen) el.classList.add('open');
  }

  _closeAllMenus() {
    document.querySelectorAll('.atelier-pop.open, .flat-menu.open').forEach((m) => m.classList.remove('open'));
  }

  _syncSettingsMenu() {
    const styleChip = document.getElementById('chip-style');
    if (styleChip) {
      const isIllus = this.renderStyle === 'illustrated';
      styleChip.textContent = isIllus ? t('settings.illustrated') : t('settings.schematic');
      styleChip.classList.toggle('on', isIllus);
    }

    const setChip = (id, on) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = on ? 'ON' : 'OFF';
      el.classList.toggle('on', on);
    };
    setChip('chip-flow', this.schematicCanvas.showCurrentFlow);
    setChip('chip-voltage', this.schematicCanvas.showVoltageColors);
    setChip('chip-grid', this.schematicCanvas.showGrid);
    setChip('chip-audio', this.audio.enabled);
  }

  _updateSpeedLabel() {
    const txt = `${formatSI(this.simRate, 's', 2)}/s`;
    const valEl = document.getElementById('sim-speed-val');
    const btnEl = document.getElementById('btn-speed');
    if (valEl) valEl.textContent = txt;
    if (btnEl) btnEl.textContent = txt;
  }

  _syncToolButtons() {
    const tool = this.store.tool;
    document.querySelectorAll('#tool-dock [data-tool]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tool === tool);
    });
    document.querySelectorAll('#parts-grid .part-cell').forEach((cell) => {
      cell.classList.toggle('active', tool === `place:${cell.dataset.placeType}`);
    });
  }

  _syncUndoRedo() {
    const undoBtn = document.getElementById('btn-undo');
    const redoBtn = document.getElementById('btn-redo');
    if (undoBtn) undoBtn.disabled = !this.store.canUndo();
    if (redoBtn) redoBtn.disabled = !this.store.canRedo();
  }

  /**
   * Safe-area smart framing: centers the active circuit cleanly inside the
   * unobstructed parchment space (accounting for floating top strip, open left
   * Parts Tray, open right Inspector, bottom Tool Pill or Learn Ribbon, and
   * any docked Instrument Shelf below `#canvas-stage`).
   */
  _fitView() {
    const stage = document.getElementById('canvas-stage');
    const stageW = stage?.clientWidth || window.innerWidth || 1024;
    const stageH = stage?.clientHeight || window.innerHeight || 640;

    const topEl = document.querySelector('.atelier-top');
    const topH = topEl && topEl.offsetHeight > 0 ? topEl.offsetHeight + 16 : 62;
    let top = this.mode === 'learn' ? topH + 34 : topH + 22;

    let left = 28;
    let right = 28;
    let bottom = 32;

    if (this.mode === 'studio') {
      const partsEl = document.getElementById('parts-panel');
      if (this.partsOpen) {
        left = Math.max(260, (partsEl?.offsetWidth || 226) + 34);
      }
      const inspEl = document.getElementById('inspector-card');
      if (this.store.selectedIds.size === 1 || inspEl?.classList.contains('open')) {
        right = Math.max(290, (inspEl?.offsetWidth || 266) + 34);
      }
      const dockEl = document.getElementById('tool-dock');
      bottom = Math.max(76, (dockEl?.offsetHeight || 44) + 34);
    } else {
      const learnBar = document.getElementById('learn-bar');
      bottom = (learnBar?.offsetHeight || 104) + 38;
      left = 36;
      right = 36;
    }

    if (left + right > stageW - 180) {
      const half = Math.max(20, Math.floor((stageW - 180) * 0.5));
      left = Math.min(left, half);
      right = Math.min(right, half);
    }
    if (top + bottom > stageH - 120) {
      top = Math.min(top, Math.max(24, Math.floor((stageH - 120) * 0.4)));
      bottom = Math.min(bottom, Math.max(24, Math.floor((stageH - 120) * 0.6)));
    }

    this.schematicCanvas.zoomToFit({ top, bottom, left, right });
    this.schematicCanvas.render(0, false);
  }

  _attachProbeToWire(wire) {
    const mx = Math.round((wire.x1 + wire.x2) * 0.5);
    const my = Math.round((wire.y1 + wire.y2) * 0.5);
    this.store.addComponent('probe', mx, my, 0, false);
    this._setDrawerOpen(true, false);
    this._setInstrumentTab('scope');
  }

  _showToast(msg) {
    const el = document.getElementById('toast-pill');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.add('hidden'), 2400);
  }

  // -------------------------------------------------------------------------
  // Collapsible Warm Instrument Shelf (Scope, Bode, Nodes, SPICE)
  // -------------------------------------------------------------------------

  _bindInstrumentControls() {
    document.querySelectorAll('.itab').forEach((btn) => {
      btn.addEventListener('click', () => this._setInstrumentTab(btn.dataset.inst));
    });

    document.getElementById('btn-drawer-close')?.addEventListener('click', () => {
      this._setDrawerOpen(false, false);
    });

    document.getElementById('scope-time-cycle')?.addEventListener('click', () => {
      const idx = TIME_DIV_OPTIONS.findIndex((v) => Math.abs(v - this.scopeView.timePerDiv) / v < 0.15);
      this.scopeView.timePerDiv = TIME_DIV_OPTIONS[(idx + 1) % TIME_DIV_OPTIONS.length];
      this._syncScopeControlPills();
    });

    document.getElementById('scope-volt-cycle')?.addEventListener('click', () => {
      const idx = VOLT_DIV_OPTIONS.findIndex((v) => Math.abs(v - this.scopeView.voltsPerDiv) / v < 0.15);
      this.scopeView.voltsPerDiv = VOLT_DIV_OPTIONS[(idx + 1) % VOLT_DIV_OPTIONS.length];
      this.scopeView.autoScaleV = false;
      this._syncScopeControlPills();
    });

    document.getElementById('scope-auto')?.addEventListener('click', (e) => {
      this.scopeView.autoScaleV = !this.scopeView.autoScaleV;
      e.currentTarget.classList.toggle('active', this.scopeView.autoScaleV);
    });

    document.getElementById('scope-xy')?.addEventListener('click', (e) => {
      this.scopeView.xyMode = !this.scopeView.xyMode;
      e.currentTarget.classList.toggle('active', this.scopeView.xyMode);
    });

    document.getElementById('scope-hold')?.addEventListener('click', (e) => {
      this.scopeView.hold = !this.scopeView.hold;
      if (!this.scopeView.hold) this.scopeView.heldSnapshot = null;
      e.currentTarget.classList.toggle('active', this.scopeView.hold);
    });

    const rangeBtn = document.getElementById('bode-range-btn');
    rangeBtn?.addEventListener('click', () => {
      this.bodeRangeIdx = (this.bodeRangeIdx + 1) % BODE_RANGES.length;
      rangeBtn.textContent = BODE_RANGES[this.bodeRangeIdx].label;
      this._runACAnalysis();
    });

    document.getElementById('bode-run')?.addEventListener('click', () => this._runACAnalysis());

    document.getElementById('btn-copy-spice')?.addEventListener('click', async (e) => {
      const code = document.getElementById('spice-deck-code')?.textContent || '';
      try {
        await navigator.clipboard.writeText(code);
        const btn = e.currentTarget;
        btn.textContent = t('inst.copied');
        setTimeout(() => { btn.textContent = t('inst.copy'); }, 1200);
      } catch {
        // Ignore clipboard denial
      }
    });
  }

  _syncScopeControlPills() {
    const tBtn = document.getElementById('scope-time-cycle');
    const vBtn = document.getElementById('scope-volt-cycle');
    if (tBtn) tBtn.textContent = `${formatSI(this.scopeView.timePerDiv, 's', 2)}/div`;
    if (vBtn) vBtn.textContent = `${formatSI(this.scopeView.voltsPerDiv, 'V', 2)}/div`;
    document.getElementById('scope-xy')?.classList.toggle('active', this.scopeView.xyMode);
    document.getElementById('scope-hold')?.classList.toggle('active', this.scopeView.hold);
    document.getElementById('scope-auto')?.classList.toggle('active', this.scopeView.autoScaleV);
  }

  _setDrawerOpen(open, refit = false) {
    this.drawerOpen = open;
    const drawer = document.getElementById('instrument-drawer');
    if (drawer) {
      drawer.classList.toggle('hidden', !open);
      drawer.style.height = `${this.drawerHeight}px`;
    }
    document.getElementById('btn-scope-toggle')?.classList.toggle('active', open);

    requestAnimationFrame(() => {
      this.schematicCanvas.resize();
      if (open) {
        this.scopeView.resize();
        this.bodeView.resize();
        if (this.activeInstrument === 'bode') this._runACAnalysis();
        if (this.activeInstrument === 'spice') this._refreshSpiceDeck();
        if (this.activeInstrument === 'scope' && this.simulator && this.netlist) {
          this.scopeView.render(this.simulator, this.netlist.probes);
        }
      }
      if (refit) this._fitView();
      else this.schematicCanvas.render(0, false);
    });
  }

  _setInstrumentTab(name) {
    this.activeInstrument = name;
    document.querySelectorAll('.itab').forEach((b) => b.classList.toggle('active', b.dataset.inst === name));
    document.querySelectorAll('.inst-ctrls').forEach((c) => c.classList.toggle('active', c.dataset.instCtrl === name));
    document.querySelectorAll('.inst-pane').forEach((p) => p.classList.toggle('active', p.dataset.pane === name));

    if (!this.drawerOpen) this._setDrawerOpen(true, false);

    requestAnimationFrame(() => {
      if (name === 'scope') {
        this.scopeView.resize();
        if (this.simulator && this.netlist) this.scopeView.render(this.simulator, this.netlist.probes);
      } else if (name === 'bode') {
        this.bodeView.resize();
        this._runACAnalysis();
      } else if (name === 'spice') {
        this._refreshSpiceDeck();
      } else if (name === 'nodes') {
        this._updateNodesGrid();
      }
    });
  }

  _bindDrawerResizer() {
    const resizer = document.getElementById('drawer-resizer');
    const drawer = document.getElementById('instrument-drawer');
    if (!resizer || !drawer) return;
    let drag = null;

    resizer.addEventListener('pointerdown', (e) => {
      resizer.setPointerCapture(e.pointerId);
      drag = { startY: e.clientY, startH: drawer.getBoundingClientRect().height };
    });

    resizer.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const nextH = Math.max(150, Math.min(window.innerHeight * 0.54, drag.startH + (drag.startY - e.clientY)));
      this.drawerHeight = Math.round(nextH);
      drawer.style.height = `${this.drawerHeight}px`;
      this.schematicCanvas.resize();
      this.scopeView.resize();
      this.bodeView.resize();
    });

    resizer.addEventListener('pointerup', () => { drag = null; });
  }

  // -------------------------------------------------------------------------
  // Quick Command Sheet (Ctrl+K)
  // -------------------------------------------------------------------------

  _bindCommandPalette() {
    const overlay = document.getElementById('cmd-overlay');
    const input = document.getElementById('cmd-input');
    if (!overlay || !input) return;

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this._closeCommandPalette();
    });

    input.addEventListener('input', () => {
      this._cmdIndex = 0;
      this._renderCommandResults(input.value);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this._closeCommandPalette();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        this._cmdIndex = Math.min(this._cmdItems.length - 1, this._cmdIndex + 1);
        this._highlightCommandRow();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this._cmdIndex = Math.max(0, this._cmdIndex - 1);
        this._highlightCommandRow();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = this._cmdItems[this._cmdIndex];
        if (item) {
          this._closeCommandPalette();
          item.run();
        }
      }
    });
  }

  _openCommandPalette() {
    this._closeAllMenus();
    const overlay = document.getElementById('cmd-overlay');
    const input = document.getElementById('cmd-input');
    if (!overlay || !input) return;
    overlay.classList.add('open');
    input.value = '';
    this._cmdIndex = 0;
    this._renderCommandResults('');
    requestAnimationFrame(() => input.focus());
  }

  _closeCommandPalette() {
    document.getElementById('cmd-overlay')?.classList.remove('open');
  }

  _renderCommandResults(query) {
    const q = query.trim().toLowerCase();
    const items = [];

    for (const type of ALL_PART_TYPES) {
      const def = COMPONENT_DEFS[type];
      if (!def) continue;
      const label = compLabel(type);
      const hay = `${label} ${def.name} ${def.category} ${type}`.toLowerCase();
      if (!q || hay.includes(q)) {
        items.push({
          title: label,
          cat: def.category,
          icon: getComponentSVG(type),
          run: () => {
            if (this.mode !== 'studio') this.setMode('studio');
            this.store.setTool(`place:${type}`);
          },
        });
      }
    }

    for (const p of PRESET_CIRCUITS) {
      const subCat = presetCategoryLabel(p.category);
      if (!q || `${p.name} ${p.category} ${subCat} circuit`.toLowerCase().includes(q)) {
        items.push({
          title: p.name,
          cat: subCat,
          icon: uiIcon('folder'),
          run: () => this.openPresetInStudio(p.id),
        });
      }
    }

    for (const l of LESSONS) {
      const lName = `${l.number}. ${loc(l.title)}`;
      if (!q || `${lName} ${l.title.en} ${l.title.tr} learn lab chapter`.toLowerCase().includes(q)) {
        items.push({
          title: lName,
          cat: t('mode.learn'),
          icon: uiIcon('book') || uiIcon('lightbulb'),
          run: () => {
            this.setMode('learn');
            this.loadLesson(l.id);
          },
        });
      }
    }

    this._cmdItems = items.slice(0, 14);
    const list = document.getElementById('cmd-results');
    if (!list) return;
    list.innerHTML = '';

    if (this._cmdItems.length === 0) {
      list.innerHTML = `<div class="cmd-row" style="opacity:0.55;cursor:default;">${t('cmd.empty')}</div>`;
      return;
    }

    this._cmdItems.forEach((item, idx) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `cmd-row${idx === this._cmdIndex ? ' selected' : ''}`;
      row.innerHTML = `
        <span class="cmd-row-sym">${item.icon}</span>
        <span class="cmd-row-main">${item.title}</span>
        <span class="cmd-row-cat mono">${item.cat}</span>
      `;
      row.addEventListener('click', () => {
        this._closeCommandPalette();
        item.run();
      });
      list.appendChild(row);
    });
  }

  _highlightCommandRow() {
    document.querySelectorAll('#cmd-results .cmd-row').forEach((r, i) => {
      r.classList.toggle('selected', i === this._cmdIndex);
      if (i === this._cmdIndex) r.scrollIntoView({ block: 'nearest' });
    });
  }

  // -------------------------------------------------------------------------
  // Keyboard Shortcuts
  // -------------------------------------------------------------------------

  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this._openCommandPalette();
        return;
      }

      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const k = e.key.toLowerCase();

      if (k === 'escape') {
        this._closeAllMenus();
        this._closeCommandPalette();
        this.learnCtrl.closePopovers();
        document.getElementById('help-overlay')?.classList.remove('open');
        this.schematicCanvas.cancelActiveTool();
        this.store.setTool('select');
        this.store.clearSelection();
        return;
      }

      if (e.key === '?') {
        e.preventDefault();
        document.getElementById('help-overlay')?.classList.toggle('open');
        return;
      }

      if (k === ' ') {
        e.preventDefault();
        this.running = !this.running;
        this._syncPlayButtons();
        return;
      }

      if (k === '0') {
        this._fitView();
        return;
      }

      if (this.mode !== 'studio') return;

      if ((e.ctrlKey || e.metaKey) && k === 'z') {
        e.preventDefault();
        if (e.shiftKey) this.store.redo();
        else this.store.undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && k === 'y') {
        e.preventDefault();
        this.store.redo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && k === 'd') {
        e.preventDefault();
        this.store.duplicateSelected();
        return;
      }
      if (k === 'b') {
        this._setPartsOpen(!this.partsOpen, false);
        return;
      }
      if (k === 'delete' || k === 'backspace') {
        e.preventDefault();
        this.store.deleteSelected();
        return;
      }
      if (k === 'r') {
        if (this.store.tool === 'wire') this.schematicCanvas.flipWireCorner();
        else if (this.store.selectedIds.size > 0 || this.store.tool.startsWith('place:')) {
          this.store.rotateSelected(90);
        } else {
          this.store.setTool('place:resistor');
        }
        return;
      }
      if (k === 'f') {
        this.store.flipSelected();
        return;
      }

      const quickTools = {
        v: 'select',
        w: 'wire',
        x: 'delete',
        c: 'place:capacitor',
        l: 'place:inductor',
        d: 'place:diode',
        g: 'place:ground',
        s: 'place:voltage_source',
        p: 'place:probe',
        a: 'place:opamp',
        q: 'place:npn',
        m: 'place:nmos',
        o: 'place:potentiometer',
      };
      if (quickTools[k]) this.store.setTool(quickTools[k]);
    });
  }

  // -------------------------------------------------------------------------
  // Store & Physics Lifecycle
  // -------------------------------------------------------------------------

  _onStoreChange(kind) {
    this._syncToolButtons();
    this._syncUndoRedo();

    if (kind === 'tool') return;

    if (kind === 'selection') {
      this.inspector.renderStructure(this.netlist, this.simulator, this.mode);
      requestAnimationFrame(() => {
        this.schematicCanvas.render(0, false);
      });
      return;
    }

    if (kind === 'param') {
      this.simulator?.notifyDiscontinuity();
      if (this.mode === 'studio') this.workspace.snapshotActiveTab(true);
      this._scheduleACAndSpiceRefresh();
      return;
    }

    const isFullLoad = kind === 'load';
    this._recompileAndReset(isFullLoad);
    if (kind === 'topology' && this.mode === 'studio') {
      this.workspace.snapshotActiveTab(true);
    }
  }

  _recompileAndReset(resetConfig = false) {
    const sch = this.store.schematic;
    this.netlist = compileNetlist(sch);
    this.simulator = new TransientSimulator(this.netlist, sch.simConfig);
    this.schematicCanvas.setSimulation(this.netlist, this.simulator);

    if (resetConfig && sch.simConfig) {
      this.simRate = sch.simConfig.simRate || 0.005;
      const speedSlider = document.getElementById('sim-speed');
      if (speedSlider) speedSlider.value = String(Math.log10(Math.max(1e-4, Math.min(1, this.simRate))));
      this._updateSpeedLabel();

      this.scopeView.configure(sch.simConfig);
      this._syncScopeControlPills();
    }

    this.inspector.renderStructure(this.netlist, this.simulator, this.mode);
    this._buildNodesGrid();
    this._renderDiagnostics();
    this._scheduleACAndSpiceRefresh();
  }

  _scheduleACAndSpiceRefresh() {
    clearTimeout(this._bodeTimer);
    this._bodeTimer = setTimeout(() => {
      if (this.drawerOpen && this.activeInstrument === 'bode') this._runACAnalysis();
      if (this.drawerOpen && this.activeInstrument === 'spice') this._refreshSpiceDeck();
    }, 35);
  }

  _runACAnalysis() {
    if (!this.netlist) return;
    const range = BODE_RANGES[this.bodeRangeIdx] || BODE_RANGES[1];
    this.lastAC = runACSweep(this.netlist, { fStart: range.fStart, fStop: range.fStop, points: 201 });
    this.bodeView.setData(this.lastAC);

    const sumEl = document.getElementById('bode-summary');
    if (sumEl && this.lastAC.ok && this.lastAC.channels.length > 0) {
      const ch = this.lastAC.channels[this.lastAC.channels.length - 1];
      const parts = [`${ch.label}: ${ch.metrics.dcGainDb.toFixed(1)} dB`];
      if (ch.metrics.cutoffs[0]) parts.push(`−3dB @ ${formatSI(ch.metrics.cutoffs[0].freq, 'Hz', 3)}`);
      if (ch.metrics.hasResonantPeak) parts.push(`f₀ ${formatSI(ch.metrics.peakFreq, 'Hz', 3)}`);
      sumEl.textContent = parts.join('  ·  ');
    } else if (sumEl) {
      sumEl.textContent = '';
    }
  }

  _buildNodesGrid() {
    const grid = document.getElementById('nodes-grid');
    if (!grid || !this.netlist) return;
    grid.innerHTML = '';
    this._nodeValRefs.clear();

    for (let n = 0; n < this.netlist.numNodes; n++) {
      const card = document.createElement('div');
      card.className = 'node-card';
      card.innerHTML = `<span class="n-name mono">${this.netlist.nodeNames[n] || 'N' + n}</span><span class="n-val mono">0.00 V</span>`;
      grid.appendChild(card);
      this._nodeValRefs.set(n, card.querySelector('.n-val'));
    }
  }

  _updateNodesGrid() {
    if (!this.simulator?.lastEvaluation || !this.netlist) return;
    const ev = this.simulator.lastEvaluation;
    const sum = document.getElementById('solver-summary');
    if (sum) {
      const kcl = ev.maxKclResidual < 1e-14 ? '<1e-14 A' : `${ev.maxKclResidual.toExponential(1)} A`;
      sum.textContent = `t = ${formatSI(this.simulator.time, 's', 3)}  ·  P = ${formatSI(ev.totalPower, 'W', 3)}  ·  KCL ${kcl}  ·  ${this.netlist.matrixSize}×${this.netlist.matrixSize}`;
    }
    for (const [n, el] of this._nodeValRefs.entries()) {
      if (n >= ev.nodeVoltages.length) continue;
      const v = ev.nodeVoltages[n];
      el.textContent = formatSignedVoltage(v).trim();
      el.classList.toggle('pos', v > 0.15);
      el.classList.toggle('neg', v < -0.15);
    }
  }

  _refreshSpiceDeck() {
    const el = document.getElementById('spice-deck-code');
    if (!el || !this.netlist) return;
    el.textContent = exportSpiceNetlist(
      this.store.schematic,
      this.netlist,
      this.store.schematic.simConfig
    );
  }

  // -------------------------------------------------------------------------
  // Quiet Telemetry Readout & Diagnostics
  // -------------------------------------------------------------------------

  _renderHoverHud() {
    const hud = document.getElementById('hud-probe');
    if (!hud || !this.simulator?.lastEvaluation || !this.netlist) return;

    const ev = this.simulator.lastEvaluation;
    const { compId, segIndex } = this.hoverInfo;

    if (compId) {
      const comp = this.store.getComponent(compId);
      const tel = ev.compTelemetry.get(compId);
      if (comp && tel) {
        const parts = [`<span class="h-tag">${comp.designator}</span>`];
        if (comp.type === 'probe') {
          parts.push(`<span class="${tel.voltage >= 0 ? 'h-pos' : 'h-neg'}">${formatSignedVoltage(tel.voltage).trim()}</span>`);
        } else if (comp.type !== 'ground') {
          parts.push(`<span>${formatSignedVoltage(tel.voltage || 0).trim()}</span>`);
          parts.push(`<span class="h-dim">·</span>`);
          parts.push(`<span>${formatSI(tel.current || 0, 'A', 3)}</span>`);
          if (tel.region) parts.push(`<span class="h-dim">· ${tel.region}</span>`);
          else if (tel.state) parts.push(`<span class="h-dim">· ${tel.state}</span>`);
        }
        hud.innerHTML = parts.join(' ');
        hud.classList.remove('hidden');
        return;
      }
    }

    if (segIndex >= 0 && segIndex < this.netlist.segments.length) {
      const seg = this.netlist.segments[segIndex];
      const v = ev.nodeVoltages[seg.node] || 0;
      const i = this.simulator.segmentCurrents?.[seg.index] || 0;
      const name = this.netlist.nodeNames[seg.node] || `N${seg.node}`;
      hud.innerHTML = `<span class="h-tag">${name}</span> <span class="${v >= 0 ? 'h-pos' : 'h-neg'}">${formatSignedVoltage(v).trim()}</span> <span class="h-dim">·</span> <span>${formatSI(Math.abs(i), 'A', 3)}</span>`;
      hud.classList.remove('hidden');
      return;
    }

    hud.classList.add('hidden');
  }

  _renderScopeStats(stats) {
    const host = document.getElementById('scope-stats');
    if (!host) return;
    if (!stats || stats.length === 0) {
      host.innerHTML = `<span class="inst-summary">${t('inst.noProbes')}</span>`;
      return;
    }
    host.innerHTML = stats
      .map((s) => {
        const fTxt = s.freq ? ` · ${formatSI(s.freq, 'Hz', 3)}` : '';
        return `<span class="scope-ch-chip" style="--ch-col:${s.color}"><span class="ch-dot"></span><span class="ch-lbl">${s.label}</span><span class="ch-val">${s.vpp.toFixed(2)}Vpp${fTxt}</span></span>`;
      })
      .join('');
  }

  _renderDiagnostics() {
    const box = document.getElementById('hud-diag');
    if (!box || !this.netlist) return;
    const warnings = this.netlist.diagnostics || [];
    if (warnings.length === 0) {
      box.classList.add('hidden');
      box.textContent = '';
      return;
    }
    box.textContent = warnings[0].message;
    box.classList.remove('hidden');
  }

  // -------------------------------------------------------------------------
  // Main 60 FPS Simulation & Render Loop
  // -------------------------------------------------------------------------

  _tick(nowMs) {
    const dtFrame = Math.min(0.05, Math.max(0.001, (nowMs - this._lastFrameMs) / 1000));
    this._lastFrameMs = nowMs;

    if (this.running && this.simulator) {
      const simDt = Math.max(1e-6, this.simulator.dt || 2e-5);
      const targetSteps = Math.max(1, Math.round((dtFrame * this.simRate) / simDt));
      const steps = Math.min(240, targetSteps);
      const recordEvery = Math.max(1, Math.floor(steps / 40));
      this.simulator.advance(steps, simDt, recordEvery);
    }

    this.schematicCanvas.render(dtFrame, this.running);

    if (this.drawerOpen && this.activeInstrument === 'scope' && this.simulator && this.netlist) {
      this.scopeView.render(this.simulator, this.netlist.probes);
    }

    if (this.audio.enabled && this.simulator && this.netlist) {
      this.audio.updateFromSimulator(this.simulator, this.netlist.probes);
    }

    if (nowMs - this._lastHudMs > 65) {
      this._lastHudMs = nowMs;
      const clock = document.getElementById('sim-clock');
      if (clock && this.simulator) {
        clock.textContent = formatSI(this.simulator.time, 's', 2);
      }
      this._renderHoverHud();

      if (this.mode === 'studio') {
        this.inspector.updateLiveTelemetry(this.netlist, this.simulator);
      } else if (this.simulator?.lastEvaluation) {
        this.learnCtrl.evaluate({
          schematic: this.store.schematic,
          netlist: this.netlist,
          simulator: this.simulator,
          eval: {
            ...this.simulator.lastEvaluation,
            compMetrics: this.simulator.lastEvaluation.compTelemetry,
          },
        });
      }

      if (this.drawerOpen && this.activeInstrument === 'nodes') {
        this._updateNodesGrid();
      }
    }

    requestAnimationFrame((ts) => this._tick(ts));
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.__wirebench = new WirebenchApp();
});
