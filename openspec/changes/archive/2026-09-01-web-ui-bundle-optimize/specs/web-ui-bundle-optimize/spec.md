## Purpose

Defines WebBook's initial-load performance: heavy route/editor bundles load lazily so the first paint is fast.

## ADDED Requirements

### Requirement: Lazy route bundles

The app SHALL defer heavy page and editor bundles until the corresponding route is needed, keeping the initial bundle small.

#### Scenario: Initial load

- **WHEN** the app shell loads
- **THEN** only the shell and shared code load initially; route pages load on navigation

#### Scenario: Route navigation

- **WHEN** the user navigates to a lazy route
- **THEN** that route's chunk loads and renders without blocking the shell
