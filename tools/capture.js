'use strict';
/* Pomocniczy zrzut UI do README — renderuje stronę i robi capturePage().
   Uruchom:  npx electron tools/capture.js   (artefakt: docs/screenshot.png)
   Nie wchodzi do builda aplikacji. */
const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const fs = require('fs');

const demo = {
  deviceId: null, threshold: 0.22, cooldownMs: 350, matchStrictness: 0.82,
  profile: { bands: [0.16, 0.4, 0.68, 0.88, 0.72, 0.52, 0.34, 0.2], flatness: 0.27, centroid: 3120, durationMs: 38, peak: 0.41, n: 3 },
  keyToSend: 'enter', armed: true, startMinimized: false,
};

ipcMain.handle('settings:get', () => demo);
ipcMain.handle('settings:set', (_e, p) => Object.assign(demo, p));
ipcMain.handle('state:setArmed', (_e, v) => { demo.armed = !!v; return demo.armed; });
ipcMain.on('hit:fire', () => {});
ipcMain.on('window:minimize', () => {});
ipcMain.on('window:hide', () => {});
ipcMain.on('app:quit', () => {});

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_w, _perm, cb) => cb(true));
  const win = new BrowserWindow({
    width: 440, height: 1010, show: true, frame: false, backgroundColor: '#06060d',
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
      backgroundThrottling: false,
    },
  });
  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await new Promise((r) => setTimeout(r, 2200));

  // 1) zatrzymaj pętle rAF renderera (żeby nie nadpisywały naszej klatki)
  await win.webContents.executeJavaScript('window.requestAnimationFrame = () => 0; "stopped";');
  await new Promise((r) => setTimeout(r, 120));

  // 2) jedna stabilna klatka: licznik + werdykt + ozdobny przebieg na scope
  const ok = await win.webContents.executeJavaScript(`
    (() => {
      document.getElementById('hitChip').textContent = 'JEBNIĘĆ: 7';
      const v = document.getElementById('verdict');
      v.className = 'verdict ok'; v.textContent = 'JEB ✓ 94%';
      const cs = document.getElementById('calStatus');
      cs.textContent = 'Złapałem 3 jebnięcia → próg 0.22, długość ~38 ms.';
      cs.classList.add('ok');
      const c = document.getElementById('scope'), x = c.getContext('2d');
      const W = c.width, H = c.height, n = 190, bw = W / n, thr = 0.22, thrY = H - Math.pow(thr,0.55)*H;
      x.clearRect(0,0,W,H);
      for (let i=0;i<n;i++){
        let val = Math.max(0, Math.sin(i*0.17)*0.06 + 0.1 + (i%41===0?0.62:0) + (i%47===0?0.5:0) + (i%29===0?0.22:0));
        const over = val>=thr, h = Math.pow(Math.min(1,val),0.55)*H;
        if(over){ x.fillStyle='rgba(255,43,214,0.95)'; x.shadowColor='#ff2bd6'; x.shadowBlur=12; }
        else{ const g=x.createLinearGradient(0,H,0,0); g.addColorStop(0,'rgba(0,232,255,0.25)'); g.addColorStop(1,'rgba(0,232,255,0.9)'); x.fillStyle=g; x.shadowBlur=0; }
        x.fillRect(i*bw+0.5, H-h, bw-1, h);
      }
      x.shadowBlur=0; x.strokeStyle='rgba(255,255,255,0.55)'; x.setLineDash([6,5]); x.lineWidth=1.5;
      x.beginPath(); x.moveTo(0,thrY); x.lineTo(W,thrY); x.stroke(); x.setLineDash([]);
      x.fillStyle='rgba(255,255,255,0.6)'; x.font='12px Consolas, monospace'; x.fillText('PRÓG 0.22', 8, thrY-6);
      return 'ok';
    })();
  `);
  console.log('inject:', ok);
  win.webContents.invalidate();
  await new Promise((r) => setTimeout(r, 500));

  const img = await win.webContents.capturePage();
  fs.mkdirSync(path.join(__dirname, '..', 'docs'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'screenshot.png'), img.toPNG());
  console.log('screenshot saved');
  app.exit(0);
});
