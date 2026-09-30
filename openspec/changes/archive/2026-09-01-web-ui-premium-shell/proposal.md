## Why

WebBook's web front end already has a tasteful warm-dark theme, but it reads as a quiet internal tool rather than a mature commercial product. To reach the "高端大气炫酷成熟商业化" goal, the first increment must establish a **unified premium visual language** — a complete design-token system plus materiality (glass depth, accent glow, aurora/grain) — so every later phase (typography, motion, product polish, components) builds on one consistent, themeable foundation instead of ad-hoc tweaks.

## What Changes

- Introduce a **complete design-token system** (surfaces, text, accent ramp, spacing, radius, shadow, z-index, motion duration/easing, typography) in `apps/web/src/styles`.
- **Convert hardcoded colors/values** in `global.css` / `layout.css` and app-shell CSS to tokens.
- Add **glass/backdrop-blur** materiality to primary chrome (topbar, sidebar, floating panels) and **accent glow/state** on interactive and selected elements.
- Add a **subtle aurora/mesh gradient background** (+ optional film grain) with a reduced-motion static fallback.
- Add **`:focus-visible`** focus ring and **`prefers-reduced-motion`** handling.
- No backend/API/data changes; no new JS dependency in this increment (motion/animation is a later phase).

## Capabilities

### New Capabilities
- `web-ui-visual-language`: The WebBook UI visual language — a consistent premium dark theme built from shared tokens with material depth (glass, glow, aurora/grain), accessible by default, and motion-safe.

### Modified Capabilities
<!-- None: no existing spec-level behavior changes. -->

## Impact

- **Front end**: `apps/web/src/styles/global.css`, `apps/web/src/styles/layout.css`; shell-level components `apps/web/src/components/AppShell.tsx`, `TreeSidebar.tsx` and floating panels.
- **Dependencies**: none added in this increment.
- **Systems**: no Worker/API/data changes; PWA build unchanged.
- **Deployment**: `git push main` → GitHub Pages (existing pipeline).
