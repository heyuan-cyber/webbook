## Purpose

Defines the high-end personal blog homepage: a hero with the author's identity and stats, a featured post, and the author's posts grouped by category with filters and reveal effects. Works for the signed-in author and any other author.

## ADDED Requirements

### Requirement: Homepage hero and stats

The app SHALL show a hero on the personal blog homepage with the author's avatar, name, a bio line, and counts (posts / categories).

#### Scenario: Own and others

- **WHEN** a reader opens any author's homepage
- **THEN** the hero shows the author identity and stats

### Requirement: Featured post

The app SHALL feature the most recent public post as a large card.

#### Scenario: Featured card

- **WHEN** the author has at least one public post
- **THEN** the most recent is shown prominently

### Requirement: Category grouping and filter

The app SHALL group the author's posts by their source category and let the reader filter by category (uncategorized posts under "未分类").

#### Scenario: Category sections

- **WHEN** the homepage has posts across categories
- **THEN** each category shows a titled section with its posts

#### Scenario: Filter by category

- **WHEN** the reader selects a category pill
- **THEN** only that category's posts are shown
