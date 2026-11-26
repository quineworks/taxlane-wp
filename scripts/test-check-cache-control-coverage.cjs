'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { extractCoveredPaths, findUncoveredAssets } = require('./check-cache-control-coverage.cjs');

const FIXTURE_WORKER_SOURCE = `
const CACHE_CONTROL_OVERRIDES = {
  "/favicon.ico": "public, max-age=604800",
  "/brand/blinkblocks-icon.png": "public, max-age=604800",
  "/brand/tethra-icon.svg": "public, max-age=604800",
};

const OTHER_MAP = {
  "/brand/not-a-cache-entry.svg": "irrelevant",
};
`;

test('extractCoveredPaths() reads every key out of CACHE_CONTROL_OVERRIDES', () => {
  const covered = extractCoveredPaths(FIXTURE_WORKER_SOURCE);
  assert.deepEqual(
    [...covered].sort(),
    ['/brand/blinkblocks-icon.png', '/brand/tethra-icon.svg', '/favicon.ico'].sort()
  );
});

test('extractCoveredPaths() does not pick up keys from an unrelated map', () => {
  const covered = extractCoveredPaths(FIXTURE_WORKER_SOURCE);
  assert.equal(covered.has('/brand/not-a-cache-entry.svg'), false);
});

test('extractCoveredPaths() returns an empty set when the map is missing', () => {
  const covered = extractCoveredPaths('const SOMETHING_ELSE = {};');
  assert.deepEqual([...covered], []);
});

test('findUncoveredAssets() with a covered-only fixture set -> empty', () => {
  const covered = new Set(['/brand/a.svg', '/brand/b.png']);
  const result = findUncoveredAssets(covered, ['/brand/a.svg', '/brand/b.png']);
  assert.deepEqual(result, []);
});

test('findUncoveredAssets() with one fixture file absent from the map -> returns that one file', () => {
  const covered = new Set(['/brand/a.svg']);
  const result = findUncoveredAssets(covered, ['/brand/a.svg', '/brand/b.png']);
  assert.deepEqual(result, ['/brand/b.png']);
});

test('findUncoveredAssets() with no asset paths -> empty', () => {
  const covered = new Set(['/brand/a.svg']);
  assert.deepEqual(findUncoveredAssets(covered, []), []);
});

test('findUncoveredAssets() with multiple uncovered files -> returns all of them, in order', () => {
  const covered = new Set(['/brand/a.svg']);
  const result = findUncoveredAssets(covered, ['/brand/a.svg', '/brand/b.png', '/icons/c.png']);
  assert.deepEqual(result, ['/brand/b.png', '/icons/c.png']);
});
