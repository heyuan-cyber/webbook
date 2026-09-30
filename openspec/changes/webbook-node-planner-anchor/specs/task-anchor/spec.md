## Purpose

Makes a task's归属 unambiguous: every note and column acts as a task basket, tasks created there belong to it, a parent basket recursively reports the work of all its descendants, and the only place an ownerless task can be born is the global inbox — so a task can never be created into a place the user cannot see it again.

## ADDED Requirements

### Requirement: Creation inside a node planner anchors to that node

A task created while the planner is scoped to a note or column SHALL carry that node's id as its `anchorNodeId`. The planner SHALL NOT offer a way to create an unanchored task in that scope.

#### Scenario: Top-level task takes the scope node

- **WHEN** the user creates a top-level task in the planner opened for a note or column
- **THEN** the created task's `anchorNodeId` is that node's id

#### Scenario: Newly created task is immediately visible in that scope

- **WHEN** the user creates a task in a node-scoped planner and the write is persisted
- **THEN** the task is listed in that same planner without the user having to navigate elsewhere

#### Scenario: No unanchored option in node scope

- **WHEN** the planner is scoped to a note or column
- **THEN** the creation form offers no control whose effect is to leave the task unanchored

#### Scenario: Child task inherits the basket

- **WHEN** the user creates a child task under a task that is anchored to node A
- **THEN** the child's `anchorNodeId` is also node A

#### Scenario: Inherited anchor keeps nested tasks visible

- **WHEN** a task anchored to node A has children created within A's planner
- **THEN** the parent and its children are all visible in A's planner, with no partially visible subtree

### Requirement: Parent basket recursively collects descendant baskets

A planner scoped to a node SHALL present the tasks anchored to that node together with the tasks anchored to every descendant node of it, aggregated without a separate per-descendant request.

#### Scenario: Multi-level aggregation

- **WHEN** tasks are anchored to a column, to a sub-column, and to a note inside that sub-column
- **THEN** the planner for the top column shows all of them

#### Scenario: Tasks created deep are visible at every ancestor

- **WHEN** a task is created in the planner of a deeply nested note
- **THEN** it is visible in that note's planner and in every ancestor column's planner

#### Scenario: Sibling baskets stay separate

- **WHEN** two sibling columns each carry anchored tasks
- **THEN** neither column's planner shows the other's tasks

### Requirement: The global task centre is the inbox for unowned tasks

Creating a task in the global task centre without choosing a note or column SHALL store it with no anchor and SHALL present it under the unclassified bucket, which remains visible and actionable.

#### Scenario: Task without a chosen node is unclassified

- **WHEN** the user creates a task in the global task centre and chooses no node
- **THEN** the task is stored with no anchor and appears under the unclassified bucket

#### Scenario: Unclassified tasks stay reachable

- **WHEN** unanchored tasks exist
- **THEN** the unclassified bucket lists them and they can be edited, completed, reordered, deleted, and anchored

#### Scenario: Anchoring removes it from the bucket

- **WHEN** the user anchors an unclassified task to a note or column
- **THEN** it leaves the unclassified bucket and appears in that node's planner

### Requirement: A task's anchor is editable and clearable

A task's anchor SHALL be changeable and clearable from the planner at any scope, and the task's current anchor SHALL be visible on its row. The planner SHALL NOT offer removal of an anchor in a scope where it offers no way to set one.

#### Scenario: Row shows the current anchor

- **WHEN** a task is anchored to a note or column
- **THEN** its row displays which node it belongs to

#### Scenario: Anchor can be changed

- **WHEN** the user picks a different node for an anchored task
- **THEN** the task afterwards appears in the newly chosen node's planner and no longer in the previous one's

#### Scenario: Anchor can be cleared

- **WHEN** the user clears a task's anchor
- **THEN** the task becomes unclassified and appears in the global task centre's unclassified bucket

#### Scenario: Setting and clearing are symmetric

- **WHEN** the planner offers a way to clear a task's anchor
- **THEN** the same planner also offers a way to set it

#### Scenario: Re-anchoring survives a node move

- **WHEN** a node is moved to a different parent in the note tree
- **THEN** tasks anchored to it keep that anchor and now aggregate into the new parent's planner

### Requirement: Reordering within a basket does not change ownership

Dragging a task to change its position or nesting inside a planner SHALL preserve its `anchorNodeId`. Task nesting SHALL remain independent of note-tree nesting.

#### Scenario: Drag preserves the anchor

- **WHEN** the user drags a task to a new position or nesting depth in a node-scoped planner
- **THEN** its `anchorNodeId` is unchanged

#### Scenario: Nesting is not ownership

- **WHEN** an anchored task gains or loses children
- **THEN** neither the task's nor the children's anchors change as a result of the nesting alone
