## Why

The personal homepage reads as plain. Upgrade it to a **cinematic dark + gold/teal neon** portfolio homepage, and add a **self-pinned featured work** (the author stars a note in the notebook; the homepage spotlights it, with a placeholder when none is set).

## What Changes

- **Featured (backend)**: per-user `featuredNoteId` stored in `data/users/{userId}/profile.json`; new `PUT /api/profile/featured`; the user public feed response includes `featuredNoteId`.
- **Notebook star**: a `★` toggle in the note editor head to set/clear the featured.
- **Homepage v5**: full-screen cinematic hero (aurora/particles/parallax, avatar orbit ring, gradient name, counter stats, glowing buttons), a half-screen **spotlight** card for the featured post (placeholder if none), large cover **marquee**, neon **domain cards** (3D tilt + glow), masonry "all works", sticky glow nav, footer.
- **Neon layer**: gold/teal glow tokens + effects; reduced-motion safe.

## Capabilities

### New Capabilities
- `web-ui-home-v5-fx`: A cinematic neon personal homepage with a self-set featured-work spotlight, plus a notebook star control.

### Modified Capabilities
<!-- None. -->

## Impact

- **Worker**: `userProfile.ts` (profile read/write), `index.ts` (featured route + feed flag).
- **Front end**: `NoteEditor` star, `UserBlogPage` v5, blog CSS, `api.ts` client.
- **Dependencies**: none.
