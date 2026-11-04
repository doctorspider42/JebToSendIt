'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { localDay, currentStats, recordHit } = require('../src/main/stats');
const day = new Date(2026, 10, 4, 23, 59);
test('uses the local calendar, resets today at midnight and retains record', () => {
  assert.equal(localDay(day), '2026-11-04');
  const saved = { day: localDay(day), today: 7, record: 10, notified: true };
  assert.equal(currentStats(saved, day).today, 7);
  assert.deepEqual(currentStats(saved, new Date(2026, 10, 5)), { day: '2026-11-05', today: 0, record: 10, notified: false });
});
test('exceeding the best day notifies once, including across a restart', () => {
  let saved = { day: localDay(day), today: 9, record: 10 };
  let hit = recordHit(saved, day);
  assert.equal(hit.newRecord, false);
  hit = recordHit(hit.stats, day);
  assert.equal(hit.newRecord, true);
  assert.equal(hit.stats.record, 11);
  hit = recordHit(JSON.parse(JSON.stringify(hit.stats)), day);
  assert.equal(hit.newRecord, false);
  assert.equal(hit.stats.record, 12);
  hit = recordHit(hit.stats, new Date(2026, 10, 5));
  assert.equal(hit.stats.today, 1);
  assert.equal(hit.newRecord, false);
});
test('first ever hit establishes the first record; corrupt counts are ignored', () => {
  assert.equal(recordHit({}, day).newRecord, true);
  assert.equal(currentStats({ day: localDay(day), today: -1, record: 'oops' }, day).record, 0);
});
