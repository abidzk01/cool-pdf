'use strict';

// PWA: install prompt, service worker, offline badge.
//
// The app is fully client-side, so once the shell is cached every tool keeps
// working without a network. Nothing here caches user files.

const PWA = {
  deferred: null,
  offlineReady: false,
  reloadOnControllerChange: false,
};

function showInstallButton(show) {
  const button = document.getElementById('pwa-install');
  if (button) button.style.display = show ? '' : 'none';
}

function updatePwaStatus() {
  const el = document.getElementById('pwa-status');
  if (!el) return;
  if (!navigator.onLine) {
    el.hidden = false;
    el.dataset.state = 'offline';
    el.textContent = t('Offline — every tool still works');
    return;
  }
  if (PWA.offlineReady) {
    el.hidden = false;
    el.dataset.state = 'ready';
    el.textContent = t('Offline-ready');
    return;
  }
  el.hidden = true;
}

function refreshPwaLabels() {
  updatePwaStatus();
}

function promptPwaInstall() {
  if (!PWA.deferred) {
    toast(t('Use your browser menu → "Install app" (or "Add to Home Screen" on iOS).'), 'i', 7000);
    return;
  }
  const event = PWA.deferred;
  PWA.deferred = null;
  event.prompt();
  Promise.resolve(event.userChoice).then(choice => {
    showInstallButton(false);
    if (choice && choice.outcome === 'accepted') {
      toast(t('RxPDF Cool installed — open it from your app menu.'), 's', 5000);
    }
  }).catch(() => {});
}

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  PWA.deferred = event;
  showInstallButton(true);
});

window.addEventListener('appinstalled', () => {
  PWA.deferred = null;
  showInstallButton(false);
  toast(t('RxPDF Cool installed — open it from your app menu.'), 's', 5000);
});

window.addEventListener('online', updatePwaStatus);
window.addEventListener('offline', updatePwaStatus);

// A new worker waits until it is safe: reload only when the page is idle and an
// older worker was already in control. Otherwise the update applies on the next
// visit, so an in-progress edit is never interrupted.
if (
  'serviceWorker' in navigator &&
  (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')
) {
  const hadController = !!navigator.serviceWorker.controller;
  const appIsIdle = () =>
    !S.busy && !S.splitFile && !S.mergeFiles.length && !S.edit && !S.compressFile && !S.signPad;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (PWA.reloadOnControllerChange) {
      location.reload();
      return;
    }
    PWA.offlineReady = true;
    updatePwaStatus();
  });

  const checkWaiting = reg => {
    if (!reg || !reg.waiting) return;
    PWA.offlineReady = true;
    updatePwaStatus();
    if (hadController && appIsIdle()) {
      PWA.reloadOnControllerChange = true;
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    } else {
      toast(t('A new version is ready — it will load on your next visit.'), 'i', 6000);
    }
  };

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js', { scope: './' })
      .then(reg => {
        PWA.offlineReady = !!navigator.serviceWorker.controller;
        updatePwaStatus();
        checkWaiting(reg);
        reg.addEventListener('updatefound', () => {
          const worker = reg.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed') checkWaiting(reg);
          });
        });
      })
      .catch(() => { /* registration is optional; the app still works online */ });
  });
}

setTimeout(updatePwaStatus, 0);