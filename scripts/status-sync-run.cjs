'use strict';

// platform#3685: extracted from status.yml's own embedded recompute step
// (which used to inline all of this directly in the workflow YAML) so the
// event-driven run (status.yml) and the new scheduled safety-net resync
// (status-resync.yml) share one implementation instead of two near-
// identical copies drifting apart the way status.json's own hand-seeded
// JSON formatting once did. Still "live glue" (shells out to `gh`/reads-
// writes real repo state), not a pure fixture-tested module like
// status-derive.cjs/status-feed-derive.cjs -- those two stay pure and
// unit-tested; this file is exercised for real by both workflows' own runs.
//
// run({ triggerIssueRaw }): triggerIssueRaw is the raw GitHub issue object
// (github.event.issue from a labeled/unlabeled/closed/reopened event) for
// an event-driven run, or null for a full scheduled resync with no single
// triggering issue.
const { execFileSync } = require('child_process');
const { deriveStatus, COMPONENTS } = require('./status-derive.cjs');
const { deriveStatusFeedXml } = require('./status-feed-derive.cjs');
const { bumpLastmod } = require('./sitemap-lastmod-check.cjs');

const STATUS_REPO = 'quineworks/platform';
const STATUS_FILE = 'site/public/status.json';
const STATUS_FEED_FILE = 'site/public/status-feed.xml';
const SITEMAP_FILE = 'site/public/sitemap.xml';
const STATUS_FEED_LOC = 'https://quineworks.com/status-feed.xml';
const STATUS_LOC = 'https://quineworks.com/status';
const SYNC_BRANCH = 'status-sync';
const REPOS = ['quineworks/platform', 'quineworks/tax-lane'];

// Bounded retry-with-backoff on transient GitHub API 5xx only -- several
// callers below rely on a thrown error to mean "expected 404, not found
// yet" (branch/file/issue doesn't exist), so a 4xx (or any non-5xx) failure
// is rethrown immediately, unretried.
function gh(args) {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      return execFileSync('gh', args, { encoding: 'utf8' });
    } catch (e) {
      const transient = /HTTP 5\d\d/.test(String(e.stderr || e.message || ''));
      if (!transient || attempt === 5) throw e;
      execFileSync('sleep', [String(attempt * 3)]);
    }
  }
}

function componentIdsFromLabels(labels) {
  return (labels || [])
    .map((l) => l.name)
    .filter((name) => name.startsWith('component:'))
    .map((name) => name.slice('component:'.length));
}

function severityDownFromLabels(labels) {
  return (labels || []).some((l) => l.name === 'severity:down');
}

function isLiveIncidentFromLabels(labels) {
  return (labels || []).some((l) => l.name === 'live-incident');
}

// platform#3687: pure helper for the sitemap-bump decision in step 6 of
// run() below, pulled out so it's unit-testable without shelling out to
// `gh`. By the time run() reaches step 6, status.json's content has
// unconditionally changed (the early return earlier in run() already
// filtered out no-op runs) -- status.html is a static shell that renders
// status.json client-side (site/public/status.html:561), so its own
// crawlable content changes exactly when status.json does, same as
// status-feed.xml's. So STATUS_LOC's lastmod always gets bumped here;
// STATUS_FEED_LOC's stays conditional on feedChanged since its own
// rendered content doesn't always move in lockstep with status.json's
// (see putIfChanged's doc comment above for why).
function bumpStatusSitemapLastmods(sitemapContent, { feedChanged, today }) {
  let next = bumpLastmod(sitemapContent, STATUS_LOC, today);
  if (feedChanged) {
    next = bumpLastmod(next, STATUS_FEED_LOC, today);
  }
  return next;
}

// A status.json incident url is always a GitHub issue html_url
// (https://github.com/<owner>/<repo>/issues/<number>) -- parsed back out
// here so unresolvedIssueStates (below) can look each one up individually,
// independent of which repo it lives in.
function parseIssueUrl(url) {
  const m = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)$/.exec(url || '');
  if (!m) return null;
  return { owner: m[1], repo: m[2], number: m[3] };
}

