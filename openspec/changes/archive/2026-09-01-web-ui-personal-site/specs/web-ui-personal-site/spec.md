## Purpose

Defines the WebBook personal website homepage: a visual portfolio built from the author's public posts and their column structure, featuring a hero, a Demo showcase, and knowledge-domain cards, with rich motion.

## ADDED Requirements

### Requirement: Feed covers

The public feed SHALL carry each post's cover image (the first image `src` in the note's blocks), so cards can show real images.

#### Scenario: Cover present

- **WHEN** a public post has an image block
- **THEN** its feed item carries that image's `src` as `cover`

### Requirement: Homepage hero

The app SHALL show an animated hero on the personal homepage with the author's avatar, name, a tagline, and a post search.

#### Scenario: Hero

- **WHEN** the homepage opens
- **THEN** a hero with identity, tagline, and search is shown

### Requirement: Demo showcase

The app SHALL render a self-scrolling showcase of cover-image cards (a marquee) from the author's public posts.

#### Scenario: Marquee

- **WHEN** the homepage has posts with covers
- **THEN** they auto-scroll in a marquee and pause/highlight on hover

### Requirement: Knowledge-domain cards

The app SHALL render the author's top-level columns as cards (cover/count/latest posts) that link to the column's posts.

#### Scenario: Domain cards

- **WHEN** the homepage renders
- **THEN** each top-level column is a card with its posts

### Requirement: Homepage entry points

The app SHALL let a signed-in user open their own homepage from the notebook, and open any author's homepage from an article's author area.

#### Scenario: Own homepage

- **WHEN** a signed-in user is in the notebook
- **THEN** an entry opens their homepage, and the homepage can return to the notebook

#### Scenario: Author homepage

- **WHEN** a reader is on an article
- **THEN** the author area links to that author's homepage
