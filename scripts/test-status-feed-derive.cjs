'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { deriveStatusFeedXml, componentNames } = require('./status-feed-derive.cjs');
const { COMPONENTS } = require('./status-derive.cjs');

test('no incidents -> zero <item> elements, still valid RSS shell', () => {
  const xml = deriveStatusFeedXml({ incidents: [], components: COMPONENTS });
  assert.ok(!xml.includes('<item>'));
  assert.ok(xml.includes('<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">'));
  assert.ok(xml.includes('<channel>'));
});

test('channel boilerplate matches the hand-authored status-feed.xml verbatim', () => {
  const xml = deriveStatusFeedXml({ incidents: [], components: COMPONENTS });
  assert.ok(xml.includes('<title>Quine Works Status</title>'));
  assert.ok(xml.includes('<link>https://quineworks.com/status</link>'));
  assert.ok(xml.includes('<description>Current status and incident history for TaxLane and quineworks.com.</description>'));
  assert.ok(xml.includes('<language>en</language>'));
  assert.ok(xml.includes('<atom:link href="https://quineworks.com/status-feed.xml" rel="self" type="application/rss+xml" />'));
});

// platform#2550: `pouchbooks-sync` was removed from COMPONENTS when
// PouchBooks was halted, but the 2026-08-06 incident fixture below (mirrors
// the real, still-on-file #444 incident) still carries it in its own
// `components` array -- componentNames()'s id-not-found fallback means this
// renders as the raw id now, not "PouchBooks sync". Exercises the same
// graceful-degradation path COMPONENTS' own comment documents.
test('resolved incident -> description reads "{component} — resolved", pubDate is resolvedAt', () => {
  const incidents = [{
    title: 'PouchBooks sync retrying repeatedly on the Account page',
    components: ['pouchbooks-sync'],
    state: 'degraded',
    openedAt: '2026-08-06T12:38:07Z',
    resolvedAt: '2026-08-06T13:58:15Z',
    url: 'https://github.com/quineworks/pouchbooks/issues/444',
  }];
  const xml = deriveStatusFeedXml({ incidents, components: COMPONENTS });
  assert.ok(xml.includes('<title>PouchBooks sync retrying repeatedly on the Account page</title>'));
  assert.ok(xml.includes('<description>pouchbooks-sync — resolved</description>'));
  assert.ok(xml.includes('<pubDate>Thu, 06 Aug 2026 13:58:15 GMT</pubDate>'));
  assert.ok(xml.includes('<link>https://quineworks.com/status#2026-08-06</link>'));
  assert.ok(xml.includes('<guid isPermaLink="false">https://quineworks.com/status#2026-08-06</guid>'));
});

test('this matches the current hand-authored status-feed.xml, modulo the post-#2550 component-name fallback, for its one existing incident', () => {
  const incidents = [{
    title: 'PouchBooks sync retrying repeatedly on the Account page',
    components: ['pouchbooks-sync'],
    state: 'degraded',
    openedAt: '2026-08-06T12:38:07Z',
    resolvedAt: '2026-08-06T13:58:15Z',
    url: 'https://github.com/quineworks/pouchbooks/issues/444',
  }];
  const xml = deriveStatusFeedXml({ incidents, components: COMPONENTS });
  const itemBlock = xml.slice(xml.indexOf('    <item>'), xml.indexOf('    </item>') + '    </item>'.length);
  assert.equal(
    itemBlock,
    [
      '    <item>',
      '      <title>PouchBooks sync retrying repeatedly on the Account page</title>',
      '      <link>https://quineworks.com/status#2026-08-06</link>',
      '      <guid isPermaLink="false">https://quineworks.com/status#2026-08-06</guid>',
      '      <pubDate>Thu, 06 Aug 2026 13:58:15 GMT</pubDate>',
      '      <description>pouchbooks-sync — resolved</description>',
      '    </item>',
    ].join('\n'),
  );
});

