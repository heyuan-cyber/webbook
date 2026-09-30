## ADDED Requirements

### Requirement: Article content fits narrow viewports

The article page SHALL fit narrow (mobile) viewports: long unbreakable strings (file paths, URLs, code) SHALL wrap rather than widen the page, and the article column SHALL never exceed the viewport width.

#### Scenario: Long unbreakable string wraps

- **WHEN** an article contains a long string with no spaces (e.g. a Windows file path)
- **THEN** it wraps and the page has no horizontal overflow

#### Scenario: Article column fits

- **WHEN** an article is viewed at a phone width
- **THEN** the article column is no wider than the viewport and body text is fully visible
