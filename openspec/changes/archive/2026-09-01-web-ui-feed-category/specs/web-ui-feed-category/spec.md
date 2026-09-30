## Purpose

Defines the WebBook feed category capability: public feed items carry the post's source category (tree folder) so clients can group posts by category.

## ADDED Requirements

### Requirement: Feed items carry category

The public feed SHALL include each post's source category (the containing tree folder title), with root-level notes uncategorized.

#### Scenario: Categorized post

- **WHEN** a public post lives under a folder
- **THEN** its feed item carries that folder's title as `category`

#### Scenario: Uncategorized post

- **WHEN** a public post is at the tree root (no folder)
- **THEN** its feed item is uncategorized (no `category`)
