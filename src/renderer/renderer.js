'use strict';
/* JebToSendIt — renderer: detekcja uderzenia z mikrofonu + UI */

const $ = (id) => document.getElementById(id);

// ---------------- stan ----------------
const state = {
  settings: null,
  armed: false,
  calibrating: false,
  calMax: 0,
  lastHit: 0,
  hits: 0,
  level: 0,        // wygładzony poziom do wyświetlania
  history: new Array(190).fill(0),
};

// ---------------- detektor audio ----------------
class Detector {
  constructor(onPeak) {
    this.onPeak = onPeak;
    this.ctx = null; this.stream = null; this.node = null; this.src = null;
  }

  async start(deviceId) {
    await this.stop();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    this.ctx = new AudioContext();
    await this.ctx.audioWorklet.addModule('worklet.js');
    if (this.ctx.state === 'suspended') { try { await this.ctx.resume(); } catch (_) {} }
    this.src = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, 'peak-processor');
    this.node.port.onmessage = (e) => this.onPeak(e.data);
    // pociągnij graf bez słyszalnego dźwięku (gain 0)
    const g = this.ctx.createGain();
    g.gain.value = 0;
    this.src.connect(this.node);
    this.node.connect(g).connect(this.ctx.destination);
  }

  async stop() {
    try { if (this.node) this.node.port.onmessage = null; } catch (_) {}
    try { if (this.ctx) await this.ctx.close(); } catch (_) {}
    try { if (this.stream) this.stream.getTracks().forEach((t) => t.stop()); } catch (_) {}
    this.ctx = this.stream = this.node = this.src = null;
  }
}

// ---------------- knob (pokrętło) ----------------
function makeKnob(el, { min, max, value, format, onChange }) {
  let val = value;
  const setVisual = () => {
    const norm = (val - min) / (max - min);
    el.style.setProperty('--ang', (-135 + norm * 270) + 'deg');
    el.style.setProperty('--pct', (norm * 75) + '%'); // 270deg = 75% obwodu
  };
  const apply = (v, fire = true) => {
    val = Math.min(max, Math.max(min, v));
    setVisual();
    if (fire) onChange(val);
  };
  setVisual();

  let dragging = false, startY = 0, startVal = 0;
  el.addEventListener('pointerdown', (e) => {
    dragging = true; startY = e.clientY; startVal = val;
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dy = startY - e.clientY;          // w górę = więcej
    const span = (max - min);
    apply(startVal + (dy / 200) * span);    // 200px = pełny zakres
  });
  const end = () => { dragging = false; };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  // scroll też kręci
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    apply(val - Math.sign(e.deltaY) * (max - min) * 0.02);
  }, { passive: false });

  return { get: () => val, set: (v) => apply(v, false), apply };
}

// ---------------- scope (oscyloskop poziomu) ----------------
const scope = $('scope');
const sctx = scope.getContext('2d');
const gamma = (v) => Math.pow(Math.min(1, Math.max(0, v)), 0.55); // żeby było widać małe sygnały

function drawScope() {
  const W = scope.width, H = scope.height;
  sctx.clearRect(0, 0, W, H);
  const n = state.history.length;
  const bw = W / n;

  const thr = state.settings ? state.settings.threshold : 0.25;
  const thrY = H - gamma(thr) * H;

  // słupki historii
  for (let i = 0; i < n; i++) {
    const v = state.history[i];
    const h = gamma(v) * H;
    const x = i * bw;
    const over = v >= thr;
    if (over) {
      sctx.fillStyle = 'rgba(255,43,214,0.95)';
      sctx.shadowColor = '#ff2bd6'; sctx.shadowBlur = 12;
    } else {
      const g = sctx.createLinearGradient(0, H, 0, 0);
      g.addColorStop(0, 'rgba(0,232,255,0.25)');
      g.addColorStop(1, 'rgba(0,232,255,0.9)');
      sctx.fillStyle = g;
      sctx.shadowBlur = 0;
    }
    sctx.fillRect(x + 0.5, H - h, bw - 1, h);
  }
  sctx.shadowBlur = 0;

  // linia progu
  sctx.strokeStyle = 'rgba(255,255,255,0.55)';
  sctx.setLineDash([6, 5]);
  sctx.lineWidth = 1.5;
  sctx.beginPath(); sctx.moveTo(0, thrY); sctx.lineTo(W, thrY); sctx.stroke();
  sctx.setLineDash([]);
  sctx.fillStyle = 'rgba(255,255,255,0.6)';
  sctx.font = '12px Consolas, monospace';
  sctx.fillText('PRÓG ' + thr.toFixed(2), 8, Math.max(14, thrY - 6));

  requestAnimationFrame(drawScope);
}

// ---------------- obsługa szczytu ----------------
function handlePeak(peak) {
  // historia przesuwa się w lewo
  state.history.push(peak);
  if (state.history.length > 190) state.history.shift();

  if (state.calibrating) {
    if (peak > state.calMax) state.calMax = peak;
    return;
  }

  if (!state.armed || !state.settings) return;
  const now = performance.now();
  if (peak >= state.settings.threshold && now - state.lastHit >= state.settings.cooldownMs) {
    state.lastHit = now;
    fireHit(peak);
  }
}

