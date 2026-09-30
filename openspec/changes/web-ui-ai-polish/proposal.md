## Why

The AI features are functionally broad (7 providers, text/image/video/3D/audio, web research) but rough in the ways that matter day to day. Three concrete problems, each verified in code:

1. **Job polling writes a git commit per poll.** `BlockAiPanel.pollJobUntilDone` polls every 2s for up to 90 iterations; each `GET /api/ai/jobs/:id` runs `refreshAiJob`, which calls `saveAiJob` → `putFile` → a GitHub Contents API commit. One video generation can create up to ~90 commits. The loop also cannot be cancelled and dies with the tab, so a job is never advanced unless someone keeps polling.
2. **Nothing streams.** All three AI call sites set `stream: false`, so long generations show only a static "AI 思考中…". The chat protocol additionally forces the model to emit a single JSON blob (`{"reply","noteMarkdown"}`), which makes streaming impossible and is historically fragile — the code carries three separate parse fallbacks.
3. **Chat state is not durable.** Messages reset on note change and are lost on reload; the panel's expanded state is not remembered; a failed request only toasts and has no retry.

## What Changes

Frontend + Worker changes for the AI assist surfaces. Stage 1 of the AI polish (streaming, job governance, chat durability).

- **Job polling stops committing on every poll** — the worker only writes a job file when its status or result actually changes, and the client can abort polling (leaving the page or pressing cancel), so a video/3D job can no longer spam the data repo.
- **Chat streams** — a new server-sent-events AI endpoint streams the generated note Markdown token by token, and the panel renders it live as it arrives instead of waiting for one blocking response.
- **Markdown-first protocol** — the streaming path asks the model for plain Markdown (no JSON envelope); the short conversational `reply` is derived client-side from the finished draft. The existing blocking JSON path stays for compatibility.
- **Chat history is durable** — messages persist per note locally and are restored when the note is reopened; the panel remembers whether it was expanded; a failed request offers retry instead of silently rolling back.

**Non-goals (later stages):** no change to media-block context in prompts (`noteToText` still ignores image/video/3D/sticky/canvas), no context-length budget, no job center/cleanup endpoint, no usage/cost accounting, no model picking changes.

## Capabilities

### New Capabilities

- `web-ui-ai-assist`: the in-editor AI assistant surfaces — streaming generation, durable per-note chat state, and non-destructive asynchronous job polling.

### Modified Capabilities

None.

## Impact

- **Worker changed:** `workers/api/src/index.ts` (new streaming chat route), `workers/api/src/ai.ts` (streaming chat function + markdown-first system prompt), `workers/api/src/ai/jobs.ts` (write only on change).
- **Frontend changed:** `apps/web/src/components/AiChatPanel.tsx` (streaming render, persistence, retry, expanded memory), `apps/web/src/lib/api.ts` (streaming client), `apps/web/src/components/editor/BlockAiPanel.tsx` (abortable polling), plus local-storage helpers.
- **Needs a Worker deploy** (new endpoint + job write behaviour).
- Verified with `npm run typecheck -w apps/web`, `npm run typecheck -w workers/api`, and `openspec validate`.
