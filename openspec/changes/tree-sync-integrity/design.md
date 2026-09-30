## Context

See `proposal.md` — Why. Two facts about the current code shape the approach.

**The primitives already exist, but only one route uses them.** `workers/api/src/github.ts` gained a compare-and-swap write for the plan feature: `getFileSha` (`:158`), `FileConflictError` (`:168`), and `putFileConditional` (`:191`), which deliberately does **not** reuse `putContentWithRetry` because that helper treats 409/422 as network jitter and retries — exactly the behaviour that makes last-write-wins invisible. `PUT /api/plan` maps `FileConflictError` to `409 { error: 'conflict', baseSha }` (`index.ts:289-290`), and the client already has a conflict type and a replay path (`apps/web/src/lib/api.ts`). Meanwhile `PUT /api/tree` (`index.ts:627`) still calls plain `putFile`. The tree is the file that actually lost user data, and it is the one file with no protection.

**The client currently converts a failed read into a confident write.** `apps/web/src/store/repository.ts:17-26` catches a failed cloud `loadTree` and returns the IndexedDB tree; `:27-36` then pushes whatever tree it holds back to the cloud on the next save. Nothing in between records that the tree in hand is local-only. The sign-in path does the same thing deliberately: `LoginPage.tsx:39-42` uploads the local tree wholesale, guarded only against the local tree being empty (`:43`).

The data shape is friendly to a merge: every tree node carries a stable `id`, and notes are separate files, so a tree that loses a reference does not lose content. This is what made the 2026-09-26 recovery possible, and it is what makes an identity-based union safe.

## Goals / Non-Goals

**Goals:**

- Make it impossible for a client holding a stale or local-only tree to overwrite the cloud tree without a human decision.
- Keep offline editing working: a degraded read must not silently become an authoritative write, but the user must still be able to work.
- Give the owner a way to see and restore earlier tree versions without leaving the app or touching git.
- Make existing tree/notes inconsistencies visible on demand.

**Non-Goals:**

- Changing note (`/api/notes/*`) write semantics. Notes are single-document writes and were not the offender; adding revisions there is deferred.
- Server-side automatic merge or CRDT. Without tombstones a server cannot distinguish "the client deleted this" from "the client never had it", so automatic merging would invent structure. Conflicts go to the user.
- The circle tree (`/api/circles/{id}/tree`). Same shape of problem, different auth path and blast radius.
- Deleting the 34 pre-existing orphan notes found during the incident. The audit reports; the user decides.

## Decisions

**D1 — Use the GitHub blob sha as the tree revision, not a version counter.**

The Contents API returns a sha for every file, and `putFileConditional` already accepts an `expectedSha`. A separate counter file would need its own compare-and-swap and would introduce a second file that can desynchronise from the tree. The sha is atomic with the content it describes.

*Alternative rejected:* an integer `rev` inside `tree.json`. It cannot be checked atomically — the check and the write are the same request only when the storage layer enforces it, which is what the sha gives for free.

**D2 — Enforce the check inside the PUT, not only before it.**

`putFileConditional` compares the sha before writing, but the decisive protection is that it passes `sha` to the Contents API PUT, so GitHub rejects a mismatch atomically. The pre-check exists to produce a typed error; the API-level `sha` closes the time-of-check/time-of-use gap.

**D3 — `baseRev` travels in the request body.**

The client's `http()` wrapper (`apps/web/src/lib/api.ts`) only forwards `Content-Type` and `Authorization`; a body field needs no new plumbing. `If-Match` would be more conventional but requires header support in the wrapper and a 412 path that the client does not have.

*Consequence:* a missing `baseRev` must be rejected explicitly (`400`), otherwise an old client would silently get unconditional writes again.

**D4 — A conflict is a question, not a merge.**

On `409` the client stops automatic tree writes, keeps the local tree in memory and IndexedDB, and asks: keep cloud or overwrite cloud. Replacing is allowed but labelled. On resolution the client adopts the accepted revision and autosave resumes.

