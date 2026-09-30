## ADDED Requirements

### Requirement: Notebook editor toolbar on mobile

The note editor SHALL present a compact, usable toolbar on narrow viewports, rather than a stretched vertical stack of full-width controls, and its content SHALL not widen the page horizontally.

#### Scenario: Compact toolbar

- **WHEN** the note editor is viewed at a phone width
- **THEN** the editor toolbar is compact (not a tall column of stretched buttons) and its controls remain reachable

#### Scenario: No editor overflow

- **WHEN** a note contains a long unbreakable string or a wide block
- **THEN** the editor page does not overflow horizontally
