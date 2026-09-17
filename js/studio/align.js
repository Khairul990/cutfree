/* ============================================================================
   CutFree Studio — voice tracking / forced alignment (zero-cost, offline)

   The user brings the narration. We do NOT transcribe it (no server, no API):
   we listen to the *waveform* — where speech starts, where it pauses, how loud
   it breathes — and pour the written script into those spoken slots. The result
   is word-level timing good enough to drive karaoke captions and kinetic
   typography that lands on the syllable.

   Pipeline
     samples ─▶ analyse()  : adaptive-threshold VAD → phrases (speech spans)
     script  ─▶ words()    : per-word weight (Bengali matra-aware) + pause-bias
     both    ─▶ assign()   : weight-proportional distribution inside each phrase
     ...     ─▶ track()    : one call → paragraphs + word timings + karaoke cues

   Everything is a pure function over numbers, so node, the CLI and the tests
   use exactly the same code as the browser.
   ========================================================================== */
(function (w) {
  'use strict';

  var CFX = w.CFX = w.CFX || {};

  /* --------------------------------------------------------------- helpers */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function percentile(values, p) {
    if (!values.length) return 0;
    var arr = Array.prototype.slice.call(values).sort(function (a, b) { return a - b; });
    var idx = clamp(Math.round((arr.length - 1) * p), 0, arr.length - 1);
    return arr[idx];
  }

  // Accepts an AudioBuffer (browser), {data, sampleRate}, a Float32Array or an
  // array of channel arrays. Returns mono samples + the sample rate we assumed.
  function toMono(input, opts) {
    opts = opts || {};
    if (!input) return { data: new Float32Array(0), sampleRate: opts.sampleRate || 48000 };

    if (input.getChannelData && input.numberOfChannels) {          // AudioBuffer
      var n = input.length, ch = input.numberOfChannels;
      var out = new Float32Array(n);
      for (var c = 0; c < ch; c++) {
        var d = input.getChannelData(c);
        for (var i = 0; i < n; i++) out[i] += d[i] / ch;
      }
      return { data: out, sampleRate: input.sampleRate };
    }
    if (input.data && input.data.length !== undefined) {           // {data, sampleRate}
      return { data: toMonoData(input.data), sampleRate: input.sampleRate || opts.sampleRate || 48000 };
    }
    return { data: toMonoData(input), sampleRate: input.sampleRate || opts.sampleRate || 48000 };
  }

  function toMonoData(data) {
    if (data.getChannelData) {                                     // {data: AudioBuffer}
      var buf = data, n = buf.length, ch = buf.numberOfChannels, out = new Float32Array(n);
      for (var c = 0; c < ch; c++) {
        var d = buf.getChannelData(c);
        for (var i = 0; i < n; i++) out[i] += d[i] / ch;
      }
      return out;
    }
    if (Array.isArray(data) && data.length && Array.isArray(data[0])) {   // [ch][i]
      var len = data[0].length, out2 = new Float32Array(len);
      for (var c2 = 0; c2 < data.length; c2++) {
        for (var j = 0; j < len; j++) out2[j] += data[c2][j] / data.length;
      }
      return out2;
    }
    if (data instanceof Float32Array) return data;
    return Float32Array.from(data);
  }

  /* ---------------------------------------------------------------- analyse */
  // Windowed RMS → noise floor → hysteresis threshold → speech phrases.
  // All the knobs are exposed because phone recordings are noisy and studio
  // takes are not; the defaults are tuned for a spoken voice-over.
  function analyse(input, opts) {
    opts = opts || {};
    var mono = toMono(input, opts);
    var data = mono.data;
    var sr = mono.sampleRate;
    var duration = data.length / sr;

    var win = Math.max(1, Math.round((opts.window || 0.030) * sr));
    var hop = Math.max(1, Math.round((opts.hop || 0.010) * sr));
    var frames = Math.max(0, Math.floor((data.length - win) / hop) + 1);
    var rms = new Float32Array(frames);
    var smooth = new Float32Array(frames);

    for (var f = 0; f < frames; f++) {
      var base = f * hop, sum = 0;
      for (var i = base; i < base + win; i++) sum += data[i] * data[i];
      rms[f] = Math.sqrt(sum / win);
    }
    // 3-frame moving average kills single-sample dropouts
    for (var s = 0; s < frames; s++) {
      var a = rms[Math.max(0, s - 1)], b = rms[s], c = rms[Math.min(frames - 1, s + 1)];
      smooth[s] = (a + b + c) / 3;
    }

    var floor = percentile(smooth, opts.floorPercentile == null ? 0.2 : opts.floorPercentile);
    var loud = percentile(smooth, 0.95);
    var hi = Math.max(floor * 3.0, floor + 0.010, loud * 0.16);
    var lo = Math.max(floor * 1.7, floor + 0.005, hi * 0.55);

    var minSpeech = opts.minSpeech == null ? 0.16 : opts.minSpeech;
    var minGap = opts.minGap == null ? 0.14 : opts.minGap;
    var mergeGap = opts.mergeGap == null ? 0.22 : opts.mergeGap;
    var pad = opts.pad == null ? 0.035 : opts.pad;

    var minSpeechF = Math.max(1, Math.round(minSpeech / (hop / sr)));
    var minGapF = Math.max(1, Math.round(minGap / (hop / sr)));

    var phrases = [];
    var speaking = false;
    var startF = 0, quiet = 0;
    for (var k = 0; k < frames; k++) {
      var level = smooth[k];
      if (!speaking) {
        if (level >= hi) { speaking = true; startF = k; quiet = 0; }
      } else {
        if (level < lo) { quiet++; if (quiet >= minGapF) { phrases.push({ a: startF, b: k - quiet + 1 }); speaking = false; } }
        else quiet = 0;
      }
    }
    if (speaking) phrases.push({ a: startF, b: frames });

    // frame spans → seconds, then tidy up
    var spans = phrases
      .filter(function (p) { return (p.b - p.a) >= minSpeechF; })
      .map(function (p) {
        return { start: Math.max(0, p.a * hop / sr - pad), end: Math.min(duration, (p.b * hop + win) / sr + pad) };
      });

    // join spans that are separated by an unnaturally short breath
    var merged = [];
    spans.forEach(function (sp) {
      var prev = merged[merged.length - 1];
      if (prev && (sp.start - prev.end) < mergeGap) prev.end = sp.end;
      else merged.push({ start: sp.start, end: sp.end });
    });

    var speechTime = merged.reduce(function (t, p) { return t + (p.end - p.start); }, 0);
    var gaps = [];
    for (var g = 1; g < merged.length; g++) gaps.push({ start: merged[g - 1].end, end: merged[g].start });

    return {
      duration: duration,
      sampleRate: sr,
      phrases: merged,
      gaps: gaps,
      envelope: smooth,
      hop: hop / sr,
      noiseFloor: floor,
      threshold: hi,
      speechRatio: duration > 0 ? speechTime / duration : 0,
      speechTime: speechTime,
      // "is there really a voice in here?" — used to fall back to estimates
      usable: merged.length >= 2 && speechTime > 0.8
    };
  }

  /* ----------------------------------------------------------------- words */
  var BN_MATRA = /[\u09BE-\u09CD\u09D7\u09E2\u09E3]/;          // vowel signs / hasanta
  var BN_LETTER = /[\u0985-\u0994\u0995-\u09B9\u09DC-\u09DF\u09F0\u09F1\u09E6-\u09EF]/;
  var LAT_VOWEL = /[aeiouyAEIOUY]/;

  // Roughly "how long does this word take to say" — Bengali counts letters plus
  // half-weight vowel signs, Latin counts syllable cores. Punctuation adds the
  // pause the speaker will naturally take.
  function weight(word) {
    var s = String(word || '');
    var sum = 0;
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (BN_MATRA.test(ch)) sum += 0.45;
      else if (BN_LETTER.test(ch)) sum += 1;
      else if (/[0-9]/.test(ch)) sum += 1.1;
      else if (LAT_VOWEL.test(ch)) sum += 1;
      else if (/[a-zA-Z]/.test(ch)) sum += 0.72;
    }
    return Math.max(1, sum);
  }

  // Natural pause *after* a word, in seconds (scaled down when time is tight).
  function pauseAfter(word) {
    var s = String(word || '');
    if (/[.!?…]+["'”’)]?$/.test(s)) return 0.30;
    if (/[।॥]$/.test(s)) return 0.34;                   // Bengali danda
    if (/[,;:—–-]$/.test(s)) return 0.17;
    return 0.045;
  }

  function words(text, para) {
    return String(text == null ? '' : text)
      .split(/\s+/)
      .map(function (t) { return t.trim(); })
      .filter(Boolean)
      .map(function (t) {
        var core = t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '') || t;
        return { w: t, core: core, weight: weight(core), pause: pauseAfter(t), para: para };
      });
  }

  /* ---------------------------------------------------------------- assign */
  // Pour a word list into the spoken slots, weighted by how long each word takes
  // to say. Slots run from one phrase's start to the next phrase's start, so the
  // breaths between phrases are distributed naturally and words never drift out
  // of the audio they belong to.
  function slotsFrom(analysis) {
    var ph = analysis.phrases;
    return ph.map(function (p, i) {
      var next = ph[i + 1];
      var end = next ? next.start : Math.min(analysis.duration, p.end + 0.45);
      return { start: p.start, spokenEnd: p.end, end: Math.max(p.end, end) };
    });
  }

  // Paragraphs are poured into *whole* slots so a sentence always starts where
  // the speaker takes breath. A paragraph can own several slots; when there are
  // more paragraphs than phrases, neighbouring paragraphs share one slot.
  function groupParagraphs(paras, slotCount) {
    if (paras.length <= slotCount) return paras.map(function (_, i) { return [i]; });
    var total = paras.reduce(function (t, p) { return t + p.weight; }, 0) || 1;
    var groups = [];
    var acc = 0, cur = [];
    paras.forEach(function (p, i) {
      cur.push(i);
      acc += p.weight;
      var target = (groups.length + 1) * (total / slotCount);
      if (acc >= target * 0.92 && groups.length < slotCount - 1) { groups.push(cur); cur = []; }
    });
    if (cur.length) groups.push(cur);
    return groups;
  }

  // Dynamic programming: give each paragraph group the run of slots whose
  // cumulative *time* fraction best matches the group's cumulative *weight*
  // fraction. Cost is the absolute error, so it stays balanced end to end.
  function chooseRuns(groups, slots, paras) {
    var P = groups.length, S = slots.length;
    var totalW = paras.reduce(function (t, p) { return t + p.weight; }, 0) || 1;
    var totalT = slots.reduce(function (t, s) { return t + (s.end - s.start); }, 0) || 1;
    var wFrac = [], acc = 0;
    groups.forEach(function (g) {
      g.forEach(function (i) { acc += paras[i].weight; });
      wFrac.push(acc / totalW);
    });
    var tFrac = [], accT = 0;
    slots.forEach(function (sl) { accT += (sl.end - sl.start); tFrac.push(accT / totalT); });

    var INF = 1e9;
    var dp = [], prev = [];
    for (var i = 0; i < P; i++) { dp.push([]); prev.push([]); }
    for (var j = 0; j < S; j++) {
      dp[0][j] = Math.abs(wFrac[0] - tFrac[j]);
      prev[0][j] = -1;
    }
    for (var i2 = 1; i2 < P; i2++) {
      for (var j2 = i2; j2 < S - (P - i2 - 1); j2++) {
        var best = INF, bestK = i2 - 1;
        for (var k = i2 - 1; k < j2; k++) {
          var cost = dp[i2 - 1][k];
          if (cost < best) { best = cost; bestK = k; }
        }
        dp[i2][j2] = best + Math.abs(wFrac[i2] - tFrac[j2]);
        prev[i2][j2] = bestK;
      }
    }
    var runs = [];
    var jEnd = S - 1;
    for (var i3 = P - 1; i3 >= 0; i3--) {
      var jStart = i3 === 0 ? -1 : prev[i3][jEnd];
      runs[i3] = { from: Math.max(0, jStart + (jStart === -1 ? 0 : 1)), to: jEnd };
      if (i3 === 0) runs[0].from = 0;
      jEnd = jStart;
    }
    return runs;
  }

  function assignWords(list, analysis, opts) {
    opts = opts || {};
    var slots = slotsFrom(analysis);
    if (!slots.length || !list.length) return [];

    // 1. group the words by the paragraph they were written in
    var paras = [];
    list.forEach(function (it) {
      var idx = it.para == null ? 0 : it.para;
      if (!paras[idx]) paras[idx] = { weight: 0, words: [] };
      paras[idx].weight += it.weight + it.pause;
      paras[idx].words.push(it);
    });
    paras = paras.filter(Boolean);

    // 2. how many phrases each paragraph gets (whole-phrase granularity)
    var groups = groupParagraphs(paras, slots.length);
    var runs = chooseRuns(groups, slots, paras);

    var tailAllow = opts.tailAllow == null ? 0.30 : opts.tailAllow;
    var spw = opts.secondsPerWeight == null ? 0.075 : opts.secondsPerWeight;
    var placed = [];

    groups.forEach(function (group, gi) {
      var run = runs[gi] || { from: gi, to: gi };
      var runSlots = slots.slice(run.from, run.to + 1);
      if (!runSlots.length) runSlots = [slots[Math.min(gi, slots.length - 1)]];

      var groupWords = [];
      var groupWeight = 0;
      group.forEach(function (pi) {
        groupWeight += paras[pi].weight;
        groupWords = groupWords.concat(paras[pi].words);
      });
      if (!groupWords.length) return;

      var runTime = runSlots.reduce(function (t, x) { return t + (x.end - x.start); }, 0) || 1;

      // 3. split the group's words across its phrases, by how long each one lasts
      var wi = 0;
      runSlots.forEach(function (slot) {
        var slotTime = Math.max(0.12, slot.end - slot.start);
        var slotWeight = groupWeight * (slotTime / runTime);
        var weightUsed = 0, assigned = [];
        while (wi < groupWords.length && (weightUsed < slotWeight * 0.999 || !assigned.length)) {
          assigned.push(groupWords[wi]);
          weightUsed += groupWords[wi].weight + groupWords[wi].pause;
          wi++;
        }
        if (!assigned.length) return;

        // 4. place them: inside the spoken phrase, plus the breath after it, and
        //    if the text needs more room than the voice gave it, borrow part of
        //    the following silence — never past the next phrase's onset.
        // Words live inside the spoken phrase. If the text genuinely needs more
        // time than the voice gave it they may borrow the following silence —
        // but they never stretch into it just because it is there.
        var readable = assigned.reduce(function (t, x) { return t + x.weight; }, 0) * spw;
        var windowEnd = Math.min(slot.end, Math.max(slot.spokenEnd,
          Math.min(slot.spokenEnd + tailAllow, slot.start + readable)));
        var window = Math.max(0.15, windowEnd - slot.start);
        var wSum = assigned.reduce(function (t, x) { return t + x.weight + x.pause; }, 0) || 1;

        var placed_in_slot = 0;
        assigned.forEach(function (item, ai) {
          var share = (item.weight + item.pause) / wSum;
          var dur = clamp(window * share, 0.09, 3.2);
          var start = ai === 0 ? slot.start : slot.start + placed_in_slot;
          var soft = Math.min(item.pause, dur * 0.5);
          var end = start + Math.max(0.05, dur - soft);
          if (end > slot.end) end = slot.end;
          if (end - start < 0.09) end = Math.min(slot.end, start + 0.09);
          placed.push({
            word: item.w, core: item.core, para: item.para,
            start: start, end: end, slot: slots.indexOf(slot)
          });
          placed_in_slot += dur;
        });
      });

      // 5. if the run could not take them all (very short audio), let the rest
      //    ride the tail of the last phrase so nothing is lost
      while (wi < groupWords.length) {
        var prev = placed[placed.length - 1];
        var st = prev ? prev.end + 0.04 : 0;
        var step = clamp((groupWords[wi].weight) * spw, 0.12, 1.1);
        placed.push({
          word: groupWords[wi].w, core: groupWords[wi].core, para: groupWords[wi].para,
          start: st, end: st + step * 0.85, slot: -1
        });
        wi++;
      }
    });

    // 6. final safety pass — strictly ordered, non-overlapping, ≥ 50 ms
    var last = 0;
    placed.forEach(function (t) {
      if (!(t.start >= 0)) t.start = last + 0.05;
      if (t.start < last) t.start = last + 0.02;
      if (!(t.end > t.start)) t.end = t.start + 0.06;
      last = t.end;
    });
    return placed;
  }

  // Split a flat word list back into the paragraphs the script was written in.
  function paragraphsFrom(list, script, timing) {
    var blocks = String(script == null ? '' : script)
      .split(/\n\s*\n+/)
      .map(function (b) { return b.replace(/\s+/g, ' ').trim(); })
      .filter(Boolean);
    if (!blocks.length) blocks = [String(script || '').trim()];

    var out = [];
    var cursor = 0;
    var tagged = timing.length && timing[0].para !== undefined;
    blocks.forEach(function (block, i) {
      var list2 = words(block, i);
      var slice = tagged
        ? timing.filter(function (t) { return t.para === i; })
        : timing.slice(cursor, cursor + list2.length);
      cursor += list2.length;
      if (!slice.length) return;
      out.push({
        index: i,
        text: block,
        words: slice,
        start: slice[0].start,
        end: slice[slice.length - 1].end,
        wordCount: list2.length
      });
    });
    return out;
  }

  /* ----------------------------------------------------------------- track */
  function cuesFrom(timing, opts) {
    if (!timing || !timing.length) return [];
    // a caption never spans two paragraphs — that is where the speaker breathes
    if (timing[0].para !== undefined && timing.some(function (t) { return t.para !== timing[0].para; })) {
      var buckets = [];
      timing.forEach(function (t) {
        var i = t.para == null ? 0 : t.para;
        if (!buckets[i]) buckets[i] = [];
        buckets[i].push({ word: t.word, start: t.start, end: t.end });
      });
      var merged = [];
      buckets.filter(Boolean).forEach(function (b) { merged = merged.concat(cuesFrom(b, opts)); });
      return merged;
    }
    if (CFX.captions && CFX.captions.fromWords) {
      return CFX.captions.fromWords(
        timing.map(function (t) { return { word: t.word, start: t.start, end: t.end }; }), opts
      );
    }
    return timing.map(function (t) { return { start: t.start, end: t.end, text: t.word, words: [{ w: t.word, s: t.start, e: t.end }] }; });
  }

  // One call: audio + script in, timing + captions out.
  // `estimated: true` means we could not hear a voice and fell back to text pace.
  function track(audio, script, opts) {
    opts = opts || {};
    var res = analyse(audio, opts);
    var blocks = String(script == null ? '' : script)
      .split(/\n\s*\n+/).map(function (b) { return b.replace(/\s+/g, ' ').trim(); }).filter(Boolean);
    var flat = [];
    blocks.forEach(function (block, bi) { flat = flat.concat(words(block, bi)); });

    if (!res.usable || !flat.length) {
      var est = proportional(script, {
        wps: opts.wps || 2.45,
        leadIn: opts.leadIn == null ? 0.35 : opts.leadIn
      });
      est.analysis = res;
      est.estimated = true;
      est.reason = !flat.length ? 'empty-script' : (res.phrases.length < 2 ? 'no-phrases' : 'too-little-speech');
      return est;
    }

    var timing = assignWords(flat, res, opts);
    var paragraphs = paragraphsFrom(timing, script, timing);
    var cues = cuesFrom(timing, {
      maxChars: opts.maxChars == null ? 40 : opts.maxChars,
      maxSeconds: opts.maxSeconds == null ? 2.8 : opts.maxSeconds,
      minSeconds: opts.minSeconds
    });

    return {
      estimated: false,
      duration: res.duration,
      speechTime: res.speechTime,
      speechRatio: res.speechRatio,
      phrases: res.phrases,
      gaps: res.gaps,
      envelope: res.envelope,
      hop: res.hop,
      analysis: res,
      words: timing,
      paragraphs: paragraphs,
      cues: cues
    };
  }

  // No usable audio: keep the same shape, pace the text by words-per-second.
  function proportional(script, opts) {
    opts = opts || {};
    var wps = opts.wps || 2.45;
    var blocks = String(script == null ? '' : script)
      .split(/\n\s*\n+/).map(function (b) { return b.replace(/\s+/g, ' ').trim(); }).filter(Boolean);
    if (!blocks.length) return { estimated: true, duration: 0, words: [], paragraphs: [], cues: [], phrases: [], gaps: [] };

    var t = opts.leadIn == null ? 0.35 : opts.leadIn;
    var timing = [];
    var paragraphs = [];
    blocks.forEach(function (block, bi) {
      var list = words(block);
      var pStart = t;
      list.forEach(function (item, i) {
        var dur = item.weight / wps;
        timing.push({ word: item.w, core: item.core, start: t, end: t + dur * 0.92, slot: -1, block: bi });
        t += dur + Math.min(item.pause, 0.22) * 0.5 + (i === list.length - 1 ? 0.12 : 0);
      });
      paragraphs.push({
        index: bi, text: block, words: timing.slice(-list.length),
        start: pStart, end: t - 0.12, wordCount: list.length
      });
      t += 0.22;
    });

    return {
      estimated: true,
      duration: t,
      speechTime: t,
      speechRatio: 1,
      phrases: paragraphs.map(function (p) { return { start: p.start, end: p.end }; }),
      gaps: [],
      words: timing,
      paragraphs: paragraphs,
      cues: cuesFrom(timing, opts)
    };
  }

  /* --------------------------------------------------------------- editing */
  // Nudge a paragraph (and everything after it) — how the user fixes a tracker
  // that put a line on the wrong breath.
  function shiftFrom(paragraphs, index, delta) {
    if (!paragraphs[index]) return paragraphs;
    var hitBoundary = false;
    return paragraphs.map(function (p, i) {
      if (i === index) hitBoundary = true;
      if (!hitBoundary) return p;
      var shift = function (t) { return Math.max(0, t + delta); };
      return {
        index: p.index, text: p.text, wordCount: p.wordCount,
        start: shift(p.start), end: shift(p.end),
        words: p.words.map(function (wd) {
          return { word: wd.word, core: wd.core, start: shift(wd.start), end: shift(wd.end), slot: wd.slot };
        })
      };
    });
  }

  // Re-derive cues after the paragraph list changed.
  function retime(tracked) {
    if (!tracked) return tracked;
    var flat = [];
    (tracked.paragraphs || []).forEach(function (p) { flat = flat.concat(p.words); });
    tracked.words = flat;
    tracked.cues = cuesFrom(flat);
    tracked.duration = flat.length ? flat[flat.length - 1].end + 0.2 : tracked.duration;
    return tracked;
  }

  w.CFX.align = {
    analyse: analyse,
    track: track,
    proportional: proportional,
    words: words,
    weight: weight,
    pauseAfter: pauseAfter,
    assignWords: assignWords,
    paragraphsFrom: paragraphsFrom,
    cuesFrom: cuesFrom,
    shiftFrom: shiftFrom,
    retime: retime,
    toMono: toMono,
    percentile: percentile
  };
})(typeof window !== 'undefined' ? window : globalThis);
