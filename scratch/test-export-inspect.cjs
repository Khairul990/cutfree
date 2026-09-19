const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = 8135;
const server = spawn('node', ['dist/server.cjs'], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: 'ignore',
});

setTimeout(async () => {
  try {
    const browser = await chromium.launch({
      channel: 'msedge',
      headless: true,
      args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox'],
    });

    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(`http://127.0.0.1:${PORT}/app`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#root');

    const bp = JSON.parse(fs.readFileSync('tests/fixtures/sample-blueprint-14scenes-341s.json', 'utf8'));

    console.log('Testing export on 5s project slice...');
    const result5s = await page.evaluate(async (blueprint) => {
      const exporter = await import('/src/render/exporter.ts');
      const testBp = { ...blueprint, timeline: { ...blueprint.timeline, duration: 5 } };
      const start = performance.now();
      const blob = await exporter.exportVideo(testBp, {
        width: 640,
        height: 360,
        fps: 30,
        format: 'mp4',
        mode: 'full',
      });
      const elapsed = (performance.now() - start) / 1000;

      const url = URL.createObjectURL(blob);
      const vid = document.createElement('video');
      vid.src = url;
      await new Promise((res) => {
        vid.onloadedmetadata = () => res();
        vid.onerror = () => res();
        setTimeout(res, 5000);
      });

      return {
        elapsedSec: elapsed,
        blobSize: blob.size,
        blobType: blob.type,
        videoDuration: vid.duration,
        videoWidth: vid.videoWidth,
        videoHeight: vid.videoHeight,
      };
    }, bp);

    console.log('5s Export Result:', result5s);
    await browser.close();
  } catch (err) {
    console.error('Test error:', err);
  } finally {
    server.kill();
  }
}, 1500);
