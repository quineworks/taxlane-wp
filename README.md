# TaxLane Nigeria Tax Calculators (WordPress plugin)

A free WordPress plugin that embeds any of TaxLane's Nigeria tax
calculators (PAYE, VAT, CIT, Land Use Charge, and more) on a page or post
with one shortcode — no coding required.

```
[taxlane_calculator type="paye"]
[taxlane_calculator type="lagos-land-use-charge" theme="dark" height="800"]
[taxlane_calculator type="paye" locale="ha"]
```

- `type` (required) — one of the ids listed on **Settings → TaxLane
  Calculators** once the plugin is active, or at
  [`taxlane.ng/embeddable-calculators.json`](https://taxlane.ng/embeddable-calculators.json).
- `theme` (optional) — `light` or `dark`; omitted lets the calculator
  follow the visitor's own OS/browser preference.
- `height` (optional, default `700`) — the iframe's pre-resize fallback
  height; the embedded calculator auto-resizes it after load.
- `locale` (optional) — one of `pcm` (Nigerian Pidgin), `ha` (Hausa), `yo`
  (Yorùbá), or `ig` (Igbo); omitted (or `en`) embeds the English version.
  Every calculator in the catalog currently supports all four.

Free, no API key, no account, no ongoing cost — the plugin renders an
iframe pointed at TaxLane's own calculators, with a non-removable
"Calculator by TaxLane" attribution link on every embed.

## This repo

This is a **generated, read-only mirror** of
[`quineworks/tax-lane`](https://github.com/quineworks/tax-lane)'s
`wp-plugin/` directory, published here (as a built, installable `.zip`
GitHub Release asset) so a WordPress site owner can install the plugin
without needing access to the private source repo. The plugin's source,
tests, and full spec (`docs/product/wordpress-calculator-plugin.md`) live
in `tax-lane` — PRs should target that repo, not this one.

## Install

Not yet available — no release has been published to this repo yet (check
this repo's [Releases](https://github.com/quineworks/taxlane-wp/releases)
page). Once one lands, install is: download `taxlane-calculators.zip`, then
in your WordPress admin **Plugins → Add New → Upload Plugin**, activate it,
and visit **Settings → TaxLane Calculators** for a ready-to-copy shortcode
per calculator.
