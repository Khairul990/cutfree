/* ============================================================================
   CutFree Studio — narration: browser text-to-speech + voice-over capture

   Three ways to get a voice track, all zero-cost and offline-capable:

   1. TTS timings  — speak each script segment with speechSynthesis and listen to
      `onboundary` word events. That gives real word-level timings, which are
      enough to (a) sync scene durations and (b) burn karaoke captions.
   2. TTS recording — the same run captured to audio through getDisplayMedia
      ("share tab audio", Chrome/Edge desktop). The result is a real AudioBuffer
      that goes into the export mix with automatic ducking.
   3. Your own file — upload an mp3/wav (recorded on a phone, ElevenLabs, etc.).

   When the platform has no voices at all (headless shells, some Linux builds)
   every function degrades to interpolated timings instead of failing, so the
   editor and the auto-director keep working.
   ========================================================================== */
(function (w) {
  'use strict';

  var CFX = w.CFX = w.CFX || {};

  var BN = /^bn|bengali|বাংলা/i;

  function synth() {
    return w.speechSynthesis || null;
  }

  function supported() {
    return !!synth();
  }

  function canCapture() {
    return !!(w.navigator && navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia && w.MediaRecorder);
  }

  /* ------------------------------------------------------------------ voices */
  function listVoices() {
    var s = synth();
    if (!s) return [];
    var voices = s.getVoices() || [];
    return voices
      .filter(function (v) { return v && v.name; })
      .map(function (v) {
        return {
          id: v.voiceURI || v.name,
          name: v.name,
          lang: v.lang || '',
          local: !!v.localService,
          bengali: BN.test(v.lang || '') || BN.test(v.name || ''),
          voice: v
        };
      })
      .sort(function (a, b) {
        if (a.bengali !== b.bengali) return a.bengali ? -1 : 1;
        if (a.local !== b.local) return a.local ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }

  // voices load asynchronously on most browsers
  function voicesReady(timeoutMs) {
    return new Promise(function (resolve) {
      var s = synth();
      if (!s) return resolve([]);
      var initial = listVoices();
      if (initial.length) return resolve(initial);
      var done = false;
      var finish = function () {
        if (done) return;
        done = true;
        resolve(listVoices());
      };
      s.onvoiceschanged = finish;
      setTimeout(finish, timeoutMs || 1500);
    });
  }

  function pickVoice(voices, preferredLang) {
    if (!voices || !voices.length) return null;
    if (preferredLang) {
      var exact = voices.find(function (v) { return v.lang && v.lang.toLowerCase().indexOf(preferredLang) === 0; });
      if (exact) return exact;
    }
    var bn = voices.find(function (v) { return v.bengali; });
    return bn || voices[0];
  }

  /* ------------------------------------------------------------------ timing */
  function estimateSegment(text, startAt, wps) {
    var words = String(text || '').split(/\s+/).filter(Boolean);
    var seconds = Math.max(0.6, words.length / (wps || 2.5)) + 0.35;
    return {
      text: text,
      start: startAt,
      end: startAt + seconds,
      words: CFX.captions.estimateWords(text, startAt, startAt + seconds),
      estimated: true
    };
  }

  function estimatedTimings(segments, opts) {
    opts = opts || {};
    var at = 0, out = [];
    segments.forEach(function (seg) {
      var item = estimateSegment(seg, at, opts.wps);
      out.push(item);
      at = item.end + (opts.pause == null ? 0.22 : opts.pause);
    });
    return { segments: out, duration: at, estimated: true };
  }

  // Speaks each segment and collects word boundary events. This runs in real
  // time (that is how long the narration lasts), so the UI shows progress.
  function measure(segments, opts) {
    opts = opts || {};
    var s = synth();
    var voiceEntry = opts.voice || null;
    var rate = opts.rate == null ? 1 : opts.rate;
    var pitch = opts.pitch == null ? 1 : opts.pitch;
    var lang = opts.lang || (voiceEntry && voiceEntry.lang) || 'bn-BD';
    var pause = opts.pause == null ? 0.22 : opts.pause;
    var onProgress = opts.onProgress || function () { };

    if (!s || !voiceEntry) return Promise.resolve(estimatedTimings(segments, opts));

    return new Promise(function (resolve) {
      var out = [];
      var i = 0;
      var t0 = (w.performance || Date).now();

      function next() {
        if (i >= segments.length) {
          return resolve({ segments: out, duration: out.length ? out[out.length - 1].end : 0, estimated: false });
        }
        var text = String(segments[i] || '').trim();
        if (!text) { i++; return next(); }

        var utter = new w.SpeechSynthesisUtterance(text);
        if (voiceEntry.voice) utter.voice = voiceEntry.voice;
        utter.lang = lang;
        utter.rate = rate;
        utter.pitch = pitch;
        utter.volume = opts.volume == null ? 1 : opts.volume;

        var words = [];
        var segStart = ((w.performance || Date).now() - t0) / 1000;
        var lastBoundary = segStart;

        utter.onboundary = function (ev) {
          if (ev.name && ev.name !== 'word') return;
          var at = ((w.performance || Date).now() - t0) / 1000;
          var charIndex = ev.charIndex || 0;
          var rest = text.slice(charIndex);
          var match = /^[^\s]+/.exec(rest);
          if (!match) return;
          if (words.length) words[words.length - 1].end = +at.toFixed(3);
          words.push({ word: match[0], start: +at.toFixed(3), end: +at.toFixed(3) + 0.25 });
          lastBoundary = at;
        };

        utter.onend = function () {
          var endAt = ((w.performance || Date).now() - t0) / 1000;
          if (words.length) words[words.length - 1].end = +endAt.toFixed(3);
          if (!words.length) words = CFX.captions.estimateWords(text, segStart, endAt);
          out.push({ text: text, start: +segStart.toFixed(3), end: +endAt.toFixed(3), words: words });
          onProgress((i + 1) / segments.length, i + 1, segments.length);
          i++;
          setTimeout(next, Math.round(pause * 1000));
        };

        utter.onerror = function () {
          var endAt = ((w.performance || Date).now() - t0) / 1000;
          out.push({
            text: text, start: +segStart.toFixed(3), end: +endAt.toFixed(3),
            words: CFX.captions.estimateWords(text, segStart, endAt)
          });
          onProgress((i + 1) / segments.length, i + 1, segments.length);
          i++;
          setTimeout(next, Math.round(pause * 1000));
        };

        s.speak(utter);
      }

      next();
    });
  }

  /* ---------------------------------------------------------------- capture */
  // Records the tab's audio (which is where speechSynthesis lands) while the
  // narration is spoken. Returns an AudioBuffer plus the measured timings.
  function record(segments, opts) {
    opts = opts || {};
    var audioCtx = opts.audioContext || new (w.AudioContext || w.webkitAudioContext)();
    var sampleRate = opts.sampleRate || 48000;

    return navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      preferCurrentTab: true,
      selfBrowserSurface: 'include'
    }).then(function (displayStream) {
      var audioTracks = displayStream.getAudioTracks();
      if (!audioTracks.length) {
        displayStream.getTracks().forEach(function (t) { t.stop(); });
        throw new Error('no-audio-track');
      }

      var audioStream = new w.MediaStream(audioTracks);
      var chunks = [];
      var mime = '';
      ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].some(function (m) {
        try { if (w.MediaRecorder.isTypeSupported(m)) { mime = m; return true; } } catch (e) { }
        return false;
      });
      var rec = new w.MediaRecorder(audioStream, mime ? { mimeType: mime } : undefined);
      rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };

      var speechStart = 0;
      rec.start(250);
      var startedAt = (w.performance || Date).now();

      return measure(segments, Object.assign({}, opts, {
        onProgress: function (p, i, n) {
          if (!speechStart) speechStart = ((w.performance || Date).now() - startedAt) / 1000;
          if (opts.onProgress) opts.onProgress(p, i, n);
        }
      })).then(function (timings) {
        var speechEnd = ((w.performance || Date).now() - startedAt) / 1000;
        return new Promise(function (resolve) {
          rec.onstop = function () {
            displayStream.getTracks().forEach(function (t) { t.stop(); });
            var blob = new Blob(chunks, { type: mime || 'audio/webm' });
            blob.arrayBuffer().then(function (ab) {
              return audioCtx.decodeAudioData(ab);
            }).then(function (buffer) {
              resolve({ buffer: buffer, timings: timings, offset: speechStart, end: speechEnd, blob: blob });
            })['catch'](function () {
              resolve({ buffer: null, timings: timings, offset: speechStart, end: speechEnd, blob: blob, decodeFailed: true });
            });
          };
          try { rec.stop(); } catch (e) {
            resolve({ buffer: null, timings: timings, offset: speechStart, end: speechEnd });
          }
        });
      });
    });
  }

  // Trims the silence in front of the captured narration and returns a buffer
  // that starts at the first segment's beginning.
  function trimToOffset(buffer, offset, fadeIn) {
    if (!buffer) return null;
    var sampleRate = buffer.sampleRate;
    var startSample = Math.max(0, Math.floor((offset - 0.15) * sampleRate));
    if (startSample <= 0) return buffer;
    var length = buffer.length - startSample;
    if (length <= 0) return buffer;
    var out = w.AudioContext
      ? new (w.AudioContext || w.webkitAudioContext)().createBuffer(buffer.numberOfChannels, length, sampleRate)
      : null;
    if (!out) return buffer;
    for (var c = 0; c < buffer.numberOfChannels; c++) {
      out.copyToChannel(buffer.getChannelData(c).subarray(startSample, startSample + length), c);
    }
    return out;
  }

  function stop() {
    var s = synth();
    if (s) { try { s.cancel(); } catch (e) { } }
  }

  CFX.voice = {
    supported: supported,
    canCapture: canCapture,
    listVoices: listVoices,
    voicesReady: voicesReady,
    pickVoice: pickVoice,
    measure: measure,
    estimatedTimings: estimatedTimings,
    record: record,
    trimToOffset: trimToOffset,
    stop: stop
  };
})(window);
