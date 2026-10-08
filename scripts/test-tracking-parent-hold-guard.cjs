'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { decideBypass } = require('./tracking-parent-hold-guard.cjs');

test('normal auto-closer close, no hold ever applied -> isBypass: false', () => {
  const result = decideBypass({
    events: [],
    closedAt: '2026-10-02T07:03:50Z',
    closedByLogin: 'github-actions[bot]',
  });
  assert.equal(result.isBypass, false);
});

test('normal auto-closer close, hold present at close -> isBypass: false (actor check short-circuits)', () => {
  const events = [
    { event: 'labeled', label: { name: 'tracking-parent-hold' }, actor: { login: 'manager' }, created_at: '2026-10-01T00:00:00Z' },
  ];
  const result = decideBypass({
    events,
    closedAt: '2026-10-02T07:03:50Z',
    closedByLogin: 'github-actions[bot]',
  });
  assert.equal(result.isBypass, false);
});

test('direct agent close with hold label still present at close time -> isBypass: true', () => {
  const events = [
    { event: 'labeled', label: { name: 'tracking-parent-hold' }, actor: { login: 'cto' }, created_at: '2026-10-01T00:00:00Z' },
  ];
  const result = decideBypass({
    events,
    closedAt: '2026-10-02T07:03:50Z',
    closedByLogin: 'quineworks',
  });
  assert.equal(result.isBypass, true);
  assert.match(result.reason, /present/);
});

// platform#3256: mirrors the tax-lane#2547 incident — manager verified the
// DoD gap was fixed, removed the hold, then closed, 1 second later in the
// same session. This is the guard's own prescribed remediation, not a
// bypass, regardless of how little time elapsed between the two actions.
test('direct agent close with hold stripped 1s before close (verified remediation) -> isBypass: false', () => {
  const events = [
    { event: 'labeled', label: { name: 'tracking-parent-hold' }, actor: { login: 'manager' }, created_at: '2026-09-20T00:00:00Z' },
    { event: 'unlabeled', label: { name: 'tracking-parent-hold' }, actor: { login: 'quineworks' }, created_at: '2026-10-02T07:03:51Z' },
  ];
  const result = decideBypass({
    events,
    closedAt: '2026-10-02T07:03:52Z',
    closedByLogin: 'quineworks',
  });
  assert.equal(result.isBypass, false);
  assert.match(result.reason, /not present at close time/);
});

test('direct agent close, hold removed hours earlier then closed -> isBypass: false', () => {
  const events = [
    { event: 'labeled', label: { name: 'tracking-parent-hold' }, actor: { login: 'manager' }, created_at: '2026-09-20T00:00:00Z' },
    { event: 'unlabeled', label: { name: 'tracking-parent-hold' }, actor: { login: 'manager' }, created_at: '2026-10-02T04:00:00Z' },
  ];
  const result = decideBypass({
    events,
    closedAt: '2026-10-02T07:03:50Z',
    closedByLogin: 'manager',
  });
  assert.equal(result.isBypass, false);
  assert.match(result.reason, /not present at close time/);
});

test('direct agent close, issue never carried the hold label -> isBypass: false', () => {
  const events = [
    { event: 'labeled', label: { name: 'bug' }, actor: { login: 'manager' }, created_at: '2026-10-01T00:00:00Z' },
  ];
  const result = decideBypass({
    events,
    closedAt: '2026-10-02T07:03:50Z',
    closedByLogin: 'manager',
  });
  assert.equal(result.isBypass, false);
});

test('label/unlabel events after close time are ignored (a later re-label does not retroactively count)', () => {
  const events = [
    { event: 'unlabeled', label: { name: 'tracking-parent-hold' }, actor: { login: 'manager' }, created_at: '2026-10-01T00:00:00Z' },
    { event: 'labeled', label: { name: 'tracking-parent-hold' }, actor: { login: 'manager' }, created_at: '2026-10-03T00:00:00Z' },
  ];
  const result = decideBypass({
    events,
    closedAt: '2026-10-02T07:03:50Z',
    closedByLogin: 'manager',
  });
  assert.equal(result.isBypass, false);
  assert.match(result.reason, /not present at close time/);
});
