## ADDED Requirements

### Requirement: Single-scroll homepage

The app SHALL present the personal homepage as a single continuously scrolling page that contains, in order, the hero, the 项目示例 (work) section, and the 博客 (blog) section, followed by a footer.

#### Scenario: Single scroll

- **WHEN** the homepage opens
- **THEN** the hero, work, and blog sections are stacked in one scrollable page rather than switched into separate views

### Requirement: Scroll-spy tab navigation

The app SHALL show the homepage navigation in the visual form of tabs (首页 / 项目示例 / 博客) that act as in-page anchors: clicking a tab scrolls the single-scroll page to its section, and scrolling the page highlights the tab corresponding to the section currently in view.

#### Scenario: Click tab scrolls

- **WHEN** the reader clicks a navigation tab
- **THEN** the page smoothly scrolls to that tab's section

#### Scenario: Scrolling highlights tab

- **WHEN** the reader scrolls the single-scroll page
- **THEN** the tab matching the currently visible section is highlighted

### Requirement: Owner-only settings

The app SHALL keep the owner-only 设置 (settings) entry available only to the signed-in owner and present it as a separate route or panel, not as a scroll section of the single-scroll homepage.

#### Scenario: Owner settings

- **WHEN** the signed-in owner opens the homepage
- **THEN** a separate 设置 entry is available that does not participate in the single-scroll sections

## MODIFIED Requirements

### Requirement: Homepage hero

The app SHALL show a full-screen hero on the personal homepage that presents the author's identity as an oversized serif wordmark (the author name) with a small overline label, a sub-line, and a marquee band, rendered on a pure-black background with a single accent color, at full width with no centered gutter.

#### Scenario: Hero

- **WHEN** the homepage opens
- **THEN** a pure-black full-screen hero showing the author's name as an oversized serif wordmark, an overline tagline, a sub-line, and a marquee band is shown

#### Scenario: Hero without any cover

- **WHEN** the author has no post with a cover
- **THEN** the hero still renders (it does not depend on any post cover)

#### Scenario: Scroll through hero, forward and back

- **WHEN** the reader scrolls down and then back up on the homepage
- **THEN** the page scrolls smoothly in both directions through the hero and the sections below it

#### Scenario: Hero scrolls to next tab

- **WHEN** the reader scrolls to the end of the hero
- **THEN** the page continues into the 项目示例 (work) section, and the navigation highlights it

### Requirement: Knowledge-domain cards

The app SHALL render the author's selected work (项目示例) and blog (博客) posts as cards (cover/count/latest posts) that link to the corresponding post, and SHALL render the author's top-level columns as cards that link to the column's posts.

#### Scenario: Work and blog cards

- **WHEN** the homepage renders the work section
- **THEN** each selected work note is a card linking to its post

#### Scenario: Blog cards

- **WHEN** the homepage renders the blog section
- **THEN** each blog post is grouped by category and shown as a card linking to its post

#### Scenario: Domain cards

- **WHEN** the homepage renders
- **THEN** each top-level column is a card with its posts

## REMOVED Requirements

### Requirement: Multi-tab site shell

**Reason**: The homepage was redesigned from a state-switching multi-tab shell into a single-scroll page with anchor tabs; the tab bar no longer switches the content area, it scrolls to a section.

**Migration**: Use the "Single-scroll homepage" and "Scroll-spy tab navigation" requirements instead; 首页/项目示例/博客 are now in-page sections, and 设置 remains an owner-only panel.
