const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');

const PORT = 8136;
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

    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`http://127.0.0.1:${PORT}/app`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#root');

    // Load blueprint
    const bp = JSON.parse(fs.readFileSync('tests/fixtures/sample-blueprint-14scenes-341s.json', 'utf8'));

    // Open blueprint modal and import
    await page.click('button:has-text("Import JSON")');
    await page.waitForSelector('textarea');
    await page.fill('textarea', JSON.stringify(bp));
    await page.click('button:has-text("Validate & Apply")');
    await page.waitForTimeout(500);

    // Open Export Modal
    await page.click('button:has-text("Export Video")');
    await page.waitForSelector('h2:has-text("Export Production Video")');

    // Confirm Full Production Export is active
    const fullExportCard = page.locator('button:has-text("Full Production Export")').first();
    await fullExportCard.click();
    await page.waitForTimeout(300);

    const activeText = await page.innerText('div:has-text("Active Render Duration:")');
    console.log('Export Modal active duration text:', activeText);

    await browser.close();
  } catch (err) {
    console.error('Error:', err);
  } finally {
    server.kill();
  }
}, 1500);
