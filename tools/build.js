#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

console.log('⚡ Starting CutFree Studio canonical production build...');

// 1. Build canonical React Production Studio with Vite
console.log('📦 Compiling React Studio application with Vite...');
try {
  execSync('npx vite build', {
    stdio: 'inherit',
    cwd: ROOT,
  });
  console.log('✅ React Production Studio compiled successfully into dist/');
} catch (err) {
  console.error('❌ Failed to compile React Studio:', err.message);
  process.exit(1);
}

const distDir = path.join(ROOT, 'dist');
fs.mkdirSync(distDir, { recursive: true });

function copyRecursive(src, dst) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    fs.readdirSync(src).forEach(file => {
      copyRecursive(path.join(src, file), path.join(dst, file));
    });
  } else {
    fs.copyFileSync(src, dst);
  }
}

// 2. Copy static and compatibility resources (without overwriting canonical React entries)
const staticItems = [
  'manifest.webmanifest',
  'robots.txt',
  'sw.js',
  'cutfree-studio.html',
  'cutfree-studio-pro.html',
  'studio-pro.html',
  'cutfree.html',
  'editor.html',
  'studio.html',
];

staticItems.forEach(item => {
  const src = path.join(ROOT, item);
  const dst = path.join(distDir, item);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dst);
  }
});
console.log('✅ Static & compatibility assets verified in dist/');

// 3. Bundle backend server.ts with esbuild
console.log('🚀 Bundling server.ts...');
try {
  execSync('npx esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs', {
    stdio: 'inherit',
    cwd: ROOT
  });
  console.log('✅ server.ts bundled to dist/server.cjs');
} catch (err) {
  console.error('Failed to bundle server.ts:', err.message);
  process.exit(1);
}

// 4. Verify that canonical React entry points exist in dist/
const indexEntry = path.join(distDir, 'index.html');
const appEntry = path.join(distDir, 'app.html');
if (!fs.existsSync(indexEntry) || !fs.existsSync(appEntry)) {
  console.error('❌ Critical error: Canonical React entry points missing from dist/!');
  process.exit(1);
}

console.log('🎉 Production build complete! React Studio is the canonical app in dist/.');
