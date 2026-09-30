## Purpose

Defines WebBook's product-polish capabilities: a keyboard command palette, skeleton loaders for async surfaces, and guided empty states, so the app feels finished rather than under-constructed.
## Requirements
### Requirement: Command palette

The app SHALL provide a keyboard-invoked command palette, opened with `Ctrl/Cmd+K`, that lets the user jump to pages, search/select a note, or create a note without leaving the keyboard.

#### Scenario: Open a note by search

- **WHEN** the user presses `Ctrl/Cmd+K` and types a query
- **THEN** matching pages/notes are listed and selecting one navigates to it

#### Scenario: Create a note

- **WHEN** the user triggers "new note" from the palette
- **THEN** a new note is created and the editor opens it

#### Scenario: Dismiss

- **WHEN** the user presses `Esc` or clicks outside
- **THEN** the palette closes

### Requirement: Skeleton loaders

The app SHALL show skeleton/shimmer placeholders while async content (tree, blog feed, article) loads, instead of a raw loading text.

#### Scenario: Loading a surface

- **WHEN** the tree or blog feed is loading
- **THEN** a skeleton placeholder matching the surface's layout is shown

### Requirement: Guided empty states

The app SHALL show a guided empty state (icon, short guidance, optional CTA) when meaningful content is empty, instead of bare muted text.

#### Scenario: Empty tree

- **WHEN** the user has no notes yet
- **THEN** an empty state with a "create note" CTA is shown

#### Scenario: Empty blog

- **WHEN** the blog has no posts
- **THEN** an empty state with guidance is shown

### Requirement: Community entry label

The app-shell top bar SHALL label the shared public space as "社区" (where the reader can see everyone's posts), distinct from an author's own personal homepage.

#### Scenario: Community label

- **WHEN** a signed-in user is in the app shell
- **THEN** the shared public space entry is labeled "社区" and links to the community feed

### Requirement: No featured control in editor

The note editor SHALL NOT show a featured/star ("设置焦点") control on the note editor header.

#### Scenario: No star button

- **WHEN** the note editor header renders a writable note
- **THEN** no "设焦点 / 焦点" button is shown

### Requirement: Notebook editor toolbar on mobile

The note editor SHALL present a compact, usable toolbar on narrow viewports, rather than a stretched vertical stack of full-width controls, and its content SHALL not widen the page horizontally.

#### Scenario: Compact toolbar

- **WHEN** the note editor is viewed at a phone width
- **THEN** the editor toolbar is compact (not a tall column of stretched buttons) and its controls remain reachable

#### Scenario: No editor overflow

- **WHEN** a note contains a long unbreakable string or a wide block
- **THEN** the editor page does not overflow horizontally

