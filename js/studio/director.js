/* ============================================================================
   CutFree Studio — the auto-director

   Turns plain text into a finished video plan: it reads the script, chooses
   scene types (title / kinetic text / bullet list / stat / quote / visual /
   outro), times every scene to narration pace, picks the theme + music mood,
   and writes the YouTube kit (title, description, chapters, tags, hashtags,
   schedule). Everything is deterministic from the seed, so the same input
   always renders the same film.
   ========================================================================== */
(function (w) {
  'use strict';

  var CFX = w.CFX = w.CFX || {};

  var WORDS_PER_SEC = 2.55;          // comfortable narration pace for kinetic text
  var MIN_SCENE = 2.0;
  var MAX_SCENE = 9.5;

  var STOPWORDS = ('a an the and or but if then than that this these those is are was were be been being do does did ' +
    'of in on at to for from with without by as it its it\'s you your we our they their he she his her i me my ' +
    'not no so very just also more most much many can will would should could about into over under again ' +
    'এবং বা কিন্তু যদি তবে যে এই সেই এর কে को ও আর না নেই আছে হবে ছিল জন্য থেকে দিয়ে করে করা এক একটা অনেক ' +
    'আমরা আমার আমাদের আপনি আপনার তারা তাদের তার এই এইটাই সেটা ওটা যেটা যেমন তেমন কেন কী').split(/\s+/);

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function hashString(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function wordCount(s) { return (String(s).trim().match(/[^\s]+/g) || []).length; }

  function parseNumber(text) {
    var m = String(text).match(/(-?\d[\d,\.]*)\s*(%|x|X|k|K|m|M|bn|cr|লাখ|কোটি|কোটি)?/);
    if (!m) return null;
    var value = parseFloat(m[1].replace(/,/g, ''));
    if (!isFinite(value)) return null;
    var suffix = m[2] || '';
    if (/^[kK]$/.test(suffix)) value *= 1e3;
    if (/^[mM]$/.test(suffix)) value *= 1e6;
    if (/^bn$/i.test(suffix)) value *= 1e9;
    if (/^(cr|কোটি)$/i.test(suffix)) value *= 1e7;
    if (/%/.test(suffix)) suffix = '%';
    var label = String(text).replace(m[1], '').replace(suffix, '').replace(/[:\-–—]/g, ' ').trim();
    return { value: value, suffix: /%/.test(suffix) ? '%' : (/[xX]/.test(suffix) ? 'x' : ''), label: label || 'fact' };
  }

  /* ------------------------------------------------------- script → beats */
  function splitBeats(script) {
    var raw = String(script || '').replace(/\r/g, '').trim();
    if (!raw) return [];
    var blocks = raw.split(/\n\s*\n+/);          // blank line = new beat
    var beats = [];
    blocks.forEach(function (block) {
      var lines = block.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
      if (!lines.length) return;

      var bullets = lines.filter(function (l) { return /^([-*•▪◦]|\d+[.)])\s+/.test(l); });
      if (bullets.length >= 2) {
        beats.push({
          kind: 'bullets',
          heading: lines[0] && !/^([-*•]|\d+[.)])\s+/.test(lines[0]) ? lines[0] : '',
          items: bullets.map(function (l) { return l.replace(/^([-*•▪◦]|\d+[.)])\s+/, ''); })
        });
        return;
      }
      if (lines.length === 1) { beats.push({ kind: 'line', text: lines[0] }); return; }
      // multi-line block: first line is the heading, rest is the body
      beats.push({ kind: 'block', heading: lines[0], text: lines.slice(1).join(' ') });
    });
    return beats;
  }

  function classify(beat) {
    if (beat.kind === 'bullets') return 'bullets';
    var text = (beat.heading ? beat.heading + '. ' : '') + (beat.text || '');
    if (/^["“'].*["”']/.test(text.trim()) || /\s—\s*\S+$/.test(text.trim())) return 'quote';
    var num = parseNumber(beat.text || beat.heading || '');
    if (num && wordCount(beat.text || '') <= 14 && beat.kind !== 'block' && /[\d]/.test(beat.heading || beat.text || '')) return 'stat';
    if (beat.kind === 'block') return 'explain';
    return 'line';
  }

  function sceneDuration(beat, type) {
    if (type === 'bullets') {
      var items = (beat.items || []).length;
      return Math.min(MAX_SCENE, Math.max(MIN_SCENE, 1.2 + items * 1.15));
    }
    if (type === 'stat') return Math.min(6.5, Math.max(2.6, 2.6));
    if (type === 'quote') return Math.min(MAX_SCENE, Math.max(2.8, wordCount(beat.text || '') / WORDS_PER_SEC + 1.6));
    var words = wordCount((beat.heading || '') + ' ' + (beat.text || ''));
    return Math.min(MAX_SCENE, Math.max(MIN_SCENE, words / WORDS_PER_SEC + 1.5));
  }

  /* --------------------------------------------------------------- the plan */
  function build(input) {
    input = input || {};
    var title = (input.title || '').trim();
    var script = String(input.script || '').trim();
    var seed = input.seed || hashString((title + '|' + script).slice(0, 400)) || 12345;
    var rand = mulberry32(seed);
    var lang = input.language === 'en' ? 'en' : 'bn';

    if (!title) {
      var firstLine = script.split('\n').map(function (l) { return l.trim(); }).filter(Boolean)[0] || '';
      var isProbablyTitle = firstLine && firstLine.length <= 70 && !/[.!?]$/.test(firstLine) && script.indexOf('\n') > -1;
      if (isProbablyTitle) {
        title = firstLine;
        script = script.slice(script.indexOf('\n')).trim();
      } else {
        title = firstLine.slice(0, 68) || (lang === 'bn' ? 'নতুন ভিডিও' : 'New video');
      }
    }

    var beats = splitBeats(script);
    var scenes = [];

    var themeKeys = Object.keys(CFX.THEMES);
    var moodKeys = Object.keys(CFX.MOODS);
    var theme = input.theme && CFX.THEMES[input.theme] ? input.theme : themeKeys[Math.floor(rand() * themeKeys.length)];
    var mood = input.mood && CFX.MOODS[input.mood] ? input.mood : moodKeys[Math.floor(rand() * moodKeys.length)];

    var hook = beats.length && beats[0].kind === 'line'
      ? beats.shift().text
      : (lang === 'bn' ? 'শুরু করা যাক।' : 'Let\'s dive in.');

    scenes.push({
      type: 'intro', dur: 3.4,
      title: title,
      subtitle: hook.slice(0, 90),
      isHook: true,
      transitionOut: 'zoom'
    });

    var brollEvery = beats.length > 4 ? 3 : 2;
    beats.forEach(function (beat, i) {
      var type = classify(beat);
      if (type === 'bullets') {
        scenes.push({
          type: 'bullets', heading: beat.heading || (lang === 'bn' ? 'মূল পয়েন্ট' : 'Key points'),
          items: beat.items.slice(0, 5), dur: sceneDuration(beat, type), transitionOut: 'slide'
        });
      } else if (type === 'stat') {
        var num = parseNumber(beat.text || beat.heading || '') || { value: 100, suffix: '%', label: '' };
        scenes.push({
          type: 'stat', value: num.value, suffix: num.suffix, label: num.label,
          dur: sceneDuration(beat, type), transitionOut: 'fade'
        });
      } else if (type === 'quote') {
        var q = (beat.text || '').replace(/^["“']|["”']$/g, '');
        var parts = q.split(/\s—\s|\s-\s/);
        scenes.push({
          type: 'quote', text: parts[0] || q, author: parts[1] || '',
          dur: sceneDuration(beat, type), transitionOut: 'fade'
        });
      } else if (type === 'explain') {
        scenes.push({
          type: 'text', heading: beat.heading, body: beat.text,
          dur: sceneDuration(beat, type), transitionOut: 'glitch'
        });
      } else {
        scenes.push({
          type: 'text', heading: '', body: beat.text || beat.heading || '',
          dur: sceneDuration(beat, type), transitionOut: 'fade'
        });
      }

      // inject a pure-motion scene now and then so the edit breathes
      if ((i + 1) % brollEvery === 0 && i < beats.length - 1) {
        scenes.push({
          type: 'broll', dur: 2.4,
          label: lang === 'bn' ? '' : '', transitionOut: 'fade'
        });
      }
    });

    scenes.push({
      type: 'outro', dur: 4.2,
      title: lang === 'bn' ? 'ধন্যবাদ!' : 'Thanks for watching!',
      subtitle: lang === 'bn' ? 'ভিডিওটি ভালো লাগলে লাইক, শেয়ার আর সাবস্ক্রাইব করুন।' : 'Like, share and subscribe for more.',
      cta: lang === 'bn' ? 'সাবস্ক্রাইব' : 'SUBSCRIBE',
      transitionOut: 'fade'
    });

    // fit the requested total duration (supporting up to 10-20 minutes)
    if (input.durationTarget) {
      var raw = scenes.reduce(function (s, sc) { return s + sc.dur; }, 0);
      var factor = Math.max(0.4, Math.min(8.0, input.durationTarget / raw));
      if (Math.abs(factor - 1) > 0.02) {
        scenes.forEach(function (sc) {
          sc.dur = Math.max(1.6, Math.min(18.0, sc.dur * factor));
          if (sc.type === 'stat' || sc.type === 'broll') sc.dur = Math.max(2.0, Math.min(7.5, sc.dur));
        });
      }
    }

    var aspect = input.aspect || (input.shorts ? '9:16' : '16:9');
    var dims = {
      '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080], '4:5': [1080, 1350]
    }[aspect] || [1920, 1080];
    var quality = input.quality || '720p';
    var scale = { '480p': 480 / 1080, '720p': 720 / 1080, '1080p': 1, '1440p': 1440 / 1080 }[quality] || 720 / 1080;
    var width = Math.round(dims[0] * scale / 2) * 2;
    var height = Math.round(dims[1] * scale / 2) * 2;

    var spec = {
      meta: {
        title: title,
        theme: theme,
        mood: mood,
        seed: seed,
        watermark: input.watermark !== undefined ? input.watermark : '',
        showProgress: input.showProgress !== false,
        language: lang,
        aspect: aspect,
        perf: input.perf || 'high',
        shorts: !!input.shorts,
        safe: input.shorts ? { top: 0.11, bottom: 0.19 } : { top: 0.05, bottom: 0.08 },
        captions: {
          enabled: input.captions !== false && !!(input.captionCues && input.captionCues.length),
          style: input.captionStyle || (input.shorts ? 'karaoke' : 'bar'),
          scale: input.shorts ? 1.12 : 1
        },
        logoDataUrl: input.logoDataUrl || null
      },
      fps: input.fps || 30,
      width: width,
      height: height,
      scenes: scenes
    };

    // -------- captions: explicit cues win, a SRT string is parsed, otherwise
    // we derive them from the narration timing estimation below (optional).
    var cues = null;
    if (input.captionCues && input.captionCues.length) cues = input.captionCues.slice();
    else if (input.srt && CFX.captions) cues = CFX.captions.parse(input.srt);

    if (cues && cues.length) {
      var span = spec.scenes.reduce(function (a, x) { return a + x.dur; }, 0);
      var last = cues[cues.length - 1].end;
      if (input.fitCaptions !== false && last > 0.5 && span > 0.5 && Math.abs(last - span) > 0.8) {
        cues = CFX.captions.fitTo(cues, span);
      }
      spec.captions = cues;
      spec.meta.captions.enabled = input.captions !== false;
      spec.meta.captions.hasWords = cues.some(function (c) { return c.words && c.words.length; });
    }

    return spec;
  }

  /* --------------------------------------------------- narration fit helpers */
  // Re-time the scenes so every paragraph's scene lasts exactly as long as the
  // narration measured for it (voice-over / TTS timings).
  function fitToNarration(spec, timings, opts) {
    if (!spec || !timings || !timings.segments || !timings.segments.length) return spec;
    opts = opts || {};
    var pad = opts.pad == null ? 0.35 : opts.pad;
    var body = spec.scenes.filter(function (s) { return s.type !== 'intro' && s.type !== 'outro'; });
    var segs = timings.segments;
    if (!body.length) return spec;

    var count = Math.min(body.length, segs.length);
    for (var i = 0; i < count; i++) {
      var dur = Math.max(opts.minScene || 1.4, (segs[i].end - segs[i].start) + pad);
      body[i].dur = +dur.toFixed(2);
    }
    // if the script has more scenes than narration segments, keep the leftovers readable
    for (var j = count; j < body.length; j++) body[j].dur = Math.max(1.6, Math.min(body[j].dur, 4));

    if (opts.intro != null) spec.scenes[0].dur = opts.intro;
    if (opts.outro != null) spec.scenes[spec.scenes.length - 1].dur = opts.outro;
    return spec;
  }

  // Captions straight from measured word timings (or interpolated when the
  // browser could not report boundary events).
  function captionsFromTimings(timings, opts) {
    if (!timings || !timings.segments) return [];
    var cues = [];
    timings.segments.forEach(function (seg) {
      var words = seg.words && seg.words.length ? seg.words : CFX.captions.estimateWords(seg.text, seg.start, seg.end);
      // note: 0 is a legitimate start time, so coalesce on "is a number", not truthiness
      var pick = function (a, b) {
        return (typeof a === 'number' && isFinite(a)) ? a : ((typeof b === 'number' && isFinite(b)) ? b : undefined);
      };
      var grouped = CFX.captions.fromWords(words.map(function (wd) {
        return { word: wd.word || wd.w, start: pick(wd.start, wd.s), end: pick(wd.end, wd.e) };
      }), opts);
      grouped.forEach(function (c) { cues.push(c); });
    });
    return cues;
  }

  /* ------------------------------------------------------------ YouTube kit */
  function fmtStamp(sec) {
    var m = Math.floor(sec / 60);
    var s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function keywords(text, limit) {
    var counts = {};
    (String(text).toLowerCase().match(/[\u0980-\u09FF]+|[a-z0-9']+/g) || []).forEach(function (word) {
      if (word.length < 3 || STOPWORDS.indexOf(word) > -1) return;
      counts[word] = (counts[word] || 0) + 1;
    });
    return Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, limit || 12);
  }

  function metadata(spec, opts) {
    opts = opts || {};
    var shorts = !!spec.meta.shorts || spec.meta.aspect === '9:16';
    var title = (spec.meta.title || '').trim().slice(0, shorts ? 90 : 95);
    var bn = spec.meta.language !== 'en';
    var lines = [];
    var tags = keywords(spec.meta.title + ' ' + spec.scenes.map(function (s) {
      return [s.title, s.heading, s.body, s.text, (s.items || []).join(' ')].filter(Boolean).join(' ');
    }).join(' '), 14);

    var hook = (spec.scenes[1] && (spec.scenes[1].body || spec.scenes[1].text || spec.scenes[1].heading)) || '';

    lines.push(hook ? hook.slice(0, 180) : (bn ? spec.meta.title : spec.meta.title));
    lines.push('');
    lines.push(bn ? '⏱️ টাইমস্ট্যাম্প:' : '⏱️ Timestamps:');

    var starts = [], acc = 0;
    spec.scenes.forEach(function (sc) { starts.push(acc); acc += sc.dur; });
    var chapters = spec.scenes.map(function (sc, i) {
      var label = sc.title || sc.heading || (sc.type === 'quote' ? (bn ? 'উক্তি' : 'Quote')
        : sc.type === 'stat' ? (sc.label || (bn ? 'তথ্য' : 'Key number'))
          : sc.type === 'broll' ? (bn ? 'ভিজ্যুয়াল' : 'B-roll')
            : sc.type === 'outro' ? (bn ? 'শেষ কথা' : 'Outro')
              : (sc.type === 'bullets' ? (bn ? 'মূল পয়েন্ট' : 'Key points') : (bn ? 'আলোচনা' : 'Discussion')));
      return { at: starts[i], label: String(label).slice(0, 60) };
    });

    var total = acc;
    var includeChapters = total > 40 && chapters.length >= 3;
    if (includeChapters) {
      chapters.forEach(function (c) { lines.push(fmtStamp(c.at) + ' ' + c.label); });
    } else {
      lines.push(bn ? 'পুরো ভিডিওটাই এক বসায় দেখা যায় 🙂' : 'One sitting, no fluff 🙂');
    }

    if (shorts) {
      lines.push('');
      lines.push(bn
        ? '#Shorts — ৬০ সেকেন্ডের ভেতরে, ভার্টিকাল ৯:১৬, সেফ-জোন মেনে বানানো।'
        : '#Shorts — vertical 9:16, under a minute, laid out inside the Shorts safe zone.');
    }

    var hashtags = tags.slice(0, 5).map(function (t) { return '#' + t.replace(/[^\u0980-\u09FF\w]/g, ''); });
    if (shorts) {
      hashtags = ['#Shorts', '#Viral', '#Trending'].concat(hashtags);
    } else {
      hashtags = ['#Video', '#Education'].concat(hashtags);
    }
    hashtags = hashtags.slice(0, 8);
    lines.push('');
    lines.push(hashtags.join(' '));
    lines.push('');
    lines.push(bn ? '🔒 এই ভিডিওটি সম্পূর্ণ ব্রাউজারে, কোনো ওয়াটারমার্ক ছাড়া তৈরি।' : '🔒 Produced entirely in a browser with no watermark.');
    if (hashtags.length) lines.push('');
    if (hashtags.length) lines.push(hashtags.join(' '));

    var schedule = null;
    if (opts.scheduleStart) {
      var start = new Date(opts.scheduleStart);
      if (!isNaN(start.getTime())) {
        var everyHours = opts.everyHours || 24;
        start.setUTCHours(opts.atHourUtc == null ? 12 : opts.atHourUtc, 0, 0, 0);
        while (start.getTime() < Date.now() + 15 * 60 * 1000) start = new Date(start.getTime() + everyHours * 3600 * 1000);
        schedule = start.toISOString();
      }
    }

    return {
      title: title,
      description: lines.join('\n'),
      tags: tags,
      hashtags: hashtags,
      chapters: includeChapters ? chapters : [],
      durationSeconds: total,
      categoryId: opts.categoryId || '22',                 // People & Blogs
      defaultLanguage: spec.meta.language === 'en' ? 'en' : 'bn',
      privacyStatus: opts.privacyStatus || 'private',
      publishAt: schedule,
      madeForKids: false,
      theme: spec.meta.theme,
      mood: spec.meta.mood,
      shorts: shorts,
      suggestedTitle: shorts ? (title.length > 80 ? title.slice(0, 80) : title) : title
    };
  }

  /* --------------------------------------------------------- batch planning */
  function batch(text, opts) {
    opts = opts || {};
    var blocks = String(text || '').split(/\n\s*-{3,}\s*\n|\n\s*={3,}\s*\n/);
    var out = [];
    blocks.forEach(function (block, i) {
      var t = block.replace(/\r/g, '').trim();
      if (!t) return;
      // keep the paragraph breaks: only the first non-empty line becomes the title
      var rawLines = t.split('\n');
      var firstIdx = -1;
      for (var k = 0; k < rawLines.length; k++) {
        if (rawLines[k].trim()) { firstIdx = k; break; }
      }
      if (firstIdx < 0) return;
      var title = rawLines[firstIdx].trim();
      var body = rawLines.slice(firstIdx + 1).join('\n').trim();
      out.push({
        title: title,
        script: body || t,
        seed: (opts.seed || 0) + i * 977
      });
    });
    return out;
  }

  CFX.director = {
    build: build,
    metadata: metadata,
    fitToNarration: fitToNarration,
    captionsFromTimings: captionsFromTimings,
    shortsPreset: function (input) {
      return Object.assign({}, input, {
        shorts: true, aspect: '9:16',
        durationTarget: Math.min(input && input.durationTarget ? input.durationTarget : 45, 58),
        captionStyle: (input && input.captionStyle) || 'karaoke'
      });
    },
    batch: batch,
    splitBeats: splitBeats,
    classify: classify,
    keywords: keywords,
    wordCount: wordCount,
    sceneStarts: function (spec) {
      var starts = [], acc = 0;
      spec.scenes.forEach(function (s) { starts.push(acc); acc += s.dur; });
      return { starts: starts, total: acc };
    }
  };
})(window);
