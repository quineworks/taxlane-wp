'use strict';

// platform#3687: status-sync-run.cjs's run() itself is "live glue" (shells
// out to `gh`, not mocked here -- same split its own header comment
// documents between pure/tested derivation modules and this file). This
// covers the one piece of step 6's sitemap-bump logic that *is* pure:
// bumpStatusSitemapLastmods(), extracted specifically so the /status-own-
// entry bug (STATUS_FEED_LOC bumped, STATUS_LOC never touched) has a
// regression test, mirroring the existing STATUS_FEED_LOC coverage in
// scripts/test-sitemap-lastmod-check.cjs.

const test = require('node:test');
const assert = require('node:assert/strict');

const { bumpStatusSitemapLastmods } = require('./status-sync-run.cjs');
const { parseSitemap } = require('./sitemap-lastmod-check.cjs');

const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://quineworks.com/status</loc>
    <lastmod>2026-10-03</lastmod>
  </url>
  <url>
    <loc>https://quineworks.com/status-feed.xml</loc>
    <lastmod>2026-10-03</lastmod>
  </url>
</urlset>
`;

test('status.json changed, status-feed.xml unchanged -> only /status bumps', () => {
  const result = bumpStatusSitemapLastmods(SITEMAP, { feedChanged: false, today: '2026-11-17' });
  const map = parseSitemap(result);
  assert.equal(map.get('https://quineworks.com/status'), '2026-11-17');
  assert.equal(map.get('https://quineworks.com/status-feed.xml'), '2026-10-03');
});

test('status.json and status-feed.xml both changed -> both locs bump', () => {
  const result = bumpStatusSitemapLastmods(SITEMAP, { feedChanged: true, today: '2026-11-17' });
  const map = parseSitemap(result);
  assert.equal(map.get('https://quineworks.com/status'), '2026-11-17');
  assert.equal(map.get('https://quineworks.com/status-feed.xml'), '2026-11-17');
});
