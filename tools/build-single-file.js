#!/usr/bin/env node
/**
 * CutFree single-file build (Node.js version).
 * Inlines every local stylesheet, script, and image reference into standalone HTML files.
 *
 *   index.html   -> cutfree.html        (video cutter / editor)
 *   studio.html  -> cutfree-studio.html (auto video engine)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, '..');

const PAGES = [
  ['index.html', 'cutfree.html'],
  ['studio.html', 'cutfree-studio.html']
];

const LINK_RE = /<link[^>]*href="([^"]+\.css)"[^>]*>/gi;
const SCRIPT_RE = /<script([^>]*?)\s+src="([^"]+)"([^>]*)><\/script>/gi;
const IMG_RE = /(src|href)="(assets\/[^"]+\.svg)"/g;

function readText(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function dataUri(rel) {
  const filePath = path.join(ROOT, rel);
  const raw = fs.readFileSync(filePath);
  const ext = path.extname(rel).replace('.', '').toLowerCase();
  const mimes = { svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
  const mime = mimes[ext] || 'application/octet-stream';
  return `data:${mime};base64,${raw.toString('base64')}`;
}

function inlinePage(srcName, outName) {
  let html = readText(srcName);

  // 1) Stylesheets
  html = html.replace(LINK_RE, (match, href) => {
    return `<style>\n${readText(href).trim()}\n</style>`;
  });

  // 2) Scripts preserving data-module hooks
  html = html.replace(SCRIPT_RE, (match, attrs1, src, attrs2) => {
    if (src.startsWith('http')) return match;
    let attrs = ((attrs1 || '') + (attrs2 || '')).trim();
    const code = readText(src).trim();
    return attrs ? `<script ${attrs}>\n${code}\n</script>` : `<script>\n${code}\n</script>`;
  });

  // 3) Local assets / svg
  html = html.replace(IMG_RE, (match, attr, imgPath) => {
    return `${attr}="${dataUri(imgPath)}"`;
  });

  // 4) External repo links
  html = html.replace('href="README.md"', 'href="https://github.com/Khairul990/cutfree"')
             .replace('href="tests/e2e.js"', 'href="#"');

  const outPath = path.join(ROOT, outName);
  fs.writeFileSync(outPath, html, 'utf8');
  const sizeKb = (fs.statSync(outPath).size / 1024).toFixed(1);
  console.log(`  built ${outName.padEnd(24)} ${sizeKb.padStart(7)} KB · standalone ready`);
}

function main() {
  console.log('CutFree single-file build (Node.js)');
  for (const [src, out] of PAGES) {
    if (!fs.existsSync(path.join(ROOT, src))) {
      console.log(`  skipped ${src} (missing)`);
      continue;
    }
    inlinePage(src, out);
  }
}

main();
