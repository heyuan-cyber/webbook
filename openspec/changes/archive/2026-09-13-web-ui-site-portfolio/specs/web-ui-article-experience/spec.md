## ADDED Requirements

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
