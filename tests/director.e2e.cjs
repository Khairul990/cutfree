/**
 * CutFree Phase 2 — deterministic Auto-Director / motion / timeline tests.
 * Run: npx tsx tests/director.e2e.cjs
 */
let checks = 0, failures = 0;
function check(name, ok, extra) {
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (extra !== undefined ? ' → ' + JSON.stringify(extra).slice(0, 220) : ''));
  checks++; if (!ok) failures++;
}

async function run() {
  console.log('\n== Phase 2 Auto-Director (deterministic, no AI) ==\n');
  const time = await import('../src/time.ts');
  const easing = await import('../src/motion/easing.ts');
  const kf = await import('../src/motion/keyframes.ts');
  const presets = await import('../src/motion/presets.ts');
  const parser = await import('../src/director/scriptParser.ts');
  const beats = await import('../src/director/storyBeats.ts');
  const director = await import('../src/director/autoDirector.ts');
  const timeline = await import('../src/director/timeline.ts');
  const history = await import('../src/director/history.ts');
  const validator = await import('../src/brain/validator.ts');
  const normalizer = await import('../src/brain/normalizer.ts');

  console.log('-- 1. Time utils --');
  check('secondsToFrame 1s@30', time.secondsToFrame(1, 30) === 30);
  check('frameToSeconds 30@30', Math.abs(time.frameToSeconds(30, 30) - 1) < 1e-9);
  check('clampTime', time.clampTime(-1, 0, 10) === 0 && time.clampTime(99, 0, 10) === 10);
  const nr = time.normalizeTimeRange(-2, 5, 4);
  check('normalizeTimeRange', nr.start === 0 && nr.end === 4 && Math.abs(nr.duration - 4) < 1e-9);
  check('durationFromRange', time.durationFromRange(2, 5) === 3);
  check('snapTime', time.snapTime(1.02, [0, 1, 2], 0.05) === 1);
  check('snap disabled', time.snapTime(1.02, [0, 1, 2], 0.05, false) === 1.02);

  console.log('-- 2. Easing / keyframes --');
  check('linear 0.5', Math.abs(easing.applyEasing('linear', 0.5) - 0.5) < 1e-9);
  check('easeOut endpoints', easing.applyEasing('easeOut', 0) === 0 && easing.applyEasing('easeOut', 1) === 1);
  ['easeIn', 'easeInOut', 'smooth', 'back', 'elastic'].forEach((n) => {
    check(n + ' endpoints', easing.applyEasing(n, 0) === 0 && Math.abs(easing.applyEasing(n, 1) - 1) < 1e-6);
  });
  const sampled = kf.sampleKeyframes([{ time: 0, value: 0, easing: 'linear' }, { time: 1, value: 10, easing: 'linear' }], 0.5);
  check('keyframe lerp', Math.abs(sampled - 5) < 1e-9);
  check('invalid keyframes rejected', kf.validateKeyframes([]).ok === false);

  console.log('-- 3. Camera / text / character presets --');
  const cam = presets.cameraAt('slow_zoom_in', 1);
  check('slow_zoom_in zooms in', cam.zoom > 1.05);
  const cam0 = presets.cameraAt('static', 0.5);
  check('static zoom ~1', Math.abs(cam0.zoom - 1) < 1e-6);
  const ta = presets.textAnimAt('slide_up', 0);
  check('slide_up starts offset', ta.ty > 0 && ta.opacity < 0.2);
  const ch = presets.characterAt('enter', 'surprised', 0);
  check('character enter starts transparent', ch.opacity < 0.2);

  console.log('-- 4. Script parser --');
  const bn = parser.parseScript('তুমি কি জানো দরজার ওপাশে কী ছিল?\n\nএকদা এক গ্রামে সালমান থাকত।\n- এক\n- দুই\n- তিন\n\n"ধৈর্য ধরো।" — বাবা\n\nসাবস্ক্রাইব করুন!');
  check('bn language', bn.language === 'bn');
  check('question detected', bn.lines.some((l) => l.isQuestion));
  check('bullets grouped', bn.blocks.some((b) => b.kind === 'bullets'));
  const en = parser.parseScript('Did you know this trick?\n\nOnce there was a city.\nHello world this is a longer explanatory paragraph about productivity.');
  check('en language', en.language === 'en');
  check('empty script still parses', parser.parseScript('').blocks.length === 0);

  console.log('-- 5. Story beats --');
  const storyBeats = beats.detectStoryBeats(bn);
  check('beats count = blocks', storyBeats.length === bn.blocks.filter((b) => b.text.trim()).length);
  check('first is hook or intro', ['hook', 'intro', 'setup'].includes(storyBeats[0].type), storyBeats[0].type);
  check('cta or ending present', storyBeats.some((b) => b.type === 'cta' || b.type === 'ending'), storyBeats.map((b) => b.type));

  console.log('-- 6. Auto Create Video --');
  const mixed = director.autoCreateVideo({
    script: 'তুমি কি জানো দরজার ওপাশে কী ছিল?\n\nসালমান একদিন দরজা খুলল।\n\nহঠাৎ সবকিছু বদলে গেল।\n\nসাবস্ক্রাইব করুন!',
    language: 'bn',
  });
  check('autoCreate valid status', mixed.status === 'complete', mixed.warnings.slice(0, 3));
  check('scenes generated', mixed.blueprint.scenes.length >= 3, mixed.blueprint.scenes.length);
  check('cameras assigned', mixed.blueprint.scenes.every((s) => !s.camera || presets.isCameraPreset(s.camera) || s.camera === 'static'));
  const val = validator.validateBlueprintJson({ schemaVersion: '2.0.0', blueprint: mixed.blueprint });
  check('validator accepts directed blueprint', val.valid, val);

  const empty = director.autoCreateVideo({ script: '' });
  check('empty script handled', empty.blueprint.scenes.length >= 1 && empty.blueprint.duration > 0);

  const noAudio = director.autoCreateVideo({ script: 'Hello world.\n\nThis is english exposition.' });
  check('english text', noAudio.blueprint.meta.language === 'en');

  console.log('-- 7. Timeline continuity --');
  const tl = timeline.specToTimeline(mixed.blueprint);
  const cont = timeline.timelineContinuity(tl);
  check('no gaps/overlaps', cont.ok, cont);
  check('8 tracks exist', Object.keys(tl.tracks).length === 8);

  console.log('-- 8. Long 341.89s project --');
  const segs = [];
  let t = 0;
  const lines = [
    'বন্ধ দরজার ওপাশে কী ছিল?',
    'একটি ইসলামিক শিক্ষামূলক গল্প।',
    'বিসমিল্লাহির রাহমানির রাহিম।',
    'সালমান গ্রামে থাকত।',
    'একদিন সে দরজা খুলল।',
    'অন্ধকারে কিছু যেন নড়ল।',
    'হঠাৎ আলো এল।',
    'সে শিখল ধৈর্যের মূল্য।',
    'আল্লাহর উপর ভরসা রাখো।',
    'সাবস্ক্রাইব করুন।',
  ];
  while (t < 341.89) {
    const text = lines[segs.length % lines.length] + ' #' + segs.length;
    segs.push({ time: t, text });
    t += 341.89 / 80;
  }
  segs[segs.length - 1].time = Math.min(segs[segs.length - 1].time, 341.89 - 0.5);
  const long = director.autoCreateVideo({
    script: segs.map((s) => s.text).join('\n'),
    language: 'bn',
    audioDuration: 341.89,
    segments: segs,
  });
  check('long duration ~341.89', Math.abs(long.blueprint.duration - 341.89) < 0.2, long.blueprint.duration);
  check('not clamped to 30s', long.blueprint.duration > 300);
  const longCont = timeline.timelineContinuity(timeline.specToTimeline(long.blueprint));
  check('long timeline continuous', longCont.ok, longCont);
  const longVal = validator.validateBlueprintJson({ blueprint: long.blueprint });
  check('long blueprint valid', longVal.valid, longVal.errors);
  const lastEnd = long.blueprint.scenes.reduce((a, s) => a + s.dur, 0);
  check('scenes cover duration', Math.abs(lastEnd - long.blueprint.duration) < 0.05, { lastEnd, d: long.blueprint.duration });
  check('captions inside duration', (long.blueprint.captions || []).every((c) => c.end <= long.blueprint.duration + 0.05));

  console.log('-- 9. History undo/redo --');
  const h = new history.HistoryStack();
  h.seed({ n: 1 });
  h.push({ n: 2 });
  check('undo', h.undo().n === 1);
  check('redo', h.redo().n === 2);

  console.log('-- 10. No AI dependency in director --');
  const src = await import('fs');
  const dirFiles = src.readdirSync('src/director');
  let aiHits = 0;
  for (const f of dirFiles) {
    const body = src.readFileSync('src/director/' + f, 'utf8');
    if (/ollama|openai|anthropic|whisper|claude api/i.test(body)) aiHits++;
  }
  check('director folder has no AI providers', aiHits === 0, { dirFiles, aiHits });

  console.log(`\n=== Director tests: ${checks - failures}/${checks} passed ===`);
  if (failures) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
