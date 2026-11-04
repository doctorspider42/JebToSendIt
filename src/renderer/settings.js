'use strict';
/* JebToSendIt — okno ustawień: detekcja, kalibracja, akcje, statystyki, aplikacja */

const $ = (id) => document.getElementById(id);
const t = (key, opts) => window.i18n.t(key, opts);
const BAND_COUNT = 8;
const TABS = ['detect', 'calib', 'actions', 'stats', 'app'];

const state = {
  settings: null,
  tab: 'detect',
  selected: 'key',        // zaznaczona akcja w edytorze ('key' albo id)
  stats: { today: 0, record: 0 },
  calib: null,            // ostatni raport kalibracji z okna głównego
  update: { status: 'idle' },
};

// ============================================================
//  Zapis ustawień (z opóźnieniem) + synchronizacja
// ============================================================
let saveTimer = null;
let pending = {};
function saveSettings(partial) {
  state.settings = { ...state.settings, ...partial };
  pending = { ...pending, ...partial };
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSettings, 250);
}
async function flushSettings() {
  clearTimeout(saveTimer);
  const partial = pending;
  pending = {};
  if (Object.keys(partial).length) state.settings = { ...await window.jeb.setSettings(partial), ...pending };
}

async function applyExternalSettings(next) {
  state.settings = { ...next, ...pending };
  if (window.i18n.language !== window.i18n.resolve(next.language)) await window.i18n.change(next.language);
  renderAll();
}

