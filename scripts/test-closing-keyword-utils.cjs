'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { extractCandidateNumbers, collectCovered, CLOSING_KEYWORD, NON_CLOSING_MARKER } = require('./closing-keyword-utils.cjs');

function sameRepoOf(result) {
  return [...result.sameRepo].sort((a, b) => a - b);
}

function crossRepoOf(result) {
  return [...result.crossRepo.entries()]
    .map(([repo, nums]) => [repo, [...nums].sort((a, b) => a - b)])
    .sort((a, b) => a[0].localeCompare(b[0]));
}

test('Closes tax-app#119 (no owner prefix, no currentRepo given) -> included as a same-repo candidate', () => {
  const result = extractCandidateNumbers('Closes tax-app#119');
  assert.deepEqual(sameRepoOf(result), [119]);
  assert.deepEqual(crossRepoOf(result), []);
});

test('Closes owner/repo#119 (true cross-repo) -> included as a cross-repo candidate, not same-repo', () => {
  const result = extractCandidateNumbers('Closes owner/repo#119');
  assert.deepEqual(sameRepoOf(result), []);
  assert.deepEqual(crossRepoOf(result), [['owner/repo', [119]]]);
});

test('Closes #119 (bare same-repo) -> included', () => {
  const result = extractCandidateNumbers('Closes #119');
  assert.deepEqual(sameRepoOf(result), [119]);
});

test('Fixes PR #120 -> skipped', () => {
  const result = extractCandidateNumbers('Fixes PR #120');
  assert.deepEqual(sameRepoOf(result), []);
  assert.deepEqual(crossRepoOf(result), []);
});

test('Fixes pull request #120 -> skipped', () => {
  const result = extractCandidateNumbers('Fixes pull request #120');
  assert.deepEqual(sameRepoOf(result), []);
});

test('mixed text with several kinds of reference, no currentRepo given -> only true candidates included', () => {
  const result = extractCandidateNumbers(
    'Closes tax-app#119 and #120. Related to owner/repo#7. See PR #5 for context.'
  );
  assert.deepEqual(sameRepoOf(result), [119, 120]);
  assert.deepEqual(crossRepoOf(result), [['owner/repo', [7]]]);
});

// platform#608: reponame#NNN is only a same-repo self-reference when
// `reponame` actually matches the repo this check runs in. Otherwise it's
// an ambiguous (not valid GitHub syntax) mention and must be skipped, not
// collapsed down to a bare same-repo #NNN.

test('tax-app#119 with currentRepo "tax-app" (self-reference, redundant prefix) -> included as a candidate', () => {
  const result = extractCandidateNumbers('Closes tax-app#119', 'tax-app');
  assert.deepEqual(sameRepoOf(result), [119]);
});

test('tax-app#174 with currentRepo "platform" (ambiguous shorthand, no owner) -> skipped, not treated as owner/repo', () => {
  const result = extractCandidateNumbers('See tax-app#174 for context.', 'platform');
  assert.deepEqual(sameRepoOf(result), []);
  assert.deepEqual(crossRepoOf(result), []);
});

test('tax-app#174 with currentRepo "platform", repro of #608 -> does not collide with an unrelated platform#174', () => {
  const result = extractCandidateNumbers(
    'Still blocked on Refs #608 (closing-keyword-check false positive on tax-app#174) — not addressed here.',
    'platform'
  );
  assert.deepEqual(sameRepoOf(result), [608]);
});

test('currentRepo comparison is case-insensitive', () => {
  const result = extractCandidateNumbers('Closes Tax-App#119', 'tax-app');
  assert.deepEqual(sameRepoOf(result), [119]);
});

test('mixed text with currentRepo "platform" -> same-repo bare #NNN and self-prefixed platform#NNN included, other reponame#NNN skipped, true owner/repo#NNN is a cross-repo candidate', () => {
  const result = extractCandidateNumbers(
    'Closes #120 and platform#121. Refs tax-app#174. Related to owner/repo#7. See PR #5 for context.',
    'platform'
  );
  assert.deepEqual(sameRepoOf(result), [120, 121]);
  assert.deepEqual(crossRepoOf(result), [['owner/repo', [7]]]);
});

// #1069: true cross-repo (owner/repo#NNN) candidates.

test('quineworks/platform#1048 (org-scoped cross-repo) -> included as a cross-repo candidate', () => {
  const result = extractCandidateNumbers('Part of quineworks/platform#1048', 'partners-portal');
  assert.deepEqual(sameRepoOf(result), []);
  assert.deepEqual(crossRepoOf(result), [['quineworks/platform', [1048]]]);
});

test('cross-repo candidate keys are lower-cased so casing differences still match', () => {
  const result = extractCandidateNumbers('Closes Quineworks/Platform#5');
  assert.deepEqual(crossRepoOf(result), [['quineworks/platform', [5]]]);
});

test('multiple distinct cross-repo owners/repos are tracked separately', () => {
  const result = extractCandidateNumbers('Refs quineworks/platform#1 and quineworks/tax-lane#2.');
  assert.deepEqual(
    crossRepoOf(result),
    [['quineworks/platform', [1]], ['quineworks/tax-lane', [2]]]
  );
});

test('a malformed owner/repo (leading slash) is skipped entirely', () => {
  const result = extractCandidateNumbers('See /repo#5 for context.');
  assert.deepEqual(sameRepoOf(result), []);
  assert.deepEqual(crossRepoOf(result), []);
});

test('PR #NNN cross-repo mention is skipped like a same-repo one', () => {
  const result = extractCandidateNumbers('See owner/repo PR #5 for context.');
  assert.deepEqual(crossRepoOf(result), []);
});

// collectCovered() + CLOSING_KEYWORD/NON_CLOSING_MARKER

test('collectCovered: Closes #1, owner/repo#2 and #3 covers a mixed same-repo/cross-repo list', () => {
  const result = collectCovered('Closes #1, owner/repo#2 and #3', CLOSING_KEYWORD);
  assert.deepEqual(sameRepoOf(result), [1, 3]);
  assert.deepEqual(crossRepoOf(result), [['owner/repo', [2]]]);
});

test('collectCovered: NON_CLOSING_MARKER covers a true cross-repo reference', () => {
  const result = collectCovered('Part of quineworks/platform#1048.', NON_CLOSING_MARKER);
  assert.deepEqual(crossRepoOf(result), [['quineworks/platform', [1048]]]);
});

test('collectCovered: "Part of platform#1048" (no owner) is NOT covered — not valid GitHub cross-repo syntax', () => {
  const result = collectCovered('Part of platform#1048.', NON_CLOSING_MARKER);
  assert.deepEqual(sameRepoOf(result), []);
  assert.deepEqual(crossRepoOf(result), []);
});

test('collectCovered: cross-repo coverage matching is case-insensitive', () => {
  const closing = collectCovered('Closes Quineworks/Platform#5', CLOSING_KEYWORD);
  const candidates = extractCandidateNumbers('Closes quineworks/platform#5');
  const [key] = [...candidates.crossRepo.keys()];
  assert.equal(closing.crossRepo.has(key), true);
});

test('collectCovered: an uncovered owner/repo#NNN mention with no keyword or marker at all is not covered by either pattern', () => {
  const closing = collectCovered('Refactor the shared helper (touches quineworks/platform#42 for context).', CLOSING_KEYWORD);
  const marker = collectCovered('Refactor the shared helper (touches quineworks/platform#42 for context).', NON_CLOSING_MARKER);
  assert.deepEqual(crossRepoOf(closing), []);
  assert.deepEqual(crossRepoOf(marker), []);
});
