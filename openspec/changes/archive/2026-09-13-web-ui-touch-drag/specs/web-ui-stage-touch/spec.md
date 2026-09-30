## Purpose

Defines touch interaction for the note editor's stage canvas so the editor is usable on phones: one-finger panning, reliable panel dragging, mouse-only marquee selection, and two-finger zoom.

## ADDED Requirements

### Requirement: Single-finger pan on the stage

The editor stage SHALL pan the canvas when the user drags with a single finger (touch or pen) on blank canvas, so the view can be moved without a mouse.

#### Scenario: One-finger pan on blank canvas

- **WHEN** the user drags one finger on empty stage canvas
- **THEN** the canvas pans, following the finger

#### Scenario: Pinch zoom unchanged

- **WHEN** the user pinches with two fingers
- **THEN** the canvas zooms as before

### Requirement: Marquee selection is mouse-only

Box (marquee) selection on the stage SHALL be triggered only by a mouse pointer, never by touch.

#### Scenario: Touch does not start a marquee

- **WHEN** the user drags a finger on blank canvas
- **THEN** no marquee selection rectangle appears

#### Scenario: Mouse still marquees

- **WHEN** the user left-click drags on blank canvas with a mouse
- **THEN** the marquee selection rectangle appears as before

### Requirement: Panels drag on touch

Stage panels (absolute-positioned blocks) SHALL be draggable with a finger; the browser SHALL not hijack the gesture as scrolling or selection.

#### Scenario: Drag a panel with a finger

- **WHEN** the user drags a panel on the stage with one finger
- **THEN** the panel moves with the finger and its placement is committed on release

#### Scenario: Block drag takes precedence over pan

- **WHEN** a one-finger drag starts on a panel rather than blank canvas
- **THEN** the panel moves (the canvas does not pan)
