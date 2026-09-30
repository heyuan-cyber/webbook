## Purpose

Defines the WebBook personal website homepage: a visual portfolio built from the author's public posts and their column structure, featuring a hero, a Demo showcase, and knowledge-domain cards, with rich motion.
## Requirements
### Requirement: Feed covers

The public feed SHALL carry each post's cover image (the first image `src` in the note's blocks), so cards can show real images.

#### Scenario: Cover present

- **WHEN** a public post has an image block
- **THEN** its feed item carries that image's `src` as `cover`

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

### Requirement: Demo showcase

The app SHALL render a self-scrolling showcase of cover-image cards (a marquee) from the author's public posts, presented as a titled showcase band.

#### Scenario: Marquee

- **WHEN** the homepage has posts with covers
- **THEN** they auto-scroll in a titled marquee band and pause/highlight on hover

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

### Requirement: Homepage entry points

The app SHALL let a signed-in user open their own homepage from the notebook, and open any author's homepage from an article's author area.

#### Scenario: Own homepage

- **WHEN** a signed-in user is in the notebook
- **THEN** an entry opens their homepage, and the homepage can return to the notebook

#### Scenario: Author homepage

- **WHEN** a reader is on an article
- **THEN** the author area links to that author's homepage

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

### Requirement: Owner "enter notebook" entry

The app SHALL show an "进入笔记本" entry in the site header when the signed-in user is the site owner, linking to the notebook.

#### Scenario: Owner sees entry

- **WHEN** a signed-in user visits their own homepage
- **THEN** the site header shows an "进入笔记本" entry that navigates to the notebook

#### Scenario: Non-owner no entry

- **WHEN** a visitor views another author's homepage
- **THEN** no "进入笔记本" entry is shown

### Requirement: Full-width site layout

The SHALL render the personal homepage content at full width (the hero spans the viewport) rather than being constrained to a narrow centered column, while the work/blog/settings sections retain their own narrower inner containers.

#### Scenario: Full-bleed hero

- **WHEN** the homepage renders
- **THEN** the hero spans the full viewport width with no centered gutter

#### Scenario: Work/blog inner container

- **WHEN** the work or blog tab renders
- **THEN** its cards are centered within a bounded inner container

### Requirement: Tab scrolling is normal

The app SHALL let the work and blog tab content scroll normally on the page (document scroll), not blocked or overridden by the home tab's scroll handling.

#### Scenario: Scroll work cards

- **WHEN** the work tab has many cards
- **THEN** the page scrolls to reveal all of them

#### Scenario: Home scroll handling removed on tab switch

- **WHEN** the reader switches away from the home tab
- **THEN** the home scroll interception is no longer active

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

### Requirement: Responsive personal site layout

The personal site SHALL adapt to narrow (mobile) viewports: content SHALL fit the viewport width without horizontal scrolling, long text (titles, category tags, the hero wordmark) SHALL wrap, and no content SHALL be clipped on short viewports.

#### Scenario: Narrow viewport fits

- **WHEN** the personal site is viewed at a phone width (e.g. 375px)
- **THEN** the page has no horizontal overflow and all content is reachable by vertical scrolling

#### Scenario: Long wordmark and tags wrap

- **WHEN** the author name or a category tag is long
- **THEN** it wraps instead of overflowing or being clipped

#### Scenario: Hero not clipped

- **WHEN** the hero is viewed on a short viewport
- **THEN** the hero's heading, subtitle, and actions remain visible (not clipped)

### Requirement: Responsive site navigation

The site top navigation SHALL remain usable on narrow viewports, presenting the section tabs as a horizontally scrollable strip rather than a tall wrapped stack.

#### Scenario: Nav on mobile

- **WHEN** the site header is viewed at a phone width
- **THEN** the section tabs are horizontally scrollable and the header stays compact

#### Scenario: Active section highlighted

- **WHEN** the reader scrolls the site
- **THEN** the tab for the section in view is highlighted (scroll-spy works against the site's scroll container)

### Requirement: Site scroll container

The site SHALL provide a reliable vertical scroll container sized to the dynamic viewport (`100dvh`), so scrolling works on mobile browsers, and the navigation scroll-spy SHALL observe that container rather than the window.

#### Scenario: Scroll works on mobile

- **WHEN** the reader scrolls the personal site on a phone
- **THEN** the content scrolls smoothly and the sticky header stays at the top

#### Scenario: Scroll-spy tracks the container

- **WHEN** the reader scrolls inside the site's own scroll container
- **THEN** the active tab updates accordingly

### Requirement: Site header on very narrow screens

The personal site header SHALL remain usable on very narrow screens, keeping the section tabs reachable and the brand from crowding them out.

#### Scenario: Narrow header

- **WHEN** the site header is viewed at a very narrow width (e.g. 320px)
- **THEN** the brand is trimmed/shortened and the section tabs remain reachable

