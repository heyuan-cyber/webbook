## Purpose

Defines WebBook's blog-post reading affordances: a scroll-progress bar that shows how far the reader has advanced through the article.
## Requirements
### Requirement: Reading progress bar

The app SHALL show a thin, fixed progress bar at the top of a blog post that fills according to the reader's scroll position through the article.

#### Scenario: Scroll progresses

- **WHEN** the reader scrolls through the article
- **THEN** the bar fills proportionally from 0% to 100%

#### Scenario: Top and bottom

- **WHEN** the article is at the top
- **THEN** the bar is empty; at the end it is full

### Requirement: Article table of contents

The app SHALL show a persistent right-side table of contents on an article page, built from heading blocks (level 1/2/3). Clicking an entry SHALL scroll the article to that section, and the entry for the section currently in view SHALL be highlighted.

#### Scenario: TOC lists headings

- **WHEN** an article contains heading blocks
- **THEN** the TOC lists them in document order, indented by level

#### Scenario: Click to navigate

- **WHEN** the reader clicks a TOC entry
- **THEN** the article scrolls to that section

#### Scenario: Active section highlighted

- **WHEN** the reader scrolls through the article
- **THEN** the TOC entry for the section in view is highlighted

### Requirement: Article content fits narrow viewports

The article page SHALL fit narrow (mobile) viewports: long unbreakable strings (file paths, URLs, code) SHALL wrap rather than widen the page, and the article column SHALL never exceed the viewport width.

#### Scenario: Long unbreakable string wraps

- **WHEN** an article contains a long string with no spaces (e.g. a Windows file path)
- **THEN** it wraps and the page has no horizontal overflow

#### Scenario: Article column fits

- **WHEN** an article is viewed at a phone width
- **THEN** the article column is no wider than the viewport and body text is fully visible

