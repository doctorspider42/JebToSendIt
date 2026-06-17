'use strict';
/* JebToSendIt — renderer: detekcja jebnięcia (peak + odcisk widmowy + długość) */

const $ = (id) => document.getElementById(id);

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
  hits: 0,
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
    fireHit(f, 1, 'amplituda');
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
    const reason = !durOk ? 'za długie (krzyk?)' : 'inne brzmienie';
    rejectEvent(sim, reason);
  }
}

function fireHit(f, sim, note) {
  state.hits++;
  $('hitChip').textContent = 'JEBNIĘĆ: ' + state.hits;
  flashBadge('jeb');
  setVerdict(true, sim, note);
  window.jeb.fireHit({ peak: f.peak, sim });
}

function rejectEvent(sim, reason) {
  flashBadge('nope');
  setVerdict(false, sim, reason);
}

// ============================================================
//  UI
// ============================================================
function flashBadge(kind) {
  const b = $('hitBadge');
  b.classList.remove('flash', 'nope');
  b.textContent = kind === 'jeb' ? 'JEB!' : 'krzyk? ✕';
  if (kind === 'nope') b.classList.add('nope');
  void b.offsetWidth; // restart animacji
  b.classList.add('flash');
}

function setVerdict(ok, sim, note) {
  const v = $('verdict');
  const pct = Math.round(sim * 100);
  v.classList.toggle('ok', ok);
  v.classList.toggle('bad', !ok);
  if (ok) v.textContent = (note ? 'JEB ✓' : 'JEB ✓ ' + pct + '%');
  else v.textContent = 'ODRZUCONE ✕ ' + pct + '%';
  if (note) $('profMeta').textContent = note;
}

function buildSpectrumBars() {
  const el = $('profSpectrum');
  el.innerHTML = '';
  for (let i = 0; i < BAND_COUNT; i++) {
    const b = document.createElement('div');
    b.className = 'bar';
    el.appendChild(b);
  }
}

