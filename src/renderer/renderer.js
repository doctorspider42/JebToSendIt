'use strict';
/* JebToSendIt — renderer: detekcja jebnięcia (peak + odcisk widmowy + długość) */

const $ = (id) => document.getElementById(id);
const t = (key, opts) => window.i18n.t(key, opts);

// ---- parametry analizy ----
const FFT_SIZE = 1024;          // 512 binów; bin ≈ 46.9 Hz przy 48 kHz
const BAND_COUNT = 8;           // pasma log do "odcisku" widma
const F_MIN = 150, F_MAX = 16000;
const EVAL_WINDOW_MS = 90;      // okno oceny zdarzenia (kształt + długość)
const CAL_FLOOR = 0.05;         // próg łapania jebnięć przy kalibracji
const RELEASE_FRAC = 0.3;       // poniżej tej części szczytu uznajemy że dźwięk ucichł

// ---- stan ----
const state = {
  settings: null,
  armed: false,
  calibrating: false,
  calEvents: [],
  lastHit: 0,
  stats: { today: 0, record: 0 },
  history: new Array(190).fill(0),
};

// ============================================================
//  Detektor audio (worklet = peak, analyser = widmo)
// ============================================================
class Detector {
  constructor(onPeak) {
    this.onPeak = onPeak;
    this.ctx = null; this.stream = null; this.node = null; this.src = null;
    this.analyser = null; this.freq = null; this.sampleRate = 48000;
  }

  async start(deviceId) {
    await this.stop();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: false, noiseSuppression: false, autoGainControl: false,
      },
    });
    this.ctx = new AudioContext();
    this.sampleRate = this.ctx.sampleRate;
    await this.ctx.audioWorklet.addModule('worklet.js');
    if (this.ctx.state === 'suspended') { try { await this.ctx.resume(); } catch (_) {} }

    this.src = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, 'peak-processor');
    this.node.port.onmessage = (e) => this.onPeak(e.data);

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = FFT_SIZE;
    this.analyser.smoothingTimeConstant = 0; // chcemy "tu i teraz"
    this.freq = new Float32Array(this.analyser.frequencyBinCount);

    // pociągnij graf bez słyszalnego dźwięku (gain 0)
    const g = this.ctx.createGain();
    g.gain.value = 0;
    this.src.connect(this.node); this.node.connect(g);
    this.src.connect(this.analyser); this.analyser.connect(g);
    g.connect(this.ctx.destination);
  }

  readSpectrumInto(target) {
    if (!this.analyser) return;
    this.analyser.getFloatFrequencyData(this.freq);
    for (let i = 0; i < target.length; i++) target[i] += dbToMag(this.freq[i]);
  }

  async stop() {
    try { if (this.node) this.node.port.onmessage = null; } catch (_) {}
    try { if (this.ctx) await this.ctx.close(); } catch (_) {}
    try { if (this.stream) this.stream.getTracks().forEach((t) => t.stop()); } catch (_) {}
    this.ctx = this.stream = this.node = this.src = this.analyser = null;
  }
}

// ============================================================
//  Analiza widma — pasma, płaskość, centroid, podobieństwo
// ============================================================
function dbToMag(db) {
  if (!isFinite(db)) return 0;
  return Math.pow(10, db / 20);
}

// granice pasm log
const BAND_EDGES = (() => {
  const e = [];
  for (let i = 0; i <= BAND_COUNT; i++) e.push(F_MIN * Math.pow(F_MAX / F_MIN, i / BAND_COUNT));
  return e;
})();

function bandsFromSpec(spec, sampleRate) {
  const binHz = sampleRate / FFT_SIZE;
  const bands = new Array(BAND_COUNT).fill(0);
  for (let k = 1; k < spec.length; k++) {
    const f = k * binHz;
    if (f < F_MIN || f > F_MAX) continue;
    let idx = Math.floor(BAND_COUNT * Math.log(f / F_MIN) / Math.log(F_MAX / F_MIN));
    if (idx < 0) idx = 0; if (idx >= BAND_COUNT) idx = BAND_COUNT - 1;
    bands[idx] += spec[k];
  }
  return bands;
}

function flatnessFromSpec(spec, sampleRate) {
  const binHz = sampleRate / FFT_SIZE;
  let logSum = 0, sum = 0, n = 0;
  for (let k = 1; k < spec.length; k++) {
    const f = k * binHz;
    if (f < F_MIN || f > F_MAX) continue;
    const m = spec[k] + 1e-9;
    logSum += Math.log(m); sum += m; n++;
  }
  if (n === 0 || sum === 0) return 0;
  const geo = Math.exp(logSum / n);
  const arith = sum / n;
  return Math.min(1, geo / arith);
}

