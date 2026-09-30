## Purpose

Defines the cinematic neon personal homepage and its self-set featured-work spotlight: a full-screen hero, a spotlight for a user-pinned post (or a placeholder), a cover marquee, neon domain cards, a masonry works grid, and a notebook star control.

## ADDED Requirements

### Requirement: Self-set featured work

The app SHALL let a signed-in user set (and unset) a featured note from the notebook, and the personal homepage SHALL spotlight that note (or show a placeholder when none is set).

#### Scenario: Set featured

- **WHEN** the author stars a note in the notebook
- **THEN** it is stored as the author's featured note

#### Scenario: Homepage spotlight

- **WHEN** the homepage has a featured note
- **THEN** that note is shown as a large spotlight card

#### Scenario: No featured

- **WHEN** no note is featured
- **THEN** the homepage shows a placeholder spotlight

### Requirement: Cinematic hero

The app SHALL render a full-screen hero on the personal homepage with a layered aurora/particle background, mouse-following glow, the author's avatar and name, and stats.

#### Scenario: Hero

- **WHEN** the homepage opens
- **THEN** the hero shows identity, stats, and an animated composition

### Requirement: Neon domain/marquee/masonry

The app SHALL render the author's columns as neon cards (3D tilt + glow), a large cover marquee, and a masonry "all works" grid.

#### Scenario: Domain cards

- **WHEN** the homepage renders
- **THEN** each top-level column is a neon card with its posts

#### Scenario: Marquee & masonry

- **WHEN** the homepage has covered posts
- **THEN** they auto-scroll in a marquee and appear in a masonry grid
