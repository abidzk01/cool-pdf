'use strict';

// Bilingual UI (English + Indonesian). English is the source: markup carries
// data-i18n="<english>" and JS calls t('<english>', vars). No storage is used;
// the language comes from ?lang= or navigator.language and is remembered only
// in the URL (history.replaceState), so the privacy guarantees still hold.

const I18N_META = {
  en: {
    title: 'RxPDF Cool — Split, Merge, Compress, Edit & Sign PDFs in Your Browser',
    description: 'RxPDF Cool is a free, 100% client-side PDF toolkit: split, merge, compress, convert to images, watermark, number, sign, edit, protect and unlock PDFs. No uploads, no servers, no sign-up — files up to 1.5 GB and 3,000 pages are processed entirely in your browser.',
    ogTitle: 'RxPDF Cool — The PDF toolkit built for speed',
    ogDescription: 'Nine PDF tools that run entirely in your browser. Split, merge, compress, convert, watermark, number, sign, edit, protect and unlock. Zero uploads, zero servers, zero limits.',
  },
  id: {
    title: 'RxPDF Cool — Pisah, Gabung, Kompres, Edit & Tanda Tangan PDF di Browser',
    description: 'RxPDF Cool adalah toolkit PDF gratis yang 100% berjalan di browser: pisah, gabung, kompres, konversi ke gambar, watermark, nomor halaman, tanda tangan, edit, proteksi, dan buka kunci PDF. Tanpa upload, tanpa server, tanpa pendaftaran — file hingga 1,5 GB dan 3.000 halaman diproses sepenuhnya di browser Anda.',
    ogTitle: 'RxPDF Cool — Toolkit PDF yang dirancang untuk cepat',
    ogDescription: 'Sembilan alat PDF yang berjalan sepenuhnya di browser. Pisah, gabung, kompres, konversi, watermark, nomor halaman, tanda tangan, edit, proteksi, dan buka kunci. Tanpa upload, tanpa server, tanpa batas.',
  },
};

let I18N_LANG = 'en';

function i18nNormalize(lang) {
  return String(lang || '').toLowerCase().indexOf('id') === 0 ? 'id' : 'en';
}

// Translate an English source string (and interpolate {name} placeholders).
function t(source, vars) {
  let out = I18N_LANG === 'id' ? (I18N_ID[source] || source) : source;
  if (vars) {
    for (const key of Object.keys(vars)) {
      out = out.split('{' + key + '}').join(String(vars[key]));
    }
  }
  return out;
}

function currentLang() {
  return I18N_LANG;
}

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const value = t(el.getAttribute('data-i18n-title'));
    el.setAttribute('title', value);
    if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', value);
  });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => {
    el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
  });

  const meta = I18N_META[I18N_LANG];
  document.title = meta.title;
  const setMeta = (selector, value) => {
    const el = document.querySelector(selector);
    if (el) el.setAttribute('content', value);
  };
  setMeta('meta[name="description"]', meta.description);
  setMeta('meta[property="og:title"]', meta.ogTitle);
  setMeta('meta[property="og:description"]', meta.ogDescription);
  setMeta('meta[name="twitter:title"]', meta.ogTitle);
  setMeta('meta[name="twitter:description"]', meta.ogDescription);

  if (typeof refreshDynamicTranslations === 'function') refreshDynamicTranslations();
  updateLangButtons();
}

function updateLangButtons() {
  const en = document.getElementById('langEn');
  const id = document.getElementById('langId');
  if (en) {
    en.classList.toggle('active', I18N_LANG === 'en');
    en.setAttribute('aria-pressed', String(I18N_LANG === 'en'));
  }
  if (id) {
    id.classList.toggle('active', I18N_LANG === 'id');
    id.setAttribute('aria-pressed', String(I18N_LANG === 'id'));
  }
}

function setLang(lang, updateUrl) {
  I18N_LANG = i18nNormalize(lang);
  document.documentElement.lang = I18N_LANG;
  if (updateUrl !== false) {
    try {
      const url = new URL(location.href);
      url.searchParams.set('lang', I18N_LANG);
      history.replaceState(null, '', url);
    } catch (e) { /* file:// or blocked history */ }
  }
  applyI18n();
}

function initLang() {
  let lang = null;
  try { lang = new URLSearchParams(location.search).get('lang'); } catch (e) { /* ignore */ }
  if (!lang) lang = i18nNormalize(navigator.language || 'en');
  setLang(lang, false);
}