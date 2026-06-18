# ⚡ JebToSendIt

> 🌍 **Language / Język:** **English** · [Polski](README.pl.md)

**JEB your laptop — out comes ENTER.** Seriously, that's the whole app.

<p align="center">
  <img src="docs/screenshot.png" width="380" alt="JebToSendIt interface" />
</p>

> ### 🤛 Wait — what's a *JEB*?
> *Jeb* (say it "yeb") is Polish for a good, solid **whack** — a thump, a bang, a thwack.
> To *jeb* something is to give it a firm knock. So in this app you **JEB** your laptop —
> bang on the case — and it fires **ENTER** into whatever window is on top. We keep saying
> **JEB** all the way through (yes, even in English), because no English word lands quite
> the same punch.

JebToSendIt sits in the background, listens to your microphone, and the moment you whack the
chassis it sends **ENTER** to the foreground window. Plus a flashy, futuristic, neon interface
and a tray icon. Why? Because you can. 🤷

> The app speaks **English and Polish** — flip it with the **EN/PL** toggle in the top-right
> corner of the window (it starts in your system language).

<p align="center">
  <a href="https://github.com/doctorspider42/JebToSendIt/releases/latest">
    <b>⬇️ Download the latest version (.exe)</b>
  </a><br>
  download, click, JEB — nothing gets installed
</p>

---

## 🚀 Quick start

There's no installer — just **one `.exe` file**.

1. Grab `JebToSendIt-…-portable.exe` from **[Releases](https://github.com/doctorspider42/JebToSendIt/releases/latest)**
   (or build it yourself — see [below](#-build--one-exe-file)).
2. Run it. It installs nothing, it just works.
3. The first time, the app asks for microphone access — say yes, otherwise there's nothing to listen to.

Prefer the hands-on, dev way?

```powershell
npm install
npm start
```

---

## 🎯 How to use it

1. **Arm it** — click the **ARM** switch (or use the tray menu). The LED glows cyan = the app is listening.
2. **Calibrate your JEB** — click **CALIBRATE**, wait for the countdown, and **JEB your laptop
   2-3 times**. The app memorizes what your whack *sounds* like and *how long* it lasts.
   From then on, other noises (talking, music, a slammed door) won't fire ENTER.
3. **JEB = ENTER.** That's it. Whack the chassis → ENTER goes to the active window. The "JEB!"
   badge flashes to confirm; if the sound doesn't match your profile, you'll see "**???**".
4. Closing the window **tucks the app into the tray** (it doesn't quit). Click the icon to
   show / hide. To actually exit: tray menu → *Quit*.

### Knobs

Drag with the mouse (up / down) or scroll:

- **THRESHOLD** — sensitivity. Lower = easier to trigger (but also easier to trip by accident).
- **MATCH** — how closely a sound must match your JEB profile. Higher = pickier.
- **COOLDOWN** — the minimum gap between JEBs, so one whack doesn't register as five.

The **JEB PROFILE** panel shows the "fingerprint" of your whack and the verdict on the last
sound (`JEB ✓`, or `???` with a match percentage).

> Window too small for your screen? The content scrolls, and you can stretch the window itself.

---

## 🔨 Build → one .exe file

```powershell
.\build.ps1
```

Spits out `dist\JebToSendIt-0.2.0-portable.exe` — a single file, no installer.
(`npm run build` does the same thing.)

> The script handles the well-known electron-builder hiccup on Windows (the `winCodeSign`
> package with its macOS symlinks) on its own — you don't need developer mode or admin rights.

---

## 🧠 What it's made of (for the curious)

Electron + Web Audio for the microphone analysis, and ENTER goes out through PowerShell
`SendKeys` (no native modules, which keeps the build dead simple). Translations are handled
by [**i18next**](https://www.i18next.com/) — one shared resource set drives both the UI and the tray.

Under the hood, detection isn't just "loud = ENTER":

```
mic ─► AudioWorklet (peak every ~10 ms) ─► threshold ─► ~90 ms eval window
                                                              │
          spectrum shape (8 bands) + length  ◄────────────────┘
                          │
              matches the profile?  ──► yes ──► ENTER
```

- **AudioWorklet** computes the peak on raw samples — it catches even a very short whack.
- Once the threshold is crossed, a ~90 ms evaluation window opens, checking both the **sound**
  (energy across 8 logarithmic bands, compared to your profile) and the **length** (a JEB is a
  short transient; sounds that drag on get binned).
- ENTER fires **only** when the spectrum matches (above the *MATCH* slider) **and** the sound is short.
- **Keystroke delivery** ([src/main/keysender.js](src/main/keysender.js)): a long-lived PowerShell
  process loads `System.Windows.Forms` once and calls `SendKeys`. The layer is abstracted —
  macOS (`osascript`) and Linux (`xdotool`) are ready slots for a future port.

> The app is for Windows, but it's written so a port to macOS/Linux mostly comes down to
> adding one layer (the keystroke sender).

### Structure

```
src/
  main/
    main.js        main process: window, tray, IPC, tray i18n
    keysender.js   keystroke-sender layer (Windows: PowerShell SendKeys)
    settings.js    persistent settings (electron-store)
  preload.js       contextBridge bridge (safe API for the UI)
  renderer/
    index.html     the interface
    styles.css     neon, futuristic styling
    renderer.js    detection, knobs, scope, calibration, matching
    worklet.js     AudioWorklet — peak measurement
    i18n.js        i18next bootstrap in the renderer
    locales.js     translation resources (PL/EN) — shared by UI and tray
    vendor/        bundled i18next (UMD)
tools/gen-icon.js  icon generator (dependency-free PNG)
tools/capture.js   helper that captures the UI for the README
build.ps1          portable EXE build
```

### Requirements

- [Node.js](https://nodejs.org/) 18+ (tested on 22)
- Windows 10 / 11

---

## License

MIT
