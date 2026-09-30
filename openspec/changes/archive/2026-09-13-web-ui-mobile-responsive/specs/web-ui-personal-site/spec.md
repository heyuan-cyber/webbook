## ADDED Requirements

### Requirement: Responsive personal site layout

The personal site SHALL adapt to narrow (mobile) viewports: content SHALL fit the viewport width without horizontal scrolling, long text (titles, category tags, the hero wordmark) SHALL wrap, and no content SHALL be clipped on short viewports.

#### Scenario: Narrow viewport fits

- **WHEN** the personal site is viewed at a phone width (e.g. 375px)
- **THEN** the page has no horizontal overflow and all content is reachable by vertical scrolling

#### Scenario: Long wordmark and tags wrap

- **WHEN** the author name or a category tag is long
- **THEN** it wraps instead of overflowing or being clipped

#### Scenario: Hero not clipped

- **WHEN** the hero is viewed on a short viewport
- **THEN** the hero's heading, subtitle, and actions remain visible (not clipped)

### Requirement: Responsive site navigation

The site top navigation SHALL remain usable on narrow viewports, presenting the section tabs as a horizontally scrollable strip rather than a tall wrapped stack.

#### Scenario: Nav on mobile

- **WHEN** the site header is viewed at a phone width
- **THEN** the section tabs are horizontally scrollable and the header stays compact

#### Scenario: Active section highlighted

- **WHEN** the reader scrolls the site
- **THEN** the tab for the section in view is highlighted (scroll-spy works against the site's scroll container)

### Requirement: Site scroll container

The site SHALL provide a reliable vertical scroll container sized to the dynamic viewport (`100dvh`), so scrolling works on mobile browsers, and the navigation scroll-spy SHALL observe that container rather than the window.

#### Scenario: Scroll works on mobile

- **WHEN** the reader scrolls the personal site on a phone
- **THEN** the content scrolls smoothly and the sticky header stays at the top

#### Scenario: Scroll-spy tracks the container

- **WHEN** the reader scrolls inside the site's own scroll container
- **THEN** the active tab updates accordingly
