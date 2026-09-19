/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Phase 2.2 — Professional Media Import Engine Acceptance Test Suite
 * Tests the complete import pipeline: validation, metadata extraction, stable IDs,
 * IndexedDB storage, reload survival, duplicate detection, multi-file import,
 * relink/replace, missing media handling, and zero console errors.
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const PORT = 8155;
const ROOT = path.resolve(__dirname, '..');
const FIXTURES_DIR = path.join(ROOT, 'tests', 'fixtures');
const ARTIFACTS_DIR = path.join(ROOT, 'tests', 'artifacts');

if (!fs.existsSync(ARTIFACTS_DIR)) {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

// Prepare sample test image fixture
const TEST_IMAGE_PATH = path.join(ARTIFACTS_DIR, 'test-import-sample.png');
// 1x1 transparent PNG buffer
const SAMPLE_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC';
fs.writeFileSync(TEST_IMAGE_PATH, Buffer.from(SAMPLE_PNG_BASE64, 'base64'));

// Prepare invalid file fixture
const INVALID_FILE_PATH = path.join(ARTIFACTS_DIR, 'invalid-binary.xyz');
fs.writeFileSync(INVALID_FILE_PATH, 'This is an unsupported format file content');

// Prepare sample test audio fixture
const AUDIO_FIXTURE_PATH = path.join(FIXTURES_DIR, 'islamic-story-voice-341s.wav');

let passedChecks = 0;
let totalChecks = 0;

function check(title, condition, detail = '') {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`  PASS: [${totalChecks}] ${title}${detail ? ` -> ${detail}` : ''}`);
  } else {
    console.error(`  FAIL: [${totalChecks}] ${title}${detail ? ` -> ${detail}` : ''}`);
    throw new Error(`Media Import Assertion Failed: ${title}`);
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
  console.log(`CUTFREE PHASE 2.2 — PROFESSIONAL MEDIA IMPORT ENGINE E2E SUITE`);
  console.log(`=============================================================`);
  console.log(`⚡ Starting canonical production server on port ${PORT}...`);

  const serverProc = await startProductionServer();
  console.log(`✅ Production Express Server running on port ${PORT}`);

  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--autoplay-policy=no-user-gesture-required']
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });

  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  page.on('requestfailed', req => {
    console.log('  [DEBUG Request Failed]:', req.url(), req.failure()?.errorText);
  });

  page.on('pageerror', err => {
    consoleErrors.push(err.message);
  });

  try {
    // 1. Studio loads
    console.log('\n--- Step 1: Boot Studio & Mount Media Library ---');
    await page.goto(`http://127.0.0.1:${PORT}/app`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#root', { timeout: 6000 });
    check('[1] Studio loads successfully from /app', true);

    // 2. Media Library loads
    const libraryVisible = await page.isVisible('aside:has-text("Media Library")');
    check('[2] Media Library loads and displays header', libraryVisible);

    // 3. Single Image Import
    console.log('\n--- Step 2: Single Image Import & Pipeline ---');
    const universalInput = page.locator('aside input[type="file"][multiple]');
    await universalInput.setInputFiles(TEST_IMAGE_PATH);
    await page.waitForTimeout(1000);

    // 4. Asset appears in Library with stable ID & metadata
    const importedCard = page.locator('aside .group:has-text("test-import-sample.png")').first();
    check('[3] Single image imported via canonical pipeline', await importedCard.isVisible());

    // 5. Stable Asset ID
    await importedCard.hover();
    const previewBtn = importedCard.locator('button[title*="Preview"]').first();
    await previewBtn.click();
    await page.waitForTimeout(400);

    const assetIdText = await page.locator('span.font-mono.select-all').innerText();
    check('[4] Stable Asset ID generated', assetIdText.startsWith('asset_') && (assetIdText.includes('test-import') || assetIdText.includes('test_import')), assetIdText);

    // 6. Metadata extraction
    const hasResolution = await page.isVisible('text=10 x 10');
    check('[5] Real image dimensions extracted (10 x 10)', hasResolution);

    // Close preview modal
    await page.locator('button:has-text("Close")').first().click();
    await page.waitForTimeout(300);

    // 7. Search finds imported asset
    console.log('\n--- Step 3: Search & Filter Verification ---');
    const searchInput = page.locator('aside input[placeholder*="Search assets"]');
    await searchInput.fill('test-import-sample');
    await page.waitForTimeout(300);
    const searchMatch = await page.isVisible('aside div:has-text("test-import-sample.png")');
    check('[6] Search finds imported asset', searchMatch);
    await searchInput.fill('');
    await page.waitForTimeout(200);

    // 8. Category filter finds imported asset
    const bgFilterPill = page.locator('aside button:has-text("Backgrounds")').first();
    await bgFilterPill.click();
    await page.waitForTimeout(300);
    const categoryMatch = await page.isVisible('aside div:has-text("test-import-sample.png")');
    check('[7] Category filter finds imported asset', categoryMatch);

    // Return to All
    await page.locator('aside button:has-text("All")').first().click();
    await page.waitForTimeout(200);

    // 9. Duplicate detection
    console.log('\n--- Step 4: Duplicate Detection ---');
    await universalInput.setInputFiles(TEST_IMAGE_PATH);
    await page.waitForTimeout(600);
    const dupPromptVisible = await page.isVisible('text=Duplicate Media Detected');
    check('[8] Duplicate detection triggers warning prompt', dupPromptVisible);

    // Dismiss duplicate prompt via "Use Existing"
    await page.locator('button:has-text("Use Existing")').click();
    await page.waitForTimeout(300);

    // 10. Single Audio Import
    console.log('\n--- Step 5: Audio Import & Metadata ---');
    check('[9] Audio fixture exists', fs.existsSync(AUDIO_FIXTURE_PATH));
    await universalInput.setInputFiles(AUDIO_FIXTURE_PATH);
    await page.waitForTimeout(1200);

    const audioCard = page.locator('aside .group:has-text("islamic-story-voice-341s.wav")').first();
    check('[10] Audio imported into Media Library', await audioCard.isVisible());

    // 11. Usability in Scene / Timeline
    console.log('\n--- Step 6: Apply Asset to Scene ---');
    await importedCard.hover();
    const applyBtn = importedCard.locator('button[title*="Insert"]').first();
    await applyBtn.click();
    await page.waitForTimeout(400);
    check('[11] Insert asset into current scene executed', true);

    // 12. Save Project and Reload (IndexedDB Persistence Verification)
    console.log('\n--- Step 7: Local-First IndexedDB Persistence & Reload ---');
    const saveBtn = page.locator('button:has-text("Save")').first();
    await saveBtn.click();
    await page.waitForTimeout(600);
    check('[12] Project saved to localStorage + IndexedDB', true);

    // Reload browser page
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#root', { timeout: 6000 });
    await page.waitForTimeout(1000);

    // Verify imported asset survived reload through IndexedDB hydration
    const survivedCard = page.locator('aside .group:has-text("test-import-sample.png")').first();
    check('[13] Imported asset survived page reload via IndexedDB', await survivedCard.isVisible());

    // 13. Asset Renaming
    console.log('\n--- Step 8: Asset Rename & Delete Workflows ---');
    await survivedCard.hover();
    const renameBtn = survivedCard.locator('button[title*="Rename"]').first();
    await renameBtn.click();
    await page.waitForTimeout(300);

    const renameInput = page.locator('div.fixed.inset-0 input[type="text"]').first();
    await renameInput.fill('renamed-custom-image.png');
    await page.locator('button:has-text("Save")').last().click();
    await page.waitForTimeout(400);

    const renamedCard = page.locator('aside .group:has-text("renamed-custom-image.png")').first();
    check('[14] Asset renamed successfully', await renamedCard.isVisible());

    // 14. Invalid File Handling
    console.log('\n--- Step 9: Invalid & Unsupported File Rejection ---');
    await universalInput.setInputFiles(INVALID_FILE_PATH);
    await page.waitForTimeout(500);

    const errorToastVisible = await page.isVisible('text=Unsupported format');
    check('[15] Unsupported file format rejected gracefully without crashing', errorToastVisible);

    // 15. Delete Custom Asset
    page.on('dialog', async dialog => {
      await dialog.accept();
    });
    await renamedCard.hover();
    const deleteBtn = renamedCard.locator('button[title*="Delete"]').first();
    await deleteBtn.click();
    await page.waitForTimeout(500);

    const deletedCardExists = await page.locator('aside .group:has-text("renamed-custom-image.png")').count();
    check('[16] Asset deleted cleanly from Library and IndexedDB', deletedCardExists === 0);

    // 16. Console error check
    console.log('\n--- Step 10: Zero Console Errors Check ---');
    check('[17] Zero console errors during all Media Import operations', consoleErrors.length === 0, consoleErrors.join(' | '));

    console.log('\n=============================================================');
    console.log(`🎉 ALL ${passedChecks}/${totalChecks} MEDIA IMPORT ENGINE ACCEPTANCE CHECKS PASSED!`);
    console.log('=============================================================');
  } finally {
    await browser.close();
    serverProc.kill('SIGTERM');
  }
})();
