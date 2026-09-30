## MODIFIED Requirements

### Requirement: Homepage hero

The app SHALL show an animated hero on the personal homepage with the author's avatar, name, a tagline, and a post search. The hero SHALL render as a full-viewport cinematic intro with a fixed gradient + grain background that does not depend on any post cover, an overline pill, an oversized two-line serif display heading (the second line italic with a gradient), a subtitle, and game-related mouse-interactive elements.

#### Scenario: Hero

- **WHEN** the homepage opens
- **THEN** a full-viewport cinematic hero is shown with a fixed gradient + grain background, a badge avatar, an oversized glowing display heading, an overline tagline, and mouse-interactive game-themed elements

#### Scenario: Hero without any cover

- **WHEN** the author has no post with a cover
- **THEN** the hero still renders using its fixed gradient + grain background

#### Scenario: Hero scrolls to next tab

- **WHEN** the user scrolls/touches to the end of the hero content and keeps scrolling
- **THEN** the site auto-switches to the next tab (项目示例), on both desktop and mobile

### Requirement: Demo showcase

The app SHALL render a self-scrolling showcase of cover-image cards (a marquee) from the author's public posts, presented as a titled showcase band.

#### Scenario: Marquee

- **WHEN** the homepage has posts with covers
- **THEN** they auto-scroll in a titled marquee band and pause/highlight on hover

## ADDED Requirements

### Requirement: Multi-tab site shell

The app SHALL present the personal homepage as a state-driven multi-tab site with a fixed top nav whose tabs are 首页 (home, default), 项目示例 (work), 博客 (blog), and 设置 (settings), switching the content area without changing the URL.

#### Scenario: Default tab

- **WHEN** the homepage opens
- **THEN** the 首页 tab is active by default

#### Scenario: Switch tab

- **WHEN** the user clicks a tab in the top nav
- **THEN** the content area switches to that tab and the nav highlights the active one

### Requirement: Work (project) region

The app SHALL render the 项目示例 tab as a portfolio showcase from the notes assigned to the work region, with a "selected works" heading and a scrollable bento/grid of large cards (cover, title, short description, and a View Project link).

#### Scenario: Work region populated

- **WHEN** the site config assigns notes to the work region
- **THEN** they render as scrollable bento cards with cover, title, description, and View Project

#### Scenario: Work region empty

- **WHEN** no notes are assigned to the work region
- **THEN** a placeholder is shown prompting configuration

### Requirement: Blog region

The app SHALL render the 博客 tab grouped by note category, with cards showing cover, title, summary, and date.

#### Scenario: Blog region grouped

- **WHEN** the site config assigns notes to the blog region
- **THEN** they are shown grouped by category with cover, title, summary, and date

#### Scenario: Blog region empty

- **WHEN** no notes are assigned to the blog region
- **THEN** a placeholder is shown prompting configuration

### Requirement: Owner-gated settings

The app SHALL show the 设置 tab only to the site owner, who can assign notes to each region and persist the configuration.

#### Scenario: Owner sees settings

- **WHEN** the signed-in user is the site owner
- **THEN** the 设置 tab is visible and the owner can edit and save the region assignments

#### Scenario: Non-owner does not see settings

- **WHEN** a visitor is not the site owner
- **THEN** the 设置 tab is not shown

### Requirement: Homepage entry points

The app SHALL let a signed-in user open their own homepage from the notebook, and open any author's homepage from an article's author area.

#### Scenario: Own homepage

- **WHEN** a signed-in user is in the notebook
- **THEN** an entry opens their homepage, and the homepage can return to the notebook

#### Scenario: Author homepage

- **WHEN** a reader is on an article
- **THEN** the author area links to that author's homepage
