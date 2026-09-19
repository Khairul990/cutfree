const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PORT = 8140;
const BLUEPRINT_PATH = path.join(ROOT, 'tests', 'fixtures', 'sample-blueprint-14scenes-341s.json');
const AUDIO_PATH = path.join(ROOT, 'tests', 'fixtures', 'islamic-story-voice-341s.wav');
const OUT_FILE = path.join(ROOT, 'scratch', 'test-exported-video.webm');

function startServer() {
  return new Promise((resolve, reject) => {
    const serverProc = spawn('node', [path.join(DIST, 'server.cjs')], {
      env: { ...process.env, PORT: String(PORT) },
      stdio: 'pipe',
    });
    serverProc.stdout.on('data', data => {
      if (data.toString().includes('CutFree Studio server running')) resolve(serverProc);
    });
    serverProc.on('error', reject);
    setTimeout(() => resolve(serverProc), 1500);
  });
}

(async () => {
  console.log('⚡ Starting server on port', PORT);
  const server = await startServer();
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  page.on('console', msg => console.log('[Browser]', msg.text()));
  page.on('pageerror', err => console.error('[PageError]', err));

  try {
    await page.goto(`http://127.0.0.1:${PORT}/app`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#root');

    // 1. Import Blueprint
    console.log('Importing 14-scene blueprint...');
    const rawBlueprint = fs.readFileSync(BLUEPRINT_PATH, 'utf8');
    await page.locator('button:has-text("JSON")').first().click();
    await page.waitForSelector('div.fixed.inset-0 textarea');
    await page.locator('div.fixed.inset-0 textarea').fill(rawBlueprint);
    await page.locator('div.fixed.inset-0 button:has-text("Apply to Studio"), div.fixed.inset-0 button:has-text("Apply")').first().click();
    await page.waitForTimeout(800);

    // 2. Import Audio
    console.log('Importing WAV audio...');
    const audioInput = page.locator('input[type="file"][accept="audio/*"]');
    await audioInput.setInputFiles(AUDIO_PATH);
    await page.waitForTimeout(800);

    // 3. Open Export Modal
    console.log('Opening Export Modal...');
    await page.locator('button:has-text("Export")').first().click();
    await page.waitForSelector('text=Export Production Video');

    // Ensure Full Production Export is active
    await page.locator('button:has-text("Full Production Export")').first().click();
    await page.waitForTimeout(400);

    // Click Start Render
    console.log('Clicking Start Render (Full Production Export)...');
    await page.locator('button:has-text("Start Render")').first().click();

    // Monitor progress
    const t0 = Date.now();
    let completed = false;
    for (let i = 0; i < 180; i++) {
      await page.waitForTimeout(1000);
      const modalText = await page.innerText('div.fixed.inset-0');
      if (modalText.includes('Download') || modalText.includes('Video Rendered')) {
        completed = true;
        console.log(`Render completed in ${((Date.now() - t0) / 1000).toFixed(1)}s!`);
        break;
      }
      if (i % 3 === 0) {
        console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] modal content snippet:\n`, modalText.substring(0, 300));
      }
    }

    if (!completed) {
      throw new Error('Export did not complete within timeout');
    }

    // Inspect the download / video
    const videoStats = await page.evaluate(async () => {
      // Find the download link or video blob
      const link = document.querySelector('a[download]');
      const href = link ? link.href : '';
      if (!href) return { error: 'No download link found' };

      const blob = await (await fetch(href)).blob();
      
      // Load into a video element to measure duration & dimensions
      const v = document.createElement('video');
      v.preload = 'metadata';
      const durationPromise = new Promise((resolve) => {
        v.onloadedmetadata = () => {
          resolve({
            videoWidth: v.videoWidth,
            videoHeight: v.videoHeight,
            duration: v.duration,
          });
        };
        v.onerror = (e) => resolve({ error: 'Video element load error: ' + (v.error ? v.error.message : 'unknown') });
        setTimeout(() => resolve({ timeout: true, duration: v.duration }), 5000);
      });
      v.src = href;
      const meta = await durationPromise;

      return {
        blobSize: blob.size,
        blobType: blob.type,
        meta,
      };
    });

    console.log('Video stats from browser:', JSON.stringify(videoStats, null, 2));

  } finally {
    await browser.close();
    server.kill();
  }
})();
