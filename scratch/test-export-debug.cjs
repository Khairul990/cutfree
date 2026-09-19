const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = 8138;
const server = spawn('node', ['dist/server.cjs'], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: 'ignore',
});

setTimeout(async () => {
  let browser;
  try {
    browser = await chromium.launch({
      channel: 'msedge',
      headless: true,
      args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox'],
    });

    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('console', msg => console.log('[BROWSER]', msg.type(), msg.text()));
    page.on('pageerror', err => console.log('[BROWSER ERROR]', err.message));

    await page.goto(`http://127.0.0.1:${PORT}/app`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#root', { timeout: 5000 });

    // Open export modal on default project (which is 24s long)
    await page.locator('button:has-text("Export Video")').first().click();
    await page.waitForSelector('h2:has-text("Export Production Video")', { timeout: 5000 });

    console.log('Clicking Start Render...');
    const startRenderBtn = page.locator('button:has-text("Start Render")').first();
    await startRenderBtn.click();

    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(1000);
      const isSuccess = await page.isVisible('text=Video Rendered Successfully!');
      if (isSuccess) {
        console.log('SUCCESS! Video Rendered Successfully!');
        break;
      }
      const isErr = await page.isVisible('text=Failed to render');
      if (isErr) {
        console.log('ERROR detected in modal!');
        break;
      }
    }

  } catch (err) {
    console.error('Test error:', err);
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
}, 1500);
