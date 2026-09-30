## Purpose

Defines WebBook's motion layer: deliberate, token-driven transition and micro-interaction animation for routes, the stage editor, and chrome (menus/toasts), which always respects the user's reduced-motion preference.

## Requirements

### Requirement: Route transitions

The app SHALL animate route changes with a short, tasteful transition (fade/translate) when moving between primary routes.

#### Scenario: Route change

- **WHEN** the user navigates between primary routes
- **THEN** the outgoing and incoming views transition smoothly with a subtle fade/translate

### Requirement: Stage canvas motion

The app SHALL animate the stage editor's camera pan/zoom with eased inertia and animate blocks on insert/remove.

#### Scenario: Canvas pan and zoom

- **WHEN** the stage canvas is panned or zoomed
- **THEN** camera movement is eased/inertial rather than abrupt

#### Scenario: Block enter and exit

- **WHEN** a block is inserted or removed
- **THEN** it animates a subtle enter/exit transition

### Requirement: Chrome motion

The app SHALL animate menus/popovers and toasts on open/close with a consistent, short transition.

#### Scenario: Menu and popover

- **WHEN** a menu/popover opens or closes
- **THEN** it fades/scales in and out smoothly

#### Scenario: Toast

- **WHEN** a toast appears or dismisses
- **THEN** it slides/fades in and out

### Requirement: Motion safety

The app SHALL honor the user's reduced-motion preference, disabling non-essential animation while preserving functional states.

#### Scenario: Reduced motion

- **WHEN** `prefers-reduced-motion` is active
- **THEN** route/stage/chrome animations are disabled or reduced to instant state changes
