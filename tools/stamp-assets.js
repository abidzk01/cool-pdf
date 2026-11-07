#!/usr/bin/env node
'use strict';

/**
 * Add content-hash cache busters to the first-party CSS/JS links in index.html.
 *
 *   node tools/stamp-assets.js          rewrite index.html
 *   node tools/stamp-assets.js --check  fail if any link is missing/stale
 *
 * Why: VPS/CDN caches happily keep serving yesterday's app.css or app.js after
 * a deploy. Each link becomes `...?v=<sha256-8>`, so a content change produces
 * a new URL and old caches are bypassed. Combined with the immutable caching
 * rules in deploy/ and netlify.toml, index.html is the only file that needs
 * revalidation.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.dirname(__dirname);
const INDEX = path.join(ROOT, 'index.html');
const check = process.argv.includes('--check');

const hashOf = file => {
  const bytes = fs.readFileSync(path.join(ROOT, file));
  return crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 8);
};

let html = fs.readFileSync(INDEX, 'utf8');
const stale = [];
let stamped = 0;

html = html.replace(
  /(href|src)="((?:assets\/css|js)\/[^"?]+\.(?:css|js))(?:\?v=[a-f0-9]+)?"/g,
  (match, attr, file) => {
    const version = hashOf(file);
    if (!match.includes('?v=' + version)) stale.push(file);
    stamped++;
    return `${attr}="${file}?v=${version}"`;
  }
);

if (check) {
  if (stale.length) {
    console.error('Stale asset links (run `node tools/stamp-assets.js`):\n');
    for (const file of stale) console.error('  - ' + file);
    process.exit(1);
  }
  console.log(`Asset links OK — ${stamped} stamped URLs.`);
} else {
  fs.writeFileSync(INDEX, html);
  console.log(`Stamped ${stamped} asset links${stale.length ? ' (updated: ' + stale.join(', ') + ')' : ''}.`);
}