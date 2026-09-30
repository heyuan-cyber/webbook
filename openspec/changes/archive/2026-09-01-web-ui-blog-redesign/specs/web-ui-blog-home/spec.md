## Purpose

Defines the WebBook personal blog homepage and richer blog hub: a per-author profile page with the author's identity and authored posts, viewable for yourself and other authors, plus a magazine-like hub.

## ADDED Requirements

### Requirement: Personal blog homepage

The app SHALL provide a blog homepage for each author, at `blog/u/:userId`, showing the author's identity (avatar/name/bio) and a grid of their public posts. It SHALL work for the signed-in author and for any other author.

#### Scenario: View own homepage

- **WHEN** a signed-in author opens their own blog homepage
- **THEN** their profile and public posts are shown

#### Scenario: View another author's homepage

- **WHEN** a reader opens another author's blog homepage
- **THEN** that author's profile and public posts are shown

#### Scenario: Author link from a card

- **WHEN** a reader views a post card
- **THEN** an author link opens that author's blog homepage

### Requirement: Richer blog hub

The app SHALL render the blog hub as a magazine-like page: a gradient hero header and a responsive grid of post cards each carrying title, meta (date/visibility), a hover lift, and a reveal-on-scroll entry.

#### Scenario: Hub cards

- **WHEN** the blog hub renders posts
- **THEN** cards display title + date + visibility and animate in with a subtle reveal and hover lift

### Requirement: Authors directory

The app SHALL list public authors on the hub (from the bloggers endpoint) and link each to their blog homepage.

#### Scenario: Authors list

- **WHEN** the hub has public authors
- **THEN** they are linked to their blog homepages

### Requirement: Article reading meta

The app SHALL show the article's author, date, and an estimated reading time in the article header.

#### Scenario: Article header

- **WHEN** an article is opened
- **THEN** its author, date, and estimated reading time are shown