*Alternative rejected:* replay-with-retry, which the plan path uses. That is safe for a plan document that a single user edits from one place; for the tree, replaying a stale tree is precisely the failure being fixed.

**D5 — Offline is a state, not a fallback.**

`repository` gains an explicit `offline` flag set when a cloud tree load fails and cleared when one succeeds. While set: local reads and local writes continue, remote tree writes are suppressed, and the shell shows the state. This preserves the guest/offline promise while removing the silent promotion path.

*Alternative rejected:* blocking editing until the cloud is reachable. It would break the offline-first behaviour the app advertises, and the risk is in the write, not the read.

**D6 — The union merge lives in `packages/shared`, and the sign-in path is its only caller.**

Merging by node id — walk the source tree, graft any node whose id is absent from the target, recurse into nodes present in both, preserve the target's ordering and placement — is the algorithm used to repair the incident by hand. Putting it in `packages/shared` makes it unit-testable and keeps a second copy from appearing in the sign-in path. It is used only for the explicit "upload my guest drafts" flow, where the two trees are usually disjoint.

**D7 — Restore is an ordinary conditional write.**

`GET /api/tree/history` lists versions (reusing `fileHistory`, `github.ts:342`); `GET /api/tree/versions/:sha` returns a version (the same shape as the existing note-version read). Restoring is then a normal `PUT /api/tree` carrying the chosen content plus the current `baseRev`, so a restore can never clobber a concurrent change and needs no separate code path.

**D8 — Deploy fail-closed, frontend first.**

The new client is written so that a missing `_rev` in the load response means "server not updated yet": it enters the local-only state and refuses remote tree writes with a visible message. The Worker then requires `baseRev`. Deploying the frontend first therefore fails closed (tree writes pause, loudly) rather than open (writes resume unprotected). The window is as long as it takes to run one deploy.

*Alternative rejected:* deploying the Worker first. During that window an old client would send no `baseRev` and be rejected — and the old client swallows `saveTree` errors (`repository.ts:33`), so the failure would be silent, which is the class of problem being fixed.

## Risks / Trade-offs

- **[Autosave pausing on conflict could lose recent edits]** → The conflict path never discards the local tree; it is kept in memory and IndexedDB, and the prompt defaults to nothing (no silent choice). Editing remains possible; only cloud writes pause.
- **[Union merge can resurrect nodes the user deleted elsewhere]** → There are no tombstones, so a node deleted on another device can come back if it still exists locally. Mitigated by restricting the merge to the explicit sign-in upload, showing the counts being merged, and never merging on the normal autosave path.
- **[Adding revisions to the tree but not to notes leaves an asymmetry]** → Accepted and documented as a non-goal. The tree is the file that lost data; notes are single-document writes whose worst case is a lost edit, not lost structure.
- **[Two concurrent writers still race between our pre-check and the API call]** → Closed by passing `sha` to the Contents API PUT (D2); GitHub returns a conflict and `putFileConditional` surfaces it as `FileConflictError`.
- **[`fileHistory` over a long-lived tree returns many versions]** → The history endpoint returns a bounded, newest-first page; the full history remains available in git.
- **[The existing 34 orphans are unrelated to this change but sit in the same tree]** → The audit script makes them visible; deleting them is a separate, user-driven decision.

## Migration Plan

1. Land the worker changes (revision on read, conditional write, history/version routes) and the frontend changes (revision tracking, conflict prompt, local-only state, union merge, restore entry).
2. Deploy the **frontend first** (D8): it fails closed against the un-updated Worker. Then `wrangler deploy` the Worker. Reload the app.
3. No data migration. The tree restored from `48dce3c8` (commit `b08fcc48`) is the baseline; the first conditional write adopts its sha as the initial `baseRev`.
4. Rollback: revert the Worker and frontend. Conditional writes only ever prevent writes, so no data can be stranded by rolling back.

## Open Questions

- Whether the audit should also run on a schedule (a Worker cron) or stay a manual script. It is read-only either way, so this does not change the specs or the task breakdown.
- Whether to surface the 34 historical orphan notes in the UI as a cleanup list, or leave that to the script output.
