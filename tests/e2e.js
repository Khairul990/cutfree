/* ============================================================================
   CutFree — end-to-end test (Playwright)
   Generates real video clips inside the browser, then exercises add / play /
   trim / split / mute / reorder / delete / export / i18n / clear, and verifies
   that the exported file is real, playable media.
   Run:  npm test
   (first: npm i -D playwright && npx playwright install chromium)
   ============================================================================ */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 8123;
const PAGE = process.env.PAGE || 'index.html';   // set PAGE=cutfree.html to test the single-file build
const PAGE_URL = 'http://127.0.0.1:' + PORT + '/' + PAGE + '?debug=1';
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.txt': 'text/plain' };

function serve() {
  const server = http.createServer(function (req, res) {
    var file = decodeURIComponent(req.url.split('?')[0]);
    if (file === '/') file = '/index.html';
    var full = path.join(ROOT, file);
    if (!full.startsWith(ROOT) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' });
    fs.createReadStream(full).pipe(res);
  });
  return new Promise(function (r) { server.listen(PORT, '127.0.0.1', function () { r(server); }); });
}
let failures = 0;
function check(name, ok, extra) {
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : ''));
  if (!ok) failures++;
}

function makeVideo({ seconds, label, color }) {
  return (async () => {
    const W = 320, H = 240, FPS = 25;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const stream = canvas.captureStream(FPS);
    const ac = new AudioContext();
    const osc = ac.createOscillator();
    const dest = ac.createMediaStreamDestination();
    const gain = ac.createGain();
    gain.gain.value = 0.15; osc.frequency.value = 440;
    osc.connect(gain); gain.connect(dest); osc.start();
    dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
    const rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' });
    const chunks = [];
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    rec.start();
    const t0 = performance.now();
    await new Promise(resolve => {
      const draw = () => {
        const el = (performance.now() - t0) / 1000;
        ctx.fillStyle = '#' + color; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#fff'; ctx.font = '28px sans-serif';
        ctx.fillText(label, 20, 60); ctx.fillText(el.toFixed(1) + 's', 20, 110);
        ctx.fillRect(20, 150, Math.min(W - 40, (el / seconds) * (W - 40)), 30);
        if (el < seconds) requestAnimationFrame(draw); else resolve();
      };
      draw();
    });
    rec.stop();
    await new Promise(r => { rec.onstop = r; });
    osc.stop(); ac.close();
    const blob = new Blob(chunks, { type: 'video/webm' });
    const file = new File([blob], 'test-' + label + '.webm', { type: 'video/webm' });
    const dt = new DataTransfer(); dt.items.add(file);
    const input = document.getElementById('fileInput');
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return blob.size;
  })();
}

const stateOf = page => page.evaluate(() => window.cfDebug());

async function exportAndMeasure(page, label) {
  const dl = page.waitForEvent('download', { timeout: 90000 }).catch(() => null);
  await page.click('#btnExport');
  await page.waitForSelector('#doneBox:not([hidden])', { timeout: 90000 });
  const href = await page.getAttribute('#downloadLink', 'href');
  const info = await page.evaluate(async (url) => {
    const blob = await (await fetch(url)).blob();
    const v = document.createElement('video');
    v.src = url;
    const meta = await new Promise(res => {
      v.onloadedmetadata = async () => {
        let d = v.duration;
        if (!isFinite(d)) {                 // streamed WebM: no duration in header
          v.currentTime = 1e101;
          await new Promise(r => { v.ondurationchange = r; setTimeout(r, 3000); });
          d = v.duration;
        }
        res({ ok: true, duration: isFinite(d) ? +d.toFixed(2) : null, w: v.videoWidth, h: v.videoHeight });
      };
      v.onerror = () => res({ ok: false });
      setTimeout(() => res({ ok: false, timeout: true }), 10000);
    });
    return { size: blob.size, type: blob.type, ...meta };
  }, href);
  const download = await dl;
  console.log('  [' + label + '] blob:', JSON.stringify(info), '| saved as:', download ? download.suggestedFilename() : 'none');
  return { info, download };
}

