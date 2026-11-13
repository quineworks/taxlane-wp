'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { parseSitemap, findLastmodViolations, bumpLastmod } = require('./sitemap-lastmod-check.cjs');

const SITEMAP_BASE = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://quineworks.com/</loc>
    <lastmod>2026-07-30</lastmod>
  </url>
  <url>
    <loc>https://quineworks.com/privacy</loc>
    <lastmod>2026-07-29</lastmod>
  </url>
  <url>
    <loc>https://quineworks.com/terms</loc>
    <lastmod>2026-07-29</lastmod>
  </url>
  <url>
    <loc>https://quineworks.com/embed</loc>
    <lastmod>2026-07-30</lastmod>
  </url>
  <url>
    <loc>https://quineworks.com/changelog</loc>
    <lastmod>2026-07-30</lastmod>
  </url>
</urlset>
`;

function bumped(xml, loc, newLastmod) {
  const escaped = loc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(<loc>${escaped}</loc>\\s*<lastmod>)[^<]*(</lastmod>)`);
  return xml.replace(re, `$1${newLastmod}$2`);
}

// SITEMAP_BASE's dates are all in the past relative to this, so existing
// tests exercising "stale and unchanged -> violation" stay valid.
const TODAY = '2026-08-03';

test('parseSitemap extracts loc -> lastmod for every <url> entry', () => {
  const map = parseSitemap(SITEMAP_BASE);
  assert.equal(map.size, 5);
  assert.equal(map.get('https://quineworks.com/'), '2026-07-30');
  assert.equal(map.get('https://quineworks.com/privacy'), '2026-07-29');
});

test('parseSitemap on empty/missing content returns an empty map', () => {
  assert.equal(parseSitemap('').size, 0);
  assert.equal(parseSitemap(undefined).size, 0);
});

test('untouched pages -> no violations regardless of sitemap content', () => {
  const result = findLastmodViolations(['README.md', 'site/public/robots.txt'], SITEMAP_BASE, SITEMAP_BASE, TODAY);
  assert.deepEqual(result.violations, []);
});

test('touched page with bumped lastmod -> no violation', () => {
  const head = bumped(SITEMAP_BASE, 'https://quineworks.com/privacy', '2026-08-01');
  const result = findLastmodViolations(['site/public/privacy.html'], SITEMAP_BASE, head, TODAY);
  assert.deepEqual(result.violations, []);
});

test('touched page with unchanged, stale lastmod -> violation naming that file', () => {
  const result = findLastmodViolations(['site/public/privacy.html'], SITEMAP_BASE, SITEMAP_BASE, TODAY);
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].file, 'site/public/privacy.html');
  assert.equal(result.violations[0].loc, 'https://quineworks.com/privacy');
});

test('multiple touched pages, only one bumped -> only the unbumped one violates', () => {
  const head = bumped(SITEMAP_BASE, 'https://quineworks.com/terms', '2026-08-01');
  const result = findLastmodViolations(
    ['site/public/terms.html', 'site/public/embed.html'],
    SITEMAP_BASE,
    head,
    TODAY,
  );
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].file, 'site/public/embed.html');
});

test('head sitemap missing the loc entirely -> violation', () => {
  const head = SITEMAP_BASE.replace(
    /\s*<url>\s*<loc>https:\/\/quineworks\.com\/changelog<\/loc>[\s\S]*?<\/url>/,
    '',
  );
  const result = findLastmodViolations(['site/public/changelog.html'], SITEMAP_BASE, head, TODAY);
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].file, 'site/public/changelog.html');
});

test('page newly touched with no prior base entry (empty base) -> any head lastmod counts as bumped', () => {
  const result = findLastmodViolations(['site/public/index.html'], '', SITEMAP_BASE, TODAY);
  assert.deepEqual(result.violations, []);
});

test('files outside the sitemap page map are ignored even if touched', () => {
  const result = findLastmodViolations(['site/public/404.html', 'site/public/brand/lockup-on-dark.svg'], SITEMAP_BASE, SITEMAP_BASE, TODAY);
  assert.deepEqual(result.violations, []);
});

test('non-page-map site/public files touched alongside a real page still only flags the real page', () => {
  const result = findLastmodViolations(
    ['site/public/robots.txt', 'site/public/embed.html'],
    SITEMAP_BASE,
    SITEMAP_BASE,
    TODAY,
  );
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].file, 'site/public/embed.html');
});

// platform#1873: a same-day repeat PR touching a page whose lastmod was
// already correctly bumped to today by an earlier same-day PR has no
// honest later value to bump to — this must not be flagged.
test('same-day repeat touch: base and head already both today -> no violation', () => {
  const alreadyToday = bumped(SITEMAP_BASE, 'https://quineworks.com/changelog', TODAY);
  const result = findLastmodViolations(['site/public/changelog.html'], alreadyToday, alreadyToday, TODAY);
  assert.deepEqual(result.violations, []);
});

test('same-day exemption does not apply when head is missing, even if base is today', () => {
  const baseToday = bumped(SITEMAP_BASE, 'https://quineworks.com/changelog', TODAY);
  const head = baseToday.replace(
    /\s*<url>\s*<loc>https:\/\/quineworks\.com\/changelog<\/loc>[\s\S]*?<\/url>/,
    '',
  );
  const result = findLastmodViolations(['site/public/changelog.html'], baseToday, head, TODAY);
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].file, 'site/public/changelog.html');
});

