/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Pure TypeScript WebM / EBML Muxer for CutFree Studio.
 * Based on CutFree's zero-dependency WebM muxer architecture.
 * Muxes WebCodecs VP9/VP8 video chunks and Opus audio chunks with deterministic duration.
 */

function bytes(n: number): Uint8Array {
  return new Uint8Array(n);
}

function idBytes(id: number): Uint8Array {
  const out: number[] = [];
  if (id > 0xffffff) out.push((id >>> 24) & 0xff);
  if (id > 0xffff) out.push((id >>> 16) & 0xff);
  if (id > 0xff) out.push((id >>> 8) & 0xff);
  out.push(id & 0xff);
  return new Uint8Array(out);
}

function vint(value: number, minWidth?: number): Uint8Array {
  let width = minWidth || 1;
  while (width < 8 && value >= Math.pow(2, 7 * width) - 1) width++;
  const out = bytes(width);
  let v = value;
  for (let i = width - 1; i >= 0; i--) {
    out[i] = v & 0xff;
    v = Math.floor(v / 256);
  }
  out[0] |= 0x80 >> (width - 1);
  return out;
}

function uintBytes(value: number): Uint8Array {
  if (value === 0) return bytes(0);
  const out: number[] = [];
  let v = value;
  while (v > 0) {
    out.unshift(v & 0xff);
    v = Math.floor(v / 256);
  }
  return new Uint8Array(out);
}

function floatBytes(value: number): Uint8Array {
  const out = bytes(8);
  new DataView(out.buffer).setFloat64(0, value, false);
  return out;
}

function concat(list: Uint8Array[]): Uint8Array {
  let total = 0;
  for (let i = 0; i < list.length; i++) total += list[i].length;
  const out = bytes(total);
  let at = 0;
  for (let i = 0; i < list.length; i++) {
    out.set(list[i], at);
    at += list[i].length;
  }
  return out;
}

