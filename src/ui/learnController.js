/**
 * Wirebench Learn Mode Controller (v5 - Luminous Atelier Storybook Ribbon)
 *
 * Visual-first, calm, tactile learning:
 * - Top chapter stones (`#learn-stepper`): 1..6 with botanical checkmarks & active chapter title.
 * - Single floating sculpted ivory ribbon (`#learn-bar`) at bottom-center - ZERO nested cards!
 * - Progressive disclosure: live formula stays tucked behind a quiet optional `fx` button.
 * - Strictly live physics truth: `Continue →` activates ONLY while `step.check(ctx)` is currently true.
 */

import { LESSONS, getLessonById } from '../presets/lessons.js';
import { formatSI } from '../engine/units.js';
import { uiIcon } from './icons.js';
import { t, loc } from './i18n.js';

const STORAGE_KEY = 'wirebench.learn.progress.v5';
const LEGACY_KEY = 'wirebench.learn.progress.v4';

const STAR_SVG = `<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 1.4l1.95 3.95 4.35.63-3.15 3.07.74 4.33L8 11.33l-3.89 2.05.74-4.33L1.7 5.98l4.35-.63L8 1.4z"/></svg>`;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function sliderToVal(norm, ctrl) {
  const n = clamp(norm, 0, 1);
  if (ctrl.log) {
    const lo = Math.log10(Math.max(1e-12, ctrl.min));
    const hi = Math.log10(Math.max(ctrl.min * 1.1, ctrl.max));
    return Math.pow(10, lo + n * (hi - lo));
  }
  const raw = ctrl.min + n * (ctrl.max - ctrl.min);
  if (ctrl.step) return Math.round(raw / ctrl.step) * ctrl.step;
  return raw;
}

function valToSlider(val, ctrl) {
  if (ctrl.log) {
    const lo = Math.log10(Math.max(1e-12, ctrl.min));
    const hi = Math.log10(Math.max(ctrl.min * 1.1, ctrl.max));
    const v = clamp(val, ctrl.min, ctrl.max);
    return clamp((Math.log10(Math.max(1e-12, v)) - lo) / (hi - lo), 0, 1);
  }
  return clamp((val - ctrl.min) / (ctrl.max - ctrl.min), 0, 1);
}

function formatCtrlValue(val, ctrl) {
  if (ctrl.scale === 100 && ctrl.unit === '%') return `${Math.round(val * 100)}%`;
  if (ctrl.unit === 'Ω' || ctrl.unit === 'F' || ctrl.unit === 'H') return formatSI(val, ctrl.unit, 3);
  if (ctrl.unit === 'V') return `${Number(val).toFixed(1)} V`;
  return `${Number(val).toFixed(2)} ${ctrl.unit || ''}`.trim();
}

export class LearnController {
  /**
   * @param {HTMLElement} stepperEl - Top 6-chapter storybook stones (#learn-stepper)
   * @param {HTMLElement} barEl - Floating bottom Storybook Ribbon (#learn-bar)
   * @param {object} callbacks
   */
  constructor(stepperEl, barEl, callbacks = {}) {
    this.stepperEl = stepperEl;
    this.barEl = barEl;
    this.callbacks = callbacks;

    this.activeLessonId = LESSONS[0].id;
    this.activeStepIdx = 0;
    this.completedLessons = this._loadProgress();
    this.completedSteps = new Set();
    this.testedTruthRows = new Set();
    this._hintOpen = false;
    this._fxOpen = false;
    this._livePassed = false;
    this._lastSchematic = null;
    this._domRefs = null;
  }

