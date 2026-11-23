/**
 * Wirebench Contextual Tactile Paper Inspector (Studio Mode).
 *
 * Luminous Atelier aesthetic:
 * - Appears cleanly on the right ONLY in Studio Mode when 1 component or wire is selected.
 * - Warm sculpted paper card: editable designator, miniature illustrated symbol preview,
 *   clean 3-column live V / I / P micro-readout, silky sliders + SI inputs, transform stamps.
 * - Wire selection shows Net Node potential + 1-click "Attach Scope Probe".
 */

import { COMPONENT_DEFS } from '../engine/components.js';
import { formatSI, formatSignedVoltage, parseSI } from '../engine/units.js';
import { getComponentSVG, getToolSVG } from './symbols.js';
import { uiIcon } from './icons.js';
import { t, compLabel } from './i18n.js';

function sliderFromValue(val, pDef) {
  const min = pDef.min ?? 0;
  const max = pDef.max ?? 100;
  if (pDef.log && min > 0 && max > min) {
    const clamped = Math.max(min, Math.min(max, val || min));
    return (Math.log10(clamped) - Math.log10(min)) / (Math.log10(max) - Math.log10(min));
  }
  return (Math.max(min, Math.min(max, val)) - min) / Math.max(1e-12, max - min);
}

function valueFromSlider(norm, pDef) {
  const n = Math.max(0, Math.min(1, norm));
  const min = pDef.min ?? 0;
  const max = pDef.max ?? 100;
  if (pDef.log && min > 0 && max > min) {
    const raw = Math.pow(10, Math.log10(min) + n * (Math.log10(max) - Math.log10(min)));
    const mag = Math.pow(10, Math.floor(Math.log10(raw)) - 2);
    return Math.round(raw / mag) * mag;
  }
  const raw = min + n * (max - min);
  if (pDef.step) return Math.round(raw / pDef.step) * pDef.step;
  return raw;
}

export class InspectorPanel {
  constructor(panelEl, store, callbacks = {}) {
    this.cardEl = panelEl;
    this.store = store;
    this.callbacks = callbacks;
    this._currentKey = null;
    this._liveRefs = null;
  }

  hide() {
    this._currentKey = null;
    this._liveRefs = null;
    if (!this.cardEl) return;
    this.cardEl.classList.remove('open');
    this.cardEl.innerHTML = '';
  }

  renderStructure(netlist, simulator, mode = 'studio') {
    if (!this.cardEl || mode !== 'studio') {
      this.hide();
      return;
    }

    const selIds = Array.from(this.store.selectedIds);
    if (selIds.length !== 1) {
      this.hide();
      return;
    }

    const selId = selIds[0];
    const comp = this.store.getComponent(selId);
    if (comp) {
      this._renderComponentInspector(comp, netlist, simulator);
      return;
    }

    const wire = this.store.schematic.wires.find((w) => w.id === selId);
    if (wire) {
      this._renderWireInspector(wire, netlist, simulator);
      return;
    }

    this.hide();
  }

  _renderWireInspector(wire, netlist, simulator) {
    const seg = netlist?.segments?.find((s) => s.wireId === wire.id) || null;
    const nodeIdx = seg ? seg.node : 0;
    const nodeName = netlist?.nodeNames?.[nodeIdx] || `N${nodeIdx}`;
    this._currentKey = `wire:${wire.id}:${nodeName}`;

    this.cardEl.classList.add('open');
    this.cardEl.innerHTML = `
      <div class="insp-head">
        <span class="insp-sym">${getToolSVG('wire')}</span>
        <div class="insp-titles">
          <div class="insp-wire-title mono" id="insp-wire-name"></div>
          <span class="insp-type">${t('insp.node')}</span>
        </div>
        <button type="button" class="stamp-ico xs" id="insp-close" aria-label="${t('inst.collapse')}">${uiIcon('close')}</button>
      </div>
      <div class="insp-wire-row">
        <span class="p-lbl">${t('insp.nodePotential')}</span>
        <strong class="mono" id="insp-node-v">0.00 V</strong>
      </div>
      <div class="insp-wire-act">
        <button type="button" class="atelier-btn hw-btn primary full" id="insp-attach-probe">${t('insp.nodeAttach')}</button>
      </div>
      <div class="insp-foot">
        <div class="spacer"></div>
        <button type="button" class="stamp-ico xs danger" id="insp-del" title="${t('insp.delete')}">${uiIcon('trash')}</button>
      </div>
    `;

    const nameEl = this.cardEl.querySelector('#insp-wire-name');
    if (nameEl) nameEl.textContent = nodeName;

    this.cardEl.querySelector('#insp-close')?.addEventListener('click', () => this.store.clearSelection());
    this.cardEl.querySelector('#insp-del')?.addEventListener('click', () => this.store.deleteSelected());
    this.cardEl.querySelector('#insp-attach-probe')?.addEventListener('click', () => {
      this.callbacks.onAttachProbeToWire?.(wire);
    });

    this._liveRefs = {
      kind: 'wire',
      nodeIdx,
      vEl: this.cardEl.querySelector('#insp-node-v'),
    };
    this.updateLiveTelemetry(netlist, simulator);
  }