(async () => {
  const server = await serve();
  const browser = await chromium.launch({
    channel: 'chromium',
    args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox']
  });
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') pageErrors.push('console: ' + m.text()); });

  await page.goto(PAGE_URL, { waitUntil: 'load' });
  console.log('\n== 1. landing page ==');
  check('editor hidden before adding video', (await page.isHidden('#editor')) && (await page.isHidden('#btnCancel')) &&
        !(await page.isHidden('#dropzone')));
  check('landing sections rendered', (await page.$$('#featuresGrid .feature')).length === 6 &&
        (await page.$$('#stepsList li')).length === 3 && (await page.$$('#faqList details')).length === 6);

  console.log('\n== 1b. sample clip button ==');
  await page.click('#btnSample');
  await page.waitForSelector('#clips .clip', { timeout: 30000 });
  const sampleState = await stateOf(page);
  check('sample clip generated in-browser', sampleState.clips.length === 1 && sampleState.clips[0].dur > 3,
        sampleState.clips[0] && { name: sampleState.clips[0].name, dur: sampleState.clips[0].dur });
  await page.click('#btnClear');
  await page.waitForTimeout(200);

  console.log('\n== 2. add two videos ==');
  const s1 = await page.evaluate(makeVideo, { seconds: 4, label: 'A', color: '1f4fff' });
  const s2 = await page.evaluate(makeVideo, { seconds: 3, label: 'B', color: 'ff4f8b' });
  check('test media generated', s1 > 20000 && s2 > 20000, [s1, s2]);
  await page.waitForFunction(() => document.querySelectorAll('#clips .clip').length === 2, null, { timeout: 30000 });
  let st = await stateOf(page);
  check('2 clips registered', st.clips.length === 2, st.clips.map(c => c.name));
  check('durations detected', Math.abs(st.clips[0].dur - 4) < 0.5 && Math.abs(st.clips[1].dur - 3) < 0.5, st.clips.map(c => c.dur));
  check('timeline thumbnails painted', (await page.$$eval('.clip .strip-wrap img', ns => ns.filter(n => n.src.startsWith('data:image')).length)) === 2);
  const shown = await page.textContent('#statLength');
  check('total length shown', shown === '00:06', shown);   // 3.98 + 2.97 floors to 6s

  console.log('\n== 3. playback ==');
  await page.click('#btnPlay');
  await page.waitForTimeout(1500);
  const afterPlay = await stateOf(page);
  await page.click('#btnPlay');
  check('preview advances while playing', afterPlay.preview.ct > 1 && afterPlay.playing, { ct: +afterPlay.preview.ct.toFixed(2) });
  check('pause works', !(await stateOf(page)).playing);

  console.log('\n== 4. trim with the timeline handle ==');
  const hb = await (await page.$('.clip .handle-l')).boundingBox();
  await page.mouse.move(hb.x + 7, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + 90, hb.y + hb.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  st = await stateOf(page);
  check('clip 1 start moved in', st.clips[0].start > 0.5, st.clips[0].start);
  const out = await (await page.$('.clip .handle-r')).boundingBox();
  await page.mouse.move(out.x + 7, out.y + out.height / 2);
  await page.mouse.down();
  await page.mouse.move(out.x - 60, out.y + out.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  st = await stateOf(page);
  check('clip 1 end moved back', st.clips[0].end < st.clips[0].dur - 0.4, st.clips[0]);

  console.log('\n== 5. split / mute / reorder / delete ==');
  await page.evaluate(() => { document.getElementById('preview').currentTime = 1.5; });
  await page.waitForTimeout(250);
  await page.click('#btnSplit');
  await page.waitForTimeout(300);
  st = await stateOf(page);
  check('clip split into 3', st.clips.length === 3, st.clips.map(c => [c.start, c.end]));

  await page.click('.clip:nth-child(3) [data-kind="btnMute"]');
  await page.waitForTimeout(100);
  check('mute toggles', (await page.textContent('.clip:nth-child(3) [data-kind="btnMute"]')).indexOf('🔇') === 0,
        await page.textContent('.clip:nth-child(3) [data-kind="btnMute"]'));

  const key = c => c.start + '-' + c.end;
  const orderBefore = (await stateOf(page)).clips.map(key);
  await page.click('.clip:nth-child(1) [data-kind="btnRight"]');
  await page.waitForTimeout(200);
  const orderAfter = (await stateOf(page)).clips.map(key);
  check('clips reorder', orderBefore.join() !== orderAfter.join(), { before: orderBefore, after: orderAfter });

  await page.click('.clip:nth-child(1) [data-kind="btnDel"]');
  await page.waitForTimeout(200);
  check('clip deleted', (await stateOf(page)).clips.length === 2);

  console.log('\n== 6. export as WebM ==');
  await page.selectOption('#selFormat', 'webm');
  await page.selectOption('#selRes', '480');
  await page.selectOption('#selQuality', 'high');
  const beforeExport = (await stateOf(page)).clips.reduce((s, c) => s + (c.end - c.start), 0);
  const r1 = await exportAndMeasure(page, 'webm');
  check('webm file produced', r1.info.ok && r1.info.size > 5000, { size: r1.info.size, type: r1.info.type });
  check('webm duration matches timeline', Math.abs(r1.info.duration - beforeExport) < 0.6, { file: r1.info.duration, timeline: +beforeExport.toFixed(2) });
  check('webm scaled to 480 long side, aspect kept', r1.info.w === 480 && r1.info.h === 360, [r1.info.w, r1.info.h]);
  check('download triggered with proper name', !!r1.download && /^cutfree-.*\.webm$/.test(r1.download.suggestedFilename()), r1.download && r1.download.suggestedFilename());

  console.log('\n== 7. export in auto mode ==');
  await page.selectOption('#selFormat', 'auto');
  await page.selectOption('#selRes', 'source');
  const r2 = await exportAndMeasure(page, 'auto');
  check('auto export produces playable media', r2.info.ok && r2.info.size > 5000, { size: r2.info.size, type: r2.info.type, dur: r2.info.duration });
  check('auto export keeps source resolution (no upscale)', r2.info.w === 320 && r2.info.h === 240, [r2.info.w, r2.info.h]);

  console.log('\n== 8. export progress ui ==');
  await page.waitForTimeout(900);
  check('export button re-enabled', !(await page.isDisabled('#btnExport')));
  check('cancel button hidden again', await page.isHidden('#btnCancel'), await page.evaluate(() => ({
    cancelHidden: document.getElementById('btnCancel').hidden,
    progressHidden: document.getElementById('progressWrap').hidden,
    btnDisabled: document.getElementById('btnExport').disabled
  })));

  console.log('\n== 9. language toggle ==');
  await page.click('#langBtn');
  await page.waitForTimeout(200);
  check('english strings applied', (await page.textContent('[data-i18n="heroTitle"]')).indexOf('Cut video') === 0);
  check('english clip buttons', (await page.textContent('.clip:nth-child(1) [data-kind="btnDel"]')) === '🗑 Delete');
  await page.click('#langBtn');
  await page.waitForTimeout(200);
  check('back to bangla', (await page.textContent('.clip:nth-child(1) [data-kind="btnDel"]')) === '🗑 মুছুন');

  console.log('\n== 10. clear project ==');
  await page.click('#btnClear');
  await page.waitForTimeout(300);
  check('dropzone back', !(await page.isHidden('#dropzone')) && await page.isHidden('#editor'), await page.evaluate(() => ({
    dzHidden: document.getElementById('dropzone').hidden,
    editorHidden: document.getElementById('editor').hidden,
    clipsInDom: document.querySelectorAll('#clips .clip').length,
    timelineHidden: document.getElementById('timelineWrap').hidden
  })));
  check('clip counter reset', (await page.textContent('#statClips')) === '0');

  console.log('\n== 11. page errors ==');
  check('no uncaught page errors', pageErrors.length === 0, pageErrors);

  console.log('\n' + (failures === 0 ? '✅ ALL CHECKS PASSED' : '❌ ' + failures + ' CHECK(S) FAILED'));
  await browser.close();
  server.close();
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('TEST CRASHED:', e); process.exit(2); });
