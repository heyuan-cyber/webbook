## Purpose

Defines WebBook's typographic and page-composition layer: a consistent type hierarchy, Bento-style card grids for the hub and admin, and a comfortable long-form reading experience.

## ADDED Requirements

### Requirement: Consistent type hierarchy

The app SHALL apply a consistent typographic scale — serif for long-form/article text, sans for UI chrome, mono for code — with defined heading sizes, weights, and letter-spacing, so headings and body read as a coherent hierarchy rather than ad-hoc sizes.

#### Scenario: Heading hierarchy

- **WHEN** a page renders heading levels 1–3
- **THEN** each level uses the defined scale, weight, and letter-spacing from the shared type tokens

#### Scenario: Long-form text

- **WHEN** article or long-form text renders
- **THEN** it uses the serif body at the article leading and measure, with code rendered in the mono typeface

### Requirement: Composed card grids

The app SHALL present the blog hub and admin overview as a composed grid of cards with a clear visual hierarchy, a hover state, and an accent border on hover, sized responsively across breakpoints.

#### Scenario: Blog hub cards

- **WHEN** the blog hub renders posts
- **THEN** they display as a responsive card grid, each card carrying a title/teaser/CTA and a hover lift with accent border

#### Scenario: Admin overview

- **WHEN** the admin overview renders collections
- **THEN** they display as composed card rows/tables with a clear structure and hierarchy

### Requirement: Comfortable long-form reading

The app SHALL render article content with an optimized reading measure, consistent vertical rhythm, figure captions, and readable links for a comfortable editorial read.

#### Scenario: Article rhythm

- **WHEN** an article renders headings, paragraphs, figures, and checklists
- **THEN** their spacing and measure follow a defined article rhythm and figures display captions
