## Why

Phases 1–3 delivered the visual foundation (tokens/materiality), composition/typography, and motion. The last "成熟商业化" gap is **product polish**: the small affordances that make an app feel finished — a keyboard command palette, skeleton loaders for async content, and guided empty states. This increment adds those with no backend change.

## What Changes

- **Command palette (⌘K)** — open with `Ctrl/Cmd+K`: jump to pages, search notes, create a note, all with keyboard.
- **Skeleton loaders** — shimmer placeholders for the tree sidebar, blog feed, and article loading (replacing raw "加载中…").
- **Guided empty states** — icon + guidance + CTA for empty tree, empty editor, and empty blog (replacing bare muted text).
- Reusable presentational components; no dependency added (reuse existing `motion`, `react-router`, `zustand`).

## Capabilities

### New Capabilities
- `web-ui-product-polish`: Product-polish capabilities — a keyboard command palette, skeleton loaders for async surfaces, and guided empty states.

### Modified Capabilities
<!-- None: new capability. -->

## Impact

- **Front end**: new `CommandPalette`, `Skeleton`, `EmptyState` components; wire into `UserApp`/`AppShell`, `TreeSidebar`, `BlogHubPage`, `BlogPostPage`.
- **Dependencies**: none added.
- **Systems**: no Worker/API/data changes; PWA build unchanged.
