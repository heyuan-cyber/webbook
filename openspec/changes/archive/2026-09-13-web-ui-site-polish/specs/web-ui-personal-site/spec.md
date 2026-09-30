## MODIFIED Requirements

### Requirement: Homepage hero

The app SHALL show an animated hero on the personal homepage with the author's avatar, name, a tagline, and a post search. The hero SHALL render full-bleed (edge-to-edge, not constrained to a narrow centered column) with a fixed gradient + grain background that does not depend on any post cover, an overline pill, an oversized two-line serif display heading (the second line italic with a gradient), a subtitle, and game-related mouse-interactive elements. Scrolling through the hero SHALL use a smooth, reversible full-screen scroll model (scroll-snap) so the reader can move both forward and back.

#### Scenario: Hero

- **WHEN** the homepage opens
- **THEN** a full-bleed cinematic hero is shown with fixed gradient + grain background, a badge avatar, an oversized glowing display heading, an overline tagline, and mouse-interactive game-themed elements

#### Scenario: Hero without any cover

- **WHEN** the author has no post with a cover
- **THEN** the hero still renders using its fixed gradient + grain background

#### Scenario: Scroll through hero, forward and back

- **WHEN** the user scrolls down then up through the hero
- **THEN** the hero advances section by section in both directions smoothly (scroll-snap), without rigid jumps

#### Scenario: Hero scrolls to next tab

- **WHEN** the user scrolls/touches to the end of the last hero section and keeps scrolling down
- **THEN** the site auto-switches to the next tab (项目示例), on both desktop and mobile

## ADDED Requirements

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
