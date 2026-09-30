# Tasks

## 1. Immersive hero

- [ ] 1.1 Reskin the homepage hero into a full-viewport cinematic hero: layered fixed gradient + film-grain background (CSS, not cover-dependent), badge avatar, overline tagline, oversized glowing display name, scroll cue, and existing entry actions.
- [ ] 1.2 Add scroll-driven hero fade/hide (passive listener + rAF throttle, motion-safe) so the hero eases into the content below.

## 2. Featured work hero spot

- [ ] 2.1 Restyle the featured post (`featured`) into a wide movie-poster-like feature card (cover, title, summary, kicker, CTA), and keep the "焦点作品待定" placeholder when nothing is starred.

## 3. Discipline sections

- [ ] 3.1 Convert the uniform `domain-grid` cards into numbered discipline sections ("01 …") each with a title, lede, onOpen → `setActiveCat`, and a responsive card stream.
- [ ] 3.2 Keep the existing discipline-navigation behavior (selecting a discipline shows its posts + "返回全部") and the search + category branches working.

## 4. Demo showcase band

- [ ] 4.1 Present the cover marquee as a titled "作品演示" band, keeping auto-scroll and hover pause.

## 5. Gallery + cinematic polish

- [ ] 5.1 Restyle the "全部文章" masonry with translucent glass cards + neon hover outlines for a premium feel.
- [ ] 5.2 Add `@media (prefers-reduced-motion: reduce)` guards and desktop/mobile breakpoints so motion degrades gracefully.

## 6. Verify

- [ ] 6.1 Run `npm run typecheck -w apps/web` and confirm no type errors.
- [ ] 6.2 Confirm spec delta validates: `openspec validate --change web-ui-home-immersive`.
