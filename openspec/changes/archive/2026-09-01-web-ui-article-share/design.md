## Context

`BlogPostPage` renders the article header (back link + title) in `BlogPostPage.tsx`. This increment adds a share control there (see proposal.md); `web-ui-article-share` spec defines the behavior.

## Goals / Non-Goals

**Goals:**
- A share button on the article header that shares/copies the current URL.
- Small, native, and fallback to clipboard copy with confirmation.

**Non-Goals:**
- No backend; no dependency; no redesign.

## Decisions

- **Inline `ShareButton`** in `BlogPostPage`: `navigator.share` if present (with title+url), else `navigator.clipboard.writeText(url)` with a temporary "已复制" state. *Alternative:* third-party share lib — rejected (heavy, no benefit here).

## Risks / Trade-offs

- **[Clipboard permission]** → wrapped in try/catch; silent fallback.
- **[navigator.share only on https]/mobile** → clipboard fallback covers desktop/localhost.
