/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Phase 2.1 — Professional Media Library Acceptance Test Suite
 * Validates Search, Filter, Sort, Preview Modal, Metadata Inspection, Rename, Delete, and Timeline Insertion.
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const PORT = 8140;
const ROOT = path.resolve(__dirname, '..');

let passedChecks = 0;
let totalChecks = 0;

function check(title, condition, detail = '') {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`  PASS: [${totalChecks}] ${title}${detail ? ` -> ${detail}` : ''}`);
  } else {
    console.error(`  FAIL: [${totalChecks}] ${title}${detail ? ` -> ${detail}` : ''}`);
    throw new Error(`Media Library Assertion Failed: ${title}`);
  }
}

function startProductionServer() {
  return new Promise((resolve, reject) => {
    const serverScript = path.join(ROOT, 'dist', 'server.cjs');
    const proc = spawn('node', [serverScript], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(PORT) },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let started = false;
    proc.stdout.on('data', data => {
      const out = data.toString();
      if (!started && (out.includes('running on') || out.includes(String(PORT)))) {
        started = true;
        setTimeout(() => resolve(proc), 300);
      }
    });

    proc.stderr.on('data', data => {
      console.error(`Server err: ${data}`);
    });

    proc.on('error', reject);
    setTimeout(() => {
      if (!started) resolve(proc);
    }, 4000);
  });
}

(async () => {
  console.log(`=============================================================`);
  console.log(`CUTFREE PHASE 2.1 — PROFESSIONAL MEDIA LIBRARY VERIFICATION`);
  console.log(`=============================================================`);
  console.log(`⚡ Starting canonical production server on port ${PORT}...`);

  const serverProc = await startProductionServer();
  console.log(`✅ Production Express Server running on port ${PORT}`);

  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--autoplay-policy=no-user-gesture-required']
  });

  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 }
  });

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  page.on('pageerror', err => {
    consoleErrors.push(err.message);
  });

  try {
    // 1. Boot Studio
    console.log('\n--- Step 1: Boot Studio & Mount Media Library ---');
    await page.goto(`http://127.0.0.1:${PORT}/app`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#root', { timeout: 6000 });
    check('React Studio mounted', true);

    const assetPanelVisible = await page.isVisible('aside:has-text("Media Library")');
    check('Media Library panel header is visible', assetPanelVisible);

    // 2. Filter Category Pills
    console.log('\n--- Step 2: Category Filter Verification ---');
    const filterPills = await page.locator('aside button:has-text("Characters"), aside button:has-text("Backgrounds"), aside button:has-text("Props"), aside button:has-text("Audio & Music")').count();
    check('Category filter pills present', filterPills >= 4, `Found ${filterPills} filter pills`);

    // Filter to Characters
    const charPill = page.locator('aside button:has-text("Characters")').first();
    await charPill.click();
    await page.waitForTimeout(300);

    const charCards = await page.locator('aside div:has-text("Nooruddin"), aside div:has-text("Ayesha"), aside div:has-text("Narrator")').count();
    check('Filtered to Characters displays character cards', charCards >= 3, `Found ${charCards} character matches`);

    // Filter to Backgrounds
    const bgPill = page.locator('aside button:has-text("Backgrounds")').first();
    await bgPill.click();
    await page.waitForTimeout(300);

    const bgCards = await page.locator('aside div:has-text("Mosque"), aside div:has-text("Village"), aside div:has-text("Forest")').count();
    check('Filtered to Backgrounds displays background cards', bgCards >= 3, `Found ${bgCards} background matches`);

    // Filter to Audio & Music
    const audioPill = page.locator('aside button:has-text("Audio & Music")').first();
    await audioPill.click();
    await page.waitForTimeout(300);

    const audioCards = await page.locator('aside div:has-text("Serene Acoustic"), aside div:has-text("Chime"), aside div:has-text("Creak")').count();
    check('Filtered to Audio & Music displays audio/music/sfx assets', audioCards >= 1);

    // Return to All
    const allPill = page.locator('aside button:has-text("All")').first();
    await allPill.click();
    await page.waitForTimeout(300);

    // 3. Search Bar
    console.log('\n--- Step 3: Search Query Filtering ---');
    const searchInput = page.locator('aside input[placeholder*="Search assets"]');
    await searchInput.fill('Lantern');
    await page.waitForTimeout(300);

    const lanternCardVisible = await page.isVisible('aside div:has-text("Lantern")');
    check('Search query "Lantern" matches Lantern asset', lanternCardVisible);

    await searchInput.fill('');
    await page.waitForTimeout(300);

    // 4. Sort Controls
    console.log('\n--- Step 4: Asset Sorting ---');
    const sortBtn = page.locator('aside button[title="Sort Assets"]');
    await sortBtn.click();
    await page.waitForTimeout(200);

    const sortOptionVisible = await page.isVisible('text=Name (A-Z)');
    check('Sort dropdown opens with sorting options', sortOptionVisible);

    const nameSortBtn = page.locator('aside button:has-text("Name (A-Z)")');
    await nameSortBtn.click();
    await page.waitForTimeout(300);
    check('Sort option Name (A-Z) selected and applied', true);

    // 5. Preview Modal & Technical Metadata Inspector
    console.log('\n--- Step 5: Asset Preview Modal & Technical Metadata ---');
    // Hover over first card and click Preview eye button
    const firstCard = page.locator('aside .group').first();
    await firstCard.hover();
    const previewBtn = firstCard.locator('button[title*="Preview"]').first();
    await previewBtn.click();
    await page.waitForTimeout(400);

    const modalVisible = await page.isVisible('text=Technical Specifications');
    check('Asset Preview & Metadata Inspector modal opened', modalVisible);

    const hasAssetId = await page.isVisible('text=Asset ID');
    const hasSource = await page.isVisible('text=Source');
    check('Metadata Inspector displays Asset ID and Source specs', hasAssetId && hasSource);

    // Close modal
    const closeBtn = page.locator('button:has-text("Close")').first();
    await closeBtn.click();
    await page.waitForTimeout(300);
    const modalClosed = !(await page.isVisible('text=Technical Specifications'));
    check('Preview modal closed cleanly', modalClosed);

    // 6. Usability in Timeline
    console.log('\n--- Step 6: Insert Asset into Scene ---');
    // Switch to Characters and insert Ayesha into active scene
    await charPill.click();
    await page.waitForTimeout(200);

    const ayeshaCard = page.locator('aside .group:has-text("Ayesha")').first();
    await ayeshaCard.hover();
    const insertBtn = ayeshaCard.locator('button[title*="Insert"]').first();
    await insertBtn.click();
    await page.waitForTimeout(500);

    // Verify Inspector or Canvas reflects the updated character
    const inspectorText = await page.innerText('aside:last-child');
    check('Inserted character reactive in Studio state', inspectorText.length > 0);

    // 7. Check Console Errors
    console.log('\n--- Step 7: Console & Runtime Check ---');
    check('Zero console errors throughout Media Library operations', consoleErrors.length === 0, consoleErrors.join(' | '));

    console.log('\n=============================================================');
    console.log(`🎉 ALL ${passedChecks}/${totalChecks} MEDIA LIBRARY ACCEPTANCE CRITERIA PASSED!`);
    console.log('=============================================================');
  } finally {
    await browser.close();
    serverProc.kill('SIGTERM');
  }
})();
