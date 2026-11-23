'use strict';

// Part 1/3 of platform#561 (see platform#563). GitHub's native Sub-issues
// REST API is the candidate-discovery and enumeration mechanism here — no
// regex/timeline scanning. `GET /repos/{owner}/{repo}/issues/{n}/parent` on
// a just-closed issue resolves its tracking parent (if any); `GET
// .../sub_issues` on that parent returns the enumerated list this function
// decides against.
//
// decideClose(subIssues, hasHoldLabel, expectedTotal) -> {shouldClose, reason}
//
// subIssues: array of issue objects as returned by GET .../sub_issues, each
// with at least `number` and `state` ("open"/"closed").
// hasHoldLabel: whether the parent carries the `tracking-parent-hold` label
// (the escape hatch for "more work remains beyond the linked sub-issues").
// expectedTotal: optional. The parent's true linked sub-issue count (e.g.
// GraphQL `subIssuesSummary.total`), which is unaffected by the REST
// endpoint's cross-repo token-scope truncation (platform#1064). When given
// and it doesn't match subIssues.length, the fetched list can't be trusted
// as complete — fail safe rather than closing on a partial list.
function decideClose(subIssues, hasHoldLabel, expectedTotal) {
  const issues = Array.isArray(subIssues) ? subIssues : [];

  if (typeof expectedTotal === 'number' && issues.length !== expectedTotal) {
    return {
      shouldClose: false,
      reason: `Fetched ${issues.length} sub-issue(s) but the parent's true linked total is ` +
        `${expectedTotal} — the fetched list may be truncated (e.g. a cross-repo token scope ` +
        'limit) and cannot be trusted as complete.',
    };
  }

  if (issues.length === 0) {
    return { shouldClose: false, reason: 'No sub-issues are linked yet.' };
  }

  const open = issues.filter((issue) => issue.state !== 'closed');
  if (open.length > 0) {
    const list = open.map((issue) => '#' + issue.number).join(', ');
    return { shouldClose: false, reason: `Sub-issue(s) still open: ${list}.` };
  }

  if (hasHoldLabel) {
    return {
      shouldClose: false,
      reason: 'tracking-parent-hold label present; holding despite all sub-issues being closed.',
    };
  }

  const closedList = issues.map((issue) => '#' + issue.number).join(', ');
  return {
    shouldClose: true,
    reason: `All linked sub-issue(s) verified closed: ${closedList}.`,
  };
}

// platform#4252: the dead end this fixes — `tracking-parent-hold-guard.yml`
// and `cto.md` both tell an agent to "remove tracking-parent-hold and let
// the auto-closer close it", but until this change the only trigger was
// `issues: closed` on a *sub-issue*. If every sub-issue was already closed
// before the hold was removed (the common case — the hold is usually the
// last thing blocking closure), nothing re-fired and the parent just sat
// open. `tracking-parent-auto-closer.yml` now also triggers on `unlabeled`
// (filtered to `tracking-parent-hold`) on the issue itself, so hold-removal
// alone is sufficient.
//
// resolveTarget({ eventAction, repo, issueNumber, parent }) -> { repo, number } | null
//
// eventAction: the webhook's `github.event.action` — 'closed' or
// 'unlabeled'.
// repo, issueNumber: the issue the webhook fired on (`owner/repo`, number).
// parent: only consulted for a 'closed' event — the `GET .../parent`
// response for the just-closed issue, or null/undefined if it has none.
//
// For 'unlabeled', the issue the hold was just removed from *is* the
// candidate tracking parent to recheck, so no parent lookup is needed. For
// 'closed', behavior is unchanged: resolve the just-closed issue's own
// tracking parent, if any.
function resolveTarget({ eventAction, repo, issueNumber, parent }) {
  if (eventAction === 'unlabeled') {
    return { repo, number: issueNumber };
  }

  const parentRepo = parent && parent.repository && parent.repository.full_name;
  const parentNumber = parent && parent.number;
  if (!parentRepo || !parentNumber) {
    return null;
  }
  return { repo: parentRepo, number: parentNumber };
}

module.exports = { decideClose, resolveTarget };

if (require.main === module) {
  // Wired up in #564: fetch `GET .../parent` on the just-closed issue, then
  // `GET {parent}/sub_issues`, check for the tracking-parent-hold label, and
  // call decideClose(). No trigger exists yet to invoke this, so the real
  // entrypoint isn't built out here.
  console.log('tracking-parent-auto-closer: no live entrypoint yet (workflow wiring lands in #564).');
}
