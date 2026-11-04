'use strict';
/*
 * JebToSendIt — zasoby tłumaczeń / translation resources.
 *
 * Co to znaczy JEB? "Jeb" to po polsku porządne walnięcie / przyłożenie.
 * JEBNIJ w laptopa → poleci ENTER. W angielskim też się posługujemy słowem JEB.
 *
 * UMD-style data: działa i jako `require(...)` w procesie głównym,
 * i jako <script> ustawiający window.JEB_I18N_RESOURCES w rendererze.
 */
(function (root, factory) {
  const resources = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = resources;
  } else {
    root.JEB_I18N_RESOURCES = resources;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  return {
    en: {
      translation: {
        action: {
          commandShort: 'Command', scriptShort: 'Script',
          commandLabel: 'SHELL COMMAND', scriptLabel: 'ABSOLUTE SCRIPT PATH', browse: 'Choose…',
          commandHelp: 'PowerShell on Windows, zsh on macOS.',
          scriptHelp: 'JS, Python, PowerShell, sh, zsh — the interpreter must be installed.',
          limits: 'One action at a time; 30 s limit.',
          error: 'Action error: {{message}}',
        },
        actions: {
          sub: 'Define them here — pick one quickly in the main window, under “JEB does”.',
          new: '+ New action', newName: 'New action', untitled: 'Untitled', empty: '(empty)',
          keyName: 'Key', keyLabel: 'KEY TO SEND', keyHelp: "The built-in action can't be deleted — you can only change its key.",
          name: 'NAME', type: 'TYPE', test: 'Test', testing: 'Running…', testOk: 'Done ✓', delete: 'Delete', active: 'active',
          badge: { key: 'Key', command: 'Command', script: 'Script' },
        },
        keys: { enter: 'ENTER', space: 'SPACE', tab: 'TAB', esc: 'ESC', escape: 'ESC', up: '↑', down: '↓', left: '←', right: '→' },
        pick: {
          title: 'JEB DOES', manage: 'Manage actions', keyHint: 'sends the {{key}} key',
          tune: 'Detection settings', readout: 'THR {{thr}} · MATCH {{match}}% · CD {{cd}} ms',
        },
        last: {
          title: 'LAST JEB', none: 'nothing yet — JEB your laptop',
          secondsAgo_one: '{{count}} s ago', secondsAgo_other: '{{count}} s ago',
          minutesAgo_one: '{{count}} min ago', minutesAgo_other: '{{count}} min ago',
        },
        records: {
          title: 'New JEB record!', today: 'TODAY: {{count}}',
          summary: 'Today: {{today}} · Best day: {{record}}', toggle: 'Notify about a new daily record',
          message: 'New record! {{count}} JEBs today!',
          sub: "Today's JEB count and your best day.", todayLabel: 'TODAY', recordLabel: 'BEST DAY',
        },
        settings: { title: 'SETTINGS', titleCase: 'Settings', sections: 'Settings sections' },
        tabs: {
          detect: 'Detection', detectSub: 'threshold, match, mic',
          calib: 'Calibration', calibSub: 'your JEB profile',
          actions: 'Actions', actionsSub: 'key + custom actions',
          stats: 'Stats', statsSub: 'today and record',
          app: 'App', appSub: 'language, startup',
        },
        detect: { sub: 'When a sound counts as a JEB. Drag a knob up / down, scroll or use the arrow keys.' },
        app: { sub: 'Language and startup behaviour.', language: 'LANGUAGE', langSystem: 'System' },
        win: { minimize: 'Minimize', hideToTray: 'Hide to tray', close: 'Close', settings: 'Settings' },
        status: {
          armed: 'ARMED', asleep: 'ASLEEP', toggle: 'Arm / disarm',
          armedSub: 'JEB your laptop → {{action}}', asleepSub: 'JEBs are ignored',
        },
        perm: {
          accessibility: 'macOS is blocking key presses. Turn on JebToSendIt in Privacy & Security → Accessibility.',
          automation: 'macOS won\'t let JebToSendIt control System Events. Turn it on in Privacy & Security → Automation → JebToSendIt → System Events.',
          hint: 'After enabling it, come back here — you may need to restart the app.',
          open: 'Open System Settings', recheck: 'Check again',
        },
        badge: { jeb: 'JEB!', nope: '???' },
        knob: {
          threshold: 'THRESHOLD', match: 'MATCH', cooldown: 'COOLDOWN',
          thresholdHelp: 'lower = more sensitive', matchHelp: 'how close to your profile', cooldownHelp: 'pause after a JEB',
        },
        profile: {
          title: 'JEB PROFILE',
          none: 'no profile — calibrate your JEB',
          meta: 'profile from {{n}} JEBs · ~{{ms}} ms · centroid {{hz}} Hz',
        },
        verdict: {
          dash: '—',
          jeb: 'JEB ✓',
          jebPct: 'JEB ✓ {{pct}}%',
          rejected: 'REJECTED ✕ {{pct}}%',
        },
        reason: { amplitude: 'amplitude', tooLong: 'too long', otherSound: 'different sound' },
        calib: {
          button: 'CALIBRATE — JEB 2-3 TIMES',
          hint: "I'll record the sound and length of your JEB — a shout won't trigger the action.",
          prepare: 'Get ready: {{t}}',
          go: '⚡ JEB 2-3 TIMES! ⚡',
          nothing: 'Caught nothing. JEB harder / check your mic.',
          done_one: "Caught {{count}} JEB → threshold {{threshold}}, length ~{{ms}} ms. A shout won't trigger the action anymore.",
          done_other: "Caught {{count}} JEBs → threshold {{threshold}}, length ~{{ms}} ms. A shout won't trigger the action anymore.",
        },
        device: { title: 'AUDIO INPUT', systemDefault: 'System default input', input: 'Input {{n}}', level: 'Level' },
        footer: { startMin: 'Start minimized to the tray' },
        scope: { threshold: 'THRESHOLD {{val}}' },
        mic: { denied: 'Microphone access denied: {{err}}' },
        tray: {
          armedItem: '● ARMED',
          asleepItem: '○ asleep',
          disarm: 'Disarm',
          arm: 'Arm',
          show: 'Show window',
          settings: 'Settings…',
          quit: 'Quit JebToSendIt',
          tooltip: 'JebToSendIt — {{state}}',
          stateArmed: 'ARMED',
          stateAsleep: 'asleep',
        },
      },
    },
    pl: {
      translation: {
        action: {
          commandShort: 'Polecenie', scriptShort: 'Skrypt',
          commandLabel: 'POLECENIE POWŁOKI', scriptLabel: 'PEŁNA ŚCIEŻKA SKRYPTU', browse: 'Wybierz…',
          commandHelp: 'PowerShell na Windows, zsh na macOS.',
          scriptHelp: 'JS, Python, PowerShell, sh, zsh — interpreter musi być zainstalowany.',
          limits: 'Jedna akcja naraz; limit 30 s.',
          error: 'Błąd akcji: {{message}}',
        },
        actions: {
          sub: 'Zdefiniuj je tutaj — wybierasz szybko w oknie głównym, w „JEB robi”.',
          new: '+ Nowa akcja', newName: 'Nowa akcja', untitled: 'Bez nazwy', empty: '(pusto)',
          keyName: 'Klawisz', keyLabel: 'WYSYŁANY KLAWISZ', keyHelp: 'Wbudowanej akcji nie da się usunąć — możesz tylko zmienić klawisz.',
          name: 'NAZWA', type: 'TYP', test: 'Przetestuj', testing: 'Odpalam…', testOk: 'Poszło ✓', delete: 'Usuń', active: 'aktywna',
          badge: { key: 'Klawisz', command: 'Polecenie', script: 'Skrypt' },
        },
        keys: { enter: 'ENTER', space: 'SPACJA', tab: 'TAB', esc: 'ESC', escape: 'ESC', up: '↑', down: '↓', left: '←', right: '→' },
        pick: {
          title: 'JEB ROBI', manage: 'Zarządzaj akcjami', keyHint: 'wysyła klawisz {{key}}',
          tune: 'Ustawienia detekcji', readout: 'PRÓG {{thr}} · DOPAS. {{match}}% · CD {{cd}} ms',
        },
        last: {
          title: 'OSTATNI JEB', none: 'jeszcze nic — jebnij w laptopa',
          secondsAgo_one: '{{count}} s temu', secondsAgo_few: '{{count}} s temu', secondsAgo_many: '{{count}} s temu', secondsAgo_other: '{{count}} s temu',
          minutesAgo_one: '{{count}} min temu', minutesAgo_few: '{{count}} min temu', minutesAgo_many: '{{count}} min temu', minutesAgo_other: '{{count}} min temu',
        },
        records: {
          title: 'Nowy rekord jebnięć!', today: 'DZISIAJ: {{count}}',
          summary: 'Dzisiaj: {{today}} · Rekord dnia: {{record}}', toggle: 'Powiadamiaj o nowym rekordzie dnia',
          message: 'Nowy rekord! Dzisiaj już {{count}} jebnięć!',
          sub: 'Licznik jebnięć z dziś i najlepszy dzień.', todayLabel: 'DZISIAJ', recordLabel: 'REKORD DNIA',
        },
        settings: { title: 'USTAWIENIA', titleCase: 'Ustawienia', sections: 'Sekcje ustawień' },
        tabs: {
          detect: 'Detekcja', detectSub: 'próg, dopasowanie, mikrofon',
          calib: 'Kalibracja', calibSub: 'profil twojego JEBa',
          actions: 'Akcje', actionsSub: 'klawisz + własne akcje',
          stats: 'Statystyki', statsSub: 'dzisiaj i rekord',
          app: 'Aplikacja', appSub: 'język, start',
        },
        detect: { sub: 'Kiedy dźwięk liczy się jako JEB. Przeciągnij gałkę w górę / w dół, kręć kółkiem albo strzałkami.' },
        app: { sub: 'Język i zachowanie przy starcie.', language: 'JĘZYK', langSystem: 'Systemowy' },
        win: { minimize: 'Minimalizuj', hideToTray: 'Schowaj do zasobnika', close: 'Zamknij', settings: 'Ustawienia' },
        status: {
          armed: 'UZBROJONY', asleep: 'UŚPIONY', toggle: 'Uzbrój / rozbrój',
          armedSub: 'Jebnij w laptopa → {{action}}', asleepSub: 'Jebnięcia są ignorowane',
        },
        perm: {
          accessibility: 'macOS blokuje wysyłanie klawiszy. Włącz JebToSendIt w Prywatność i ochrona → Dostępność.',
          automation: 'macOS nie pozwala JebToSendIt sterować System Events. Włącz to w Prywatność i ochrona → Automatyzacja → JebToSendIt → System Events.',
          hint: 'Po włączeniu wróć tutaj — może być potrzebny restart apki.',
          open: 'Otwórz Ustawienia systemowe', recheck: 'Sprawdź ponownie',
        },
        badge: { jeb: 'JEB!', nope: '???' },
        knob: {
          threshold: 'PRÓG', match: 'DOPASOWANIE', cooldown: 'COOLDOWN',
          thresholdHelp: 'niżej = czulszy', matchHelp: 'jak podobny do profilu', cooldownHelp: 'przerwa po jebnięciu',
        },
        profile: {
          title: 'PROFIL JEBNIĘCIA',
          none: 'brak profilu — skalibruj jebnięcie',
          meta: 'profil z {{n}} jebnięć · ~{{ms}} ms · centroid {{hz}} Hz',
        },
        verdict: {
          dash: '—',
          jeb: 'JEB ✓',
          jebPct: 'JEB ✓ {{pct}}%',
          rejected: 'ODRZUCONE ✕ {{pct}}%',
        },
        reason: { amplitude: 'amplituda', tooLong: 'za długie', otherSound: 'inne brzmienie' },
        calib: {
          button: 'KALIBRUJ — JEBNIJ 2-3 RAZY',
          hint: 'Nagram brzmienie i długość Twojego jebnięcia — krzyk nie uruchomi akcji.',
          prepare: 'Przygotuj się: {{t}}',
          go: '⚡ JEBNIJ 2-3 RAZY! ⚡',
          nothing: 'Nic nie złapałem. Jebnij mocniej / sprawdź mikrofon.',
          done_one: 'Złapałem {{count}} jebnięcie → próg {{threshold}}, długość ~{{ms}} ms. Krzyk już nie uruchomi akcji.',
          done_few: 'Złapałem {{count}} jebnięcia → próg {{threshold}}, długość ~{{ms}} ms. Krzyk już nie uruchomi akcji.',
          done_many: 'Złapałem {{count}} jebnięć → próg {{threshold}}, długość ~{{ms}} ms. Krzyk już nie uruchomi akcji.',
          done_other: 'Złapałem {{count}} jebnięć → próg {{threshold}}, długość ~{{ms}} ms. Krzyk już nie uruchomi akcji.',
        },
        device: { title: 'WEJŚCIE AUDIO', systemDefault: 'Domyślne wejście systemowe', input: 'Wejście {{n}}', level: 'Poziom' },
        footer: { startMin: 'Startuj zminimalizowany do zasobnika' },
        scope: { threshold: 'PRÓG {{val}}' },
        mic: { denied: 'Brak dostępu do mikrofonu: {{err}}' },
        tray: {
          armedItem: '● UZBROJONY',
          asleepItem: '○ uśpiony',
          disarm: 'Rozbrój',
          arm: 'Uzbrój',
          show: 'Pokaż okno',
          settings: 'Ustawienia…',
          quit: 'Zamknij JebToSendIt',
          tooltip: 'JebToSendIt — {{state}}',
          stateArmed: 'UZBROJONY',
          stateAsleep: 'uśpiony',
        },
      },
    },
  };
});
