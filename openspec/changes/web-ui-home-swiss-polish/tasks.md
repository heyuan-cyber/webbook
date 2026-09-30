## 1. Display typography

- [x] 1.1 Add `Playfair Display` (weight 700) to the Google Fonts request in `apps/web/index.html`.
- [x] 1.2 Add a `--s-font-display` token in the `.swiss-home` block with `Playfair Display` first and the CJK serif as fallback, and apply it to `.swiss-hero-wordmark`, `.swiss-h2`, and the footer headline only.
- [x] 1.3 Verify Chinese section headings (项目示例 / 博客) still render in the CJK serif and do not fall back to a Latin-only face.

## 2. Card depth

- [x] 2.1 Add an inset hairline ring to `.swiss-work-card` via a pseudo-element, with a nested radius (`inner = outer − inset`), keeping the existing `::after` scrim intact.
- [x] 2.2 Add a faint diagonal sheen to the card surface, and apply the equivalent nested-radius treatment to `.swiss-home .io-card` so work and blog cards match.

## 3. Bento rhythm

- [x] 3.1 Mark the first work card as the featured cell in `WorkTab.tsx`.
- [x] 3.2 Add desktop-only CSS so the featured cell spans two columns and grows taller, leaving single-column layouts untouched.

## 4. Section heads

- [x] 4.1 Switch `.swiss-section-head` to a two-point layout (title left, lede right, baseline-aligned) at `min-width: 768px`, retaining the stacked column below it.

## 5. Interaction polish

- [x] 5.1 Scale the cover image on card hover (eased, clipped by the card) for both work and blog cards, disabled under reduced motion.
- [x] 5.2 Pause the hero marquee on hover/focus-within.
- [x] 5.3 Add an optional `delay` prop to `Reveal` (default no delay) and stagger work/blog card reveals by index with a capped delay.

## 6. Scale and pitch-black discipline

- [x] 6.1 Widen the work/blog inner container to 1280px and raise desktop section padding to 128px, leaving the mobile overrides unchanged.
- [x] 6.2 Reduce the hero's blue radial glow so black stays dominant while blue remains for functional accents.

## 7. Verify

- [x] 7.1 Run `npm run typecheck -w apps/web` and confirm no type errors.
- [x] 7.2 Run `npm run build -w apps/web` and confirm the production build succeeds.
- [x] 7.3 Confirm every new CSS class is referenced from markup and that no non-Swiss surface (blog hub, editor, admin) picks up the new tokens.
