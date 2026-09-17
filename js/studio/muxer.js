/* ============================================================================
   CutFree Studio — minimal WebM (Matroska/EBML) muxer  ·  zero dependencies

   Why we wrote our own: the WebCodecs encoders hand back raw VP8/VP9/Opus
   chunks with no container around them. Muxing them into WebM is ~300 lines of
   EBML and it keeps the whole studio offline-first (no CDN, no wasm, no server).

   Layout produced:
     EBML header (DocType "webm")
     Segment
       Info    : TimestampScale, MuxingApp, WritingApp, Duration
       Tracks  : TrackEntry(video VP8/VP9) + TrackEntry(audio Opus)
       Cluster*: Timestamp + SimpleBlock per frame/audio packet (interleaved)

   Timestamps are milliseconds (TimestampScale = 1e6 ns), cluster length <= 2 s
   so every SimpleBlock relative timestamp fits in the signed 16-bit field.
   ========================================================================== */
(function (w) {
  'use strict';

  /* ------------------------------------------------------------- byte utils */
  function bytes(n) { return new Uint8Array(n); }

  // element IDs are written with their marker bits already set
  function idBytes(id) {
    var out = [];
    if (id > 0xFFFFFF) out.push((id >>> 24) & 0xFF);
    if (id > 0xFFFF) out.push((id >>> 16) & 0xFF);
    if (id > 0xFF) out.push((id >>> 8) & 0xFF);
    out.push(id & 0xFF);
    return new Uint8Array(out);
  }

  // EBML variable-size integer (used for element sizes and track numbers)
  function vint(value, minWidth) {
    var width = minWidth || 1;
    while (width < 8 && value >= Math.pow(2, 7 * width) - 1) width++;
    var out = bytes(width);
    var v = value;
    for (var i = width - 1; i >= 0; i--) { out[i] = v & 0xFF; v = Math.floor(v / 256); }
    out[0] |= 0x80 >> (width - 1);   // length marker
    return out;
  }

  function uintBytes(value) {
    if (value === 0) return bytes(0);          // zero-length uint = value 0
    var out = [];
    var v = value;
    while (v > 0) { out.unshift(v & 0xFF); v = Math.floor(v / 256); }
    return new Uint8Array(out);
  }

  function floatBytes(value) {
    var out = bytes(8);
    new DataView(out.buffer).setFloat64(0, value, false);
    return out;
  }

  function concat(list) {
    var total = 0, i;
    for (i = 0; i < list.length; i++) total += list[i].length;
    var out = bytes(total), at = 0;
    for (i = 0; i < list.length; i++) { out.set(list[i], at); at += list[i].length; }
    return out;
  }

  function strBytes(s) {
    var out = bytes(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xFF;
    return out;
  }

  // generic element: id + size + payload
  function el(id, payload) {
    var p = payload || bytes(0);
    return concat([idBytes(id), vint(p.length), p]);
  }
  function uel(id, value) { return el(id, uintBytes(value)); }
  function fel(id, value) { return el(id, floatBytes(value)); }
  function sel(id, value) { return el(id, strBytes(value)); }

  var ID = {
    EBML: 0x1A45DFA3, EBMLVersion: 0x4286, EBMLReadVersion: 0x42F7,
    EBMLMaxIDLength: 0x42F2, EBMLMaxSizeLength: 0x42F3, DocType: 0x4282,
    DocTypeVersion: 0x4287, DocTypeReadVersion: 0x4285,
    Segment: 0x18538067, Info: 0x1549A966, TimestampScale: 0x2AD7B1,
    MuxingApp: 0x4D80, WritingApp: 0x5741, Duration: 0x4489,
    Tracks: 0x1654AE6B, TrackEntry: 0xAE, TrackNumber: 0xD7, TrackUID: 0x73C5,
    TrackType: 0x83, FlagLacing: 0x9C, Language: 0x22B59C, CodecID: 0x86,
    CodecPrivate: 0x63A2, CodecDelay: 0x56AA, SeekPreRoll: 0x56BB,
    DefaultDuration: 0x23E383, Video: 0xE0, PixelWidth: 0xB0, PixelHeight: 0xBA,
    Audio: 0xE1, SamplingFrequency: 0xB5, Channels: 0x9F, BitDepth: 0x6264,
    Cluster: 0x1F43B675, Timestamp: 0xE7, SimpleBlock: 0xA3
  };

  /* -------------------------------------------------------------- the muxer */
  function createMuxer(opts) {
    opts = opts || {};
    var width = opts.width || 1280;
    var height = opts.height || 720;
    var fps = opts.fps || 30;
    var videoCodec = (opts.videoCodec || 'vp09').toLowerCase();     // 'vp8' | 'vp9' | 'vp09'
    var audioCodec = (opts.audioCodec || 'opus').toLowerCase();
    var sampleRate = opts.sampleRate || 48000;
    var channels = opts.channels || 2;
    var videoTrack = 1;
    var audioTrack = 2;

    var vCodecId = (videoCodec.indexOf('8') > -1) ? 'V_VP8' : 'V_VP9';
    var packets = [];                    // { track, tsUs, key, data }
    var audioPrivate = null, audioPreSkip = 0, audioInfo = null;
    var started = null, lastTsUs = 0;

    function addVideoChunk(chunk) {
      var buf = new Uint8Array(chunk.byteLength);
      chunk.copyTo(buf);
      packets.push({ track: videoTrack, tsUs: chunk.timestamp, key: chunk.type === 'key', data: buf });
      if (chunk.timestamp > lastTsUs) lastTsUs = chunk.timestamp;
    }

    function addAudioChunk(chunk) {
      var buf = new Uint8Array(chunk.byteLength);
      chunk.copyTo(buf);
      packets.push({ track: audioTrack, tsUs: chunk.timestamp, key: true, data: buf });
      if (chunk.timestamp > lastTsUs) lastTsUs = chunk.timestamp;
    }

    function setAudioConfig(description, info) {
      if (description) audioPrivate = new Uint8Array(description);
      audioInfo = info || null;
      if (audioPrivate && audioPrivate.length >= 12) {
        // OpusHead: pre-skip is a little-endian uint16 at offset 10
        audioPreSkip = audioPrivate[10] | (audioPrivate[11] << 8);
      }
    }

    function trackEntryVideo() {
      var payload = [
        uel(ID.TrackNumber, videoTrack),
        uel(ID.TrackUID, videoTrack),
        uel(ID.TrackType, 1),
        uel(ID.FlagLacing, 0),
        sel(ID.CodecID, vCodecId),
        sel(ID.Language, 'und'),
        uel(ID.DefaultDuration, Math.round(1e9 / fps)),
        el(ID.Video, concat([uel(ID.PixelWidth, width), uel(ID.PixelHeight, height)]))
      ];
      return el(ID.TrackEntry, concat(payload));
    }

    function trackEntryAudio() {
      var payload = [
        uel(ID.TrackNumber, audioTrack),
        uel(ID.TrackUID, audioTrack),
        uel(ID.TrackType, 2),
        uel(ID.FlagLacing, 0),
        sel(ID.CodecID, 'A_OPUS'),
        sel(ID.Language, 'und')
      ];
      if (audioPrivate) {
        payload.push(el(ID.CodecPrivate, audioPrivate));
        payload.push(uel(ID.CodecDelay, Math.round(audioPreSkip / sampleRate * 1e9)));
        payload.push(uel(ID.SeekPreRoll, 80000000));   // 80 ms, Opus convention
      }
      payload.push(el(ID.Audio, concat([
        fel(ID.SamplingFrequency, sampleRate),
        uel(ID.Channels, channels)
      ])));
      return el(ID.TrackEntry, concat(payload));
    }

    function simpleBlock(packet, clusterTsMs) {
      var rel = Math.round(packet.tsUs / 1000) - clusterTsMs;
      rel = Math.max(-32768, Math.min(32767, rel));
      var head = bytes(3);
      head[0] = 0x80 | packet.track;                 // track number as 1-byte vint
      var dv = new DataView(head.buffer);
      dv.setInt16(1, rel, false);
      var flag = packet.key ? 0x80 : 0x00;
      return el(ID.SimpleBlock, concat([head, new Uint8Array([flag]), packet.data]));
    }

    function buildClusters() {
      packets.sort(function (a, b) { return a.tsUs - b.tsUs; });
      var clusters = [], i = 0;
      var MAX_MS = 2000;                              // <= 2 s per cluster
      while (i < packets.length) {
        var baseMs = Math.floor(packets[i].tsUs / 1000);
        var body = [uel(ID.Timestamp, baseMs)];
        var guard = 0;
        while (i < packets.length && guard < 4000) {
          var pMs = Math.floor(packets[i].tsUs / 1000);
          if (pMs - baseMs > MAX_MS && pMs > baseMs) break;
          body.push(simpleBlock(packets[i], baseMs));
          i++; guard++;
        }
        clusters.push(el(ID.Cluster, concat(body)));
      }
      return concat(clusters);
    }

    // finalize(durationSeconds) -> Blob
    function finalize(durationSeconds) {
      var header = el(ID.EBML, concat([
        uel(ID.EBMLVersion, 1),
        uel(ID.EBMLReadVersion, 1),
        uel(ID.EBMLMaxIDLength, 4),
        uel(ID.EBMLMaxSizeLength, 8),
        sel(ID.DocType, 'webm'),
        uel(ID.DocTypeVersion, 4),
        uel(ID.DocTypeReadVersion, 2)
      ]));

      var durationMs = Math.round((durationSeconds || (lastTsUs / 1e6)) * 1000);
      var info = el(ID.Info, concat([
        uel(ID.TimestampScale, 1000000),
        sel(ID.MuxingApp, 'CutFree Studio'),
        sel(ID.WritingApp, 'CutFree Studio webm muxer'),
        fel(ID.Duration, durationMs)
      ]));

      var tracks = el(ID.Tracks, concat([
        trackEntryVideo(),
        audioPrivate ? trackEntryAudio() : bytes(0)
      ]));

      var segment = el(ID.Segment, concat([info, tracks, buildClusters()]));
      return new Blob([header, segment], { type: 'video/webm' });
    }

    return {
      addVideoChunk: addVideoChunk,
      addAudioChunk: addAudioChunk,
      setAudioConfig: setAudioConfig,
      finalize: finalize,
      packetCount: function () { return packets.length; },
      stats: function () {
        return {
          packets: packets.length,
          lastTsUs: lastTsUs,
          audioPrivate: audioPrivate ? audioPrivate.length : 0,
          codec: vCodecId
        };
      }
    };
  }

  w.CFX = w.CFX || {};
  w.CFX.webm = { createMuxer: createMuxer, vint: vint, uintBytes: uintBytes, _id: ID };
})(window);
