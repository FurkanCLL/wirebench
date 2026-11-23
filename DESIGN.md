# Wirebench - Design System & Visual Direction (`Luminous Atelier`)

## 1. Creative Vision
Wirebench is **not** a cold CAD spreadsheet and **not** a dark-slate neon SaaS template.
It is a **warm, artistic, storybook-crafted electronics atelier** - inspired by **Studio Ghibli's sunlit inventor workshops**, **Monument Valley's tactile ceramic toys**, **Mini Motorways' effortless visual clarity**, and **handcrafted illustrated field journals**.

Every pixel follows four ironclad laws:
1. **Show, Don't Explain:** Visual state, motion, color, and charming illustrated component behavior carry 90% of communication. Text is radically minimal.
2. **Handcrafted Tactile Components:** Resistors carry real dynamic color bands on warm porcelain bodies; LEDs are glossy glass domes that glow like fireflies (and blush with tiny curly smoke wisps if overloaded); capacitors are miniature glass energy jars that visibly fill and drain with golden light; meters are vintage brass-rimmed analog needle dials; switches are clickable brass levers.
3. **Zero Line-Soup & Zero Card-ception:** Never slice the screen with rigid `1px` border grids or stack bordered boxes inside bordered boxes. Separate surfaces softly with warm tonal shifts, generous whitespace, and whisper-soft warm shadows.
4. **Warm Expressive Typography:** Pair a charming optical serif (**`Fraunces`** with soft/wonky axes) for brand & titles with warm humanist **`Plus Jakarta Sans`** for clean short UI labels and **`JetBrains Mono`** strictly for live measurements. Full Turkish diacritic support (`ğ ş ı İ ö ç ü`).

---

## 2. Color Worlds (Daylight Atelier & Starlight Atelier)

### Daylight Atelier (Default - Sunlit Parchment & Honey Craft Desk)
| Token | Value | Purpose |
|---|---|---|
| `--bg-canvas` | `#FAF4E8` | Warm sunlit cotton parchment (with subtle 3% SVG paper fiber overlay) |
| `--bg-surface` | `#FFFDF8` | Sculpted ivory paper floating cards & trays |
| `--bg-tray` | `#F3EBD9` | Soft oat-linen workbench drawer & recessed tracks |
| `--bg-hover` | `rgba(74, 52, 34, 0.06)` | Gentle warm tint on pointer hover |
| `--ink` | `#2D221C` | Deep roasted espresso ink (WCAG AAA contrast on parchment) |
| `--ink-soft` | `#6F5D50` | Warm walnut secondary copy |
| `--ink-muted` | `#9E8C7E` | Quiet hints & subtle labels |
| `--accent` | `#D45D44` | Artisanal terracotta coral (primary actions, active seals, reticle) |
| `--accent-soft` | `rgba(212, 93, 68, 0.13)` | Soft terracotta wash |
| `--sage` | `#2E7D60` | Botanical forest sage (positive voltage, completed steps, sweet spot) |
| `--sage-soft` | `rgba(46, 125, 96, 0.14)` | Soft botanical wash |
| `--honey` | `#E39D34` | Firefly honey gold (charge sparks, energy jar fill, highlights) |
| `--blush` | `#D1495B` | Rose coral (negative potential, overload warning) |
| `--indigo` | `#465D8C` | Ceramic twilight blue (meter accents, secondary probes) |
| `--shadow-soft` | `0 10px 30px rgba(74, 50, 28, 0.09), 0 2px 6px rgba(74, 50, 28, 0.05)` | Warm physical paper elevation |

### Starlight Atelier (Dark - Cozy Midnight Firefly Workshop)
| Token | Value | Purpose |
|---|---|---|
| `--bg-canvas` | `#181624` | Velvety twilight plum-indigo (cozy desk-lamp warmth, never cold slate) |
| `--bg-surface` | `#232034` | Warm dusk velvet floating panels |
| `--bg-tray` | `#2C2840` | Soft twilight tray & recessed controls |
| `--bg-hover` | `rgba(247, 239, 225, 0.07)` | Gentle candlelight hover |
| `--ink` | `#F6EEE0` | Warm candlelight cream ink |
| `--ink-soft` | `#B8AC9E` | Warm sandstone secondary copy |
| `--ink-muted` | `#80768F` | Quiet twilight muted text |
| `--accent` | `#F07A60` | Warm lantern terracotta |
| `--sage` | `#52D1A0` | Moonlit emerald |
| `--honey` | `#F5BC58` | Glowing firefly gold |
| `--blush` | `#F26D7D` | Warm coral rose |
| `--indigo` | `#8CA7E0` | Soft starlight blue |
| `--shadow-soft` | `0 14px 36px rgba(8, 6, 16, 0.45), 0 2px 8px rgba(8, 6, 16, 0.3)` | Cozy midnight depth |