function drawProfile(profile) {
  const el = $('profSpectrum');
  const bars = el.children;
  if (!profile) {
    el.classList.add('empty');
    for (const b of bars) b.style.height = '8%';
    $('profMeta').textContent = 'brak profilu — skalibruj jebnięcie';
    return;
  }
  el.classList.remove('empty');
  const max = Math.max(1e-9, ...profile.bands);
  for (let i = 0; i < bars.length; i++) {
    bars[i].style.height = Math.max(4, (profile.bands[i] / max) * 100) + '%';
  }
  $('profMeta').textContent =
    `profil z ${profile.n} jebnięć · ~${Math.round(profile.durationMs)} ms · centroid ${Math.round(profile.centroid)} Hz`;
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

  for (let i = 0; i < n; i++) {
    const v = state.history[i];
    const h = gamma(v) * H;
    const x = i * bw;
    if (v >= thr) {
      sctx.fillStyle = 'rgba(255,43,214,0.95)';
      sctx.shadowColor = '#ff2bd6'; sctx.shadowBlur = 12;
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
  sctx.font = '12px Consolas, monospace';
  sctx.fillText('PRÓG ' + thr.toFixed(2), 8, Math.max(14, thrY - 6));

  requestAnimationFrame(drawScope);
}

// ---- knob ----
function makeKnob(el, { min, max, value, onChange }) {
  let val = value;
  const setVisual = () => {
    const norm = (val - min) / (max - min);
    el.style.setProperty('--ang', (-135 + norm * 270) + 'deg');
    el.style.setProperty('--pct', (norm * 75) + '%');
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
    const dy = startY - e.clientY;
    apply(startVal + (dy / 200) * (max - min));
  });
  const end = () => { dragging = false; };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('wheel', (e) => { e.preventDefault(); apply(val - Math.sign(e.deltaY) * (max - min) * 0.02); }, { passive: false });
  return { get: () => val, set: (v) => apply(v, false) };
}

// ============================================================
//  ARM / kalibracja / urządzenia / ustawienia
// ============================================================
function reflectArmed(armed) {
  state.armed = armed;
  $('armSwitch').setAttribute('aria-pressed', String(armed));
  $('led').classList.toggle('on', armed);
  const st = $('statusText');
  st.textContent = armed ? 'UZBROJONY' : 'UŚPIONY';
  st.classList.toggle('on', armed);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function calibrate(thresholdKnob) {
  if (state.calibrating) return;
  const btn = $('btnCalibrate');
  const status = $('calStatus');
  status.classList.remove('ok');
  btn.classList.add('live');

  for (const t of ['3…', '2…', '1…']) { status.textContent = 'Przygotuj się: ' + t; await sleep(700); }
  status.textContent = '⚡ JEBNIJ 2-3 RAZY! ⚡';

  state.calEvents = [];
  state.calibrating = true;
  await sleep(4000);
  state.calibrating = false;
  btn.classList.remove('live');

  const events = state.calEvents.slice();
  if (events.length === 0) {
    status.textContent = 'Nic nie złapałem. Jebnij mocniej / sprawdź mikrofon.';
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

  thresholdKnob.set(threshold);
  $('valThreshold').textContent = threshold.toFixed(2);
  saveSettings({ threshold, profile });
  drawProfile(profile);

  status.classList.add('ok');
  status.textContent =
    `Złapałem ${n} jebnięć → próg ${threshold.toFixed(2)}, długość ~${Math.round(durationMs)} ms. Krzyk już nie puści ENTER.`;
}

let saveTimer = null;
function saveSettings(partial) {
  state.settings = { ...state.settings, ...partial };
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => window.jeb.setSettings(partial), 200);
}

async function populateDevices(selected) {
  const sel = $('deviceSelect');
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
  sel.innerHTML = '';
  const def = document.createElement('option');
  def.value = ''; def.textContent = 'Domyślne wejście systemowe';
  sel.appendChild(def);
  devices.forEach((d, i) => {
    const o = document.createElement('option');
    o.value = d.deviceId; o.textContent = d.label || `Wejście ${i + 1}`;
    sel.appendChild(o);
  });
  sel.value = selected || '';
}

// ============================================================
//  Start
// ============================================================
async function init() {
  state.settings = await window.jeb.getSettings();
  reflectArmed(state.settings.armed);
  buildSpectrumBars();
  drawProfile(state.settings.profile);

  const kThr = makeKnob($('knobThreshold'), {
    min: 0.01, max: 0.9, value: state.settings.threshold,
    onChange: (v) => { $('valThreshold').textContent = v.toFixed(2); saveSettings({ threshold: v }); },
  });
  $('valThreshold').textContent = state.settings.threshold.toFixed(2);

  const kMatch = makeKnob($('knobMatch'), {
    min: 0.5, max: 0.98, value: state.settings.matchStrictness,
    onChange: (v) => { $('valMatch').textContent = Math.round(v * 100) + '%'; saveSettings({ matchStrictness: v }); },
  });
  $('valMatch').textContent = Math.round(state.settings.matchStrictness * 100) + '%';

  const kCool = makeKnob($('knobCooldown'), {
    min: 50, max: 1500, value: state.settings.cooldownMs,
    onChange: (v) => { const ms = Math.round(v); $('valCooldown').textContent = ms + ' ms'; saveSettings({ cooldownMs: ms }); },
  });
  $('valCooldown').textContent = state.settings.cooldownMs + ' ms';

  $('keyName').textContent = (state.settings.keyToSend || 'enter').toUpperCase();
  $('startMin').checked = !!state.settings.startMinimized;
  $('startMin').addEventListener('change', (e) => saveSettings({ startMinimized: e.target.checked }));

  $('armSwitch').addEventListener('click', async () => { reflectArmed(await window.jeb.setArmed(!state.armed)); });
  window.jeb.onArmedChanged(reflectArmed);

  $('btnCalibrate').addEventListener('click', () => calibrate(kThr));

  $('btnMin').addEventListener('click', () => window.jeb.windowMinimize());
  $('btnHide').addEventListener('click', () => window.jeb.windowHide());
  $('btnQuit').addEventListener('click', () => window.jeb.quit());

  window.jeb.onHitFired(() => {
    $('led').animate(
      [{ boxShadow: '0 0 10px #00e8ff, 0 0 22px #00e8ff' },
       { boxShadow: '0 0 18px #ff2bd6, 0 0 40px #ff2bd6' },
       { boxShadow: '0 0 10px #00e8ff, 0 0 22px #00e8ff' }],
      { duration: 260 });
  });

  try {
    await detector.start(state.settings.deviceId);
    await populateDevices(state.settings.deviceId);
  } catch (err) {
    $('calStatus').textContent = 'Brak dostępu do mikrofonu: ' + err.message;
  }

  $('deviceSelect').addEventListener('change', async (e) => {
    const id = e.target.value || null;
    saveSettings({ deviceId: id });
    try { await detector.start(id); } catch (err) { console.error(err); }
  });

  document.addEventListener('pointerdown', () => {
    if (detector.ctx && detector.ctx.state === 'suspended') detector.ctx.resume();
  }, { once: true });

  drawScope();
}

init();