  _renderComponentInspector(comp, netlist, simulator) {
    const def = COMPONENT_DEFS[comp.type];
    if (!def) {
      this.hide();
      return;
    }

    const visSig = (def.params || [])
      .map((p) => (p.visibleWhen ? (p.visibleWhen(comp.params) ? '1' : '0') : '1'))
      .join('');
    this._currentKey = `comp:${comp.id}:${visSig}`;

    this.cardEl.classList.add('open');
    this.cardEl.innerHTML = `
      <div class="insp-head">
        <span class="insp-sym">${getComponentSVG(comp.type)}</span>
        <div class="insp-titles">
          <input class="insp-desig mono" id="insp-desig" spellcheck="false" aria-label="Designator" />
          <span class="insp-type">${compLabel(comp.type)}</span>
        </div>
        <button type="button" class="stamp-ico xs" id="insp-close" aria-label="${t('inst.collapse')}">${uiIcon('close')}</button>
      </div>
      ${comp.type !== 'ground' ? `
      <div class="insp-readout mono">
        <div class="ir-col"><span>${t('insp.voltage')}</span><strong id="im-v">-</strong></div>
        <div class="ir-col"><span>${t('insp.current')}</span><strong id="im-i">-</strong></div>
        <div class="ir-col"><span>${t('insp.power')}</span><strong id="im-p">-</strong></div>
      </div>` : ''}
      <div class="insp-params" id="insp-params"></div>
      <div class="insp-foot">
        <button type="button" class="stamp-ico xs" id="insp-rot" title="${t('insp.rotate')}">${uiIcon('rotate')}</button>
        <button type="button" class="stamp-ico xs" id="insp-flip" title="${t('insp.flip')}">${uiIcon('flip')}</button>
        <button type="button" class="stamp-ico xs" id="insp-dup" title="${t('insp.duplicate')}">${uiIcon('copy')}</button>
        <div class="spacer"></div>
        <button type="button" class="stamp-ico xs danger" id="insp-del" title="${t('insp.delete')}">${uiIcon('trash')}</button>
      </div>
    `;

    const desigInput = this.cardEl.querySelector('#insp-desig');
    if (desigInput) {
      desigInput.value = comp.designator || '';
      desigInput.addEventListener('change', () => {
        const cleaned = desigInput.value.trim().slice(0, 14);
        if (cleaned) this.store.setComponentDesignator(comp.id, cleaned);
        else desigInput.value = comp.designator;
      });
    }

    this.cardEl.querySelector('#insp-close')?.addEventListener('click', () => this.store.clearSelection());
    this.cardEl.querySelector('#insp-rot')?.addEventListener('click', () => this.store.rotateSelected(90));
    this.cardEl.querySelector('#insp-flip')?.addEventListener('click', () => this.store.flipSelected());
    this.cardEl.querySelector('#insp-dup')?.addEventListener('click', () => this.store.duplicateSelected());
    this.cardEl.querySelector('#insp-del')?.addEventListener('click', () => this.store.deleteSelected());

    const paramsEl = this.cardEl.querySelector('#insp-params');
    const visibleParams = (def.params || []).filter((p) => !p.visibleWhen || p.visibleWhen(comp.params));
    if (visibleParams.length === 0) {
      paramsEl.style.display = 'none';
    } else {
      for (const pDef of visibleParams) {
        paramsEl.appendChild(this._buildParamControl(comp, pDef, netlist, simulator));
      }
    }

    this._liveRefs = {
      kind: 'comp',
      compId: comp.id,
      vEl: this.cardEl.querySelector('#im-v'),
      iEl: this.cardEl.querySelector('#im-i'),
      pEl: this.cardEl.querySelector('#im-p'),
    };
    this.updateLiveTelemetry(netlist, simulator);
  }

