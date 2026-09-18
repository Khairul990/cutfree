/* ============================================================================
   CutFree Factory Studio — end-to-end test (studio.html)

   The factory page is a self-contained app (its own renderer, music engine,
   caption builder and MediaRecorder export), so it gets its own suite:

     demo script -> plan -> canvas actually animates -> play advances the clock
     -> thumbnail PNG -> SRT -> project JSON, with a hard look at runtime errors
     (the audio scheduler used to throw on negative note times).

   Run:  npm run test:factory        PAGE=cutfree-studio.html to test the build
   ============================================================================ */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 8127;
const PAGE = process.env.PAGE || 'studio.html';
const URL = 'http://127.0.0.1:' + PORT + '/' + PAGE + '?debug=1';
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.wav': 'audio/wav' };

function serve() {
  const server = http.createServer(function (req, res) {
    let file = decodeURIComponent(req.url.split('?')[0]);
    if (file === '/') file = '/' + PAGE;
    const full = path.join(ROOT, file);
    if (!full.startsWith(ROOT) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' });
    fs.createReadStream(full).pipe(res);
  });
  return new Promise(r => server.listen(PORT, '127.0.0.1', () => r(server)));
}

let failures = 0, checks = 0;
function check(name, ok, extra) {
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : ''));
  checks++;
  if (!ok) failures++;
}

