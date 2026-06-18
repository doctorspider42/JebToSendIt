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
        win: { minimize: 'Minimize', hideToTray: 'Hide to tray', close: 'Close' },
        lang: { toggleTitle: 'Switch language (English ⇄ Polish)' },
        status: { armed: 'ARMED', asleep: 'ASLEEP' },
        hits: 'JEBS: {{count}}',
        badge: { jeb: 'JEB!', nope: '???' },
        knob: { threshold: 'THRESHOLD', match: 'MATCH', cooldown: 'COOLDOWN' },
        profile: {
          title: 'JEB PROFILE',
          sub: '(spectral fingerprint)',
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
          title: 'JEB CALIBRATION',
          button: '⦿ CALIBRATE — JEB 2-3 TIMES',
          hint: "I'll record the sound and length of your JEB — a shout won't fire ENTER.",
          prepare: 'Get ready: {{t}}',
          go: '⚡ JEB 2-3 TIMES! ⚡',
          nothing: 'Caught nothing. JEB harder / check your mic.',
          done_one: "Caught {{count}} JEB → threshold {{threshold}}, length ~{{ms}} ms. A shout won't fire ENTER anymore.",
          done_other: "Caught {{count}} JEBs → threshold {{threshold}}, length ~{{ms}} ms. A shout won't fire ENTER anymore.",
        },
        device: { title: 'AUDIO INPUT', systemDefault: 'System default input', input: 'Input {{n}}' },
        footer: { startMin: 'start minimized', hintPre: 'armed = a JEB fires' },
        scope: { threshold: 'THRESHOLD {{val}}' },
        mic: { denied: 'Microphone access denied: {{err}}' },
        tray: {
          armedItem: '● ARMED',
          asleepItem: '○ asleep',
          disarm: 'Disarm',
          arm: 'Arm',
          show: 'Show window',
          quit: 'Quit JebToSendIt',
          tooltip: 'JebToSendIt — {{state}}',
          stateArmed: 'ARMED',
          stateAsleep: 'asleep',
        },
      },
    },
    pl: {
      translation: {
        win: { minimize: 'Minimalizuj', hideToTray: 'Schowaj do tray', close: 'Zamknij' },
        lang: { toggleTitle: 'Zmień język (angielski ⇄ polski)' },
        status: { armed: 'UZBROJONY', asleep: 'UŚPIONY' },
        hits: 'JEBNIĘĆ: {{count}}',
        badge: { jeb: 'JEB!', nope: '???' },
        knob: { threshold: 'PRÓG', match: 'DOPASOWANIE', cooldown: 'COOLDOWN' },
        profile: {
          title: 'PROFIL JEBNIĘCIA',
          sub: '(odcisk widmowy)',
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
          title: 'KALIBRACJA JEBNIĘCIA',
          button: '⦿ KALIBRUJ — JEBNIJ 2-3 RAZY',
          hint: 'Nagram brzmienie i długość Twojego jebnięcia — krzyk nie puści ENTER.',
          prepare: 'Przygotuj się: {{t}}',
          go: '⚡ JEBNIJ 2-3 RAZY! ⚡',
          nothing: 'Nic nie złapałem. Jebnij mocniej / sprawdź mikrofon.',
          done_one: 'Złapałem {{count}} jebnięcie → próg {{threshold}}, długość ~{{ms}} ms. Krzyk już nie puści ENTER.',
          done_few: 'Złapałem {{count}} jebnięcia → próg {{threshold}}, długość ~{{ms}} ms. Krzyk już nie puści ENTER.',
          done_many: 'Złapałem {{count}} jebnięć → próg {{threshold}}, długość ~{{ms}} ms. Krzyk już nie puści ENTER.',
          done_other: 'Złapałem {{count}} jebnięć → próg {{threshold}}, długość ~{{ms}} ms. Krzyk już nie puści ENTER.',
        },
        device: { title: 'WEJŚCIE AUDIO', systemDefault: 'Domyślne wejście systemowe', input: 'Wejście {{n}}' },
        footer: { startMin: 'start zminimalizowany', hintPre: 'uzbrojony = JEB wysyła' },
        scope: { threshold: 'PRÓG {{val}}' },
        mic: { denied: 'Brak dostępu do mikrofonu: {{err}}' },
        tray: {
          armedItem: '● UZBROJONY',
          asleepItem: '○ uśpiony',
          disarm: 'Rozbrój',
          arm: 'Uzbrój',
          show: 'Pokaż okno',
          quit: 'Zamknij JebToSendIt',
          tooltip: 'JebToSendIt — {{state}}',
          stateArmed: 'UZBROJONY',
          stateAsleep: 'uśpiony',
        },
      },
    },
  };
});
