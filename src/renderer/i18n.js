'use strict';
/* JebToSendIt — i18n (renderer). Cienka warstwa nad i18next. */

(function () {
  const resources = window.JEB_I18N_RESOURCES;
  const SUPPORTED = ['en', 'pl'];

  // język startowy: zapisany w ustawieniach albo wykryty z systemu (PL → pl, reszta → en)
  function resolveLanguage(saved) {
    if (saved && SUPPORTED.includes(saved)) return saved;
    const sys = (navigator.language || 'en').toLowerCase();
    return sys.startsWith('pl') ? 'pl' : 'en';
  }

  let ready = false;

  // tłumaczy element z atrybutami data-i18n / data-i18n-title
  function applyTo(el) {
    const key = el.getAttribute('data-i18n');
    if (key) el.textContent = i18next.t(key);
    const titleKey = el.getAttribute('data-i18n-title');
    if (titleKey) el.title = i18next.t(titleKey);
  }

  // przechodzi po całym DOM i podstawia teksty
  function applyTranslations(root) {
    (root || document).querySelectorAll('[data-i18n], [data-i18n-title]').forEach(applyTo);
    document.documentElement.lang = i18next.language;
  }

  const listeners = [];

  window.i18n = {
    SUPPORTED,
    async init(saved) {
      await i18next.init({
        lng: resolveLanguage(saved),
        fallbackLng: 'en',
        supportedLngs: SUPPORTED,
        resources,
        interpolation: { escapeValue: false }, // wstawiamy do textContent, nie do innerHTML
      });
      ready = true;
      applyTranslations();
      return i18next.language;
    },
    t: (key, opts) => (ready ? i18next.t(key, opts) : key),
    get language() {
      return i18next.language;
    },
    other() {
      return i18next.language === 'pl' ? 'en' : 'pl';
    },
    async change(lng) {
      await i18next.changeLanguage(lng);
      applyTranslations();
      listeners.forEach((fn) => fn(lng));
      return i18next.language;
    },
    onChange(fn) {
      listeners.push(fn);
    },
    apply: applyTranslations,
  };
})();
