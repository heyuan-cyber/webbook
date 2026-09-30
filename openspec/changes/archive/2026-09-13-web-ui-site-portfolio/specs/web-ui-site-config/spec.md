## Purpose

Defines per-user site configuration that curates the homepage regions: which notes feed the project (work) region, the blog region, and the blog category ordering. It is readable by any site visitor and writable only by the site owner, and is persisted in the user's profile data.

## ADDED Requirements

### Requirement: Site configuration persistence

The system SHALL store a per-user site configuration that maps notes into homepage regions (work list, blog list, blog category order). It SHALL be persisted in the user's profile data and survive reloads.

#### Scenario: Save site config

- **WHEN** the site owner saves the configuration
- **THEN** the new configuration is persisted and readable on the next load

#### Scenario: Default empty config

- **WHEN** the owner has never configured the site
- **THEN** an empty configuration is returned and each homepage region shows a placeholder

### Requirement: Owner-only write

The system SHALL allow only the site owner to modify the site configuration. Visitors SHALL be able to read it but not change it.

#### Scenario: Owner saves

- **WHEN** the site owner submits the configuration
- **THEN** it is persisted

#### Scenario: Non-owner denied

- **WHEN** a visitor who is not the site owner attempts to save
- **THEN** the request is rejected and nothing changes

### Requirement: Region note assignments

The site SHALL resolve the work region and blog region from the assigned note ids in the configuration, ordered as configured.

#### Scenario: Work region resolves

- **WHEN** the site config assigns note ids to the work region
- **THEN** the work region shows those notes in configured order, with each carrying its cover, title, and summary

#### Scenario: Blog region resolves

- **WHEN** the site config assigns note ids to the blog region
- **THEN** the blog region shows those notes, grouped by note category

### Requirement: Blog category ordering

The SHALL let the owner configure the order/grouping of blog categories; when not configured it SHALL fall back to the notes' own categories in default order.

#### Scenario: Custom order

- **WHEN** the owner provides a category order
- **THEN** the blog region groups notes according to that order

#### Scenario: Default order

- **WHEN** no category order is configured
- **THEN** the blog region groups notes by their own categories in default order
