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
    rendererKey: 0
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
        language: window.CF_LANG === 'en' ? 'en' : 'bn'
      }
    };
  }

  function buildSpec(item, options) {
    var opts = Object.assign({}, options, {
      title: item.title, script: item.script, seed: item.seed
    });
    var spec = window.CFX.director.build(opts);
    if (S.logoImage) spec.meta.logoImage = S.logoImage;
    return spec;
  }

  function prepareSpec(spec, withMusic) {
    var total = spec.scenes.reduce(function (a, s) { return a + s.dur; }, 0);
    var jobs = [];

    if (withMusic || S.voiceBuffer) {
      var mood = spec.meta.mood;
      jobs.push(window.CFX.music.render(mood, total, { seed: spec.meta.seed }).then(function (music) {
        S.musicBuffer = music;
        if (S.voiceBuffer) {
          return window.CFX.music.mix({
            music: music, voice: S.voiceBuffer, seconds: total,
            sampleRate: music.sampleRate, channels: 2
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
      chip.textContent = (i + 1) + '. ' + (sc.title || sc.heading || sc.text || sc.items && sc.items[0] || sc.type).toString().slice(0, 22) +
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
    S.meta = window.CFX.director.metadata(spec, opts);
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
