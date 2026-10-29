# Social preview card candidates

Three 1280×640px candidates for this repo's GitHub social preview image
(Settings → General → Social preview) — see the paired issue for the gap
this addresses. Open each `.html` file directly or view the matching PNG
under `screenshots/`.

GitHub has no API to set a repo's social preview image — it's a one-time
manual upload under repo Settings, not something a PR can land. These are
candidates for product to pick from; applying the pick is a manual
follow-up step once a candidate is chosen (see the paired issue), same
pattern as `quineworks/taxlane-php#9`/`#10`.

- **A — brand lockup**: dark card (`--tax-accent` light-bg value `#0B8457`
  as background), mark + wordmark + tagline, a "Free WordPress Plugin"
  badge. Brand-forward, states what it is at a glance.
- **B — shortcode window**: light card, mark + title up top, a faux
  WordPress block-editor window below showing the plugin's actual
  shortcode syntax (`[taxlane_calculator type="paye"]`, theme/locale
  attributes) next to a live-result chip — proves the "one shortcode"
  value prop concretely rather than just claiming it.
- **C — stat row**: dark card, mark + tagline + a bold stat row
  (calculators / languages / shortcode / cost). Poster-style, leans on
  numbers over a code sample.

Mark geometry and colors match `quineworks/platform`'s `brand/BRAND.md`
"Bracket Bars" spec exactly: `rect x=6/13.5/21`, `width=5`, `rx=1.5`,
heights `9/14/20`, bottom-aligned in a `32×32` viewBox, tallest (rightmost)
bar filled with the TaxLane product accent (`#0B8457` light-bg /
`#34D399` dark-bg), the other two `currentColor`/fg — spot-checked against
`platform/brand/BRAND.md`'s "Mark & palette" section (TaxLane product
accent subsection) rather than freehanded, and against the actual shipped
`tax-lane/wp-plugin/assets/icon-256x256.png` app icon for the accent hex.
Note the app icon itself uses a different, icon-specific composition
(solid accent-color background, light-tint + white bars) — that's a
distinct small-size-icon treatment, not the canonical lockup mark; these
candidates follow the canonical BRAND.md mark instead, consistent with how
it's used everywhere else (quineworks.com's `.product-mark-tile`, the live
`tax.quineworks.com` app header).

Copy stats (31 calculators, 5 languages — English + Pidgin + Hausa +
Yorùbá + Igbo) reflect the current catalog per `memory/COMPANY.md`
(13 federal + 18 state Land Use Charge, Ekiti the 18th state, as of
2026-10-28), not `wp-plugin/readme.txt`'s own description line (`tax-lane`'s
readme.txt predates several later calculators and is out of this run's
scope to fix). Updated again from the prior "29" figure (itself a
2026-10-28 refresh from "27") — candidate B (the approved pick, pending
CEO manual upload per the paired issue) carries no calculator count so
it's unaffected by this catalog growth; only A and C needed the refresh.

**Naira-glyph fix (2026-10-23):** candidates B and C's rendered PNGs
originally dropped the ₦ sign entirely (not a tofu box — the glyph
silently vanished) because headless Chromium's system font stack lacks
Unicode U+20A6 coverage. Same bug class as `tax-app#138`/`tax-lane#1367`;
fixed with the same self-hosted-subset-font pattern already used across
`tax-lane`'s own `docs/design/*` candidates — `taxlane-glyph-fallback.woff2`
(copied into this directory) loaded via `@font-face`/`unicode-range` and
placed first in each affected candidate's font stack. Candidate A doesn't
use the ₦ symbol, so it's unaffected. Both screenshots re-rendered at the
exact 1280×640 target size and verified to show the glyph correctly before
replacing the originals.
