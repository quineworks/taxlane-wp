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

Copy stats (27 calculators, 5 languages — English + Pidgin + Hausa +
Yorùbá + Igbo) reflect the current catalog per `memory/COMPANY.md`, not
`wp-plugin/readme.txt`'s own description line (`tax-lane`'s readme.txt
predates several later calculators and is out of this run's scope to fix).
