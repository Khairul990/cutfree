const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = 8137;
const BLUEPRINT_PATH = path.resolve('tests/fixtures/sample-blueprint-14scenes-341s.json');
const AUDIO_PATH = path.resolve('tests/fixtures/islamic-story-voice-341s.wav');
const OUT_FILE = path.resolve('tests/artifacts/cutfree-full-production.mp4');

const server = spawn('node', ['dist/server.cjs'], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: 'ignore',
});

setTimeout(async () => {
  let browser;
  try {
    console.log(`⚡ Launching browser on port ${PORT}...`);
    browser = await chromium.launch({
      channel: 'msedge',
      headless: true,
      args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox'],
    });

    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`http://127.0.0.1:${PORT}/app`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#root', { timeout: 5000 });

    // 1. Import 14-scene 341.89s Blueprint
    console.log('📦 Importing 14-scene 341.89s Blueprint...');
    const rawBlueprintJson = fs.readFileSync(BLUEPRINT_PATH, 'utf8');
    await page.locator('button:has-text("JSON")').first().click();
    await page.waitForSelector('div.fixed.inset-0 textarea', { timeout: 4000 });
    await page.locator('div.fixed.inset-0 textarea').fill(rawBlueprintJson);
    await page.waitForTimeout(300);

    const applyBtn = page.locator('div.fixed.inset-0 button:has-text("Apply to Studio"), div.fixed.inset-0 button:has-text("Apply")').first();
    await applyBtn.click();
    await page.waitForTimeout(600);

    // 2. Import 341.89s Audio
    console.log('🎵 Importing 341.89s Audio fixture...');
    const audioInput = page.locator('input[type="file"][accept="audio/*"]');
    await audioInput.setInputFiles(AUDIO_PATH);
    await page.waitForTimeout(1000);

    // 3. Open Export Modal
    console.log('🚀 Opening Export Modal...');
    await page.locator('button:has-text("Export Video")').first().click();
    await page.waitForSelector('h2:has-text("Export Production Video")', { timeout: 5000 });

    // Confirm Full Production Export is active (default)
    const fullScopeBtn = page.locator('button:has-text("Full Production Export")').first();
    await fullScopeBtn.click();
    await page.waitForTimeout(300);

    // Select 720p for fast reliable E2E test rendering
    const q720pBtn = page.locator('button:has-text("720p")').first();
    if (await q720pBtn.isVisible()) {
      await q720pBtn.click();
    }

    console.log('🎬 Starting Full Production Export render...');
    const startRenderBtn = page.locator('button:has-text("Start Render")').first();
    await startRenderBtn.click();

    // Monitor progress
    const startTime = Date.now();
    let isComplete = false;

    for (let i = 0; i < 180; i++) { // up to 3 minutes
      await page.waitForTimeout(2000);
      const isSuccess = await page.isVisible('text=Video Rendered Successfully!');
      if (isSuccess) {
        isComplete = true;
        console.log(`✅ Render completed in ${((Date.now() - startTime) / 1000).toFixed(1)}s!`);
        break;
      }

      const progressText = await page.locator('div.fixed.inset-0').innerText().catch(() => '');
      const match = progressText.match(/Rendering frame (\d+) \/ (\d+)/);
      if (match) {
        console.log(`   Progress: ${match[0]} (${Math.round((parseInt(match[1]) / parseInt(match[2])) * 100)}%)`);
      }
    }

    if (!isComplete) {
      throw new Error('Export timed out after 3 minutes');
    }

    // Download or extract Blob from page
    console.log('💾 Extracting exported video blob...');
    const videoData = await page.evaluate(async () => {
      const downloadLink = document.querySelector('a[download]');
      if (!downloadLink) throw new Error('Download link not found');
      const url = downloadLink.getAttribute('href');
      const resp = await fetch(url);
      const blob = await resp.blob();
      const arrayBuf = await blob.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuf).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      // Inspect via HTMLVideoElement
      const vid = document.createElement('video');
      vid.src = url;
      await new Promise((resolve) => {
        vid.onloadedmetadata = () => resolve();
        vid.onerror = () => resolve();
        setTimeout(resolve, 4000);
      });

      return {
        fileName: downloadLink.getAttribute('download') || 'video.mp4',
        mimeType: blob.type,
        sizeBytes: blob.size,
        videoDuration: vid.duration,
        videoWidth: vid.videoWidth,
        videoHeight: vid.videoHeight,
        base64Length: base64.length,
        base64Data: base64.slice(0, 1000000) // first 1MB for verification
      };
    });

    console.log('📊 Exported Video Inspection:');
    console.log('   File Name:', videoData.fileName);
    console.log('   MIME Type:', videoData.mimeType);
    console.log('   Size Bytes:', videoData.sizeBytes);
    console.log('   Size MB:', (videoData.sizeBytes / (1024 * 1024)).toFixed(2));
    console.log('   Video Duration:', videoData.videoDuration);
    console.log('   Video Width:', videoData.videoWidth);
    console.log('   Video Height:', videoData.videoHeight);

    // Save actual file
    fs.mkdirSync('tests/artifacts', { recursive: true });
    // Write full binary using base64 chunks
    await page.evaluate(async () => {
      const downloadLink = document.querySelector('a[download]');
      const resp = await fetch(downloadLink.getAttribute('href'));
      const blob = await resp.blob();
      const reader = new FileReader();
      return new Promise((resolve) => {
        reader.onloadend = () => {
          window.__exportedBase64 = reader.result;
          resolve();
        };
        reader.readAsDataURL(blob);
      });
    });

    const fullDataUrl = await page.evaluate(() => window.__exportedBase64);
    if (fullDataUrl && fullDataUrl.startsWith('data:')) {
      const base64Content = fullDataUrl.split(',')[1];
      fs.writeFileSync(OUT_FILE, Buffer.from(base64Content, 'base64'));
      console.log(`📁 Saved full production video to ${OUT_FILE} (${fs.statSync(OUT_FILE).size} bytes)`);
    }

  } catch (err) {
    console.error('Fatal test error:', err);
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
}, 1500);
