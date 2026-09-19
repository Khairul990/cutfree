const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const BLUEPRINT_PATH = path.join(ROOT, 'tests', 'fixtures', 'sample-blueprint-14scenes-341s.json');
const AUDIO_PATH = path.join(ROOT, 'tests', 'fixtures', 'islamic-story-voice-341s.wav');

const http = require('http');
const DIST = path.join(ROOT, 'dist');
const PORT = 8150;

function startProductionServer() {
  return new Promise((resolve, reject) => {
    const serverProc = spawn('node', [path.join(DIST, 'server.cjs')], {
      env: { ...process.env, PORT: String(PORT) },
      stdio: 'pipe',
    });

    serverProc.stdout.on('data', data => {
      if (data.toString().includes('CutFree Studio server running')) {
        resolve(serverProc);
      }
    });

    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      http.get(`http://127.0.0.1:${PORT}/api/health`, res => {
        if (res.statusCode === 200) {
          clearInterval(interval);
          resolve(serverProc);
        }
      }).on('error', () => {
        if (attempts > 40) {
          clearInterval(interval);
          reject(new Error('Server did not start in time'));
        }
      });
    }, 200);
  });
}

(async () => {
  const server = await startProductionServer();
  
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  
  page.on('console', m => console.log('[BrowserConsole]', m.text()));
  page.on('pageerror', e => console.error('[PageError]', e.message));

  await page.goto('http://127.0.0.1:8150/app');
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
  await page.waitForTimeout(1500); // Give time for decodeAudioData

  // 3. Open Export Modal
  console.log('Opening Export Modal...');
  await page.locator('button:has-text("Export")').first().click();
  await page.waitForSelector('text=Export Production Video');

  // Test Full Production Export
  console.log('Selecting Full Production Export...');
  await page.locator('button:has-text("Full Production Export")').first().click();
  await page.waitForTimeout(400);

  console.log('Clicking Start Render (Full Production Export)...');
  await page.locator('button:has-text("Start Render")').first().click();

  const t0 = Date.now();
  let done = false;
  for (let i = 0; i < 120; i++) {
    await page.waitForTimeout(1000);
    const modalText = await page.innerText('div.fixed.inset-0');
    if (modalText.includes('Video Rendered') || modalText.includes('Download Final Video')) {
      console.log(`Render completed in ${((Date.now() - t0) / 1000).toFixed(1)}s!`);
      done = true;
      break;
    }
    const lines = modalText.split('\n').filter(l => l.includes('Rendering') || l.includes('Finalizing') || l.includes('%'));
    if (i % 5 === 0 || i === 0) {
      console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s]`, lines.join(' | '));
    }
  }

  if (!done) {
    const fullText = await page.innerText('div.fixed.inset-0');
    console.error('Failed to complete. Modal text:\n', fullText);
    await browser.close();
    server.kill();
    process.exit(1);
  }

  // Inspect the generated blob and metadata in browser
  const videoDetails = await page.evaluate(async () => {
    const link = document.querySelector('a[download]');
    if (!link) return { error: 'No download link' };
    const url = link.href;
    const fileName = link.getAttribute('download');
    const blob = await (await fetch(url)).blob();

    // Load in video element to check duration, dimensions, tracks
    const video = document.createElement('video');
    video.preload = 'metadata';
    const metadataPromise = new Promise((resolve) => {
      video.onloadedmetadata = () => {
        resolve({
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          duration: video.duration,
          hasAudio: video.webkitAudioDecodedByteCount !== undefined ||
                    video.mozHasAudio !== undefined,
        });
      };
      video.onerror = () => resolve({ error: 'Video element error: ' + (video.error ? video.error.message : 'unknown') });
      setTimeout(() => resolve({ timeout: true, duration: video.duration }), 4000);
    });
    video.src = url;
    const meta = await metadataPromise;

    return {
      fileName,
      blobSize: blob.size,
      blobType: blob.type,
      meta,
    };
  });

  console.log('Video Inspection Result:', JSON.stringify(videoDetails, null, 2));

  await browser.close();
  server.kill();
  process.exit(0);
})();