---

## 3. Typography & Motion
- **Google Fonts Import (with graceful offline system fallbacks):**
  - Display: `'Fraunces', Georgia, serif` (`font-variation-settings: "SOFT" 80, "WONK" 1`)
  - UI Sans: `'Plus Jakarta Sans', 'Segoe UI', system-ui, sans-serif`
  - Measurements: `'JetBrains Mono', Consolas, monospace`
- **Tactile Micro-Interactions (`modern-web-guidance` compliant):**
  - Buttons press physically (`active { transform: translateY(1.5px) scale(0.98); }`).
  - Popovers bloom softly from their trigger corner using spring `linear()` easing (with `ease-out` fallback and `prefers-reduced-motion: reduce` guard).
  - Keyboard users always get a crisp 3:1 `:focus-visible` terracotta ring; mouse clicks never show ugly native focus rectangles.

---

## 4. Screen Architecture & Spatial Calm

### A. Welcome Storybook Cover (`#welcome-overlay`)
- Full sunlit parchment with subtle handcrafted SVG animated vignette (warm lantern battery + color-banded resistor + glowing ruby bulb + gently drifting firefly sparks).
- Expressive `Fraunces` title **`Wirebench`** + 1 poetic short line.
- Two sculptural warm-paper portals (`Learn` / `Studio`) with handcrafted mini-illustrations and max 6 words each - ZERO bloated SaaS cards.
- Quiet top-right `EN / TR` and `☀ / ☾` switchers.

### B. Whisper-Clean Top Bar (`.atelier-top`)
- Floating quietly at top with generous breathing margin (`14px`) - **NO harsh full-width border walls, NO 15 crowded controls**:
  - **Left:** `Wirebench` `Fraunces` brand button + warm tactile **`Learn` | `Studio`** pill toggle + *(Studio)* unified **Circuit & Tabs pill** (`#btn-circuits` showing active tab name + tab count dot; opens clean popover listing open Studio tabs + `+ New Blank` + categorized presets so the top bar NEVER overflows!).
  - **Center:**
    - *(Studio)* Compact Play/Pause round stamp + Step + Reset + speed button.
    - *(Learn)* Charming 6-step storybook chapter stones (`1` `2` `3` `4` `5` `6`, with tiny botanical checkmarks for finished labs and the active chapter title).
  - **Right:** Only 3–4 breathable controls:
    - *(Studio)* `Parts` toggle · `Scope` toggle · `File` menu · `Settings` (gear/sliders popover housing `EN/TR`, `Daylight/Starlight` theme, `Illustrated / Schematic` style toggle, `Current Sparks`, `Voltage Colors`, `Audio CH1`, and `Shortcuts ?` - keeping persistent chrome serene!).
    - *(Learn)* `Scope` toggle (subtle) · `Settings` popover.

