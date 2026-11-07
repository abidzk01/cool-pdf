#!/usr/bin/env node
'use strict';

/**
 * Content-hash asset links, PWA precache, and version stamping.
 *
 *   node tools/stamp-assets.js          rewrite index.html, sw.js, core.js, manifest
 *   node tools/stamp-assets.js --check  fail if anything is stale
 *
 * index.html links CSS/JS as `...?v=<sha256-8>` so a deploy can never serve a
 * stale stylesheet. sw.js gets the matching precache list plus a cache name
 * derived from VERSION and every precached file's content, so a release (or any
 * asset change) rolls the cache automatically.
 *
 * VERSION is the single source of truth: it is stamped into js/core.js
 * (APP_VERSION, shown in the footer) and manifest.webmanifest ("version").
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.dirname(__dirname);
const INDEX = path.join(ROOT, 'index.html');
const SW = path.join(ROOT, 'sw.js');
const CORE = path.join(ROOT, 'js', 'core.js');
const MANIFEST = path.join(ROOT, 'manifest.webmanifest');
const VERSION = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
const check = process.argv.includes('--check');

const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const sha = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const short = buffer => sha(buffer).slice(0, 8);

// ── 1. Stamp VERSION into core.js and the manifest (in memory) ──────────
const coreDisk = read('js/core.js');
const manifestDisk = read('manifest.webmanifest');
const coreFinal = coreDisk.replace(/const APP_VERSION = '[^']*';/, `const APP_VERSION = '${VERSION}';`);
const manifestFinal = manifestDisk.replace(/"version": "[^"]*"/, `"version": "${VERSION}"`);

// Final content for the files we may rewrite, disk content for the rest.
const contentFor = file => {
  if (file === 'index.html') return htmlFinal;
  if (file === 'js/core.js') return coreFinal;
  if (file === 'manifest.webmanifest') return manifestFinal;
  return fs.readFileSync(path.join(ROOT, file));
};

// ── 2. Stamp CSS/JS links in index.html ────────────────────────────────
let htmlFinal = read('index.html');
const staleLinks = [];
let stamped = 0;

htmlFinal = htmlFinal.replace(
  /(href|src)="((?:assets\/css|js)\/[^"?]+\.(?:css|js))(?:\?v=[a-f0-9]+)?"/g,
  (match, attr, file) => {
    const version = short(contentFor(file));
    if (!match.includes('?v=' + version)) staleLinks.push(file);
    stamped++;
    return `${attr}="${file}?v=${version}"`;
  }
);

// ── 3. Precache list and cache fingerprint ─────────────────────────────
const FIXED = [
  './',
  './index.html',
  './manifest.webmanifest',
  './vendor/pdfjs/pdf.worker.min.js',
  './vendor/inter/InterVariable.woff2',
  './assets/favicon.ico',
  './assets/favicon-32x32.png',
  './assets/icon-rxpdf-cool.png',
  './assets/pwa/icon-192.png',
  './assets/pwa/icon-512.png',
  './assets/pwa/maskable-512.png',
  './assets/pwa/apple-touch-icon.png',
];
const linked = [];
const linkRe = /(?:href|src)="((?:assets\/|js\/|vendor\/)[^"]+?)(?:\?v=([a-f0-9]+))?"/g;
let match;
while ((match = linkRe.exec(htmlFinal))) {
  if (!/\.(css|js)$/.test(match[1])) continue;
  linked.push('./' + match[1] + (match[2] ? '?v=' + match[2] : ''));
}
const precache = [];
for (const entry of FIXED.concat(linked)) {
  if (!precache.includes(entry)) precache.push(entry);
}

const fingerprint = crypto.createHash('sha256').update(VERSION);
for (const entry of precache) {
  const file = entry.split('?')[0].replace(/^\.\//, '');
  if (!file || file === '.') continue;
  if (!fs.existsSync(path.join(ROOT, file))) {
    console.warn('missing precache file: ' + file);
    continue;
  }
  fingerprint.update(file).update(sha(contentFor(file)));
}
const cacheVersion = VERSION + '-' + fingerprint.digest('hex').slice(0, 10);

// ── 4. Expected sw.js ──────────────────────────────────────────────────
const swDisk = read('sw.js');
let swFinal = swDisk;
swFinal = swFinal.replace(/const CACHE_VERSION = '[^']*';/, `const CACHE_VERSION = '${cacheVersion}';`);
swFinal = swFinal.replace(
  /\/\* PRECACHE:START \*\/[\s\S]*?\/\* PRECACHE:END \*\//,
  '/* PRECACHE:START */\n' + precache.map(entry => `  '${entry}',`).join('\n') + '\n  /* PRECACHE:END */'
);

// ── 5. Compare or write ────────────────────────────────────────────────
const files = [
  ['index.html', htmlFinal],
  ['js/core.js', coreFinal],
  ['manifest.webmanifest', manifestFinal],
  ['sw.js', swFinal],
];
const changed = files.filter(([file, content]) => content !== read(file)).map(([file]) => file);

if (check) {
  if (staleLinks.length) {
    console.error('Stale asset links (run `node tools/stamp-assets.js`):');
    for (const file of staleLinks) console.error('  - ' + file);
  }
  if (changed.length) console.error('Stale generated files: ' + changed.join(', ') + ' — run `node tools/stamp-assets.js`.');
  if (staleLinks.length || changed.length) process.exit(1);
  console.log(`OK — ${stamped} links, ${precache.length} precache entries, cache ${cacheVersion}, v${VERSION}.`);
} else {
  for (const [file, content] of files) fs.writeFileSync(path.join(ROOT, file), content);
  console.log(`Stamped ${stamped} links; ${precache.length} precache entries; v${VERSION}; cache ${cacheVersion}.`);
  if (changed.length) console.log('Updated: ' + changed.join(', '));
}