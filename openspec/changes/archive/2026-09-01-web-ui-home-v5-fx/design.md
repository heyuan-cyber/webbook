## Context

Builds on the existing personal homepage + `category`/`cover`. Adds a featured-note setting and a cinematic neon layer (see proposal.md). Reuses `Reveal`, motion, Phase-1 tokens.

## Goals / Non-Goals

**Goals:** featured backend + star toggle + homepage spotlight/placeholder; cinematic hero; neon domain/marquee/masonry.
**Non-Goals:** no new dependency; no avatar/bio (unchanged).

## Decisions

- **Featured storage**: `data/users/{userId}/profile.json` (`{ schemaVersion, featuredNoteId? }`), read/written via `github` helpers; `PUT /api/profile/featured` (authed) toggles it; the user-feed response adds `featuredNoteId`.
- **Homepage**: hero (CSS aurora/particles + `motion` for parallax/counters) → spotlight (featured cover card or placeholder) → marquee → domain cards (neon gradient tile per column, hover tilt/glow) → masonry (CSS columns) → sticky nav/footer. Featured read from feed response.
- **Neon**: `--neon-gold`/`--neon-teal` tokens + box-shadows/glow + gradients; `prefers-reduced-motion` disables.

## Risks / Trade-offs

- **[Profile.json for legacy/others]** → fall back to no featured (placeholder).
- **[Masonry]** → CSS `columns` (cover-first, varied) with balanced height; reduced-motion no marquee.
