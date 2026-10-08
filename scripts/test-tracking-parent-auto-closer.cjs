'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { decideClose } = require('./tracking-parent-auto-closer.cjs');

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
