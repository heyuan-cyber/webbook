## Purpose

Defines WebBook's blog-post sharing: a one-click control that shares or copies the current article URL.

## ADDED Requirements

### Requirement: Share article

The app SHALL provide a share button on a blog post that shares the current URL via the platform share sheet when available, and otherwise copies the URL to the clipboard.

#### Scenario: Native share

- **WHEN** the reader clicks the share button and the platform supports sharing
- **THEN** the platform share sheet opens with the article URL

#### Scenario: Copy fallback

- **WHEN** the reader clicks the share button and sharing is unsupported
- **THEN** the URL is copied to the clipboard and a brief confirmation is shown
