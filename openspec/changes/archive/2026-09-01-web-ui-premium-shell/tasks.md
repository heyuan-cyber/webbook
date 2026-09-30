## 1. Design tokens

- [x] 1.1 Add a complete custom-property token set to `:root` in `apps/web/src/styles/global.css` (surfaces, text, accent ramp, spacing, radius, shadow/elevation, z-index, motion duration/easing, typography weights)
- [x] 1.2 Replace hardcoded color/value literals in `global.css` and `layout.css` with tokens
- [x] 1.3 Add `:focus-visible` focus ring and a `@media (prefers-reduced-motion)` base (disable decorative animation/transitions)

## 2. Depth and materiality

- [x] 2.1 Glass chrome on the topbar (`AppShell.tsx`): translucent surface + `backdrop-filter: blur` + visible border, opaque fallback
- [x] 2.2 Glass/floating styling on the sidebar and floating panels/popovers
- [x] 2.3 Accent glow/state on interactive and selected elements (buttons, active tree node, selected stage block) using `--accent-*` tokens
- [x] 2.4 Subtle aurora/gradient-mesh background layer + optional film grain (fixed, pointer-events none, low opacity), static fallback and reduced-motion off

## 3. Verify

- [x] 3.1 Contrast check (WCAG AA) and no visual regression on `/app`, `/app/note/:id`, `/blog*`, `/admin`, `/login`
- [x] 3.2 Confirm token-driven consistency: no stray hardcoded color literals in the changed files
- [x] 3.3 `npm run build` passes, PWA behaves, and `prefers-reduced-motion` disables aurora/transitions

## 4. Intensity pass (after user review: initial materiality was too subtle)

- [x] 4.1 Boost aurora/mesh opacity + saturation so the atmosphere is clearly visible
- [x] 4.2 Increase glass translucency, blur and border highlight on chrome and floating panels
- [x] 4.3 Strengthen accent glow on hover/active/selected elements
- [x] 4.4 Bump film grain and add a subtle accent top-line on the topbar chrome
- [x] 4.5 Verify the served CSS reflects the intensified values; build passes
