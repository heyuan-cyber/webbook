## Purpose

Defines nested column categorization: posts carry their full column path and the personal homepage groups them in a nested tree with breadcrumbs.

## Requirements

### Requirement: Full column path

The public feed SHALL carry a post's complete ancestor-column path as `category` (e.g. `技术 / Jetpack`); root-level notes stay uncategorized.

#### Scenario: Nested post

- **WHEN** a public post sits under nested folders
- **THEN** its `category` is the full path of ancestor folders

#### Scenario: Root post

- **WHEN** a public post is at the tree root
- **THEN** it is uncategorized

### Requirement: Nested homepage grouping

The app SHALL render the personal homepage as a nested category tree (top-level column → sub-columns → posts), with a breadcrumb on each post card and top-level columns filterable.

#### Scenario: Nested sections

- **WHEN** the homepage has posts in nested columns
- **THEN** each column level renders its posts under its heading

#### Scenario: Breadcrumb

- **WHEN** a post card renders
- **THEN** it shows its full column breadcrumb
