# Tasks

## 1. Job polling writes only on change

- [x] 1.1 In `workers/api/src/ai/jobs.ts`, make `refreshAiJob` compare the refreshed record against the loaded one (`status`, `resultUrl`, `posterUrl`, `error`) and call `saveAiJob` only when something changed.
- [x] 1.2 Keep the initial write on job creation (`createAsyncAiJob`) as-is.

## 2. Cancellable job polling (client)

- [x] 2.1 In `BlockAiPanel.tsx`, thread an `AbortSignal` into `pollJobUntilDone` and stop the loop when aborted.
- [x] 2.2 Create an `AbortController` per generation and abort it on unmount / note change / explicit cancel.

## 3. Streaming AI chat (worker)

- [x] 3.1 Add a streaming chat function in `workers/api/src/ai.ts` that calls the provider with `stream: true` and yields text deltas, using a Markdown-first system prompt (no JSON envelope).
- [x] 3.2 Add `POST /api/ai/chat/stream` in `workers/api/src/index.ts` returning `text/event-stream` frames (`data: {"delta":...}` … `data: [DONE]`), with no-cache headers.
- [x] 3.3 Ensure the streaming route requires auth and does not use web tools (falls back to the blocking path when research is needed).

## 4. Streaming AI chat (client)

- [x] 4.1 Add a streaming client method in `apps/web/src/lib/api.ts` that POSTs and reads the SSE stream, invoking a callback per delta.
- [x] 4.2 In `AiChatPanel.tsx`, render the accumulating Markdown live while streaming and turn it into the draft when the stream ends.
- [x] 4.3 On stream error, keep the partial content and offer retry.

## 5. Durable chat state

- [x] 5.1 Persist chat messages per note (IndexedDB via `idb-keyval`) and restore them when the note is reopened.
- [x] 5.2 Persist the panel's expanded/collapsed state in the existing local-storage helper.
- [x] 5.3 Add a retry action for a failed request instead of only rolling back.

## 6. Verify

- [x] 6.1 Run `npm run typecheck -w apps/web` and `npm run typecheck -w workers/api`.
- [x] 6.2 Run `openspec validate --changes web-ui-ai-polish`.
- [x] 6.3 Confirm an unchanged job poll performs no write (logic check) and that aborting stops further requests.
