## Why

The main JS bundle is ~815 kB (gzip ~249 kB), so the initial load is heavy and the running client, editors, and admin all arrive before they're needed. Route-based lazy loading defers the heavy page/editor bundles until the user navigates there, giving a faster initial paint and a more "commercial" feel.

## What Changes

- Convert the route page components to `React.lazy` and wrap the routed tree in `Suspense` (per-route code splitting).
- No functional or visual change — only load timing/bundling.

## Capabilities

### New Capabilities
- `web-ui-bundle-optimize`: Initial-load performance — heavy route/editor bundles load on demand rather than in the initial bundle.

### Modified Capabilities
<!-- None. -->

## Impact

- **Front end**: `apps/web/src/App.tsx` (lazy route imports + Suspense). No component logic changes.
- **Dependencies**: none.
- **Systems**: no Worker/data changes; PWA build unchanged.
