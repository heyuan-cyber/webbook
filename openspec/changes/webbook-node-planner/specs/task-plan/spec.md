## Purpose

Gives every note and column a nested task plan whose structure mirrors the note tree, so a parent column automatically reports the work planned and completed under all of its descendants, and the notebook as a whole can answer what is planned, what is in progress, and what is done.

## ADDED Requirements

### Requirement: Plan document

The system SHALL persist a user's entire task plan as a single JSON document at `data/users/{userId}/plan.json`, containing a `schemaVersion` and a nested array of plan nodes. A plan node SHALL carry at minimum: a stable `id`, a `title`, an optional `note` (free text), an optional `anchorNodeId` referencing a `TreeNode.id`, a `done` boolean, `createdAt`, an optional `doneAt`, an optional `dueAt` (planned completion date), a `priority` of `p0` | `p1` | `p2` | `none`, and an ordered `children` array.

#### Scenario: Plan created on first use

- **WHEN** an authenticated user opens the planner and no `plan.json` exists yet
- **THEN** the system serves an empty plan with the current `schemaVersion` instead of failing

#### Scenario: Older plan document read

- **WHEN** a stored plan has a `schemaVersion` below the current one
- **THEN** the system migrates it into the current shape on read, filling absent fields with defaults and preserving every existing node id, nesting level, and completion state

#### Scenario: Unknown fields tolerated

- **WHEN** a stored plan carries fields the current model does not define
- **THEN** reading it does not error and the known fields remain intact

### Requirement: Plan access is authenticated and user-scoped

Plan reads and writes SHALL require an authenticated user, and SHALL be scoped to that user's own `data/users/{userId}/plan.json`. A request without a valid token SHALL be rejected with `401`.

#### Scenario: Anonymous read rejected

- **WHEN** a request reaches the plan endpoint without a valid token
- **THEN** the system responds `401` and returns no plan data

#### Scenario: No cross-user access

- **WHEN** an authenticated user requests a plan
- **THEN** the response contains only nodes from that user's own plan document

#### Scenario: Plan is never public

- **WHEN** any public feed, public note, or circle route is requested
- **THEN** plan content is never included in the response

### Requirement: Concurrent writes cannot silently drop data

Plan reads SHALL return a `baseSha` identifying the stored document revision. Plan writes SHALL carry the `baseSha` the client read. When the stored revision differs from the submitted `baseSha`, the system SHALL reject the write with `409 conflict` and SHALL NOT overwrite the stored document, and it SHALL NOT auto-retry the write.

#### Scenario: Stale write rejected

- **WHEN** a client writes a plan with a `baseSha` that no longer matches the stored revision
- **THEN** the system responds `409` and the stored plan is left byte-for-byte unchanged

#### Scenario: Conflict is not masked by retry

- **WHEN** a plan write is rejected because of a revision mismatch
- **THEN** the system does not retry the write against the freshly stored revision, so the client's stale snapshot never lands

#### Scenario: Matching revision accepted

- **WHEN** a client writes a plan whose `baseSha` equals the stored revision
- **THEN** the write succeeds and the response returns the new `baseSha`

#### Scenario: First write has no base

- **WHEN** no `plan.json` exists yet and a client writes a plan
- **THEN** the write succeeds and does not require a `baseSha`

### Requirement: Tasks anchor to notes and columns

Every plan node SHALL optionally anchor to a note-tree node through `anchorNodeId`. A task created while the planner is opened for a specific note or column SHALL anchor to that node. A task created without a node context SHALL carry no anchor and SHALL be reported as unclassified.

#### Scenario: Task anchored to the opened node

- **WHEN** a user creates a task from the planner opened for a given note or column
- **THEN** the created task's `anchorNodeId` is that node's id

#### Scenario: Task without node context

- **WHEN** a user creates a task from the global task centre without choosing a note or column
- **THEN** the task is stored with no anchor and appears under the unclassified bucket

#### Scenario: Anchor is independent of nesting

- **WHEN** a task anchored to node A contains a child task
- **THEN** the child may carry its own anchor or inherit none, and nesting is preserved regardless of the anchors involved

### Requirement: Parent scope aggregates descendant tasks

Opening the planner for a node SHALL present tasks anchored to that node and to every descendant node of that node in the note tree, grouped in the tree's own hierarchy. A task whose anchor is deeper than the opened node SHALL be visible in the opened node's planner.

#### Scenario: Column planner shows descendant tasks

