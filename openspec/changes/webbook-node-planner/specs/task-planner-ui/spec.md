## Purpose

Puts planning where the content already lives: a planner button on every note and column row in the sidebar opens a task manager for that node and everything beneath it, and a top-bar task centre reports the whole notebook's planned and completed work, so the user never has to leave the note they are working on to plan it.

## ADDED Requirements

### Requirement: Planner entry on every tree row

Each note and column row in the sidebar SHALL expose a planner action alongside its existing rename and delete actions. Activating it SHALL open the planner scoped to that node.

#### Scenario: Action available on notes and columns

- **WHEN** a user hovers a note row or a column row in the sidebar
- **THEN** a planner action is offered next to the existing rename and delete actions

#### Scenario: Opens scoped to the node

- **WHEN** the user activates the planner action on a column
- **THEN** the planner opens showing the tasks of that column and its descendants

#### Scenario: Works on collapsed columns

- **WHEN** the user activates the planner action on a collapsed column
- **THEN** the planner still opens with the full descendant task set and does not require expanding the row first

#### Scenario: Guests are told to sign in

- **WHEN** a guest activates the planner action
- **THEN** the app explains that planning requires signing in and offers a link to the login page, and no planner data is requested

### Requirement: Planner tabs

The planner SHALL present three tabs: TODO, completed, and statistics. TODO SHALL be the default tab.

#### Scenario: Default tab

- **WHEN** the planner opens
- **THEN** the TODO tab is selected

#### Scenario: Switching tabs preserves scope

- **WHEN** the user switches tabs inside a node-scoped planner
- **THEN** every tab reports data for the same node scope

### Requirement: TODO tab shows a nested editable tree

The TODO tab SHALL list the scope's unfinished tasks as a nested tree that preserves parent-child structure, showing for each task its title, its planned completion date when set, and its priority. Completed tasks SHALL NOT be listed in this tab.

#### Scenario: Nested rendering

- **WHEN** a task has unfinished children
- **THEN** the children render nested under the parent

#### Scenario: Completed tasks leave the list

- **WHEN** the user marks a task done
- **THEN** it disappears from the TODO tab and appears in the completed tab

#### Scenario: Planned date and priority visible

- **WHEN** a task has a planned completion date and a priority set
- **THEN** both are visible on the task row without opening it

#### Scenario: Parent progress visible

- **WHEN** a task has descendants
- **THEN** its completed-over-total progress is visible on the task row

#### Scenario: Overdue emphasis

- **WHEN** an unfinished task's planned completion date is in the past
- **THEN** that date is visually distinguished as overdue

#### Scenario: Empty scope

- **WHEN** the scope has no unfinished tasks
- **THEN** the TODO tab shows an empty state with a way to add the first task

### Requirement: Task creation and nesting

The TODO tab SHALL let the user create a task at the scope's top level and as a child of any existing task. New tasks SHALL be created unfinished, and a task created as a child SHALL render nested immediately.

#### Scenario: Create at top level

- **WHEN** the user adds a task without selecting a parent
- **THEN** the new task appears at the top level of the scope

#### Scenario: Create as a child

- **WHEN** the user adds a task from a specific task's add-child action
- **THEN** the new task is nested under that task

#### Scenario: New task defaults

- **WHEN** a task is created
- **THEN** it is unfinished, carries no planned completion date, and uses the lowest priority

#### Scenario: Depth is not artificially limited

- **WHEN** the user nests a task several levels deep
- **THEN** the nesting is preserved and re-rendered

### Requirement: Task fields are editable

The user SHALL be able to edit a task's title, its free-text note, its planned completion date, and its priority from the planner. Clearing the planned completion date SHALL remove it.

#### Scenario: Edit title in place

- **WHEN** the user edits a task title and confirms
- **THEN** the new title is shown and persisted

#### Scenario: Set and clear the planned date

- **WHEN** the user sets a planned completion date and later clears it
- **THEN** the task first reports that date and afterwards reports no planned date

#### Scenario: Priority change reflects in ordering cues

- **WHEN** the user changes a task's priority
- **THEN** the row reflects the new priority

### Requirement: Drag to reorder and re-nest

The TODO tab SHALL support dragging a task to change its position among siblings and to move it into or out of another task's children.

#### Scenario: Reorder among siblings

- **WHEN** the user drags a task above or below a sibling
- **THEN** the sibling order changes accordingly and persists

#### Scenario: Nest by dragging

- **WHEN** the user drags a task onto another task's child drop zone
- **THEN** the dragged task becomes a child of that task

#### Scenario: Un-nest by dragging

- **WHEN** the user drags a child task to a top-level position in the scope
- **THEN** the task becomes a top-level task of the scope

#### Scenario: A task does not become its own descendant

- **WHEN** the user drags a task onto one of its own descendants
- **THEN** the move is rejected and the tree is left unchanged

#### Scenario: Dragging moves the whole subtree

- **WHEN** the user drags a task that has children
- **THEN** the entire subtree moves with it

### Requirement: Completion is reversible

The user SHALL be able to mark a task done and to un-complete it. Un-completing SHALL return the task to the TODO tab in its original nesting position.

#### Scenario: Complete from the TODO tab

- **WHEN** the user checks a task in the TODO tab
- **THEN** it is recorded done with the current time

#### Scenario: Un-complete from the completed tab

- **WHEN** the user un-completes a task in the completed tab
- **THEN** it returns to the TODO tab under its original parent

#### Scenario: Parent row does not auto-complete

- **WHEN** the user completes the last unfinished child of a task
- **THEN** the parent stays unfinished and only its progress changes

