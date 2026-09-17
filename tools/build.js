#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

console.log('⚡ Starting CutFree Studio cross-platform build...');

// 1. Run single-file inliner
execSync('node tools/build-single-file.js', { stdio: 'inherit', cwd: ROOT });

// 2. Prepare dist folder
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

// 3. Copy frontend assets to dist
const itemsToCopy = [
  'index.html',
  'studio.html',
  'cutfree.html',
  'cutfree-studio.html',
  'assets',
  'css',
  'js',
  'manifest.webmanifest',
  'robots.txt',
  'sw.js'
];

itemsToCopy.forEach(item => {
  copyRecursive(path.join(ROOT, item), path.join(distDir, item));
});
console.log('✅ Static assets copied to dist/');

// 4. Bundle server.ts with esbuild
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

console.log('🎉 Production build complete in dist/!');