- **WHEN** a column contains a sub-column with a task anchored to a note inside it
- **THEN** the column's planner shows that task

#### Scenario: Sibling tasks excluded

- **WHEN** a node has siblings carrying their own anchored tasks
- **THEN** those sibling tasks do not appear in this node's planner

#### Scenario: Aggregation needs no extra fetch

- **WHEN** a user opens the planner for a deeply nested node
- **THEN** the visible task set is derived from the already-loaded plan document and the note tree, without a per-descendant request

#### Scenario: Node with no tasks

- **WHEN** a node and all of its descendants carry no anchored task
- **THEN** the planner shows an empty state instead of an error

### Requirement: Completion rolls up as progress only

Completing or un-completing a task SHALL be the only way a task's `done` flag changes. The system SHALL NOT automatically set a parent task to done when all of its children are done, and SHALL NOT automatically reopen a parent when a child is reopened. Aggregated progress SHALL be reported as a completed-over-total count for each parent scope.

#### Scenario: All children done leaves parent open

- **WHEN** every child of a task is marked done and the parent itself was never marked done
- **THEN** the parent remains not done and its recorded progress is shown as full

#### Scenario: Parent progress counts descendants

- **WHEN** a parent scope contains nested tasks
- **THEN** its progress counts every descendant task, not only direct children

#### Scenario: Reopening a child does not touch the parent

- **WHEN** an already-done child is un-completed while its parent is done
- **THEN** the parent's `done` flag is unchanged

### Requirement: Completion records a timestamp

Marking a task done SHALL record `doneAt`. Un-completing a task SHALL clear `doneAt` so that a task still open is never reported as completed at a past time.

#### Scenario: Done stamps the time

- **WHEN** a user marks a task done
- **THEN** the task stores a `doneAt` timestamp and reports as done

#### Scenario: Undone clears the time

- **WHEN** a user un-completes a task that had a `doneAt`
- **THEN** `doneAt` is removed

### Requirement: Anchored tasks survive tree restructuring

Moving a node within the note tree SHALL preserve the anchors of the tasks under it, and those tasks SHALL follow the node to its new parent. Deleting a node SHALL remove every task anchored to that node and to all of its descendants, together with their subtrees.

#### Scenario: Move follows the node

- **WHEN** a column with anchored tasks is moved under a different parent column
- **THEN** its tasks are still anchored to it and now aggregate into the new parent's planner

#### Scenario: Delete cascades

- **WHEN** a node is deleted
- **THEN** the tasks anchored to it and to its descendants are removed from the plan in the same operation

#### Scenario: Unrelated tasks untouched

- **WHEN** a node is deleted
- **THEN** tasks anchored outside that node's subtree, and unclassified tasks, are unchanged

### Requirement: Deleting a node warns when it discards tasks

Because deleting a node discards its anchored tasks irreversibly, the system SHALL inform the user how many tasks will be discarded before the deletion is carried out.

#### Scenario: Count shown before delete

- **WHEN** a user deletes a node that has anchored tasks in its subtree
- **THEN** the confirmation states how many tasks will be discarded

#### Scenario: No prompt without tasks

- **WHEN** a user deletes a node whose subtree carries no anchored tasks
- **THEN** the deletion proceeds with the existing confirmation behaviour and no task warning

### Requirement: Reminders are migrated into the plan

On first plan load for a user who has legacy reminder data, the system SHALL copy every reminder that is not already represented in the plan into the plan as an unclassified top-level task, preserving the reminder's id, text, completion state, and creation time. The migration SHALL be idempotent.

#### Scenario: Legacy reminders become tasks

- **WHEN** a user with existing reminders loads the plan for the first time
- **THEN** each reminder appears once as an unclassified task with its original completion state

#### Scenario: Migration runs once

- **WHEN** the plan is loaded again after a completed migration
- **THEN** no duplicate tasks are created and the legacy file is left readable but unused

#### Scenario: Completed reminders stay completed

- **WHEN** a legacy reminder was already marked done
- **THEN** the migrated task is done and carries the legacy completion state rather than reopening

### Requirement: Note edits no longer create tasks

Saving a note SHALL NOT create, update, or delete any plan task. Task creation SHALL happen only through the planner.

#### Scenario: Checkbox text is inert

- **WHEN** a note body contains `- [ ] something` and the note is saved
- **THEN** no plan task is created or modified

#### Scenario: Scheduled strategies do not harvest tasks

- **WHEN** the scheduled AI strategy run executes its actions
- **THEN** no todo-extraction action writes into the plan or into reminders