function fireHit(peak) {
  state.hits++;
  $('hitCount').textContent = state.hits;
  const badge = $('hitBadge');
  badge.classList.remove('flash');
  void badge.offsetWidth; // restart animacji
  badge.classList.add('flash');
  window.jeb.fireHit({ peak });
}

// ---------------- ARM ----------------
function reflectArmed(armed) {
  state.armed = armed;
  $('armSwitch').setAttribute('aria-pressed', String(armed));
  $('led').classList.toggle('on', armed);
  const st = $('statusText');
  st.textContent = armed ? 'UZBROJONY' : 'UŚPIONY';
  st.classList.toggle('on', armed);
}

// ---------------- kalibracja ----------------
async function calibrate(thresholdKnob) {
  if (state.calibrating) return;
  const btn = $('btnCalibrate');
  const status = $('calStatus');
  status.classList.remove('ok');
  btn.classList.add('live');

  for (const t of ['3…', '2…', '1…']) {
    status.textContent = 'Przygotuj się: ' + t;
    await sleep(700);
  }
  status.textContent = '⚡ JEBNIJ TERAZ! ⚡';
  state.calMax = 0;
  state.calibrating = true;
  await sleep(2200);
  state.calibrating = false;
  btn.classList.remove('live');

  const peak = state.calMax;
  if (peak < 0.02) {
    status.textContent = 'Nic nie złapałem (' + peak.toFixed(3) + '). Głośniej!';
    return;
  }
  const thr = Math.min(0.9, Math.max(0.02, peak * 0.55));
  thresholdKnob.set(thr);
  saveSettings({ threshold: thr });
  $('valThreshold').textContent = thr.toFixed(2);
  status.classList.add('ok');
  status.textContent = `Złapany szczyt ${peak.toFixed(2)} → próg ustawiony na ${thr.toFixed(2)}.`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------- zapis ustawień (debounce) ----------------
let saveTimer = null;
function saveSettings(partial) {
  state.settings = { ...state.settings, ...partial };
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => window.jeb.setSettings(partial), 200);
}

// ---------------- urządzenia ----------------
async function populateDevices(selected) {
  const sel = $('deviceSelect');
  const devices = (await navigator.mediaDevices.enumerateDevices())
    .filter((d) => d.kind === 'audioinput');
  sel.innerHTML = '';
  const def = document.createElement('option');
  def.value = ''; def.textContent = 'Domyślne wejście systemowe';
  sel.appendChild(def);
  devices.forEach((d, i) => {
    const o = document.createElement('option');
    o.value = d.deviceId;
    o.textContent = d.label || `Wejście ${i + 1}`;
    sel.appendChild(o);
  });
  sel.value = selected || '';
}

// ---------------- start ----------------
const detector = new Detector(handlePeak);

async function init() {
  state.settings = await window.jeb.getSettings();
  reflectArmed(state.settings.armed);

  // knoby
  const kThr = makeKnob($('knobThreshold'), {
    min: 0.01, max: 0.9, value: state.settings.threshold,
    onChange: (v) => { $('valThreshold').textContent = v.toFixed(2); saveSettings({ threshold: v }); },
  });
  $('valThreshold').textContent = state.settings.threshold.toFixed(2);

  const kCool = makeKnob($('knobCooldown'), {
    min: 50, max: 1500, value: state.settings.cooldownMs,
    onChange: (v) => { const ms = Math.round(v); $('valCooldown').textContent = ms + ' ms'; saveSettings({ cooldownMs: ms }); },
  });
  $('valCooldown').textContent = state.settings.cooldownMs + ' ms';

  $('keyName').textContent = (state.settings.keyToSend || 'enter').toUpperCase();
  $('startMin').checked = !!state.settings.startMinimized;
  $('startMin').addEventListener('change', (e) => saveSettings({ startMinimized: e.target.checked }));

  // ARM
  $('armSwitch').addEventListener('click', async () => {
    const next = await window.jeb.setArmed(!state.armed);
    reflectArmed(next);
  });
  window.jeb.onArmedChanged(reflectArmed);

  // kalibracja
  $('btnCalibrate').addEventListener('click', () => calibrate(kThr));

  // okno
  $('btnMin').addEventListener('click', () => window.jeb.windowMinimize());
  $('btnHide').addEventListener('click', () => window.jeb.windowHide());
  $('btnQuit').addEventListener('click', () => window.jeb.quit());

  // potwierdzenie wysłania z maina (mignięcie LED-a)
  window.jeb.onHitFired(() => {
    $('led').animate(
      [{ boxShadow: '0 0 10px #00e8ff, 0 0 22px #00e8ff' },
       { boxShadow: '0 0 18px #ff2bd6, 0 0 40px #ff2bd6' },
       { boxShadow: '0 0 10px #00e8ff, 0 0 22px #00e8ff' }],
      { duration: 260 }
    );
  });

  // audio
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

  // odblokuj audio na pierwszy gest, gdyby kontekst był wstrzymany
  document.addEventListener('pointerdown', () => {
    if (detector.ctx && detector.ctx.state === 'suspended') detector.ctx.resume();
  }, { once: true });

  drawScope();
}

init();
