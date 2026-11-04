'use strict';

function localDay(date = new Date()) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')].join('-');
}

function currentStats(saved = {}, date = new Date()) {
  const day = localDay(date);
  const count = (v) => Number.isSafeInteger(v) && v >= 0 ? v : 0;
  const today = saved.day === day ? count(saved.today) : 0;
  return { day, today, record: Math.max(count(saved.record), today),
    notified: saved.day === day && saved.notified === true };
}

function recordHit(saved, date = new Date()) {
  const stats = currentStats(saved, date);
  stats.today++;
  const newRecord = stats.today > stats.record && !stats.notified;
  stats.record = Math.max(stats.record, stats.today);
  if (newRecord) stats.notified = true;
  return { stats, newRecord };
}

module.exports = { localDay, currentStats, recordHit };