### Requirement: Task deletion is undoable for a short window

Deleting a task SHALL remove it and its whole subtree immediately, and SHALL offer a brief undo affordance. Using the undo SHALL restore the removed subtree with its original structure and field values.

#### Scenario: Delete offers undo

- **WHEN** the user deletes a task
- **THEN** the task and its descendants disappear and an undo affordance is shown for a few seconds

#### Scenario: Undo restores the subtree

- **WHEN** the user activates undo within the window
- **THEN** the task and all of its descendants return with their original nesting, completion states, dates, and priorities

#### Scenario: Undo window expires

- **WHEN** the undo affordance lapses without being used
- **THEN** the deleted tasks stay deleted and no further prompt is shown

#### Scenario: Deleting a parent warns about descendants

- **WHEN** the user deletes a task that has descendants
- **THEN** the confirmation states how many tasks will be removed along with it

### Requirement: Completed tab

The completed tab SHALL list the scope's completed tasks in reverse completion order, showing each task's completion time, and SHALL let the user narrow the list to a recent time range.

#### Scenario: Reverse completion order

- **WHEN** several tasks have been completed
- **THEN** the most recently completed appears first

#### Scenario: Completion time shown

- **WHEN** a completed task is listed
- **THEN** its completion time is shown

#### Scenario: Time range filter

- **WHEN** the user selects a recent time range
- **THEN** only tasks completed inside that range are listed

#### Scenario: Un-completing removes it from the list

- **WHEN** the user un-completes a task from this tab
- **THEN** it leaves the completed list

### Requirement: Statistics tab

The statistics tab SHALL report, for the current scope, the overall completion count and rate, the number of overdue unfinished tasks, the number of tasks completed within the last seven days, and the distribution of unfinished tasks by priority. A task SHALL be counted once in every figure it qualifies for, and a task SHALL never be counted twice in a single figure.

#### Scenario: Scope totals

- **WHEN** the user opens the statistics tab for a scope
- **THEN** it reports completed-over-total tasks and the completion rate for that scope

#### Scenario: Overdue figure

- **WHEN** a scope contains unfinished tasks whose planned completion date has passed
- **THEN** the overdue figure equals that count and excludes tasks with no planned date

#### Scenario: Recent completions figure

- **WHEN** tasks were completed within the last seven days
- **THEN** the statistics tab reports how many

#### Scenario: Priority distribution

- **WHEN** the scope has unfinished tasks at several priorities
- **THEN** the tab reports how many unfinished tasks sit at each priority

#### Scenario: Empty scope statistics are defined

- **WHEN** the scope has no tasks at all
- **THEN** the statistics tab reports zeroed figures rather than an error or an undefined rate

### Requirement: Global task centre

The top bar SHALL offer a task centre entry that opens the same planner surface with the whole notebook as its scope, aggregating tasks from every note and column, and additionally exposing the tasks that have no anchor as an unclassified bucket.

#### Scenario: Whole notebook scope

- **WHEN** the user opens the task centre from the top bar
- **THEN** it shows tasks from every note and column of the notebook

#### Scenario: Unclassified bucket

- **WHEN** tasks exist that are anchored to no note or column
- **THEN** the task centre shows them in a distinct unclassified section

#### Scenario: Unclassified tasks are actionable

- **WHEN** an unclassified task is listed
- **THEN** it can be completed, edited, reordered, deleted, and anchored to a note or column

#### Scenario: Same surface as the node planner

- **WHEN** the user compares the task centre with a node planner
- **THEN** both offer the TODO, completed, and statistics tabs, differing only in scope

#### Scenario: Anchoring from the task centre

- **WHEN** the user anchors an unclassified task to a note or column
- **THEN** the task afterwards appears in that node's planner and no longer under unclassified

### Requirement: Planning is decoupled from note editing

Editing and saving a note SHALL NOT be required to persist planner changes, and planner changes SHALL NOT mark the note as modified or trigger a note save.

#### Scenario: Task edits do not dirty the note

- **WHEN** the user changes tasks while a note is open
- **THEN** the note's saved content and modified state are unaffected

#### Scenario: Note edits do not disturb planning

- **WHEN** the user edits and saves the open note
- **THEN** the planner's tasks and their state are unchanged

### Requirement: Planner state survives navigation

The planner SHALL remember whether it was left open and how its task tree was folded, so reopening it returns the user to the same view.

#### Scenario: Reopen restores folding

- **WHEN** the user collapses some tasks, closes the planner, and reopens the same scope
- **THEN** the previously collapsed tasks are still collapsed

### Requirement: Planner is usable on phones

The planner SHALL remain usable in the phone viewport, where the sidebar is drawn over the content and drag interaction is unreliable.

#### Scenario: Phone layout

- **WHEN** the planner is opened on a phone-sized viewport
- **THEN** it fills the available viewport and every action remains reachable

#### Scenario: Touch alternative to dragging

- **WHEN** the viewport is phone-sized
- **THEN** the user can still reorder and re-nest tasks without relying on drag

### Requirement: Failed writes are visible

When a planner change cannot be persisted, the app SHALL tell the user that the change was not saved remotely rather than silently discarding it, and SHALL keep the user's local change visible.

#### Scenario: Save failure surfaced

- **WHEN** a planner write fails after a retry
- **THEN** the app reports that the change did not sync and keeps the local state

#### Scenario: Conflict resolution is invisible when it succeeds

- **WHEN** a planner write first conflicts and is then reapplied against the fresh revision
- **THEN** the user sees the change applied without being interrupted by a conflict dialogue
