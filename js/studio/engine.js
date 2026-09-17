/* ============================================================================
   CutFree Studio — deterministic motion-graphics renderer

   Every pixel is a pure function of time: renderAt(t) paints frame t with no
   accumulated state, so the live preview and the exported file are identical
   frame for frame (and any frame can be re-rendered for a thumbnail).

   Layers per frame
     1. animated background  (aurora blobs + ribbons + colour wash, blended with
        screen / lighter / overlay / color-dodge, rendered at 0.62x then upscaled
        for a soft filmic look and a big performance win)
     2. energy-reactive particles (music drives the motion)
     3. scene content        (kinetic typography, stats, bullets, quotes, CTA)
     4. transitions          (fade / slide / zoom / wipe / glitch)
     5. filmic finish        (vignette, animated grain, progress bar, watermark)
   ========================================================================== */
(function (w) {
  'use strict';

  var CFX = w.CFX = w.CFX || {};
  var TAU = Math.PI * 2;

  // exit transitions cycled through by the auto-director
  var TRANSITIONS = ['fade', 'slide', 'zoom', 'wipe', 'glitch',
    'maskCircle', 'maskBox', 'pageTurn', 'blurZoom', 'whipPan', 'bars'];

  /* ------------------------------------------------------------------ maths */
  var E = {
    linear: function (x) { return x; },
    outCubic: function (x) { return 1 - Math.pow(1 - x, 3); },
    outExpo: function (x) { return x >= 1 ? 1 : 1 - Math.pow(2, -10 * x); },
    outBack: function (x) { var c = 1.70158, c3 = c + 1; return 1 + c3 * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); },
    inOutSine: function (x) { return -(Math.cos(Math.PI * x) - 1) / 2; },
    outQuint: function (x) { return 1 - Math.pow(1 - x, 5); },
    elastic: function (x) {
      if (x === 0 || x === 1) return x;
      return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * (TAU / 3)) + 1;
    }
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function hexToRgb(hex) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function rgba(hex, a) {
    var c = hexToRgb(hex);
    return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')';
  }
  function mixHex(a, b, t) {
    var ca = hexToRgb(a), cb = hexToRgb(b);
    return 'rgb(' + Math.round(lerp(ca.r, cb.r, t)) + ',' + Math.round(lerp(ca.g, cb.g, t)) + ',' + Math.round(lerp(ca.b, cb.b, t)) + ')';
  }

  // Radial-gradient sprites are baked once and then drawn as images: creating
  // dozens of gradients per frame was the single biggest cost in the renderer.
  var SPRITE_CACHE = {};
  function glowSprite(color) {
    var key = color + '@160';
    if (SPRITE_CACHE[key]) return SPRITE_CACHE[key];
    var size = 160;
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var g = c.getContext('2d');
    var r = size / 2;
    var grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, rgba(color, 1));
    grad.addColorStop(0.45, rgba(color, 0.42));
    grad.addColorStop(1, rgba(color, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    SPRITE_CACHE[key] = c;
    return c;
  }

  function makeNoiseTile(size) {
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var ctx = c.getContext('2d');
    var img = ctx.createImageData(size, size);
    var rand = mulberry32(1337);
    for (var i = 0; i < img.data.length; i += 4) {
      var v = 110 + rand() * 90;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  /* ------------------------------------------------------------ text helpers */
  function isRTL(text) {
    return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(String(text || ''));
  }

  function wrapLines(ctx, text, maxWidth) {
    var paragraphs = String(text == null ? '' : text).split('\n');
    var lines = [];
    paragraphs.forEach(function (para) {
      var words = para.split(/\s+/).filter(Boolean);
      if (!words.length) { lines.push(''); return; }
      var line = '';
      words.forEach(function (word) {
        var test = line ? line + ' ' + word : word;
        if (ctx.measureText(test).width > maxWidth && line) {
          lines.push(line);
          line = word;
        } else line = test;
      });
      if (line) lines.push(line);
    });
    return lines;
  }

  // draws text word by word: reveal 0..1 controls how much has landed
  function drawKinetic(ctx, o) {
    var size = o.size;
    var isArabic = isRTL(o.text || (o.lines ? o.lines.join(' ') : ''));
    var family = o.family || (isArabic ? CFX.FONTS.arabic : CFX.FONTS.display);
    var weight = o.weight || 700;
    ctx.font = weight + ' ' + size + 'px ' + family;
    if (isArabic) ctx.direction = 'rtl';
    else ctx.direction = 'ltr';
    var maxWidth = o.maxWidth || ctx.canvas.width;
    var theme = ctx.__cfxTheme || CFX.THEMES.aurora;   // drawKinetic lives outside the renderer scope
    var lines = o.lines || wrapLines(ctx, o.text, maxWidth);
    var lineHeight = size * (o.lineHeight || 1.24);
    var total = lines.reduce(function (n, l) { return n + l.split(/\s+/).filter(Boolean).length; }, 0) || 1;
    var reveal = clamp(o.reveal == null ? 1 : o.reveal, 0, 1);
    var align = o.align || 'left';
    var startY = o.y - ((lines.length - 1) * lineHeight) / 2;

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    // Voice tracking: when o.times is given (one {s,e} per word, in order) the
    // words appear exactly when they are spoken instead of on a uniform stagger.
    var times = o.times || null;
    var now = o.time == null ? -1 : o.time;
    var activeIdx = -1;
    var index = 0;
    lines.forEach(function (line, li) {
      var words = line.split(/\s+/).filter(Boolean);
      var widths = words.map(function (word) { return ctx.measureText(word).width; });
      var spaceWidth = ctx.measureText(' ').width;
      var lineWidth = widths.reduce(function (a, b) { return a + b; }, 0) + spaceWidth * Math.max(0, words.length - 1);
      var x = align === 'center' ? o.x - lineWidth / 2 : align === 'right' ? o.x - lineWidth : o.x;

      ctx.save();
      if (o.blurIn && reveal < 1) {
        ctx.shadowColor = rgba(o.glow || o.fillColor || '#ffffff', 0.55 * (1 - reveal));
        ctx.shadowBlur = size * 0.45 * (1 - reveal);
      }

      words.forEach(function (word, wi) {
        var gi = index;
        var tw = times && times[gi] ? times[gi] : null;
        var p, active = false;
        if (tw && now >= 0) {
          if (o.hard) p = now >= tw.s ? 1 : 0;                       // typewriter
          else p = clamp((now - tw.s) / Math.max(0.001, tw.e - tw.s), 0, 1);
          active = now >= tw.s && now < tw.e;
          if (active) activeIdx = gi;
        } else {
          var startAt = (gi / total) * (o.stagger == null ? 0.62 : o.stagger);
          p = clamp((reveal - startAt) / 0.26, 0, 1);
        }
        var eased = E.outExpo(clamp(p, 0, 1));
        var dx = (1 - eased) * size * (o.dirX == null ? 0 : o.dirX);
        var dy = (1 - eased) * size * (o.dirY == null ? 0.42 : o.dirY);
        var wy = startY + li * lineHeight;
        index++;

        if (p > 0) {
          var fill = o.fill;
          if (typeof fill === 'function') fill = fill(x + dx, wy, lineWidth, size, index);
          var emphasised = o.emphasis && o.emphasis.indexOf(gi) > -1;
          ctx.globalAlpha = clamp(p * 1.15, 0, 1) * (o.alpha == null ? 1 : o.alpha);

          if (active && o.activeStyle !== 'none') {
            // the word being spoken right now: spring bounce + soft pill + accent + glow
            var wordProg = tw ? clamp((now - tw.s) / Math.max(0.001, tw.e - tw.s), 0, 1) : 0.5;
            var popScale = 1 + 0.08 * Math.sin(wordProg * Math.PI);
            var cx = x + dx + widths[wi] / 2;
            var cy = wy - size * 0.25;

            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(popScale, popScale);
            ctx.translate(-cx, -cy);

            ctx.save();
            ctx.globalAlpha *= 0.92;
            ctx.fillStyle = rgba(theme.accent, 0.25);
            roundRectPath(ctx, x + dx - size * 0.14, wy - size * 0.65, widths[wi] + size * 0.28, size * 1.22, size * 0.26);
            ctx.fill();
            ctx.restore();

            ctx.fillStyle = mixHex(theme.accent, '#ffffff', 0.25);
            ctx.shadowColor = rgba(theme.accent, 0.95);
            ctx.shadowBlur = size * 0.55;
            ctx.fillText(word, x + dx, wy + dy);
            ctx.restore();
          } else if (emphasised) {
            ctx.fillStyle = accentGradientFor(ctx, x + dx, wy - size * 0.5, widths[wi] + 2, size);
            ctx.shadowColor = rgba(theme.accent, 0.35);
            ctx.shadowBlur = size * 0.22;
            ctx.fillText(word, x + dx, wy + dy);
            ctx.shadowBlur = 0;
          } else if (active && o.activeStyle === 'none') {
            ctx.fillStyle = mixHex(theme.accent, '#ffffff', 0.2);
            ctx.fillText(word, x + dx, wy + dy);
          } else {
            ctx.fillStyle = fill || '#fff';
            ctx.fillText(word, x + dx, wy + dy);
          }
          if (o.emphasisUnderline && emphasised) {
            ctx.save();
            ctx.globalAlpha *= 0.75;
            ctx.fillStyle = rgba(theme.accent, 0.85);
            roundRectPath(ctx, x + dx, wy + size * 0.62, widths[wi], Math.max(2, size * 0.07), size * 0.05);
            ctx.fill();
            ctx.restore();
          }
        }
        x += widths[wi] + spaceWidth;
      });
      ctx.restore();
    });

    // typewriter caret sitting right after the word being spoken
    if (o.hard && times && now >= 0 && activeIdx > -1) {
      var caret = caretPosFor(o, times, activeIdx, size, maxWidth);
      if (caret) {
        ctx.save();
        ctx.globalAlpha = (0.55 + 0.45 * Math.abs(Math.sin(now * 6))) * (o.alpha == null ? 1 : o.alpha);
        ctx.fillStyle = mixHex(theme.accent, '#ffffff', 0.3);
        ctx.fillRect(caret.x, caret.y - size * 0.46, Math.max(2, size * 0.1), size * 0.92);
        ctx.restore();
      }
    }

    // moving light band across the glyphs ("shimmer")
    if (o.shimmer != null && reveal > 0.95) {
      var span = o.shimmerSpan || 0.5;
      var pos = ((o.shimmer % 1) / span) * 2 - 0.5;
      var gx = o.x - maxWidth * 0.5 + pos * maxWidth;
      var grad = ctx.createLinearGradient(gx - size, 0, gx + size, 0);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.85)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.5 * (o.alpha == null ? 1 : o.alpha);
      ctx.font = weight + ' ' + size + 'px ' + family;
      lines.forEach(function (line, li) {
        var words = line.split(/\s+/).filter(Boolean);
        var widths = words.map(function (word) { return ctx.measureText(word).width; });
        var spaceWidth = ctx.measureText(' ').width;
        var lineWidth = widths.reduce(function (a, b) { return a + b; }, 0) + spaceWidth * Math.max(0, words.length - 1);
        var x = align === 'center' ? o.x - lineWidth / 2 : align === 'right' ? o.x - lineWidth : o.x;
        ctx.fillStyle = grad;
        ctx.fillText(line, x, startY + li * lineHeight);
      });
      ctx.restore();
    }
    return { lines: lines, lineHeight: lineHeight, startY: startY };
  }

  function accentGradientFor(ctx, x, y, w, h) {
    var theme = (ctx.__cfxTheme) || CFX.THEMES.aurora;
    var g = ctx.createLinearGradient(x, y, x + w, y + h * 0.5);
    g.addColorStop(0, theme.text);
    g.addColorStop(0.55, mixHex(theme.accent, '#ffffff', 0.35));
    g.addColorStop(1, theme.accent2);
    return g;
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    r = Math.min(r || 0, Math.min(w, h) / 2);
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // Where does the caret go for the word currently being spoken?
  function caretPosFor(o, times, activeIdx, size, maxWidth) {
    var family = o.family || CFX.FONTS.display;
    var weight = o.weight || 700;
    var lineHeight = size * (o.lineHeight || 1.24);
    var lines = o.lines || [];
    var startY = o.y - ((lines.length - 1) * lineHeight) / 2;
    ctx.font = weight + ' ' + size + 'px ' + family;
    var index = 0;
    for (var li = 0; li < lines.length; li++) {
      var words = lines[li].split(/\s+/).filter(Boolean);
      var widths = words.map(function (word) { return ctx.measureText(word).width; });
      var spaceWidth = ctx.measureText(' ').width;
      var lineWidth = widths.reduce(function (a, b) { return a + b; }, 0) + spaceWidth * Math.max(0, words.length - 1);
      var x = o.align === 'center' ? o.x - lineWidth / 2 : o.align === 'right' ? o.x - lineWidth : o.x;
      for (var wi = 0; wi < words.length; wi++) {
        if (index === activeIdx) {
          return { x: x + widths[wi] + Math.max(2, size * 0.08), y: startY + li * lineHeight };
        }
        index++;
        x += widths[wi] + spaceWidth;
      }
    }
    return null;
  }

  // Shrinks the type until the copy fits the safe area and the line budget —
  // that is what keeps 30-character Bengali headlines and long English ones
  // both looking intentional instead of clipped.
  function fitText(ctx, text, o) {
    var size = o.maxSize;
    var minSize = o.minSize || o.maxSize * 0.42;
    var family = o.family || CFX.FONTS.display;
    var weight = o.weight || 700;
    var lines, widest;
    for (var guard = 0; guard < 40; guard++) {
      ctx.font = weight + ' ' + size + 'px ' + family;
      lines = wrapLines(ctx, String(text == null ? '' : text), o.maxWidth);
      widest = 0;
      for (var i = 0; i < lines.length; i++) {
        var w = ctx.measureText(lines[i]).width;
        if (w > widest) widest = w;
      }
      var tooTall = lines.length > (o.maxLines || 3);
      var tooWide = widest > o.maxWidth * 1.001;   // unbreakable word (URL, code) case
      if ((!tooTall && !tooWide) || size <= minSize) break;
      size *= tooWide && !tooTall ? 0.96 : 0.93;
    }
    return { size: size, lines: lines, lineHeight: size * (o.lineHeight || 1.22), widest: widest };
  }

  function drawRule(ctx, x, y, w, h, colorA, colorB) {
    var g = ctx.createLinearGradient(x, y, x + w, y);
    g.addColorStop(0, colorA);
    g.addColorStop(1, colorB);
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  }

  /* ------------------------------------------------------------------ engine */
  function createRenderer(canvas, spec) {
    var theme = CFX.THEMES[spec.meta.theme] || CFX.THEMES.aurora;
    var W = canvas.width = spec.width;
    var H = canvas.height = spec.height;
    var U = Math.min(W, H);                 // layout unit so 9:16 and 16:9 both breathe
    var ctx = canvas.getContext('2d');
    ctx.__cfxTheme = theme;                 // helpers outside this scope need it
    var fps = spec.fps || 30;
    var seed = spec.meta.seed || 12345;
    var rand = mulberry32(seed);
    var energy = spec.energy || null;       // Float32Array sampled at 10 Hz
    var scenes = spec.scenes || [];
    var captions = spec.captions || [];
    var captionCfg = Object.assign({ enabled: true, style: 'bar', scale: 1 }, spec.meta.captions || {});

    // Safe area: Shorts/Reels draw over the top and bottom of the frame, so the
    // content window shrinks instead of hiding behind the YouTube UI.
    var safeTop = clamp((spec.meta.safe && spec.meta.safe.top) != null ? spec.meta.safe.top : 0.05, 0, 0.3);
    var safeBottom = clamp((spec.meta.safe && spec.meta.safe.bottom) != null ? spec.meta.safe.bottom : 0.07, 0, 0.4);
    var WIN_TOP = H * safeTop;
    var WIN_BOTTOM = H * (1 - safeBottom);
    var WIN_H = Math.max(U * 0.2, WIN_BOTTOM - WIN_TOP);
    var WIN_CY = WIN_TOP + WIN_H / 2;
    var total = scenes.reduce(function (s, sc) { return s + (sc.dur || 3); }, 0);

    // Performance dial — 'high' for desktops, 'balanced' for tablets, 'fast'
    // for phones or long renders. It scales the expensive blended layers only;
    // typography and compositing stay pixel-perfect in every mode.
    var perf = spec.meta.perf || 'high';
    var RIBBONS = perf === 'fast' ? 1 : perf === 'balanced' ? 2 : 3;
    var BLOBS = perf === 'fast' ? 4 : perf === 'balanced' ? 5 : 6;
    var PARTICLES = perf === 'fast' ? 20 : perf === 'balanced' ? 32 : 46;
    var SHINE = perf !== 'fast';
    var GRAIN_MUL = perf === 'fast' ? 0.6 : 1;

    // Offscreen layers. The blended aurora work is low frequency (big soft
    // gradients), so we rasterise it at a fraction of the output size and
    // upscale: same look, ~4x less pixel work for the expensive blend modes.
    var bgScale = perf === 'fast' ? 0.26
      : perf === 'balanced' ? 0.3
        : (W * H >= 1920 * 1080 ? 0.32 : 0.38);
    var bg = document.createElement('canvas');
    bg.width = Math.max(2, Math.round(W * bgScale));
    bg.height = Math.max(2, Math.round(H * bgScale));
    var bgx = bg.getContext('2d');
    var layer = document.createElement('canvas');
    layer.width = W; layer.height = H;
    var lx = layer.getContext('2d');
    var noiseTile = makeNoiseTile(128);
    var noisePattern = ctx.createPattern(noiseTile, 'repeat');
    var vignetteGrad = null;        // built once, reused forever
    var gradCache = {};             // per-frame gradient memo
    var gradEpoch = 0;

    /* ---------------------------------------------------------- timeline map */
    var starts = [], acc = 0;
    scenes.forEach(function (sc) { starts.push(acc); acc += (sc.dur || 3); });

    function sceneAt(t) {
      if (!scenes.length) return null;
      t = clamp(t, 0, Math.max(0, total - 1e-6));
      var i = 0;
      while (i < starts.length - 1 && t >= starts[i] + scenes[i].dur) i++;
      var local = t - starts[i];
      return { index: i, scene: scenes[i], local: local, dur: scenes[i].dur || 3, progress: clamp(local / (scenes[i].dur || 3), 0, 1) };
    }

    function energyAt(t) {
      if (!energy || !energy.length) return 0.45;
      var f = t * 10;
      var i = clamp(Math.floor(f), 0, energy.length - 1);
      var j = Math.min(energy.length - 1, i + 1);
      return lerp(energy[i], energy[j], f - i);
    }

    function palette(t) {
      // slow walk through the theme colours so the grade keeps shifting
      var k = (t / 14) % 1;
      var idx = Math.floor(k * theme.blobs.length);
      var a = theme.blobs[idx % theme.blobs.length];
      var b = theme.blobs[(idx + 1) % theme.blobs.length];
      return { a: a, b: b, mix: k * theme.blobs.length - idx };
    }

    /* -------------------------------------------------------------- backdrop */
    var blobSeed = [];
    (function () {
      var r = mulberry32(seed + 7);
      for (var i = 0; i < BLOBS; i++) {
        blobSeed.push({
          px: r(), py: r(), r: 0.22 + r() * 0.34,
          sx: 0.06 + r() * 0.13, sy: 0.05 + r() * 0.11,
          ph: r() * TAU, ph2: r() * TAU, depth: 0.35 + r() * 0.8
        });
      }
    })();

    function drawBackground(t, cam) {
      var bw = bg.width, bh = bg.height;
      var pal = palette(t);
      var e = energyAt(t);

      bgx.setTransform(1, 0, 0, 1, 0, 0);
      bgx.globalCompositeOperation = 'source-over';
      bgx.globalAlpha = 1;
      bgx.fillStyle = theme.bg;
      bgx.fillRect(0, 0, bw, bh);

      // base colour wash: two huge gradients breathing against each other
      var g1 = bgx.createLinearGradient(
        bw * (0.1 + 0.15 * Math.sin(t * 0.11)), 0,
        bw * (0.9 + 0.1 * Math.cos(t * 0.09)), bh
      );
      g1.addColorStop(0, rgba(pal.a, 0.75));
      g1.addColorStop(0.55, rgba(pal.b, 0.45));
      g1.addColorStop(1, rgba(theme.blobs[(Math.floor(t / 14) + 2) % theme.blobs.length], 0.28));
      bgx.globalCompositeOperation = theme.blend[0] || 'screen';
      bgx.fillStyle = g1;
      bgx.fillRect(0, 0, bw, bh);

      // aurora ribbons
      if (theme.aurora) {
        bgx.globalCompositeOperation = 'screen';
        for (var rb = 0; rb < RIBBONS; rb++) {
          var phase = t * (0.16 + rb * 0.05) + rb * 2.1;
          var grd = bgx.createLinearGradient(0, 0, bw, bh);
          grd.addColorStop(0, rgba(theme.blobs[rb % theme.blobs.length], 0));
          grd.addColorStop(0.5, rgba(theme.blobs[(rb + 1) % theme.blobs.length], 0.5 + 0.2 * e));
          grd.addColorStop(1, rgba(theme.blobs[(rb + 2) % theme.blobs.length], 0));
          bgx.strokeStyle = grd;
          bgx.lineWidth = bh * (0.05 + 0.02 * rb) * (1 + 0.25 * e);
          bgx.lineCap = 'round';
          bgx.beginPath();
          bgx.moveTo(-bw * 0.1, bh * (0.25 + rb * 0.22) + Math.sin(phase) * bh * 0.18);
          bgx.bezierCurveTo(
            bw * 0.3, bh * (0.1 + rb * 0.25) + Math.cos(phase * 1.3) * bh * 0.3,
            bw * 0.7, bh * (0.9 - rb * 0.2) + Math.sin(phase * 0.8) * bh * 0.28,
            bw * 1.1, bh * (0.7 - rb * 0.2) + Math.cos(phase * 1.1) * bh * 0.2
          );
          bgx.stroke();
        }
      }

      // blobs
      for (var i = 0; i < BLOBS; i++) {
        var s = blobSeed[i];
        var drift = cam ? cam.drift : 0;
        var cx = (s.px + 0.42 * Math.sin(t * s.sx + s.ph)) * bw - drift * 60 * s.depth;
        var cy = (s.py + 0.36 * Math.cos(t * s.sy + s.ph2)) * bh;
        var rad = s.r * U * bgScale * (1 + 0.28 * e + 0.06 * Math.sin(t * 0.7 + i));
        var col = theme.blobs[i % theme.blobs.length];
        bgx.globalCompositeOperation = theme.blend[i % theme.blend.length] || 'screen';
        bgx.globalAlpha = 0.55 * (0.7 + 0.5 * e);
        bgx.drawImage(glowSprite(col), cx - rad, cy - rad, rad * 2, rad * 2);
        bgx.globalAlpha = 1;
      }

      // soft moving "god ray" band
      if (SHINE) {
      bgx.globalCompositeOperation = 'overlay';
      var shine = bgx.createLinearGradient(
        bw * (0.5 + 0.5 * Math.sin(t * 0.23)), -bh * 0.2,
        bw * (0.5 + 0.5 * Math.sin(t * 0.23)) + bw * 0.35, bh * 1.2
      );
      shine.addColorStop(0, 'rgba(255,255,255,0)');
      shine.addColorStop(0.5, 'rgba(255,255,255,' + (0.06 + 0.06 * e) + ')');
      shine.addColorStop(1, 'rgba(255,255,255,0)');
      bgx.fillStyle = shine;
      bgx.fillRect(0, 0, bw, bh);
      }

      // filmic vignette straight onto the small canvas (cheap, keeps text crisp)
      if (theme.vignette > 0) {
        if (!vignetteGrad || vignetteGrad.w !== bw) {
          var dark = Math.round(255 * (1 - theme.vignette));
          var g = bgx.createRadialGradient(bw / 2, bh / 2, Math.min(bw, bh) * 0.18, bw / 2, bh / 2, Math.max(bw, bh) * 0.62);
          g.addColorStop(0, 'rgba(255,255,255,1)');
          g.addColorStop(1, 'rgba(' + dark + ',' + dark + ',' + dark + ',1)');
          g.w = bw;
          vignetteGrad = g;
        }
        bgx.globalCompositeOperation = 'multiply';
        bgx.globalAlpha = 1;
        bgx.fillStyle = vignetteGrad;
        bgx.fillRect(0, 0, bw, bh);
      }

      // upscale onto the main canvas with a slow camera push
      var zoom = cam ? cam.zoom : 1;
      var ox = cam ? cam.ox : 0, oy = cam ? cam.oy : 0;
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.translate(W / 2 + ox, H / 2 + oy);
      ctx.scale(zoom, zoom);
      ctx.drawImage(bg, -W / 2, -H / 2, W, H);
      ctx.restore();
    }

    /* -------------------------------------------------------------- particles */
    var pSeed = [];
    (function () {
      var r = mulberry32(seed + 99);
      for (var i = 0; i < PARTICLES; i++) {
        pSeed.push({
          x: r(), y: r(), r: 0.6 + r() * 2.2, sp: 0.02 + r() * 0.06,
          ph: r() * TAU, drift: (r() - 0.5) * 0.4, alpha: 0.25 + r() * 0.5
        });
      }
    })();

    function drawParticles(t, alphaMul) {
      var e = energyAt(t);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < PARTICLES; i++) {
        var p = pSeed[i];
        var x = ((p.x + t * p.sp * 0.12 + 1) % 1) * W + Math.sin(t * 0.4 + p.ph) * U * 0.02;
        var y = ((p.y - t * p.sp * 0.2 + 1) % 1) * H + Math.cos(t * 0.33 + p.ph) * U * 0.015;
        var rad = p.r * U * 0.004 * (1 + 0.9 * e);
        ctx.globalAlpha = p.alpha * alphaMul * (0.55 + 0.45 * e);
        var sprite = glowSprite(theme.blobs[i % theme.blobs.length]);
        ctx.drawImage(sprite, x - rad * 3, y - rad * 3, rad * 6, rad * 6);
      }
      ctx.restore();
    }

    /* ---------------------------------------------------------- scene drawing */
    function sceneChrome(scene, p) {
      // per-scene entrance/exit ramps used by every content drawer
      var inRamp = clamp(p / 0.22, 0, 1);
      var outRamp = clamp((1 - p) / 0.16, 0, 1);
      return {
        reveal: E.outExpo(inRamp),
        out: E.outCubic(outRamp),
        raw: p
      };
    }

    function angleFor(cx, cy, i, local) { return -Math.PI / 2 + i * 0.7 + local * 0.4; }

    function drawSceneContent(c, scene, local, p) {
      var ch = sceneChrome(scene, p);
      var pal = palette(starts[0] + local);
      var e = energyAt(local);
      var margin = U * 0.085;
      var maxW = W - margin * 2;
      var accentGrad = function (x, y, w, h) {
        var g = c.createLinearGradient(x, y, x + w, y + h * 0.4);
        g.addColorStop(0, theme.text);
        g.addColorStop(0.55, mixHex(theme.accent, '#ffffff', 0.35));
        g.addColorStop(1, theme.accent2);
        return g;
      };
      var shimmerPos = (local * 0.55) % 1;

      c.save();
      c.globalAlpha = ch.out;

      switch (scene.type) {
        case 'intro': {
          var fitted = fitText(c, scene.title, {
            maxWidth: maxW, maxLines: 3, maxSize: U * 0.125, minSize: U * 0.062, lineHeight: 1.2
          });
          var hasSub = !!scene.subtitle;
          var subFit = hasSub ? fitText(c, scene.subtitle, {
            maxWidth: maxW * 0.84, maxLines: 2, maxSize: U * 0.044, minSize: U * 0.03, weight: 500, lineHeight: 1.4
          }) : null;
          var blockH = fitted.lines.length * fitted.lineHeight;
          var subBlockH = hasSub ? 1.5 * subFit.lineHeight : 0;
          var gap = U * 0.055;
          var totalH = blockH + (hasSub ? gap + subBlockH : 0);
          var top = WIN_CY - totalH / 2 - U * 0.01;

          drawKinetic(c, {
            text: scene.title, lines: fitted.lines, x: W / 2, y: top + blockH / 2, size: fitted.size,
            align: 'center', maxWidth: maxW, lineHeight: 1.2,
            reveal: clamp(ch.reveal * 1.25, 0, 1), dirY: 0.5, blurIn: true,
            fill: function () { return accentGrad(0, 0, W, H); },
            shimmer: shimmerPos, glow: theme.accent
          });

          drawRule(c, W / 2 - U * 0.16 * E.outExpo(ch.reveal), top - U * 0.045,
            U * 0.32 * E.outExpo(ch.reveal), Math.max(2, U * 0.006), theme.accent, theme.accent2);

          if (hasSub) {
            drawKinetic(c, {
              text: scene.subtitle, lines: subFit.lines, x: W / 2, y: top + blockH + gap + subBlockH / 2,
              size: subFit.size, align: 'center', maxWidth: maxW * 0.84, weight: 500, lineHeight: 1.4,
              reveal: clamp((ch.reveal - 0.45) * 2.2, 0, 1), dirY: 0.6,
              fill: rgba(theme.sub, 0.95)
            });
          }
          break;
        }

        case 'text': {
          var headFit = fitText(c, scene.heading || scene.title || '', {
            maxWidth: maxW, maxLines: 2, maxSize: U * 0.056, minSize: U * 0.034, weight: 800, lineHeight: 1.24
          });
          var bodyFit = fitText(c, scene.body || scene.text || '', {
            maxWidth: maxW * 0.9, maxLines: 5, maxSize: U * 0.064, minSize: U * 0.034, weight: 600, lineHeight: 1.34
          });
          var hasHead = !!(scene.heading || scene.title);
          var bodyH = bodyFit.lines.length * bodyFit.lineHeight;
          var headH = hasHead ? headFit.lines.length * headFit.lineHeight : 0;
          var gap2 = hasHead ? U * 0.05 : 0;
          var totalH2 = headH + bodyH + gap2;
          var top2 = WIN_CY - totalH2 / 2;

          if (hasHead) {
            drawKinetic(c, {
              text: scene.heading || scene.title, lines: headFit.lines, x: W / 2, y: top2 + headH / 2,
              size: headFit.size, align: 'center', maxWidth: maxW, weight: 800, lineHeight: 1.24,
              reveal: clamp(ch.reveal * 1.5, 0, 1), fill: rgba(theme.accent, 1), dirY: 0.5
            });
          }
          drawKinetic(c, {
            text: scene.body || scene.text, lines: bodyFit.lines, x: W / 2, y: top2 + headH + gap2 + bodyH / 2,
            size: bodyFit.size, align: 'center', maxWidth: maxW * 0.9, weight: 600, lineHeight: 1.34,
            reveal: clamp((ch.reveal - 0.18) * 1.35, 0, 1), dirY: 0.5,
            fill: accentGrad(0, 0, W, H), shimmer: shimmerPos
          });
          break;
        }


        /* ------------------------------------------------------------ story
           Every story scene carries `words` with scene-relative times, so the
           typography is driven by the narrator's voice and nothing else. */
        case 'storyTitle': {
          var kickFit = fitText(c, (scene.kicker || '').toUpperCase(), {
            maxWidth: maxW, maxLines: 1, maxSize: U * 0.032, minSize: U * 0.022, weight: 700
          });
          var tFit = fitText(c, scene.title || '', {
            maxWidth: maxW, maxLines: 3, maxSize: U * 0.145, minSize: U * 0.07, lineHeight: 1.16
          });
          var sFit = scene.subtitle ? fitText(c, scene.subtitle, {
            maxWidth: maxW * 0.86, maxLines: 2, maxSize: U * 0.04, minSize: U * 0.026, weight: 500, lineHeight: 1.42
          }) : null;
          var tH = tFit.lines.length * tFit.lineHeight;
          var sH = sFit ? sFit.lines.length * sFit.lineHeight : 0;
          var blockTop = WIN_CY - (tH + sH + (sFit ? U * 0.05 : 0) + U * 0.10) / 2;

          drawKinetic(c, {
            text: scene.kicker || '', lines: kickFit.lines, x: W / 2, y: blockTop + U * 0.03,
            size: kickFit.size, align: 'center', maxWidth: maxW, weight: 700, lineHeight: 1.2,
            reveal: clamp(ch.reveal * 1.8, 0, 1), fill: rgba(theme.accent, 1), dirY: 0.2
          });
          drawRule(c, W / 2 - U * 0.14, blockTop + U * 0.062, U * 0.28, Math.max(1.5, U * 0.0035),
            rgba(theme.accent, 0.15), rgba(theme.accent2, 0.85));

          drawKinetic(c, {
            text: scene.title || '', lines: tFit.lines, x: W / 2, y: blockTop + U * 0.10 + tH / 2,
            size: tFit.size, align: 'center', maxWidth: maxW, lineHeight: 1.16,
            reveal: clamp((ch.reveal - 0.12) * 1.5, 0, 1), dirY: 0.55, blurIn: true, shimmer: shimmerPos,
            fill: function () { return accentGrad(0, 0, W, H); }, glow: theme.accent
          });

          if (sFit) {
            drawKinetic(c, {
              text: scene.subtitle, lines: sFit.lines, x: W / 2,
              y: blockTop + U * 0.10 + tH + U * 0.05 + sH / 2,
              size: sFit.size, align: 'center', maxWidth: maxW * 0.86, weight: 500, lineHeight: 1.42,
              reveal: clamp((ch.reveal - 0.4) * 1.6, 0, 1), dirY: 0.35,
              fill: rgba(theme.text, 0.72), alpha: 0.95
            });
          }

          // slow breathing glow behind the title
          c.save();
          c.globalCompositeOperation = 'screen';
          c.globalAlpha = 0.16 + 0.06 * Math.sin(local * 1.4);
          var halo = c.createRadialGradient(W / 2, WIN_CY, 0, W / 2, WIN_CY, U * 0.6);
          halo.addColorStop(0, rgba(theme.accent, 0.55));
          halo.addColorStop(1, rgba(theme.accent, 0));
          c.fillStyle = halo;
          c.fillRect(0, 0, W, H);
          c.restore();
          break;
        }

        case 'story':
        case 'storyQuote': {
          var storyStyle = scene.style || 'reveal';
          var isQuote = scene.type === 'storyQuote';
          var bodyMax = U * (storyStyle === 'board' ? 0.072 : storyStyle === 'typewriter' ? 0.082 : 0.078);
          var txtFit = fitText(c, scene.text || '', {
            maxWidth: maxW * (storyStyle === 'board' ? 0.82 : 0.94),
            maxLines: storyStyle === 'board' ? 5 : 4,
            maxSize: bodyMax, minSize: U * 0.04,
            weight: storyStyle === 'board' ? 600 : 700, lineHeight: 1.32
          });
          var times = (scene.words && scene.words.length) ? scene.words.map(function (wd) {
            return { s: wd.s, e: wd.e };
          }) : null;
          var blockH = txtFit.lines.length * txtFit.lineHeight;
          var panelPad = U * 0.055;
          var cy = WIN_CY + (storyStyle === 'board' ? U * 0.006 : 0);

          if (storyStyle === 'board' || isQuote) {
            // a storybook panel: the text sits on a soft card with a progress rule
            var panelW = maxW * 0.94;
            var panelH = blockH + panelPad * 2;
            c.save();
            c.globalAlpha = ch.out * 0.98;
            var pg = c.createLinearGradient(0, cy - panelH / 2, 0, cy + panelH / 2);
            pg.addColorStop(0, 'rgba(6,10,22,0.62)');
            pg.addColorStop(1, 'rgba(6,10,22,0.42)');
            c.fillStyle = pg;
            roundRectPath(c, W / 2 - panelW / 2, cy - panelH / 2, panelW, panelH, U * 0.035);
            c.fill();
            c.globalAlpha = ch.out * 0.55;
            c.lineWidth = Math.max(1, U * 0.0022);
            c.strokeStyle = rgba(theme.accent, 0.45);
            c.stroke();
            // progress rule along the bottom edge of the panel
            c.globalAlpha = ch.out * 0.9;
            var pw = (panelW - panelPad * 1.2) * clamp(p, 0, 1);
            drawRule(c, W / 2 - (panelW - panelPad * 1.2) / 2, cy + panelH / 2 - U * 0.02, Math.max(2, pw), Math.max(2, U * 0.004),
              rgba(theme.accent, 0.9), rgba(theme.accent2, 0.35));
            c.restore();
          }

          if (isQuote) {
            c.save();
            c.globalAlpha = ch.out * 0.5;
            c.font = '700 ' + (U * 0.2) + 'px ' + CFX.FONTS.display;
            c.fillStyle = rgba(theme.accent, 0.85);
            c.textAlign = 'left';
            c.textBaseline = 'top';
            c.fillText('“', W / 2 - maxW / 2 - U * 0.02, cy - blockH / 2 - U * 0.13);
            c.restore();
          }

          if (storyStyle === 'stack') {
            // teleprompter: the spoken line is big, what came before stays faint
            var lines = txtFit.lines;
            var lineTimes = [];
            var cursorWord = 0;
            lines.forEach(function (ln) {
              var cnt = ln.split(/\s+/).filter(Boolean).length;
              var first = times ? times[cursorWord] : null;
              var last = times ? times[Math.min(times.length - 1, cursorWord + cnt - 1)] : null;
              lineTimes.push({ s: first ? first.s : 0, e: last ? last.e : 0 });
              cursorWord += cnt;
            });
            var activeLine = 0;
            for (var li2 = 0; li2 < lines.length; li2++) {
              if (times && local >= lineTimes[li2].s) activeLine = li2;
            }
            lines.forEach(function (ln, li3) {
              var dist = li3 - activeLine;
              var alpha = dist === 0 ? 1 : dist < 0 ? clamp(0.42 + dist * 0.18, 0.06, 0.42) : 0;
              if (alpha <= 0.02) return;
              var size = txtFit.size * (dist === 0 ? 1 : 0.82);
              var y = cy + dist * txtFit.lineHeight * (dist === 0 ? 0.9 : 0.62);
              c.save();
              c.globalAlpha = ch.out * alpha;
              c.font = '700 ' + size + 'px ' + CFX.FONTS.display;
              c.textAlign = 'center';
              c.textBaseline = 'middle';
              c.fillStyle = dist === 0 ? accentGrad(0, 0, W, H) : rgba(theme.text, 0.7);
              c.fillText(ln, W / 2, y);
              c.restore();
            });
          } else {
            drawKinetic(c, {
              text: scene.text || '', lines: txtFit.lines, x: W / 2, y: cy,
              size: txtFit.size, align: 'center', maxWidth: maxW * 0.94,
              weight: storyStyle === 'board' ? 600 : 700, lineHeight: 1.32,
              reveal: ch.reveal, times: times, time: local, activeStyle: 'glow',
              emphasis: scene.emphasis, emphasisUnderline: true,
              hard: storyStyle === 'typewriter',
              fill: function () { return accentGrad(0, 0, W, H); }
            });
          }
          break;
        }

        case 'storyList': {
          var items2 = scene.items && scene.items.length ? scene.items : [scene.text || ''];
          var rowGap = U * 0.022;
          var perItem = [];
          var wCursor = 0;
          items2.forEach(function (it) {
            var f = fitText(c, it, { maxWidth: maxW * 0.84, maxLines: 2, maxSize: U * 0.058, minSize: U * 0.034, weight: 600, lineHeight: 1.3 });
            var count = (CFX.align ? CFX.align.words(it).length : it.split(/\s+/).length);
            perItem.push({ fit: f, words: (scene.words || []).slice(wCursor, wCursor + count) });
            wCursor += count;
          });
          var stackH2 = perItem.reduce(function (t2, it) { return t2 + it.fit.lines.length * it.fit.lineHeight + rowGap; }, 0) - rowGap;
          var top3 = WIN_CY - stackH2 / 2;
          var yCursor = top3;
          perItem.forEach(function (it, ii) {
            var first = it.words[0];
            var spoken = !first || local >= first.s - 0.02;
            var active = first && local >= first.s && local < it.words[it.words.length - 1].e;
            var h = it.fit.lines.length * it.fit.lineHeight;
            if (spoken) {
              c.save();
              c.globalAlpha = ch.out;
              // marker
              var mr = U * 0.011;
              c.fillStyle = active ? mixHex(theme.accent, '#ffffff', 0.25) : rgba(theme.accent, 0.75);
              if (active) { c.shadowColor = rgba(theme.accent, 0.8); c.shadowBlur = U * 0.02; }
              c.beginPath();
              c.arc(W / 2 - maxW * 0.42, yCursor + h / 2, mr * (active ? 1.35 : 1), 0, TAU);
              c.fill();
              c.restore();
              drawKinetic(c, {
                text: it.fit.lines.join(' '), lines: it.fit.lines, x: W / 2, y: yCursor + h / 2,
                size: it.fit.size, align: 'center', maxWidth: maxW * 0.84, weight: 600, lineHeight: 1.3,
                reveal: clamp((local - (first ? first.s : 0)) / 0.35 + 0.25, 0, 1),
                times: it.words.length ? it.words.map(function (wd) { return { s: wd.s, e: wd.e }; }) : null,
                time: local, activeStyle: 'glow', fill: rgba(theme.text, 0.96)
              });
            }
            yCursor += h + rowGap;
          });
          break;
        }

        case 'storyBeat': {
          var dots = 3;
          var pulse = clamp(p * 3, 0, 1);
          c.save();
          c.globalAlpha = ch.out * 0.85;
          drawRule(c, W / 2 - U * 0.16, WIN_CY - U * 0.05, U * 0.32, Math.max(1, U * 0.0022),
            rgba(theme.accent, 0.05), rgba(theme.accent, 0.5));
          drawRule(c, W / 2 - U * 0.16, WIN_CY + U * 0.05, U * 0.32, Math.max(1, U * 0.0022),
            rgba(theme.accent, 0.5), rgba(theme.accent, 0.05));
          c.restore();
          for (var d = 0; d < dots; d++) {
            var on = clamp((local * 2.4) - d * 0.5, 0, 1);
            var grow = 1 + 0.35 * (1 - on);
            c.save();
            c.globalAlpha = ch.out * (0.25 + 0.75 * E.outCubic(on)) * pulse;
            c.fillStyle = mixHex(theme.accent, '#ffffff', d * 0.2);
            c.beginPath();
            c.arc(W / 2 + (d - 1) * U * 0.055, WIN_CY, U * 0.014 * grow, 0, TAU);
            c.fill();
            c.restore();
          }
          break;
        }

        case 'storyEnd': {
          var eFit = fitText(c, scene.title || '', {
            maxWidth: maxW, maxLines: 2, maxSize: U * 0.13, minSize: U * 0.07, lineHeight: 1.2
          });
          var cFit = scene.cta ? fitText(c, scene.cta, {
            maxWidth: maxW * 0.86, maxLines: 3, maxSize: U * 0.038, minSize: U * 0.024, weight: 500, lineHeight: 1.42
          }) : null;
          var eH = eFit.lines.length * eFit.lineHeight;
          var cH = cFit ? cFit.lines.length * cFit.lineHeight : 0;
          var eTop = WIN_CY - (eH + cH + (cFit ? U * 0.06 : 0)) / 2;
          drawKinetic(c, {
            text: scene.title || '', lines: eFit.lines, x: W / 2, y: eTop + eH / 2,
            size: eFit.size, align: 'center', maxWidth: maxW, lineHeight: 1.2,
            reveal: clamp(ch.reveal * 1.35, 0, 1), dirY: 0.5, shimmer: shimmerPos,
            fill: function () { return accentGrad(0, 0, W, H); }, glow: theme.accent
          });
          drawRule(c, W / 2 - U * 0.1, eTop + eH + U * 0.03, U * 0.2, Math.max(1.5, U * 0.003),
            rgba(theme.accent, 0.15), rgba(theme.accent2, 0.8));
          if (cFit) {
            drawKinetic(c, {
              text: scene.cta, lines: cFit.lines, x: W / 2, y: eTop + eH + U * 0.06 + cH / 2,
              size: cFit.size, align: 'center', maxWidth: maxW * 0.86, weight: 500, lineHeight: 1.42,
              reveal: clamp((ch.reveal - 0.35) * 1.5, 0, 1), dirY: 0.3, fill: rgba(theme.text, 0.75)
            });
          }
          break;
        }

        case 'bullets': {
          var items = scene.items || [];
          var headFit3 = fitText(c, scene.heading || '', {
            maxWidth: maxW, maxLines: 2, maxSize: U * 0.052, minSize: U * 0.032, weight: 800
          });
          var headH3 = scene.heading ? headFit3.lines.length * headFit3.lineHeight : 0;
          var rowH = U * 0.115;
          var rowsH = Math.max(1, items.length) * rowH;
          var stackH = headH3 + (scene.heading ? U * 0.09 : 0) + rowsH;
          var headTop = WIN_CY - stackH / 2;
          if (scene.heading) {
            drawKinetic(c, {
              text: scene.heading, lines: headFit3.lines, x: W / 2, y: headTop + headH3 / 2, size: headFit3.size,
              align: 'center', maxWidth: maxW, weight: 800, lineHeight: 1.22,
              reveal: clamp(ch.reveal * 1.6, 0, 1), fill: rgba(theme.accent, 1)
            });
          }
          var startY = headTop + headH3 + U * 0.09;
          items.forEach(function (item, i) {
            var rp = clamp((ch.reveal - 0.14 - i * 0.12) / 0.3, 0, 1);
            var eased = E.outExpo(rp);
            var y = startY + i * rowH;
            var x = margin * 1.1 - (1 - eased) * U * 0.05;
            c.save();
            c.globalAlpha = ch.out * eased;
            // bullet chip
            var chip = U * 0.032;
            var g = c.createLinearGradient(x, y - chip, x + chip * 2, y + chip);
            g.addColorStop(0, theme.accent2);
            g.addColorStop(1, theme.accent);
            c.fillStyle = g;
            c.beginPath();
            c.roundRect ? c.roundRect(x, y - chip * 0.8, chip * 1.9, chip * 1.6, chip * 0.5) : c.rect(x, y - chip * 0.8, chip * 1.9, chip * 1.6);
            c.fill();
            c.restore();
            var itemFit = fitText(c, item, {
              maxWidth: maxW - chip * 3.2, maxLines: 2, maxSize: U * 0.05, minSize: U * 0.03, weight: 600, lineHeight: 1.24
            });
            drawKinetic(c, {
              text: item, lines: itemFit.lines, x: x + chip * 2.9,
              y: y - (itemFit.lines.length - 1) * itemFit.lineHeight / 2,
              size: itemFit.size, align: 'left', maxWidth: maxW - chip * 3.2, weight: 600,
              lineHeight: 1.24, reveal: 1, alpha: ch.out * eased, fill: rgba(theme.text, 0.98)
            });
          });
          break;
        }

        case 'stat': {
          var value = scene.value == null ? 0 : Number(scene.value);
          var shown = value * E.outExpo(clamp(ch.reveal * 1.2, 0, 1));
          var display = (scene.prefix || '') + (Number.isInteger(value) ? Math.round(shown).toLocaleString('en-US') : shown.toFixed(1)) + (scene.suffix || '');
          var statY = WIN_CY - U * 0.045;
          drawKinetic(c, {
            text: display, x: W / 2, y: statY, size: U * 0.19, align: 'center', weight: 800,
            reveal: 1, alpha: clamp(ch.reveal * 1.4, 0, 1), family: CFX.FONTS.mono,
            fill: accentGrad(0, 0, W, H), shimmer: shimmerPos
          });
          var sFit = fitText(c, scene.label || '', {
            maxWidth: maxW, maxLines: 2, maxSize: U * 0.044, minSize: U * 0.03, weight: 600
          });
          drawKinetic(c, {
            text: scene.label || '', lines: sFit.lines, x: W / 2, y: statY + U * 0.15, size: sFit.size,
            align: 'center', maxWidth: maxW, weight: 600,
            reveal: clamp((ch.reveal - 0.3) * 2, 0, 1), fill: rgba(theme.sub, 0.95)
          });
          var barW = U * 0.42;
          drawRule(c, W / 2 - barW / 2, statY + U * 0.21, barW * E.outExpo(clamp((ch.reveal - 0.35) * 1.6, 0, 1)),
            Math.max(2, U * 0.005), theme.accent, theme.accent2);
          break;
        }

        case 'quote': {
          c.save();
          c.globalAlpha = 0.35 * ch.out;
          c.fillStyle = rgba(theme.accent, 0.8);
          c.font = '900 ' + (U * 0.34) + 'px ' + CFX.FONTS.display;
          c.textAlign = 'center';
          c.fillText('“', W / 2, WIN_CY - U * 0.2);
          c.restore();
          var qFit = fitText(c, scene.text || '', {
            maxWidth: maxW * 0.84, maxLines: 5, maxSize: U * 0.06, minSize: U * 0.034, weight: 600, lineHeight: 1.36
          });
          var qH = qFit.lines.length * qFit.lineHeight;
          var qTop = WIN_CY - qH / 2 - U * 0.012;
          drawKinetic(c, {
            text: scene.text || '', lines: qFit.lines, x: W / 2, y: qTop + qH / 2, size: qFit.size,
            align: 'center', maxWidth: maxW * 0.84, weight: 600, lineHeight: 1.36,
            reveal: clamp(ch.reveal * 1.25, 0, 1), dirY: 0.45,
            fill: accentGrad(0, 0, W, H), shimmer: shimmerPos
          });
          drawKinetic(c, {
            text: scene.author || '', x: W / 2, y: qTop + qH + U * 0.075, size: U * 0.036,
            align: 'center', weight: 700, reveal: clamp((ch.reveal - 0.5) * 2, 0, 1),
            fill: rgba(theme.accent, 1)
          });
          break;
        }

        case 'broll': {
          // pure motion design: concentric rings + energy bars, no text needed
          var cx = W / 2, cy = WIN_CY - (scene.label ? U * 0.06 : 0);
          c.save();
          c.globalCompositeOperation = 'lighter';
          for (var i = 0; i < 5; i++) {
            var rp = clamp(ch.reveal * 1.4 - i * 0.12, 0, 1);
            if (rp <= 0) continue;
            var rr = U * (0.1 + i * 0.075) * (0.85 + 0.3 * rp) * (1 + 0.12 * e);
            c.globalAlpha = (0.5 - i * 0.07) * ch.out * rp;
            c.strokeStyle = mixHex(theme.blobs[i % theme.blobs.length], theme.accent, 0.3);
            c.lineWidth = U * 0.008;
            c.beginPath();
            c.arc(cx, cy, rr, angleFor(cx, cy, i, local), angleFor(cx, cy, i, local) + 1.9 + i * 0.4);
            c.stroke();
          }
          var bars = 40;
          var bw2 = (W * 0.62) / bars;
          for (var b = 0; b < bars; b++) {
            var amp = energyAt(local + b * 0.06);
            var hh = U * (0.02 + amp * 0.16) * ch.reveal * ch.out;
            var xx = W / 2 - (bars * bw2) / 2 + b * bw2;
            c.globalAlpha = 0.75 * ch.out;
            var bg2 = c.createLinearGradient(0, cy - hh / 2, 0, cy + hh / 2);
            bg2.addColorStop(0, mixHex(theme.accent2, '#ffffff', 0.2));
            bg2.addColorStop(1, theme.accent);
            c.fillStyle = bg2;
            c.beginPath();
            c.roundRect ? c.roundRect(xx, cy + U * 0.2 - hh / 2, bw2 * 0.62, hh, bw2 * 0.3) : c.rect(xx, cy + U * 0.2 - hh / 2, bw2 * 0.62, hh);
            c.fill();
          }
          c.restore();
          if (scene.label) {
            var bFit = fitText(c, scene.label, {
              maxWidth: maxW * 0.8, maxLines: 2, maxSize: U * 0.046, minSize: U * 0.03, weight: 700
            });
            drawKinetic(c, {
              text: scene.label, lines: bFit.lines, x: W / 2, y: cy + U * 0.34, size: bFit.size, align: 'center',
              maxWidth: maxW * 0.8, weight: 700, reveal: clamp((ch.reveal - 0.35) * 1.8, 0, 1),
              fill: rgba(theme.text, 0.95)
            });
          }
          break;
        }

        case 'outro': {
          var oFit = fitText(c, scene.title || '', {
            maxWidth: maxW, maxLines: 3, maxSize: U * 0.1, minSize: U * 0.05, weight: 800, lineHeight: 1.22
          });
          var oSubFit = scene.subtitle ? fitText(c, scene.subtitle, {
            maxWidth: maxW * 0.86, maxLines: 3, maxSize: U * 0.044, minSize: U * 0.028, weight: 500, lineHeight: 1.36
          }) : null;
          var oTitleH = oFit.lines.length * oFit.lineHeight;
          var oSubH = oSubFit ? oSubFit.lines.length * oSubFit.lineHeight : 0;
          var oGap = oSubFit ? U * 0.05 : 0;
          var oPill = scene.cta ? U * 0.095 + U * 0.07 : 0;
          var oTotal = oTitleH + oGap + oSubH + oPill;
          var oTop = WIN_CY - oTotal / 2;

          drawKinetic(c, {
            text: scene.title || '', lines: oFit.lines, x: W / 2, y: oTop + oTitleH / 2, size: oFit.size,
            align: 'center', maxWidth: maxW, weight: 800, lineHeight: 1.22,
            reveal: clamp(ch.reveal * 1.3, 0, 1), fill: accentGrad(0, 0, W, H), shimmer: shimmerPos
          });
          if (scene.subtitle && oSubFit) {
            drawKinetic(c, {
              text: scene.subtitle, lines: oSubFit.lines, x: W / 2, y: oTop + oTitleH + oGap + oSubH / 2,
              size: oSubFit.size, align: 'center', maxWidth: maxW * 0.86, weight: 500, lineHeight: 1.36,
              reveal: clamp((ch.reveal - 0.35) * 2, 0, 1), fill: rgba(theme.sub, 0.95)
            });
          }
          if (scene.cta) {
            var pillW = U * 0.46, pillH = U * 0.095;
            var px = W / 2 - pillW / 2, py = oTop + oTitleH + oGap + oSubH + U * 0.06;
            var pp = E.outBack(clamp((ch.reveal - 0.5) * 2.2, 0, 1));
            c.save();
            c.globalAlpha = ch.out * pp;
            var pg = c.createLinearGradient(px, py, px + pillW, py + pillH);
            pg.addColorStop(0, theme.accent2);
            pg.addColorStop(1, theme.accent);
            c.fillStyle = pg;
            c.beginPath();
            c.roundRect ? c.roundRect(px, py, pillW * pp, pillH, pillH / 2) : c.rect(px, py, pillW * pp, pillH);
            c.fill();
            if (pp > 0.85) {
              c.fillStyle = theme.bg;
              c.font = '800 ' + (U * 0.04) + 'px ' + CFX.FONTS.display;
              c.textAlign = 'center';
              c.textBaseline = 'middle';
              c.fillText(scene.cta, W / 2, py + pillH / 2 + 1);
            }
            c.restore();
          }
          break;
        }
      }
      c.restore();
    }

    /* ------------------------------------------------------------ transitions */
    // Exit-only transitions: the outgoing scene leaves (fade / push / zoom / wipe
    // / glitch) while the animated background stays alive behind it, then the
    // next scene enters with its own kinetic reveal. No timeline overlap, so
    // nothing repeats and the total duration stays exact.
    function drawSceneExit(kind, p, t) {
      var e = E.inOutSine(clamp(p, 0, 1));
      var out = E.outCubic(clamp(p, 0, 1));
      var ctxRef = ctx;
      ctx.save();
      switch (kind) {
        case 'slide':
          ctx.globalAlpha = 1 - e * 0.9;
          ctx.translate(0, -e * H * 0.1);
          break;
        case 'zoom':
          ctx.globalAlpha = 1 - e;
          ctx.translate(W / 2, H / 2);
          ctx.scale(1 + e * 0.22, 1 + e * 0.22);
          ctx.translate(-W / 2, -H / 2);
          break;
        case 'wipe':
          ctx.beginPath();
          ctx.rect((Math.floor(t) % 2 === 0) ? 0 : W * e, 0, W * (1 - e), H);
          ctx.clip();
          break;
        case 'maskCircle': {
          var rad = Math.max(1, Math.hypot(W, H) * 0.5 * (1 - out) + U * 0.03);
          ctx.beginPath();
          ctx.arc(W / 2, WIN_CY, rad, 0, TAU);
          ctx.clip();
          break;
        }
        case 'maskBox': {
          var hh = Math.max(1, WIN_H * (1 - out));
          ctx.beginPath();
          ctx.rect(0, WIN_CY - hh / 2, W, hh);
          ctx.clip();
          break;
        }
        case 'pageTurn': {
          var k = Math.max(0.02, 1 - out);
          ctx.globalAlpha = 0.4 + 0.6 * k;
          ctx.translate(W, 0);
          ctx.transform(k, 0, 0.08 * (1 - k), 1, 0, 0);
          ctx.translate(-W, 0);
          ctx.shadowColor = 'rgba(0,0,0,0.5)';
          ctx.shadowBlur = U * 0.05;
          ctx.shadowOffsetX = -U * 0.025;
          break;
        }
        case 'blurZoom':
          try { ctx.filter = 'blur(' + (e * 15).toFixed(1) + 'px)'; } catch (err) { }
          ctx.globalAlpha = 1 - e * 0.75;
          ctx.translate(W / 2, H / 2);
          ctx.scale(1 + e * 0.3, 1 + e * 0.3);
          ctx.translate(-W / 2, -H / 2);
          break;
        case 'whipPan': {
          var dir = (Math.floor(t) % 2 === 0) ? -1 : 1;
          ctx.globalAlpha = 1 - e * 0.7;
          ctx.translate(dir * e * W * 1.05, 0);
          break;
        }
        case 'bars': {
          // the frame breaks into stripes that slide away alternately
          var count = 12;
          var bh = H / count;
          ctx.globalAlpha = 1;
          for (var b = 0; b < count; b++) {
            var dirB = (b % 2 === 0) ? -1 : 1;
            ctx.drawImage(layer, 0, b * bh, W, bh, dirB * out * W, b * bh, W, bh);
          }
          ctx.restore();
          return;
        }
        case 'glitch':
          ctx.globalAlpha = 1 - e * 0.85;
          break;
        default:
          ctx.globalAlpha = 1 - e;
      }
      ctx.drawImage(layer, 0, 0);

      if (kind === 'glitch' && e > 0.1) {
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.4 * (1 - e);
        ctx.drawImage(layer, 14 * e * Math.sin(t * 55), 0);
        ctx.drawImage(layer, -14 * e * Math.cos(t * 47), 0);
      }
      ctx.restore();
    }

    /* ------------------------------------------------------------- captions */
    function activeCue(t) {
      for (var i = 0; i < captions.length; i++) {
        if (t >= captions[i].start && t < captions[i].end) return captions[i];
      }
      return null;
    }

    function drawCaptions(t, scene) {
      if (!captionCfg.enabled || captionCfg.style === 'none' || !captions.length) return;
      if (scene && scene.caption === false) return;    // story: the line already speaks

      var cue = activeCue(t);
      if (!cue) return;
      var text = String(cue.text || '').replace(/\n/g, ' ');
      if (!text) return;

      var portrait = H > W;
      var size = U * (portrait ? 0.05 : 0.04) * (captionCfg.scale || 1);
      var maxW = W * (portrait ? 0.86 : 0.74);
      var fit = fitText(ctx, text, { maxWidth: maxW, maxLines: 3, maxSize: size, minSize: U * 0.024, weight: 700, lineHeight: 1.3 });
      var blockH = fit.lines.length * fit.lineHeight;
      var y = WIN_BOTTOM - blockH / 2 - U * 0.02;
      var padX = U * 0.035, padY = U * 0.022;

      ctx.font = '700 ' + fit.size + 'px ' + CFX.FONTS.display;
      var widest = 0;
      fit.lines.forEach(function (line) {
        var w = ctx.measureText(line).width;
        if (w > widest) widest = w;
      });
      var plateW = Math.min(maxW + padX * 2, widest + padX * 2);
      var plateX = (W - plateW) / 2;
      var plateY = y - blockH / 2 - padY;
      var plateH = blockH + padY * 2;
      var radius = Math.min(U * 0.02, plateH / 2);

      var fade = clamp(Math.min((t - cue.start) / 0.18, (cue.end - t) / 0.18), 0, 1);
      ctx.save();
      ctx.globalAlpha = 0.86 * fade;
      ctx.fillStyle = 'rgba(6,10,18,0.74)';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(plateX, plateY, plateW, plateH, radius);
      else ctx.rect(plateX, plateY, plateW, plateH);
      ctx.fill();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.4 * fade;
      var edge = ctx.createLinearGradient(plateX, 0, plateX + plateW, 0);
      edge.addColorStop(0, theme.accent2);
      edge.addColorStop(0.5, 'rgba(255,255,255,0.35)');
      edge.addColorStop(1, theme.accent);
      ctx.strokeStyle = edge;
      ctx.lineWidth = Math.max(1, U * 0.0028);
      ctx.stroke();
      ctx.restore();

      var current = null;
      if (captionCfg.style === 'karaoke' && cue.words && cue.words.length) {
        for (var wi = 0; wi < cue.words.length; wi++) {
          if (t >= cue.words[wi].s && t < cue.words[wi].e) {
            current = String(cue.words[wi].w).replace(/[^\w\u0980-\u09FF]/g, '');
            break;
          }
        }
      }

      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '700 ' + fit.size + 'px ' + CFX.FONTS.display;
      fit.lines.forEach(function (line, li) {
        var ly = plateY + padY + fit.lineHeight * (li + 0.5);
        if (current) {
          var words = line.split(' ');
          var spaceW = ctx.measureText(' ').width;
          var widths = words.map(function (word) { return ctx.measureText(word).width; });
          var lineW = widths.reduce(function (a, b) { return a + b; }, 0) + spaceW * Math.max(0, words.length - 1);
          var x = W / 2 - lineW / 2;
          ctx.textAlign = 'left';
          words.forEach(function (word, wj) {
            var clean = word.replace(/[^\w\u0980-\u09FF]/g, '');
            var isCurrent = clean && current && clean.indexOf(current) === 0;
            ctx.globalAlpha = fade * (isCurrent ? 1 : 0.9);
            ctx.fillStyle = isCurrent ? theme.accent2 : 'rgba(255,255,255,0.95)';
            ctx.fillText(word, x, ly);
            x += widths[wj] + spaceW;
          });
          ctx.textAlign = 'center';
        } else {
          ctx.globalAlpha = fade;
          ctx.fillStyle = '#ffffff';
          ctx.fillText(line, W / 2, ly);
        }
      });
      ctx.restore();
    }

    /* ------------------------------------------------------- scene + overlays */
    function drawFrameAt(t) {
      var cur = sceneAt(t);
      if (!cur) return;
      gradEpoch++;

      // camera: slow push per scene keeps everything alive
      var isHook = cur.index === 0 || !!cur.scene.isHook;
      var hookShakeX = 0, hookShakeY = 0;
      if (isHook && cur.local < 0.45) {
        var hookIntensity = 1 - cur.local / 0.45;
        hookShakeX = Math.sin(cur.local * 65) * U * 0.012 * hookIntensity;
        hookShakeY = Math.cos(cur.local * 55) * U * 0.009 * hookIntensity;
      }

      var cam = {
        zoom: 1.035 + 0.045 * cur.progress + 0.02 * energyAt(t),
        ox: Math.sin(starts[cur.index] * 0.7 + t * 0.1) * U * 0.012 + hookShakeX,
        oy: Math.cos(t * 0.09) * U * 0.008 + hookShakeY,
        drift: cur.progress
      };

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);

      drawBackground(t, cam);
      drawParticles(t, 1);

      var exitLen = 0.55;
      var timeLeft = cur.dur - cur.local;
      var hasNext = cur.index < scenes.length - 1;

      var exiting = (hasNext && timeLeft < exitLen) || (!hasNext && t > total - 0.4);

      var layerPainted = false;   // the layer canvas is stale unless we just painted it
      var contentScale = 1 + 0.024 * cur.progress + 0.008 * energyAt(t);
      if (isHook && cur.local < 0.5) {
        var hookPunch = clamp(1 - cur.local / 0.5, 0, 1);
        contentScale += E.outBack(hookPunch) * 0.08;
      }
      if (!exiting) {
        // no transition: paint the scene with 3D parallax camera
        ctx.save();
        ctx.translate(W / 2 + cam.ox * 0.45, H / 2 + cam.oy * 0.45);
        ctx.scale(contentScale, contentScale);
        ctx.translate(-W / 2, -H / 2);
        drawSceneContent(ctx, cur.scene, cur.local, cur.progress);
        ctx.restore();
      } else {
        lx.clearRect(0, 0, W, H);
        lx.save();
        lx.translate(W / 2 + cam.ox * 0.45, H / 2 + cam.oy * 0.45);
        lx.scale(contentScale, contentScale);
        lx.translate(-W / 2, -H / 2);
        drawSceneContent(lx, cur.scene, cur.local, cur.progress);
        lx.restore();
        layerPainted = true;
      }

      if (!hasNext && t > total - 0.4) {
        ctx.save();
        ctx.globalAlpha = clamp((total - t) / 0.4, 0, 1);
        ctx.drawImage(layer, 0, 0);
        ctx.restore();
      } else if (hasNext && timeLeft < exitLen) {
        var p = 1 - timeLeft / exitLen;
        var kind = cur.scene.transitionOut || TRANSITIONS[(cur.index + 1) % TRANSITIONS.length];
        drawSceneExit(kind, p, t);
      } else if (layerPainted) {
        // only composite what we actually rendered this frame — the layer used to
        // be stale here, ghosting the last transition's scene over every frame
        ctx.drawImage(layer, 0, 0);
      }

      drawCaptions(t, cur.scene);

      // scene-entry flash (punchy cut-in) + powerful viral hook flare
      var flashDur = isHook ? 0.35 : 0.18;
      var flash = clamp(1 - cur.local / flashDur, 0, 1);
      if (flash > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = (isHook ? 0.28 : 0.16) * flash;
        var fg = ctx.createLinearGradient(0, 0, W, H);
        fg.addColorStop(0, theme.accent);
        fg.addColorStop(1, theme.accent2);
        ctx.fillStyle = fg;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }

      if (theme.grain > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'overlay';
        ctx.globalAlpha = theme.grain * GRAIN_MUL;
        var frame = Math.floor(t * fps);
        ctx.translate(-(frame * 37) % 128, -(frame * 61) % 128);
        ctx.fillStyle = noisePattern;
        ctx.fillRect(0, 0, W + 128, H + 128);
        ctx.restore();
      }

      // ---- chrome: progress bar, watermark, logo
      if (spec.meta.showProgress !== false) {
        var barH = Math.max(3, U * 0.007);
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = 'rgba(255,255,255,0.16)';
        ctx.fillRect(0, H - barH, W, barH);
        var pw = W * clamp(t / total, 0, 1);
        var pg = ctx.createLinearGradient(0, 0, W, 0);
        pg.addColorStop(0, theme.accent2);
        pg.addColorStop(1, theme.accent);
        ctx.fillStyle = pg;
        ctx.fillRect(0, H - barH, pw, barH);
        ctx.restore();
      }

      if (spec.meta.watermark) {
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.font = '600 ' + (U * 0.028) + 'px ' + CFX.FONTS.display;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = rgba(theme.text, 0.85);
        ctx.fillText(spec.meta.watermark, W - U * 0.05, H - U * 0.045);
        ctx.restore();
      }

      if (spec.meta.logoImage) {
        try {
          var lw = U * 0.09;
          var lh = lw * (spec.meta.logoImage.height / spec.meta.logoImage.width || 1);
          ctx.save();
          ctx.globalAlpha = 0.92;
          ctx.drawImage(spec.meta.logoImage, U * 0.05, U * 0.05, lw, lh);
          ctx.restore();
        } catch (e) { }
      }
    }

    return {
      canvas: canvas,
      width: W,
      height: H,
      fps: fps,
      duration: total,
      frameCount: Math.max(1, Math.floor(total * fps)),
      theme: theme,
      sceneAt: sceneAt,
      captionAt: activeCue,
      captions: captions,
      starts: starts,
      energyAt: energyAt,
      renderAt: drawFrameAt
    };
  }

  CFX.engine = {
    createRenderer: createRenderer,
    easing: E,
    wrapLines: wrapLines,
    drawKinetic: drawKinetic,
    mixHex: mixHex,
    rgba: rgba,
    mulberry32: mulberry32,
    transitions: TRANSITIONS
  };
})(window);
