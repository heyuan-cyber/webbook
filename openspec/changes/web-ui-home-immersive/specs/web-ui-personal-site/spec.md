## MODIFIED Requirements

### Requirement: Homepage hero

The app SHALL show an immersive, full-viewport hero on the personal homepage with the author's avatar (as a badge), name, an overline tagline, a scroll cue, and entry actions. The hero background SHALL be a layered fixed cinematic gradient with film grain that does not depend on any post cover.

#### Scenario: Hero

- **WHEN** the homepage opens
- **THEN** a full-viewport immersive hero is shown with a fixed gradient + grain background, a badge avatar, an oversized glowing display name, an overline tagline, a scroll cue, and entry actions

#### Scenario: Hero without any cover

- **WHEN** the author has no post with a cover
- **THEN** the hero still renders using its fixed gradient + grain background

#### Scenario: Hero scrolls away

- **WHEN** the user scrolls past the hero
- **THEN** the hero content fades/hides, easing into the content below

### Requirement: Featured work hero spot

The app SHALL elevate the starred (★) public post into a wide, movie-poster-like feature card at the top of the homepage, showing its cover, title, summary, kicker, and a call to action; when no post is starred it SHALL show a placeholder inviting the author to set one.

#### Scenario: Featured post present

- **WHEN** the author has set a starred (★) public post
- **THEN** that post is rendered as a wide feature card with cover, title, summary, kicker, and CTA that links to the post

#### Scenario: No featured post

- **WHEN** no post is starred
- **THEN** a "焦点作品待定" placeholder is shown prompting the author to star a post

#### Scenario: Hero and spot decoupled

- **WHEN** the homepage renders
- **THEN** the hero background is independent of whether a featured post exists

### Requirement: Demo showcase

The app SHALL render a self-scrolling showcase of cover-image cards (a marquee) from the author's public posts, presented as a titled "作品演示" band.

#### Scenario: Marquee

- **WHEN** the homepage has posts with covers
- **THEN** they auto-scroll in a titled marquee band and pause/highlight on hover

### Requirement: Knowledge-domain cards

The app SHALL render the author's top-level columns as numbered discipline sections ("01 …", "02 …"), each with a title, a short lede, and its own responsive card stream linking to the column's posts.

#### Scenario: Domain cards

- **WHEN** the homepage renders
- **THEN** each top-level column is a numbered discipline section with its posts

#### Scenario: Discipline navigation

- **WHEN** a reader selects a discipline
- **THEN** the section's posts are shown, and the reader can return to the full list
