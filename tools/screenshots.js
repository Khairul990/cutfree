/* ============================================================================
   CutFree — regenerate the docs/ screenshots
   Runs the single-file build straight from disk (file://), so no server needed.
   Usage:  npm i -D playwright && npx playwright install chromium
           node tools/screenshots.js
   ============================================================================ */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const OUT = path.join(__dirname, '..', 'docs');
const PAGE = 'file://' + path.join(__dirname, '..', 'cutfree.html');
const SHOTS = path.join(__dirname, '..', 'shots');

// builds demo clips inside the browser (gradient + counter + progress bar)
function makeDemoClips() {
  return (async () => {
    const mk = async (secs, name, hue) => {
      const c = document.createElement('canvas');
      c.width = 960; c.height = 540;
      const x = c.getContext('2d');
      const st = c.captureStream(30);
      const r = new MediaRecorder(st, { mimeType: 'video/webm;codecs=vp8' });
      const chunks = [];
      r.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      r.start();
      const t0 = performance.now();
      await new Promise(done => {
        const draw = () => {
          const el = (performance.now() - t0) / 1000;
          const g = x.createLinearGradient(0, 0, 960, 540);
          g.addColorStop(0, `hsl(${hue},70%,55%)`);
          g.addColorStop(1, `hsl(${hue + 60},70%,12%)`);
          x.fillStyle = g; x.fillRect(0, 0, 960, 540);
          x.fillStyle = 'rgba(255,255,255,.95)';
          x.font = 'bold 64px sans-serif';
          x.fillText(name, 60, 140);
          x.font = '36px ui-monospace, monospace';
          x.fillText(el.toFixed(1) + 's', 60, 200);
          x.fillStyle = 'rgba(255,255,255,.3)'; x.fillRect(60, 430, 840, 16);
          x.fillStyle = '#fff'; x.fillRect(60, 430, 840 * (el / secs), 16);
          if (el < secs) requestAnimationFrame(draw); else done();
        };
        draw();
      });
      r.stop();
      await new Promise(done => { r.onstop = done; });
      const file = new File([new Blob(chunks, { type: 'video/webm' })], name + '.webm', { type: 'video/webm' });
      const dt = new DataTransfer();
      dt.items.add(file);
      const input = document.getElementById('fileInput');
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    await mk(3, 'beach-sunset', 285);
    await mk(2, 'interview-a', 195);
    await mk(2, 'b-roll', 330);
  })();
}

function trimFirstClip() {
  const wrap = document.querySelector('.clip:nth-child(1) .strip-wrap').getBoundingClientRect();
  const h = document.querySelector('.clip:nth-child(1) .handle-r');
  const down = (el, x) => el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: wrap.top + wrap.height / 2 }));
  down(h, wrap.right - 2);
  window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: wrap.left + wrap.width * 0.82, clientY: wrap.top + wrap.height / 2 }));
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
}

(async () => {
  [OUT, SHOTS].forEach(d => fs.mkdirSync(d, { recursive: true }));
  const browser = await chromium.launch({ channel: 'chromium', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });

  // desktop
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(PAGE);
  await page.waitForTimeout(400);
  await page.evaluate(() => document.getElementById('tool').scrollIntoView());
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'screenshot-empty.png') });

  await page.evaluate(makeDemoClips);
  await page.waitForFunction(() => document.querySelectorAll('#clips .clip').length === 3, null, { timeout: 60000 });
  await page.evaluate(trimFirstClip);
  await page.click('.clip:nth-child(2)');
  await page.waitForTimeout(3800);
  await page.evaluate(() => document.getElementById('timelineWrap').scrollIntoView({ block: 'end' }));
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, 'screenshot-editor.png') });
  await page.evaluate(() => document.getElementById('tool').scrollIntoView());
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'screenshot-hero.png') });
  await page.evaluate(() => document.getElementById('features').scrollIntoView());
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'screenshot-features.png') });

  // export in progress
  await page.evaluate(() => document.getElementById('tool').scrollIntoView());
  await page.selectOption('#selFormat', 'webm');
  await page.click('#btnExport');
  await page.waitForTimeout(1200);
  await page.evaluate(() => document.getElementById('progressWrap').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT, 'screenshot-exporting.png') });
  await page.waitForSelector('#doneBox:not([hidden])', { timeout: 90000 }).catch(() => { });

  // mobile
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await mobile.goto(PAGE);
  await mobile.waitForTimeout(500);
  await mobile.screenshot({ path: path.join(OUT, 'screenshot-mobile.png') });

  await browser.close();
  console.log('screenshots written to docs/');
})().catch(e => { console.error(e); process.exit(1); });