function centroidFromSpec(spec, sampleRate) {
  const binHz = sampleRate / FFT_SIZE;
  let num = 0, den = 0;
  for (let k = 1; k < spec.length; k++) {
    const f = k * binHz;
    if (f < F_MIN || f > F_MAX) continue;
    num += f * spec[k]; den += spec[k];
  }
  return den ? num / den : 0;
}

function cosine(a, b) {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return (na && nb) ? d / Math.sqrt(na * nb) : 0;
}

// ============================================================
//  Maszyna stanów oceny zdarzenia
// ============================================================
let evalState = 'idle';   // 'idle' | 'collecting'
let ev = null;
const detector = new Detector(handlePeak);

function startEval(now, peak) {
  ev = {
    tStart: now,
    peak,
    peaks: [peak],
    spec: new Float32Array(detector.freq ? detector.freq.length : 512),
    polls: 0,
  };
  detector.readSpectrumInto(ev.spec); ev.polls++;
  evalState = 'collecting';
}

function finalizeEval(now) {
  evalState = 'idle';
  const e = ev; ev = null;
  if (!e || e.polls === 0) return null;

  // uśrednione widmo zdarzenia
  const spec = e.spec;
  for (let i = 0; i < spec.length; i++) spec[i] /= e.polls;

  // długość: ostatnia ramka powyżej RELEASE_FRAC * peak
  const rel = e.peak * RELEASE_FRAC;
  let lastAbove = 0;
  for (let i = 0; i < e.peaks.length; i++) if (e.peaks[i] >= rel) lastAbove = i;
  const span = now - e.tStart;
  const durationMs = e.peaks.length > 1 ? ((lastAbove + 1) / e.peaks.length) * span : span;

  return {
    peak: e.peak,
    bands: bandsFromSpec(spec, detector.sampleRate),
    flatness: flatnessFromSpec(spec, detector.sampleRate),
    centroid: centroidFromSpec(spec, detector.sampleRate),
    durationMs,
  };
}

// ============================================================
//  Obsługa strumienia peaków z worklet
// ============================================================
function handlePeak(peak) {
  state.history.push(peak);
  if (state.history.length > 190) state.history.shift();
  reportLevel(peak);

  const now = performance.now();
  const cfg = state.settings;
  if (!cfg) return;

  if (evalState === 'collecting') {
    if (peak > ev.peak) ev.peak = peak;
    ev.peaks.push(peak);
    detector.readSpectrumInto(ev.spec); ev.polls++;
    if (now - ev.tStart >= EVAL_WINDOW_MS) {
      const f = finalizeEval(now);
      state.lastHit = now;
      if (f) {
        if (state.calibrating) state.calEvents.push(f);
        else judgeEvent(f);
      }
    }
    return;
  }

  // idle — czy zaczynamy ocenę?
  const gateOpen = state.calibrating || state.armed;
  if (!gateOpen) return;
  const trigger = state.calibrating ? CAL_FLOOR : cfg.threshold;
  if (peak >= trigger && now - state.lastHit >= cfg.cooldownMs) {
    startEval(now, peak);
  }
}

// ============================================================
//  Werdykt: czy to jebnięcie czy krzyk
// ============================================================
function judgeEvent(f) {
  const cfg = state.settings;
  const prof = cfg.profile;

  if (!prof) {
    // brak profilu -> tylko amplituda (jak dawniej)
    fireHit(f, 1, t('reason.amplitude'));
    return;
  }

  const sim = cosine(f.bands, prof.bands);          // podobieństwo kształtu widma
  const maxDur = Math.min(220, Math.max(60, prof.durationMs * 2.5 + 30));
  const durOk = f.durationMs <= maxDur;
  const minSim = cfg.matchStrictness;
  const accept = sim >= minSim && durOk;

  if (accept) {
    fireHit(f, sim, null);
  } else {
    const reason = !durOk ? t('reason.tooLong') : t('reason.otherSound');
    rejectEvent(sim, reason, f);
  }
}

function fireHit(f, sim, note) {
  flashBadge('jeb');
  setVerdict(true, sim, note, f);
  void flushSettings().then(() => window.jeb.fireHit({ peak: f.peak, sim }));
}

function rejectEvent(sim, reason, f) {
  flashBadge('nope');
  setVerdict(false, sim, reason, f);
}