async function run({ triggerIssueRaw }) {
  // 1. Live cross-repo query: every open issue anywhere that currently
  // carries live-incident. Computed fresh every run (rather than
  // incrementally patched) so multi-incident overlap and reopen/relabel
  // edge cases resolve from reality, not from hand-tracked state.
  const openIssues = [];
  for (const repo of REPOS) {
    let page = 1;
    for (;;) {
      const out = gh([
        'api', `repos/${repo}/issues`,
        '-X', 'GET',
        '-f', 'state=open',
        '-f', 'labels=live-incident',
        '-f', 'per_page=100',
        '-f', `page=${page}`,
      ]);
      const batch = JSON.parse(out).filter((i) => !i.pull_request);
      for (const issue of batch) {
        openIssues.push({
          url: issue.html_url,
          title: issue.title,
          componentIds: componentIdsFromLabels(issue.labels),
          severityDown: severityDownFromLabels(issue.labels),
          createdAt: issue.created_at,
        });
      }
      if (batch.length < 100) break;
      page += 1;
    }
  }
  console.log(`Live open live-incident issues across all three repos: ${openIssues.length}`);

  // 2. The specific issue that fired this run (event-driven only), needed
  // only to cover the one case the live open-issues query structurally
  // can't: an issue that is *closed* but carries (or just gained)
  // live-incident -- an ordinary close event (labels persist through
  // close, so the closing issue still needs its incidents[] entry resolved
  // with its real closedAt) or a retroactive/historical labeling of an
  // already-closed incident. null for a scheduled resync -- nothing
  // "triggered" it.
  const triggerIssue = triggerIssueRaw ? {
    url: triggerIssueRaw.html_url,
    title: triggerIssueRaw.title,
    componentIds: componentIdsFromLabels(triggerIssueRaw.labels),
    severityDown: severityDownFromLabels(triggerIssueRaw.labels),
    isOpen: triggerIssueRaw.state === 'open',
    isLiveIncident: isLiveIncidentFromLabels(triggerIssueRaw.labels),
    createdAt: triggerIssueRaw.created_at,
    closedAt: triggerIssueRaw.closed_at,
  } : null;

  // 3. Read status.json off the current tip of the sync branch if a PR is
  // already open on it (not off stale main) so back-to-back events build
  // on each other instead of clobbering.
  const existingPr = JSON.parse(gh([
    'pr', 'list', '--repo', STATUS_REPO, '--head', SYNC_BRANCH,
    '--state', 'open', '--json', 'number',
  ]))[0];
  const readRef = existingPr ? SYNC_BRANCH : 'main';

  let currentContent;
  try {
    const fileJson = JSON.parse(gh([
      'api', `repos/${STATUS_REPO}/contents/${STATUS_FILE}`, '-f', `ref=${readRef}`,
    ]));
    currentContent = Buffer.from(fileJson.content, 'base64').toString('utf8');
  } catch (e) {
    currentContent = JSON.stringify({ components: COMPONENTS.map((c) => ({ ...c, state: 'operational' })), incidents: [] }, null, 2) + '\n';
  }

  const existing = JSON.parse(currentContent);

  // 3b. platform#3685: for every entry still on file as unresolved
  // (resolvedAt: null), read *that entry's own issue* live, right now --
  // independent of the openIssues list above and of whichever event (if
  // any) triggered this run. This is what lets a closed issue that raced a
  // label removal against its own close (the exact platform#3640 sequence)
  // self-heal here even if it slipped through both of the other two
  // signals. Bounded by however many incidents are currently unresolved,
  // always small per this page's own MVP scope.
  const unresolvedIssueStates = {};
  for (const incident of existing.incidents || []) {
    if (incident.resolvedAt !== null) continue;
    const parsed = parseIssueUrl(incident.url);
    if (!parsed) continue;
    try {
      const issueJson = JSON.parse(gh(['api', `repos/${parsed.owner}/${parsed.repo}/issues/${parsed.number}`]));
      unresolvedIssueStates[incident.url] = { isOpen: issueJson.state === 'open', closedAt: issueJson.closed_at };
    } catch (e) {
      // Issue unreachable (deleted, transferred, token lacks access) --
      // leave it out of the map; deriveStatus() treats a missing entry as
      // "no independent signal either way", falling back to the existing
      // openIssues-membership behavior for it.
      console.log(`Could not read live state for ${incident.url} -- skipping its independent check this run: ${e.message}`);
    }
  }

  // 4. Derive the new status.json purely (scripts/status-derive.cjs,
  // fixture-tested by scripts/test-status.cjs).
  const now = new Date().toISOString();
  const derived = deriveStatus({
    existingIncidents: existing.incidents || [],
    openIssues,
    triggerIssue,
    unresolvedIssueStates,
    now,
  });
  const newContent = JSON.stringify(derived, null, 2) + '\n';

  // Compare semantically, not by raw text: the hand-seeded status.json
  // (platform#1942) doesn't use JSON.stringify's own one-key-per-line
  // formatting, so a raw string comparison would "detect a change" (and
  // open a spurious PR) on every single run purely from reformatting, even
  // one that's a true no-op.
  const normalizedExisting = JSON.stringify(existing, null, 2) + '\n';
  if (newContent === normalizedExisting) {
    console.log('status.json unchanged by this event — nothing to land.');
    return;
  }

  // 4b. Derive the paired status-feed.xml content from the same `derived`
  // result (scripts/status-feed-derive.cjs, fixture-tested by
  // scripts/test-status-feed-derive.cjs) so every status.json write in
  // this run also carries a matching status-feed.xml write -- feed-drift-
  // check.yml blocks a PR touching one without the other
  // (scripts/feed-drift-check.cjs's status.json -> status-feed.xml pair,
  // platform#2121/#2349).
  const newFeedContent = deriveStatusFeedXml({ incidents: derived.incidents, components: COMPONENTS });

  // 5. Land it: main is protected, so this always goes through the
  // status-sync branch + PR, same as sync-governance-workflows.yml.
  let mainSha;
  try {
    mainSha = gh(['api', `repos/${STATUS_REPO}/git/ref/heads/${SYNC_BRANCH}`, '--jq', '.object.sha']).trim();
  } catch (e) {
    mainSha = gh(['api', `repos/${STATUS_REPO}/git/ref/heads/main`, '--jq', '.object.sha']).trim();
    gh(['api', '-X', 'POST', `repos/${STATUS_REPO}/git/refs`, '-f', `ref=refs/heads/${SYNC_BRANCH}`, '-f', `sha=${mainSha}`]);
  }

  // Re-fetches each file's sha on the branch itself right before writing it
  // (not the sha read at step 3, which may be stale by now if this is the
  // first write onto a freshly-created branch) -- mirrors bootstrap-
  // product-repo.sh's same guard for the same reason. Skips the PUT
  // entirely if the freshly-derived content is byte-identical to what's
  // already on the branch (e.g. status.json changed in a way that didn't
  // move the feed's rendered content).
  function putIfChanged(path, content, message) {
    let branchFile = null;
    try {
      branchFile = JSON.parse(gh(['api', `repos/${STATUS_REPO}/contents/${path}?ref=${SYNC_BRANCH}`]));
    } catch (e) {
      // Doesn't exist on the branch yet (first write, or branch just created off main).
    }
    if (branchFile && Buffer.from(branchFile.content, 'base64').toString('utf8') === content) {
      console.log(`${path}: unchanged on ${SYNC_BRANCH} — skipping.`);
      return false;
    }
    const putArgs = [
      'api', '-X', 'PUT', `repos/${STATUS_REPO}/contents/${path}`,
      '-f', `message=${message}`,
      '-f', `content=${Buffer.from(content).toString('base64')}`,
      '-f', `branch=${SYNC_BRANCH}`,
    ];
    if (branchFile) putArgs.push('-f', `sha=${branchFile.sha}`);
    gh(putArgs);
    console.log(`${path}: pushed to ${SYNC_BRANCH}.`);
    return true;
  }

  const triggerDescription = triggerIssue ? triggerIssue.url : 'scheduled full resync (status-resync.yml, platform#3685)';

  putIfChanged(STATUS_FILE, newContent, `chore: sync status.json (${triggerDescription}) — platform#1943`);
  const feedChanged = putIfChanged(STATUS_FEED_FILE, newFeedContent, `chore: sync status-feed.xml (${triggerDescription}) — platform#1943/#2349`);

  // 6. sitemap.xml's lastmod for /status and status-feed.xml is hand-
  // maintained like every other sitemap-lastmod-check.yml-covered page
  // (platform#1830) -- this is the one write path that otherwise always
  // trips that guard on its own PR (platform#3641/#3642/#3687), since
  // nothing in this workflow is a human who'd remember to bump it by hand.
  // Always runs (status.json has unconditionally changed by this point --
  // see bumpStatusSitemapLastmods's doc comment above); reads sitemap.xml
  // fresh off SYNC_BRANCH for the same staleness reason putIfChanged does.
  try {
    const sitemapJson = JSON.parse(gh(['api', `repos/${STATUS_REPO}/contents/${SITEMAP_FILE}?ref=${SYNC_BRANCH}`]));
    const sitemapContent = Buffer.from(sitemapJson.content, 'base64').toString('utf8');
    const bumpedSitemap = bumpStatusSitemapLastmods(sitemapContent, { feedChanged, today: now.slice(0, 10) });
    const bumpedWhat = feedChanged ? 'status.html and status-feed.xml' : 'status.html';
    putIfChanged(SITEMAP_FILE, bumpedSitemap, `chore: bump sitemap lastmod for ${bumpedWhat} (${triggerDescription}) — platform#1943/#1830/#3687`);
  } catch (e) {
    // sitemap.xml always exists on main/the branch in practice; an
    // unreadable fetch just means we skip the lastmod bump this run
    // rather than risk writing empty content (platform#3651).
    console.log(`sitemap.xml fetch failed — skipping lastmod bump: ${e.message}`);
  }

  if (existingPr) {
    console.log(`status-sync PR #${existingPr.number} already open — request-review.yml will re-dispatch a reviewer.`);
  } else {
    gh([
      'pr', 'create', '--repo', STATUS_REPO,
      '--base', 'main', '--head', SYNC_BRANCH,
      '--title', 'chore: sync status.json',
      '--body', `Automated status.json sync (status.yml/status-resync.yml, Refs #1943/#3685), triggered by ${triggerDescription}. Goes through the normal review-verdict gate like any other PR.`,
    ]);
    console.log('Opened status-sync PR — request-review.yml will dispatch a reviewer.');
  }
}

module.exports = { run, bumpStatusSitemapLastmods };

if (require.main === module) {
  const raw = process.env.TRIGGER_ISSUE_JSON;
  const triggerIssueRaw = raw ? JSON.parse(raw) : null;
  run({ triggerIssueRaw }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
