'use strict';
const Store = require('electron-store');

// Domyślne ustawienia + walidacja zakresów
const DEFAULTS = {
  deviceId: null,         // wybrane wejście audio (null = domyślne)
  threshold: 0.25,        // próg amplitudy szczytowej 0..1 (poniżej = bardziej czuły)
  cooldownMs: 350,        // martwy czas po uderzeniu, by nie wyzwalać serii
  matchStrictness: 0.8,   // rygor dopasowania widma jebnięcia (0.5..0.98)
  profile: null,          // "odcisk akustyczny" jebnięcia: {bands[8], flatness, centroid, durationMs, peak, n}
  keyToSend: 'enter',     // wysyłany klawisz
  armed: true,            // czy detektor jest uzbrojony
  startMinimized: false,  // start od razu do tray
};

function sanitizeProfile(p) {
  if (!p || typeof p !== 'object' || !Array.isArray(p.bands) || p.bands.length !== 8) return null;
  return {
    bands: p.bands.map((x) => Number(x) || 0),
    flatness: Number(p.flatness) || 0,
    centroid: Number(p.centroid) || 0,
    durationMs: Number(p.durationMs) || 0,
    peak: Number(p.peak) || 0,
    n: Math.max(1, Math.round(Number(p.n) || 1)),
  };
}

const store = new Store({
  name: 'jebtosendit-config',
  defaults: DEFAULTS,
});

function getAll() {
  return { ...DEFAULTS, ...store.store };
}

function setMany(partial) {
  const next = { ...getAll(), ...(partial || {}) };
  // sanity
  next.threshold = Math.min(1, Math.max(0, Number(next.threshold) || 0));
  next.cooldownMs = Math.min(3000, Math.max(50, Math.round(Number(next.cooldownMs) || 350)));
  next.matchStrictness = Math.min(0.98, Math.max(0.5, Number(next.matchStrictness) || 0.8));
  next.profile = sanitizeProfile(next.profile);
  next.armed = !!next.armed;
  next.startMinimized = !!next.startMinimized;
  store.set(next);
  return next;
}

module.exports = { store, getAll, setMany, DEFAULTS };
