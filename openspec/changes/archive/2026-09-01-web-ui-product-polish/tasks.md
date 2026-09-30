## 1. Reusable primitives

- [x] 1.1 Add `Skeleton` component + CSS shimmer (reduced-motion aware)
- [x] 1.2 Add `EmptyState` component (icon/title/body/CTA) + CSS

## 2. Command palette

- [x] 2.1 Build `CommandPalette` overlay (⌘K open/close, AnimatePresence, keyboard)
- [x] 2.2 Wire actions: navigate, "new note"; hook global ⌘K into AppShell

## 3. Wire into surfaces

- [x] 3.1 Use skeleton while loading (blog feed; article/tree loading left as minor follow-up)
- [x] 3.2 Use `EmptyState` for empty tree and empty blog (editor empty left as minor follow-up)

## 4. Verify

- [x] 4.1 `npm run build` passes (581 modules); reduced-motion; no regression
