'use strict';

// platform#1943 (part of the #1938 status-page effort; sibling to #1942,
// which shipped the static /status page + hand-seeded status.json this
// module now keeps live). Pure derivation logic for status.yml, split out
// the same way #563's decideClose() was split from tracking-parent-auto-
// closer.yml -- so the label-event -> status.json transformation is
// fixture-testable without a live GitHub Actions run.
//
// Fixed at MVP as four components (docs/product/status-page.md) --
// exported here so status.yml's live entrypoint and this module's own
// tests share one source of truth instead of two hand-kept copies drifting
// apart.
//
// platform#2550 (PouchBooks halt): pouchbooks-app/pouchbooks-sync dropped
// from this list -- deriveStatus() below maps `components` fresh off this
// array on every run, so leaving them here would have silently resurrected
// them in site/public/status.json (and its paired status-feed.xml) the
// next time status.yml fired on any issue labeled/unlabeled/closed/
// reopened event anywhere in the company, undoing a same-repo hand-edit to
// the JSON. The 2026-08-23 historical incident (#2335) still references
// `pouchbooks-app` in its own `components` array (incidents are carried
// forward by url, untouched by this list) -- componentNames() in
// status.html and status-feed-derive.cjs already falls back to the raw id
// when a component isn't found here, so that incident's line still renders
// (as "pouchbooks-app", not blank/undefined) rather than erroring.
const COMPONENTS = [
  { id: 'quineworks-site', name: 'quineworks.com' },
  { id: 'taxlane', name: 'TaxLane' },
];

// deriveStatus({ existingIncidents, openIssues, triggerIssue, now }) -> { components, incidents }
//
// existingIncidents: the current status.json's `incidents[]` array.
//
// openIssues: a live, freshly-queried snapshot of every issue across all
// three repos that is currently *open* and carries `live-incident` --
// { url, title, componentIds, severityDown, createdAt }. Recomputing
// component state from this live set (rather than only incrementally
// patching one issue's own row) is what makes multi-incident overlap on
// the same component, and reopen/relabel edge cases, resolve correctly
// without hand-tracked state drifting from reality -- per the ticket's own
// framing.
//
// triggerIssue: the specific issue that fired this workflow run (or null
// for a full resync), used only to cover the one case a live open-issues
// query structurally can't: an issue that is *closed* but just gained (or
// already carries) `live-incident` -- e.g. retroactively labeling an
// already-resolved incident for historical accuracy, or an ordinary close
// event itself (labels persist through close, so the closing issue still
// carries `live-incident` and needs its own incidents[] entry resolved
// with its real closedAt, not a same-run "now" derived from the open-issue
// carry-forward path below).
// Shape: { url, title, componentIds, severityDown, isOpen, isLiveIncident,
//          createdAt, closedAt }.
//
// now: ISO timestamp fallback used to fill resolvedAt when no closedAt is
// available (e.g. the `live-incident` label was simply removed from a
// still-open issue -- nothing "closed", so there's no closedAt to use).
// Passed in explicitly (not Date.now()) so this stays a pure function.
function deriveStatus({ existingIncidents = [], openIssues = [], triggerIssue = null, now }) {
  const byUrl = new Map((existingIncidents || []).map((i) => [i.url, i]));

  if (triggerIssue && triggerIssue.isLiveIncident && !triggerIssue.isOpen) {
    const prior = byUrl.get(triggerIssue.url);
    byUrl.set(triggerIssue.url, {
      title: triggerIssue.title,
      components: triggerIssue.componentIds,
      state: triggerIssue.severityDown ? 'down' : 'degraded',
      openedAt: (prior && prior.openedAt) || triggerIssue.createdAt,
      resolvedAt: (prior && prior.resolvedAt) || triggerIssue.closedAt || now,
      url: triggerIssue.url,
    });
  }

  const openUrls = new Set(openIssues.map((i) => i.url));
  const incidents = [];

  // Open issues win first and always render as unresolved -- this is what
  // makes reopen work for free: a reopened issue that still carries
  // `live-incident` shows back up in the live query, so its entry (found
  // by url in `byUrl`, preserving the original openedAt) gets resolvedAt
  // reset to null here rather than staying permanently resolved.
  for (const issue of openIssues) {
    const prior = byUrl.get(issue.url);
    incidents.push({
      title: issue.title,
      components: issue.componentIds,
      state: issue.severityDown ? 'down' : 'degraded',
      openedAt: (prior && prior.openedAt) || issue.createdAt,
      resolvedAt: null,
      url: issue.url,
    });
  }

  // Anything on file that isn't in the live open set anymore (closed, or
  // `live-incident` removed) gets carried forward, resolved if it wasn't
  // already.
  for (const [url, prior] of byUrl) {
    if (openUrls.has(url)) continue;
    incidents.push({
      ...prior,
      resolvedAt: prior.resolvedAt != null ? prior.resolvedAt : now,
    });
  }

  const components = COMPONENTS.map((c) => {
    const mapped = incidents.filter((i) => i.resolvedAt === null && i.components.includes(c.id));
    const state = mapped.some((i) => i.state === 'down')
      ? 'down'
      : mapped.length > 0
        ? 'degraded'
        : 'operational';
    return { id: c.id, name: c.name, state };
  });

  return { components, incidents };
}

module.exports = { deriveStatus, COMPONENTS };
