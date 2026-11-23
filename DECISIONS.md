# Wirebench - Architectural & Design Decisions (`DECISIONS.md`)

## ADR-001: Shift from Sterile CAD / AI-Slop Dark UI to "Luminous Atelier" Craft Identity
- **Context:** Iterations v1–v3 leaned into generic dark-slate glassmorphism + neon blue/green SaaS tropes ("AI slop"). Iteration v4 stripped noise into a rigid Swiss CAD grid, which felt dry, cold, line-heavy, and intimidating to regular users.
- **Decision:** Adopt an original, artistic, storybook-tactile **"Luminous Atelier"** identity:
  - Warm sunlit parchment (`#FAF4E8`, Daylight Atelier) as default, paired with cozy twilight firefly midnight (`#181624`, Starlight Atelier).
  - Expressive typography (`Fraunces` variable soft serif + `Plus Jakarta Sans` + `JetBrains Mono`) with full Turkish diacritic support (`ğ ş ı İ ö ç ü`).
  - Eliminate harsh `1px` structural grid walls and nested card-ception in favor of soft sculpted paper layers, warm shadows, and generous emptiness.
- **Consequences:** Immediate emotional warmth and visual uniqueness; zero resemblance to generic Tailwind/v0 templates.

## ADR-002: Illustrated Miniature Electronic Components (with Schematic Toggle)
- **Context:** Abstract 1970s black-and-white stick symbols (`-/\/\/\-`, `-| |-`) fail to communicate physical intuition and feel sterile.
- **Decision:** Render all 24 components in Canvas2D and the Parts Tray as **charming illustrated miniature physical artifacts** by default:
  - Dynamic 4-band IEC color-coded porcelain resistors (bands compute live from `resistance`).
  - Glossy glass LED domes with firefly bloom and curly overload smoke wisps (> 28 mA).
  - Transparent energy-jar capacitors showing live golden charge level proportional to `|Vc|`.
  - Vintage brass-rimmed analog needle gauges for Voltmeter & Ammeter.
  - Tactile brass toggle switches, rotary brass potentiometer knobs, wound copper coils, ceramic microchip logic tiles with glowing state pearls, and braided copper wires with warm paper shadows & drifting firefly sparks.
  - Retain a 1-click `Illustrated ↔ Schematic` toggle inside Settings for engineers who want textbook IEEE symbols.

## ADR-003: Visual-First Learn Mode with Live Physics Truth & Progressive Formula Disclosure
- **Context:** Stacking dense technical instructions, formulas, hints, and multiple bordered widgets in a right sidebar overwhelmed beginners and caused contradictory UI states when switches were re-opened.
- **Decision:**
  - Keep Learn Mode 88% unobstructed canvas with a soft animated on-canvas pointer halo on the exact interactive part.
  - Place a single airy floating Storybook Ribbon at bottom-center with 1 friendly line, 1 tactile control, and a visual sweet-spot glow bar.
  - Hide raw algebraic formulas behind an optional `fx` button (progressive disclosure) so beginners learn visually first.
  - Bind completion state (`Continue →`) strictly to live MNA solver truth every frame.

## ADR-004: Multi-Tab Persistent Studio Workspace Isolated from Learn Mode
- **Context:** Earlier builds shared a single mutable schematic between Studio and Learn, erasing user creations whenever entering tutorials.
- **Decision:** Preserve `StudioWorkspace` (`src/state/workspace.js`) with multi-tab `localStorage` persistence, full camera & undo-stack snapshots on `suspendStudio()` / `resumeStudio()`, and unified `Circuits & Tabs` popover so Studio tabs never clutter the top bar and never lose user work.

## ADR-005: Modern Web Standards & Accessibility (`modern-web-guidance`)
- **Decision:**
  - Synchronize `<meta name="color-scheme" content="light dark">` with `:root` `color-scheme` CSS mapping and inline FOUC prevention script so native scrollbars/form controls harmonize seamlessly across schemes.
  - Preserve accessible `:focus-visible` rings (≥ 3:1 contrast) without showing focus boxes on mouse clicks; pair color cues with icons/shapes (WCAG 1.4.1); guard spring/bloom animations with `@media (prefers-reduced-motion: no-preference)`.
  - Move secondary controls (theme, language, style, display layers, audio, shortcuts) into an on-demand Settings popover (`content-first-noise-reduction`) to keep the persistent top bar sparse and calm.

## ADR-006: Zero-Dependency Build & Dual-Folder Sync
- **Decision:** Keep zero external runtime npm packages (`npm start`, `npm test`, `npm run build`, `npm run cli` work out-of-the-box on Node 20+; Google Fonts degrade gracefully offline). Mirror verified releases cleanly into `c:\Users\furka\Desktop\Dosyalar\Projects\wirebench`.
