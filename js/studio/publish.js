/* ============================================================================
   CutFree Studio — publishing kit

   - thumbnails rendered from the very same frame as the video (16:9 cover +
     9:16 short cover),   - a "publish pack" (video + thumbnail + metadata.json +
     chapters.txt + a self-contained HTML player),   - an optional direct upload
     to YouTube through the Data API v3 with the user's own free OAuth client,
     and   - the same pack can be handed to tools/yt-upload.mjs for unattended
     uploads (device-flow OAuth, no browser CORS involved).
   ========================================================================== */
(function (w) {
  'use strict';

  var CFX = w.CFX = w.CFX || {};

  function canvasToBlob(canvas, type, quality) {
    return new Promise(function (resolve) {
      if (canvas.toBlob) canvas.toBlob(function (b) { resolve(b); }, type, quality);
      else resolve(null);
    });
  }

  /* ------------------------------------------------------------- thumbnails */
  // renders the spec at a specific time into a fresh canvas of any size
  function thumbnail(spec, at, opts) {
    opts = opts || {};
    var width = opts.width || (spec.meta.aspect === '9:16' ? 1080 : 1280);
    var height = opts.height || (spec.meta.aspect === '9:16' ? 1920 : 720);
    var canvas = document.createElement('canvas');
    var copy = {
      meta: spec.meta, fps: spec.fps, width: width, height: height,
      scenes: spec.scenes, energy: spec.energy
    };
    var renderer = CFX.engine.createRenderer(canvas, copy);
    var t = Math.max(0, Math.min(renderer.duration - 0.05, at == null ? spec.scenes[0].dur * 0.55 : at));
    renderer.renderAt(t);
    return { canvas: canvas, time: t, renderer: renderer };
  }

  function thumbnailBlob(spec, at, opts) {
    var shot = thumbnail(spec, at, opts);
    // let two frames settle so fonts/metrics are warm before we grab pixels
    shot.renderer.renderAt(shot.time);
    return canvasToBlob(shot.canvas, (opts && opts.type) || 'image/png', 0.95)
      .then(function (blob) { return { blob: blob, canvas: shot.canvas, time: shot.time }; });
  }

  /* ------------------------------------------------------------ publish pack */
  function downloadBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
  }

  /* ------------------------------------------------------------ HTML players */
  // Player page for the exported video file (tiny, references the sibling file,
  // or inlines the video as a data URI when self-contained is requested).
  function videoPlayerHtml(meta, opts) {
    opts = opts || {};
    var title = String(meta.title || 'CutFree video').replace(/[<>&]/g, '');
    var desc = String(meta.description || '').replace(/[<>&]/g, '');
    var duration = opts.duration ? (Math.round(opts.duration) + 's') : '';
    var src = opts.dataUri || './' + (opts.videoName || 'video.webm');
    var chapters = (meta.chapters || []).map(function (c) {
      var m = Math.floor(c.at / 60), s = Math.floor(c.at % 60);
      return '<li data-at="' + c.at + '"><b>' + m + ':' + (s < 10 ? '0' : '') + s + '</b> ' +
        String(c.label).replace(/[<>&]/g, '') + '</li>';
    }).join('');
    return [
      '<!DOCTYPE html>',
      '<html lang="' + (meta.defaultLanguage === 'en' ? 'en' : 'bn') + '">',
      '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
      '<title>' + title + '</title>',
      '<style>',
      ':root{color-scheme:dark}',
      '*{box-sizing:border-box}',
      'body{margin:0;min-height:100%;background:radial-gradient(900px 500px at 15% -10%,#1b1b4a,transparent 60%),radial-gradient(700px 400px at 90% 0%,#0b3d4a,transparent 55%),#05070c;',
      'color:#e9eefb;font:16px/1.6 "Hind Siliguri","Noto Sans Bengali",system-ui,sans-serif;padding:28px 16px}',
      '.wrap{width:min(1080px,100%);margin:0 auto}',
      'h1{font-size:clamp(1.3rem,3.4vw,2rem);margin:0 0 6px}',
      '.meta{color:#93a2c0;font-size:.9rem;margin-bottom:16px}',
      'video{width:100%;height:auto;border-radius:16px;background:#000;box-shadow:0 24px 70px rgba(0,0,0,.6)}',
      '.row{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0}',
      'button{font:inherit;cursor:pointer;border-radius:999px;padding:9px 16px;border:1px solid #2b3a5f;background:#141d31;color:#e9eefb}',
      'button:hover{filter:brightness(1.15)}',
      '#ch{list-style:none;padding:0;display:grid;gap:6px;margin:18px 0}',
      '#ch li{cursor:pointer;padding:8px 12px;border:1px solid #22304c;border-radius:10px;background:#0d1524;font-size:.92rem}',
      '#ch li:hover{border-color:#4a6cff}',
      '#desc{white-space:pre-wrap;background:#0d1524;border:1px solid #22304c;border-radius:12px;padding:14px;color:#b9c6e3;font-size:.92rem}',
      '</style></head><body><div class="wrap">',
      '<h1>' + title + '</h1>',
      '<div class="meta">' + duration + (meta.publishAt ? ' · scheduled ' + meta.publishAt : '') + '</div>',
      '<video id="v" controls playsinline preload="metadata" poster="./thumbnail.jpg"><source src="' + src + '" type="video/webm"></video>',
      '<div class="row"><button id="copy">📋 Copy description</button><button id="dl">⬇️ Download video</button><button id="full">⛶ Fullscreen</button></div>',
      chapters ? '<ol id="ch">' + chapters + '</ol>' : '',
      '<div id="desc">' + desc + '</div>',
      '<script>',
      'var v=document.getElementById("v");',
      'document.getElementById("copy").onclick=function(){navigator.clipboard.writeText(document.getElementById("desc").textContent);this.textContent="✅ Copied";};',
      'document.getElementById("dl").onclick=function(){var a=document.createElement("a");a.href=v.querySelector("source").src;a.download="";a.click();};',
      'document.getElementById("full").onclick=function(){v.requestFullscreen&&v.requestFullscreen();};',
      'Array.prototype.forEach.call(document.querySelectorAll("#ch li"),function(li){li.onclick=function(){v.currentTime=parseFloat(li.dataset.at)||0;v.play();};});',
      '<\/script></div></body></html>'
    ].join('\n');
  }

  // "Living" page: the same deterministic engine + generative music, embedded.
  // No video file at all — the animation plays natively in the browser at any
  // resolution, which is the lightest possible way to publish a video.
  var MODULE_FILES = {
    themes: 'js/studio/themes.js',
    engine: 'js/studio/engine.js',
    music: 'js/studio/music.js'
  };

  function readModule(name) {
    var inline = document.querySelector('script[data-module="' + name + '"]');
    if (inline && inline.textContent.length > 200) return Promise.resolve(inline.textContent);
    return fetch(MODULE_FILES[name]).then(function (r) {
      if (!r.ok) throw new Error('could not read ' + name);
      return r.text();
    });
  }

  function animationHtml(spec, meta) {
    var names = Object.keys(MODULE_FILES);
    return Promise.all(names.map(readModule)).then(function (sources) {
      var musicOn = spec.meta.mood ? 'true' : 'false';
      return [
        '<!DOCTYPE html>',
        '<html lang="' + (spec.meta.language === 'en' ? 'en' : 'bn') + '">',
        '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
        '<title>' + String(meta.title).replace(/[<>&]/g, '') + '</title>',
        '<style>html,body{margin:0;height:100%;background:#04060c;color:#dfe7fb;display:grid;place-items:center;',
        'font:15px/1.5 "Hind Siliguri",system-ui,sans-serif}',
        '.wrap{width:min(100vw,1180px);padding:14px}canvas{width:100%;height:auto;border-radius:16px;box-shadow:0 30px 80px rgba(0,0,0,.65)}',
        '.bar{display:flex;gap:10px;align-items:center;justify-content:center;padding-top:12px;flex-wrap:wrap}',
        'button{font:inherit;cursor:pointer;border-radius:999px;padding:8px 16px;border:1px solid #2b3a5f;background:#141d31;color:#e9eefb}',
        'small{opacity:.65}</style></head><body><div class="wrap"><canvas id="c"></canvas>',
        '<div class="bar"><button id="p">▶︎ play</button><button id="m">♪ music: on</button>',
        '<small id="t">0.0s</small><small>' + String(meta.title).replace(/[<>&]/g, '') + '</small></div></div>',
        '<script>',
        'window.__SPEC__=' + JSON.stringify(spec).replace(/</g, '\\u003c') + ';',
        '<\/script>',
        sources.map(function (src) { return '<script>' + src + '<\/script>'; }).join(''),
        '<script>',
        '(function(){',
        'var spec=window.__SPEC__;',
        'var canvas=document.getElementById("c"),btn=document.getElementById("p"),mb=document.getElementById("m"),tl=document.getElementById("t");',
        'var R=CFX.engine.createRenderer(canvas,spec);',
        'var playing=false,base=0,t0=0,raf=0,ac=null,musicBuffer=null,srcNode=null,musicWanted=' + musicOn + ';',
        'function fmt(x){return x.toFixed(1)+"s";}',
        'function now(){return playing?base+(performance.now()-t0)/1000:base;}',
        'function paint(t){R.renderAt(Math.min(t,Math.max(0,R.duration-0.03)));tl.textContent=fmt(t)+" / "+fmt(R.duration);}',
        'function loop(){if(!playing)return;var t=now();if(t>=R.duration){base=0;t0=performance.now();t=0;}paint(t);raf=requestAnimationFrame(loop);}',
        'function stopMusic(){if(srcNode){try{srcNode.stop();}catch(e){}srcNode=null;}}',
        'function startMusic(offset){',
        '  if(!musicWanted||!musicBuffer)return;',
        '  try{',
        '    if(!ac){ac=new (window.AudioContext||window.webkitAudioContext)();}',
        '    if(ac.state==="suspended")ac.resume();',
        '    stopMusic();',
        '    srcNode=ac.createBufferSource();srcNode.buffer=musicBuffer;srcNode.loop=true;',
        '    srcNode.connect(ac.destination);',
        '    srcNode.start(0,offset%Math.max(0.1,musicBuffer.duration));',
        '  }catch(e){}',
        '}',
        'function start(){',
        '  base=now();t0=performance.now();playing=true;',
        '  btn.textContent="⏸ pause";',
        '  startMusic(base);',
        '  cancelAnimationFrame(raf);raf=requestAnimationFrame(loop);',
        '}',
        'function stop(){base=now();playing=false;cancelAnimationFrame(raf);stopMusic();btn.textContent="▶︎ play";}',
        'btn.onclick=function(){playing?stop():start();};',
        'mb.onclick=function(){musicWanted=!musicWanted;mb.textContent="♪ music: "+(musicWanted?"on":"off");if(!musicWanted){stopMusic();}else if(playing){startMusic(now());}};',
        'paint(0);',
        'CFX.music.render(spec.meta.mood,"REPLACE_DURATION",{sampleRate:48000}).then(function(buf){musicBuffer=buf;if(playing)startMusic(now());}).catch(function(){mb.textContent="♪ music: unavailable";});',
        '})();',
        '<\/script></body></html>'
      ].join('\n').replace('"REPLACE_DURATION"', String(Math.ceil(spec.scenes.reduce(function (a, b) { return a + b.dur; }, 0))));
    });
  }

  function packFiles(spec, meta, items) {
    var files = [];
    items.forEach(function (it) { if (it && it.blob) files.push(it); });
    files.push({
      name: 'metadata.json',
      blob: new Blob([JSON.stringify({ spec: spec, youtube: meta }, null, 2)], { type: 'application/json' })
    });
    if (meta.chapters && meta.chapters.length) {
      files.push({
        name: 'chapters.txt',
        blob: new Blob([meta.chapters.map(function (c) {
          var m = Math.floor(c.at / 60), s = Math.floor(c.at % 60);
          return m + ':' + (s < 10 ? '0' : '') + s + ' ' + c.label;
        }).join('\n')], { type: 'text/plain' })
      });
    }
    files.push({
      name: 'player.html',
      blob: new Blob([videoPlayerHtml(meta, {
        videoName: items && items[0] ? items[0].name : 'video.webm',
        duration: meta.durationSeconds
      })], { type: 'text/html' })
    });
    files.push({
      name: 'descriptions.txt',
      blob: new Blob(['TITLE:\n' + meta.title + '\n\nDESCRIPTION:\n' + meta.description +
        '\n\nTAGS (' + meta.tags.length + '):\n' + meta.tags.join(', ') +
        (meta.publishAt ? '\n\nSCHEDULED FOR (UTC): ' + meta.publishAt : '') + '\n'], { type: 'text/plain' })
    });
    return files;
  }

  // Save everything into one folder when the File System Access API exists,
  // otherwise fall back to individual downloads.
  function savePack(files, folderName) {
    if (w.showDirectoryPicker) {
      return w.showDirectoryPicker({ mode: 'readwrite', id: 'cutfree-publish' })
        .then(function (dir) {
          return files.reduce(function (chain, file) {
            return chain.then(function () {
              return dir.getFileHandle(file.name, { create: true })
                .then(function (handle) { return handle.createWritable(); })
                .then(function (writable) {
                  return writable.write(file.blob).then(function () { return writable.close(); });
                });
            });
          }, Promise.resolve()).then(function () { return { mode: 'folder', dir: dir.name, count: files.length }; });
        })
        ['catch'](function (err) {
          if (err && err.name === 'AbortError') return { mode: 'cancelled' };
          files.forEach(function (f) { downloadBlob(f.blob, f.name); });
          return { mode: 'downloads', count: files.length };
        });
    }
    files.forEach(function (f) { downloadBlob(f.blob, f.name); });
    return Promise.resolve({ mode: 'downloads', count: files.length });
  }

  /* --------------------------------------------------------- YouTube upload */
  var YT = {
    scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube',
    studioUrl: 'https://studio.youtube.com/channel/UC/videos/upload'
  };

  function loadGis() {
    if (w.google && w.google.accounts && w.google.accounts.oauth2) return Promise.resolve(true);
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = function () { resolve(true); };
      s.onerror = function () { reject(new Error('Could not load Google Identity Services (offline?)')); };
      document.head.appendChild(s);
    });
  }

  function getToken(clientId) {
    return loadGis().then(function () {
      return new Promise(function (resolve, reject) {
        var client = w.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: YT.scope,
          callback: function (resp) {
            if (resp && resp.access_token) resolve(resp.access_token);
            else reject(new Error(resp && resp.error ? resp.error : 'no access token'));
          },
          error_callback: function (e) { reject(new Error(e && e.message ? e.message : 'oauth error')); }
        });
        client.requestAccessToken({ prompt: '' });
      });
    });
  }

  function resumableUpload(opts) {
    var token = opts.accessToken;
    var body = {
      snippet: {
        title: opts.title,
        description: opts.description,
        tags: opts.tags,
        categoryId: opts.categoryId || '22',
        defaultLanguage: opts.defaultLanguage || 'en'
      },
      status: {
        privacyStatus: opts.publishAt ? 'private' : (opts.privacyStatus || 'private'),
        selfDeclaredMadeForKids: false
      }
    };
    if (opts.publishAt) body.status.publishAt = opts.publishAt;

    var url = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';
    return fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': String(opts.blob.size),
        'X-Upload-Content-Type': opts.blob.type || 'video/webm'
      },
      body: JSON.stringify(body)
    }).then(function (res) {
      if (!res.ok) return res.text().then(function (t) { throw new Error('init ' + res.status + ': ' + t.slice(0, 200)); });
      var session = res.headers.get('Location') || res.headers.get('location');
      if (!session) throw new Error('no resumable session URL returned');
      return fetch(session, {
        method: 'PUT',
        headers: { 'Content-Type': opts.blob.type || 'video/webm' },
        body: opts.blob
      });
    }).then(function (res) {
      if (!res.ok) return res.text().then(function (t) { throw new Error('upload ' + res.status + ': ' + t.slice(0, 300)); });
      return res.json();
    });
  }

  function setThumbnail(token, videoId, thumbBlob) {
    return fetch('https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=' + encodeURIComponent(videoId), {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': thumbBlob.type || 'image/png' },
      body: thumbBlob
    }).then(function (r) { return r.ok; })['catch'](function () { return false; });
  }

  CFX.publish = {
    thumbnail: thumbnail,
    thumbnailBlob: thumbnailBlob,
    canvasToBlob: canvasToBlob,
    packFiles: packFiles,
    savePack: savePack,
    downloadBlob: downloadBlob,
    videoPlayerHtml: videoPlayerHtml,
    animationHtml: animationHtml,
    youtube: {
      getToken: getToken,
      upload: resumableUpload,
      setThumbnail: setThumbnail,
      studioUrl: YT.studioUrl,
      scope: YT.scope
    }
  };
})(window);
