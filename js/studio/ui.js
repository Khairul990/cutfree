/* ============================================================================
   CutFree Studio — workbench UI
   Wires the brief -> auto-director -> engine -> encoder -> publish pack flow.
   ========================================================================== */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var t = function (k, v) { return window.cfT(k, v); };

  function store(key, val) {
    try {
      if (val === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, val);
    } catch (e) { }
    return val;
  }

  function fmtTime(sec) {
    if (!isFinite(sec)) sec = 0;
    var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }
  function fmtSize(bytes) {
    if (!bytes) return '—';
    var u = ['B', 'KB', 'MB', 'GB'], i = 0, b = bytes;
    while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
    return (b < 10 && i ? b.toFixed(1) : Math.round(b)) + ' ' + u[i];
  }
  function slug(s) {
    return String(s || 'video').toLowerCase()
      .replace(/[^\w\u0980-\u09FF\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 48) || 'video';
  }
  function toast(msg) {
    var el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    requestAnimationFrame(function () { el.classList.add('show'); });
    clearTimeout(toast._t);
    toast._t = setTimeout(function () {
      el.classList.remove('show');
      setTimeout(function () { el.hidden = true; }, 250);
    }, 3400);
  }

  /* ------------------------------------------------------------------- state */
  var S = {
    spec: null,
    renderer: null,
    meta: null,
    musicBuffer: null,
    musicBlobUrl: null,
    voiceBuffer: null,
    logoImage: null,
    playing: false,
    currentTime: 0,
    wallStart: 0,
    raf: 0,
    audioCtx: null,
    musicNode: null,
    queue: [],
    rendering: false,
    cancelRequested: false,
    thumbTime: null,
    rendererKey: 0,
    timings: null,        // measured / estimated narration timing
    voiceBuffer: null,    // captured or uploaded narration audio
    track: null,          // voice-tracked alignment (CFX.align.track)
    alignPlayhead: 0,
    srtCues: null,        // imported captions
    voice: null,          // selected TTS voice entry
    recording: false
  };

  /* ------------------------------------------------------------------ i18n UI */
  function applyStrings() {
    $$('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      var txt = t(key);
      if (txt !== key) el.textContent = txt;
    });
    document.documentElement.lang = window.CF_LANG === 'en' ? 'en' : 'bn';
    renderThemePicker();
    renderMoodOptions();
    updateEnginePill();
  }

  function updateEnginePill() {
    var pill = $('#enginePill');
    var fast = window.CFX.encode.supportsWebCodecs();
    pill.textContent = fast ? t('stEngineFast') : t('stEngineCompat');
    pill.classList.toggle('compat', !fast);
  }

  /* ------------------------------------------------------------ form -> spec */
  function readForm() {
    var batch = window.CFX.director.batch($('#fScript').value, { seed: 1000 });
    var multi = batch.length > 1;
    var first = batch[0] || { title: $('#fTitle').value.trim(), script: $('#fScript').value, seed: 1000 };
    return {
      items: batch.length ? batch : [{
        title: $('#fTitle').value.trim(),
        script: $('#fScript').value,
        seed: 1000
      }],
      multi: multi,
      options: {
        title: first.title,
        script: first.script,
        seed: first.seed,
        theme: $('.swatch.on') ? $('.swatch.on').dataset.theme : undefined,
        mood: $('#fMood').value,
        aspect: $('#fAspect').value,
        quality: $('#fQuality').value,
        fps: parseInt($('#fFps').value, 10),
        perf: $('#fPerf').value,
        durationTarget: parseFloat($('#fDuration').value) || undefined,
        watermark: $('#fWatermark').value.trim(),
        showProgress: $('#fProgress').checked,
        logoDataUrl: S.logoImage ? S.logoImage.src : null,
        language: window.CF_LANG === 'en' ? 'en' : 'bn',
        shorts: $('#fShorts').checked,
        story: $('#fStory').checked,
        multi: multi,
        captionStyle: $('#fCaptionStyle').value,
        captionCues: S.srtCues || null,
        fitCaptions: true
      }
    };
  }

  function narrationSegments(form) {
    // one narration segment per script paragraph (same order the director uses)
    var text = form.items[0].script || '';
    return text.split(/\n\s*\n+/).map(function (b) { return b.replace(/\s+/g, ' ').trim(); }).filter(Boolean);
  }

  function buildSpec(item, options) {
    var opts = Object.assign({}, options, {
      title: item.title, script: item.script, seed: item.seed
    });

    // ---- story mode: the voice drives everything (scenes, typography, captions)
    if (opts.story) {
      opts.aspect = opts.shorts ? '9:16' : opts.aspect;
      var rawScript = ($('#fScript').value || '').trim();
      var scriptForStory = opts.multi ? item.script : (rawScript || item.script);

      // a track belongs to the script it was measured on — a different script in
      // the same session (e.g. the next item of a batch) falls back to text pace
      var track = S.track;
      if (track) {
        var have = (track.words || []).length;
        var want = window.CFX.align.words(scriptForStory).length;
        if (!have || Math.abs(have - want) / Math.max(1, want) > 0.25) track = null;
      }
      if (!track) track = window.CFX.align.proportional(scriptForStory, { wps: 2.45 });
      var typedTitle = ($('#fTitle').value || '').trim();
      var spec2 = window.CFX.story.plan({
        title: typedTitle || item.title, script: scriptForStory, track: track,
        kicker: $('#fKicker').value.trim(), endCard: $('#fEndCard').value.trim(),
        style: $('#fStoryStyle').value, language: opts.language,
        theme: opts.theme, mood: opts.mood, aspect: opts.aspect, quality: opts.quality,
        fps: opts.fps, perf: opts.perf, shorts: opts.shorts,
        captionStyle: $('#fCaptionStyle').value, watermark: opts.watermark,
        logoDataUrl: opts.logoDataUrl, seed: item.seed
      });
      if (spec2) {
        spec2.meta.captions = Object.assign({}, spec2.meta.captions, {
          enabled: $('#fCaptionStyle').value !== 'none'
        });
        return spec2;
      }
      toast(t('stQuotaLow'));
    }

    if (opts.shorts) {
      opts.aspect = '9:16';
      opts.durationTarget = Math.min(opts.durationTarget || 45, 58);
      if (!opts.captionStyle || opts.captionStyle === 'bar') opts.captionStyle = 'karaoke';
    }

    var spec = window.CFX.director.build(opts);

    // narration first: a tracked voice (or TTS timings) drives the scene lengths
    if (S.track && $('#fNarrFit').checked) {
      window.CFX.director.fitToNarration(spec, timingsFromTrack(S.track));
      spec.meta.voiceStart = S.track.voiceStart || 0;
    } else if (S.timings && $('#fNarrFit').checked) {
      window.CFX.director.fitToNarration(spec, S.timings);
    }
    // ...and the captions (an imported SRT wins over tracked/TTS timing)
    if (S.srtCues && S.srtCues.length) {
      spec.captions = window.CFX.captions.fitTo(S.srtCues, spec.scenes.reduce(function (a, x) { return a + x.dur; }, 0));
      spec.meta.captions = Object.assign({}, spec.meta.captions, { enabled: $('#fCaptionStyle').value !== 'none' });
    } else if (S.track && S.track.cues && S.track.cues.length) {
      spec.captions = window.CFX.captions.clampTo(S.track.cues.map(function (c) {
        return { start: c.start + (spec.meta.voiceStart || 0), end: c.end + (spec.meta.voiceStart || 0), text: c.text,
          words: c.words ? c.words.map(function (wd) { return { w: wd.w, s: wd.s + (spec.meta.voiceStart || 0), e: wd.e + (spec.meta.voiceStart || 0) }; }) : undefined };
      }), spec.scenes.reduce(function (a, x) { return a + x.dur; }, 0));
      spec.meta.captions = Object.assign({}, spec.meta.captions, { enabled: $('#fCaptionStyle').value !== 'none' });
    } else if (S.timings) {
      var cues = window.CFX.director.captionsFromTimings(S.timings);
      if (cues.length) {
        spec.captions = window.CFX.captions.fitTo(cues, spec.scenes.reduce(function (a, x) { return a + x.dur; }, 0));
        spec.meta.captions = Object.assign({}, spec.meta.captions, { enabled: $('#fCaptionStyle').value !== 'none' });
      }
    }
    if (spec.meta.captions) spec.meta.captions.style = $('#fCaptionStyle').value;

    if (S.logoImage) spec.meta.logoImage = S.logoImage;
    return spec;
  }

  function prepareSpec(spec, withMusic) {
    var total = spec.scenes.reduce(function (a, s) { return a + s.dur; }, 0);
    var jobs = [];

    var musicGain = ($('#fMusicVol') ? parseFloat($('#fMusicVol').value) : 85) / 100;
    var voiceGain = ($('#fVoiceVol') ? parseFloat($('#fVoiceVol').value) : 100) / 100;
    var duckLevel = $('#fDuckLevel') ? parseFloat($('#fDuckLevel').value) : 0.32;
    var sfx = $('#fSfx') ? $('#fSfx').checked : true;
    var sfxTimes = [];
    var acc = 0;
    spec.scenes.forEach(function (sc) {
      if (acc > 0) sfxTimes.push(acc);
      acc += sc.dur;
    });

    if (withMusic || S.voiceBuffer) {
      var mood = spec.meta.mood;
      jobs.push(window.CFX.music.render(mood, total, { seed: spec.meta.seed }).then(function (music) {
        S.musicBuffer = music;
        if (S.voiceBuffer || sfx) {
          return window.CFX.music.mix({
            music: music, voice: S.voiceBuffer, seconds: total,
            voiceStart: spec.meta.voiceStart || 0,
            sampleRate: music.sampleRate, channels: 2,
            musicGain: musicGain,
            voiceGain: voiceGain,
            duckLevel: duckLevel,
            sfx: sfx,
            sfxTimes: sfxTimes
          }).then(function (mixed) {
            return mixed;
          });
        }
        return music;
      }));
    } else {
      S.musicBuffer = null;
      jobs.push(Promise.resolve(null));
    }

    return Promise.all(jobs).then(function (res) {
      var buffer = res[0];
      if (buffer) {
        spec.energy = window.CFX.music.energy(buffer, total, Math.max(8, Math.round(total * 10)));
      }
      return { spec: spec, audioBuffer: buffer, total: total };
    });
  }

  /* --------------------------------------------------------------- preview */
  function setPlan(spec, audioBuffer) {
    S.spec = spec;
    S.musicBuffer = audioBuffer || null;
    S.rendererKey++;
    var canvas = $('#preview');
    S.renderer = window.CFX.engine.createRenderer(canvas, spec);
    S.currentTime = 0;
    renderSceneStrip();
    renderPlanStats();
    fillMetadata(spec);
    paintThumb(spec);
    seek(0);
  }

  function renderSceneStrip() {
    var strip = $('#sceneStrip');
    strip.innerHTML = '';
    var starts = S.renderer.starts;
    S.spec.scenes.forEach(function (sc, i) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'scene-chip';
      chip.textContent = (i + 1) + '. ' + (sc.label || sc.title || sc.heading || sc.text || sc.items && sc.items[0] || sc.type).toString().slice(0, 22) +
        ' · ' + sc.dur.toFixed(1) + 's';
      chip.addEventListener('click', function () { seek(starts[i] + 0.05); });
      strip.appendChild(chip);
    });
  }

  function renderPlanStats() {
    var spec = S.spec;
    var total = S.renderer.duration;
    var bitrate = spec.width * spec.height * spec.fps * 0.11 + 128000;
    var est = bitrate * total / 8;
    $('#planStats').innerHTML =
      '<span>' + spec.scenes.length + ' ' + (window.CF_LANG === 'en' ? 'scenes' : 'সিন') + '</span>' +
      '<span><b>' + fmtTime(total) + '</b></span>' +
      '<span><b>' + spec.width + '×' + spec.height + '</b> @ ' + spec.fps + 'fps</span>' +
      '<span>' + t('stEstSize') + ': <b>' + fmtSize(est) + '</b></span>' +
      '<span>' + (window.CF_LANG === 'en' ? 'theme' : 'থিম') + ': <b>' + (window.CFX.THEMES[spec.meta.theme].name[window.CF_LANG === 'en' ? 'en' : 'bn']) + '</b></span>' +
      '<span>' + (window.CF_LANG === 'en' ? 'mood' : 'মুড') + ': <b>' + (window.CFX.MOODS[spec.meta.mood].name[window.CF_LANG === 'en' ? 'en' : 'bn']) + '</b></span>';
  }

  function paint() {
    if (!S.renderer) return;
    S.renderer.renderAt(S.currentTime);
    var dur = S.renderer.duration;
    var cur = S.renderer.sceneAt(S.currentTime);
    if (cur) {
      var label = cur.scene.title || cur.scene.heading ||
        (cur.scene.type === 'broll' ? (window.CF_LANG === 'en' ? 'visual' : 'ভিজ্যুয়াল') : cur.scene.type);
      $('#sceneChip').textContent = (cur.index + 1) + '/' + S.spec.scenes.length + ' · ' + String(label).slice(0, 26);
      $$('.scene-chip').forEach(function (c, i) { c.classList.toggle('on', i === cur.index); });
    }
    $('#timeLabel').textContent = fmtTime(S.currentTime) + ' / ' + fmtTime(dur);
    $('#scrub').value = String((S.currentTime / dur) * 1000);
  }

  function loop() {
    if (!S.playing) return;
    var dur = S.renderer.duration;
    S.currentTime = (performance.now() - S.wallStart) / 1000;
    if (S.currentTime >= dur) {
      S.currentTime = dur - 0.02;
      pause();
      paint();
      return;
    }
    paint();
    S.raf = requestAnimationFrame(loop);
  }

  function startMusicFrom(offset) {
    if (!S.musicBuffer || !$('#fMusic').checked) return;
    try {
      if (!S.audioCtx) S.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (S.audioCtx.state === 'suspended') S.audioCtx.resume();
      stopMusic();
      S.musicNode = S.audioCtx.createBufferSource();
      S.musicNode.buffer = S.musicBuffer;
      S.musicNode.connect(S.audioCtx.destination);
      S.musicNode.start(0, Math.min(offset, Math.max(0, S.musicBuffer.duration - 0.05)));
    } catch (e) { }
  }
  function stopMusic() {
    if (S.musicNode) { try { S.musicNode.stop(); } catch (e) { } S.musicNode = null; }
  }

  function play() {
    if (!S.renderer) return;
    if (S.currentTime >= S.renderer.duration - 0.05) S.currentTime = 0;
    S.playing = true;
    S.wallStart = performance.now() - S.currentTime * 1000;
    $('#btnPlay').textContent = '⏸';
    startMusicFrom(S.currentTime);
    loop();
  }
  function pause() {
    S.playing = false;
    cancelAnimationFrame(S.raf);
    $('#btnPlay').textContent = '▶';
    stopMusic();
  }
  function seek(time) {
    if (!S.renderer) return;
    S.currentTime = Math.max(0, Math.min(S.renderer.duration - 0.02, time));
    if (S.playing) { S.wallStart = performance.now() - S.currentTime * 1000; startMusicFrom(S.currentTime); }
    paint();
  }

  /* -------------------------------------------------------------- metadata */
  function fillMetadata(spec) {
    var opts = {
      privacyStatus: $('#fPrivacy').value,
      scheduleStart: $('#fSchedule').value || null,
      everyHours: 24,
      atHourUtc: 12
    };
    S.meta = (spec.meta && spec.meta.story && window.CFX.story)
      ? window.CFX.story.metadata(spec, opts)
      : window.CFX.director.metadata(spec, opts);
    $('#ytTitle').value = S.meta.title;
    $('#ytDesc').value = S.meta.description;
    $('#ytTags').value = S.meta.tags.join(', ');
  }

  function currentMeta() {
    if (!S.meta) return null;
    return Object.assign({}, S.meta, {
      title: $('#ytTitle').value.slice(0, 100),
      description: $('#ytDesc').value,
      tags: $('#ytTags').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean),
      privacyStatus: $('#fPrivacy').value,
      publishAt: S.meta.publishAt
    });
  }

  /* ------------------------------------------------------------- thumbnail */
  function paintThumb(spec) {
    if (!spec) return;
    var at = (S.thumbTime == null) ? spec.scenes[0].dur * 0.6 : S.thumbTime;
    var shot = window.CFX.publish.thumbnail(spec, at, {
      width: spec.meta.aspect === '9:16' ? 720 : 1280,
      height: spec.meta.aspect === '9:16' ? 1280 : 720
    });
    shot.renderer.renderAt(shot.time);
    var out = $('#thumb');
    out.width = shot.canvas.width;
    out.height = shot.canvas.height;
    out.getContext('2d').drawImage(shot.canvas, 0, 0);
  }

  /* -------------------------------------------------------------- rendering */
  function renderOne(spec, audioBuffer, opts) {
    opts = opts || {};
    var canvas = document.createElement('canvas');
    canvas.width = spec.width;
    canvas.height = spec.height;
    var renderer = window.CFX.engine.createRenderer(canvas, spec);

    setProgress(0, t('stRendering'));
    $('#renderChip').textContent = opts.mode === 'compat' ? t('stEngineCompat') : t('stEngineFast');

    return window.CFX.encode.render({
      renderer: renderer,
      canvas: canvas,
      spec: spec,
      audioBuffer: audioBuffer,
      fps: spec.fps,
      width: spec.width,
      height: spec.height,
      engine: opts.mode === 'compat' ? 'compat' : 'fast',
      preferMp4: !!opts.preferMp4,
      onProgress: function (p, i, n) {
        setProgress(p, t('stRendering') + ' · ' + Math.round(p * 100) + '% · ' + i + '/' + n);
      },
      shouldCancel: function () { return S.cancelRequested; },
      onFallback: function () { toast(t('stRenderFail')); }
    }).then(function (result) {
      if (!result) return null;
      return result;
    });
  }

  function setProgress(p, note) {
    $('#progressWrap').hidden = false;
    $('#progressBar').style.width = (Math.max(0, Math.min(1, p)) * 100).toFixed(1) + '%';
    $('#progressText').textContent = Math.round(Math.max(0, Math.min(1, p)) * 100) + '%';
    $('#progressNote').textContent = note || '';
  }

  function pushQueueEntry(item) {
    var li = document.createElement('li');
    li.className = 'queue-item';
    var name = slug(item.meta.title) + '.' + item.ext + (item.variant ? '.' + item.variant : '');
    item.fileName = name;
    li.innerHTML =
      '<div class="q-top"><span class="q-name"></span><span class="q-status">' + t('stDone') + '</span></div>' +
      '<div class="q-status meta"></div>' +
      '<div class="q-bar"><i style="width:100%"></i></div>' +
      '<div class="q-actions"></div>';
    li.querySelector('.q-name').textContent = item.meta.title.slice(0, 42);
    li.querySelector('.meta').textContent = fmtTime(item.duration) + ' · ' + item.width + '×' + item.height + ' · ' + fmtSize(item.blob.size) + ' · ' + item.ext.toUpperCase() +
      (item.meta.publishAt ? ' · 📅 ' + item.meta.publishAt.slice(0, 16).replace('T', ' ') + 'Z' : '');

    var actions = li.querySelector('.q-actions');
    var mk = function (label, fn) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn ghost';
      b.textContent = label;
      b.addEventListener('click', fn);
      actions.appendChild(b);
      return b;
    };
    mk(t('stDownload'), function () { window.CFX.publish.downloadBlob(item.blob, name); });
    mk(t('stWatch'), function () { openPlayer(item); });
    mk(t('stPack'), function () { savePackFor(item); });
    if (item.meta) mk(t('stUploadOne'), function () { uploadItem(item); });

    $('#queue').prepend(li);
    item.li = li;
    item.statusEl = li.querySelector('.q-status');
    S.queue.push(item);
    return item;
  }

  function openPlayer(item) {
    var url = URL.createObjectURL(item.blob);
    var modal = document.createElement('div');
    modal.className = 'player-modal';
    modal.innerHTML = '<div class="pm-inner"><video controls autoplay playsinline></video>' +
      '<div class="pm-bar"><span class="pm-title"></span><button class="btn ghost small">✕</button></div></div>';
    modal.querySelector('.pm-title').textContent = item.meta.title;
    modal.querySelector('video').src = url;
    modal.querySelector('button').addEventListener('click', function () {
      modal.remove();
      URL.revokeObjectURL(url);
    });
    modal.addEventListener('click', function (e) { if (e.target === modal) { modal.remove(); URL.revokeObjectURL(url); } });
    document.body.appendChild(modal);
  }

  function savePackFor(item) {
    if (!item.spec) return;
    var meta = item.meta;
    window.CFX.publish.thumbnailBlob(item.spec, item.thumbTime, {
      width: item.spec.meta.aspect === '9:16' ? 720 : 1280,
      height: item.spec.meta.aspect === '9:16' ? 1280 : 720
    }).then(function (thumb) {
      return window.CFX.publish.animationHtml(item.spec, meta).then(function (animHtml) {
        return { thumb: thumb, animHtml: animHtml };
      });
    }).then(function (extra) {
      var files = window.CFX.publish.packFiles(item.spec, meta, [
        { name: item.fileName, blob: item.blob },
        { name: 'thumbnail.png', blob: extra.thumb.blob },
        { name: 'thumbnail.jpg', blob: extra.thumb.blob }
      ]);
      files.push({
        name: slug(meta.title) + '.animation.html',
        blob: new Blob([extra.animHtml], { type: 'text/html' })
      });
      return window.CFX.publish.savePack(files, slug(meta.title));
    }).then(function (res) {
      toast(t('stPacked', { mode: res.mode, n: res.count || 0 }));
    })['catch'](function (err) {
      toast('pack: ' + (err && err.message ? err.message : 'failed'));
    });
  }

  /* ------------------------------------------------------------ upload flow */
  function uploadItem(item) {
    var clientId = ($('#fClientId').value || store('cutfree.clientId') || '').trim();
    if (!clientId) { toast(t('stNeedClientId')); return; }
    store('cutfree.clientId', clientId);
    var meta = item.meta;
    toast(t('stUploading'));
    window.CFX.publish.youtube.getToken(clientId).then(function (token) {
      return window.CFX.publish.youtube.upload({
        accessToken: token,
        blob: item.blob,
        title: meta.title,
        description: meta.description,
        tags: meta.tags,
        categoryId: meta.categoryId,
        defaultLanguage: meta.defaultLanguage,
        privacyStatus: meta.privacyStatus,
        publishAt: meta.publishAt
      }).then(function (video) {
        return window.CFX.publish.thumbnailBlob(item.spec, item.thumbTime)
          .then(function (thumb) { return window.CFX.publish.youtube.setThumbnail(token, video.id, thumb.blob); })
          .then(function () { return video; });
      });
    }).then(function (video) {
      toast(t('stUploadDone', { id: video.id }));
      item.statusEl.textContent = '✅ youtube:' + video.id;
      item.statusEl.classList.add('done');
    })['catch'](function (err) {
      toast(t('stUploadFail'));
      item.statusEl.textContent = '⚠️ ' + (err && err.message ? err.message.slice(0, 60) : 'upload failed');
      item.statusEl.classList.add('error');
    });
  }

  /* --------------------------------------------------------------- the flow */
  function buildCurrentPlan() {
    var form = readForm();
    if (!form.items[0] || (!form.items[0].script || form.items[0].script.trim().length < 8) && !form.items[0].title) {
      toast(t('stNeedScript'));
      return null;
    }
    var spec = buildSpec(form.items[0], form.options);
    toast(t('stMusicRendering'));
    return prepareSpec(spec, $('#fMusic').checked).then(function (prepared) {
      setPlan(prepared.spec, prepared.audioBuffer);
      toast(t('stPlanReady'));
      return { form: form, spec: prepared.spec, audioBuffer: prepared.audioBuffer };
    });
  }

  function renderWith(mode, preferMp4) {
    if (!S.spec) {
      buildCurrentPlan().then(function (b) { if (b) renderWith(mode, preferMp4); });
      return;
    }
    S.rendering = true;
    S.cancelRequested = false;
    $('#btnRender').disabled = true;
    $('#btnRenderCompat').disabled = true;
    $('#btnCancelRender').hidden = false;

    renderOne(S.spec, S.musicBuffer, { mode: mode, preferMp4: preferMp4 }).then(function (result) {
      S.rendering = false;
      $('#btnRender').disabled = false;
      $('#btnRenderCompat').disabled = false;
      $('#btnCancelRender').hidden = true;
      if (!result) { toast(t('stCancelled')); $('#progressWrap').hidden = true; return; }
      setProgress(1, t('stRenderDone'));
      var item = pushQueueEntry({
        blob: result.blob,
        ext: result.ext,
        duration: result.duration || S.renderer.duration,
        width: S.spec.width,
        height: S.spec.height,
        spec: S.spec,
        meta: currentMeta(),
        thumbTime: S.spec.scenes[0].dur * 0.6,
        mode: result.mode,
        variant: result.mode === 'mediarecorder' ? 'compat' : ''
      });
      $('#renderChip').textContent = (result.mode === 'webcodecs' ? t('stEngineFast') : t('stEngineCompat')) + ' · ' + fmtSize(result.blob.size);
      toast(t('stRenderDone') + ' · ' + fmtSize(result.blob.size));
      setTimeout(function () { $('#progressWrap').hidden = true; }, 1500);
      return item;
    })['catch'](function (err) {
      S.rendering = false;
      $('#btnRender').disabled = false;
      $('#btnRenderCompat').disabled = false;
      $('#btnCancelRender').hidden = true;
      toast(t('stRenderFail') + ' (' + (err && err.message ? err.message.slice(0, 60) : '?') + ')');
    });
  }

  function queueBatch() {
    var form = readForm();
    if (!form.items.length || !$('#fScript').value.trim()) { toast(t('stNeedScript')); return; }
    form.items = form.items.filter(function (it) { return (it.script || '').trim().length > 8; });
    if (!form.items.length) { toast(t('stNeedScript')); return; }
    toast(t('stBatchStart', { n: form.items.length }));

    var scheduleStart = $('#fSchedule').value ? new Date($('#fSchedule').value) : null;
    var index = 0;

    (function next() {
      if (index >= form.items.length) {
        toast(t('stRenderDone'));
        return;
      }
      var item = form.items[index];
      var spec = buildSpec(item, form.options);
      if (scheduleStart) {
        var when = new Date(scheduleStart.getTime() + index * 24 * 3600 * 1000);
        spec.meta.scheduleDate = when.toISOString().slice(0, 10);
      }
      var prepared;
      prepareSpec(spec, $('#fMusic').checked).then(function (p) {
        prepared = p;
        var meta = window.CFX.director.metadata(p.spec, {
          scheduleStart: spec.meta.scheduleDate || ($('#fSchedule').value || null),
          everyHours: 24, atHourUtc: 12, privacyStatus: $('#fPrivacy').value
        });
        var canvas = document.createElement('canvas');
        canvas.width = p.spec.width; canvas.height = p.spec.height;
        var renderer = window.CFX.engine.createRenderer(canvas, p.spec);
        setProgress(0, t('stRendering') + ' · ' + (index + 1) + '/' + form.items.length);
        return window.CFX.encode.render({
          renderer: renderer, canvas: canvas, spec: p.spec, audioBuffer: p.audioBuffer,
          fps: p.spec.fps, width: p.spec.width, height: p.spec.height, engine: 'fast',
          onProgress: function (pr) { setProgress(pr, t('stRendering') + ' · ' + (index + 1) + '/' + form.items.length + ' · ' + Math.round(pr * 100) + '%'); },
          shouldCancel: function () { return false; },
          onFallback: function () { }
        }).then(function (result) {
          if (result) {
            pushQueueEntry({
              blob: result.blob, ext: result.ext, duration: result.duration,
              width: p.spec.width, height: p.spec.height, spec: p.spec, meta: meta,
              thumbTime: p.spec.scenes[0].dur * 0.6, mode: result.mode, variant: ''
            });
          }
          index++;
          toast(t('stBatchNext'));
          setTimeout(next, 250);
        });
      })['catch'](function (err) {
        index++;
        toast('⚠️ ' + (err && err.message ? err.message.slice(0, 50) : 'batch item failed'));
        setTimeout(next, 250);
      });
    })();
  }



  /* ------------------------------------------------------- voice tracking */
  // Turn a tracked alignment into the {segments} shape the director uses for
  // narration-fit and the classic flow.
  function timingsFromTrack(track) {
    return {
      segments: (track.paragraphs || []).map(function (p) {
        return {
          text: p.text, start: p.start, end: p.end,
          words: p.words.map(function (wd) { return { word: wd.word, start: wd.start, end: wd.end }; })
        };
      }),
      duration: track.duration,
      estimated: !!track.estimated
    };
  }

  function trackVoice(fromRecording) {
    var script = $('#fScript').value || '';
    if (!S.voiceBuffer) { toast(t('stTrackNoVoice')); return Promise.resolve(null); }
    if (script.trim().length < 8) { toast(t('stNeedScript')); return Promise.resolve(null); }

    setProgress(0.35, t('stTracking'));
    return new Promise(function (resolve) {
      setTimeout(function () {
        var track = null;
        try {
          track = window.CFX.align.track(S.voiceBuffer, script, {
            sampleRate: S.voiceBuffer.sampleRate,
            wps: 2.45
          });
        } catch (e) {
          track = null;
        }
        $('#progressWrap').hidden = true;
        if (!track) { toast(t('stTrackEstimated')); resolve(null); return; }
        S.track = track;
        S.track.voiceStart = 0;                       // the story planner sets the real shift
        S.trackScript = script;
        renderAlign();
        toast((track.estimated ? t('stTrackEstimated') : t('stTracked')) + ' · ' + fmtTime(track.duration));
        showVoiceNote(track.estimated ? t('stTrackEstimated')
          : (t('stTracked') + ' · ' + track.phrases.length + ' •'), track.estimated ? 'warn' : 'ok');
        if (S.spec) buildCurrentPlan();
        resolve(track);
      }, 30);
    });
  }

  // ---------- the alignment timeline: waveform, phrases, lines and playhead
  function renderAlign() {
    var wrap = $('#alignWrap');
    var canvas = $('#alignCanvas');
    var track = S.track;
    if (!track) { wrap.hidden = true; return; }
    wrap.hidden = false;

    var stats = t('alignStats', {
      phrases: (track.phrases || []).length,
      speech: Math.round((track.speechRatio || 0) * 100),
      dur: fmtTime(track.duration),
      words: (track.words || []).length,
      wps: (track.words && track.duration ? (track.words.length / track.duration).toFixed(1) : '0')
    });
    $('#alignStats').textContent = stats + (track.estimated ? ' · ' + t('voiceEstimated') : '');

    var cssW = canvas.clientWidth || 520;
    var cssH = 130;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    var c = canvas.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cssW, cssH);

    var theme = (window.CFX.THEMES && window.CFX.THEMES[$('.swatch.on') ? $('.swatch.on').dataset.theme : 'aurora']) || window.CFX.THEMES.aurora;
    var dur = Math.max(0.1, track.duration || 1);
    var xOf = function (t2) { return (t2 / dur) * cssW; };

    // background + speech blocks
    c.fillStyle = 'rgba(8,12,26,.55)';
    c.fillRect(0, 0, cssW, cssH);
    (track.phrases || []).forEach(function (ph) {
      c.fillStyle = 'rgba(120,160,255,.14)';
      c.fillRect(xOf(ph.start), 0, Math.max(1, xOf(ph.end) - xOf(ph.start)), cssH);
    });

    // waveform envelope
    var env = (track.analysis && track.analysis.envelope) || null;
    var hop = (track.analysis && track.analysis.hop) || 0.01;
    if (env && env.length) {
      var mid = cssH * 0.5;
      var step = Math.max(1, Math.floor(env.length / cssW));
      c.beginPath();
      for (var i = 0, x = 0; i < env.length; i += step, x++) {
        var v = Math.min(1, env[i] * 9);
        c.moveTo(x, mid - v * (cssH * 0.42));
        c.lineTo(x, mid + v * (cssH * 0.42));
      }
      c.strokeStyle = 'rgba(190,215,255,.42)';
      c.lineWidth = 1;
      c.stroke();
    } else {
      c.strokeStyle = 'rgba(190,215,255,.25)';
      c.beginPath();
      c.moveTo(0, cssH * 0.5);
      c.lineTo(cssW, cssH * 0.5);
      c.stroke();
    }

    // caption / line bars
    (track.cues || []).forEach(function (cue) {
      var x = xOf(cue.start), w = Math.max(2, xOf(cue.end) - xOf(cue.start));
      c.fillStyle = 'rgba(90,225,205,.20)';
      c.fillRect(x, cssH * 0.76, w, 10);
      c.fillStyle = 'rgba(90,225,205,.65)';
      c.fillRect(x, cssH * 0.76, w, 2);
    });

    // paragraph boundaries (where a line starts)
    (track.paragraphs || []).forEach(function (p, i) {
      var x = xOf(p.start);
      c.fillStyle = 'rgba(255,255,255,.28)';
      c.fillRect(x, cssH * 0.62, 1, cssH * 0.3);
    });

    // playhead
    var px = xOf(Math.min(dur, S.alignPlayhead || 0));
    c.fillStyle = '#ff5c8a';
    c.fillRect(px - 1, 0, 2, cssH);

    // paragraph chips under the canvas with timing nudge controls
    var list = $('#alignList');
    list.innerHTML = '';
    (track.paragraphs || []).forEach(function (p, i) {
      var chip = document.createElement('div');
      chip.className = 'align-chip';
      chip.innerHTML = '<div class="align-chip-inner">' +
        '<div class="align-chip-content"><b>' + fmtTime(p.start) + '</b><span>' + String(p.text).slice(0, 42) + '</span></div>' +
        '<div class="align-chip-nudge">' +
          '<button type="button" class="nudge-btn nudge-prev" title="-0.2s">-0.2s</button>' +
          '<button type="button" class="nudge-btn nudge-next" title="+0.2s">+0.2s</button>' +
        '</div></div>';

      chip.querySelector('.align-chip-content').addEventListener('click', function () { seekAudio(p.start); });
      chip.querySelector('.nudge-prev').addEventListener('click', function (e) {
        e.stopPropagation();
        p.start = Math.max(0, Math.round((p.start - 0.2) * 100) / 100);
        renderAlign();
        seekAudio(p.start);
        if (S.spec) buildCurrentPlan();
      });
      chip.querySelector('.nudge-next').addEventListener('click', function (e) {
        e.stopPropagation();
        p.start = Math.round((p.start + 0.2) * 100) / 100;
        renderAlign();
        seekAudio(p.start);
        if (S.spec) buildCurrentPlan();
      });
      list.appendChild(chip);
    });
  }

  // Jump the preview to a moment in the *audio* time (the story shifts it).
  function seekAudio(audioTime) {
    if (!S.renderer) return;
    var shift = S.spec && S.spec.meta ? (S.spec.meta.voiceStart || 0) : 0;
    var t2 = Math.max(0, audioTime + shift - 0.05);
    seek(Math.min(t2, S.renderer.duration - 0.05));
    S.alignPlayhead = audioTime;
    renderAlign();
  }

  /* ------------------------------------------------------------ voice panel */
  function fillVoiceList() {
    var sel = $('#fVoicePick');
    var lang = window.CF_LANG === 'en' ? 'en' : 'bn';
    var wanted = store('cutfree.voice') || '';
    return window.CFX.voice.voicesReady(1600).then(function (voices) {
      sel.innerHTML = '';
      if (!voices.length) {
        var none = document.createElement('option');
        none.value = '';
        none.textContent = lang === 'en'
          ? 'No system voice (timings will be estimated)'
          : 'সিস্টেম ভয়েস নেই (টাইমিং অনুমান করা হবে)';
        sel.appendChild(none);
        S.voice = null;
        $('#voiceHint').textContent = t('voiceNoVoices');
        $('#btnVoiceTest').disabled = true;
        return [];
      }
      voices.forEach(function (v) {
        var o = document.createElement('option');
        o.value = v.id;
        o.textContent = v.name + ' · ' + (v.lang || '?') + (v.bengali ? ' 🇧🇩' : '');
        sel.appendChild(o);
      });
      var pick = voices.find(function (v) { return v.id === wanted; }) || window.CFX.voice.pickVoice(voices, lang === 'bn' ? 'bn' : 'en');
      if (pick) { sel.value = pick.id; S.voice = pick; }
      $('#voiceHint').textContent = t('voiceHint');
      return voices;
    });
  }

  function voiceRate() { return parseFloat($('#fVoiceRate').value) || 1; }

  function testVoice() {
    var form = readForm();
    var segs = narrationSegments(form);
    var line = (segs[0] || $('#fTitle').value || 'CutFree Studio').slice(0, 160);
    window.CFX.voice.stop();
    var utter = new SpeechSynthesisUtterance(line);
    if (S.voice && S.voice.voice) utter.voice = S.voice.voice;
    utter.lang = (S.voice && S.voice.lang) || 'bn-BD';
    utter.rate = voiceRate();
    speechSynthesis.speak(utter);
    toast(t('stVoiceSpeaking'));
  }

  function showVoiceNote(msg, kind) {
    var el = $('#voiceHint');
    el.textContent = msg;
    el.classList.remove('ok', 'warn');
    if (kind) el.classList.add(kind);
  }

  function measureNarration(recordAudio) {
    var form = readForm();
    var segs = narrationSegments(form);
    if (!segs.length) { toast(t('stNeedScript')); return Promise.resolve(null); }
    if (window.CFX.voice.supported() && S.voice && !recordAudio) {
      toast(t('stMeasuring'));
    }

    var opts = {
      voice: S.voice,
      rate: voiceRate(),
      lang: (S.voice && S.voice.lang) || 'bn-BD',
      onProgress: function (p, i, n) {
        setProgress(p, t('stMeasuring') + ' · ' + i + '/' + n);
      }
    };
    $('#progressWrap').hidden = false;

    var run = recordAudio && window.CFX.voice.canCapture()
      ? window.CFX.voice.record(segs, opts).then(function (res) {
        if (res.buffer) {
          S.voiceBuffer = window.CFX.voice.trimToOffset(res.buffer, res.offset);
          showVoiceNote(t('voiceRecorded'), 'ok');
          trackVoice(true);
        } else {
          showVoiceNote(t('voiceNoCapture'), 'warn');
        }
        return res.timings;
      })['catch'](function (err) {
        showVoiceNote(err && err.message === 'no-audio-track' ? t('voiceNoTrack') : t('voiceCaptureFail'), 'warn');
        return null;
      })
      : window.CFX.voice.measure(segs, opts);

    if (!recordAudio && (recordAudio !== undefined) && !S.voice) {
      // no TTS voice available: still give the user timings to work with
    }

    return run.then(function (timings) {
      $('#progressWrap').hidden = true;
      if (!timings) return null;
      S.timings = timings;
      var kind = timings.estimated ? t('voiceEstimated') : t('voiceMeasured');
      if (!recordAudio) showVoiceNote(kind + ' · ' + fmtTime(timings.duration), timings.estimated ? 'warn' : 'ok');
      toast(kind + ' · ' + fmtTime(timings.duration));
      return buildCurrentPlan();
    });
  }

  /* ---------------------------------------------------------------- captions */
  function exportSrt() {
    var cues = (S.srtCues && S.srtCues.length) ? S.srtCues
      : ((S.spec && S.spec.captions && S.spec.captions.length) ? S.spec.captions : null);
    if (!cues && S.timings) cues = window.CFX.director.captionsFromTimings(S.timings);
    if (!cues || !cues.length) {
      if (!S.spec) { toast(t('stThumbNeed')); return; }
      // fall back to one cue per scene so the user always gets a usable file
      var starts = []; var acc = 0;
      S.spec.scenes.forEach(function (sc) { starts.push([acc, acc + sc.dur]); acc += sc.dur; });
      cues = S.spec.scenes.map(function (sc, i) {
        var text = [sc.title, sc.heading, sc.body, sc.text].filter(Boolean).join(' — ') ||
          (sc.items ? sc.items.join(' • ') : '');
        return { start: starts[i][0], end: starts[i][1], text: text };
      }).filter(function (c) { return c.text; });
    }
    if (!cues.length) { toast(t('stNoCaptions')); return; }
    var srt = window.CFX.captions.build(cues);
    var name = slug(S.spec ? S.spec.meta.title : 'captions') + '.srt';
    window.CFX.publish.downloadBlob(new Blob([srt], { type: 'text/plain' }), name);
    toast(t('stSrtDone', { n: cues.length }));
  }

  function importSrt(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var cues = window.CFX.captions.parse(String(reader.result || ''));
      if (!cues.length) { toast(t('stSrtFail')); return; }
      S.srtCues = cues;
      showVoiceNote(t('stSrtLoaded', { n: cues.length }), 'ok');
      toast(t('stSrtLoaded', { n: cues.length }));
      buildCurrentPlan();
    };
    reader.readAsText(file);
  }

  /* ---------------------------------------------------------------- project */
  function saveProject() {
    var project = {
      format: 'cutfree-studio-project',
      version: 2,
      savedAt: new Date().toISOString(),
      form: {
        title: $('#fTitle').value,
        script: $('#fScript').value,
        theme: $('.swatch.on') ? $('.swatch.on').dataset.theme : null,
        mood: $('#fMood').value,
        aspect: $('#fAspect').value,
        quality: $('#fQuality').value,
        fps: $('#fFps').value,
        perf: $('#fPerf').value,
        duration: $('#fDuration').value,
        watermark: $('#fWatermark').value,
        music: $('#fMusic').checked,
        progress: $('#fProgress').checked,
        captionStyle: $('#fCaptionStyle').value,
        shorts: $('#fShorts').checked,
        story: $('#fStory').checked,
        storyStyle: $('#fStoryStyle').value,
        kicker: $('#fKicker').value,
        endCard: $('#fEndCard').value,
        voiceId: $('#fVoicePick').value,
        voiceRate: $('#fVoiceRate').value,
        narrationFit: $('#fNarrFit').checked,
        privacy: $('#fPrivacy').value,
        schedule: $('#fSchedule').value,
        clientId: $('#fClientId').value
      },
      captions: S.srtCues || (S.spec && S.spec.captions) || null,
      timings: S.timings || null,
      track: S.track ? {
        estimated: !!S.track.estimated, duration: S.track.duration,
        speechRatio: S.track.speechRatio, phrases: S.track.phrases,
        paragraphs: S.track.paragraphs, cues: S.track.cues, words: S.track.words
      } : null
    };
    window.CFX.publish.downloadBlob(
      new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }),
      slug($('#fTitle').value || 'cutfree-project') + '.cutfree.json'
    );
    toast(t('stProjectSaved'));
  }

  function loadProject(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var data;
      try { data = JSON.parse(String(reader.result || '{}')); } catch (e) { toast(t('stProjectFail')); return; }
      var f = data.form || {};
      if (f.title != null) $('#fTitle').value = f.title;
      if (f.script != null) $('#fScript').value = f.script;
      if (f.theme && window.CFX.THEMES[f.theme]) {
        $('#themePicker').dataset.current = f.theme;
        $$('.swatch').forEach(function (s2) { s2.classList.toggle('on', s2.dataset.theme === f.theme); });
      }
      if (f.mood) $('#fMood').value = f.mood;
      if (f.aspect) $('#fAspect').value = f.aspect;
      if (f.quality) $('#fQuality').value = f.quality;
      if (f.fps) $('#fFps').value = f.fps;
      if (f.perf) $('#fPerf').value = f.perf;
      if (f.duration) $('#fDuration').value = f.duration;
      if (f.watermark != null) $('#fWatermark').value = f.watermark;
      $('#fMusic').checked = f.music !== false;
      $('#fProgress').checked = f.progress !== false;
      if (f.captionStyle) $('#fCaptionStyle').value = f.captionStyle;
      $('#fShorts').checked = !!f.shorts;
      if (f.voiceId) { $('#fVoicePick').value = f.voiceId; }
      if (f.voiceRate) {
        $('#fVoiceRate').value = f.voiceRate;
        var rvL = $('#voiceRateVal');
        if (rvL) rvL.textContent = parseFloat(f.voiceRate).toFixed(2);
      }
      $('#fNarrFit').checked = f.narrationFit !== false;
      $('#fStory').checked = !!f.story;
      if (f.storyStyle) $('#fStoryStyle').value = f.storyStyle;
      if (f.kicker != null) $('#fKicker').value = f.kicker;
      if (f.endCard != null) $('#fEndCard').value = f.endCard;
      if (f.privacy) $('#fPrivacy').value = f.privacy;
      if (f.schedule) $('#fSchedule').value = f.schedule;
      if (f.clientId) $('#fClientId').value = f.clientId;
      S.srtCues = data.captions || null;
      S.timings = data.timings || null;
      // a saved track lets the story rebuild exactly without the audio file
      S.track = data.track || null;
      if (S.track) { S.track.voiceStart = 0; renderAlign(); }
      $$('.swatch').forEach(function (s2) { s2.classList.toggle('on', s2.dataset.theme === ($('#themePicker').dataset.current || '')); });
      toast(t('stProjectLoaded'));
      buildCurrentPlan();
    };
    reader.readAsText(file);
  }

  /* --------------------------------------------------------------- controls */
  function renderThemePicker() {
    var box = $('#themePicker');
    var lang = window.CF_LANG === 'en' ? 'en' : 'bn';
    var current = box.dataset.current || 'aurora';
    box.innerHTML = '';
    window.CFX.themeList.forEach(function (key) {
      var theme = window.CFX.THEMES[key];
      var el = document.createElement('button');
      el.type = 'button';
      el.className = 'swatch' + (key === current ? ' on' : '');
      el.dataset.theme = key;
      el.innerHTML = '<i style="background:linear-gradient(135deg,' + theme.blobs[0] + ',' + theme.blobs[1] + ' 45%,' + theme.blobs[2] + ')"></i>' +
        '<small></small>';
      el.querySelector('small').textContent = theme.name[lang];
      el.addEventListener('click', function () {
        box.dataset.current = key;
        $$('.swatch').forEach(function (s) { s.classList.toggle('on', s === el); });
        if (S.spec) buildCurrentPlan();
      });
      box.appendChild(el);
    });
  }

  function renderMoodOptions() {
    var sel = $('#fMood');
    var lang = window.CF_LANG === 'en' ? 'en' : 'bn';
    if (sel.options.length) return;
    window.CFX.moodList.forEach(function (key) {
      var o = document.createElement('option');
      o.value = key;
      o.textContent = window.CFX.MOODS[key].name[lang] + ' · ' + window.CFX.MOODS[key].bpm + ' bpm';
      sel.appendChild(o);
    });
  }

  var DEMO = {
    bn: {
      title: '৫ মিনিটে ব্রাউজারেই ভিডিও বানান',
      script: 'আপনার ল্যাপটপ বা ফোনেই একটা পুরো ভিডিও স্টুডিও আছে — কোনো ইনস্টল ছাড়াই।\n\n' +
        'CutFree Studio লিখে দেওয়া টেক্সট পড়ে নিজে থেকেই সিন ভাগ করে, টাইমিং ঠিক করে, থিম বেছে নেয় আর মিউজিক বানিয়ে ফেলে।\n\n' +
        'কেন এটা আলাদা:\n- কোনও ফাইল আপলোড হয় না\n- নিজের মিউজিক, নিজের গ্রাফিক্স\n- YouTube কিট আর শিডিউল এক ক্লিকে\n\n' +
        'রেন্ডার শেষে ফাইলটা সরাসরি পাবেন — আর চাইলে HTML আকারেও শেয়ার করা যায়।\n\n' +
        '৯০% কাজ অটোমেটিক। বাকি ১০% আপনার সৃজনশীলতা।\n\n' +
        'ভিডিওটি ভালো লাগলে সাবস্ক্রাইব করুন, পরের পর্বে আমরা ব্যাচ প্রোডাকশন দেখব।'
    },
    en: {
      title: 'Build a video in the browser in 5 minutes',
      script: 'Your laptop or phone already has a full video studio — nothing to install.\n\n' +
        'CutFree Studio reads your text, splits it into scenes, times everything to narration pace, picks a theme and synthesises its own soundtrack.\n\n' +
        'Why it is different:\n- nothing is uploaded\n- original music and graphics\n- YouTube kit and schedule in one click\n\n' +
        'When the render finishes you get the file straight away — or share it as pure HTML.\n\n' +
        '90% of the work is automatic. The rest is your creativity.\n\n' +
        'Enjoyed it? Subscribe and next time we do batch production.'
    }
  };

  var BATCH_DEMO = {
    bn: 'ব্রাউজারেই ভিডিও এডিটিং\n৩টা জিনিস জানলেই হবে: ট্রিম, স্প্লিট, এক্সপোর্ট।\n\n- আপলোড লাগে না\n- ওয়াটারমার্ক নেই\n- ফোনেও চলে\n\nশুরু করার জন্য একটা ফাইল ড্রপ করুন।\n\n---\n\nপ্রসিডিউরাল মিউজিক কীভাবে কাজ করে\nপ্যাড, বেস, আর্প আর ড্রাম — সব WebAudio-তে তৈরি হয়।\n\n- কপিরাইট সম্পূর্ণ ফ্রি\n- যেকোনো দৈর্ঘ্যে লুপ হয়\n- মুড বদলালেই নতুন ট্র্যাক\n\n৯০% ইউটিউব কনটেন্টে এটাই যথেষ্ট।',
    en: 'Video editing in the browser\nThree things matter: trim, split, export.\n\n- no uploads\n- no watermark\n- works on phones\n\nDrop a file and start cutting.\n\n---\n\nHow procedural music works\nPads, bass, arpeggio and drums, all synthesised in WebAudio.\n\n- completely copyright-free\n- loops to any length\n- change the mood, get a new track\n\nThat is enough for 90% of YouTube content.'
  };

  /* -------------------------------------------------------------------- init */
  function init() {
    var lang = store('cutfree.lang') || 'bn';
    window.CF_LANG = lang;
    applyStrings();
    updateEnginePill();
    $('#fClientId').value = store('cutfree.clientId') || '';

    // voice panel
    fillVoiceList();
    $('#fVoicePick').addEventListener('change', function () {
      var voice = (window.CFX.voice.listVoices() || []).find(function (v) { return v.id === this.value; }.bind(this));
      S.voice = voice || null;
      store('cutfree.voice', this.value);
    });
    $('#fVoiceRate').addEventListener('input', function () {
      var rv = $('#voiceRateVal');
      if (rv) rv.textContent = parseFloat(this.value).toFixed(2);
      store('cutfree.voiceRate', this.value);
    });
    if (store('cutfree.voiceRate')) {
      $('#fVoiceRate').value = store('cutfree.voiceRate');
      var rv0 = $('#voiceRateVal');
      if (rv0) rv0.textContent = parseFloat(store('cutfree.voiceRate')).toFixed(2);
    }
    $('#btnVoiceTest').addEventListener('click', testVoice);
    $('#btnMeasure').addEventListener('click', function () { measureNarration(false); });
    $('#btnRecordVoice').addEventListener('click', function () {
      if (!window.CFX.voice.canCapture()) { showVoiceNote(t('voiceNoCapture'), 'warn'); toast(t('voiceNoCapture')); return; }
      if (S.playing) pause();
      measureNarration(true);
    });
    $('#btnSrtExport').addEventListener('click', exportSrt);
    $('#fSrt').addEventListener('change', function () { if (this.files && this.files[0]) importSrt(this.files[0]); });
    $('#fShorts').addEventListener('change', function () {
      if (this.checked) {
        $('#fAspect').value = '9:16';
        $('#fCaptionStyle').value = 'karaoke';   // captions are the point in Shorts
        $('#fDuration').value = String(Math.min(parseFloat($('#fDuration').value) || 45, 58));
        if (S.spec) buildCurrentPlan();
      }
    });
    $('#fCaptionStyle').addEventListener('change', function () {
      if (S.spec) { S.spec.meta.captions = Object.assign({}, S.spec.meta.captions, { style: this.value, enabled: this.value !== 'none' }); paint(); }
    });
    $('#btnTrack').addEventListener('click', function () { trackVoice(); });
    $('#btnAlignPlay').addEventListener('click', function () { trackVoice(); });
    $('#fStory').addEventListener('change', function () {
      if (this.checked) {
        if ($('#fCaptionStyle').value === 'none') $('#fCaptionStyle').value = 'karaoke';
        if (S.voiceBuffer && !S.track) trackVoice();
        else if (!S.voiceBuffer) toast(t('stTrackNoVoice'));
      }
      if (S.spec) buildCurrentPlan();
    });
    $('#fStoryStyle').addEventListener('change', function () {
      if (S.spec && S.spec.meta && S.spec.meta.story) buildCurrentPlan();
    });

    // align canvas: drag & click live audio/video scrubbing
    var alignDragging = false;
    function scrubAlign(e) {
      if (!S.track) return;
      var canvas = $('#alignCanvas');
      var rect = canvas.getBoundingClientRect();
      var frac = clamp((e.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
      seekAudio(frac * (S.track.duration || 0));
    }
    $('#alignCanvas').addEventListener('mousedown', function (e) {
      alignDragging = true;
      scrubAlign(e);
    });
    window.addEventListener('mousemove', function (e) {
      if (alignDragging) scrubAlign(e);
    });
    window.addEventListener('mouseup', function () {
      alignDragging = false;
    });

    // script wizard templates
    var TEMPLATES = {
      facts: {
        bn: {
          title: '৩টি অবিশ্বাস্য বৈজ্ঞানিক তথ্য',
          script: 'আপনি কি জানেন মহাবিশ্বে এমন কিছু অদ্ভুত ঘটনা ঘটে যা আমাদের কল্পনাকেও হার মানায়?\n\nশুক্র গ্রহে এক দিন এক বছরের চেয়েও লম্বা! কারণ এটি নিজের অক্ষে অত্যন্ত ধীরে ঘোরে।\n\nসাগরে থাকা নীল তিমির হৃদপিণ্ড একটি ছোট প্রাইভেট কারের সমান বড়!\n\n৯৮% মানুষ এই অদ্ভুত তথ্যগুলো জানে না।\n\nপ্রতিদিন এমন দারুণ কিছু শিখতে এখনই সাবস্ক্রাইব করুন!',
          theme: 'cyberMatrix',
          mood: 'tech'
        },
        en: {
          title: '3 Mind-Blowing Scientific Facts',
          script: 'Did you know that our universe holds mysteries stranger than fiction?\n\nA day on Venus is actually longer than its entire year because of its ultra-slow rotation.\n\nThe heart of a giant blue whale is as large as an entire car!\n\n98% of people never knew this extraordinary truth.\n\nSubscribe now for your daily dose of fascinating knowledge!',
          theme: 'cyberMatrix',
          mood: 'tech'
        }
      },
      motivation: {
        bn: {
          title: 'হার মেনো না — আজকের কষ্টই আগামীকালের শক্তি',
          script: '“সাফল্য কোনো হঠাৎ ঘটা ঘটনা নয়, এটি নিরলস পরিশ্রমের ফসল।” — লেখক\n\nযেখানে অন্যরা হাল ছেড়ে দেয়, ঠিক সেখান থেকেই প্রকৃত বিজয়ীর যাত্রা শুরু হয়।\n\nকঠিন সময় চিরকাল থাকে না, কিন্তু অদম্য ইচ্ছাশক্তি চিরকাল বিজয়ী হয়।\n\n১০০% বিশ্বাস রাখো নিজের ওপর — নতুন ইতিহাস তুমিই গড়বে!',
          theme: 'obsidianLuxury',
          mood: 'epic'
        },
        en: {
          title: 'Never Give Up — Your Struggle Builds Strength',
          script: '“Success is not accidental; it is the natural reward of relentless discipline.” — Author\n\nWhere ordinary minds surrender, champions take their boldest leap forward.\n\nTough days never last forever, but fierce determination conquers all.\n\n100% belief in your destiny makes you truly unstoppable!',
          theme: 'obsidianLuxury',
          mood: 'epic'
        }
      },
      story: {
        bn: {
          title: 'এক ফোঁটা জলের উপলব্ধি',
          script: 'মরুভূমির তপ্ত বালুর ওপর দিয়ে হেঁটে যাচ্ছিল এক ক্লান্ত পথিক।\n\nএক বৃদ্ধ জ্ঞানী তাকে বললেন, জীবনে সম্পদের চেয়ে ভালোবাসার মূল্য অনেক বেশি।\n\nসেই ছোট্ট কথাটি পথিকের মনের সব অহংকার চিরতরে মুছে দিল।\n\nভালোবাসুন সবাইকে, সময় ফুরিয়ে যাওয়ার আগেই।',
          theme: 'royalEmerald',
          mood: 'cinematic'
        },
        en: {
          title: 'The Real Wealth of a Soul',
          script: 'A weary traveler was searching for gold beneath the burning sun.\n\nA wise sage stopped him and smiled: gold cannot purchase peace or kindness.\n\nThat brief realization changed the course of his entire lifetime.\n\nCherish love and kindness before the hourglass runs dry.',
          theme: 'royalEmerald',
          mood: 'cinematic'
        }
      },
      shorts: {
        bn: {
          title: 'কম্পিউটারের এই সিক্রেট শর্টকাট জানলে সময় বাঁচবে ১০ গুণ! #Shorts',
          script: 'এই ছোট্ট ট্রিকটি আপনার কাজ করার গতি দ্বিগুণ করে দেবে!\n\n- Win + V চাপলে সেভ হওয়া পুরো ক্লিপবোর্ড হিস্টোরি খুলে যাবে\n- Alt + Tab দিয়ে দ্রুত অ্যাপ পরিবর্তন করুন\n- Ctrl + Shift + Esc নিমেষেই টাস্ক ম্যানেজার ওপেন করে\n\nভিডিওটি সেভ করে রাখুন এবং বন্ধুদের সাথে শেয়ার করুন!',
          theme: 'vaporwave',
          mood: 'uplifting',
          shorts: true
        },
        en: {
          title: 'Top Secret Keyboard Hacks That Save Hours! #Shorts',
          script: 'These lightning-fast computer shortcuts will supercharge your workflow!\n\n- Press Win + V to unlock your entire clipboard memory\n- Use Alt + Tab to glide effortlessly between windows\n- Hit Ctrl + Shift + Esc to trigger Task Manager directly\n\nDouble-tap, bookmark, and share with your friends!',
          theme: 'vaporwave',
          mood: 'uplifting',
          shorts: true
        }
      },
      calligraphy: {
        bn: {
          title: 'বিসমিল্লাহির রাহমানির রাহিম — পবিত্র বাণীর মাধুর্য',
          script: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ\n\n“নিশ্চয় কষ্টের সাথেই রয়েছে স্বস্তি।” — আল-কুরআন\n\nধৈর্য এবং প্রার্থনাই সকল সংকটের শ্রেষ্ঠ অবলম্বন।\n\nশান্তিময় জীবন গড়তে হৃদয়কে প্রশান্ত রাখুন।',
          theme: 'arabicGold',
          mood: 'ambient'
        },
        en: {
          title: 'In The Name of Allah — Spiritual Reflection',
          script: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ\n\n“Verily, with hardship comes ease.” — Holy Quran\n\nPatience and faith illuminate the darkest paths of existence.\n\nMay peace and light guide every heartbeat of your soul.',
          theme: 'arabicGold',
          mood: 'ambient'
        }
      }
    };

    $$('.wizard-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = this.dataset.template;
        var tpl = TEMPLATES[key] && TEMPLATES[key][window.CF_LANG === 'en' ? 'en' : 'bn'];
        if (!tpl) return;
        $('#fTitle').value = tpl.title;
        $('#fScript').value = tpl.script;
        if (tpl.theme && window.CFX.THEMES[tpl.theme]) {
          $$('.swatch').forEach(function (s) { s.classList.toggle('on', s.dataset.theme === tpl.theme); });
        }
        if (tpl.mood && $('#fMood')) $('#fMood').value = tpl.mood;
        if (tpl.shorts) {
          $('#fAspect').value = '9:16';
          $('#fCaptionStyle').value = 'karaoke';
        }
        toast(window.CF_LANG === 'en' ? 'Template loaded — building plan...' : 'টেমপ্লেট লোড হয়েছে — প্ল্যান তৈরি হচ্ছে...');
        buildCurrentPlan();
        setTimeout(play, 800);
      });
    });

    // audio mixer live listeners
    if ($('#fMusicVol')) {
      $('#fMusicVol').addEventListener('input', function () {
        $('#musicVolVal').textContent = this.value + '%';
        if (S.spec) buildCurrentPlan();
      });
    }
    if ($('#fVoiceVol')) {
      $('#fVoiceVol').addEventListener('input', function () {
        $('#voiceVolVal').textContent = this.value + '%';
        if (S.spec) buildCurrentPlan();
      });
    }
    if ($('#fDuckLevel')) {
      $('#fDuckLevel').addEventListener('change', function () {
        if (S.spec) buildCurrentPlan();
      });
    }
    if ($('#fSfx')) {
      $('#fSfx').addEventListener('change', function () {
        if (S.spec) buildCurrentPlan();
      });
    }

    $('#btnSaveProject').addEventListener('click', saveProject);
    $('#fProject').addEventListener('change', function () { if (this.files && this.files[0]) loadProject(this.files[0]); });

    // mobile / low-core devices default to the cheaper render mode
    var small = (navigator.hardwareConcurrency || 8) <= 4 || Math.min(screen.width, screen.height) < 700;
    $('#fPerf').value = store('cutfree.perf') || (small ? 'balanced' : 'high');
    $('#fPerf').addEventListener('change', function () { store('cutfree.perf', this.value); });

    $('#langBtn').addEventListener('click', function () {
      window.CF_LANG = window.CF_LANG === 'bn' ? 'en' : 'bn';
      store('cutfree.lang', window.CF_LANG);
      applyStrings();
      renderThemePicker();
      if (S.spec) { renderSceneStrip(); renderPlanStats(); fillMetadata(S.spec); }
    });

    // demo / batch samples
    var loadDemo = function () {
      var d = DEMO[window.CF_LANG === 'en' ? 'en' : 'bn'];
      $('#fTitle').value = d.title;
      $('#fScript').value = d.script;
      toast(window.CF_LANG === 'en' ? 'Demo loaded — hit build.' : 'ডেমো বসানো হয়েছে — প্ল্যান বানান।');
    };
    $('#btnDemo').addEventListener('click', loadDemo);
    $('#btnGenerate').addEventListener('click', function () {
      if (!$('#fScript').value.trim()) loadDemo();
      buildCurrentPlan();
      setTimeout(play, 700);
    });
    $('#btnGenerate2').addEventListener('click', function () {
      if (!$('#fScript').value.trim()) loadDemo();
      buildCurrentPlan();
      setTimeout(play, 700);
    });
    $('#btnBatchSample').addEventListener('click', function () {
      $('#fScript').value = BATCH_DEMO[window.CF_LANG === 'en' ? 'en' : 'bn'];
      $('#fTitle').value = window.CF_LANG === 'en' ? 'Batch demo' : 'ব্যাচ ডেমো';
      toast(window.CF_LANG === 'en' ? 'Two videos separated by ---' : 'দুটো ভিডিও, মাঝখানে ---');
    });
    $('#btnClearBrief').addEventListener('click', function () {
      $('#fTitle').value = ''; $('#fScript').value = '';
      pause(); S.spec = null; S.renderer = null;
      $('#sceneStrip').innerHTML = ''; $('#planStats').innerHTML = '';
      toast(window.CF_LANG === 'en' ? 'Cleared.' : 'খালি করা হয়েছে।');
    });

    $('#btnBuild').addEventListener('click', buildCurrentPlan);
    $('#btnQueue').addEventListener('click', queueBatch);

    // preview transport
    $('#btnPlay').addEventListener('click', function () { S.playing ? pause() : play(); });
    $('#btnRew').addEventListener('click', function () { seek(0); });
    $('#btnFwd').addEventListener('click', function () { seek(S.renderer ? S.renderer.duration - 0.1 : 0); });
    $('#scrub').addEventListener('input', function () {
      if (!S.renderer) return;
      seek((parseFloat(this.value) / 1000) * S.renderer.duration);
    });

    // render buttons
    $('#btnRender').addEventListener('click', function () { renderWith('fast', false); });
    $('#btnRenderCompat').addEventListener('click', function () { renderWith('compat', true); });
    $('#btnCancelRender').addEventListener('click', function () {
      S.cancelRequested = true;
      toast(t('stCancelled'));
    });

    // publish panel
    $('#btnThumb').addEventListener('click', function () {
      if (!S.spec) { toast(t('stThumbNeed')); return; }
      S.thumbTime = null;
      paintThumb(S.spec);
      toast(t('stThumbDone'));
    });
    $('#btnThumbDl').addEventListener('click', function () {
      if (!S.spec) { toast(t('stThumbNeed')); return; }
      window.CFX.publish.thumbnailBlob(S.spec, S.thumbTime == null ? S.spec.scenes[0].dur * 0.6 : S.thumbTime, {
        width: 1280, height: 720
      }).then(function (thumb) {
        window.CFX.publish.downloadBlob(thumb.blob, slug(S.meta ? S.meta.title : 'thumbnail') + '-thumbnail.png');
      });
    });
    $('#btnCopyMeta').addEventListener('click', function () {
      var meta = currentMeta();
      if (!meta) { toast(t('stThumbNeed')); return; }
      var text = meta.title + '\n\n' + meta.description + '\n\n' + meta.tags.join(', ');
      (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
        .then(function () { toast(t('stCopied')); })
        ['catch'](function () { toast(t('stCopied')); });
    });
    $('#btnOpenStudio').addEventListener('click', function () {
      window.open(window.CFX.publish.youtube.studioUrl, '_blank', 'noopener');
    });
    $('#btnPack').addEventListener('click', function () {
      if (S.queue.length) savePackFor(S.queue[S.queue.length - 1]);
      else if (S.spec) { toast(window.CF_LANG === 'en' ? 'Render first, then pack.' : 'আগে রেন্ডার করুন, তারপর প্যাক।'); }
      else toast(t('stThumbNeed'));
    });
    $('#btnAnimHtml').addEventListener('click', function () {
      if (!S.spec) { toast(t('stThumbNeed')); return; }
      var meta = currentMeta();
      window.CFX.publish.animationHtml(S.spec, meta).then(function (html) {
        window.CFX.publish.downloadBlob(new Blob([html], { type: 'text/html' }), slug(meta.title) + '.animation.html');
        toast(t('stAnimDone'));
      })['catch'](function (err) {
        toast('HTML: ' + (err && err.message ? err.message : 'failed'));
      });
    });
    $('#btnUpload').addEventListener('click', function () {
      if (!S.queue.length) { toast(t('stQueueEmpty')); return; }
      uploadItem(S.queue[S.queue.length - 1]);
    });
    $('#btnClearQueue').addEventListener('click', function () {
      S.queue.forEach(function (it) { if (it.li) it.li.remove(); });
      S.queue = [];
      toast(window.CF_LANG === 'en' ? 'Queue cleared.' : 'কিউ খালি।');
    });
    ['#fPrivacy', '#fSchedule'].forEach(function (sel) {
      $(sel).addEventListener('change', function () { if (S.spec) fillMetadata(S.spec); });
    });

    // inputs
    $('#fVoice').addEventListener('change', function () {
      var file = this.files && this.files[0];
      if (!file) return;
      var url = URL.createObjectURL(file);
      var ac = new (window.AudioContext || window.webkitAudioContext)();
      fetch(url).then(function (r) { return r.arrayBuffer(); })
        .then(function (ab) { return ac.decodeAudioData(ab); })
        .then(function (buffer) {
          S.voiceBuffer = buffer;
          toast(t('stVoiceLoaded'));
          ac.close();
          trackVoice();                       // straight into voice tracking
        })['catch'](function () { toast(t('stVoiceFail')); ac.close(); });
    });
    $('#fLogo').addEventListener('change', function () {
      var file = this.files && this.files[0];
      if (!file) return;
      var img = new Image();
      img.onload = function () {
        S.logoImage = img;
        toast(t('stLogoLoaded'));
        if (S.spec) buildCurrentPlan();
      };
      img.src = URL.createObjectURL(file);
    });

    // keyboard
    document.addEventListener('keydown', function (e) {
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.metaKey || e.ctrlKey) return;
      if (e.code === 'Space') { e.preventDefault(); S.playing ? pause() : play(); }
      if (e.key === 'r' || e.key === 'R') { e.preventDefault(); renderWith('fast', false); }
    });

    // first paint
    renderThemePicker();
    window.CFX.engine.createRenderer($('#preview'), {
      meta: { theme: 'aurora', seed: 7, showProgress: true, watermark: '' },
      fps: 30, width: 1280, height: 720,
      scenes: [{ type: 'intro', dur: 6, title: window.CF_LANG === 'en' ? 'CutFree Studio' : 'কাটফ্রি স্টুডিও', subtitle: window.CF_LANG === 'en' ? 'Write a script — get the video.' : 'স্ক্রিপ্ট লিখুন — ভিডিও পেয়ে যান।' }]
    }).renderAt(1.2);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
