'use strict';

// platform#1830: quineworks.com's site/public/sitemap.xml lastmod values are
// hand-maintained (no generator — see the issue for why: infra-apply.yml's
// runner has no Node.js, so a generator can't run in the static-asset
// deploy path). This module is the pure diffing logic a CI guard uses to
// block a PR that touches a listed page without also bumping that page's
// lastmod, mirroring closing-keyword-check.yml's enforcement shape for a
// different recurring gap.

// Path (relative to repo root) -> the exact <loc> this file's page owns in
// sitemap.xml. 404.html and other assets not themselves listed in
// sitemap.xml are deliberately absent here.
const PAGE_TO_LOC = {
  'site/public/index.html': 'https://quineworks.com/',
  'site/public/privacy.html': 'https://quineworks.com/privacy',
  'site/public/terms.html': 'https://quineworks.com/terms',
  'site/public/embed.html': 'https://quineworks.com/embed',
  'site/public/changelog.html': 'https://quineworks.com/changelog',
  'site/public/status.html': 'https://quineworks.com/status',
  'site/public/feed.xml': 'https://quineworks.com/feed.xml',
  'site/public/status-feed.xml': 'https://quineworks.com/status-feed.xml',
  'site/public/llms.txt': 'https://quineworks.com/llms.txt',
};

// Parses sitemap.xml's flat <url><loc>...</loc><lastmod>...</lastmod></url>
// entries into a Map<loc, lastmod>. Regex-based rather than a full XML
// parser: the file is hand-authored in this one fixed shape (see
// site/public/sitemap.xml) and no XML parser is available on the
// self-hosted-quineworks-ci runner beyond what's already bundled.
function parseSitemap(xml) {
  const map = new Map();
  const text = typeof xml === 'string' ? xml : '';
  const urlBlockRe = /<url>([\s\S]*?)<\/url>/g;
  let blockMatch;
  while ((blockMatch = urlBlockRe.exec(text)) !== null) {
    const block = blockMatch[1];
    const locMatch = /<loc>([^<]*)<\/loc>/.exec(block);
    const lastmodMatch = /<lastmod>([^<]*)<\/lastmod>/.exec(block);
    if (!locMatch) continue;
    map.set(locMatch[1].trim(), lastmodMatch ? lastmodMatch[1].trim() : undefined);
  }
  return map;
}

// changedFiles: array of repo-relative paths from the PR's diff.
// baseSitemapXml/headSitemapXml: sitemap.xml content at the PR's base and
// head refs (a missing/unreadable base file can be passed as '' — treated
// as "no prior lastmod", so any head lastmod counts as a bump).
// today: today's UTC date as 'YYYY-MM-DD' (platform#1873) — a touched page
// whose lastmod was already correctly bumped to today by an earlier
// same-day PR has no honest later value to bump to, so it's exempted
// rather than flagged. The exemption only fires when head *equals* today
// (not merely unchanged-and-stale), so a page that was never bumped can't
// dodge the check by coincidence.
//
// Returns { violations }, where each violation is a touched page whose
// matching <loc>'s lastmod is missing from head, or unchanged from base
// and not already today.
function findLastmodViolations(changedFiles, baseSitemapXml, headSitemapXml, today) {
  const touched = (Array.isArray(changedFiles) ? changedFiles : [])
    .filter((f) => Object.prototype.hasOwnProperty.call(PAGE_TO_LOC, f))
    .map((f) => ({ file: f, loc: PAGE_TO_LOC[f] }));

  if (touched.length === 0) return { violations: [] };

  const baseMap = parseSitemap(baseSitemapXml);
  const headMap = parseSitemap(headSitemapXml);

  const violations = touched.filter(({ loc }) => {
    const baseLastmod = baseMap.get(loc);
    const headLastmod = headMap.get(loc);
    if (headLastmod === undefined) return true;
    if (headLastmod !== baseLastmod) return false;
    return headLastmod !== today;
  });

  return { violations };
}

// Rewrites a single <url> block's <lastmod> in place, keyed by its <loc> —
// the mutating counterpart to parseSitemap/findLastmodViolations, used by a
// write path (status.yml, platform#1943/#3641) that needs to bump a
// PAGE_TO_LOC entry itself rather than just flag a missing bump. A loc not
// present in xml, or a <url> block with no existing <lastmod>, is left
// untouched (nothing to rewrite) rather than inserting a new element.
function bumpLastmod(xml, loc, newLastmod) {
  const text = typeof xml === 'string' ? xml : '';
  if (!text) return text;
  return text.replace(/<url>([\s\S]*?)<\/url>/g, (block, inner) => {
    const locMatch = /<loc>([^<]*)<\/loc>/.exec(inner);
    if (!locMatch || locMatch[1].trim() !== loc) return block;
    if (!/<lastmod>[^<]*<\/lastmod>/.test(inner)) return block;
    return `<url>${inner.replace(/<lastmod>[^<]*<\/lastmod>/, `<lastmod>${newLastmod}</lastmod>`)}</url>`;
  });
}

module.exports = { PAGE_TO_LOC, parseSitemap, findLastmodViolations, bumpLastmod };