// ============================================================
//  Zakładki
// ============================================================
function showTab(tab) {
  if (!TABS.includes(tab)) tab = 'detect';
  state.tab = tab;
  document.querySelectorAll('.nav-item').forEach((b) => {
    const on = b.dataset.tab === tab;
    b.classList.toggle('on', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  document.querySelectorAll('.tab').forEach((s) => { s.hidden = s.dataset.pane !== tab; });
}

// ============================================================
//  Detekcja: knoby + wejście audio + poziom
// ============================================================
function makeKnob(el, { min, max, step, value, onChange }) {
  let val = value;
  const setVisual = () => {
    const norm = (val - min) / (max - min);
    el.style.setProperty('--ang', (-135 + norm * 270) + 'deg');
    el.style.setProperty('--pct', (norm * 75) + '%');
    el.setAttribute('aria-valuemin', String(min));
    el.setAttribute('aria-valuemax', String(max));
    el.setAttribute('aria-valuenow', String(val));
  };
  const apply = (v, fire = true) => {
    val = Math.min(max, Math.max(min, v));
    setVisual();
    if (fire) onChange(val);
  };
  setVisual();
  let dragging = false, startY = 0, startVal = 0;
  el.addEventListener('pointerdown', (e) => { dragging = true; startY = e.clientY; startVal = val; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    apply(startVal + ((startY - e.clientY) / 200) * (max - min));
  });
  const end = () => { dragging = false; };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('wheel', (e) => { e.preventDefault(); apply(val - Math.sign(e.deltaY) * (max - min) * 0.02); }, { passive: false });
  el.addEventListener('keydown', (e) => {
    const dir = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key];
    if (dir) { e.preventDefault(); apply(val + dir * step); }
  });
  return { set: (v) => apply(v, false) };
}

let knobs;
function setupKnobs() {
  const s = state.settings;
  knobs = {
    threshold: makeKnob($('knobThreshold'), {
      min: 0.01, max: 0.9, step: 0.01, value: s.threshold,
      onChange: (v) => { $('valThreshold').textContent = v.toFixed(2); saveSettings({ threshold: v }); },
    }),
    match: makeKnob($('knobMatch'), {
      min: 0.5, max: 0.98, step: 0.01, value: s.matchStrictness,
      onChange: (v) => { $('valMatch').textContent = Math.round(v * 100) + '%'; saveSettings({ matchStrictness: v }); },
    }),
    cooldown: makeKnob($('knobCooldown'), {
      min: 50, max: 1500, step: 10, value: s.cooldownMs,
      onChange: (v) => { const ms = Math.round(v); $('valCooldown').textContent = ms + ' ms'; saveSettings({ cooldownMs: ms }); },
    }),
  };
}

function renderKnobs() {
  const s = state.settings;
  knobs.threshold.set(s.threshold); $('valThreshold').textContent = s.threshold.toFixed(2);
  knobs.match.set(s.matchStrictness); $('valMatch').textContent = Math.round(s.matchStrictness * 100) + '%';
  knobs.cooldown.set(s.cooldownMs); $('valCooldown').textContent = s.cooldownMs + ' ms';
}

async function populateDevices() {
  const sel = $('deviceSelect');
  let devices = [];
  try { devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput'); } catch (_) {}
  sel.replaceChildren();
  const def = document.createElement('option');
  def.value = ''; def.textContent = t('device.systemDefault');
  sel.append(def);
  devices.filter((d) => d.deviceId && d.deviceId !== 'default').forEach((d, i) => {
    const o = document.createElement('option');
    o.value = d.deviceId; o.textContent = d.label || t('device.input', { n: i + 1 });
    sel.append(o);
  });
  sel.value = state.settings.deviceId || '';
}

// ============================================================
//  Kalibracja (wykonuje okno główne)
// ============================================================
function buildSpectrumBars() {
  const el = $('profSpectrum');
  el.replaceChildren(...Array.from({ length: BAND_COUNT }, () => {
    const b = document.createElement('div'); b.className = 'bar'; return b;
  }));
}

function drawProfile() {
  const profile = state.settings.profile;
  const el = $('profSpectrum');
  if (!profile) {
    el.classList.add('empty');
    for (const b of el.children) b.style.height = '8%';
    $('profMeta').textContent = t('profile.none');
    return;
  }
  el.classList.remove('empty');
  const max = Math.max(1e-9, ...profile.bands);
  [...el.children].forEach((b, i) => { b.style.height = Math.max(4, (profile.bands[i] / max) * 100) + '%'; });
  $('profMeta').textContent = t('profile.meta', {
    n: profile.n, ms: Math.round(profile.durationMs), hz: Math.round(profile.centroid),
  });
}

function renderCalib() {
  const p = state.calib;
  const status = $('calStatus');
  const btn = $('btnCalibrate');
  status.textContent = p ? t(p.key, p.opts) : '';
  status.classList.toggle('ok', !!(p && p.ok));
  btn.classList.toggle('live', !!(p && p.live));
  btn.disabled = !!(p && p.live);
}

// ============================================================
//  Akcje: lista + edytor
// ============================================================
const keyLabel = (key) => t(`keys.${key}`, { defaultValue: String(key).toUpperCase() });

function newId() {
  return 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function updateAction(id, patch) {
  const actions = state.settings.actions.map((a) => (a.id === id ? { ...a, ...patch } : a));
  saveSettings({ actions });
}

function renderActionList() {
  const s = state.settings;
  const list = $('actionList');
  list.replaceChildren();
  const rows = [{ id: 'key', name: t('actions.keyName'), kind: 'key', preview: keyLabel(s.keyToSend) },
    ...s.actions.map((a) => ({ id: a.id, name: a.name || t('actions.untitled'), kind: a.type,
      preview: (a.type === 'script' ? a.scriptPath : a.command) || t('actions.empty') }))];
  for (const r of rows) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'action-row';
    b.setAttribute('role', 'option');
    b.setAttribute('aria-selected', String(r.id === state.selected));
    const badge = document.createElement('span');
    badge.className = 'badge ' + r.kind;
    badge.textContent = t(`actions.badge.${r.kind}`);
    const text = document.createElement('span');
    text.className = 'row-text';
    const name = document.createElement('span'); name.className = 'row-name'; name.textContent = r.name;
    const prev = document.createElement('span'); prev.className = 'row-preview'; prev.textContent = r.preview;
    text.append(name, prev);
    b.append(badge, text);
    if (r.id === s.activeAction) {
      const active = document.createElement('span');
      active.className = 'row-active';
      active.textContent = t('actions.active');
      b.append(active);
    }
    b.addEventListener('click', () => { state.selected = r.id; $('testResult').textContent = ''; renderActions(); });
    list.append(b);
  }
}

function renderEditor() {
  const s = state.settings;
  const a = s.actions.find((x) => x.id === state.selected);
  if (!a) state.selected = 'key';
  $('keyEditor').hidden = !!a;
  $('customEditor').hidden = !a;
  $('keySelect').value = s.keyToSend === 'escape' ? 'esc' : s.keyToSend;
  if (!a) return;
  // nie nadpisuj pola, w którym ktoś właśnie pisze
  const setVal = (el, v) => { if (document.activeElement !== el) el.value = v; };
  setVal($('actName'), a.name);
  setVal($('commandInput'), a.command);
  setVal($('scriptPath'), a.scriptPath);
  document.querySelectorAll('[data-type]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.type === a.type)));
  $('commandFields').hidden = a.type !== 'command';
  $('scriptFields').hidden = a.type !== 'script';
}

function renderActions() {
  renderActionList();
  renderEditor();
}

function setupActions() {
  $('btnNewAction').addEventListener('click', async () => {
    const id = newId();
    const actions = [...state.settings.actions, { id, name: t('actions.newName'), type: 'command', command: '', scriptPath: '' }];
    saveSettings({ actions });
    state.selected = id;
    renderActions();
    $('actName').focus();
    $('actName').select();
    await flushSettings();
  });
  $('keySelect').addEventListener('change', (e) => { saveSettings({ keyToSend: e.target.value }); renderActionList(); });
  $('actName').addEventListener('input', (e) => { updateAction(state.selected, { name: e.target.value }); renderActionList(); });
  $('commandInput').addEventListener('input', (e) => { updateAction(state.selected, { command: e.target.value }); renderActionList(); });
  $('scriptPath').addEventListener('input', (e) => { updateAction(state.selected, { scriptPath: e.target.value }); renderActionList(); });
  document.querySelectorAll('[data-type]').forEach((b) => b.addEventListener('click', () => {
    updateAction(state.selected, { type: b.dataset.type });
    renderActions();
  }));
  $('chooseScript').addEventListener('click', async () => {
    const scriptPath = await window.jeb.chooseScript();
    if (!scriptPath) return;
    updateAction(state.selected, { scriptPath });
    renderActions();
    await flushSettings();
  });
  $('btnTest').addEventListener('click', async () => {
    await flushSettings();
    const out = $('testResult');
    out.classList.remove('ok');
    out.textContent = t('actions.testing');
    const err = await window.jeb.testAction(state.selected);
    out.textContent = err ? t('action.error', { message: err }) : t('actions.testOk');
    out.classList.toggle('ok', !err);
  });
  $('btnDelete').addEventListener('click', async () => {
    const id = state.selected;
    const actions = state.settings.actions.filter((a) => a.id !== id);
    const partial = { actions };
    if (state.settings.activeAction === id) partial.activeAction = 'key';
    saveSettings(partial);
    state.selected = 'key';
    renderActions();
    await flushSettings();
  });
}

// ============================================================
//  Statystyki / aplikacja
// ============================================================
function renderStats() {
  $('statToday').textContent = String(state.stats.today);
  $('statRecord').textContent = String(state.stats.record);
  $('recordNotifications').checked = !!state.settings.recordNotifications;
}

function renderApp() {
  const lang = state.settings.language || '';
  document.querySelectorAll('[data-lang]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.lang === lang)));
  $('startMin').checked = !!state.settings.startMinimized;
  renderUpdates();
}

function renderUpdates() {
  const update = state.update;
  $('updateStatus').textContent = t(`updates.${update.status}`, update);
  $('checkUpdates').disabled = !['idle', 'current', 'error'].includes(update.status);
  $('installUpdate').hidden = update.status !== 'ready';
}

function renderAll() {
  renderKnobs();
  drawProfile();
  renderCalib();
  renderActions();
  renderStats();
  renderApp();
  void populateDevices();
}

// ============================================================
//  Start
// ============================================================
async function init() {
  state.settings = await window.jeb.getSettings();
  await window.i18n.init(state.settings.language);
  window.i18n.onChange(renderAll);
  document.title = `JebToSendIt — ${t('settings.titleCase')}`;

  state.selected = state.settings.activeAction;
  state.stats = await window.jeb.getStats();
  $('appVersion').textContent = `JebToSendIt v${await window.jeb.getVersion()}`;
  window.jeb.onUpdateChanged((update) => { state.update = update; renderUpdates(); });
  state.update = await window.jeb.getUpdateState();
  $('checkUpdates').addEventListener('click', () => { void window.jeb.checkForUpdates(); });
  $('installUpdate').addEventListener('click', async () => {
    await flushSettings();
    await window.jeb.installUpdate();
  });

  setupKnobs();
  buildSpectrumBars();
  setupActions();

  document.querySelectorAll('.nav-item').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  showTab(new URLSearchParams(location.search).get('tab') || 'detect');
  window.jeb.onSettingsTab(showTab);

  $('deviceSelect').addEventListener('change', (e) => saveSettings({ deviceId: e.target.value || null }));
  $('btnCalibrate').addEventListener('click', () => {
    state.calib = { key: 'calib.prepare', opts: { t: '…' }, live: true };
    renderCalib();
    window.jeb.startCalibration();
  });
  window.jeb.onCalibrationProgress((p) => { state.calib = p; renderCalib(); });

  let levelDecay = 0;
  window.jeb.onLevel((v) => {
    levelDecay = Math.max(v, levelDecay * 0.8);
    $('levelBar').style.width = Math.min(100, Math.pow(levelDecay, 0.55) * 100) + '%';
  });

  $('recordNotifications').addEventListener('change', (e) => saveSettings({ recordNotifications: e.target.checked }));
  $('startMin').addEventListener('change', (e) => saveSettings({ startMinimized: e.target.checked }));
  document.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', async () => {
    const language = b.dataset.lang || null;
    saveSettings({ language });
    await flushSettings();
    await window.i18n.change(language);
    renderApp();
  }));

  window.jeb.onSettingsChanged(applyExternalSettings);
  window.jeb.onHitFired(({ stats }) => { state.stats = stats; renderStats(); });

  $('btnClose').addEventListener('click', async () => { await flushSettings(); window.jeb.closeSettings(); });
  window.addEventListener('blur', () => { void flushSettings(); });
  window.addEventListener('beforeunload', () => { void flushSettings(); });
  document.addEventListener('keydown', async (e) => {
    if (e.key === 'Escape' && !e.target.closest('input, textarea, select')) { await flushSettings(); window.jeb.closeSettings(); }
  });

  renderAll();
}

init();
