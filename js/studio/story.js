/* ============================================================================
   CutFree Studio — story mode

   "Text + your voice in, a story video out."

   The alignment engine (align.js) has already told us which word is spoken when.
   The story director turns that timing into a *staged* video:

     title card  ─▶ kinetic narration lines (word-synced) ─▶ breath/beat cards
                 ─▶ quote & list scenes ─▶ end card

   Three things matter here:
     1. A line starts exactly when the narrator starts it (no guesswork), and a
        long pause becomes a beat card instead of dead air.
     2. Typography follows the voice — words pop in, the spoken word glows.
     3. Nothing depends on the network: no transcription API, no ASR service.
   ========================================================================== */
(function (w) {
  'use strict';

  var CFX = w.CFX = w.CFX || {};

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function round2(v) { return Math.round(v * 100) / 100; }

  function seedOf(str) {
    var h = 2166136261;
    var s = String(str || '');
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) || 12345;
  }

  var STOP = {
    bn: ['এবং', 'কিন্তু', 'তাই', 'আর', 'যে', 'সে', 'এই', 'ওই', 'একটা', 'একটি', 'করল', 'হলো', 'হল', 'না', 'কে', 'তার', 'আমি', 'আমরা', 'তুমি', 'আপনি', 'ছিল', 'করে'],
    en: ['and', 'but', 'so', 'the', 'a', 'an', 'of', 'to', 'in', 'is', 'was', 'it', 'that', 'this', 'he', 'she', 'they', 'we', 'you', 'for', 'on', 'with']
  };

  /* ------------------------------------------------------------- text tools */
  function sentences(text) {
    var out = String(text || '')
      .replace(/\s+/g, ' ')
      .match(/[^.!?।॥…]+[.!?।॥…]*/g);
    if (!out) return [];
    return out.map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function isQuote(line) {
    return /^["“'‘]/.test(line) || /^[—–-]\s?/.test(line) || /["”'’]\s*$/.test(line);
  }

  function isList(paragraph) {
    return /(^|\n)\s*(?:[-•*·]|\d+[.)])\s+/.test(String(paragraph || ''));
  }

  function listItems(paragraph) {
    return String(paragraph || '')
      .split(/\n/)
      .map(function (l) { return l.replace(/^\s*(?:[-•*·]|\d+[.)])\s*/, '').trim(); })
      .filter(Boolean);
  }

  function labelOf(text, maxWords) {
    var parts = String(text || '').split(/\s+/).filter(Boolean);
    var label = parts.slice(0, maxWords || 5).join(' ');
    return (parts.length > (maxWords || 5) ? label + '…' : label).slice(0, 60);
  }

  // Which words deserve the accent colour: the long, content-bearing ones.
  function emphasisFor(words, lang, limit) {
    var stop = STOP[lang === 'en' ? 'en' : 'bn'];
    var scored = [];
    words.forEach(function (wd, i) {
      var core = String(wd.core || wd.word || '').replace(/[^\p{L}\p{N}]/gu, '');
      if (core.length < 4) return;
      if (stop.indexOf(core.toLowerCase()) > -1) return;
      if (/\d/.test(core)) { scored.push({ i: i, score: 99 }); return; }
      scored.push({ i: i, score: core.length * (lang === 'en' ? 1 : 0.85) });
    });
    scored.sort(function (a, b) { return b.score - a.score || a.i - b.i; });
    var picked = scored.slice(0, limit || 2).map(function (s) { return s.i; });
    picked.sort(function (a, b) { return a - b; });
    return picked;
  }

  function pickStyle(kind, wordCount, index, wanted) {
    if (wanted && wanted !== 'auto') return wanted;
    if (kind === 'quote') return 'board';
    if (kind === 'list') return 'stack';
    if (wordCount <= 4) return index % 2 ? 'typewriter' : 'reveal';
    if (index % 4 === 3) return 'board';
    return 'reveal';
  }

  /* ------------------------------------------------------------------ plan */
  // input: {title, script, track|timings, kicker, endCard, cta, style, lang,
  //         theme, mood, aspect, quality, fps, perf, shorts, captionStyle,
  //         watermark, logoDataUrl, maxWordsPerScene, maxSceneSeconds}
  function plan(input) {
    input = input || {};
    var lang = input.language === 'en' || input.lang === 'en' ? 'en' : 'bn';
    var script = String(input.script || '');
    if (!script.trim()) return null;

    var tracked = input.track || (CFX.align ? CFX.align.proportional(script, { wps: Input_wps(input) }) : null);
    if (!tracked || !tracked.paragraphs || !tracked.paragraphs.length) return null;

    // dramatic pauses (a real breath in the recording) become their own beat card
    var markers = [];
    var phrases = tracked.phrases || [];
    for (var pi = 1; pi < phrases.length; pi++) {
      var g = phrases[pi].start - phrases[pi - 1].end;
      if (g >= (input.beatPauseSeconds == null ? 1.1 : input.beatPauseSeconds)) {
        markers.push({ t: phrases[pi - 1].end + g * 0.5, gap: g });
      }
    }

    var maxWords = input.maxWordsPerScene || (lang === 'en' ? 12 : 11);
    var maxSeconds = input.maxSceneSeconds || 5.2;
    var aspect = input.aspect || (input.shorts ? '9:16' : '16:9');
    var size = resolution(aspect, input.quality);
    var seed = input.seed == null ? seedOf(input.title + '|' + script) : input.seed;

    /* ---- 1. sentences → scenes, keeping the alignment of every word ------ */
    var body = [];      // {kind, text, items?, words[], srcStart, srcEnd, paraIndex}
    tracked.paragraphs.forEach(function (para) {
      var kind = isList(para.text) ? 'list' : isQuote(para.text) ? 'quote' : 'narration';
      var units = kind === 'list' ? listItems(para.text).map(function (t) { return { text: t }; })
        : sentences(para.text).map(function (t) { return { text: t }; });
      if (!units.length) units = [{ text: para.text }];

      // cut the paragraph's sentences wherever the narrator took a long pause
      var pieces = [];
      units.forEach(function (unit, ui) {
        var startIdx = units.slice(0, ui).reduce(function (n, u) {
          return n + (CFX.align ? CFX.align.words(u.text).length : u.text.split(/\s+/).length);
        }, 0);
        var cnt = CFX.align ? CFX.align.words(unit.text).length : unit.text.split(/\s+/).length;
        var slice = para.words.slice(startIdx, startIdx + cnt);
        var cur = { text: unit.text, words: [] };
        slice.forEach(function (wd) {
          if (cur.words.length) {
            var prev = cur.words[cur.words.length - 1];
            // (a) the marker sits in the silence between the two words, or
            // (b) the words live in different spoken phrases and the breath
            //     between those phrases is long enough to deserve a beat
            var crossed = markers.some(function (m) { return m.t > prev.end && m.t < wd.start; })
              || slotBreakIsLong(prev, wd, phrases);
            if (crossed) { pieces.push(cur); cur = { text: '', words: [] }; }
          }
          cur.words.push(wd);
        });
        if (cur.words.length) pieces.push(cur);
      });
      pieces.forEach(function (piece) {
        if (!piece.text) piece.text = piece.words.map(function (x) { return x.word; }).join(' ');
      });
      units = pieces.length ? pieces : units;

      var cursor = 0;                                  // index into para.words
      var current = null;
      units.forEach(function (unit) {
        var count = unit.words ? unit.words.length
          : (CFX.align ? CFX.align.words(unit.text).length : unit.text.split(/\s+/).length);
        var slice = unit.words && unit.words.length ? unit.words : para.words.slice(cursor, cursor + count);
        cursor += count;
        if (!slice.length) return;

        var start = slice[0].start;
        var end = slice[slice.length - 1].end;
        var canExtend = current &&
          (current.words.length + slice.length) <= maxWords &&
          (end - current.srcStart) <= maxSeconds;

        if (!canExtend) {
          current = {
            kind: kind, parts: [], words: [], srcStart: start, srcEnd: end,
            paraIndex: para.index, items: []
          };
          body.push(current);
        }
        current.parts.push(unit.text);
        if (kind === 'list' && unit.text) current.items.push(unit.text);
        current.words = current.words.concat(slice);
        current.srcEnd = end;
      });
    });

    if (!body.length) return null;

    /* ---- 2. audio timeline: title card, beats in the pauses, end card ---- */
    var leadIn = Math.max(0, tracked.paragraphs[0].start);
    var titleDur = clamp(leadIn + 0.15, 2.4, 4.6);
    var voiceStart = round2(titleDur - leadIn);         // voice is delayed to the card's end
    var lastWord = body[body.length - 1].words;
    var audioEnd = lastWord[lastWord.length - 1].end;
    var endDur = 2.9;

    /* ---- 2. video timeline ------------------------------------------------
       Video time is audio time shifted by `voiceStart`, with the title card at
       the head and the end card at the tail. Scenes are laid out back-to-back
       (the renderer plays them in order), so every scene length is derived from
       the audio timeline and any leftover air is handed to the scene before it —
       that is what keeps the typography glued to the narrator's voice. */
    var scenes = [];
    var shift = voiceStart;
    var lead = 0.20, trail = 0.30;
    var beatMin = input.beatPauseSeconds == null ? 0.9 : input.beatPauseSeconds;
    var maxBeat = 3.2;
    var beats = 0;
    var drifts = [];

    scenes.push({
      type: 'storyTitle', dur: titleDur, label: input.title || (lang === 'en' ? 'Story' : 'গল্প'),
      kicker: input.kicker || (lang === 'en' ? 'A story' : 'একটি গল্প'),
      title: input.title || (lang === 'en' ? 'Untitled story' : 'নামহীন গল্প'),
      subtitle: input.subtitle || labelOf(tracked.paragraphs[0].text, 8),
      srcStart: 0, srcEnd: titleDur
    });
    var prevEnd = titleDur;

    var videoStartOf = function (scene) { return scene.srcStart + shift - lead; };
    var desiredEndOf = function (scene) { return Math.max(scene.srcEnd + shift + trail, prevEnd + 0.55); };

    // 1. how each line wants to sit on the audio timeline
    var plan2 = body.map(function (scene, i) {
      var want = Math.max(prevEnd, videoStartOf(scene));
      var we = Math.max(want + 0.95, scene.srcEnd + shift + trail);
      var next = body[i + 1];
      var gap = next ? Math.max(want + 0.4, videoStartOf(next)) - we : 0;
      return { scene: scene, start: want, end: we, next: next, gap: gap, index: i };
    });

    // 2. fill the breaths: a beat card for a real pause, otherwise the previous
    //    line simply stays on screen through the short breath (so the timeline
    //    stays continuous and nothing can drift away from the voice)
    for (var bi = 0; bi < plan2.length; bi++) {
      var item = plan2[bi];
      var nextItem = plan2[bi + 1];
      item.end = Math.max(item.end, prevEnd);
      var limit = nextItem ? Math.max(item.start + 0.4, nextItem.start) : null;
      var room = limit == null ? 0 : limit - item.end;
      if (limit != null && room >= beatMin) {
        var beatDur = Math.min(room, maxBeat);
        item.end = limit - beatDur;
        item.beat = beatDur;
      } else if (limit != null) {
        item.end = limit;                       // absorb the breath
      }
      if (nextItem && nextItem.start < item.end) nextItem.start = item.end;
      prevEnd = item.end;
      drifts.push(Math.abs(item.start - videoStartOf(item.scene)));
    }

    // 3. paint them, inserting the beat cards
    var tailStart = Math.max(
      plan2.length ? plan2[plan2.length - 1].end : titleDur,
      audioEnd + shift + 0.42
    );
    if (plan2.length && plan2[plan2.length - 1].end < tailStart) {
      plan2[plan2.length - 1].end = tailStart;   // hold the last line instead of going black
      prevEnd = tailStart;
    }
    plan2.forEach(function (item) {
      var packed = packScene(item.scene, item.start, item.end, item.index, lang, input, shift);
      // the story line on screen already is the caption: burn-in bars are only
      // drawn when asked for (or when the user brought their own cues)
      var wantBars = input.captionBars == null ? !!input.captionCues : !!input.captionBars;
      if (!wantBars) packed.caption = false;
      scenes.push(packed);
      if (item.beat) {
        scenes.push({
          type: 'storyBeat', dur: round2(item.beat), srcStart: round2(item.end),
          srcEnd: round2(item.end + item.beat), text: ' ',
          label: lang === 'en' ? 'Beat' : 'বিরতি'
        });
        beats++;
      }
    });

    // 4. the end card closes the story (it starts after the last word, never before)
    scenes.push({
      type: 'storyEnd', dur: endDur, srcStart: round2(tailStart), srcEnd: round2(tailStart + endDur),
      label: lang === 'en' ? 'The end' : 'সমাপ্তি',
      title: input.endCard || (lang === 'en' ? 'The End' : 'সমাপ্ত'),
      cta: input.cta || (lang === 'en' ? 'Liked the story? Subscribe for the next one.'
        : 'গল্পটা ভালো লাগলে সাবস্ক্রাইব করে যান — পরের গল্পটা আসছে।')
    });

    /* ---- 3. spec --------------------------------------------------------- */
    var total = scenes.reduce(function (t, s) { return t + s.dur; }, 0);
    var captionStyle = input.captionStyle || (input.shorts ? 'karaoke' : 'karaoke');
    var cueOffset = voiceStart;

    var cues = (tracked.cues || []).map(function (c) {
      return {
        start: round2(c.start + cueOffset), end: round2(c.end + cueOffset), text: c.text,
        words: c.words ? c.words.map(function (wd) {
          return { w: wd.w, s: round2(wd.s + cueOffset), e: round2(wd.e + cueOffset) };
        }) : undefined
      };
    });
    // voice-tracked captions stay locked to the audio — clamping only
    if (CFX.captions && CFX.captions.clampTo && cues.length) cues = CFX.captions.clampTo(cues, total);

    var spec = {
      fps: input.fps || 30,
      width: size.width,
      height: size.height,
      scenes: scenes,
      captions: cues,
      meta: {
        story: true,
        title: input.title || (lang === 'en' ? 'Untitled story' : 'নামহীন গল্প'),
        kicker: input.kicker || (lang === 'en' ? 'A story' : 'একটি গল্প'),
        seed: seed,
        theme: input.theme || 'aurora',
        mood: input.mood || 'cinematic',
        language: lang,
        aspect: aspect,
        perf: input.perf || 'high',
        shorts: !!input.shorts,
        safe: input.shorts ? { top: 0.11, bottom: 0.19 } : { top: 0.05, bottom: 0.08 },
        textOffset: clamp(numOf(input.textOffset, 0), -1, 1.5),
        captions: {
          enabled: input.captions !== false, style: captionStyle,
          scale: input.shorts ? 1.1 : 1
        },
        storyStyle: input.style || 'auto',
        watermark: input.watermark || '',
        logoDataUrl: input.logoDataUrl || null,
        voiceStart: voiceStart,
        voiceDuration: round2(tracked.duration),
        estimated: !!tracked.estimated,
        phrases: (tracked.phrases || []).length,
        speechRatio: tracked.speechRatio,
        wordCount: tracked.words ? tracked.words.length : 0,
        beats: beats,
        drift: round2(drifts.length ? Math.max.apply(null, drifts) : 0),
        wordsPerSecond: tracked.duration > 0 ? round2((tracked.words || []).length / tracked.duration) : 0
      },
      energy: null
    };

    return spec;
  }

  function Input_wps(input) { return input && input.wps ? input.wps : 2.45; }

  // Two words sit in different phrases: is the breath between them a beat?
  function slotBreakIsLong(prev, wd, phrases) {
    if (!phrases || !phrases.length) return false;
    var a = prev.slot, b = wd.slot;
    if (a == null || b == null || a === b || a < 0 || b < 0) return false;
    if (!phrases[a] || !phrases[b]) return false;
    var gap = phrases[b].start - phrases[a].end;
    return gap >= 1.1;
  }

  // A body scene with scene-relative word timings (that is what the renderer
  // needs to pop each word exactly when it is spoken).
  function numOf(v, dflt) {
    var n = typeof v === 'number' ? v : parseFloat(v);
    return (isFinite(n)) ? n : dflt;
  }

  function packScene(scene, videoStart, videoEnd, index, lang, input, voiceShift) {
    var shift = (voiceShift || 0);
    // "text shift": nudge the typography against the voice without touching the
    // audio — negative means the words rise a moment *before* they are spoken
    var off = clamp(numOf(input && input.textOffset, 0), -1, 1.5);
    var dur = Math.max(1.15, round2(videoEnd - videoStart));
    var words = scene.words.map(function (wd) {
      var s = round2(clamp(wd.start + shift - videoStart + off, 0, Math.max(0, dur - 0.05)));
      var e = round2(clamp(wd.end + shift - videoStart + off, s + 0.05, dur));
      return { w: wd.word, core: wd.core, s: s, e: e };
    });
    var text = scene.parts.join(scene.kind === 'list' ? '\n' : ' ').trim();
    return {
      type: scene.kind === 'quote' ? 'storyQuote' : scene.kind === 'list' ? 'storyList' : 'story',
      dur: dur,
      text: text,
      items: scene.kind === 'list' ? scene.items : undefined,
      words: words,
      emphasis: emphasisFor(scene.words, lang, 2),
      style: pickStyle(scene.kind, scene.words.length, index, (input && input.style) || 'auto'),
      label: labelOf(text, 5),
      srcStart: round2(videoStart),
      srcEnd: round2(videoStart + dur),
      wordsPerSecond: dur > 0 ? round2(scene.words.length / dur) : 0
    };
  }

  function resolution(aspect, quality) {
    var q = quality || '1080p';
    var base = q === '720p' ? 720 : q === '480p' ? 480 : 1080;
    var ratio = aspect === '9:16' ? (9 / 16) : aspect === '1:1' ? 1 : aspect === '4:5' ? 0.8 : (16 / 9);
    var w, h;
    if (ratio >= 1) { h = base; w = Math.round(base * ratio); }
    else { w = base; h = Math.round(base / ratio); }
    var even = function (n) { return n % 2 ? n + 1 : n; };
    return { width: even(w), height: even(h) };
  }

  /* --------------------------------------------------------------- metadata */
  // Story-flavoured description: the story name, the opening lines, chapters at
  // every beat, plus the usual free hashtags.
  function metadata(spec, opts) {
    opts = opts || {};
    var bn = (spec.meta.language || 'bn') !== 'en';
    var base = CFX.director && CFX.director.metadata ? CFX.director.metadata(spec, opts) : { tags: [] };
    var opening = (spec.scenes.filter(function (s) { return s.type === 'story'; })[0] || {}).text || '';
    var total = spec.scenes.reduce(function (t, s) { return t + s.dur; }, 0);

    var lines = [];
    lines.push(opening ? opening.slice(0, 170) : spec.meta.title);
    lines.push('');
    lines.push(bn ? '📖 গল্প: ' + spec.meta.title : '📖 Story: ' + spec.meta.title);
    lines.push(bn ? '🎧 ন্যারেশন: নিজের ভয়েস (ভয়েস-ট্র্যাক করা ক্যাপশন সহ)'
      : '🎧 Narration: your own voice, with voice-tracked captions');
    lines.push(bn ? '⏱️ দৈর্ঘ্য: ' + fmtClock(total) : '⏱️ Length: ' + fmtClock(total));

    var chapterLines = [];
    var acc = 0;
    var beats = 0;
    var sinceChapter = 1e9;
    spec.scenes.forEach(function (sc) {
      if (sc.type === 'storyTitle') {
        chapterLines.push(fmtStamp(0) + (bn ? ' 📖 শুরু' : ' 📖 Intro'));
        sinceChapter = 0;
      } else if (sc.type === 'storyBeat') {
        chapterLines.push(fmtStamp(acc) + (bn ? ' ⏸️ বিরতি' : ' ⏸️ Beat'));
        beats++;
        sinceChapter = 0;
      } else if (sc.type !== 'storyEnd' && sc.label && sinceChapter >= 11) {
        chapterLines.push(fmtStamp(acc) + ' ' + sc.label.slice(0, 48));
        sinceChapter = 0;
      }
      acc += sc.dur;
      sinceChapter += sc.dur;
    });
    if (spec.scenes.length && spec.scenes[spec.scenes.length - 1].type === 'storyEnd') {
      chapterLines.push(fmtStamp(Math.max(0, total - spec.scenes[spec.scenes.length - 1].dur)) + (bn ? ' 🔚 শেষ' : ' 🔚 The end'));
    }
    if (total > 40 && chapterLines.length >= 3) {
      lines.push('');
      lines.push(bn ? '⏱️ টাইমস্ট্যাম্প:' : '⏱️ Timestamps:');
      chapterLines.slice(0, 14).forEach(function (l) { lines.push(l); });
    }
    if (spec.meta.shorts) {
      lines.push('');
      lines.push(bn ? '#Shorts — ৬০ সেকেন্ডের ভেতরে, ভার্টিকাল ৯:১৬, সেফ-জোন মেনে বানানো।'
        : '#Shorts — vertical 9:16, under a minute, laid out inside the Shorts safe zone.');
    }
    lines.push('');
    lines.push(bn ? '🔒 ক্যাপশন, টাইপোগ্রাফি আর এডিট — সব ব্রাউজারে, কোনো API বা সার্ভার ছাড়া।'
      : '🔒 Captions, typography and editing all happened in the browser — no API, no server.');

    var tags = (base.tags || []).slice(0, 12);
    if (bn) { if (tags.indexOf('বাংলা গল্প') < 0) tags.unshift('বাংলা গল্প'); }
    else if (tags.indexOf('story') < 0) tags.unshift('story');
    tags = tags.slice(0, 14);

    var hashtags = (base.hashtags || []).slice(0, 5);
    if (spec.meta.shorts && hashtags.indexOf('#Shorts') < 0) hashtags.unshift('#Shorts');

    return {
      title: base.title,
      shorts: !!spec.meta.shorts,
      description: lines.join('\n'),
      tags: tags,
      hashtags: hashtags,
      chapters: chapterLines,
      beats: beats,
      duration: total,
      schedule: base.schedule || null
    };
  }

  function fmtClock(sec) {
    var s = Math.max(0, Math.round(sec));
    var m = Math.floor(s / 60);
    return m + ':' + String(s % 60).padStart(2, '0');
  }
  function fmtStamp(sec) {
    var s = Math.max(0, Math.floor(sec));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r;
  }

  CFX.story = {
    plan: plan,
    metadata: metadata,
    sentences: sentences,
    labelOf: labelOf,
    emphasisFor: emphasisFor,
    resolution: resolution,
    seedOf: seedOf
  };
})(typeof window !== 'undefined' ? window : globalThis);
