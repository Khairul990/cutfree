/* ============================================================================
   CutFree Studio — end-to-end test
   Verifies the whole auto-video pipeline in a real browser:
     director -> procedural music -> deterministic preview -> WebCodecs render
     -> WebM mux (video + audio) -> MediaRecorder compat render -> thumbnail,
     metadata, living-HTML export and the batch queue.
   Run:  npm run test:studio
   ============================================================================ */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 8125;
const PAGE = process.env.PAGE || 'studio.html';   // PAGE=cutfree-studio.html tests the single-file build
const URL = 'http://127.0.0.1:' + PORT + '/' + PAGE + '?debug=1';
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.md': 'text/markdown', '.png': 'image/png' };

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

let failures = 0;
function check(name, ok, extra) {
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : ''));
  if (!ok) failures++;
}

const SCRIPT = [
  'Why browser video is the future',
  'Everything you need already ships inside your browser.',
  '',
  'The engine never uploads a byte:',
  '- WebCodecs encodes on the GPU',
  '- our own WebM muxer packs the file',
  '- music is synthesised locally',
  '',
  '90% of the work is automatic.',
  '',
  'Subscribe for the next build.'
].join('\n');

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
  await page.waitForTimeout(500);

  console.log('\n== 1. studio boots ==');
  check('landing + workbench rendered', (await page.$$('.swatch')).length === 8 && (await page.$$('#fMood option')).length === 6);
  check('engine detected', /WebCodecs|MediaRecorder/.test(await page.textContent('#enginePill')), await page.textContent('#enginePill'));
  check('no startup errors', errors.length === 0, errors);

  console.log('\n== 2. auto-director ==');
  const plan = await page.evaluate((script) => {
    const spec = CFX.director.build({
      title: 'Browser video, explained', script: script,
      theme: 'aurora', mood: 'uplifting', aspect: '16:9', quality: '720p', fps: 30,
      durationTarget: 24, language: 'en'
    });
    return {
      scenes: spec.scenes.length,
      types: spec.scenes.map(s => s.type),
      total: +spec.scenes.reduce((a, s) => a + s.dur, 0).toFixed(2),
      width: spec.width, height: spec.height,
      theme: spec.meta.theme, mood: spec.meta.mood
    };
  }, SCRIPT);
  console.log('  plan:', JSON.stringify(plan));
  check('scenes split from the script', plan.scenes >= 5, plan.scenes);
  check('bullet block became a bullets scene', plan.types.indexOf('bullets') > -1, plan.types);
  check('has intro + outro', plan.types[0] === 'intro' && plan.types[plan.types.length - 1] === 'outro');
  check('duration hit the target', Math.abs(plan.total - 24) < 1.5, plan.total);
  check('720p 16:9 canvas', plan.width === 1280 && plan.height === 720, [plan.width, plan.height]);

  console.log('\n== 3. procedural music ==');
  const music = await page.evaluate(async () => {
    const buf = await CFX.music.render('uplifting', 6, { seed: 42 });
    const data = buf.getChannelData(0);
    let peak = 0, sum = 0;
    for (let i = 0; i < data.length; i += 7) { const v = Math.abs(data[i]); if (v > peak) peak = v; sum += v; }
    const e = CFX.music.energy(buf, 6, 60);
    let eMin = 1, eMax = 0;
    for (const v of e) { if (v < eMin) eMin = v; if (v > eMax) eMax = v; }
    return { len: buf.length, rate: buf.sampleRate, peak: +peak.toFixed(3), mean: +(sum / (data.length / 7)).toFixed(4), eMin: +eMin.toFixed(2), eMax: +eMax.toFixed(2) };
  });
  console.log('  audio:', JSON.stringify(music));
  check('music rendered offline', music.len === 6 * music.rate && music.rate === 48000, music);
  check('music is audible (not silence)', music.peak > 0.05 && music.mean > 0.002, { peak: music.peak, mean: music.mean });
  check('energy profile normalised 0..1', music.eMin >= 0 && music.eMax <= 1 && music.eMax > 0.8, [music.eMin, music.eMax]);

  console.log('\n== 4. deterministic renderer ==');
  const frames = await page.evaluate((script) => {
    const spec = CFX.director.build({ title: 'T', script: script, fps: 30, quality: '720p', durationTarget: 12, language: 'en' });
    const canvas = document.createElement('canvas');
    const r = CFX.engine.createRenderer(canvas, spec);
    const ctx = canvas.getContext('2d');
    const sample = (t) => {
      r.renderAt(t);
      const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let sum = 0, n = 0, hash = 0;
      for (let i = 0; i < d.length; i += 1200) { sum += (d[i] + d[i + 1] + d[i + 2]) / 3; hash = (hash * 31 + d[i]) | 0; n++; }
      return { lum: Math.round(sum / n), hash };
    };
    const a = sample(0.5), b = sample(2.5), c = sample(2.5), d2 = sample(6.1);
    return { duration: r.duration, a, b, c, d: d2, frames: r.frameCount };
  }, SCRIPT);
  console.log('  frames:', JSON.stringify(frames));
  check('renderer reports duration + frame count', frames.duration > 6 && frames.frames >= 180, { d: frames.duration, f: frames.frames });
  check('frames are not black', frames.a.lum > 8 && frames.b.lum > 8, [frames.a.lum, frames.b.lum]);
  check('animation actually moves', frames.a.hash !== frames.b.hash, [frames.a.hash, frames.b.hash]);
  check('same time renders identically (deterministic)', frames.b.hash === frames.c.hash);

  console.log('\n== 5. WebCodecs render -> WebM muxer ==');
  const renderResult = await page.evaluate(async (script) => {
    const spec = CFX.director.build({ title: 'Browser video, explained', script: script, fps: 30, quality: '720p', durationTarget: 12, language: 'en', mood: 'uplifting' });
    const total = spec.scenes.reduce((a, s) => a + s.dur, 0);
    const music = await CFX.music.render(spec.meta.mood, total, { seed: spec.meta.seed });
    spec.energy = CFX.music.energy(music, total, Math.round(total * 10));
    const canvas = document.createElement('canvas');
    canvas.width = spec.width; canvas.height = spec.height;
    const renderer = CFX.engine.createRenderer(canvas, spec);
    const t0 = performance.now();
    const res = await CFX.encode.render({
      renderer, canvas, spec, audioBuffer: music, fps: spec.fps,
      width: spec.width, height: spec.height, engine: 'fast'
    });
    const secs = (performance.now() - t0) / 1000;
    const head = new TextDecoder().decode(new Uint8Array(await res.blob.slice(0, 4096).arrayBuffer()));
    const url = URL.createObjectURL(res.blob);
    const probe = await new Promise(done => {
      const v = document.createElement('video');
      v.preload = 'metadata'; v.src = url;
      v.onloadedmetadata = async () => {
        let d = v.duration;
        if (!isFinite(d)) { v.currentTime = 1e101; await new Promise(r => { v.ondurationchange = r; setTimeout(r, 3000); }); d = v.duration; }
        done({ ok: true, dur: isFinite(d) ? +d.toFixed(2) : null, w: v.videoWidth, h: v.videoHeight });
      };
      v.onerror = () => done({ ok: false });
      setTimeout(() => done({ ok: false, timeout: true }), 12000);
    });
    return {
      mode: res.mode, ext: res.ext, mime: res.mime, size: res.blob.size,
      targetDur: +total.toFixed(2), renderSeconds: +secs.toFixed(1),
      packets: res.stats && res.stats.packets ? res.stats.packets : null,
      videoChunks: res.stats && res.stats.videoChunks, audioChunks: res.stats && res.stats.audioChunks,
      hasVP9: head.indexOf('V_VP') > -1, hasOpus: head.indexOf('A_OPUS') > -1, hasWebmDoc: head.indexOf('webm') > -1,
      probe
    };
  }, SCRIPT);
  console.log('  render:', JSON.stringify(renderResult));
  check('encoded with the WebCodecs path', renderResult.mode === 'webcodecs', renderResult.mode);
  check('WebM container written by our muxer', renderResult.hasWebmDoc && renderResult.hasVP9, { webm: renderResult.hasWebmDoc, vp: renderResult.hasVP9 });
  check('audio track present in the container', renderResult.hasOpus, { opus: renderResult.hasOpus, audioChunks: renderResult.audioChunks });
  check('file is real (>= 60 KB)', renderResult.size > 60000, renderResult.size);
  check('decodes as playable video', renderResult.probe.ok === true, renderResult.probe);
  check('duration matches the timeline', Math.abs(renderResult.probe.dur - renderResult.targetDur) < 0.6, { file: renderResult.probe.dur, timeline: renderResult.targetDur });
  check('resolution is 1280x720', renderResult.probe.w === 1280 && renderResult.probe.h === 720, [renderResult.probe.w, renderResult.probe.h]);
  check('faster than real time', renderResult.renderSeconds < renderResult.targetDur, { render: renderResult.renderSeconds, video: renderResult.targetDur });

  console.log('\n== 6. MediaRecorder compat path ==');
  const compat = await page.evaluate(async (script) => {
    const spec = CFX.director.build({ title: 'Compat', script: script, fps: 30, quality: '480p', durationTarget: 6, language: 'en', mood: 'chill' });
    const canvas = document.createElement('canvas');
    canvas.width = spec.width; canvas.height = spec.height;
    const renderer = CFX.engine.createRenderer(canvas, spec);
    const res = await CFX.encode.render({
      renderer, canvas, spec, audioBuffer: null, fps: spec.fps,
      width: spec.width, height: spec.height, engine: 'compat'
    });
    return { mode: res.mode, mime: res.mime, ext: res.ext, size: res.blob.size, dur: +res.duration.toFixed(2) };
  }, SCRIPT);
  console.log('  compat:', JSON.stringify(compat));
  check('compat path produced a file', compat.size > 8000 && (compat.ext === 'mp4' || compat.ext === 'webm'), compat);

  console.log('\n== 7. publish kit ==');
  const kit = await page.evaluate(async (script) => {
    const spec = CFX.director.build({
      title: 'Browser video, explained', script: script, fps: 30, quality: '720p',
      durationTarget: 50, language: 'en', watermark: '@cutfree'
    });
    const meta = CFX.director.metadata(spec, { privacyStatus: 'private', scheduleStart: '2026-10-01', atHourUtc: 12 });
    const thumb = await CFX.publish.thumbnailBlob(spec, spec.scenes[0].dur * 0.6, { width: 1280, height: 720 });
    const files = CFX.publish.packFiles(spec, meta, [
      { name: 'video.webm', blob: new Blob([new Uint8Array(10)]) },
      { name: 'thumbnail.png', blob: thumb.blob }
    ]);
    const animHtml = await CFX.publish.animationHtml(spec, meta);
    const playerHtml = CFX.publish.videoPlayerHtml(meta, { videoName: 'video.webm', duration: meta.durationSeconds });
    return {
      thumbSize: thumb.blob.size, thumbType: thumb.blob.type,
      title: meta.title, descLines: meta.description.split('\n').length,
      chapters: meta.chapters.length, tags: meta.tags.length,
      publishAt: meta.publishAt, privacy: meta.privacyStatus,
      files: files.map(f => f.name),
      animHasEngine: animHtml.indexOf('createRenderer') > -1 && animHtml.indexOf('__SPEC__') > -1,
      animSize: animHtml.length,
      playerHasVideo: playerHtml.indexOf('<video') > -1 && playerHtml.indexOf('video.webm') > -1
    };
  }, SCRIPT);
  console.log('  kit:', JSON.stringify(kit));
  check('thumbnail rendered as PNG', kit.thumbType === 'image/png' && kit.thumbSize > 20000, { type: kit.thumbType, size: kit.thumbSize });
  check('metadata has title/description/tags', kit.title.length > 3 && kit.descLines > 6 && kit.tags >= 5, { tags: kit.tags, lines: kit.descLines });
  check('chapters generated for long videos', kit.chapters >= 3, kit.chapters);
  check('schedule produced an ISO publishAt', /^\d{4}-\d{2}-\d{2}T/.test(kit.publishAt || ''), kit.publishAt);
  check('pack contains every asset', kit.files.indexOf('metadata.json') > -1 && kit.files.indexOf('player.html') > -1 &&
    kit.files.indexOf('descriptions.txt') > -1 && kit.files.indexOf('thumbnail.png') > -1, kit.files);
  check('living HTML embeds the engine + spec', kit.animHasEngine, { size: kit.animSize });
  check('video player page references the file', kit.playerHasVideo);

  console.log('\n== 8. UI flow (queue a batch) ==');
  await page.fill('#fTitle', '');
  await page.fill('#fScript',
    'First video title\nA short beat about the first topic.\n\n- point one\n- point two\n\n---\n\nSecond video title\nA short beat about the second topic.\n\n- alpha\n- beta');
  await page.fill('#fDuration', '8');
  await page.click('#btnQueue');
  await page.waitForFunction(() => document.querySelectorAll('#queue li').length >= 2, null, { timeout: 180000 });
  const queueInfo = await page.evaluate(() => Array.prototype.map.call(document.querySelectorAll('#queue li'), li => ({
    title: li.querySelector('.q-name').textContent,
    meta: li.querySelector('.q-status.meta').textContent,
    actions: li.querySelectorAll('.q-actions .btn').length
  })));
  console.log('  queue:', JSON.stringify(queueInfo));
  check('batch queued two videos', queueInfo.length === 2, queueInfo.length);
  check('queue entries carry size + duration + actions', /MB|KB/.test(queueInfo[0].meta) && queueInfo[0].actions >= 3, queueInfo[0]);

  console.log('\n== 8b. living HTML export plays on its own ==');
  const livingPath = path.join(require('os').tmpdir(), 'cutfree-living-' + Date.now() + '.html');
  const livingHtml = await page.evaluate(async () => {
    const spec = CFX.director.build({
      title: 'Living HTML', script: 'Living HTML demo\nThis page animates itself with no video file.\n\n- no encoder\n- any resolution\n- music included\n\nDone.', fps: 30, quality: '720p', durationTarget: 8, language: 'en', mood: 'tech', theme: 'cyber'
    });
    return await CFX.publish.animationHtml(spec, CFX.director.metadata(spec, {}));
  });
  fs.writeFileSync(livingPath, livingHtml);
  const living = await ctx.newPage();
  const livingErrors = [];
  living.on('pageerror', e => livingErrors.push(e.message));
  await living.goto('file://' + livingPath);
  await living.waitForTimeout(700);
  const firstPaint = await living.evaluate(() => {
    const c = document.getElementById('c');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let s = 0, n = 0;
    for (let i = 0; i < d.length; i += 4000) { s += d[i] + d[i + 1] + d[i + 2]; n++; }
    return { lum: Math.round(s / n / 3), size: c.width + 'x' + c.height };
  });
  await living.click('#p');
  await living.waitForTimeout(2000);
  const livingPlaying = await living.evaluate(() => ({
    time: document.getElementById('t').textContent,
    music: document.getElementById('m').textContent
  }));
  console.log('  living html:', livingHtml.length, 'bytes ·', JSON.stringify({ firstPaint, playing: livingPlaying }));
  check('living HTML loads from file:// and paints', firstPaint.lum > 5 && firstPaint.size === '1280x720', firstPaint);
  check('living HTML animates itself when played', /\d+\.\ds \/ \d+/.test(livingPlaying.time) && parseFloat(livingPlaying.time) > 0.5, livingPlaying);
  check('living HTML has the generative soundtrack wired', /music: on/.test(livingPlaying.music), livingPlaying.music);
  check('living HTML has no runtime errors', livingErrors.length === 0, livingErrors.slice(0, 3));
  await living.close();
  fs.unlinkSync(livingPath);

  console.log('\n== 9. preview transport ==');
  await page.click('#btnBuild');
  await page.waitForFunction(() => document.querySelectorAll('.scene-chip').length > 0, null, { timeout: 60000 });
  await page.click('#btnPlay');
  await page.waitForTimeout(1400);
  const playing = await page.evaluate(() => ({ btn: document.getElementById('btnPlay').textContent, time: document.getElementById('timeLabel').textContent }));
  await page.click('#btnPlay');
  console.log('  transport:', JSON.stringify(playing));
  check('preview plays and advances the clock', playing.btn.indexOf('⏸') > -1, playing);

  console.log('\n== 10. errors ==');
  const realErrors = errors.filter(e => !/favicon|Autoplay|play\(\) request/i.test(e));
  check('no runtime errors during the whole flow', realErrors.length === 0, realErrors.slice(0, 5));

  console.log('\n' + (failures === 0 ? '✅ ALL STUDIO CHECKS PASSED' : '❌ ' + failures + ' CHECK(S) FAILED'));
  await browser.close();
  server.close();
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('TEST CRASHED:', e); process.exit(2); });