  _buildParamControl(comp, pDef, netlist, simulator) {
    const row = document.createElement('div');
    row.className = 'p-row';
    const curVal = comp.params[pDef.key];

    if (pDef.kind === 'text') {
      row.innerHTML = `<div class="p-head"><span class="p-lbl">${pDef.label}</span></div>`;
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'p-input';
      input.value = String(curVal ?? '');
      input.addEventListener('input', () => {
        this.store.updateComponentParam(comp.id, pDef.key, input.value, false);
        this.callbacks.onLiveParamChange?.();
      });
      row.appendChild(input);
      return row;
    }

    if (pDef.kind === 'select') {
      row.innerHTML = `<div class="p-head"><span class="p-lbl">${pDef.label}</span></div>`;
      const sel = document.createElement('select');
      sel.className = 'p-select';
      for (const opt of pDef.options) {
        const o = document.createElement('option');
        o.value = String(opt.value);
        o.textContent = opt.label;
        if (String(curVal) === String(opt.value)) o.selected = true;
        sel.appendChild(o);
      }
      sel.addEventListener('change', () => {
        const matched = pDef.options.find((o) => String(o.value) === sel.value);
        const val = matched ? matched.value : sel.value;
        this.store.updateComponentParam(comp.id, pDef.key, val, true);
        this.callbacks.onLiveParamChange?.();
        this._renderComponentInspector(comp, netlist, simulator);
      });
      row.appendChild(sel);
      return row;
    }

    if (pDef.kind === 'toggle') {
      row.innerHTML = `<div class="p-head"><span class="p-lbl">${pDef.label}</span></div>`;
      const rocker = document.createElement('div');
      rocker.className = 'atelier-rocker hw-rocker full';
      rocker.innerHTML = `
        <button type="button" class="atelier-opt hw-opt" data-v="0">${pDef.offLabel || t('insp.off')}</button>
        <button type="button" class="atelier-opt hw-opt" data-v="1">${pDef.onLabel || t('insp.on')}</button>
      `;
      const btns = rocker.querySelectorAll('.atelier-opt');
      const sync = () => {
        const on = Boolean(comp.params[pDef.key]);
        btns[0].classList.toggle('active', !on);
        btns[1].classList.toggle('active', on);
      };
      sync();
      btns[0].addEventListener('click', () => {
        this.store.updateComponentParam(comp.id, pDef.key, false, true);
        sync();
        this.callbacks.onLiveParamChange?.();
      });
      btns[1].addEventListener('click', () => {
        this.store.updateComponentParam(comp.id, pDef.key, true, true);
        sync();
        this.callbacks.onLiveParamChange?.();
      });
      row.appendChild(rocker);
      return row;
    }

    if (pDef.kind === 'slider') {
      const fmt = pDef.format || ((v) => v.toFixed(2));
      row.innerHTML = `<div class="p-head"><span class="p-lbl">${pDef.label}</span><span class="p-val mono">${fmt(Number(curVal))}</span></div>`;
      const valSpan = row.querySelector('.p-val');
      const range = document.createElement('input');
      range.type = 'range';
      range.className = 'atelier-fader hw-fader';
      range.min = String(pDef.min ?? 0);
      range.max = String(pDef.max ?? 1);
      range.step = String(pDef.step ?? 0.01);
      range.value = String(curVal);
      range.addEventListener('input', () => {
        const v = Number(range.value);
        valSpan.textContent = fmt(v);
        this.store.updateComponentParam(comp.id, pDef.key, v, false);
        this.callbacks.onLiveParamChange?.();
      });
      row.appendChild(range);
      return row;
    }

    const unit = pDef.unit || '';
    const head = document.createElement('div');
    head.className = 'p-head';
    head.innerHTML = `<span class="p-lbl">${pDef.label}</span>`;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'p-input compact mono';
    input.value = unit ? formatSI(Number(curVal), unit, 4) : String(curVal);
    head.appendChild(input);
    row.appendChild(head);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'atelier-fader hw-fader';
    slider.min = '0';
    slider.max = '1';
    slider.step = '0.002';
    slider.value = String(sliderFromValue(Number(curVal), pDef));
    row.appendChild(slider);

    slider.addEventListener('input', () => {
      const val = valueFromSlider(Number(slider.value), pDef);
      input.value = unit ? formatSI(val, unit, 4) : String(val);
      this.store.updateComponentParam(comp.id, pDef.key, val, false);
      this.callbacks.onLiveParamChange?.();
    });

    const commitText = () => {
      const parsed = parseSI(input.value);
      if (parsed === null || !Number.isFinite(parsed)) {
        input.classList.add('invalid');
        return;
      }
      input.classList.remove('invalid');
      const lo = pDef.min ?? -1e12;
      const hi = pDef.max ?? 1e12;
      const clamped = Math.max(lo, Math.min(hi, parsed));
      input.value = unit ? formatSI(clamped, unit, 4) : String(clamped);
      slider.value = String(sliderFromValue(clamped, pDef));
      this.store.updateComponentParam(comp.id, pDef.key, clamped, true);
      this.callbacks.onLiveParamChange?.();
    };

    input.addEventListener('change', commitText);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        commitText();
        input.blur();
      }
    });

    return row;
  }

  updateLiveTelemetry(netlist, simulator) {
    if (!this._liveRefs || !simulator?.lastEvaluation) return;
    const ev = simulator.lastEvaluation;

    if (this._liveRefs.kind === 'wire') {
      const v = ev.nodeVoltages?.[this._liveRefs.nodeIdx] ?? 0;
      if (this._liveRefs.vEl) {
        this._liveRefs.vEl.textContent = formatSignedVoltage(v).trim();
        this._liveRefs.vEl.classList.toggle('pos', v > 0.15);
        this._liveRefs.vEl.classList.toggle('neg', v < -0.15);
      }
      return;
    }

    const tel = ev.compTelemetry?.get(this._liveRefs.compId);
    if (!tel) return;
    if (this._liveRefs.vEl) this._liveRefs.vEl.textContent = formatSignedVoltage(tel.voltage || 0).trim();
    if (this._liveRefs.iEl) this._liveRefs.iEl.textContent = formatSI(tel.current || 0, 'A', 3);
    if (this._liveRefs.pEl) this._liveRefs.pEl.textContent = formatSI(Math.abs(tel.power || 0), 'W', 3);
  }
}