(async () => {
  const server = await serve();
  const browser = await chromium.launch({
    channel: 'chromium',
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']
  });
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(600);

  console.log('\n== 1. boots ==');
  const boot = await page.evaluate(() => {
    const c = document.querySelector('#cv');
    return {
      canvas: c ? c.width + 'x' + c.height : null,
      script: !!document.querySelector('#src'),
      buttons: ['bPlan', 'bPlay', 'bRec', 'bThumb', 'bSrt', 'bJson', 'bTts', 'bWav', 'bShorts']
        .filter(id => !!document.getElementById(id)),
      proLink: !!document.querySelector('a[href="studio-pro.html"]')
    };
  });
  console.log('  boot:', JSON.stringify(boot));
  check('factory page renders its canvas + controls', !!boot.canvas && boot.script && boot.buttons.length >= 9, boot);
  check('offers the pro (story) studio as well', boot.proLink === true);
  check('no startup errors', errors.length === 0, errors.slice(0, 3));

  console.log('\n== 2. demo script -> plan ==');
  await page.click('#bDemo');
  await page.waitForTimeout(400);
  const scriptLen = await page.evaluate(() => (document.querySelector('#src').value || '').length);
  check('demo script fills the editor', scriptLen > 80, scriptLen);
  await page.click('#bPlan');
  await page.waitForTimeout(1800);
  const plan = await page.evaluate(() => ({
    stat: document.querySelector('#stat').textContent.replace(/\s+/g, ' ').trim().slice(0, 90),
    total: document.querySelector('#tt').textContent.trim(),
    blocks: document.querySelectorAll('#tl > *').length,
    scenes: (function () {
      const m = document.querySelector('#stat').textContent.match(/(\d+)\s*সিন/);
      return m ? Number(m[1]) : -1;
    })()
  }));
  console.log('  plan:', JSON.stringify(plan));
  check('a plan is built from the script', plan.scenes > 0 && /\d/.test(plan.stat), plan);
  check('timeline is drawn', plan.blocks > 0, plan.blocks);
  check('total duration is real', /^\d+:\d\d$/.test(plan.total) && plan.total !== '0:00', plan.total);

  console.log('\n== 3. the canvas really animates ==');
  const scrubTo = async (frac) => {
    const box = await page.evaluate((f) => {
      const s = document.querySelector('#seek');
      const r = s.getBoundingClientRect();
      return { x: r.left + r.width * f, y: r.top + r.height / 2 };
    }, frac);
    await page.mouse.click(box.x, box.y);
    await page.waitForTimeout(400);
  };
  const sig = async (t) => page.evaluate((tt) => {
    const c = document.querySelector('#cv');
    const x = c.getContext('2d');
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let ink = 0, h = 0;
    for (let i = 0; i < d.length; i += 40) { if (d[i + 3] > 8) ink++; }
    for (let i = 0; i < d.length; i += 397) h = (h * 31 + d[i]) | 0;
    return { ink: ink, hash: h };
  }, t);
  await scrubTo(0.12); const f1 = await sig();
  await scrubTo(0.45); const f2 = await sig();
  await scrubTo(0.8); const f3 = await sig();
  console.log('  frames:', JSON.stringify({ f1, f2, f3 }));
  check('frames are painted, not blank', f1.ink > 1000 && f2.ink > 1000, { f1: f1.ink, f2: f2.ink });
  const clock = await page.evaluate(() => document.querySelector('#tc').textContent.trim());
  check('clicking the timeline scrubs the video', clock !== '0:00', clock);
  check('the picture changes over time', f1.hash !== f2.hash && f2.hash !== f3.hash, { f1: f1.hash, f2: f2.hash, f3: f3.hash });

  console.log('\n== 4. playback ==');
  await page.click('#bPlay');
  await page.waitForFunction(() => {
    const t = document.querySelector('#tc').textContent.trim();
    return t !== '0:00';
  }, null, { timeout: 15000 }).catch(() => { });
  const playing = await page.evaluate(() => ({
    btn: document.querySelector('#bPlay').textContent.trim(),
    tc: document.querySelector('#tc').textContent.trim()
  }));
  await page.click('#bPlay');
  console.log('  playing:', JSON.stringify(playing));
  check('play advances the clock', playing.btn.indexOf('⏸') > -1 && playing.tc !== '0:00', playing);

  console.log('\n== 5. exports ==');
  // the sidebar is tabbed — each button is only clickable on its own tab
  const tab = async (name) => {
    await page.click('.tabs button[data-p="' + name + '"]');
    await page.waitForTimeout(250);
  };
  const dlDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cutfree-factory-'));
  const grab = async (sel, name) => {
    const wait = page.waitForEvent('download', { timeout: 30000 });
    await page.click(sel);
    const dl = await wait;
    const file = path.join(dlDir, dl.suggestedFilename() || name);
    await dl.saveAs(file);
    return { file, name: dl.suggestedFilename(), size: fs.statSync(file).size };
  };

  await tab('exp');
  const thumb = await grab('#bThumb', 'thumb.png');
  const thumbHead = fs.readFileSync(thumb.file).subarray(0, 8);
  console.log('  thumbnail:', thumb.name, thumb.size);
  check('thumbnail downloads as a real PNG',
    /\.png$/i.test(thumb.name) && thumb.size > 5000 && thumbHead[0] === 0x89 && thumbHead[1] === 0x50, { name: thumb.name, size: thumb.size });

  await tab('snd');
  const srt = await grab('#bSrt', 'caps.srt');
  const srtText = fs.readFileSync(srt.file, 'utf8');
  console.log('  srt:', srt.name, srtText.split('\n').length, 'lines');
  check('SRT export is valid', /\.srt$/i.test(srt.name) && /-->/.test(srtText) && /\d\d:\d\d:\d\d,\d\d\d/.test(srtText), { name: srt.name, head: srtText.split('\n').slice(0, 3) });

  await tab('exp');
  const proj = await grab('#bJson', 'project.json');
  const projJson = JSON.parse(fs.readFileSync(proj.file, 'utf8'));
  console.log('  project:', proj.name, Object.keys(projJson).slice(0, 6));
  check('project JSON round-trips', projJson && (projJson.scenes || projJson.plan || projJson.script), Object.keys(projJson).slice(0, 6));

  console.log('\n== 6. errors ==');
  const real = errors.filter(e => !/favicon|Autoplay|play\(\) request|AudioContext was not allowed/i.test(e));
  console.log('  errors:', JSON.stringify(real.slice(0, 4)));
  check('no runtime errors during the whole flow (incl. the audio scheduler)', real.length === 0, real.slice(0, 4));

  console.log('\n' + (failures === 0 ? '✅ ALL FACTORY CHECKS PASSED' : '❌ ' + failures + ' CHECK(S) FAILED') + '  (' + (checks - failures) + '/' + checks + ')');
  await browser.close();
  server.close();
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('TEST CRASHED:', e); process.exit(2); });
