/* ============================================================================
   CutFree Studio — render/encode pipeline

   Two engines behind one API:

   1) WebCodecs  ("fast"): VideoEncoder(VP9/VP8) + AudioEncoder(Opus) -> our WebM
      muxer. Frames are encoded as fast as the machine can render them — no
      real-time constraint, no dropped frames, hardware encoder when available.
      Chrome 94+, Edge 94+, Firefox 130+ (desktop), Safari 26+.

   2) MediaRecorder ("compat"): canvas.captureStream(0) + track.requestFrame()
      paced on the wall clock, so every frame is painted deterministically even
      though the recorder timestamps by arrival. Works basically everywhere,
      takes as long as the video lasts. Can also emit MP4 on Chrome/Edge.
   ========================================================================== */
(function (w) {
  'use strict';

  var CFX = w.CFX = w.CFX || {};

  /* --------------------------------------------------------------- helpers */
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function frameNow() { return (w.performance && performance.now()) || Date.now(); }

  function whenQueueDrains(encoder, limit, shouldCancel) {
    return new Promise(function (resolve) {
      (function check() {
        if (shouldCancel && shouldCancel()) return resolve();
        if (!encoder || encoder.encodeQueueSize <= limit || encoder.state !== 'configured') return resolve();
        setTimeout(check, 4);
      })();
    });
  }

  function pickVideoCodec(width, height, fps, bitrate) {
    var candidates = ['vp09.00.10.08', 'vp09.00.20.08', 'vp8'];
    return (function next(i) {
      if (i >= candidates.length) return Promise.resolve(null);
      var config = {
        codec: candidates[i], width: width, height: height,
        bitrate: bitrate, framerate: fps
      };
      return w.VideoEncoder.isConfigSupported(config).then(function (res) {
        if (res && res.supported) return { config: config, codec: candidates[i], family: candidates[i].indexOf('vp8') === 0 ? 'vp8' : 'vp9' };
        return next(i + 1);
      })['catch'](function () { return next(i + 1); });
    })(0);
  }

  function audioEncoderSupported(config) {
    if (!w.AudioEncoder) return Promise.resolve(false);
    return w.AudioEncoder.isConfigSupported(config)
      .then(function (r) { return !!(r && r.supported); })
      ['catch'](function () { return false; });
  }

  function supportsWebCodecs() {
    return !!(w.VideoEncoder && w.VideoFrame && w.CFX.webm);
  }

  /* --------------------------------------------------- WebCodecs (fast path) */
  function renderWebCodecs(job) {
    var renderer = job.renderer;
    var width = job.width, height = job.height, fps = job.fps;
    var bitrate = job.bitrate || Math.round(width * height * fps * 0.11);
    var audioBuffer = job.audioBuffer || null;
    var sampleRate = job.sampleRate || 48000;
    var onProgress = job.onProgress || function () { };
    var shouldCancel = job.shouldCancel || function () { return false; };
    var duration = renderer.duration;

    var muxer = CFX.webm.createMuxer({
      width: width, height: height, fps: fps,
      videoCodec: job.codecFamily || 'vp9',
      sampleRate: sampleRate,
      channels: audioBuffer ? Math.min(2, audioBuffer.numberOfChannels) : 2
    });

    var stats = { videoChunks: 0, audioChunks: 0, bytes: 0, mode: 'webcodecs' };

    return pickVideoCodec(width, height, fps, bitrate).then(function (codec) {
      if (!codec) throw new Error('no VP8/VP9 encoder available');
      stats.codec = codec.codec;

      return new Promise(function (resolve, reject) {
        var finished = false;
        var videoEncoder = new w.VideoEncoder({
          output: function (chunk) {
            stats.videoChunks++;
            if (chunk.type === 'key' && chunk.byteLength) { /* keyframes arrive every 2s */ }
            muxer.addVideoChunk(chunk);
          },
          error: function (e) { if (!finished) { finished = true; reject(e); } }
        });
        videoEncoder.configure(codec.config);

        var audioEncoder = null;
        if (audioBuffer && w.AudioEncoder) {
          try {
            audioEncoder = new w.AudioEncoder({
              output: function (chunk, meta) {
                stats.audioChunks++;
                if (meta && meta.decoderConfig && meta.decoderConfig.description) {
                  muxer.setAudioConfig(meta.decoderConfig.description, meta.decoderConfig);
                }
                muxer.addAudioChunk(chunk);
              },
              error: function () { audioEncoder = null; }
            });
            audioEncoder.configure({
              codec: 'opus', sampleRate: sampleRate,
              numberOfChannels: muxer.stats().audioPrivate ? 2 : Math.min(2, audioBuffer.numberOfChannels),
              bitrate: job.audioBitrate || 128000
            });
          } catch (e) { audioEncoder = null; }
        }

        var canvas = job.canvas;
        var frameCount = Math.max(1, Math.floor(duration * fps));
        var i = 0;

        function encodeAudio() {
          if (!audioEncoder) return Promise.resolve();
          var chunkFrames = Math.round(sampleRate * 0.02);          // 20 ms Opus packets
          var total = Math.ceil(audioBuffer.length / chunkFrames);
          var chans = Math.min(2, audioBuffer.numberOfChannels);
          var data = [];
          for (var c = 0; c < chans; c++) data.push(audioBuffer.getChannelData(c));

          return (function nextPacket(p) {
            if (p >= total || shouldCancel()) return Promise.resolve();
            var frames = Math.min(chunkFrames, audioBuffer.length - p * chunkFrames);
            var planar = new Float32Array(frames * chans);
            for (var c = 0; c < chans; c++) {
              planar.set(data[c].subarray(p * chunkFrames, p * chunkFrames + frames), c * frames);
            }
            var ad = new w.AudioData({
              format: 'f32-planar', sampleRate: sampleRate,
              numberOfFrames: frames, numberOfChannels: chans,
              timestamp: Math.round(p * chunkFrames / sampleRate * 1e6),
              data: planar
            });
            audioEncoder.encode(ad);
            ad.close();
            if (audioEncoder.encodeQueueSize > 20) {
              return whenQueueDrains(audioEncoder, 8, shouldCancel).then(function () { return nextPacket(p + 1); });
            }
            return nextPacket(p + 1);
          })(0);
        }

        function encodeVideo() {
          return (function nextFrame() {
            if (i >= frameCount || shouldCancel()) return Promise.resolve();
            var t = Math.min(duration - 1e-4, i / fps);
            renderer.renderAt(t);
            var frame = new w.VideoFrame(canvas, {
              timestamp: Math.round(i * 1e6 / fps),
              duration: Math.round(1e6 / fps)
            });
            videoEncoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
            frame.close();
            i++;
            if (onProgress) onProgress(i / frameCount, i, frameCount);
            if (videoEncoder.encodeQueueSize > 6) {
              return whenQueueDrains(videoEncoder, 2, shouldCancel).then(nextFrame);
            }
            // yield to the event loop every few frames so the UI stays alive
            if (i % 3 === 0) return sleep(0).then(nextFrame);
            return nextFrame();
          })();
        }

        encodeVideo()
          .then(encodeAudio)
          .then(function () {
            if (shouldCancel()) return null;
            return videoEncoder.flush();
          })
          .then(function () {
            if (audioEncoder && !shouldCancel()) return audioEncoder.flush();
          })
          .then(function () {
            finished = true;
            try { videoEncoder.close(); } catch (e) { }
            try { if (audioEncoder) audioEncoder.close(); } catch (e) { }
            if (shouldCancel()) return resolve(null);
            var blob = muxer.finalize(duration);
            stats.bytes = blob.size;
            stats.packets = muxer.stats();
            resolve({ blob: blob, mime: 'video/webm', ext: 'webm', duration: duration, mode: 'webcodecs', stats: stats, hasAudio: !!audioEncoder });
          })
          ['catch'](function (err) {
            finished = true;
            try { videoEncoder.close(); } catch (e) { }
            try { if (audioEncoder) audioEncoder.close(); } catch (e) { }
            reject(err);
          });
      });
    });
  }

  /* --------------------------------------------- MediaRecorder (compat path) */
  function pickRecorderMime(preferMp4) {
    var list = preferMp4 ? [
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm'
    ] : [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4'
    ];
    for (var i = 0; i < list.length; i++) {
      try { if (MediaRecorder.isTypeSupported(list[i])) return list[i]; } catch (e) { }
    }
    return '';
  }

  function renderMediaRecorder(job) {
    var renderer = job.renderer;
    var canvas = job.canvas;
    var fps = job.fps;
    var duration = renderer.duration;
    var onProgress = job.onProgress || function () { };
    var shouldCancel = job.shouldCancel || function () { return false; };
    var mime = pickRecorderMime(!!job.preferMp4);
    var ext = mime.indexOf('mp4') > -1 ? 'mp4' : 'webm';

    if (!canvas.captureStream) {
      return Promise.reject(new Error('canvas.captureStream unsupported'));
    }

    var stream = canvas.captureStream(0);
    var track = stream.getVideoTracks()[0];
    if (!track.requestFrame && stream.requestFrame) track.requestFrame = stream.requestFrame.bind(stream);

    var audioCtx = null, audioSource = null, audioDest = null;
    if (job.audioBuffer) {
      try {
        var AC = w.AudioContext || w.webkitAudioContext;
        audioCtx = new AC({ sampleRate: job.sampleRate || 48000 });
        if (audioCtx.state === 'suspended') audioCtx.resume();
        audioDest = audioCtx.createMediaStreamDestination();
        audioSource = audioCtx.createBufferSource();
        audioSource.buffer = job.audioBuffer;
        audioSource.connect(audioDest);
        audioDest.stream.getAudioTracks().forEach(function (t) { stream.addTrack(t); });
      } catch (e) { audioCtx = null; }
    }

    var chunks = [];
    var rec;
    try {
      rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch (e) {
      return Promise.reject(e);
    }
    rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };

    var startWall = 0;
    var total = Math.max(1, Math.floor(duration * fps));

    return new Promise(function (resolve, reject) {
      var stopped = new Promise(function (r) { rec.onstop = r; });
      rec.start(500);
      startWall = frameNow();
      if (audioSource) { try { audioSource.start(); } catch (e) { } }

      var i = 0;
      (function loop() {
        if (shouldCancel() || i >= total) return finish();
        var targetWall = startWall + (i * 1000) / fps;
        var wait = targetWall - frameNow();
        var paint = function () {
          renderer.renderAt(Math.min(duration - 1e-4, i / fps));
          if (track.requestFrame) track.requestFrame();
          i++;
          onProgress(i / total, i, total);
          loop();
        };
        if (wait > 0) setTimeout(paint, wait);
        else paint();   // machine is behind: still emit the frame (pacing self-corrects)
      })();

      function finish() {
        try { if (audioSource) audioSource.stop(); } catch (e) { }
        try { rec.stop(); } catch (e) { }
        stopped.then(function () {
          track.stop();
          stream.getTracks().forEach(function (t) { t.stop(); });
          try { if (audioCtx) audioCtx.close(); } catch (e) { }
          if (shouldCancel()) return resolve(null);
          var blob = new Blob(chunks, { type: ext === 'mp4' ? 'video/mp4' : 'video/webm' });
          resolve({
            blob: blob, mime: blob.type, ext: ext, duration: duration,
            mode: 'mediarecorder', hasAudio: !!audioSource,
            stats: { bytes: blob.size, chunks: chunks.length, mime: mime }
          });
        });
      }
    });
  }

  /* ------------------------------------------------------------------- API */
  function render(job) {
    var engine = job.engine || 'auto';
    if (engine === 'fast' || (engine === 'auto' && supportsWebCodecs())) {
      return renderWebCodecs(job)['catch'](function (err) {
        if (engine === 'fast') throw err;
        job.onFallback && job.onFallback(err);
        return renderMediaRecorder(job);
      });
    }
    return renderMediaRecorder(job);
  }

  CFX.encode = {
    render: render,
    supportsWebCodecs: supportsWebCodecs,
    pickRecorderMime: pickRecorderMime,
    audioEncoderSupported: audioEncoderSupported
  };
})(window);