function strBytes(s: string): Uint8Array {
  const out = bytes(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

function el(id: number, payload?: Uint8Array): Uint8Array {
  const p = payload || bytes(0);
  return concat([idBytes(id), vint(p.length), p]);
}

function uel(id: number, value: number): Uint8Array {
  return el(id, uintBytes(value));
}

function fel(id: number, value: number): Uint8Array {
  return el(id, floatBytes(value));
}

function sel(id: number, value: string): Uint8Array {
  return el(id, strBytes(value));
}

const ID = {
  EBML: 0x1a45dfa3,
  EBMLVersion: 0x4286,
  EBMLReadVersion: 0x42f7,
  EBMLMaxIDLength: 0x42f2,
  EBMLMaxSizeLength: 0x42f3,
  DocType: 0x4282,
  DocTypeVersion: 0x4287,
  DocTypeReadVersion: 0x4285,
  Segment: 0x18538067,
  Info: 0x1549a966,
  TimestampScale: 0x2ad7b1,
  MuxingApp: 0x4d80,
  WritingApp: 0x5741,
  Duration: 0x4489,
  Tracks: 0x1654ae6b,
  TrackEntry: 0xae,
  TrackNumber: 0xd7,
  TrackUID: 0x73c5,
  TrackType: 0x83,
  FlagLacing: 0x9c,
  Language: 0x22b59c,
  CodecID: 0x86,
  CodecPrivate: 0x63a2,
  CodecDelay: 0x56aa,
  SeekPreRoll: 0x56bb,
  DefaultDuration: 0x23e383,
  Video: 0xe0,
  PixelWidth: 0xb0,
  PixelHeight: 0xba,
  Audio: 0xe1,
  SamplingFrequency: 0xb5,
  Channels: 0x9f,
  BitDepth: 0x6264,
  Cluster: 0x1f43b675,
  Timestamp: 0xe7,
  SimpleBlock: 0xa3,
};

export interface WebmMuxerOptions {
  width: number;
  height: number;
  fps: number;
  videoCodec?: "vp8" | "vp9" | "vp09";
  audioCodec?: "opus";
  sampleRate?: number;
  channels?: number;
}

export interface WebmMuxer {
  addVideoChunk: (chunk: EncodedVideoChunk) => void;
  addAudioChunk: (chunk: EncodedAudioChunk) => void;
  setAudioConfig: (description?: ArrayBuffer | Uint8Array | null) => void;
  finalize: (durationSeconds: number) => Blob;
  stats: () => { packets: number; lastTsUs: number; codec: string };
}

export function createWebmMuxer(opts: WebmMuxerOptions): WebmMuxer {
  const width = opts.width || 1920;
  const height = opts.height || 1080;
  const fps = opts.fps || 30;
  const videoCodec = (opts.videoCodec || "vp09").toLowerCase();
  const sampleRate = opts.sampleRate || 48000;
  const channels = opts.channels || 2;
  const videoTrack = 1;
  const audioTrack = 2;

  const vCodecId = videoCodec.indexOf("8") > -1 ? "V_VP8" : "V_VP9";
  const packets: Array<{ track: number; tsUs: number; key: boolean; data: Uint8Array }> = [];
  let audioPrivate: Uint8Array | null = null;
  let audioPreSkip = 0;
  let lastTsUs = 0;

  function addVideoChunk(chunk: EncodedVideoChunk) {
    const buf = new Uint8Array(chunk.byteLength);
    chunk.copyTo(buf);
    packets.push({ track: videoTrack, tsUs: chunk.timestamp, key: chunk.type === "key", data: buf });
    if (chunk.timestamp > lastTsUs) lastTsUs = chunk.timestamp;
  }

  function addAudioChunk(chunk: EncodedAudioChunk) {
    const buf = new Uint8Array(chunk.byteLength);
    chunk.copyTo(buf);
    packets.push({ track: audioTrack, tsUs: chunk.timestamp, key: true, data: buf });
    if (chunk.timestamp > lastTsUs) lastTsUs = chunk.timestamp;
  }

  function setAudioConfig(description?: ArrayBuffer | Uint8Array | null) {
    if (description) {
      audioPrivate = description instanceof Uint8Array ? description : new Uint8Array(description);
      if (audioPrivate.length >= 12) {
        audioPreSkip = audioPrivate[10] | (audioPrivate[11] << 8);
      }
    }
  }

  function trackEntryVideo(): Uint8Array {
    const payload = [
      uel(ID.TrackNumber, videoTrack),
      uel(ID.TrackUID, videoTrack),
      uel(ID.TrackType, 1),
      uel(ID.FlagLacing, 0),
      sel(ID.CodecID, vCodecId),
      sel(ID.Language, "und"),
      uel(ID.DefaultDuration, Math.round(1e9 / fps)),
      el(ID.Video, concat([uel(ID.PixelWidth, width), uel(ID.PixelHeight, height)])),
    ];
    return el(ID.TrackEntry, concat(payload));
  }

  function trackEntryAudio(): Uint8Array {
    const payload = [
      uel(ID.TrackNumber, audioTrack),
      uel(ID.TrackUID, audioTrack),
      uel(ID.TrackType, 2),
      uel(ID.FlagLacing, 0),
      sel(ID.CodecID, "A_OPUS"),
      sel(ID.Language, "und"),
    ];
    if (audioPrivate) {
      payload.push(el(ID.CodecPrivate, audioPrivate));
      payload.push(uel(ID.CodecDelay, Math.round((audioPreSkip / sampleRate) * 1e9)));
      payload.push(uel(ID.SeekPreRoll, 80000000)); // 80 ms Opus convention
    }
    payload.push(
      el(
        ID.Audio,
        concat([fel(ID.SamplingFrequency, sampleRate), uel(ID.Channels, channels)])
      )
    );
    return el(ID.TrackEntry, concat(payload));
  }

  function simpleBlock(packet: { track: number; tsUs: number; key: boolean; data: Uint8Array }, clusterTsMs: number): Uint8Array {
    let rel = Math.round(packet.tsUs / 1000) - clusterTsMs;
    rel = Math.max(-32768, Math.min(32767, rel));
    const head = bytes(3);
    head[0] = 0x80 | packet.track;
    const dv = new DataView(head.buffer);
    dv.setInt16(1, rel, false);
    const flag = packet.key ? 0x80 : 0x00;
    return el(ID.SimpleBlock, concat([head, new Uint8Array([flag]), packet.data]));
  }

  function buildClustersList(): Uint8Array[] {
    packets.sort((a, b) => a.tsUs - b.tsUs);
    const clusters: Uint8Array[] = [];
    let i = 0;
    const MAX_MS = 2000;
    while (i < packets.length) {
      const baseMs = Math.floor(packets[i].tsUs / 1000);
      const body: Uint8Array[] = [uel(ID.Timestamp, baseMs)];
      let guard = 0;
      while (i < packets.length && guard < 4000) {
        const pMs = Math.floor(packets[i].tsUs / 1000);
        if (pMs - baseMs > MAX_MS && pMs > baseMs) break;
        body.push(simpleBlock(packets[i], baseMs));
        i++;
        guard++;
      }
      clusters.push(el(ID.Cluster, concat(body)));
    }
    return clusters;
  }

  function finalize(durationSeconds: number): Blob {
    const header = el(
      ID.EBML,
      concat([
        uel(ID.EBMLVersion, 1),
        uel(ID.EBMLReadVersion, 1),
        uel(ID.EBMLMaxIDLength, 4),
        uel(ID.EBMLMaxSizeLength, 8),
        sel(ID.DocType, "webm"),
        uel(ID.DocTypeVersion, 4),
        uel(ID.DocTypeReadVersion, 2),
      ])
    );

    const durationMs = Math.round((durationSeconds || lastTsUs / 1e6) * 1000);
    const info = el(
      ID.Info,
      concat([
        uel(ID.TimestampScale, 1000000),
        sel(ID.MuxingApp, "CutFree Studio"),
        sel(ID.WritingApp, "CutFree Studio WebM Muxer"),
        fel(ID.Duration, durationMs),
      ])
    );

    const hasAudio = packets.some((p) => p.track === audioTrack);
    const tracks = el(
      ID.Tracks,
      concat([trackEntryVideo(), hasAudio ? trackEntryAudio() : bytes(0)])
    );

    const clusters = buildClustersList();
    let clustersLen = 0;
    for (let ci = 0; ci < clusters.length; ci++) clustersLen += clusters[ci].length;
    const segPayloadLen = info.length + tracks.length + clustersLen;
    const segHead = concat([idBytes(ID.Segment), vint(segPayloadLen), info, tracks]);

    const parts: any[] = [header, segHead, ...clusters];
    return new Blob(parts, { type: "video/webm" });
  }

  return {
    addVideoChunk,
    addAudioChunk,
    setAudioConfig,
    finalize,
    stats: () => ({
      packets: packets.length,
      lastTsUs,
      codec: vCodecId,
    }),
  };
}