// ============================================================
//  UI okna głównego
// ============================================================
function flashBadge(kind) {
  const b = $('hitBadge');
  b.classList.remove('flash', 'nope');
  b.textContent = kind === 'jeb' ? t('badge.jeb') : t('badge.nope');
  if (kind === 'nope') b.classList.add('nope');
  void b.offsetWidth; // restart animacji
  b.classList.add('flash');
}

// ostatnie zdarzenie (trafione albo odrzucone) — pokazywane w karcie "Ostatni JEB"
let lastEvent = null;
function setVerdict(ok, sim, note, f) {
  lastEvent = { ok, pct: Math.round(sim * 100), note, at: Date.now(),
    ms: f ? Math.round(f.durationMs) : null, hz: f ? Math.round(f.centroid) : null };
  renderLastEvent();
}

function renderLastEvent() {
  const v = $('verdict');
  const meta = $('lastMeta');
  if (!lastEvent) {
    v.className = 'verdict'; v.textContent = t('verdict.dash');
    meta.textContent = t('last.none');
    return;
  }
  const e = lastEvent;
  v.className = 'verdict ' + (e.ok ? 'ok' : 'bad');
  if (e.ok) v.textContent = e.note ? t('verdict.jeb') : t('verdict.jebPct', { pct: e.pct });
  else v.textContent = t('verdict.rejected', { pct: e.pct });
  const ago = Math.max(0, Math.round((Date.now() - e.at) / 1000));
  const parts = [];
  if (e.note) parts.push(e.note);
  if (e.ms != null) parts.push(`${e.ms} ms`);
  if (e.hz) parts.push(`${(e.hz / 1000).toFixed(1)} kHz`);
  parts.push(ago < 60 ? t('last.secondsAgo', { count: ago }) : t('last.minutesAgo', { count: Math.floor(ago / 60) }));
  meta.textContent = parts.join(' · ');
}

// ---- scope ----
const scope = $('scope');
const sctx = scope.getContext('2d');
const gamma = (v) => Math.pow(Math.min(1, Math.max(0, v)), 0.55);

function drawScope() {
  const W = scope.width, H = scope.height;
  sctx.clearRect(0, 0, W, H);
  const n = state.history.length;
  const bw = W / n;
  const thr = state.settings ? state.settings.threshold : 0.25;
  const thrY = H - gamma(thr) * H;
  const dim = !state.armed;

  for (let i = 0; i < n; i++) {
    const v = state.history[i];
    const h = gamma(v) * H;
    const x = i * bw;
    if (v >= thr && !dim) {
      sctx.fillStyle = 'rgba(255,43,214,0.95)';
      sctx.shadowColor = '#ff2bd6'; sctx.shadowBlur = 12;
    } else if (dim) {
      sctx.fillStyle = 'rgba(80,80,120,0.55)'; sctx.shadowBlur = 0;
    } else {
      const g = sctx.createLinearGradient(0, H, 0, 0);
      g.addColorStop(0, 'rgba(0,232,255,0.25)');
      g.addColorStop(1, 'rgba(0,232,255,0.9)');
      sctx.fillStyle = g; sctx.shadowBlur = 0;
    }
    sctx.fillRect(x + 0.5, H - h, bw - 1, h);
  }
  sctx.shadowBlur = 0;

  sctx.strokeStyle = 'rgba(255,255,255,0.55)';
  sctx.setLineDash([6, 5]); sctx.lineWidth = 1.5;
  sctx.beginPath(); sctx.moveTo(0, thrY); sctx.lineTo(W, thrY); sctx.stroke();
  sctx.setLineDash([]);
  sctx.fillStyle = 'rgba(255,255,255,0.6)';
  sctx.font = '14px Consolas, monospace';
  sctx.fillText(t('scope.threshold', { val: thr.toFixed(2) }), 8, Math.max(16, thrY - 6));

  requestAnimationFrame(drawScope);
}

// ---- poziom sygnału → wskaźnik w oknie ustawień (~15 Hz) ----
let levelMax = 0, levelSentAt = 0;
function reportLevel(peak) {
  levelMax = Math.max(levelMax, peak);
  const now = performance.now();
  if (now - levelSentAt < 66) return;
  window.jeb.sendLevel(levelMax);
  levelMax = 0; levelSentAt = now;
}

// ============================================================
//  ARM / szybki wybór akcji / stopka
// ============================================================
function reflectArmed(armed) {
  state.armed = armed;
  $('armSwitch').setAttribute('aria-pressed', String(armed));
  $('led').classList.toggle('on', armed);
  const st = $('statusText');
  st.textContent = armed ? t('status.armed') : t('status.asleep');
  st.classList.toggle('on', armed);
  $('statusSub').textContent = armed ? t('status.armedSub', { action: activeLabel() }) : t('status.asleepSub');
}