test('ongoing (unresolved) incident -> description reads "{component} — {state}", pubDate is openedAt', () => {
  const incidents = [{
    title: 'TaxLane calculator erroring',
    components: ['taxlane'],
    state: 'down',
    openedAt: '2026-08-20T09:00:00Z',
    resolvedAt: null,
    url: 'https://github.com/quineworks/tax-lane/issues/900',
  }];
  const xml = deriveStatusFeedXml({ incidents, components: COMPONENTS });
  assert.ok(xml.includes('<description>TaxLane — down</description>'));
  assert.ok(xml.includes('<pubDate>Thu, 20 Aug 2026 09:00:00 GMT</pubDate>'));
});

test('multi-component incident -> description comma-joins component names via componentNames()', () => {
  assert.equal(
    componentNames(['taxlane', 'quineworks-site'], COMPONENTS),
    'TaxLane, quineworks.com',
  );
});

test('componentNames() falls back to the raw id for a component no longer in COMPONENTS (platform#2550)', () => {
  assert.equal(
    componentNames(['taxlane', 'pouchbooks-sync'], COMPONENTS),
    'TaxLane, pouchbooks-sync',
  );
});

test('one <item> per incident, not per component', () => {
  const incidents = [
    {
      title: 'First',
      components: ['taxlane'],
      state: 'degraded',
      openedAt: '2026-08-01T00:00:00Z',
      resolvedAt: '2026-08-01T01:00:00Z',
      url: 'https://github.com/quineworks/tax-lane/issues/1',
    },
    {
      title: 'Second',
      components: ['quineworks-site', 'taxlane'],
      state: 'down',
      openedAt: '2026-08-02T00:00:00Z',
      resolvedAt: null,
      url: 'https://github.com/quineworks/platform/issues/2',
    },
  ];
  const xml = deriveStatusFeedXml({ incidents, components: COMPONENTS });
  assert.equal((xml.match(/<item>/g) || []).length, 2);
});

test('sort order matches status.html: by openedAt, most recent first (not by pubDate/resolvedAt)', () => {
  const incidents = [
    {
      title: 'Older, resolved late',
      components: ['taxlane'],
      state: 'degraded',
      openedAt: '2026-08-01T00:00:00Z',
      resolvedAt: '2026-08-20T00:00:00Z',
      url: 'https://github.com/quineworks/tax-lane/issues/1',
    },
    {
      title: 'Newer, still ongoing',
      components: ['taxlane'],
      state: 'degraded',
      openedAt: '2026-08-10T00:00:00Z',
      resolvedAt: null,
      url: 'https://github.com/quineworks/tax-lane/issues/2',
    },
  ];
  const xml = deriveStatusFeedXml({ incidents, components: COMPONENTS });
  const firstTitleIndex = xml.indexOf('Newer, still ongoing');
  const secondTitleIndex = xml.indexOf('Older, resolved late');
  assert.ok(firstTitleIndex > 0 && secondTitleIndex > firstTitleIndex);
});

test('never renders incident.url (private tracking-issue link, platform#1951)', () => {
  const incidents = [{
    title: 'Sync down',
    components: ['pouchbooks-sync'],
    state: 'down',
    openedAt: '2026-08-06T12:00:00Z',
    resolvedAt: null,
    url: 'https://github.com/quineworks/pouchbooks/issues/500',
  }];
  const xml = deriveStatusFeedXml({ incidents, components: COMPONENTS });
  assert.ok(!xml.includes('github.com'));
});

test('title is XML-escaped', () => {
  const incidents = [{
    title: 'Sync <failing> & "erroring"',
    components: ['pouchbooks-sync'],
    state: 'down',
    openedAt: '2026-08-06T12:00:00Z',
    resolvedAt: null,
    url: 'https://github.com/quineworks/pouchbooks/issues/500',
  }];
  const xml = deriveStatusFeedXml({ incidents, components: COMPONENTS });
  assert.ok(xml.includes('<title>Sync &lt;failing&gt; &amp; &quot;erroring&quot;</title>'));
});