  _loadProgress() {
    try {
      if (typeof localStorage === 'undefined') return new Set();
      const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch {
      return new Set();
    }
  }

  _saveProgress() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.completedLessons]));
      }
    } catch {
      // Ignore storage errors
    }
  }

  getActiveLesson() {
    return getLessonById(this.activeLessonId);
  }

  setActiveLesson(id, schematic = null) {
    this.activeLessonId = id;
    this.activeStepIdx = 0;
    this.completedSteps.clear();
    this.testedTruthRows.clear();
    this._hintOpen = false;
    this._fxOpen = false;
    this._livePassed = false;
    this._lastSchematic = schematic;
    this.renderStepper();
    this.renderBar(schematic);
    this._emitSpotlight();
  }

  refreshLanguage(schematic = null) {
    if (schematic) this._lastSchematic = schematic;
    this.renderStepper();
    this.renderBar(this._lastSchematic);
    this._emitSpotlight();
  }

  closePopovers() {
    if (!this._hintOpen && !this._fxOpen) return;
    this._hintOpen = false;
    this._fxOpen = false;
    this._syncDisclosurePopovers();
  }

  _syncDisclosurePopovers() {
    if (!this.barEl) return;
    this.barEl.querySelector('#lb-hint-pop')?.classList.toggle('open', this._hintOpen);
    this.barEl.querySelector('#lb-hint-btn')?.classList.toggle('active', this._hintOpen);
    this.barEl.querySelector('#lb-fx-pop')?.classList.toggle('open', this._fxOpen);
    this.barEl.querySelector('#lb-fx-btn')?.classList.toggle('active', this._fxOpen);
  }

  _emitSpotlight() {
    const lesson = this.getActiveLesson();
    const step = lesson.goals[this.activeStepIdx];
    if (!step || this._livePassed) {
      this.callbacks.onSpotlightChange?.(null, '');
      return;
    }
    this.callbacks.onSpotlightChange?.(step.targetCompId || null, loc(step.callout));
  }

  renderStepper() {
    if (!this.stepperEl) return;
    this.stepperEl.innerHTML = '';

    for (const lesson of LESSONS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      const active = lesson.id === this.activeLessonId;
      const done = this.completedLessons.has(lesson.id);
      const label = loc(lesson.title);
      btn.className = `chapter-stone${active ? ' active' : ''}${done ? ' done' : ''}`;
      btn.title = `${lesson.number} · ${label}`;
      btn.setAttribute('aria-label', `${lesson.number}. ${label}`);
      if (active) btn.setAttribute('aria-current', 'step');

      const badge = done
        ? `<span class="chapter-check" aria-hidden="true">${uiIcon('check')}</span>`
        : `<span class="chapter-num">${lesson.number}</span>`;

      btn.innerHTML = active
        ? `${badge}<span class="chapter-name">${label}</span>`
        : badge;

      btn.addEventListener('click', () => this.callbacks.onSelectLesson?.(lesson.id));
      this.stepperEl.appendChild(btn);
    }
  }

  renderBar(schematic = null) {
    if (!this.barEl) return;
    if (schematic) this._lastSchematic = schematic;
    const sch = this._lastSchematic;
    const lesson = this.getActiveLesson();
    const total = lesson.goals.length;
    const step = lesson.goals[Math.min(this.activeStepIdx, total - 1)];
    const idx = LESSONS.findIndex((l) => l.id === lesson.id);
    const nextLesson = LESSONS[idx + 1] || null;

    const stepDots = lesson.goals
      .map((g, i) => {
        const cls = i === this.activeStepIdx ? 'active' : this.completedSteps.has(g.id) ? 'done' : '';
        return `<button type="button" class="lb-dot ${cls}" data-step-idx="${i}" title="${loc(g.title)}" aria-label="${loc(g.title)}"></button>`;
      })
      .join('');

    this.barEl.innerHTML = `
      <div class="lb-hint-pop${this._hintOpen ? ' open' : ''}" id="lb-hint-pop">${loc(step.hint)}</div>
      ${lesson.liveFormula ? `
      <div class="lb-fx-pop${this._fxOpen ? ' open' : ''}" id="lb-fx-pop">
        <span class="lb-fx-title">${t('learn.formula')}</span>
        <div id="lb-fx-expr">-</div>
        <div id="lb-fx-note" style="font-family:var(--font-sans);font-size:11.5px;color:var(--ink-soft);margin-top:4px;"></div>
      </div>` : ''}

      <div class="lb-story">
        <div class="lb-pips-row">
          <div class="lb-dots">${stepDots}</div>
          <span class="lb-step-idx mono">${this.activeStepIdx + 1}/${total}</span>
          <span class="lb-status-dot${this._livePassed ? ' passed' : ''}" id="lb-status-dot" aria-hidden="true"></span>
        </div>
        <div class="lb-prompt${this._livePassed ? ' passed' : ''}" id="lb-sub">${this._livePassed ? loc(step.insight) : loc(step.prompt)}</div>
      </div>

      <div class="lb-play">
        <div class="lb-controls" id="lb-controls"></div>
        ${step.meter ? `
        <div class="lb-meter" id="lb-meter">
          <div class="lb-meter-track">
            <div class="lb-meter-zone" id="lb-meter-zone">
              <span class="lb-meter-star" aria-hidden="true">${STAR_SVG}</span>
            </div>
            ${step.meter.dangerMin !== undefined ? `<div class="lb-meter-danger" id="lb-meter-danger"></div>` : ''}
            <div class="lb-meter-bar" id="lb-meter-bar"></div>
            <div class="lb-meter-needle" id="lb-meter-needle"></div>
          </div>
          <div class="lb-meter-row mono">
            <span id="lb-meter-val" class="lb-meter-val">-</span>
            <span class="lb-meter-target">${t('learn.target')} · ${step.meter.targetMin}–${step.meter.targetMax} ${step.meter.unit}</span>
          </div>
        </div>` : ''}
        ${lesson.hasTruthTable ? `
        <div class="lb-truth mono" id="lb-truth">
          <span class="tt-cell" data-row="00">0+0=<b>00</b></span>
          <span class="tt-cell" data-row="01">0+1=<b>01</b></span>
          <span class="tt-cell" data-row="10">1+0=<b>01</b></span>
          <span class="tt-cell" data-row="11">1+1=<b>10</b></span>
        </div>` : ''}
      </div>

      <div class="lb-cta">
        <button type="button" class="lb-next-btn${this._livePassed ? ' ready' : ''}" id="lb-next-btn" ${this._livePassed ? '' : 'disabled'}>
          <span>${this._nextLabel(lesson, nextLesson)}</span>
          ${uiIcon('arrowRight')}
        </button>
        <div class="lb-util-row">
          ${lesson.liveFormula ? `<button type="button" class="lb-mini-btn fx-btn${this._fxOpen ? ' active' : ''}" id="lb-fx-btn" title="${t('learn.formula')}" aria-expanded="${this._fxOpen ? 'true' : 'false'}">${t('learn.fx')}</button>` : ''}
          <button type="button" class="lb-mini-btn${this._hintOpen ? ' active' : ''}" id="lb-hint-btn" aria-expanded="${this._hintOpen ? 'true' : 'false'}">${t('learn.hint')}</button>
          <button type="button" class="lb-mini-btn" id="lb-reset-btn">${t('learn.resetLab')}</button>
          <button type="button" class="lb-mini-btn" id="lb-studio-btn">${t('learn.openStudio')} ↗</button>
        </div>
      </div>
    `;

    // Step pip navigation within current lab
    this.barEl.querySelectorAll('.lb-dot').forEach((d) => {
      d.addEventListener('click', () => {
        const target = Number(d.dataset.stepIdx);
        if (Number.isInteger(target) && target >= 0 && target < total && target !== this.activeStepIdx) {
          this.activeStepIdx = target;
          this._hintOpen = false;
          this._fxOpen = false;
          this._livePassed = false;
          this.renderBar(this._lastSchematic);
          this._emitSpotlight();
        }
      });
    });

    // Direct tactile controls synced 1:1 with canvas
    const ctrlHost = this.barEl.querySelector('#lb-controls');
    const ctrlRefs = [];
    if (step.controls && sch) {
      for (const ctrl of step.controls) {
        const comp = sch.components.find((c) => c.id === ctrl.compId);
        if (!comp) continue;
        const ref = this._buildControl(ctrlHost, comp, ctrl);
        if (ref) ctrlRefs.push(ref);
      }
    }

    // Sweet-spot star zone & overload blush zone
    if (step.meter) {
      const span = Math.max(1e-9, step.meter.max - step.meter.min);
      const zL = clamp(((step.meter.targetMin - step.meter.min) / span) * 100, 0, 100);
      const zW = clamp(((step.meter.targetMax - step.meter.targetMin) / span) * 100, 4, 100 - zL);
      const zEl = this.barEl.querySelector('#lb-meter-zone');
      if (zEl) {
        zEl.style.left = `${zL}%`;
        zEl.style.width = `${zW}%`;
      }
      if (step.meter.dangerMin !== undefined) {
        const dL = clamp(((step.meter.dangerMin - step.meter.min) / span) * 100, 0, 100);
        const dEl = this.barEl.querySelector('#lb-meter-danger');
        if (dEl) {
          dEl.style.left = `${dL}%`;
          dEl.style.width = `${100 - dL}%`;
        }
      }
    }

    // Progressive-disclosure toggles (Hint & optional fx formula)
    const fxBtn = this.barEl.querySelector('#lb-fx-btn');
    fxBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._fxOpen = !this._fxOpen;
      if (this._fxOpen) this._hintOpen = false;
      this._syncDisclosurePopovers();
      fxBtn.setAttribute('aria-expanded', String(this._fxOpen));
      this.barEl.querySelector('#lb-hint-btn')?.setAttribute('aria-expanded', 'false');
    });

    const hintBtn = this.barEl.querySelector('#lb-hint-btn');
    hintBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._hintOpen = !this._hintOpen;
      if (this._hintOpen) this._fxOpen = false;
      this._syncDisclosurePopovers();
      hintBtn.setAttribute('aria-expanded', String(this._hintOpen));
      fxBtn?.setAttribute('aria-expanded', 'false');
    });

    this.barEl.querySelector('#lb-reset-btn')?.addEventListener('click', () => {
      this.callbacks.onResetLesson?.(lesson.id);
    });

    this.barEl.querySelector('#lb-studio-btn')?.addEventListener('click', () => {
      this.callbacks.onOpenInStudio?.();
    });

    this.barEl.querySelector('#lb-next-btn')?.addEventListener('click', () => {
      if (!this._livePassed) return;
      if (this.activeStepIdx < total - 1) {
        this.activeStepIdx++;
        this._hintOpen = false;
        this._fxOpen = false;
        this._livePassed = false;
        this.renderBar(this._lastSchematic);
        this._emitSpotlight();
      } else if (nextLesson) {
        this.callbacks.onSelectLesson?.(nextLesson.id);
      } else {
        this.callbacks.onOpenInStudio?.();
      }
    });

    this._domRefs = {
      step,
      lesson,
      ctrlRefs,
      subEl: this.barEl.querySelector('#lb-sub'),
      dotEl: this.barEl.querySelector('#lb-status-dot'),
      nextBtn: this.barEl.querySelector('#lb-next-btn'),
      fxExprEl: this.barEl.querySelector('#lb-fx-expr'),
      fxNoteEl: this.barEl.querySelector('#lb-fx-note'),
      meterVal: this.barEl.querySelector('#lb-meter-val'),
      meterBar: this.barEl.querySelector('#lb-meter-bar'),
      meterNeedle: this.barEl.querySelector('#lb-meter-needle'),
    };
  }

  _nextLabel(lesson, nextLesson) {
    if (this.activeStepIdx < lesson.goals.length - 1) return t('learn.nextStep');
    if (nextLesson) return t('learn.nextLab');
    return t('learn.finishAll');
  }

  _buildControl(host, comp, ctrl) {
    const item = document.createElement('div');
    item.className = 'lb-ctrl';

    if (ctrl.kind === 'toggle') {
      item.innerHTML = `
        <span class="lb-ctrl-lbl">${loc(ctrl.label)}</span>
        <div class="atelier-rocker" role="group" aria-label="${loc(ctrl.label)}">
          <button type="button" class="atelier-opt" data-v="0">${t('insp.off')}</button>
          <button type="button" class="atelier-opt" data-v="1">${t('insp.on')}</button>
        </div>
      `;
      const btns = item.querySelectorAll('.atelier-opt');
      const sync = () => {
        const on = Boolean(comp.params[ctrl.param]);
        btns[0].classList.toggle('active', !on);
        btns[1].classList.toggle('active', on);
      };
      sync();
      btns[0].addEventListener('click', () => {
        this.callbacks.onParamChange?.(comp.id, ctrl.param, false);
        sync();
      });
      btns[1].addEventListener('click', () => {
        this.callbacks.onParamChange?.(comp.id, ctrl.param, true);
        sync();
      });
      host.appendChild(item);
      return { sync };
    }

    if (ctrl.kind === 'logic') {
      item.innerHTML = `
        <span class="lb-ctrl-lbl">${loc(ctrl.label)}</span>
        <div class="atelier-rocker mono" role="group" aria-label="${loc(ctrl.label)}">
          <button type="button" class="atelier-opt" data-v="0">0</button>
          <button type="button" class="atelier-opt" data-v="1">1</button>
        </div>
      `;
      const btns = item.querySelectorAll('.atelier-opt');
      const sync = () => {
        const hi = Number(comp.params[ctrl.param]) > 0;
        btns[0].classList.toggle('active', !hi);
        btns[1].classList.toggle('active', hi);
      };
      sync();
      btns[0].addEventListener('click', () => {
        this.callbacks.onParamChange?.(comp.id, ctrl.param, 0);
        sync();
      });
      btns[1].addEventListener('click', () => {
        this.callbacks.onParamChange?.(comp.id, ctrl.param, 1);
        sync();
      });
      host.appendChild(item);
      return { sync };
    }

    if (ctrl.kind === 'spdt') {
      item.innerHTML = `
        <span class="lb-ctrl-lbl">${loc(ctrl.label)}</span>
        <div class="atelier-rocker" role="group" aria-label="${loc(ctrl.label)}">
          <button type="button" class="atelier-opt" data-v="0">${loc(ctrl.optA)}</button>
          <button type="button" class="atelier-opt" data-v="1">${loc(ctrl.optB)}</button>
        </div>
      `;
      const btns = item.querySelectorAll('.atelier-opt');
      const sync = () => {
        const pos = Number(comp.params[ctrl.param]) === 1 ? 1 : 0;
        btns[0].classList.toggle('active', pos === 0);
        btns[1].classList.toggle('active', pos === 1);
      };
      sync();
      btns[0].addEventListener('click', () => {
        this.callbacks.onParamChange?.(comp.id, ctrl.param, 0);
        sync();
      });
      btns[1].addEventListener('click', () => {
        this.callbacks.onParamChange?.(comp.id, ctrl.param, 1);
        sync();
      });
      host.appendChild(item);
      return { sync };
    }

    if (ctrl.kind === 'slider') {
      item.classList.add('is-fader');
      item.innerHTML = `
        <div class="lb-fader-head">
          <span class="lb-ctrl-lbl">${loc(ctrl.label)}</span>
          <span class="lb-ctrl-val mono"></span>
        </div>
        <input class="atelier-fader" type="range" min="0" max="1" step="0.002" aria-label="${loc(ctrl.label)}" />
      `;
      const valEl = item.querySelector('.lb-ctrl-val');
      const slider = item.querySelector('.atelier-fader');
      const sync = () => {
        const cur = Number(comp.params[ctrl.param]);
        valEl.textContent = formatCtrlValue(cur, ctrl);
        if (document.activeElement !== slider) {
          slider.value = String(valToSlider(cur, ctrl));
        }
      };
      sync();
      slider.addEventListener('input', () => {
        const v = sliderToVal(Number(slider.value), ctrl);
        valEl.textContent = formatCtrlValue(v, ctrl);
        this.callbacks.onParamChange?.(comp.id, ctrl.param, v);
      });
      host.appendChild(item);
      return { sync };
    }

    return null;
  }

  /**
   * Evaluate live physics state - reflects REAL LIVE TRUTH every frame
   * (never displays false "Done" if the user flips a switch back off!).
   */
  evaluate(ctx) {
    if (!this._domRefs) return;
    const {
      step,
      lesson,
      ctrlRefs,
      subEl,
      dotEl,
      nextBtn,
      fxExprEl,
      fxNoteEl,
      meterVal,
      meterBar,
      meterNeedle,
    } = this._domRefs;
    this._lastSchematic = ctx.schematic;

    for (const ref of ctrlRefs) ref.sync();

    if (lesson.liveFormula && fxExprEl) {
      const f = lesson.liveFormula(ctx);
      if (f) {
        fxExprEl.textContent = loc(f.expr);
        if (fxNoteEl) fxNoteEl.textContent = f.note ? loc(f.note) : '';
      }
    }

    if (step.meter && meterVal && meterBar && meterNeedle) {
      const raw = step.meter.value(ctx);
      const v = Number.isFinite(raw) ? raw : 0;
      const span = Math.max(1e-9, step.meter.max - step.meter.min);
      const pct = clamp(((v - step.meter.min) / span) * 100, 0, 100);
      const inTarget = v >= step.meter.targetMin && v <= step.meter.targetMax;
      const isDanger = step.meter.dangerMin !== undefined && v >= step.meter.dangerMin;

      meterVal.textContent = `${v.toFixed(v < 10 ? 2 : 1)} ${step.meter.unit}`;
      meterVal.classList.toggle('good', inTarget);
      meterVal.classList.toggle('danger', isDanger);
      meterBar.style.width = `${pct}%`;
      meterBar.classList.toggle('good', inTarget);
      meterBar.classList.toggle('danger', isDanger);
      meterNeedle.style.left = `${pct}%`;
      meterNeedle.classList.toggle('good', inTarget);
      meterNeedle.classList.toggle('danger', isDanger);
    }

    if (lesson.hasTruthTable && this.barEl) {
      const a = Number(ctx.schematic?.components?.find((c) => c.id === 'inA')?.params?.state) > 0 ? 1 : 0;
      const b = Number(ctx.schematic?.components?.find((c) => c.id === 'inB')?.params?.state) > 0 ? 1 : 0;
      const rowKey = `${a}${b}`;
      this.testedTruthRows.add(rowKey);
      this.barEl.querySelectorAll('.tt-cell').forEach((cell) => {
        cell.classList.toggle('active', cell.dataset.row === rowKey);
        cell.classList.toggle('tested', this.testedTruthRows.has(cell.dataset.row));
      });
    }

    // Strictly live MNA check
    const nowPassed = Boolean(step.check(ctx));
    if (nowPassed !== this._livePassed) {
      this._livePassed = nowPassed;
      if (nowPassed) {
        this.completedSteps.add(step.id);
        const allDone = lesson.goals.every((g) => this.completedSteps.has(g.id));
        if (allDone && !this.completedLessons.has(lesson.id)) {
          this.completedLessons.add(lesson.id);
          this._saveProgress();
          this.renderStepper();
        }
      }
      if (dotEl) dotEl.classList.toggle('passed', nowPassed);
      if (nextBtn) {
        nextBtn.disabled = !nowPassed;
        nextBtn.classList.toggle('ready', nowPassed);
      }
      if (subEl) {
        subEl.textContent = nowPassed ? loc(step.insight) : loc(step.prompt);
        subEl.classList.toggle('passed', nowPassed);
      }
      this._emitSpotlight();
    }
  }
}
