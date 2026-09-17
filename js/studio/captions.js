/* ============================================================================
   CutFree Studio — captions & subtitles (pure functions, no DOM needed for the
   parsing/building half, so the CLI and the tests can use them too)

   - parse SRT / WebVTT (and plain "text + duration" lines)  -> cue objects
   - build SRT from cues or from measured TTS word timings
   - group word timings into readable cues (karaoke-friendly)
   - shift / scale cues to fit a target duration
   ========================================================================== */
(function (w) {
  'use strict';

  var CFX = w.CFX = w.CFX || {};

  var TIME_RE = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/;

  function toSeconds(h, m, s, ms) {
    return (+h) * 3600 + (+m) * 60 + (+s) + (+('0.' + ms.padEnd(3, '0')));
  }

  function parseTimestamp(str) {
    var m = TIME_RE.exec(str);
    if (!m) return null;
    return toSeconds(m[1], m[2], m[3], m[4]);
  }

  // Coerce anything (undefined, null, "1.2", NaN) into a usable seconds value.
  // Word timings coming from TTS or SRT parsing are not always well-formed and a
  // single NaN used to poison the whole cue list (NaN:NaN:NaN in the SRT export).
  function num(v, fallback) {
    var n = typeof v === 'number' ? v : parseFloat(v);
    return (typeof n === 'number' && isFinite(n)) ? n : fallback;
  }

  function fmtTimestamp(seconds, comma) {
    seconds = Math.max(0, num(seconds, 0));
    var h = Math.floor(seconds / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    var s = Math.floor(seconds % 60);
    var ms = Math.round((seconds - Math.floor(seconds)) * 1000);
    if (ms === 1000) { ms = 0; s += 1; }
    var pad = function (n, size) { return String(n).padStart(size, '0'); };
    return pad(h, 2) + ':' + pad(m, 2) + ':' + pad(s, 2) + (comma ? ',' : '.') + pad(ms, 3);
  }

  /* ------------------------------------------------------------------ parse */
  // Accepts SRT, WebVTT or the lazy "Hello --> 00:00:04" style.
  function parse(text) {
    var raw = String(text || '').replace(/\r/g, '').trim();
    if (!raw) return [];
    var blocks = raw.split(/\n{2,}/);
    var cues = [];
    blocks.forEach(function (block) {
      var lines = block.split('\n').map(function (l) { return l.trimEnd(); }).filter(function (l) { return l.length; });
      if (!lines.length) return;
      if (/^WEBVTT/i.test(lines[0])) lines.shift();
      if (!lines.length) return;
      if (/^NOTE\b/i.test(lines[0])) return;

      // find the timing line (may follow a numeric id)
      var timeIdx = -1;
      for (var i = 0; i < Math.min(lines.length, 3); i++) {
        if (lines[i].indexOf('-->') > -1) { timeIdx = i; break; }
      }
      if (timeIdx < 0) return;

      var parts = lines[timeIdx].split('-->');
      var start = parseTimestamp(parts[0]);
      var end = parseTimestamp(parts[1] || '');
      if (start == null) return;
      if (end == null || end <= start) end = start + 2;

      var body = lines.slice(timeIdx + 1).join('\n')
        .replace(/<[^>]+>/g, '')                 // strip karaoke tags / styling
        .replace(/\{\\[^}]*\}/g, '')
        .trim();
      if (!body) return;

      cues.push({ start: +start.toFixed(3), end: +end.toFixed(3), text: body });
    });
    return cues.sort(function (a, b) { return a.start - b.start; });
  }

  /* ------------------------------------------------------------------ build */
  function build(cues, opts) {
    opts = opts || {};
    var maxLine = opts.maxLine || 42;
    var out = [];
    cues.forEach(function (cue, i) {
      if (!cue || !cue.text) return;
      var lines = wrapText(cue.text, maxLine);
      out.push(
        (i + 1) + '\n' +
        fmtTimestamp(cue.start, true) + ' --> ' + fmtTimestamp(cue.end, true) + '\n' +
        lines.join('\n') + '\n'
      );
    });
    return out.join('\n');
  }

  function wrapText(text, maxLine) {
    var words = String(text).split(/\s+/).filter(Boolean);
    var lines = [], line = '';
    words.forEach(function (word) {
      var test = line ? line + ' ' + word : word;
      if (test.length > maxLine && line) { lines.push(line); line = word; }
      else line = test;
    });
    if (line) lines.push(line);
    return lines.length ? lines : [String(text)];
  }

  /* ------------------------------------------------------ timings -> cues */
  // Word timings measured from text-to-speech (or estimated) become cues.
  function fromWords(words, opts) {
    opts = opts || {};
    var maxChars = opts.maxChars || 62;
    var maxSeconds = opts.maxSeconds || 3.4;
    var minSeconds = opts.minSeconds || 0.8;
    var cues = [];
    var current = null;

    words.forEach(function (word) {
      var text = word.word || word.text || '';
      if (!text) return;
      var piece = (current && current.words.length) ? ' ' + text : text;
      var wouldBeLong = current && ((current.text.length + piece.length) > maxChars ||
        (num(word.end, num(word.e, 0)) - current.start) > maxSeconds);
      if (wouldBeLong) { cues.push(current); current = null; }
      var wStart = num(word.start, num(word.s, 0));
      var wEnd = Math.max(wStart + 0.05, num(word.end, num(word.e, wStart + 0.3)));
      if (!current) {
        current = { start: wStart, end: wEnd, text: text, words: [{ w: text, s: wStart, e: wEnd }] };
      } else {
        current.text += piece;
        current.end = wEnd;
        current.words.push({ w: text, s: wStart, e: wEnd });
      }
    });
    if (current) cues.push(current);

    // merge cues that are too short into the previous one
    var merged = [];
    cues.forEach(function (cue) {
      var prev = merged[merged.length - 1];
      if (prev && (cue.end - cue.start) < minSeconds && (cue.end - prev.start) <= maxSeconds + 1) {
        prev.text += ' ' + cue.text;
        prev.end = cue.end;
        prev.words = prev.words.concat(cue.words);
      } else merged.push(cue);
    });
    return merged;
  }

  // Split a plain paragraph into per-word timings by linear interpolation.
  // Used when the browser cannot report boundary events (or in tests).
  function estimateWords(text, start, end) {
    var tokens = String(text || '').split(/\s+/).filter(Boolean);
    if (!tokens.length) return [];
    var span = Math.max(0.2, end - start);
    var weights = tokens.map(function (t) { return Math.max(1, t.replace(/[^\w\u0980-\u09FF]/g, '').length); });
    var total = weights.reduce(function (a, b) { return a + b; }, 0);
    var at = start, out = [];
    tokens.forEach(function (token, i) {
      var dur = span * (weights[i] / total);
      out.push({ word: token, start: +at.toFixed(3), end: +(at + dur).toFixed(3) });
      at += dur;
    });
    return out;
  }

  /* -------------------------------------------------------------- utilities */
  function shift(cues, delta) {
    return cues.map(function (c) {
      return {
        start: Math.max(0, c.start + delta),
        end: Math.max(0.1, c.end + delta),
        text: c.text,
        words: c.words ? c.words.map(function (wd) {
          return { w: wd.w, s: Math.max(0, wd.s + delta), e: Math.max(0, wd.e + delta) };
        }) : undefined
      };
    });
  }

  // Stretch/compress cues so the last one ends exactly at `duration`
  function fitTo(cues, duration) {
    if (!cues.length) return cues;
    var last = num(cues[cues.length - 1].end, 0);
    duration = num(duration, 0);
    if (last <= 0.05) return cues;
    var k = duration / last;
    if (Math.abs(k - 1) < 0.01) return cues;
    return cues.map(function (c) {
      return {
        start: +(num(c.start, 0) * k).toFixed(3),
        end: +(num(c.end, 0) * k).toFixed(3),
        text: c.text,
        words: c.words ? c.words.map(function (wd) {
          return { w: wd.w, s: +(num(wd.s, 0) * k).toFixed(3), e: +(num(wd.e, 0) * k).toFixed(3) };
        }) : undefined
      };
    });
  }

  // Keep cues locked to the audio: trim anything past the end, never rescale.
  // (Scaling is right for text-paced cues, wrong for voice-tracked ones.)
  function clampTo(cues, duration) {
    if (!cues || !cues.length || !(duration > 0)) return cues || [];
    var out = [];
    cues.forEach(function (c) {
      var start = num(c.start, 0);
      if (start >= duration - 0.05) return;
      var end = Math.min(duration, Math.max(start + 0.2, num(c.end, start + 1)));
      out.push({
        start: start, end: end, text: c.text,
        words: c.words ? c.words.filter(function (wd) { return num(wd.s, 0) < duration; }).map(function (wd) {
          return { w: wd.w, s: Math.min(duration, num(wd.s, 0)), e: Math.min(duration, num(wd.e, start + 1)) };
        }) : undefined
      });
    });
    return out;
  }

  function cueAt(cues, time) {
    for (var i = 0; i < cues.length; i++) {
      if (time >= cues[i].start && time < cues[i].end) return cues[i];
    }
    return null;
  }

  function totalDuration(cues) {
    return cues.reduce(function (m, c) { return Math.max(m, c.end); }, 0);
  }

  function plainText(cues) {
    return cues.map(function (c) { return c.text.replace(/\n/g, ' '); }).join(' ');
  }

  CFX.captions = {
    parse: parse,
    build: build,
    fromWords: fromWords,
    estimateWords: estimateWords,
    shift: shift,
    fitTo: fitTo,
    cueAt: cueAt,
    totalDuration: totalDuration,
    plainText: plainText,
    fmtTimestamp: fmtTimestamp,
    num: num,
    clampTo: clampTo,
    parseTimestamp: parseTimestamp,
    wrapText: wrapText
  };
})(typeof window !== 'undefined' ? window : globalThis);
