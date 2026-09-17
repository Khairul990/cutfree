/* ==========================================================================
   CutFree — 100% client-side video cutter / joiner / exporter
   No libraries, no CDN, no server. Classic script so file:// works too.
   ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ utils */
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var t = function (k, v) { return window.cfT(k, v); };

  // add ?debug=1 to the URL to trace the editor in the browser console
  var DEBUG = /[?&]debug=1/.test(window.location.search);
  function dlog() {
    if (!DEBUG || !window.console) return;
    console.log.apply(console, ['[cutfree]'].concat(Array.prototype.slice.call(arguments)));
  }

  function store(key, val) {
    try {
      if (val === undefined) return window.localStorage.getItem(key);
      window.localStorage.setItem(key, val);
    } catch (e) { /* sandboxed iframe — ignore */ }
    return val;
  }

  function fmtTime(sec, tenths) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    var m = Math.floor(sec / 60);
    var s = Math.floor(sec % 60);
    var out = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    if (tenths) out += '.' + Math.floor((sec * 10) % 10);
    return out;
  }

  function fmtSize(bytes) {
    if (!isFinite(bytes) || bytes <= 0) return '—';
    var u = ['B', 'KB', 'MB', 'GB'], i = 0;
    while (bytes >= 1024 && i < u.length - 1) { bytes /= 1024; i++; }
    return (bytes < 10 && i > 0 ? bytes.toFixed(1) : Math.round(bytes)) + ' ' + u[i];
  }

  function toast(msg) {
    var el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    requestAnimationFrame(function () { el.classList.add('show'); });
    clearTimeout(toast._t);
    toast._t = setTimeout(function () {
      el.classList.remove('show');
      setTimeout(function () { el.hidden = true; }, 260);
    }, 3200);
  }

  function seekTo(video, time) {
    return new Promise(function (resolve) {
      var done = function () { video.removeEventListener('seeked', done); resolve(); };
      video.addEventListener('seeked', done);
      try { video.currentTime = Math.max(0, time); } catch (e) { resolve(); }
      setTimeout(done, 1500);
    });
  }

  function onceEvent(el, name, ms) {
    return new Promise(function (resolve) {
      var done = function () { el.removeEventListener(name, done); resolve(); };
      el.addEventListener(name, done);
      setTimeout(done, ms || 8000);
    });
  }

  function fitRect(vw, vh, cw, ch) {
    if (!vw || !vh) return { x: 0, y: 0, w: cw, h: ch };
    var scale = Math.min(cw / vw, ch / vh);
    var w = Math.round(vw * scale), h = Math.round(vh * scale);
    return { x: Math.round((cw - w) / 2), y: Math.round((ch - h) / 2), w: w, h: h };
  }

  /* ------------------------------------------------------------------- state */
  var state = {
    clips: [],
    activeIndex: -1,
    playing: false,
    exporting: false,
    cancelRequested: false,
    seq: 0,
    raf: 0
  };

  var els = {};

  /* ---------------------------------------------------------------- i18n/ui */
  function applyStaticStrings() {
    $$('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      var txt = t(key);
      if (txt !== key) el.textContent = txt;
    });
    document.documentElement.lang = window.CF_LANG === 'en' ? 'en' : 'bn';
  }

  function renderInfoSections() {
    var c = window.cfContent();
    $('#featuresGrid').innerHTML = c.features.map(function (f) {
      return '<div class="feature"><span class="ico">' + f.ico + '</span><h3></h3><p></p></div>';
    }).join('');
    $$('#featuresGrid .feature').forEach(function (node, i) {
      node.querySelector('h3').textContent = c.features[i].t;
      node.querySelector('p').textContent = c.features[i].d;
    });

    $('#stepsList').innerHTML = c.steps.map(function () {
      return '<li><h3></h3><p></p></li>';
    }).join('');
    $$('#stepsList li').forEach(function (node, i) {
      node.querySelector('h3').textContent = c.steps[i].t;
      node.querySelector('p').textContent = c.steps[i].d;
    });

    $('#faqList').innerHTML = c.faq.map(function (f) {
      return '<details><summary></summary><p></p></details>';
    }).join('');
    $$('#faqList details').forEach(function (node, i) {
      node.querySelector('summary').textContent = c.faq[i].q;
      node.querySelector('p').textContent = c.faq[i].a;
    });
  }

  function setLang(lang) {
    window.CF_LANG = lang;
    store('cutfree.lang', lang);
    applyStaticStrings();
    renderInfoSections();
    render();
  }

  /* ------------------------------------------------------------ file loading */
  var VIDEO_RE = /\.(mp4|webm|mov|m4v|mkv|ogv|avi|3gp)$/i;

  function isVideoFile(file) {
    return (file.type && file.type.indexOf('video/') === 0) || VIDEO_RE.test(file.name);
  }

  function analyze(file) {
    var url = URL.createObjectURL(file);
    var v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    v.playsInline = true;

    return new Promise(function (resolve, reject) {
      var failed = false;
      v.addEventListener('error', function () {
        failed = true;
        reject(new Error('decode: ' + file.name));
      });

      v.src = url;
      onceEvent(v, 'loadedmetadata', 9000).then(function () {
        if (failed) return;
        var dur = v.duration;
        var afterDur = function (d) {
          captureStrip(v, d).then(function (strip) {
            resolve({
              name: file.name,
              url: url,
              size: file.size,
              duration: d,
              width: v.videoWidth || 1280,
              height: v.videoHeight || 720,
              strip: strip
            });
          })['catch'](function () {
            resolve({
              name: file.name, url: url, size: file.size, duration: d,
              width: v.videoWidth || 1280, height: v.videoHeight || 720, strip: ''
            });
          });
        };

        if (isFinite(dur) && dur > 0.05) return afterDur(dur);

        // Some WebM/MKV files report Infinity until seeked far ahead.
        var settled = false;
        var finish = function () {
          if (settled) return;
          settled = true;
          var d2 = isFinite(v.duration) && v.duration > 0.05 ? v.duration : 0;
          afterDur(d2);
        };
        v.addEventListener('timeupdate', finish, { once: true });
        try { v.currentTime = 1e101; } catch (e) { finish(); }
        setTimeout(finish, 2000);
      });
    });
  }

  function captureStrip(video, duration) {
    var frames = 6, h = 54;
    var ar = (video.videoWidth || 16) / (video.videoHeight || 9) || 1.6;
    var w = Math.max(60, Math.round(h * ar));
    var canvas = document.createElement('canvas');
    canvas.width = w * frames;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0a0f1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    var chain = Promise.resolve();
    for (var i = 0; i < frames; i++) {
      (function (i) {
        chain = chain.then(function () {
          var tpos = duration > 0.2 ? duration * (i + 0.5) / frames : 0;
          return seekTo(video, Math.min(tpos, Math.max(0, duration - 0.05))).then(function () {
            try { ctx.drawImage(video, i * w, 0, w, h); } catch (e) { /* ignore */ }
          });
        });
      })(i);
    }
    return chain.then(function () {
      try { return canvas.toDataURL('image/jpeg', 0.7); } catch (e) { return ''; }
    });
  }

  function addFiles(list) {
    var files = Array.prototype.slice.call(list).filter(isVideoFile);
    if (!files.length) return;

    var added = 0;
    var chain = Promise.resolve();
    files.forEach(function (file) {
      chain = chain.then(function () {
        return analyze(file).then(function (info) {
          state.clips.push({
            id: ++state.seq,
            name: info.name,
            url: info.url,
            size: info.size,
            duration: info.duration || 0,
            width: info.width,
            height: info.height,
            strip: info.strip,
            start: 0,
            end: info.duration || 0,
            muted: false,
            card: null
          });
          added++;
        })['catch'](function () {
          if (added === 0 && files.length === 1) toast(t('msgBadFile'));
        });
      });
    });

    chain.then(function () {
      if (!added) return;
      toast(t('msgAdded', { n: added }));
      render();
      // load the first clip into the preview if nothing is loaded yet
      if (!$('#preview').dataset.clipId) selectClip(state.activeIndex, false);
    });
  }

  /* ------------------------------------------------- sample clip (demo aid) */
  function makeSampleClip() {
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
      toast(t('msgNoRec'));
      return;
    }
    toast(t('msgSample'));
    var W = 1280, H = 720, FPS = 30, SECONDS = 5;
    var canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    var c = canvas.getContext('2d');
    var stream = canvas.captureStream(FPS);
    var recMime = pickMime() || '';
    var rec;
    try { rec = recMime ? new MediaRecorder(stream, { mimeType: recMime }) : new MediaRecorder(stream); }
    catch (e) { toast(t('msgNoRec')); return; }

    var chunks = [];
    rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    rec.start(250);

    var start = performance.now();
    var draw = function () {
      var el = (performance.now() - start) / 1000;
      var p = clamp(el / SECONDS, 0, 1);
      var g = c.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#7c5cff');
      g.addColorStop(0.5 + 0.4 * Math.sin(el), '#22d3ee');
      g.addColorStop(1, '#0b0f17');
      c.fillStyle = g; c.fillRect(0, 0, W, H);

      c.fillStyle = 'rgba(255,255,255,.92)';
      c.font = 'bold 84px "Hind Siliguri", system-ui, sans-serif';
      c.fillText('CutFree', 80, 260);
      c.font = '40px "Hind Siliguri", system-ui, sans-serif';
      c.fillText(t('sampleName').replace('.webm', ''), 80, 330);
      c.font = 'bold 64px ui-monospace, monospace';
      c.fillText(el.toFixed(1) + 's', 80, 440);

      c.fillStyle = 'rgba(255,255,255,.25)';
      c.fillRect(80, 520, W - 160, 18);
      c.fillStyle = '#ffffff';
      c.fillRect(80, 520, (W - 160) * p, 18);

      c.save();
      c.translate(W - 240 + Math.sin(el * 2) * 30, H / 2 + Math.cos(el * 3) * 60);
      c.rotate(el * 1.5);
      c.fillStyle = 'rgba(255,255,255,.85)';
      c.fillRect(-60, -60, 120, 120);
      c.restore();

      if (el < SECONDS) requestAnimationFrame(draw);
      else finish();
    };

    var finish = function () {
      try { rec.stop(); } catch (e) { }
    };
    rec.onstop = function () {
      try {
        var type = rec.mimeType && rec.mimeType.indexOf('mp4') > -1 ? 'video/mp4' : 'video/webm';
        var name = t('sampleName').replace(/\.webm$/, type === 'video/mp4' ? '.mp4' : '.webm');
        var file = new File([new Blob(chunks, { type: type })], name, { type: type });
        addFiles([file]);
      } catch (e) { toast(t('msgNoRec')); }
    };
    requestAnimationFrame(draw);
  }

  /* ------------------------------------------------------------- rendering */
  function totalDuration() {
    return state.clips.reduce(function (s, c) { return s + Math.max(0, c.end - c.start); }, 0);
  }

  function render() {
    var has = state.clips.length > 0;
    $('#dropzone').hidden = has;
    $('#editor').hidden = !has;
    $('#timelineWrap').hidden = !has;
    if (!has) {
      $('#clips').innerHTML = '';
      state.activeIndex = -1;
      $('#statClips').textContent = '0';
      $('#statLength').textContent = fmtTime(0);
      $('#statSize').textContent = '—';
      $('#activeLabel').textContent = '—';
      $('#timeLabel').textContent = fmtTime(0, true) + ' / ' + fmtTime(0, true);
      return;
    }
    if (state.activeIndex < 0 || state.activeIndex >= state.clips.length) state.activeIndex = 0;
    renderClips();
    renderStats();
    updateActiveCard();
    updateTransport();
  }

  function renderClips() {
    var box = $('#clips');
    box.innerHTML = '';
    state.clips.forEach(function (clip, i) {
      var card = document.createElement('div');
      card.className = 'clip';
      card.dataset.index = String(i);

      var head = document.createElement('div');
      head.className = 'clip-head';
      head.innerHTML = '<span class="clip-idx">' + (i + 1) + '</span>' +
        '<span class="clip-name"></span><span class="clip-dur"></span>';
      head.querySelector('.clip-name').textContent = clip.name;

      var wrap = document.createElement('div');
      wrap.className = 'strip-wrap';
      var img = document.createElement('img');
      img.alt = '';
      if (clip.strip) img.src = clip.strip;
      wrap.appendChild(img);
      ['dim dim-l', 'dim dim-r', 'sel-edge edge-l', 'sel-edge edge-r'].forEach(function (cls) {
        var d = document.createElement('div');
        d.className = cls;
        wrap.appendChild(d);
      });
      var ph = document.createElement('div');
      ph.className = 'playhead';
      wrap.appendChild(ph);
      var hl = document.createElement('div');
      hl.className = 'handle handle-l';
      var hr = document.createElement('div');
      hr.className = 'handle handle-r';
      wrap.appendChild(hl);
      wrap.appendChild(hr);

      var times = document.createElement('div');
      times.className = 'clip-times';
      times.innerHTML = '<span class="tin"></span><span class="tout"></span>';

      var controls = document.createElement('div');
      controls.className = 'clip-controls';
      controls.appendChild(mkBtn('btnPlayClip', function () {
        if (state.activeIndex === i && state.playing) pause(); else selectClip(i, true);
      }));
      controls.appendChild(mkBtn('btnLeft', function () { moveClip(i, -1); }));
      controls.appendChild(mkBtn('btnRight', function () { moveClip(i, 1); }));
      controls.appendChild(mkBtn('btnMute', function () {
        clip.muted = !clip.muted;
        if (state.activeIndex === i) $('#preview').muted = clip.muted;
        syncCard(clip);
      }));
      controls.appendChild(mkBtn('btnDel', function () { deleteClip(i); }));

      card.appendChild(head);
      card.appendChild(wrap);
      card.appendChild(times);
      card.appendChild(controls);
      box.appendChild(card);

      clip.card = card;
      wireCard(clip, card, wrap, hl, hr, controls);
      syncCard(clip);
    });
  }

  function mkBtn(kind, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn ghost';
    b.dataset.kind = kind;
    b.addEventListener('click', function (e) { e.stopPropagation(); onClick(); });
    return b;
  }

  function wireCard(clip, card, wrap, hl, hr, controls) {
    var idx = function () { return state.clips.indexOf(clip); };

    controls.querySelector('[data-kind="btnLeft"]').textContent = t('cLeft');
    controls.querySelector('[data-kind="btnRight"]').textContent = t('cRight');
    controls.querySelector('[data-kind="btnDel"]').textContent = t('cDelete');

    var startDrag = function (which) {
      return function (e) {
        e.preventDefault();
        e.stopPropagation();
        var rect = wrap.getBoundingClientRect();
        var move = function (ev) {
          var pct = clamp((ev.clientX - rect.left) / rect.width, 0, 1);
          var time = pct * (clip.duration || 0);
          var minGap = Math.min(0.2, Math.max(0.05, (clip.duration || 1) * 0.02));
          if (which === 'in') clip.start = clamp(time, 0, clip.end - minGap);
          else clip.end = clamp(time, clip.start + minGap, clip.duration || time);
          syncCard(clip);
          renderStats();
          if (state.activeIndex === idx()) {
            var v = $('#preview');
            if (!state.playing) v.currentTime = which === 'in' ? clip.start : clip.end;
            paintPlayhead();
          }
        };
        var up = function () {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      };
    };

    hl.addEventListener('pointerdown', startDrag('in'));
    hr.addEventListener('pointerdown', startDrag('out'));

    wrap.addEventListener('pointerdown', function (e) {
      var rect = wrap.getBoundingClientRect();
      var pct = clamp((e.clientX - rect.left) / rect.width, 0, 1);
      var time = clip.start + pct * Math.max(0.001, clip.end - clip.start);
      var nowActive = state.activeIndex === idx();
      if (!nowActive) {
        selectClip(idx(), false).then(function () {
          $('#preview').currentTime = time;
          paintPlayhead();
        });
      } else {
        $('#preview').currentTime = time;
        paintPlayhead();
      }
    });

    card.addEventListener('click', function () {
      if (state.activeIndex !== idx()) selectClip(idx(), false);
    });
  }

  function syncCard(clip) {
    var card = clip.card;
    if (!card) return;
    var dur = clip.duration || 0.001;
    var inPct = clamp(clip.start / dur, 0, 1);
    var outPct = clamp(clip.end / dur, 0, 1);
    var dimL = card.querySelector('.dim-l');
    var dimR = card.querySelector('.dim-r');
    var hl = card.querySelector('.handle-l');
    var hr = card.querySelector('.handle-r');
    dimL.style.width = (inPct * 100) + '%';
    dimR.style.width = ((1 - outPct) * 100) + '%';
    hl.style.left = 'calc(' + (inPct * 100) + '% - ' + (inPct * 14) + 'px)';
    hr.style.left = 'calc(' + (outPct * 100) + '% - ' + (outPct * 14) + 'px)';
    card.querySelector('.edge-l').style.left = (inPct * 100) + '%';
    card.querySelector('.edge-r').style.left = (outPct * 100) + '%';
    card.querySelector('.clip-dur').textContent = fmtTime(clip.end - clip.start, true);
    card.querySelector('.tin').textContent = t('clipLabel') + ' ' + fmtTime(clip.start) + ' →';
    card.querySelector('.tout').textContent = '← ' + fmtTime(clip.end);
    card.querySelector('.clip-name').textContent = clip.name;

    var mBtn = card.querySelector('[data-kind="btnMute"]');
    if (mBtn) { mBtn.textContent = clip.muted ? t('cMuted') : t('cMute'); mBtn.classList.toggle('on', !!clip.muted); }
    var pBtn = card.querySelector('[data-kind="btnPlayClip"]');
    if (pBtn) pBtn.textContent = (state.activeIndex === state.clips.indexOf(clip) && state.playing) ? t('cPause') : t('cPlay');
  }

  function renderStats() {
    var total = totalDuration();
    $('#statClips').textContent = String(state.clips.length);
    $('#statLength').textContent = fmtTime(total);
    var est = estimateBytes(total);
    $('#statSize').textContent = est ? fmtSize(est) + ' · ' + outputSummary() : '—';
    $('#statSize').title = '≈ ' + Math.round(estimateBitrate() / 1e6 * 10) / 10 + ' Mbps';
  }

  function updateActiveCard() {
    state.clips.forEach(function (clip, i) {
      if (!clip.card) return;
      clip.card.classList.toggle('active', i === state.activeIndex);
      syncCard(clip);
    });
    var clip = currentClip();
    $('#activeLabel').textContent = clip
      ? t('clipLabel') + ' ' + (state.activeIndex + 1) + '/' + state.clips.length + ' · ' + clip.name
      : '—';
  }

  function updateTransport() {
    $('#iconPlay').hidden = state.playing;
    $('#iconPause').hidden = !state.playing;
    var clip = currentClip();
    var v = $('#preview');
    var cur = clip ? Math.max(0, v.currentTime - clip.start) : 0;
    var len = clip ? Math.max(0, clip.end - clip.start) : 0;
    $('#timeLabel').textContent = fmtTime(cur, true) + ' / ' + fmtTime(len, true);
  }

  function paintPlayhead() {
    var clip = currentClip();
    if (!clip || !clip.card) return;
    var v = $('#preview');
    var span = Math.max(0.001, clip.end - clip.start);
    var pct = clamp((v.currentTime - clip.start) / span, 0, 1) * 100;
    var ph = clip.card.querySelector('.playhead');
    if (ph) ph.style.left = pct + '%';
    updateTransport();
  }

  /* -------------------------------------------------------------- playback */
  function currentClip() {
    return state.clips[state.activeIndex] || null;
  }

  function selectClip(index, autoplay) {
    if (index < 0 || index >= state.clips.length) return Promise.resolve();
    var clip = state.clips[index];
    var v = $('#preview');
    state.activeIndex = index;

    return new Promise(function (resolve) {
      var begin = function () {
        v.muted = !!clip.muted;
        seekTo(v, clip.start).then(function () {
          updateActiveCard();
          updateTransport();
          paintPlayhead();
          if (autoplay) play();
          resolve();
        });
      };
      if (v.dataset.clipId === String(clip.id)) return begin();
      v.dataset.clipId = String(clip.id);
      v.src = clip.url;
      onceEvent(v, 'loadedmetadata', 8000).then(begin);
      try { v.load(); } catch (e) { begin(); }
    });
  }

  function play() {
    var clip = currentClip();
    if (!clip) return;
    var v = $('#preview');
    if (v.currentTime >= clip.end - 0.03) v.currentTime = clip.start;
    v.play().then(function () {
      state.playing = true;
      updateTransport();
      updateActiveCard();
      tick();
    })['catch'](function () { /* autoplay blocked or interrupted */ });
  }

  function pause() {
    state.playing = false;
    cancelAnimationFrame(state.raf);
    try { $('#preview').pause(); } catch (e) { }
    updateTransport();
    updateActiveCard();
  }

  function toggle() {
    if (state.playing) pause(); else play();
  }

  function tick() {
    cancelAnimationFrame(state.raf);
    var step = function () {
      if (!state.playing) return;
      var clip = currentClip();
      var v = $('#preview');
      if (!clip) return;
      if (v.currentTime >= clip.end - 0.035 || v.ended) {
        if (state.activeIndex < state.clips.length - 1) {
          selectClip(state.activeIndex + 1, true);
        } else {
          pause();
          v.currentTime = clip.end;
          paintPlayhead();
          return;
        }
      }
      paintPlayhead();
      state.raf = requestAnimationFrame(step);
    };
    state.raf = requestAnimationFrame(step);
  }

  /* ------------------------------------------------------------- clip edits */
  function splitAtPlayhead() {
    var i = state.activeIndex;
    var clip = currentClip();
    if (!clip) { toast(t('msgNoClip')); return; }
    var at = $('#preview').currentTime;
    if (at <= clip.start + 0.08 || at >= clip.end - 0.08) { toast(t('msgEdge')); return; }
    var first = Object.assign({}, clip, { id: ++state.seq, end: at, card: null, strip: clip.strip });
    var second = Object.assign({}, clip, { id: ++state.seq, start: at, card: null, strip: clip.strip });
    state.clips.splice(i, 1, first, second);
    render();
    selectClip(i, false);
    toast(t('msgSplit'));
  }

  function deleteClip(index) {
    var clip = state.clips[index];
    if (!clip) return;
    var urlUsedElsewhere = state.clips.some(function (c, i) {
      return i !== index && c.url === clip.url;
    });
    state.clips.splice(index, 1);
    if (!urlUsedElsewhere) { try { URL.revokeObjectURL(clip.url); } catch (e) { } }
    if (state.clips.length === 0) {
      state.clips = [];
      render();
    } else {
      if (state.activeIndex >= state.clips.length) state.activeIndex = state.clips.length - 1;
      render();
      selectClip(state.activeIndex, false);
    }
    toast(t('msgDeleted'));
  }

  function moveClip(index, dir) {
    var to = index + dir;
    if (to < 0 || to >= state.clips.length) return;
    var moved = state.clips.splice(index, 1)[0];
    state.clips.splice(to, 0, moved);
    if (state.activeIndex === index) state.activeIndex = to;
    else if (state.activeIndex === to) state.activeIndex = index;
    render();
    selectClip(state.activeIndex, false);
  }

  function clearAll() {
    state.clips.forEach(function (c) { try { URL.revokeObjectURL(c.url); } catch (e) { } });
    state.clips = [];
    pause();
    var v = $('#preview');
    v.removeAttribute('src');
    try { v.load(); } catch (e) { }
    v.dataset.clipId = '';
    $('#doneBox').hidden = true;
    $('#progressWrap').hidden = true;
    uiExportEnd();
    render();
    toast(t('msgCleared'));
  }

  /* ---------------------------------------------------------------- export */
  var MAX_LONG_SIDE = 1920;

  function longSideFor() {
    var res = $('#selRes').value;
    if (res !== 'source') return parseInt(res, 10);
    var first = state.clips[0];
    var ls = first ? Math.max(first.width || 1280, first.height || 720) : 1280;
    return clamp(ls, 64, MAX_LONG_SIDE);   // never upscale, only cap very large sources
  }

  // Bits per pixel per frame — keeps the estimate honest at any resolution.
  var BPP = { low: 0.06, medium: 0.115, high: 0.19 };

  function estimateBitrate() {
    var out = outputSize();
    var fps = 30;
    var bpp = BPP[$('#selQuality').value] || BPP.medium;
    var bps = out.w * out.h * fps * bpp;
    return clamp(bps, 600000, 24000000) + 128000;   // + 128 kbps audio
  }

  function estimateBytes(duration) {
    return estimateBitrate() * duration / 8;
  }

  function outputSummary() {
    var ls = longSideFor();
    return ls + 'p';
  }

  function pickMime() {
    var pref = $('#selFormat').value;
    var mp4 = [
      'video/mp4;codecs=avc1.4d002a,mp4a.40.2',
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4'
    ];
    var webm = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm'
    ];
    var auto = [
      'video/mp4;codecs=avc1.4d002a,mp4a.40.2',
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm'
    ];
    var list = pref === 'mp4' ? mp4.concat(webm) : pref === 'webm' ? webm : auto;
    for (var i = 0; i < list.length; i++) {
      try { if (window.MediaRecorder && MediaRecorder.isTypeSupported(list[i])) return list[i]; } catch (e) { }
    }
    return '';
  }

  function outputSize() {
    var clips = state.clips;
    var first = clips[0] || { width: 1280, height: 720 };
    var ls = longSideFor();
    var ar = (first.width || 1280) / (first.height || 720);
    var w, h;
    if (ar >= 1) { w = ls; h = Math.round(ls / ar); } else { h = ls; w = Math.round(ls * ar); }
    w = Math.max(2, Math.round(w / 2) * 2);
    h = Math.max(2, Math.round(h / 2) * 2);
    return { w: w, h: h, ls: ls };
  }

  function exportVideo(forceDefaultMime) {
    if (state.exporting) return;
    if (!state.clips.length) { toast(t('msgNoClip')); return; }
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
      toast(t('msgNoRec'));
      return;
    }
    pause();
    state.exporting = true;
    state.cancelRequested = false;

    var clips = state.clips.slice();
    var total = clips.reduce(function (s, c) { return s + Math.max(0, c.end - c.start); }, 0);
    if (total <= 0) { toast(t('msgNoClip')); state.exporting = false; return; }

    var out = outputSize();
    var fps = 30;
    var bitrate = Math.round(estimateBitrate());
    var mime = forceDefaultMime ? '' : pickMime();

    dlog('export start', { mime: mime, bitrate: bitrate, out: out, fps: fps, clips: clips.length, total: total, audio: !!dest });
    var canvas = document.createElement('canvas');
    canvas.width = out.w;
    canvas.height = out.h;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    var vStream = canvas.captureStream(fps);
    var ac = null, dest = null;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      ac = new AC();
      if (ac.state === 'suspended') ac.resume();
      dest = ac.createMediaStreamDestination();
    } catch (e) { ac = null; dest = null; }

    var tracks = vStream.getVideoTracks().slice();
    if (dest) tracks = tracks.concat(dest.stream.getAudioTracks());
    var stream = new MediaStream(tracks);

    var rec;
    var recOpts = { videoBitsPerSecond: bitrate, audioBitsPerSecond: 128000 };
    if (mime) recOpts.mimeType = mime;
    try {
      rec = new MediaRecorder(stream, recOpts);
    } catch (e) {
      try { rec = new MediaRecorder(stream); }
      catch (e2) { toast(t('msgNoRec')); state.exporting = false; return; }
    }

    var chunks = [];
    rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };

    uiExportStart();

    var stopped = new Promise(function (resolve) { rec.onstop = resolve; });
    rec.start(1000);
    try { rec.pause(); } catch (e) { dlog('recorder pause failed', e); }
    rec.onerror = function (e) { dlog('recorder error', e); };

    var done = 0;
    var runOne = function (i) {
      if (i >= clips.length || state.cancelRequested) return Promise.resolve();
      var clip = clips[i];
      dlog('clip ' + (i + 1) + '/' + clips.length, clip.name, clip.start.toFixed(2), '->', clip.end.toFixed(2));
      return recordClip(clip, ctx, canvas, ac, dest, rec, function (p) {
        var overall = (done + p * Math.max(0, clip.end - clip.start)) / total;
        setProgress(overall, t('exporting') + ' · ' + t('clipLabel') + ' ' + (i + 1) + '/' + clips.length);
      }).then(function () {
        done += Math.max(0, clip.end - clip.start);
        setProgress(done / total, t('exporting') + ' · ' + t('clipLabel') + ' ' + (i + 1) + '/' + clips.length);
        return runOne(i + 1);
      });
    };

    runOne(0).then(function () {
      dlog('all clips recorded, finalizing', { chunks: chunks.length });
      setProgress(state.cancelRequested ? done / total : 1, t('finalizing'));
      try { if (rec.state === 'paused') rec.resume(); } catch (e) { }
      try { rec.stop(); } catch (e) { }
      return stopped;
    }).then(function () {
      try { if (ac) ac.close(); } catch (e) { }
      var type = mime && mime.indexOf('mp4') > -1 ? 'video/mp4' : 'video/webm';
      var ext = type === 'video/mp4' ? 'mp4' : 'webm';
      var blob = new Blob(chunks, { type: type });
      state.exporting = false;
      if (!chunks.length) {
        // Some browsers claim to support a codec but mux nothing — retry once
        // with whatever the browser picks by default.
        if (mime !== '') {
          uiExportEnd();
          toast(t('msgRetry'));
          exportVideo(true);
        } else {
          uiExportEnd();
          toast(t('msgCancelled'));
        }
        return;
      }
      var url = URL.createObjectURL(blob);
      var stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
      var name = 'cutfree-' + stamp + '.' + ext;
      var link = $('#downloadLink');
      link.href = url;
      link.download = name;
      $('#doneBox').hidden = false;
      var a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      if (state.cancelRequested) toast(t('msgCancelled'));
      else toast(t('doneMsg'));
      setTimeout(function () { $('#progressWrap').hidden = true; $('#btnCancel').hidden = true; $('#btnExport').disabled = false; }, 600);
    })['catch'](function (err) {
      dlog('export failed', err);
      state.exporting = false;
      try { if (ac) ac.close(); } catch (e) { }
      uiExportEnd();
      toast(t('msgNoRec'));
    });
  }

  function recordClip(clip, ctx, canvas, ac, dest, rec, onProgress) {
    return new Promise(function (resolve) {
      var v = document.createElement('video');
      var source = null, gain = null, raf = 0;
      var finished = false;

      var cleanup = function () {
        if (finished) return;
        finished = true;
        dlog('clip done at', v.currentTime);
        cancelAnimationFrame(raf);
        try { v.pause(); } catch (e) { }
        try { if (source) source.disconnect(); } catch (e) { }
        try { if (gain) gain.disconnect(); } catch (e) { }
        v.removeAttribute('src');
        try { v.load(); } catch (e) { }
        try { rec.pause(); } catch (e) { }
        resolve();
      };

      v.playsInline = true;
      v.preload = 'auto';
      v.volume = 1;
      v.muted = false;
      v.src = clip.url;

      onceEvent(v, 'loadedmetadata', 8000).then(function () {
        if (!v.duration) dlog('metadata timeout for', clip.name);
        var dur = isFinite(v.duration) && v.duration > 0 ? v.duration : clip.duration;
        dlog('loaded', clip.name, 'dur', dur, v.videoWidth + 'x' + v.videoHeight);
        var startAt = clip.start;
        var endAt = Math.min(clip.end, dur > 0 ? dur : clip.end);

        if (ac && dest) {
          try {
            source = ac.createMediaElementSource(v);
            gain = ac.createGain();
            gain.gain.value = clip.muted ? 0 : 1;
            source.connect(gain);
            gain.connect(dest);
          } catch (e) { source = null; }
        }

        var drawFrame = function () {
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          if (v.videoWidth && v.videoHeight) {
            var r = fitRect(v.videoWidth, v.videoHeight, canvas.width, canvas.height);
            try { ctx.drawImage(v, r.x, r.y, r.w, r.h); } catch (e) { }
          }
        };

        seekTo(v, Math.min(startAt, Math.max(0, dur - 0.05))).then(function () {
          drawFrame();
          try { rec.resume(); } catch (e) { }

          var loop = function () {
            if (state.cancelRequested) return cleanup();
            drawFrame();
            var span = Math.max(0.05, endAt - startAt);
            if (onProgress) onProgress(clamp((v.currentTime - startAt) / span, 0, 1));
            if (v.currentTime >= endAt - 0.03 || v.ended) return cleanup();
            raf = requestAnimationFrame(loop);
          };

          var p = v.play();
          if (p && p['catch']) p['catch'](function (err) { dlog('play rejected', err && err.name); });
          dlog('recording clip from', startAt.toFixed(2), 'to', endAt.toFixed(2));
          raf = requestAnimationFrame(loop);
        });
      });

      setTimeout(function () { if (!finished && !v.duration) { dlog('hard timeout, no duration'); cleanup(); } }, 12000);
    });
  }

  function uiExportStart() {
    $('#btnExport').disabled = true;
    $('#btnCancel').hidden = false;
    $('#doneBox').hidden = true;
    $('#progressWrap').hidden = false;
    setProgress(0, t('exporting'));
    toast(t('msgExporting'));
  }

  function uiExportEnd() {
    $('#btnExport').disabled = false;
    $('#btnCancel').hidden = true;
    $('#progressWrap').hidden = true;
  }

  function setProgress(p, note) {
    p = clamp(p, 0, 1);
    $('#progressBar').style.width = (p * 100).toFixed(1) + '%';
    $('#progressText').textContent = Math.round(p * 100) + '%';
    $('#progressNote').textContent = note || '';
  }

  /* ----------------------------------------------------------------- wiring */
  function init() {
    els.toast = $('#toast');

    // language
    var lang = store('cutfree.lang') || 'bn';
    window.CF_LANG = lang;
    applyStaticStrings();
    renderInfoSections();

    // file inputs
    var fileInput = $('#fileInput');
    var openPicker = function () { fileInput.value = ''; fileInput.click(); };
    $('#btnAdd').addEventListener('click', openPicker);
    $('#heroAdd').addEventListener('click', openPicker);
    $('#ctaAdd').addEventListener('click', openPicker);
    $('#btnAddMore').addEventListener('click', openPicker);
    $('#btnSample').addEventListener('click', makeSampleClip);
    fileInput.addEventListener('change', function () { addFiles(fileInput.files); });

    // dropzone + whole card drag & drop
    var dz = $('#dropzone');
    ['dragenter', 'dragover'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('over'); });
    });
    dz.addEventListener('drop', function (e) { if (e.dataTransfer) addFiles(e.dataTransfer.files); });

    var app = $('#app');
    app.addEventListener('dragover', function (e) { e.preventDefault(); });
    app.addEventListener('drop', function (e) {
      e.preventDefault();
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
    });
    ['dragover', 'drop'].forEach(function (ev) {
      window.addEventListener(ev, function (e) { if (e.target === document.body) e.preventDefault(); });
    });

    // transport
    $('#btnPlay').addEventListener('click', toggle);
    $('#btnPrev').addEventListener('click', function () {
      var wasPlaying = state.playing;
      if (state.activeIndex > 0) selectClip(state.activeIndex - 1, wasPlaying);
      else selectClip(0, wasPlaying);
    });
    $('#btnNext').addEventListener('click', function () {
      var wasPlaying = state.playing;
      if (state.activeIndex < state.clips.length - 1) selectClip(state.activeIndex + 1, wasPlaying);
    });
    $('#btnSplit').addEventListener('click', splitAtPlayhead);

    var preview = $('#preview');
    preview.addEventListener('click', toggle);
    preview.addEventListener('play', function () { state.playing = true; updateTransport(); });
    preview.addEventListener('pause', function () {
      if (!state.exporting) { state.playing = false; cancelAnimationFrame(state.raf); updateTransport(); updateActiveCard(); }
    });
    preview.addEventListener('loadedmetadata', function () { paintPlayhead(); });

    // export
    $('#btnExport').addEventListener('click', exportVideo);
    $('#btnCancel').addEventListener('click', function () {
      state.cancelRequested = true;
      toast(t('msgCancelled'));
    });
    ['#selRes', '#selQuality', '#selFormat'].forEach(function (sel) {
      $(sel).addEventListener('change', renderStats);
    });

    $('#btnClear').addEventListener('click', clearAll);
    $('#langBtn').addEventListener('click', function () {
      setLang(window.CF_LANG === 'bn' ? 'en' : 'bn');
    });

    // keyboard
    document.addEventListener('keydown', function (e) {
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea' || e.metaKey || e.ctrlKey) return;
      if (!state.clips.length) return;
      if (e.code === 'Space') { e.preventDefault(); toggle(); }
      else if (e.key === 's' || e.key === 'S') { e.preventDefault(); splitAtPlayhead(); }
      else if (e.key === 'ArrowLeft' && state.activeIndex > 0) { e.preventDefault(); selectClip(state.activeIndex - 1, false); }
      else if (e.key === 'ArrowRight' && state.activeIndex < state.clips.length - 1) { e.preventDefault(); selectClip(state.activeIndex + 1, false); }
      else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); deleteClip(state.activeIndex); }
    });

    window.addEventListener('beforeunload', function (e) {
      if (state.clips.length && !state.exporting) { e.preventDefault(); e.returnValue = ''; }
    });

    render();
    renderStats();

    if (DEBUG) {
      window.cfDebug = function () {
        var v = $('#preview');
        return {
          playing: state.playing,
          exporting: state.exporting,
          activeIndex: state.activeIndex,
          preview: { src: (v.getAttribute('src') || '').slice(0, 24), clipId: v.dataset.clipId, err: v.error ? v.error.code : null, ct: v.currentTime, paused: v.paused, ended: v.ended, readyState: v.readyState, seeking: v.seeking, dur: v.duration },
          clips: state.clips.map(function (c) { return { name: c.name, start: +c.start.toFixed(2), end: +c.end.toFixed(2), dur: +c.duration.toFixed(2) }; }),
          mimeProbe: {
            mp4: MediaRecorder.isTypeSupported('video/mp4'),
            mp4avc: MediaRecorder.isTypeSupported('video/mp4;codecs=avc1.42E01E,mp4a.40.2'),
            vp9: MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus'),
            vp8: MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
          },
          pickedMime: pickMime(),
          formatSelect: $('#selFormat').value
        };
      };
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
