#!/usr/bin/env node
'use strict';

/**
 * Check i18n coverage for RxPDF Cool.
 *
 *   node tools/check-i18n.js
 *
 * Fails (exit 1) when:
 *   - markup references a data-i18n key missing from js/i18n-data.js
 *   - JS calls t('...') with a key missing from the dictionary
 *   - a toast() call is passed a literal instead of t(...)
 *
 * English is the source language, so a missing key silently falls back to
 * English at runtime; this script makes that visible in review.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.dirname(__dirname);
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const data = read('js/i18n-data.js');
const I18N_ID = new Function(data + '; return I18N_ID;')();
const keys = new Set(Object.keys(I18N_ID));

const problems = [];
const jsFiles = ['core.js', 'split.js', 'merge.js', 'tools.js', 'editor.js', 'app.js'];

for (const file of jsFiles) {
  const src = read('js/' + file);

  const tRe = /\bt\(\s*'((?:[^'\\]|\\.)*)'/g;
  let m;
  while ((m = tRe.exec(src))) {
    const key = m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
    if (!keys.has(key)) problems.push(`js/${file}: t() key missing from i18n-data.js -> ${JSON.stringify(key)}`);
  }

  const toastRe = /toast\(\s*(['"`])([\s\S]*?)\1/g;
  while ((m = toastRe.exec(src))) {
    problems.push(`js/${file}: toast() literal is not wrapped in t() -> ${JSON.stringify(m[2].slice(0, 70))}`);
  }
}

const html = read('index.html');
const attrRe = /data-i18n(?:-placeholder|-title|-aria)?="([^"]*)"/g;
let m;
while ((m = attrRe.exec(html))) {
  const key = m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  if (!keys.has(key)) problems.push(`index.html: data-i18n key missing from i18n-data.js -> ${JSON.stringify(key)}`);
}

if (problems.length) {
  console.error('i18n check failed:\n');
  for (const problem of problems) console.error('  - ' + problem);
  console.error(`\n${problems.length} problem(s).`);
  process.exit(1);
}

console.log(`i18n check OK — ${keys.size} keys, ${jsFiles.length} JS modules, index.html clean.`);