// platform#2093: feed.xml is listed in sitemap.xml (added alongside the RSS
// feed, #2067) so it belongs in PAGE_TO_LOC like any other listed page.
test('feed.xml-only touch with unbumped lastmod -> violation naming feed.xml', () => {
  const withFeed = SITEMAP_BASE.replace(
    '</urlset>',
    '  <url>\n    <loc>https://quineworks.com/feed.xml</loc>\n    <lastmod>2026-07-30</lastmod>\n  </url>\n</urlset>',
  );
  const result = findLastmodViolations(['site/public/feed.xml'], withFeed, withFeed, TODAY);
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].file, 'site/public/feed.xml');
  assert.equal(result.violations[0].loc, 'https://quineworks.com/feed.xml');
});

test('feed.xml-only touch with bumped lastmod -> no violation', () => {
  const withFeedBase = SITEMAP_BASE.replace(
    '</urlset>',
    '  <url>\n    <loc>https://quineworks.com/feed.xml</loc>\n    <lastmod>2026-07-30</lastmod>\n  </url>\n</urlset>',
  );
  const withFeedHead = bumped(withFeedBase, 'https://quineworks.com/feed.xml', '2026-08-01');
  const result = findLastmodViolations(['site/public/feed.xml'], withFeedBase, withFeedHead, TODAY);
  assert.deepEqual(result.violations, []);
});

// platform#2397: status-feed.xml is listed in sitemap.xml and its content
// is auto-generated from status.json (platform#1943/#2349), so it belongs
// in PAGE_TO_LOC like feed.xml above.
test('status-feed.xml-only touch with unbumped lastmod -> violation naming status-feed.xml', () => {
  const withStatusFeed = SITEMAP_BASE.replace(
    '</urlset>',
    '  <url>\n    <loc>https://quineworks.com/status-feed.xml</loc>\n    <lastmod>2026-07-30</lastmod>\n  </url>\n</urlset>',
  );
  const result = findLastmodViolations(['site/public/status-feed.xml'], withStatusFeed, withStatusFeed, TODAY);
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].file, 'site/public/status-feed.xml');
  assert.equal(result.violations[0].loc, 'https://quineworks.com/status-feed.xml');
});

// platform#2579: llms.txt is listed in sitemap.xml (added alongside the
// AI-crawler manifest rollout) so it belongs in PAGE_TO_LOC like feed.xml
// and status-feed.xml above.
test('llms.txt-only touch with unbumped lastmod -> violation naming llms.txt', () => {
  const withLlms = SITEMAP_BASE.replace(
    '</urlset>',
    '  <url>\n    <loc>https://quineworks.com/llms.txt</loc>\n    <lastmod>2026-07-30</lastmod>\n  </url>\n</urlset>',
  );
  const result = findLastmodViolations(['site/public/llms.txt'], withLlms, withLlms, TODAY);
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].file, 'site/public/llms.txt');
  assert.equal(result.violations[0].loc, 'https://quineworks.com/llms.txt');
});

test('llms.txt-only touch with bumped lastmod -> no violation', () => {
  const withLlmsBase = SITEMAP_BASE.replace(
    '</urlset>',
    '  <url>\n    <loc>https://quineworks.com/llms.txt</loc>\n    <lastmod>2026-07-30</lastmod>\n  </url>\n</urlset>',
  );
  const withLlmsHead = bumped(withLlmsBase, 'https://quineworks.com/llms.txt', '2026-08-01');
  const result = findLastmodViolations(['site/public/llms.txt'], withLlmsBase, withLlmsHead, TODAY);
  assert.deepEqual(result.violations, []);
});

test('unchanged lastmod that is not today (even if some other stale date) still violates', () => {
  const staleBoth = bumped(SITEMAP_BASE, 'https://quineworks.com/changelog', '2026-08-02');
  const result = findLastmodViolations(['site/public/changelog.html'], staleBoth, staleBoth, TODAY);
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].file, 'site/public/changelog.html');
});

// platform#3641/#3642: bumpLastmod is the mutating counterpart status.yml
// uses to bump status-feed.xml's own sitemap entry on write, rather than
// relying on a human to remember like every other PAGE_TO_LOC entry.
test('bumpLastmod rewrites the matching loc\'s lastmod and leaves others untouched', () => {
  const result = bumpLastmod(SITEMAP_BASE, 'https://quineworks.com/privacy', '2026-08-05');
  const map = parseSitemap(result);
  assert.equal(map.get('https://quineworks.com/privacy'), '2026-08-05');
  assert.equal(map.get('https://quineworks.com/'), '2026-07-30');
  assert.equal(map.size, 5);
});

test('bumpLastmod on a loc not present in the sitemap -> unchanged', () => {
  const result = bumpLastmod(SITEMAP_BASE, 'https://quineworks.com/status-feed.xml', '2026-08-05');
  assert.equal(result, SITEMAP_BASE);
});

test('bumpLastmod on empty/missing xml -> unchanged', () => {
  assert.equal(bumpLastmod('', 'https://quineworks.com/privacy', '2026-08-05'), '');
  assert.equal(bumpLastmod(undefined, 'https://quineworks.com/privacy', '2026-08-05'), '');
});
