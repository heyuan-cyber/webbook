## Context

See proposal.md — Why for the three verified problems. Relevant current state:

- `workers/api/src/ai.ts` has `chat()`, `chatMessages()` (both `stream: false`) and `assistNoteChat()`, which asks the model for a single JSON object and parses it with `parseAiChatResponse` (with `resolveAiDraft` / `looksLikeAiJsonBlob` fallbacks on the client).
- `workers/api/src/ai/jobs.ts` `refreshAiJob()` always ends with `saveAiJob()` → `putFile()`, so every poll commits.
- `apps/web/src/components/editor/BlockAiPanel.tsx` `pollJobUntilDone()` is a bare `for` loop: 2s × 90, no abort.
- `apps/web/src/components/AiChatPanel.tsx` resets messages on `note.id` change, keeps `collapsed` in component state only, and on error just toasts.
- `idb-keyval` is already a dependency; there is an existing `@/lib/storage` module for local UI state.

## Goals / Non-Goals

**Goals:**

- Stream generated note Markdown to the panel so long output appears progressively.
- Make the streaming path Markdown-first (no JSON envelope) so streamed text is readable.
- Persist chat messages per note and the panel's expanded state; offer retry on failure.
- Make job polling write only when the job changes, and make it cancellable.

**Non-Goals:**

- No change to `noteToText` media coverage or context budgeting (Stage 2).
- No job list / cleanup endpoint, no usage accounting (Stage 3).
- No change to provider routing, model catalog, or the image/video/3D adapters.

## Decisions

**D1 — Server-Sent Events on a new endpoint.**
Add `POST /api/ai/chat/stream` returning `text/event-stream`. It proxies the provider's `stream: true` Chat Completions response and re-emits `data: {"delta":"..."}` frames plus a terminating `data: [DONE]`. Rationale: SSE is the simplest streaming transport that works through a Cloudflare Worker and `fetch` (`ReadableStream` on the client); WebSockets would need a different runtime path. Keep `POST /api/ai/chat` untouched for compatibility. Alternative rejected: chunked plain text — SSE gives clean framing and an explicit end marker.

**D2 — Markdown-first prompt for the streaming path.**
The streaming path uses a separate system prompt that asks for the note body as plain Markdown with no JSON wrapper and no preamble. The blocking path keeps the existing JSON protocol. Rationale: streaming a JSON envelope would show raw JSON to the user and still require the whole object before any content is usable. Alternative rejected: keep JSON and stream inside the string — brittle escaping and unreadable output.

**D3 — Derive the conversational reply on the client for the streaming path.**
With Markdown-first output there is no `reply` field. The panel shows a short local status line ("已生成草稿 · N 个块") and renders the streamed Markdown as the draft. Rationale: the reply was always 1–3 sentences of acknowledgement; a second model call would add latency and cost for no user value. The existing `reply`-bearing path still works for non-streaming requests.

**D4 — Job writes only on change.**
`refreshAiJob` computes the new record, compares `status`, `resultUrl`, `posterUrl`, and `error` against the loaded one, and only calls `saveAiJob` when something differs (or when the job was just created). Rationale: polling must be free; a poll that learns nothing new should not create a commit. Alternative rejected: time-based write throttling — it still commits on unchanged polls.

**D5 — Cancellable polling.**
`pollJobUntilDone` accepts an `AbortSignal`; the panel creates an `AbortController` per generation, aborts it on unmount / note change / explicit cancel, and the loop checks the signal before each request and stops on abort. Rationale: today the loop can outlive the panel and keep hammering the API. Because `refreshAiJob` is what downloads and stores the finished asset, cancelling simply means "stop advancing from this client" — the job file retains `providerTaskId`, so a later poll resumes it.

**D6 — Persistence via IndexedDB and the existing storage module.**
Chat messages are stored per note id in IndexedDB (via the already-present `idb-keyval`), keyed by note id, and loaded when the panel mounts for that note; the expanded flag goes to the existing local-storage helper. Rationale: reuse what is already installed; message lists are small but unbounded, so IndexedDB is a better fit than localStorage. Alternative rejected: localStorage for messages — size limits and synchronous writes.

## Risks / Trade-offs

- [SSE buffering by intermediaries] → Send `Content-Type: text/event-stream`, `Cache-Control: no-cache`, and `X-Accel-Buffering: no`; flush each frame; disable the PWA runtime cache for this route.
- [Streaming breaks when tools are used] → Tool-calling and streaming interact awkwardly; the streaming path starts without web tools, and requests that need research fall back to the existing blocking path.
- [Partial output on error] → Keep the partial Markdown visible and offer retry rather than discarding it.
- [Job write-on-change races] → Keep the existing per-repo write serialization in `github.ts`; the compare-then-write happens inside the same handler so the last writer wins with fresh state.
- [Persisted chat leaks between users on a shared device] → Key the store by note id, which is already user-scoped, and clear entries when the note's owning user differs from the session user.
