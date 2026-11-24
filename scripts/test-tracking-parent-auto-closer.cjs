'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { decideClose, resolveTarget, HOLD_BLOCKED_REASON } = require('./tracking-parent-auto-closer.cjs');

test('one open sub-issue among several -> shouldClose: false', () => {
  const subIssues = [
    { number: 1, state: 'closed' },
    { number: 2, state: 'open' },
    { number: 3, state: 'closed' },
  ];
  const result = decideClose(subIssues, false);
  assert.equal(result.shouldClose, false);
  assert.match(result.reason, /#2/);
});

test('every sub-issue closed, no hold label -> shouldClose: true', () => {
  const subIssues = [
    { number: 10, state: 'closed' },
    { number: 11, state: 'closed' },
  ];
  const result = decideClose(subIssues, false);
  assert.equal(result.shouldClose, true);
  assert.match(result.reason, /#10/);
  assert.match(result.reason, /#11/);
});

test('every sub-issue closed but tracking-parent-hold present -> shouldClose: false', () => {
  const subIssues = [
    { number: 20, state: 'closed' },
    { number: 21, state: 'closed' },
  ];
  const result = decideClose(subIssues, true);
  assert.equal(result.shouldClose, false);
  assert.match(result.reason, /tracking-parent-hold/);
});

// platform#4310: the workflow's event-driven nudge trigger matches on this
// exact exported constant, not a hand-copied string -- this pins the
// decideClose() done-but-held branch to keep returning exactly that
// constant, so the two can never silently drift apart.
test('every sub-issue closed but tracking-parent-hold present -> reason is exactly HOLD_BLOCKED_REASON', () => {
  const subIssues = [
    { number: 20, state: 'closed' },
  ];
  const result = decideClose(subIssues, true);
  assert.equal(result.shouldClose, false);
  assert.equal(result.reason, HOLD_BLOCKED_REASON);
});

test('empty sub-issues list -> shouldClose: false', () => {
  const result = decideClose([], false);
  assert.equal(result.shouldClose, false);
});

test('empty sub-issues list with hold label -> shouldClose: false', () => {
  const result = decideClose([], true);
  assert.equal(result.shouldClose, false);
});

test('all sub-issues open -> shouldClose: false', () => {
  const subIssues = [
    { number: 30, state: 'open' },
    { number: 31, state: 'open' },
  ];
  const result = decideClose(subIssues, false);
  assert.equal(result.shouldClose, false);
});

// platform#1064: cross-repo children can be silently omitted by the REST
// sub_issues endpoint under the workflow's repo-scoped token, so a fetched
// list that's "all closed" isn't trustworthy unless it's also complete.
test('fetched list shorter than the true linked total (cross-repo truncation) -> shouldClose: false', () => {
  const subIssues = [
    { number: 1059, state: 'closed' },
  ];
  const result = decideClose(subIssues, false, 4);
  assert.equal(result.shouldClose, false);
  assert.match(result.reason, /1/);
  assert.match(result.reason, /4/);
  assert.match(result.reason, /truncated/);
});

test('fetched list matches the true linked total and all closed -> shouldClose: true (unaffected by the completeness check)', () => {
  const subIssues = [
    { number: 10, state: 'closed' },
    { number: 11, state: 'closed' },
  ];
  const result = decideClose(subIssues, false, 2);
  assert.equal(result.shouldClose, true);
});

test('expectedTotal omitted (legacy call site) -> completeness check skipped, behaves as before', () => {
  const subIssues = [
    { number: 10, state: 'closed' },
  ];
  const result = decideClose(subIssues, false);
  assert.equal(result.shouldClose, true);
});

// platform#4252: new trigger path — tracking-parent-hold removed from a
// parent whose sub-issues were already all closed. resolveTarget() is what
// makes the parent itself the recheck target instead of needing another
// sub-issue close event to re-fire the workflow.
test('resolveTarget: unlabeled event -> the issue itself is the target, no parent lookup', () => {
  const result = resolveTarget({
    eventAction: 'unlabeled',
    repo: 'quineworks/platform',
    issueNumber: 4178,
    parent: null,
  });
  assert.deepEqual(result, { repo: 'quineworks/platform', number: 4178 });
});

test('resolveTarget: closed event with a parent -> the parent is the target (unchanged behavior)', () => {
  const result = resolveTarget({
    eventAction: 'closed',
    repo: 'quineworks/platform',
    issueNumber: 4180,
    parent: { number: 4178, repository: { full_name: 'quineworks/platform' } },
  });
  assert.deepEqual(result, { repo: 'quineworks/platform', number: 4178 });
});

test('resolveTarget: closed event with no parent -> null, nothing to do', () => {
  const result = resolveTarget({
    eventAction: 'closed',
    repo: 'quineworks/platform',
    issueNumber: 4180,
    parent: null,
  });
  assert.equal(result, null);
});

test('resolveTarget: closed event, parent response missing repository/number -> null, fails safe', () => {
  const result = resolveTarget({
    eventAction: 'closed',
    repo: 'quineworks/platform',
    issueNumber: 4180,
    parent: {},
  });
  assert.equal(result, null);
});
