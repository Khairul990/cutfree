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

  // the voice-over / subtitle / project panel, straight from the UI
  await page.evaluate(() => {
    document.querySelector('#fVoicePick').scrollIntoView({ block: 'center' });
  });
  await page.waitForTimeout(600);
  const panel = await page.locator('.panel-card').first().boundingBox();
  const vp = page.viewportSize();
  if (panel) {
    await page.screenshot({
      path: path.join(DOCS, 'studio-voice.png'),
      clip: {
        x: Math.max(0, panel.x), y: Math.max(0, panel.y),
        width: Math.min(panel.width, vp.width - Math.max(0, panel.x)),
        height: Math.min(panel.height, vp.height - Math.max(0, panel.y))
      }
    });
  }

  // Shorts mode: 9:16 preview with karaoke captions inside the safe zone
  await page.check('#fShorts');
  await page.evaluate(async () => {
    // give the preview something to say so the karaoke plate is visible
    const cues = [];
    let t = 0.4;
    'Shorts mode keeps every line inside the safe zone.'.split(' ').forEach(w => {
      cues.push({ start: t, end: t + 0.42, text: w, words: [{ w: w, s: t, e: t + 0.42 }] });
      t += 0.45;
    });
    const blob = new Blob([[
      '1', '00:00:00,400 --> 00:00:05,600', 'Shorts mode keeps every line inside the safe zone.', ''
    ].join('\n')], { type: 'text/plain' });
    const file = new File([blob], 'shorts.srt', { type: 'text/plain' });
    const dt = new DataTransfer();
    dt.items.add(file);
    const input = document.querySelector('#fSrt');
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(400);
  await page.click('#btnBuild');
  await page.waitForFunction(() => {
    const c = document.querySelector('#preview');
    return c && c.height > c.width;
  }, null, { timeout: 60000 });
  // park the playhead inside the first cue so the karaoke plate is on screen
  await page.evaluate(() => {
    const scrub = document.querySelector('#scrub');
    scrub.value = String(1000 * (1.3 / 12));            // ~1.3s of the whole video
    scrub.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => document.getElementById('workbench').scrollIntoView());
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(DOCS, 'studio-shorts.png') });


  // ---------------------------------------------------------------- story mode
  // 1. workbench with a tracked voice (waveform timeline + line chips)
  await page.goto(`http://127.0.0.1:${PORT}/studio.html`, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  const STORY = [
    'রাত তখন বারোটা। টুকটুক করে বৃষ্টি পড়ছিল টিনের চালে।',
    '',
    'শহরের সবচেয়ে পুরনো চায়ের দোকানে বসে ছিল সৌম্য। তার হাতে একটা ভাঁজ করা চিঠি।',
    '',
    'উপরের লাইনে লেখা ছিল শুধু একটা নাম — আর নিচে একটা তারিখ।',
    '',
    'চিঠিটা বিশ বছর পুরনো।',
    '',
    'সৌম্য ভাবল, আজ রাতেই উত্তরটা লিখবে।'
  ].join('\n');
  const wav = path.join(require('os').tmpdir(), 'cutfree-story-shot.wav');
  (() => {
    const SR = 48000;
    const blocks = STORY.split(/\n\s*\n+/).filter(Boolean);
    const parts = [];
    const sil = (d) => { for (let i = 0; i < Math.round(d * SR); i++) parts.push(0); };
    const burst = (d) => {
      for (let i = 0; i < Math.round(d * SR); i++) {
        const t = i / SR, f = 115 + 18 * Math.sin(2 * Math.PI * 4 * t);
        parts.push(0.3 * (Math.sin(2 * Math.PI * f * t) * .7 + Math.sin(4 * Math.PI * f * t) * .2) * (.5 + .5 * Math.abs(Math.sin(2 * Math.PI * 6 * t))));
      }
    };
    sil(1.2);
    blocks.forEach((b, i) => { burst(b.split(/\s+/).length * 0.4); sil(i === 1 ? 1.6 : 0.5); });
    sil(1.0);
    const buf = Buffer.alloc(44 + parts.length * 2);
    buf.write('RIFF', 0); buf.writeUInt32LE(36 + parts.length * 2, 4); buf.write('WAVE', 8);
    buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
    buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
    buf.write('data', 36); buf.writeUInt32LE(parts.length * 2, 40);
    parts.forEach((v, i) => buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v * 32767))), 44 + i * 2));
    fs.writeFileSync(wav, buf);
  })();
  await page.fill('#fTitle', 'বারোটা রাতের চিঠি');
  await page.fill('#fScript', STORY);
  await page.check('#fStory');
  await page.setInputFiles('#fVoice', wav);
  await page.waitForFunction(() => !document.querySelector('#alignWrap').hidden, null, { timeout: 60000 });
  await page.click('#btnBuild');
  await page.waitForFunction(() => document.querySelectorAll('.scene-chip').length > 0, null, { timeout: 90000 });
  await page.evaluate(() => {
    const scrub = document.querySelector('#scrub');
    scrub.value = '120';                       // land inside the second line
    scrub.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(700);
  await page.evaluate(() => document.querySelector('#alignWrap').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(DOCS, 'studio-story.png') });

  // 2. a montage of real story frames: title card, narration, beat card, end card
  const storyFrames = await page.evaluate(async (script) => {
    // reuse the tracked timeline that lives in the page
    const track = window.CFX ? null : null;
    const parts = [];
    // rebuild a matching "voice" so the shot is reproducible from the script alone
    const SR = 48000;
    const blocks = script.split(/\n\s*\n+/).filter(Boolean);
    const sil = (d) => { for (let i = 0; i < Math.round(d * SR); i++) parts.push(0); };
    const burst = (d) => {
      for (let i = 0; i < Math.round(d * SR); i++) {
        const t = i / SR, f = 115 + 18 * Math.sin(2 * Math.PI * 4 * t);
        parts.push(0.3 * (Math.sin(2 * Math.PI * f * t) * .7 + Math.sin(4 * Math.PI * f * t) * .2) * (.5 + .5 * Math.abs(Math.sin(2 * Math.PI * 6 * t))));
      }
    };
    sil(1.2);
    blocks.forEach((b, i) => { burst(b.split(/\s+/).length * 0.4); sil(i === 1 ? 1.6 : 0.5); });
    sil(1.0);
    const tracked = window.CFX.align.track(Float32Array.from(parts), script, { sampleRate: SR });
    const spec = window.CFX.story.plan({
      title: 'বারোটা রাতের চিঠি', script, track: tracked, language: 'bn',
      quality: '720p', theme: 'neonNoir', mood: 'cinematic', watermark: '@cutfree'
    });
    const canvas = document.createElement('canvas');
    const R = window.CFX.engine.createRenderer(canvas, spec);
    const wanted = ['storyTitle', 'story'];
    let acc = 0;
    const picks = [];
    spec.scenes.forEach((sc) => {
      const t = acc + sc.dur * (sc.type === 'storyBeat' ? 0.5 : 0.62);
      if (sc.type === 'storyTitle') picks.push(['title', t]);
      else if (sc.type === 'story' && picks.filter(x => x[0] === 'line').length < 2) picks.push(['line', t]);
      else if (sc.type === 'storyBeat') picks.push(['beat', t]);
      else if (sc.type === 'storyEnd') picks.push(['end', t]);
      acc += sc.dur;
    });
    const out = {};
    picks.slice(0, 4).forEach(([name, t]) => { R.renderAt(t); out[name] = canvas.toDataURL('image/png'); });
    return out;
  }, STORY);
  await page.setContent(`<body style="margin:0;background:#05070f;display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:8px">
    ${Object.entries(storyFrames).map(([k, v]) => `<img src="${v}" style="width:100%;display:block;border-radius:10px">`).join('')}
  </body>`, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  const montageBox = await page.evaluate(() => ({ w: document.body.scrollWidth, h: document.body.scrollHeight }));
  await page.setViewportSize({ width: Math.min(1600, montageBox.w), height: Math.min(1200, montageBox.h) });
  await page.screenshot({ path: path.join(DOCS, 'studio-story-frames.png') });
  console.log('  wrote docs/studio-story.png + docs/studio-story-frames.png');
  await page.goto(`http://127.0.0.1:${PORT}/studio.html`, { waitUntil: 'load' });

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
