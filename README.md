# ⚡ JebToSendIt

Jebnij w laptopa — poleci **ENTER**.

Aplikacja nasłuchuje mikrofonu, wykrywa uderzenie (transjent/peak) i wysyła
naciśnięcie klawisza **ENTER** do aktualnie aktywnego okna. Do tego futurystyczne
UI w stylu wtyczki VST, kalibracja jebnięcia i ikonka w tray-u.

> Działa na **Windows**. Kod jest tak ułożony, żeby port na macOS/Linux sprowadzał
> się głównie do dopisania jednej warstwy (wysyłanie klawisza).

## Jak to działa

```
mikrofon ─► Web Audio (AudioWorklet) ─► peak co ~10 ms ─► próg + cooldown
                                                                │
   UI (renderer)  ◄── IPC ──►  proces główny (Electron)  ──────┘
                                       │
                                       └─► PowerShell SendKeys ─► {ENTER}
```

- **Detekcja**: `AudioWorklet` liczy szczytową amplitudę na surowych próbkach, więc
  łapie nawet bardzo krótkie uderzenie. Po przekroczeniu **progu** uruchamia się okno
  oceny (~90 ms), w którym sprawdzany jest nie tylko poziom, ale i **charakter dźwięku**:
  - **odcisk widmowy** — energia w 8 logarytmicznych pasmach; podobieństwo (cosinus)
    do skalibrowanego profilu jebnięcia. Inne dźwięki mają inny rozkład energii w widmie
    niż Twój puk, więc nie pasują do profilu.
  - **długość** — jebnięcie to krótki transjent; dźwięki, które ciągną się dłużej,
    są odrzucane.

  ENTER leci tylko gdy **kształt widma pasuje** (powyżej suwaka *DOPASOWANIE*) **i**
  dźwięk jest **krótki**. Do tego **cooldown** chroni przed serią. Dźwięki inne niż
  skalibrowane jebnięcie nie wyzwolą ENTER.
- **Wysyłanie klawisza** ([src/main/keysender.js](src/main/keysender.js)): trwały
  proces PowerShell ładuje raz `System.Windows.Forms` i woła `SendKeys` — niska
  latencja, **zero modułów natywnych**, więc build jest banalny. Warstwa jest
  abstrakcyjna — macOS (`osascript`) i Linux (`xdotool`) to miejsce na przyszły port.

## Wymagania

- [Node.js](https://nodejs.org/) 18+ (testowane na 22)
- Windows 10/11

## Uruchomienie w trybie dev

```powershell
npm install
npm start
```

## Build → portable EXE (bez instalatora)

```powershell
.\build.ps1
```

Wynik: pojedynczy plik `dist\JebToSendIt-0.1.0-portable.exe`. Odpalasz i działa,
nic nie instaluje.

(alternatywnie: `npm run build`)

## Obsługa

- **ARM** — uzbraja/usypia detektor (też z menu w tray).
- **PRÓG** — czułość; niżej = łatwiej wyzwolić. Pokrętło kręcisz myszą (góra/dół) lub scrollem.
- **DOPASOWANIE** — rygor zgodności widma z profilem (wyżej = bardziej wybredne, mniej fałszywych wyzwoleń).
- **COOLDOWN** — minimalna przerwa między wyzwoleniami.
- **KALIBRUJ** — odliczanie, potem jebnij **2-3 razy** w laptopa; aplikacja uśredni głośność,
  brzmienie (widmo) i długość Twojego jebnięcia i zapisze profil. Bez profilu działa sam próg amplitudy.
- **PROFIL JEBNIĘCIA** — podgląd odcisku widmowego + werdykt ostatniego zdarzenia (JEB ✓ / ??? z %).
- **WEJŚCIE AUDIO** — wybór mikrofonu.
- Zamknięcie okna chowa apkę do **tray** (klik w ikonę = pokaż/schowaj). Wyjście: menu tray → *Zamknij*.

## Struktura

```
src/
  main/
    main.js        proces główny: okno, tray, IPC
    keysender.js   warstwa wysyłania klawisza (Windows: PowerShell SendKeys)
    settings.js    trwałe ustawienia (electron-store)
  preload.js       most contextBridge (bezpieczne API dla renderera)
  renderer/
    index.html     UI
    styles.css      neonowy styl VST
    renderer.js    detekcja, knoby, scope, kalibracja
    worklet.js     AudioWorklet — pomiar peaku
tools/gen-icon.js  generator ikony (PNG bez zależności)
build.ps1          build portable EXE
```

## Licencja

MIT
