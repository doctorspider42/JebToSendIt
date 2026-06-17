'use strict';
const Store = require('electron-store');

// Domyślne ustawienia + walidacja zakresów
const DEFAULTS = {
  deviceId: null,        // wybrane wejście audio (null = domyślne)
  threshold: 0.25,       // próg amplitudy szczytowej 0..1 (poniżej = bardziej czuły)
  cooldownMs: 350,       // martwy czas po uderzeniu, by nie wyzwalać serii
  keyToSend: 'enter',    // wysyłany klawisz
  armed: true,           // czy detektor jest uzbrojony
  startMinimized: false, // start od razu do tray
};

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
  next.armed = !!next.armed;
  next.startMinimized = !!next.startMinimized;
  store.set(next);
  return next;
}

module.exports = { store, getAll, setMany, DEFAULTS };
