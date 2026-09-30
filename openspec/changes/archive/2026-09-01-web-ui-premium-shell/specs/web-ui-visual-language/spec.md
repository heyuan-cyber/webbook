## Purpose

Defines the WebBook premium visual language for the web app: a consistent dark UI built from one shared token set, with material depth (glass, accent glow, aurora/grain) that stays accessible and respects the user's motion preference.

## ADDED Requirements

### Requirement: Consistent elevated visual language

The app SHALL present a coherent dark, premium visual language across the app shell, sidebar, and content, derived from a single custom-property token set (surface elevation hierarchy, text, accent, radius, shadow) so surfaces look intentional rather than ad-hoc.

#### Scenario: Surfaces use shared tokens

- **WHEN** any chrome panel, the sidebar, or a card is rendered
- **THEN** its background, border, radius, and shadow resolve from the shared token set rather than per-component literal colors

#### Scenario: Theme is centrally changeable

- **WHEN** a shared accent or surface token changes
- **THEN** the change is reflected consistently across surfaced chrome without per-component edits

### Requirement: Accessible contrast

The app SHALL keep informational and interactive text at WCAG AA contrast on the surface it appears on, for the default dark theme.

#### Scenario: Text contrast on surfaces

- **WHEN** the app renders body or secondary text over any chrome or content surface
- **THEN** the text meets AA contrast against that surface

#### Scenario: Chrome does not obscure content

- **WHEN** a glass chrome surface is shown over content
- **THEN** underlying content remains visually distinguishable and readable

### Requirement: Depth and materiality

The app SHALL convey depth using translucent glass/backdrop blur on primary chrome and an accent glow/state on interactive and selected elements, without degrading readability.

#### Scenario: Glass chrome

- **WHEN** the topbar, the sidebar, or a floating panel is displayed over page content
- **THEN** it uses a translucent backdrop with blur and a visible border

#### Scenario: Interactive and selected state

- **WHEN** an interactive element is focused, hovered, or active, or a selected block is active
- **THEN** it shows an accent-colored state/glow in addition to its base style

### Requirement: Motion safety

The app SHALL honor the user's reduced-motion preference for any decorative or non-essential animation introduced by this change.

#### Scenario: Reduced motion

- **WHEN** the user's `prefers-reduced-motion` is active
- **THEN** the aurora/grain background and non-essential transitions are disabled or rendered static

#### Scenario: Default motion

- **WHEN** the user has no reduced-motion preference
- **THEN** the aurora/grain background may animate gently and transitions may run
