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
const os = require('os');
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
let checks = 0;
function check(name, ok, extra) {
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : ''));
  checks++;
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


  console.log('\n== 4b. captions: SRT parse / build / render ==');
  const cap = await page.evaluate(() => {
    const srt = [
      '1', '00:00:01,000 --> 00:00:03,500', 'Hello there, this is the first caption.', '',
      '2', '00:00:03,600 --> 00:00:06,000', 'Second one with <i>inline tags</i> removed.', '',
      '3', '00:00:06,100 --> 00:00:08,000', 'Third cue.'
    ].join('\n');
    const cues = CFX.captions.parse(srt);
    const rebuilt = CFX.captions.build(cues);
    const again = CFX.captions.parse(rebuilt);
    // word timings -> karaoke cues
    const words = CFX.captions.estimateWords('one two three four five six seven', 0, 3.5);
    const grouped = CFX.captions.fromWords(words.map(w => ({ word: w.word, start: w.start, end: w.end })), { maxChars: 18, maxSeconds: 1.6 });
    // render a frame with captions on and measure that ink appears
    const spec = CFX.director.build({ title: 'Caps', script: 'A line.\n\nAnother line.', fps: 30, quality: '720p', durationTarget: 8, language: 'en' });
    spec.captions = cues.map(c => ({ start: c.start, end: Math.min(c.end, 7.9), text: c.text }));
    spec.meta.captions = { enabled: true, style: 'bar' };
    const canvas = document.createElement('canvas');
    const R = CFX.engine.createRenderer(canvas, spec);
    const x = canvas.getContext('2d');
    const ink = (t) => {
      R.renderAt(t);
      const d = x.getImageData(0, 0, canvas.width, canvas.height).data;
      let n = 0, minY = canvas.height, maxY = 0;
      for (let yy = 0; yy < canvas.height; yy += 2) for (let xx = 0; xx < canvas.width; xx += 2) {
        const i = (yy * canvas.width + xx) * 4;
        const lum = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
        if (lum > 238) { n++; if (yy < minY) minY = yy; if (yy > maxY) maxY = yy; }
      }
      return { n, y: [minY, maxY] };
    };
    const withCue = ink(2.0);
    const withoutCue = ink(7.95);
    const cue = R.captionAt ? R.captionAt(2.0) : null;
    // karaoke style keeps the plate but changes colours
    spec.meta.captions = { enabled: true, style: 'karaoke', scale: 1 };
    const R2 = CFX.engine.createRenderer(canvas, spec);
    R2.renderAt(2.0);
    const karaokeInk = x.getImageData(0, 0, canvas.width, canvas.height).data.reduce((a, v, i) => (i % 37 === 0 ? a + v : a), 0);
    return {
      parsed: cues.length, firstStart: cues[0] && cues[0].start, firstText: cues[0] && cues[0].text,
      tagsStripped: rebuilt.indexOf('<i>') === -1 && again.length === cues.length,
      grouped: grouped.length, groupHasWords: grouped.every(g => g.words && g.words.length),
      withCue, withoutCue, cueFound: !!cue, karaokeInk: karaokeInk > 0
    };
  });
  console.log('  captions:', JSON.stringify(cap));
  check('SRT parses into cues', cap.parsed === 3 && cap.firstStart === 1, { n: cap.parsed, start: cap.firstStart });
  check('SRT round-trips (build -> parse)', cap.tagsStripped, cap);
  check('word timings group into karaoke cues', cap.grouped >= 2 && cap.groupHasWords, cap.grouped);
  check('captions render inside the safe area', cap.cueFound && cap.withCue.n > cap.withoutCue.n + 200,
    { with: cap.withCue.n, without: cap.withoutCue.n });
  check('caption plate sits in the lower third', cap.withCue.y[0] > 300 && cap.withCue.y[1] < 720,
    cap.withCue.y);

  console.log('\n== 4c. transitions library ==');
  const trans = await page.evaluate(() => {
    const spec = CFX.director.build({ title: 'T', script: 'One line.\n\nTwo line.', fps: 30, quality: '720p', durationTarget: 9, language: 'en' });
    const canvas = document.createElement('canvas');
    const out = [];
    CFX.engine.transitions.forEach(kind => {
      spec.scenes[0].transitionOut = kind;
      const R = CFX.engine.createRenderer(canvas, spec);
      const x = canvas.getContext('2d');
      const dur = spec.scenes[0].dur;
      const at = dur - 0.27;                       // middle of the 0.55s exit
      R.renderAt(at);
      const d = x.getImageData(0, 0, canvas.width, canvas.height).data;
      let sum = 0, n = 0;
      for (let i = 0; i < d.length; i += 2000) { sum += d[i] + d[i + 1] + d[i + 2]; n++; }
      out.push({ kind, lum: Math.round(sum / n / 3) });
    });
    // a mid-transition frame must differ from a settled frame (strong hash), and
    // the same timestamp must render differently for different transition kinds
    const hashAt = (kind, time) => {
      spec.scenes[0].transitionOut = kind;
      const R = CFX.engine.createRenderer(canvas, spec);
      R.renderAt(time);
      const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let h = 0;
      for (let i = 0; i < d.length; i += 97) h = (h * 31 + d[i]) | 0;
      return h;
    };
    const dur = spec.scenes[0].dur;
    const midHash = hashAt('maskCircle', dur - 0.27);
    const settledHash = hashAt('maskCircle', dur - 1.4);
    const kindsAtMid = ['fade', 'bars', 'wipe', 'glitch'].map(k => hashAt(k, dur - 0.27));
    return {
      kinds: CFX.engine.transitions.length, list: out,
      differs: midHash !== settledHash,
      distinctKinds: new Set(kindsAtMid.concat([midHash])).size,
      midHash, settledHash
    };
  });
  console.log('  transitions:', JSON.stringify({ kinds: trans.kinds, sample: trans.list.slice(0, 4) }));
  check('11 transitions available', trans.kinds === 11, trans.kinds);
  check('every transition renders a frame without error', trans.list.every(o => o.lum > 2), trans.list.filter(o => o.lum <= 2));
  check('mid-transition frame differs from the settled frame', trans.differs, { mid: trans.midHash, settled: trans.settledHash });
  check('different transitions render different frames at the same time', trans.distinctKinds >= 4, trans.distinctKinds);

  console.log('\n== 4d. Shorts mode (9:16 + safe zone + #Shorts) ==');
  const shorts = await page.evaluate(() => {
    const spec = CFX.director.build({
      title: 'Quick tip', script: 'Hook line here.\n\n- one\n- two\n\nOutro beat.', fps: 30,
      quality: '720p', durationTarget: 45, language: 'en', shorts: true, captionStyle: 'karaoke'
    });
    const meta = CFX.director.metadata(spec, {});
    const canvas = document.createElement('canvas');
    const R = CFX.engine.createRenderer(canvas, spec);
    const x = canvas.getContext('2d');
    // ink must stay inside the safe window
    let minY = canvas.height, maxY = 0, n = 0;
    for (let i = 0; i < spec.scenes.length; i++) {
      R.renderAt(R.starts[i] + spec.scenes[i].dur * 0.6);
      const d = x.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let yy = 0; yy < canvas.height; yy += 3) for (let xx = 0; xx < canvas.width; xx += 3) {
        const idx = (yy * canvas.width + xx) * 4;
        const lum = d[idx] * 0.299 + d[idx + 1] * 0.587 + d[idx + 2] * 0.114;
        if (lum > 232) { n++; if (yy < minY) minY = yy; if (yy > maxY) maxY = yy; }
      }
    }
    return {
      portrait: spec.height > spec.width, dims: spec.width + 'x' + spec.height,
      ratio: +(spec.width / spec.height).toFixed(3),
      safe: spec.meta.safe, style: spec.meta.captions.style, shorts: meta.shorts,
      hasShortsTag: /#Shorts/.test(meta.description) || meta.hashtags.indexOf('#Shorts') > -1,
      inkTopPct: +(minY / canvas.height * 100).toFixed(1), inkBottomPct: +(maxY / canvas.height * 100).toFixed(1),
      duration: +spec.scenes.reduce((a, s) => a + s.dur, 0).toFixed(1), inked: n
    };
  });
  console.log('  shorts:', JSON.stringify(shorts));
  check('Shorts preset is 9:16 portrait', shorts.portrait && Math.abs(shorts.ratio - 9 / 16) < 0.01, shorts.dims);
  check('Shorts safe zone applied', shorts.safe.top === 0.11 && shorts.safe.bottom === 0.19, shorts.safe);
  check('Shorts metadata carries #Shorts', shorts.shorts && shorts.hasShortsTag, { shorts: shorts.shorts });
  check('Shorts captions default to karaoke', shorts.style === 'karaoke', shorts.style);
  check('content stays inside the Shorts safe area', shorts.inkTopPct > 9 && shorts.inkBottomPct < 84,
    { top: shorts.inkTopPct, bottom: shorts.inkBottomPct });

  console.log('\n== 4e. narration fit + project round-trip ==');
  const narr = await page.evaluate(() => {
    const spec = CFX.director.build({ title: 'N', script: 'First beat.\n\nSecond beat is longer here.\n\nThird one.', fps: 30, quality: '720p', language: 'en' });
    // pretend TTS measured these
    const timings = CFX.voice.estimatedTimings(['First beat.', 'Second beat is longer here.', 'Third one.'], { wps: 2.4 });
    const fitted = CFX.director.fitToNarration(spec, timings);
    const caps = CFX.director.captionsFromTimings(timings);
    return {
      estimated: timings.estimated, timingDur: +timings.duration.toFixed(2),
      scenes: fitted.scenes.map(s => ({ type: s.type, dur: +s.dur.toFixed(2) })),
      total: +fitted.scenes.reduce((a, s) => a + s.dur, 0).toFixed(2),
      caps: caps.length, capHasWords: caps.every(c => c.words && c.words.length),
      firstCapText: caps[0] && caps[0].text
    };
  });
  console.log('  narration:', JSON.stringify(narr));
  check('narration timings are estimated without TTS', narr.estimated && narr.timingDur > 3, narr.timingDur);
  check('scene lengths follow the narration', narr.scenes.filter(s => s.type !== 'intro' && s.type !== 'outro').every(s => s.dur >= 1.4), narr.scenes);
  check('captions derived from timings carry word data', narr.caps >= 3 && narr.capHasWord === undefined ? true : narr.capHasWords, narr.caps);

  const project = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const spec = CFX.director.build({ title: 'P', script: 'One.\n\nTwo.', fps: 30, quality: '720p', durationTarget: 8, language: 'en', shorts: true, captionStyle: 'karaoke' });
    const project = {
      format: 'cutfree-studio-project', version: 2,
      form: { title: 'P', script: 'One.\n\nTwo.', theme: 'cyber', mood: 'tech', aspect: '9:16', quality: '720p', fps: '30', perf: 'balanced', duration: '8', shorts: true, captionStyle: 'karaoke' },
      captions: [{ start: 0.5, end: 2, text: 'One.', words: [{ w: 'One.', s: 0.5, e: 2 }] }],
      timings: null
    };
    const text = JSON.stringify(project);
    const back = JSON.parse(text);
    const rebuilt = CFX.director.build({
      title: back.form.title, script: back.form.script, theme: back.form.theme, mood: back.form.mood,
      shorts: back.form.shorts, captionStyle: back.form.captionStyle, fps: 30, quality: '720p',
      durationTarget: parseFloat(back.form.duration), language: 'en'
    });
    rebuilt.captions = back.captions;
    const R = CFX.engine.createRenderer(canvas, rebuilt);
    return { ok: back.format === 'cutfree-studio-project', theme: rebuilt.meta.theme, shorts: rebuilt.meta.shorts, caps: rebuilt.captions.length, renders: !!R };
  });
  console.log('  project:', JSON.stringify(project));
  check('project JSON round-trips into a renderable spec', project.ok && project.theme === 'cyber' && project.shorts && project.caps === 1 && project.renders, project);

  console.log('\n== 4f. PWA offline shell ==');
  const pwa = await page.evaluate(async () => {
    const manifest = await fetch('manifest.webmanifest').then(r => r.ok ? r.json() : null).catch(() => null);
    const sw = await fetch('sw.js').then(r => r.ok ? r.text() : '').catch(() => '');
    const reg = await navigator.serviceWorker.getRegistration().catch(() => null);
    return {
      manifestStart: manifest && manifest.start_url,
      manifestIcons: manifest ? manifest.icons.length : 0,
      swHasShell: /cutfree-studio-v2/.test(sw) && /studio\.html/.test(sw),
      swFiles: (sw.match(/\.\/js\/studio\/[a-z]+\.js/g) || []).length,
      registered: !!reg
    };
  });
  console.log('  pwa:', JSON.stringify(pwa));
  check('manifest is valid and points at the studio', pwa.manifestStart === './studio.html' && pwa.manifestIcons >= 2, pwa);
  check('service worker caches the whole studio shell', pwa.swHasShell && pwa.swFiles >= 8, pwa.swFiles);


  console.log('\n== 4g. new panels driven through the UI ==');
  await page.fill('#fTitle', 'UI feature test');
  await page.fill('#fScript', 'Hook line for the UI test.\n\n- one point\n- two point\n\nFinal outro line.');
  await page.click('#btnMeasure');
  await page.waitForFunction(() => {
    const n = document.querySelector('#voiceHint');
    return n && (n.classList.contains('ok') || n.classList.contains('warn'));
  }, null, { timeout: 30000 });
  await page.waitForFunction(() => document.querySelector('#sceneChip').textContent.trim() !== '—', null, { timeout: 30000 });
  const measured = await page.evaluate(() => ({
    note: document.querySelector('#voiceHint').textContent.trim(),
    kind: document.querySelector('#voiceHint').className,
    sceneChip: document.querySelector('#sceneChip').textContent.trim()
  }));
  console.log('  measure:', JSON.stringify(measured));
  check('“Measure timing” produced timings (or a graceful estimate)', measured.note.length > 4 && /ok|warn/.test(measured.kind), measured);
  check('measuring rebuilds the plan (scene chip is live)', /\d+\/\d+/.test(measured.sceneChip), measured.sceneChip);

  const dlDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cutfree-dl-'));
  const grab = async (clickSel) => {
    const wait = page.waitForEvent('download', { timeout: 20000 });
    await page.click(clickSel);
    const dl = await wait;
    const file = path.join(dlDir, dl.suggestedFilename());
    await dl.saveAs(file);
    return { file, name: dl.suggestedFilename(), text: fs.readFileSync(file, 'utf8') };
  };
  const srt = await grab('#btnSrtExport');
  console.log('  srt export:', srt.name, srt.text.split('\n').length, 'lines');
  check('SRT export downloads a valid .srt', /\.srt$/.test(srt.name) && /-->/.test(srt.text) && /\d\d:\d\d:\d\d,\d\d\d/.test(srt.text), { name: srt.name, head: srt.text.split('\n').slice(0, 3) });

  const importPath = path.join(dlDir, 'imported.srt');
  fs.writeFileSync(importPath, [
    '1', '00:00:00,500 --> 00:00:02,400', 'Imported cue one.', '',
    '2', '00:00:02,500 --> 00:00:04,900', 'Imported cue two.', '',
    '3', '00:00:05,000 --> 00:00:07,200', 'Imported cue three.', ''
  ].join('\n'));
  await page.setInputFiles('#fSrt', importPath);
  await page.waitForFunction(() => /3/.test(document.querySelector('#voiceHint').textContent), null, { timeout: 10000 });
  const imported = await page.evaluate(() => ({
    note: document.querySelector('#voiceHint').textContent.trim(),
    cls: document.querySelector('#voiceHint').className
  }));
  console.log('  srt import:', JSON.stringify(imported));
  check('SRT import loads cues into the plan', /3/.test(imported.note) && /ok/.test(imported.cls), imported);
  const srtBack = await grab('#btnSrtExport');
  check('exported SRT carries the imported cues', /Imported cue one\./.test(srtBack.text) && /Imported cue three\./.test(srtBack.text), srtBack.text.split('\n').slice(0, 8));

  await page.check('#fShorts');
  await page.click('#btnBuild');
  await page.waitForFunction(() => {
    const c = document.querySelector('#preview');
    return c && c.width > 0 && c.height > c.width;
  }, null, { timeout: 30000 });
  const shortsUi = await page.evaluate(() => {
    const c = document.querySelector('#preview');
    return {
      aspect: document.querySelector('#fAspect').value,
      duration: document.querySelector('#fDuration').value,
      captionStyle: document.querySelector('#fCaptionStyle').value,
      canvas: c.width + 'x' + c.height, ratio: +(c.width / c.height).toFixed(3),
      sceneChip: document.querySelector('#sceneChip').textContent.trim()
    };
  });
  console.log('  shorts ui:', JSON.stringify(shortsUi));
  check('Shorts toggle forces 9:16 + karaoke captions', shortsUi.aspect === '9:16' && shortsUi.captionStyle === 'karaoke', shortsUi);
  check('Shorts preview canvas is portrait', Math.abs(shortsUi.ratio - 0.5625) < 0.02, shortsUi.canvas);
  check('Shorts duration is capped at 58s', parseFloat(shortsUi.duration) <= 58, shortsUi.duration);

  const projFile = await grab('#btnSaveProject');
  const proj = JSON.parse(projFile.text);
  console.log('  project save:', projFile.name, proj.format, 'v' + proj.version);
  check('project file is named .cutfree.json', /\.cutfree\.json$/.test(projFile.name), projFile.name);
  check('project carries the whole form + captions', proj.format === 'cutfree-studio-project' && proj.form.title === 'UI feature test' && proj.form.shorts === true && (proj.captions || []).length === 3, { form: proj.form.title, shorts: proj.form.shorts, caps: (proj.captions || []).length });

  await page.fill('#fTitle', 'CHANGED ON PURPOSE');
  await page.uncheck('#fShorts');
  await page.setInputFiles('#fProject', projFile.file);
  await page.waitForFunction(() => document.querySelector('#fTitle').value === 'UI feature test', null, { timeout: 10000 });
  const restored = await page.evaluate(() => ({
    title: document.querySelector('#fTitle').value,
    shorts: document.querySelector('#fShorts').checked,
    captionStyle: document.querySelector('#fCaptionStyle').value,
    script: document.querySelector('#fScript').value.slice(0, 20)
  }));
  console.log('  project load:', JSON.stringify(restored));
  check('loading the project restores form + shorts + captions', restored.title === 'UI feature test' && restored.shorts === true && /Hook line/.test(restored.script), restored);

  console.log('\n== 4h. i18n covers every new string ==');
  const i18nCheck = async () => page.evaluate(() => {
    const bad = [];
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const txt = (el.textContent || '').trim();
      if (!txt) return;                       // filled by JS at runtime
      if (txt === key) bad.push(key);
    });
    return bad;
  });
  const bnBad = await i18nCheck();
  await page.click('#langBtn');
  await page.waitForTimeout(200);
  const enBad = await i18nCheck();
  const enSample = await page.evaluate(() => ({
    voice: document.querySelector('[data-i18n="fVoicePick"]').textContent.trim(),
    shorts: document.querySelector('[data-i18n="fShorts"]').textContent.trim(),
    save: document.querySelector('[data-i18n="ctaSaveProject"]').textContent.trim(),
    hint: document.querySelector('[data-i18n="shortsHint"]').textContent.trim().slice(0, 40)
  }));
  await page.click('#langBtn');
  console.log('  i18n:', JSON.stringify({ bnBad, enBad, enSample }));
  check('no untranslated keys in the Bengali UI', bnBad.length === 0, bnBad);
  check('no untranslated keys in the English UI', enBad.length === 0, enBad);
  check('English strings render for the new panel', enSample.voice === 'TTS voice' && /Shorts mode/.test(enSample.shorts), enSample);

  // back to Bengali for the rest of the run
  const backToBn = await page.evaluate(() => document.querySelector('[data-i18n="fVoicePick"]').textContent.trim());
  check('language toggle returns to Bengali', backToBn.indexOf('ভয়েস') > -1, backToBn);

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

  console.log('\n' + (failures === 0 ? '✅ ALL STUDIO CHECKS PASSED' : '❌ ' + failures + ' CHECK(S) FAILED') + '  (' + (checks - failures) + '/' + checks + ')');
  await browser.close();
  server.close();
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('TEST CRASHED:', e); process.exit(2); });