### C. Learn Mode - Visual-First Storybook Lab
- **88% pure sunlit parchment canvas** with the huge illustrated circuit.
- **On-Canvas Visual Guide:** Soft golden breathing halo + tiny animated hand/pointer emblem with a 2-word storybook tag (`Tap switch` / `Dokun`) pointing directly at the active target component.
- **Airy Floating Bottom Ribbon (`#learn-bar`):** One warm sculpted ivory pill floating gently at bottom-center (`max-width: 820px`, ZERO nested cards inside!):
  - Step pips `● ○ ○` + **1 short warm prompt** (no walls of text!)
  - **Direct tactile widget** (brass rocker switch, silky slider, or cute `A / B` tiles) + **visual glowing progress bar** with a sweet-spot star zone (when numeric)
  - Tiny optional `fx` toggle icon that reveals the live equation on demand (hidden by default so beginners aren't intimidated!)
  - Warm spring-bouncy **`Continue →`** stamp button that activates ONLY when live physics confirms the goal is currently met!

### D. Studio Mode - Charming & Deep 24-Part Workbench
- **Left Airy Parts Tray (`#parts-panel`):** Soft floating warm-linen organizer (`226px`), smooth rounded corners, **NO rigid `1px` grid matrix lines!** Each of the 24 parts sits as an airy spaced illustrated miniature that lifts gently on hover; click or drag-and-drop straight onto the parchment!
- **Bottom-Center Tactile Tool Strip (`#tool-dock`):** Clean soft pill (`Select`, `Wire`, `Probe`, `Erase` · `Undo/Redo`, `Fit`, `⌘K`).
- **Right Contextual Paper Inspector (`#inspector-card`):** Floating warm paper card that appears ONLY when 1 component or wire is selected - clean sliders, live `V / I / P` readout strip, quick transform stamps, and 1-click "Attach Probe" on wires.
- **Bottom Collapsible Instrument Shelf (`#instrument-drawer`):** Cozy docked warm-parchment oscilloscope, Bode plot, Nodes, and SPICE viewer (closed by default for maximum canvas serenity).

---

## 5. Cross-Worker Contract (DOM IDs & JS APIs)

All Swarm workers MUST adhere strictly to these exact IDs and method signatures so everything snaps together cleanly on first run:

### Shared JS APIs
- **`SchematicCanvas` (`src/ui/schematicCanvas.js`):**
  - `setTheme('light' | 'dark')`
  - `setRenderStyle('illustrated' | 'schematic')` (defaults to `'illustrated'`)
  - `setGuideTarget(compId, label)` - renders soft warm breathing halo + cute pointer tag above `compId`
  - `zoomToFit(insets)`, `getCamera()`, `setCamera(cam)`, `resize()`, `render(dt, isRunning)`
- **`symbols.js` (`src/ui/symbols.js`):**
  - `drawComponentSymbol(ctx, comp, telemetry, theme, flags)` - honors `flags.renderStyle` (`'illustrated'` default vs `'schematic'` classic IEEE)
  - `getPaletteIconSVG(type)` - returns rich charming inline SVG (valid `<svg ...>...</svg>`) for every tool & all 24 components!
  - Keeps `export const getComponentSVG = getPaletteIconSVG; export const getToolSVG = getPaletteIconSVG;`
- **`icons.js` (`src/ui/icons.js`):**
  - `uiIcon(name)` - uniform warm rounded-cap SVGs (must keep all existing keys used in `ui-smoke.test.mjs`, plus `sparkles`, `palette`, `book`, `hand`, `star`, `formula`).
- **`i18n.js` (`src/ui/i18n.js`):**
  - Exports `getLang`, `setLang`, `t`, `compLabel`, `loc`, `TRANSLATIONS`, `COMPONENT_LABELS`.
- **`LearnController` (`src/ui/learnController.js`):**
  - `new LearnController(stepperEl, barEl, callbacks)`
  - Methods: `getActiveLesson()`, `setActiveLesson(id, schematic)`, `refreshLanguage(schematic)`, `evaluate(ctx)`.

### Shared DOM IDs (`public/index.html` ↔ `src/ui/app.js`)
- Welcome: `#welcome-overlay`, `#choose-learn`, `#choose-studio`, `#welcome-resume-pill`, `[data-set-lang]`, `[data-set-theme]`
- Top Bar: `#btn-home`, `#mode-learn`, `#mode-studio`, `#btn-circuits`, `#active-circuit-name`, `#tab-count-badge`, `#circuits-popover`, `#btn-play`, `#btn-step`, `#btn-reset`, `#btn-speed`, `#speed-popover`, `#sim-speed`, `#sim-speed-val`, `#sim-clock`, `#learn-stepper`, `#btn-parts-toggle`, `#btn-scope-toggle`, `#btn-export`, `#export-popover`, `#btn-settings`, `#settings-popover`
- Settings Menu inside `#settings-popover`: `[data-set-lang]`, `[data-set-theme]`, `[data-toggle="style"]` (`#chip-style`), `[data-toggle="flow"]` (`#chip-flow`), `[data-toggle="voltage"]` (`#chip-voltage`), `[data-toggle="grid"]` (`#chip-grid`), `[data-toggle="audio"]` (`#chip-audio`), `#act-shortcuts`
- Export Menu inside `#export-popover`: `#act-save-json`, `#act-load-json`, `#act-export-svg`, `#act-export-spice`, `#act-export-csv`, `#act-clear`, `#file-json-input`
- Canvas & Panels: `#canvas-stage`, `#schematic-canvas`, `#parts-panel`, `#parts-search`, `#parts-cats`, `#parts-grid`, `#inspector-card`, `#learn-bar`, `#tool-dock`, `#btn-undo`, `#btn-redo`, `#btn-fit`, `#btn-cmd`, `#btn-learn-play`, `#btn-learn-fit`, `#hud-probe`, `#hud-diag`, `#toast-pill`
- Instruments: `#instrument-drawer`, `#drawer-resizer`, `#btn-drawer-close`, `#scope-canvas`, `#bode-canvas`, `#scope-stats`, `#scope-time-cycle`, `#scope-volt-cycle`, `#scope-auto`, `#scope-xy`, `#scope-hold`, `#bode-summary`, `#bode-range-btn`, `#bode-run`, `#solver-summary`, `#nodes-grid`, `#spice-deck-code`, `#btn-copy-spice`
- Modals: `#cmd-overlay`, `#cmd-input`, `#cmd-results`, `#help-overlay`, `#btn-help-close`
