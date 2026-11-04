'use strict';
const path = require('node:path');
let store;

const KEYS = ['enter', 'space', 'tab', 'esc', 'escape', 'up', 'down', 'left', 'right'];
const MAX_ACTIONS = 30;
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

// Domyślne ustawienia + walidacja zakresów
const DEFAULTS = {
  deviceId: null,         // wybrane wejście audio (null = domyślne)
  threshold: 0.25,        // próg amplitudy szczytowej 0..1 (poniżej = bardziej czuły)
  cooldownMs: 350,        // martwy czas po uderzeniu, by nie wyzwalać serii
  matchStrictness: 0.8,   // rygor dopasowania widma jebnięcia (0.5..0.98)
  profile: null,          // "odcisk akustyczny" jebnięcia: {bands[8], flatness, centroid, durationMs, peak, n}
  actions: [],            // własne akcje: [{id, name, type: 'command'|'script', command, scriptPath}]
  activeAction: 'key',    // 'key' = wbudowany klawisz, inaczej id własnej akcji
  recordNotifications: true,
  keyToSend: 'enter',     // klawisz wbudowanej akcji
  armed: true,            // czy detektor jest uzbrojony
  startMinimized: false,  // start od razu do tray
  language: null,         // 'en' | 'pl' | null (null = autodetekcja z systemu)
};

const LEGACY_KEYS = ['actionType', 'command', 'scriptPath'];

async function init() {
  const { default: Store } = await import('electron-store');
  store = new Store({ name: 'jebtosendit-config', defaults: DEFAULTS });
  // 0.3.x trzymało jedną akcję w actionType/command/scriptPath → lista akcji
  if (LEGACY_KEYS.some((k) => store.has(k))) {
    const legacy = Object.fromEntries(LEGACY_KEYS.map((k) => [k, store.get(k)]));
    const migrated = migrateLegacy(legacy, store.get('actions', []));
    store.set(migrated);
    LEGACY_KEYS.forEach((k) => store.delete(k));
  }
}

// Przenosi starą pojedynczą akcję do listy akcji. Czysta funkcja (testowana).
function migrateLegacy(legacy, existing = []) {
  const actions = sanitizeActions(existing);
  let activeAction = 'key';
  const command = typeof legacy.command === 'string' ? legacy.command.trim() : '';
  const scriptPath = typeof legacy.scriptPath === 'string' ? legacy.scriptPath.trim() : '';
  if (command) {
    actions.push({ id: 'legacy-command', name: command.slice(0, 24), type: 'command', command, scriptPath: '' });
    if (legacy.actionType === 'command') activeAction = 'legacy-command';
  }
  if (scriptPath) {
    actions.push({ id: 'legacy-script', name: path.basename(scriptPath).slice(0, 60), type: 'script', command: '', scriptPath });
    if (legacy.actionType === 'script') activeAction = 'legacy-script';
  }
  return { actions: sanitizeActions(actions), activeAction };
}

function sanitizeActions(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const a of list) {
    if (!a || typeof a !== 'object' || !ID_RE.test(a.id) || seen.has(a.id)) continue;
    seen.add(a.id);
    out.push({
      id: a.id,
      name: typeof a.name === 'string' ? a.name.slice(0, 60) : '',
      type: a.type === 'script' ? 'script' : 'command',
      command: typeof a.command === 'string' ? a.command.slice(0, 16000) : '',
      scriptPath: typeof a.scriptPath === 'string' ? a.scriptPath.slice(0, 4096) : '',
    });
    if (out.length >= MAX_ACTIONS) break;
  }
  return out;
}

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

function sanitize(next) {
  next.threshold = Math.min(1, Math.max(0, Number(next.threshold) || 0));
  next.cooldownMs = Math.min(3000, Math.max(50, Math.round(Number(next.cooldownMs) || 350)));
  next.matchStrictness = Math.min(0.98, Math.max(0.5, Number(next.matchStrictness) || 0.8));
  next.profile = sanitizeProfile(next.profile);
  next.armed = !!next.armed;
  next.startMinimized = !!next.startMinimized;
  next.language = (next.language === 'en' || next.language === 'pl') ? next.language : null;
  next.actions = sanitizeActions(next.actions);
  next.activeAction = next.actions.some((a) => a.id === next.activeAction) ? next.activeAction : 'key';
  next.recordNotifications = !!next.recordNotifications;
  next.keyToSend = KEYS.includes(next.keyToSend) ? next.keyToSend : 'enter';
  return next;
}

function getAll() {
  return Object.fromEntries(Object.entries(DEFAULTS).map(([key, value]) => [key, store.get(key, value)]));
}

function setMany(partial) {
  const allowed = Object.fromEntries(Object.entries(partial || {}).filter(([key]) => Object.hasOwn(DEFAULTS, key)));
  const next = sanitize({ ...getAll(), ...allowed });
  store.set(next);
  return next;
}

module.exports = { init, getAll, setMany, DEFAULTS, KEYS, migrateLegacy, sanitizeActions,
  getStats: () => store.get('stats', {}), setStats: (stats) => store.set('stats', stats) };
