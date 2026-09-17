/* ============================================================================
   CutFree Studio — procedural music engine (WebAudio, offline rendered)

   Nothing is downloaded: the soundtrack is synthesised from scratch with
   OfflineAudioContext — pads, bass, arpeggio, drums, reverb, sidechain-style
   pumping — so every video gets original, copyright-safe audio for free.
   An optional narration file can be mixed in with automatic ducking.
   ========================================================================== */
(function (w) {
  'use strict';

  var SCALES = {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    dorian: [0, 2, 3, 5, 7, 9, 10]
  };

  // chord progressions as scale degrees, and how busy each mood is
  var PLAN = {
    uplifting: { chords: [0, 4, 5, 3], arp: 0.85, drums: 0.9, lead: 0.6, pad: 0.5, sub: 0.18 },
    cinematic: { chords: [0, 5, 3, 4], arp: 0.35, drums: 0.45, lead: 0.35, pad: 0.85, sub: 0.3 },
    chill: { chords: [0, 3, 5, 4], arp: 0.6, drums: 0.4, lead: 0.3, pad: 0.7, sub: 0.22 },
    tech: { chords: [0, 5, 2, 6], arp: 0.95, drums: 1.0, lead: 0.5, pad: 0.45, sub: 0.3 },
    ambient: { chords: [0, 5, 3, 0], arp: 0.25, drums: 0.12, lead: 0.18, pad: 1.0, sub: 0.24 },
    epic: { chords: [0, 3, 5, 5], arp: 0.5, drums: 0.7, lead: 0.55, pad: 0.9, sub: 0.34 }
  };

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function scaleNote(scale, root, degree) {
    var oct = Math.floor(degree / scale.length);
    var idx = ((degree % scale.length) + scale.length) % scale.length;
    return root + scale[idx] + 12 * oct;
  }

  function makeNoiseBuffer(ctx, seconds) {
    var len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function makeImpulse(ctx, seconds, decay) {
    var len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    var buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (var c = 0; c < 2; c++) {
      var d = buf.getChannelData(c);
      for (var i = 0; i < len; i++) {
        var t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
      }
    }
    return buf;
  }

  /* ----------------------------------------------------------- the composer */
  function render(moodKey, seconds, opts) {
    opts = opts || {};
    var sampleRate = opts.sampleRate || 48000;
    var channels = opts.channels || 2;
    var intensity = opts.intensity == null ? 1 : opts.intensity;
    var seed = opts.seed || 20260917;
    var mood = (w.CFX.MOODS[moodKey] || w.CFX.MOODS.uplifting);
    var plan = PLAN[moodKey] || PLAN.uplifting;
    var scale = SCALES[mood.scale] || SCALES.major;

    var length = Math.max(1, Math.ceil(seconds * sampleRate));
    var ctx = new OfflineAudioContext(channels, length, sampleRate);
    var rand = mulberry32(seed);

    // ---- master chain
    var master = ctx.createGain();
    master.gain.value = 0.9;
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 24; comp.ratio.value = 3;
    comp.attack.value = 0.006; comp.release.value = 0.22;
    master.connect(comp);
    comp.connect(ctx.destination);

    // ---- reverb send
    var reverb = ctx.createConvolver();
    reverb.buffer = makeImpulse(ctx, moodKey === 'ambient' ? 4.5 : 2.6, 2.6);
    var reverbGain = ctx.createGain();
    reverbGain.gain.value = moodKey === 'ambient' ? 0.55 : 0.3;
    reverb.connect(reverbGain);
    reverbGain.connect(master);
    function send(node, amount) {
      var g = ctx.createGain();
      g.gain.value = amount == null ? 0.25 : amount;
      node.connect(g); g.connect(reverb);
    }

    var noise = makeNoiseBuffer(ctx, 2);
    var beat = 60 / mood.bpm;              // seconds per beat
    var bar = beat * 4;
    var bars = Math.ceil(seconds / bar) + 1;

    // ---- pad chords
    function padChord(time, rootDegree, dur) {
      var chord = [0, 2, 4, 6];
      chord.forEach(function (step, i) {
        var midi = scaleNote(scale, mood.key + 48, rootDegree + step);
        [0, 0.6].forEach(function (detune, oi) {
          var osc = ctx.createOscillator();
          osc.type = oi ? 'sawtooth' : 'triangle';
          osc.frequency.value = midiToFreq(midi);
          osc.detune.value = detune * 8 * (oi ? 1 : -1);
          var lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = 620 + plan.pad * 900;
          var g = ctx.createGain();
          var peak = 0.055 * plan.pad * (oi ? 0.5 : 1) * intensity;
          g.gain.setValueAtTime(0.0001, time);
          g.gain.linearRampToValueAtTime(peak, time + dur * 0.25);
          g.gain.linearRampToValueAtTime(0.0001, time + dur * 1.05);
          osc.connect(lp); lp.connect(g); g.connect(master);
          send(g, 0.35);
          osc.start(time); osc.stop(time + dur * 1.1);
        });
      });
    }

    // ---- bass
    function bassNote(time, degree, dur, gain) {
      var midi = scaleNote(scale, mood.key + 24, degree);
      var osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = midiToFreq(midi);
      var sub = ctx.createOscillator();
      sub.type = 'triangle';
      sub.frequency.value = midiToFreq(midi - 12);
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, time);
      g.gain.linearRampToValueAtTime((gain || 0.22) * intensity, time + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
      osc.connect(g); sub.connect(g); g.connect(master);
      osc.start(time); osc.stop(time + dur + 0.02);
      sub.start(time); sub.stop(time + dur + 0.02);
    }

    // ---- pluck / arp
    function pluck(time, midi, gain, dur) {
      var osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = midiToFreq(midi);
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, time);
      g.gain.linearRampToValueAtTime(gain, time + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
      var hp = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 300;
      osc.connect(hp); hp.connect(g); g.connect(master);
      send(g, 0.4);
      osc.start(time); osc.stop(time + dur + 0.02);
    }

    // ---- drums
    function kick(time, gain) {
      var osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, time);
      osc.frequency.exponentialRampToValueAtTime(42, time + 0.13);
      var g = ctx.createGain();
      g.gain.setValueAtTime((gain || 0.5) * intensity, time);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.32);
      osc.connect(g); g.connect(master);
      osc.start(time); osc.stop(time + 0.34);
    }
    function snare(time, gain) {
      var src = ctx.createBufferSource();
      src.buffer = noise;
      var bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.9;
      var g = ctx.createGain();
      g.gain.setValueAtTime((gain || 0.24) * intensity, time);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
      src.connect(bp); bp.connect(g); g.connect(master);
      send(g, 0.3);
      src.start(time); src.stop(time + 0.2);
    }
    function hat(time, gain, open) {
      var src = ctx.createBufferSource();
      src.buffer = noise;
      var hp = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 7800;
      var g = ctx.createGain();
      var d = open ? 0.16 : 0.05;
      g.gain.setValueAtTime((gain || 0.12) * intensity, time);
      g.gain.exponentialRampToValueAtTime(0.0001, time + d);
      src.connect(hp); hp.connect(g); g.connect(master);
      src.start(time); src.stop(time + d + 0.02);
    }

    // ---- "impact" for cinematic / epic openings & finales
    function impact(time, gain) {
      var osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(90, time);
      osc.frequency.exponentialRampToValueAtTime(34, time + 0.6);
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, time);
      g.gain.linearRampToValueAtTime(gain * intensity, time + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 1.4);
      osc.connect(g); g.connect(master);
      send(g, 0.5);
      osc.start(time); osc.stop(time + 1.5);
    }

    // ---- arrangement
    for (var b = 0; b < bars; b++) {
      var t0 = b * bar;
      if (t0 > seconds + bar) break;
      var chordDeg = plan.chords[b % plan.chords.length];
      var third = scaleNote(scale, mood.key + 48, chordDeg);

      padChord(t0, chordDeg, bar * 1.02);

      if (b % 2 === 0) bassNote(t0, chordDeg, beat * 2.6, 0.24);
      if (plan.drums > 0.2) {
        if (b % 2 === 1) bassNote(t0 + beat * 2, chordDeg, beat * 1.6, 0.18);
      }

      // drums per 16th
      var sixteenth = beat / 4;
      for (var s = 0; s < 16; s++) {
        var ts = t0 + s * sixteenth;
        if (ts > seconds) break;
        if (plan.drums > 0.2) {
          if (s === 0 || s === 8 || (plan.drums > 0.7 && s === 11)) kick(ts, s === 0 ? 0.55 : 0.4);
          if (s === 4 || s === 12) snare(ts, plan.drums > 0.7 ? 0.26 : 0.18);
          if (plan.drums > 0.5 && s % 2 === 0) hat(ts, 0.1);
          if (plan.drums > 0.85 && s % 2 === 1) hat(ts, 0.055);
          if (s === 14 && plan.drums > 0.6 && rand() > 0.5) hat(ts, 0.09, true);
        }
      }

      // arpeggio
      if (plan.arp > 0.2) {
        for (var a = 0; a < 8; a++) {
          var ta = t0 + a * (beat / 2);
          if (ta > seconds) break;
          if (rand() > plan.arp) continue;
          var step = [0, 2, 4, 6, 4, 2][a % 6];
          var oct = rand() > 0.72 ? 12 : 0;
          pluck(ta, scaleNote(scale, mood.key + 60, chordDeg + step) + oct,
            0.075 * plan.arp * intensity, beat * (rand() > 0.6 ? 1.4 : 0.7));
        }
      }

      // sparse lead melody
      if (plan.lead > 0.2 && b % 2 === 1) {
        for (var l = 0; l < 4; l++) {
          if (rand() > plan.lead) continue;
          var tl = t0 + l * beat;
          if (tl > seconds) break;
          pluck(tl, scaleNote(scale, mood.key + 60, chordDeg + [0, 2, 4, 7][Math.floor(rand() * 4)]),
            0.07 * plan.lead * intensity, beat * 1.5);
        }
      }
    }

    if (moodKey === 'cinematic' || moodKey === 'epic') {
      impact(0.02, 0.5);
      impact(Math.max(0.5, seconds - 2.2), 0.42);
    }

    // ---- master fades (intro / outro)
    var fadeIn = moodKey === 'ambient' ? 1.6 : 0.8;
    var fadeOut = 1.6;
    master.gain.setValueAtTime(0.0001, 0);
    master.gain.linearRampToValueAtTime(0.9, Math.min(seconds * 0.4, fadeIn));
    master.gain.setValueAtTime(0.9, Math.max(0, seconds - fadeOut));
    master.gain.linearRampToValueAtTime(0.0001, seconds);

    return ctx.startRendering();
  }

  /* ----------------------------------------------- narration + music mixing */
  function bufferToContextSource(ctx, buffer) {
    var src = ctx.createBufferSource();
    var buf = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
    for (var c = 0; c < buffer.numberOfChannels; c++) buf.copyToChannel(buffer.getChannelData(c), c);
    src.buffer = buf;
    return src;
  }

  function rmsEnvelope(buffer, sampleRate, hopMs) {
    var hop = Math.max(1, Math.floor(sampleRate * (hopMs || 50) / 1000));
    var data = buffer.getChannelData(0);
    var out = new Float32Array(Math.ceil(data.length / hop) + 1);
    for (var i = 0; i < out.length; i++) {
      var sum = 0, n = 0;
      for (var j = i * hop; j < Math.min((i + 1) * hop, data.length); j++) { sum += data[j] * data[j]; n++; }
      out[i] = n ? Math.sqrt(sum / n) : 0;
    }
    return { hop: hop, values: out };
  }

  function mix(opts) {
    var sampleRate = opts.sampleRate || 48000;
    var channels = opts.channels || 2;
    var seconds = opts.seconds;
    var length = Math.max(1, Math.ceil(seconds * sampleRate));
    var ctx = new OfflineAudioContext(channels, length, sampleRate);

    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.knee.value = 20; comp.ratio.value = 2.6;
    comp.attack.value = 0.01; comp.release.value = 0.25;
    var master = ctx.createGain();
    master.gain.value = 1;
    master.connect(comp); comp.connect(ctx.destination);

    var musicGain = ctx.createGain();
    musicGain.gain.value = opts.musicGain == null ? 0.85 : opts.musicGain;
    musicGain.connect(master);

    var voiceGain = ctx.createGain();
    voiceGain.gain.value = opts.voiceGain == null ? 1 : opts.voiceGain;
    voiceGain.connect(master);

    if (opts.music) {
      var m = bufferToContextSource(ctx, opts.music);
      m.connect(musicGain);
      m.start(0);
    }

    if (opts.voice) {
      // a title card can delay the narration: the voice starts late, and the
      // music must duck late with it
      var voiceStart = Math.max(0, opts.voiceStart || 0);
      var v = bufferToContextSource(ctx, opts.voice);
      v.connect(voiceGain);
      v.start(voiceStart);

      if (opts.duck !== false) {
        var env = rmsEnvelope(opts.voice, ctx.sampleRate, 50);
        var duckLevel = opts.duckLevel == null ? 0.32 : opts.duckLevel;
        musicGain.gain.setValueAtTime(opts.musicGain == null ? 0.85 : opts.musicGain, 0);
        var speaking = false;
        var musicBase = opts.musicGain == null ? 0.85 : opts.musicGain;
        for (var i = 0; i < env.values.length; i++) {
          var t = i * env.hop / ctx.sampleRate + voiceStart;
          if (t > seconds - 0.05) break;
          var loud = env.values[i] > 0.02;
          if (loud !== speaking) {
            speaking = loud;
            var target = loud ? duckLevel : musicBase;
            // automation times must only move forward, and stay inside the take
            var when = Math.max(t, 0.001);
            musicGain.gain.linearRampToValueAtTime(target, Math.min(seconds - 0.02, when + (loud ? 0.12 : 0.35)));
          }
        }
      }
    }

    // ---- procedural transition SFX
    if (opts.sfx !== false && Array.isArray(opts.sfxTimes)) {
      var sfxGain = opts.sfxGain == null ? 0.24 : opts.sfxGain;
      opts.sfxTimes.forEach(function (st) {
        if (st > 0.15 && st < seconds - 0.3) {
          addTransitionWhoosh(ctx, st, sfxGain);
        }
      });
    }

    return ctx.startRendering();
  }

  function addTransitionWhoosh(ctx, when, targetGain) {
    var dur = 0.36;
    var t0 = Math.max(0.001, when - 0.16);
    var noise = makeNoiseBuffer(ctx, dur);
    var src = ctx.createBufferSource();
    src.buffer = noise;

    var filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 3.5;
    filter.frequency.setValueAtTime(320, t0);
    filter.frequency.exponentialRampToValueAtTime(2400, t0 + dur * 0.5);
    filter.frequency.exponentialRampToValueAtTime(380, t0 + dur);

    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(targetGain || 0.24, t0 + dur * 0.45);
    gain.gain.linearRampToValueAtTime(0.0001, t0 + dur);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    try { src.start(t0); } catch (e) { }
  }

  /* ---------------------------------------------------------- energy profile */
  // normalised 0..1 loudness per bucket — drives music-reactive visuals
  function energy(buffer, seconds, buckets) {
    var out = new Float32Array(buckets);
    if (!buffer) return out;
    var data = buffer.getChannelData(0);
    var per = data.length / buckets;
    var max = 0.0001;
    for (var b = 0; b < buckets; b++) {
      var sum = 0, n = 0;
      for (var i = Math.floor(b * per); i < Math.floor((b + 1) * per) && i < data.length; i++) {
        sum += data[i] * data[i]; n++;
      }
      var rms = n ? Math.sqrt(sum / n) : 0;
      out[b] = rms;
      if (rms > max) max = rms;
    }
    for (var k = 0; k < buckets; k++) out[k] = Math.min(1, out[k] / max);
    return out;
  }

  w.CFX = w.CFX || {};
  w.CFX.music = { render: render, mix: mix, energy: energy, scaleNote: scaleNote, midiToFreq: midiToFreq };
})(window);