const keyLabel = (key) => t(`keys.${key}`, { defaultValue: String(key).toUpperCase() });

function activeLabel() {
  const s = state.settings;
  const a = s.actions.find((x) => x.id === s.activeAction);
  return a ? (a.name || t('actions.untitled')) : keyLabel(s.keyToSend);
}

const ICONS = {
  key: '<path d="M20 5v7a3 3 0 0 1-3 3H5"/><path d="m9 11-4 4 4 4"/>',
  command: '<path d="m5 7 5 5-5 5"/><path d="M12 18h7"/>',
  script: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
};
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '14'); svg.setAttribute('height', '14');
  svg.setAttribute('aria-hidden', 'true');
  // ikony są stałymi z kodu, nie danymi użytkownika
  svg.innerHTML = ICONS[name];
  return svg;
}

function renderPicker() {
  const s = state.settings;
  const picker = $('actionPicker');
  picker.replaceChildren();
  const entries = [{ id: 'key', label: keyLabel(s.keyToSend), kind: 'key' },
    ...s.actions.map((a) => ({ id: a.id, label: a.name || t('actions.untitled'), kind: a.type }))];
  for (const e of entries) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(e.id === s.activeAction));
    b.append(icon(e.kind));
    const label = document.createElement('span');
    label.textContent = e.label;
    b.append(label);
    b.addEventListener('click', async () => {
      if (state.settings.activeAction === e.id) return;
      saveSettings({ activeAction: e.id });
      $('actionError').textContent = '';
      renderPicker();
      reflectArmed(state.armed);
      await flushSettings();
      void checkPermission();
    });
    picker.append(b);
  }
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'chip add';
  add.setAttribute('aria-label', t('pick.manage'));
  add.title = t('pick.manage');
  add.append(icon('plus'));
  add.addEventListener('click', () => window.jeb.openSettings('actions'));
  picker.append(add);

  const a = s.actions.find((x) => x.id === s.activeAction);
  $('actionHint').textContent = a ? (a.type === 'script' ? a.scriptPath : a.command) || t('actions.empty') : t('pick.keyHint', { key: keyLabel(s.keyToSend) });
}

function renderFooter() {
  const s = state.settings;
  $('recordText').textContent = t('records.summary', state.stats);
  $('hitChip').textContent = t('records.today', { count: state.stats.today });
  $('readout').textContent = t('pick.readout', {
    thr: s.threshold.toFixed(2), match: Math.round(s.matchStrictness * 100), cd: s.cooldownMs,
  });
}

// ---- uprawnienia macOS: zamiast suchego błędu — co włączyć i przycisk do Ustawień systemowych ----
let permKind = null;
function showPermission(kind) {
  permKind = kind;
  $('permBox').hidden = !kind;
  if (!kind) return;
  $('actionError').textContent = '';
  $('permText').textContent = t(`perm.${kind}`);
}

// Dostępność da się sprawdzić bez odpalania akcji; Automatyzację zgłasza dopiero błąd osascript.
async function checkPermission() {
  if (state.settings.activeAction !== 'key') { if (permKind === 'accessibility') showPermission(null); return; }
  const status = await window.jeb.permissionStatus();
  if (!status.accessibility) showPermission('accessibility');
  else if (permKind === 'accessibility') showPermission(null);
}

let toastTimer;
function showRecord(count) {
  const toast = $('recordToast');
  toast.textContent = t('records.message', { count });
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 5000);
}

// ============================================================
//  Kalibracja — uruchamiana z okna ustawień, wykonywana tutaj
// ============================================================
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function calibrate() {
  if (state.calibrating) return;
  const report = (p) => window.jeb.reportCalibration(p);

  for (const c of ['3…', '2…', '1…']) { report({ key: 'calib.prepare', opts: { t: c }, live: true }); await sleep(700); }
  report({ key: 'calib.go', live: true });

  state.calEvents = [];
  state.calibrating = true;
  await sleep(4000);
  state.calibrating = false;

  const events = state.calEvents.slice();
  if (events.length === 0) {
    report({ key: 'calib.nothing', done: true });
    return;
  }

  // agregacja profilu
  const n = events.length;
  const bands = new Array(BAND_COUNT).fill(0);
  let peak = 0, flatness = 0, centroid = 0, durationMs = 0;
  for (const e of events) {
    for (let i = 0; i < BAND_COUNT; i++) bands[i] += e.bands[i] / n;
    peak += e.peak / n; flatness += e.flatness / n;
    centroid += e.centroid / n; durationMs += e.durationMs / n;
  }
  const threshold = Math.min(0.9, Math.max(0.02, peak * 0.55));
  const profile = { bands, flatness, centroid, durationMs, peak, n };

  saveSettings({ threshold, profile });
  await flushSettings();
  renderFooter();
  report({ key: 'calib.done', opts: { count: n, threshold: threshold.toFixed(2), ms: Math.round(durationMs) }, ok: true, done: true });
}

