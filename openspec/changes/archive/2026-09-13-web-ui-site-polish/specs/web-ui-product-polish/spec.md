## ADDED Requirements

### Requirement: Community entry label

The app-shell top bar SHALL label the shared public space as "社区" (where the reader can see everyone's posts), distinct from an author's own personal homepage.

#### Scenario: Community label

- **WHEN** a signed-in user is in the app shell
- **THEN** the shared public space entry is labeled "社区" and links to the community feed

### Requirement: No featured control in editor

The note editor SHALL NOT show a featured/star ("设置焦点") control on the note editor header.

#### Scenario: No star button

- **WHEN** the note editor header renders a writable note
- **THEN** no "设焦点 / 焦点" button is shown
