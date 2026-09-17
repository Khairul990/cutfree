/* ============================================================================
   CutFree Studio — screenshot generator
   Produces the workbench screenshot, a 2x2 montage of real animation frames and
   a sample thumbnail straight from the engine (no video files involved).
   Usage:  npm i -D playwright && npx playwright install chromium
           node tools/studio-shots.js
   ============================================================================ */
const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const PORT = 8131;
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' };

function serve() {
  const server = http.createServer((req, res) => {
    let file = decodeURIComponent(req.url.split('?')[0]);
    if (file === '/') file = '/studio.html';
    const full = path.join(ROOT, file);
    if (!full.startsWith(ROOT) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) return res.writeHead(404).end('nope');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' });
    fs.createReadStream(full).pipe(res);
  });
  return new Promise(r => server.listen(PORT, '127.0.0.1', () => r(server)));
}

const DEMO = `Faceless videos, every single day
Your browser is the whole studio — nothing to install, nothing to upload.

The engine does the boring 90%:
- scenes are split from your text
- timings follow narration pace
- the soundtrack is synthesised locally
- the thumbnail and the YouTube kit come along

Everything runs on WebCodecs, so a one minute video renders in seconds.

Subscribe for the next build.`;

(async () => {
  fs.mkdirSync(DOCS, { recursive: true });
  const server = await serve();
  const browser = await chromium.launch({ channel: 'chromium', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1.5 });
  await page.goto(`http://127.0.0.1:${PORT}/studio.html`, { waitUntil: 'load' });
  await page.waitForTimeout(500);

  // workbench UI with a loaded plan
  await page.fill('#fTitle', 'Faceless videos, every single day');
  await page.fill('#fScript', DEMO);
  await page.fill('#fWatermark', '@cutfree');
  await page.selectOption('#fDuration', { label: '45' }).catch(() => { });
  await page.fill('#fDuration', '30');
  await page.click('#btnBuild');
  await page.waitForFunction(() => document.querySelectorAll('.scene-chip').length > 0, null, { timeout: 60000 });
  await page.evaluate(() => document.getElementById('workbench').scrollIntoView());
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(DOCS, 'studio-workbench.png') });

  // a real frame montage + a sample thumbnail, rendered by the engine itself
  const shots = await page.evaluate(async (demo) => {
    const spec = CFX.director.build({
      title: 'Faceless videos, every single day', script: demo, theme: 'neonNoir',
      mood: 'cinematic', fps: 30, quality: '720p', durationTarget: 30, language: 'en', watermark: '@cutfree'
    });
    const total = spec.scenes.reduce((a, s) => a + s.dur, 0);
    const music = await CFX.music.render(spec.meta.mood, total, { seed: spec.meta.seed });
    spec.energy = CFX.music.energy(music, total, Math.round(total * 10));

    const W = 960, H = 540;
    const c = document.createElement('canvas');
    // render a spec copy sized for the montage cells (createRenderer adopts spec dims)
    const montageSpec = Object.assign({}, spec, { width: W, height: H, meta: Object.assign({}, spec.meta) });
    const R = CFX.engine.createRenderer(c, montageSpec);
    // pick one frame from four different scenes
    const starts = R.starts;
    const picks = [0, 1, 3, 5].map(i => (starts[i] || 0) + (montageSpec.scenes[i] ? montageSpec.scenes[i].dur * 0.66 : 1)).filter(t => t < total);

    const montage = document.createElement('canvas');
    montage.width = W * 2 + 24; montage.height = H * 2 + 24;
    const mx = montage.getContext('2d');
    mx.fillStyle = '#05070c'; mx.fillRect(0, 0, montage.width, montage.height);
    picks.forEach((t, i) => {
      R.renderAt(Math.min(t, total - 0.05));
      mx.drawImage(c, (i % 2) * (W + 24) + 8, Math.floor(i / 2) * (H + 24) + 8);
    });

    const thumb = await CFX.publish.thumbnailBlob(spec, picks[0] || 1, { width: 1280, height: 720 });
    const thumbUrl = URL.createObjectURL(thumb.blob);
    return {
      montage: montage.toDataURL('image/png'),
      thumb: await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(thumb.blob); }),
      thumbUrl,
      scenes: spec.scenes.length,
      total: +total.toFixed(1)
    };
  }, DEMO);

  const save = (dataUrl, name) => {
    fs.writeFileSync(path.join(DOCS, name), Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log('  wrote docs/' + name);
  };
  save(shots.montage, 'studio-frames.png');
  save(shots.thumb, 'studio-thumbnail.png');

  // thumbnail panel screenshot
  await page.evaluate(() => document.getElementById('publish').scrollIntoView());
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(DOCS, 'studio-publish.png') });

  // a rendered clip playing in the queue (optional, keeps the docs honest)
  await page.click('#btnRender').catch(() => { });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(DOCS, 'studio-rendering.png') });

  // mobile view
  const m = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await m.goto(`http://127.0.0.1:${PORT}/studio.html`);
  await m.waitForTimeout(700);
  await m.screenshot({ path: path.join(DOCS, 'studio-mobile.png') });

  console.log(`  montage used ${shots.scenes} scenes / ${shots.total}s`);
  await browser.close();
  server.close();
})().catch(e => { console.error(e); process.exit(1); });
