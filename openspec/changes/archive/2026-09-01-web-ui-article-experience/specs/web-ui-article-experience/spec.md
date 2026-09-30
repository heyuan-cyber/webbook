## Purpose

Defines WebBook's blog-post reading affordances: a scroll-progress bar that shows how far the reader has advanced through the article.

## ADDED Requirements

### Requirement: Reading progress bar

The app SHALL show a thin, fixed progress bar at the top of a blog post that fills according to the reader's scroll position through the article.

#### Scenario: Scroll progresses

- **WHEN** the reader scrolls through the article
- **THEN** the bar fills proportionally from 0% to 100%

#### Scenario: Top and bottom

- **WHEN** the article is at the top
- **THEN** the bar is empty; at the end it is full
