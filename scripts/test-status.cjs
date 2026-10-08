'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { deriveStatus } = require('./status-derive.cjs');

const NOW = '2026-08-06T15:00:00Z';

function componentState(result, id) {
  return result.components.find((c) => c.id === id).state;
}

test('no open live-incident issues anywhere -> every component operational, no incidents', () => {
  const result = deriveStatus({ existingIncidents: [], openIssues: [], now: NOW });
  assert.ok(result.components.every((c) => c.state === 'operational'));
  assert.deepEqual(result.incidents, []);
});

test('labeling an open issue live-incident + component:taxlane -> that row degraded, entry created with resolvedAt: null', () => {
  const openIssues = [{
    url: 'https://github.com/quineworks/pouchbooks/issues/500',
    title: 'Sync failing on Account page',
    componentIds: ['taxlane'],
    severityDown: false,
    createdAt: '2026-08-06T12:00:00Z',
  }];
  const result = deriveStatus({ existingIncidents: [], openIssues, now: NOW });
  assert.equal(componentState(result, 'taxlane'), 'degraded');
  assert.equal(componentState(result, 'quineworks-site'), 'operational');
  assert.equal(result.incidents.length, 1);
  assert.equal(result.incidents[0].resolvedAt, null);
  assert.equal(result.incidents[0].openedAt, '2026-08-06T12:00:00Z');
});

test('adding severity:down to that same issue -> row flips to down', () => {
  const existingIncidents = [{
    url: 'https://github.com/quineworks/pouchbooks/issues/500',
    title: 'Sync failing on Account page',
    components: ['taxlane'],
    state: 'degraded',
    openedAt: '2026-08-06T12:00:00Z',
    resolvedAt: null,
  }];
  const openIssues = [{
    url: 'https://github.com/quineworks/pouchbooks/issues/500',
    title: 'Sync failing on Account page',
    componentIds: ['taxlane'],
    severityDown: true,
    createdAt: '2026-08-06T12:00:00Z',
  }];
  const result = deriveStatus({ existingIncidents, openIssues, now: NOW });
  assert.equal(componentState(result, 'taxlane'), 'down');
  assert.equal(result.incidents[0].state, 'down');
  // openedAt is preserved from the prior entry, not re-derived from the issue.
  assert.equal(result.incidents[0].openedAt, '2026-08-06T12:00:00Z');
});

test('closing the issue (or removing live-incident) -> component back to operational, resolvedAt filled', () => {
  const existingIncidents = [{
    url: 'https://github.com/quineworks/pouchbooks/issues/500',
    title: 'Sync failing on Account page',
    components: ['taxlane'],
    state: 'degraded',
    openedAt: '2026-08-06T12:00:00Z',
    resolvedAt: null,
  }];
  // The issue no longer shows up in the live open-issues query, whether
  // because it closed or because live-incident was removed.
  const result = deriveStatus({ existingIncidents, openIssues: [], now: NOW });
  assert.equal(componentState(result, 'taxlane'), 'operational');
  assert.equal(result.incidents[0].resolvedAt, NOW);
});

test('closing an issue that still carries live-incident (labels persist through close) resolves it with the real closedAt, not the run-time now', () => {
  const existingIncidents = [{
    url: 'https://github.com/quineworks/pouchbooks/issues/500',
    title: 'Sync failing on Account page',
    components: ['taxlane'],
    state: 'degraded',
    openedAt: '2026-08-06T12:00:00Z',
    resolvedAt: null,
  }];
  const triggerIssue = {
    url: 'https://github.com/quineworks/pouchbooks/issues/500',
    title: 'Sync failing on Account page',
    componentIds: ['taxlane'],
    severityDown: false,
    isOpen: false,
    isLiveIncident: true,
    createdAt: '2026-08-06T12:00:00Z',
    closedAt: '2026-08-06T13:58:15Z',
  };
  const result = deriveStatus({ existingIncidents, openIssues: [], triggerIssue, now: NOW });
  assert.equal(result.incidents[0].resolvedAt, '2026-08-06T13:58:15Z');
  assert.equal(componentState(result, 'taxlane'), 'operational');
});

test('two simultaneous open incidents on different components -> two independent degraded rows', () => {
  const openIssues = [
    {
      url: 'https://github.com/quineworks/platform/issues/500',
      title: 'Site down',
      componentIds: ['quineworks-site'],
      severityDown: false,
      createdAt: '2026-08-06T12:00:00Z',
    },
    {
      url: 'https://github.com/quineworks/tax-lane/issues/900',
      title: 'TaxLane calculator erroring',
      componentIds: ['taxlane'],
      severityDown: false,
      createdAt: '2026-08-06T12:30:00Z',
    },
  ];
  const result = deriveStatus({ existingIncidents: [], openIssues, now: NOW });
  assert.equal(componentState(result, 'quineworks-site'), 'degraded');
  assert.equal(componentState(result, 'taxlane'), 'degraded');
  assert.equal(result.incidents.length, 2);
});