// ============================================================
//  Ustawienia — zapis z opóźnieniem, synchronizacja z oknem ustawień
// ============================================================
let saveTimer = null;
let pendingSettings = {};
function saveSettings(partial) {
  state.settings = { ...state.settings, ...partial };
  pendingSettings = { ...pendingSettings, ...partial };
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSettings, 200);
}
async function flushSettings() {
  clearTimeout(saveTimer);
  const partial = pendingSettings;
  pendingSettings = {};
  if (Object.keys(partial).length) state.settings = { ...await window.jeb.setSettings(partial), ...pendingSettings };
}

async function applyExternalSettings(next) {
  const prev = state.settings;
  state.settings = { ...next, ...pendingSettings };
  if (prev.deviceId !== next.deviceId) {
    try { await detector.start(next.deviceId); } catch (err) { console.error(err); }
  }
  if (prev.language !== next.language) await window.i18n.change(next.language);
  renderAll();
}

function renderAll() {
  if (permKind) showPermission(permKind);
  reflectArmed(state.armed);
  renderPicker();
  renderFooter();
  renderLastEvent();
}

// ============================================================
//  Start
// ============================================================
async function init() {
  state.settings = await window.jeb.getSettings();

  // i18n: język z ustawień (null = autodetekcja z systemu)
  await window.i18n.init(state.settings.language);
  window.i18n.onChange(renderAll);

  state.armed = state.settings.armed;
  $('appVersion').textContent = `v${await window.jeb.getVersion()}`;
  state.stats = await window.jeb.getStats();
  renderAll();
  setInterval(async () => { state.stats = await window.jeb.getStats(); renderFooter(); }, 10000);
  setInterval(() => { if (lastEvent) renderLastEvent(); }, 1000);

  $('armSwitch').addEventListener('click', async () => { reflectArmed(await window.jeb.setArmed(!state.armed)); });
  window.jeb.onArmedChanged(reflectArmed);
  window.jeb.onSettingsChanged(applyExternalSettings);
  window.jeb.onCalibrationStart(() => { void calibrate(); });

  $('btnSettings').addEventListener('click', () => window.jeb.openSettings());
  $('readout').addEventListener('click', () => window.jeb.openSettings('detect'));
  $('btnMin').addEventListener('click', () => window.jeb.windowMinimize());
  $('btnHide').addEventListener('click', async () => { await flushSettings(); window.jeb.windowHide(); });
  $('btnQuit').addEventListener('click', async () => { await flushSettings(); window.jeb.quit(); });
  window.addEventListener('blur', () => { void flushSettings(); });

  window.jeb.onActionError((payload) => {
    const { message, permission } = typeof payload === 'string' ? { message: payload } : payload;
    if (permission) showPermission(permission);
    else $('actionError').textContent = t('action.error', { message });
  });
  $('permOpen').addEventListener('click', () => window.jeb.openPermission(permKind));
  $('permRecheck').addEventListener('click', async () => {
    if (permKind === 'automation') showPermission(null); // potwierdzi to dopiero następny JEB
    await checkPermission();
  });
  window.addEventListener('focus', () => { void checkPermission(); });
  void checkPermission();
  window.jeb.onHitFired(({ stats, newRecord }) => {
    state.stats = stats;
    $('actionError').textContent = '';
    if (permKind === 'automation') showPermission(null);
    renderFooter();
    if (newRecord && state.settings.recordNotifications) showRecord(stats.today);
    $('led').animate(
      [{ boxShadow: '0 0 10px #00e8ff, 0 0 22px #00e8ff' },
       { boxShadow: '0 0 18px #ff2bd6, 0 0 40px #ff2bd6' },
       { boxShadow: '0 0 10px #00e8ff, 0 0 22px #00e8ff' }],
      { duration: 260 });
  });

  try {
    await detector.start(state.settings.deviceId);
  } catch (err) {
    $('actionError').textContent = t('mic.denied', { err: err.message });
  }

  document.addEventListener('pointerdown', () => {
    if (detector.ctx && detector.ctx.state === 'suspended') detector.ctx.resume();
  }, { once: true });

  drawScope();
}

init();