test('multi-incident overlap: two open issues map to the same component -> closing one leaves it degraded, only closing both resolves it', () => {
  const existingIncidents = [
    {
      url: 'https://github.com/quineworks/pouchbooks/issues/500',
      title: 'Sync down (first)',
      components: ['taxlane'],
      state: 'degraded',
      openedAt: '2026-08-06T12:00:00Z',
      resolvedAt: null,
    },
    {
      url: 'https://github.com/quineworks/pouchbooks/issues/501',
      title: 'Sync down (second, unrelated)',
      components: ['taxlane'],
      state: 'degraded',
      openedAt: '2026-08-06T12:10:00Z',
      resolvedAt: null,
    },
  ];
  // #500 closed, #501 still open.
  const openIssues = [{
    url: 'https://github.com/quineworks/pouchbooks/issues/501',
    title: 'Sync down (second, unrelated)',
    componentIds: ['taxlane'],
    severityDown: false,
    createdAt: '2026-08-06T12:10:00Z',
  }];
  const result = deriveStatus({ existingIncidents, openIssues, now: NOW });
  assert.equal(componentState(result, 'taxlane'), 'degraded');
  const resolved = result.incidents.find((i) => i.url.endsWith('/500'));
  const stillOpen = result.incidents.find((i) => i.url.endsWith('/501'));
  assert.equal(resolved.resolvedAt, NOW);
  assert.equal(stillOpen.resolvedAt, null);
});

test('reopening a closed incident that still carries live-incident -> component degrades again, resolvedAt reset, openedAt preserved', () => {
  const existingIncidents = [{
    url: 'https://github.com/quineworks/pouchbooks/issues/500',
    title: 'Sync down',
    components: ['taxlane'],
    state: 'degraded',
    openedAt: '2026-08-06T12:00:00Z',
    resolvedAt: '2026-08-06T13:00:00Z',
  }];
  const openIssues = [{
    url: 'https://github.com/quineworks/pouchbooks/issues/500',
    title: 'Sync down',
    componentIds: ['taxlane'],
    severityDown: false,
    createdAt: '2026-08-06T12:00:00Z',
  }];
  const result = deriveStatus({ existingIncidents, openIssues, now: NOW });
  assert.equal(componentState(result, 'taxlane'), 'degraded');
  assert.equal(result.incidents[0].resolvedAt, null);
  assert.equal(result.incidents[0].openedAt, '2026-08-06T12:00:00Z');
});

test('retroactive labeling of an already-closed issue -> historical entry recorded as already resolved, component unaffected', () => {
  const triggerIssue = {
    url: 'https://github.com/quineworks/pouchbooks/issues/444',
    title: 'PouchBooks sync retrying repeatedly on the Account page',
    componentIds: ['taxlane'],
    severityDown: false,
    isOpen: false,
    isLiveIncident: true,
    createdAt: '2026-08-06T12:38:07Z',
    closedAt: '2026-08-06T13:58:15Z',
  };
  const result = deriveStatus({ existingIncidents: [], openIssues: [], triggerIssue, now: NOW });
  assert.equal(componentState(result, 'taxlane'), 'operational');
  assert.equal(result.incidents.length, 1);
  assert.equal(result.incidents[0].resolvedAt, '2026-08-06T13:58:15Z');
  assert.equal(result.incidents[0].openedAt, '2026-08-06T12:38:07Z');
});

test('retroactive labeling on a closed issue with no closedAt available falls back to now', () => {
  const triggerIssue = {
    url: 'https://github.com/quineworks/pouchbooks/issues/444',
    title: 'PouchBooks sync retrying repeatedly on the Account page',
    componentIds: ['taxlane'],
    severityDown: false,
    isOpen: false,
    isLiveIncident: true,
    createdAt: '2026-08-06T12:38:07Z',
    closedAt: null,
  };
  const result = deriveStatus({ existingIncidents: [], openIssues: [], triggerIssue, now: NOW });
  assert.equal(result.incidents[0].resolvedAt, NOW);
});

test('a second labeled event on the same already-closed issue (e.g. component added after live-incident) updates the same entry rather than duplicating it', () => {
  // First event: live-incident just added.
  const first = deriveStatus({
    existingIncidents: [],
    openIssues: [],
    triggerIssue: {
      url: 'https://github.com/quineworks/pouchbooks/issues/444',
      title: 'PouchBooks sync retrying repeatedly on the Account page',
      componentIds: [],
      severityDown: false,
      isOpen: false,
      isLiveIncident: true,
      createdAt: '2026-08-06T12:38:07Z',
      closedAt: '2026-08-06T13:58:15Z',
    },
    now: NOW,
  });
  assert.equal(first.incidents.length, 1);
  assert.deepEqual(first.incidents[0].components, []);

  // Second event: component:taxlane added on top.
  const second = deriveStatus({
    existingIncidents: first.incidents,
    openIssues: [],
    triggerIssue: {
      url: 'https://github.com/quineworks/pouchbooks/issues/444',
      title: 'PouchBooks sync retrying repeatedly on the Account page',
      componentIds: ['taxlane'],
      severityDown: false,
      isOpen: false,
      isLiveIncident: true,
      createdAt: '2026-08-06T12:38:07Z',
      closedAt: '2026-08-06T13:58:15Z',
    },
    now: NOW,
  });
  assert.equal(second.incidents.length, 1);
  assert.deepEqual(second.incidents[0].components, ['taxlane']);
  assert.equal(second.incidents[0].openedAt, '2026-08-06T12:38:07Z');
});

// Concurrent label events on different issues within the same short window
// don't clobber each other's status.json writes -- this is a property of
// status.yml's live entrypoint reusing changelog.yml's DynamoDB lock
// acquire/release primitive around the read-derive-write, not of this pure
// function, so it isn't (and can't usefully be) fixture-tested here. See
// status.yml's own comments for the lock.
