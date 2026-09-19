/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Frame-accurate video export engine for CutFree Studio.
 *
 * Dual-Engine Architecture:
 * 1. WebCodecs (Fast / Deterministic GPU Pipeline):
 *    VideoEncoder (VP9/VP8) + AudioEncoder (Opus) -> CutFree WebM Muxer.
 *    Non-realtime, frame-accurate offline rendering at max hardware speed.
 *    Preserves exact timeline duration (e.g. 341.89s) without drift or truncation.
 *
 * 2. MediaRecorder (Compatibility Fallback):
 *    canvas.captureStream + AudioContext destination node.
 */

import { VideoBlueprint } from "../types/blueprint";
import { videoCompositor } from "./compositor";
import { frameToTime, timeToFrame } from "../core/time";
import { createWebmMuxer, WebmMuxer } from "./webm-muxer";

export interface ExportProgress {
  stage: string;
  progressPct: number; // 0 - 100
  renderedFrames: number;
  totalFrames: number;
}

export interface ExportOptions {
  width?: number;
  height?: number;
  fps?: number;
  format?: "mp4" | "webm";
  isShorts?: boolean;
  quality?: "1080p" | "720p";
  audioBuffer?: AudioBuffer;
  audioElement?: HTMLAudioElement | null;
  mode?: "preview" | "full";
}

export interface ExportResult {
  blob: Blob;
  url: string;
  fileName: string;
  sizeMb: string;
  format: "mp4" | "webm";
  durationSec: number;
}

/**
 * Detects whether WebCodecs is supported in current secure context.
 */
export function supportsWebCodecs(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.VideoEncoder !== "undefined" &&
    typeof window.VideoFrame !== "undefined"
  );
}

/**
 * Checks browser codec support for MP4 / WebM container formats.
 */
export function checkSupportedExportFormat(requestedFormat: "mp4" | "webm"): {
  supported: boolean;
  mimeType: string;
  format: "mp4" | "webm";
} {
  if (supportsWebCodecs()) {
    return {
      supported: true,
      mimeType: "video/webm;codecs=vp9,opus",
      format: "webm",
    };
  }

  if (typeof MediaRecorder === "undefined") {
    return { supported: false, mimeType: "video/webm", format: "webm" };
  }

  if (requestedFormat === "mp4") {
    if (MediaRecorder.isTypeSupported("video/mp4;codecs=avc3,mp4a.40.2")) {
      return { supported: true, mimeType: "video/mp4;codecs=avc3,mp4a.40.2", format: "mp4" };
    }
    if (MediaRecorder.isTypeSupported("video/mp4;codecs=avc3")) {
      return { supported: true, mimeType: "video/mp4;codecs=avc3", format: "mp4" };
    }
    if (MediaRecorder.isTypeSupported("video/mp4;codecs=avc1,mp4a.40.2")) {
      return { supported: true, mimeType: "video/mp4;codecs=avc1,mp4a.40.2", format: "mp4" };
    }
    if (MediaRecorder.isTypeSupported("video/mp4")) {
      return { supported: true, mimeType: "video/mp4", format: "mp4" };
    }
    return { supported: false, mimeType: "video/webm;codecs=vp9,opus", format: "webm" };
  }

  if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")) {
    return { supported: true, mimeType: "video/webm;codecs=vp9,opus", format: "webm" };
  }
  return { supported: true, mimeType: "video/webm", format: "webm" };
}

/**
 * Helper to wait until encoder queue drains below threshold.
 */
function whenQueueDrains(
  encoder: { encodeQueueSize: number; state?: string },
  limit: number,
  signal?: AbortSignal
): Promise<void> {
  return new Promise<void>((resolve) => {
    function check() {
      if (signal?.aborted || !encoder || encoder.encodeQueueSize <= limit) {
        return resolve();
      }
      setTimeout(check, 4);
    }
    check();
  });
}

/**
 * Pick supported video codec for WebCodecs.
 */
async function pickSupportedVideoCodec(
  width: number,
  height: number,
  fps: number,
  bitrate: number
): Promise<{ codec: string; family: "vp8" | "vp9" }> {
  const candidates: Array<{ codec: string; family: "vp8" | "vp9" }> = [
    { codec: "vp8", family: "vp8" },
    { codec: "vp09.00.10.08", family: "vp9" },
    { codec: "vp09.00.20.08", family: "vp9" },
  ];

  for (const item of candidates) {
    try {
      const res = await VideoEncoder.isConfigSupported({
        codec: item.codec,
        width,
        height,
        bitrate,
        framerate: fps,
      });
      if (res && res.supported) return item;
    } catch {}
  }
  return { codec: "vp8", family: "vp8" };
}

/**
 * Resamples any input AudioBuffer to standard 48kHz stereo using OfflineAudioContext.
 */
async function resampleAudioBuffer(
  inputBuffer: AudioBuffer,
  maxDurationSec: number
): Promise<AudioBuffer> {
  const targetSampleRate = 48000;
  const actualDuration = Math.min(inputBuffer.duration, maxDurationSec);
  const targetLength = Math.max(1, Math.ceil(actualDuration * targetSampleRate));

  const offlineCtx = new OfflineAudioContext(2, targetLength, targetSampleRate);
  const source = offlineCtx.createBufferSource();
  source.buffer = inputBuffer;
  source.connect(offlineCtx.destination);
  source.start(0);

  return offlineCtx.startRendering();
}

/**
 * High-performance deterministic WebCodecs export engine.
 */
async function exportVideoWebCodecs(
  blueprint: VideoBlueprint,
  options: ExportOptions,
  duration: number,
  fps: number,
  width: number,
  height: number,
  onProgress?: (progressPct: number, stage: string) => void,
  signal?: AbortSignal
): Promise<Blob> {
  const totalFrames = Math.max(1, timeToFrame(duration, fps));
  const bitrate = options.quality === "720p" ? 5_000_000 : 8_000_000;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Could not acquire 2D canvas context for WebCodecs export");

  const chosenCodec = await pickSupportedVideoCodec(width, height, fps, bitrate);

  const muxer: WebmMuxer = createWebmMuxer({
    width,
    height,
    fps,
    videoCodec: chosenCodec.family,
    sampleRate: 48000,
    channels: 2,
  });

  // Setup VideoEncoder
  let encoderError: Error | null = null;
  const videoEncoder = new VideoEncoder({
    output: (chunk) => {
      muxer.addVideoChunk(chunk);
    },
    error: (err) => {
      encoderError = err;
      console.error("VideoEncoder error:", err);
    },
  });

  videoEncoder.configure({
    codec: chosenCodec.codec,
    width,
    height,
    bitrate,
    framerate: fps,
  });

  // Setup AudioEncoder if audio buffer is available
  let audioEncoder: AudioEncoder | null = null;
  let resampledAudio: AudioBuffer | null = null;

  if (options.audioBuffer && typeof window.AudioEncoder !== "undefined") {
    try {
      resampledAudio = await resampleAudioBuffer(options.audioBuffer, duration);
      audioEncoder = new AudioEncoder({
        output: (chunk, meta) => {
          if (meta?.decoderConfig?.description) {
            muxer.setAudioConfig(meta.decoderConfig.description);
          }
          muxer.addAudioChunk(chunk);
        },
        error: (err) => {
          console.warn("AudioEncoder error:", err);
          audioEncoder = null;
        },
      });

      audioEncoder.configure({
        codec: "opus",
        sampleRate: 48000,
        numberOfChannels: 2,
        bitrate: 128000,
      });
    } catch (e) {
      console.warn("AudioEncoder initialization warning:", e);
      audioEncoder = null;
    }
  }

  // 1. Encode Audio track in 20ms Opus packets
  if (audioEncoder && resampledAudio) {
    if (onProgress) onProgress(0, "Encoding synchronized audio track...");
    const sampleRate = 48000;
    const chunkFrames = 960; // 20ms at 48kHz
    const audioLen = Math.min(resampledAudio.length, Math.ceil(duration * sampleRate));
    const totalAudioPackets = Math.ceil(audioLen / chunkFrames);
    const d0 = resampledAudio.getChannelData(0);
    const d1 = resampledAudio.numberOfChannels > 1 ? resampledAudio.getChannelData(1) : d0;

    for (let p = 0; p < totalAudioPackets; p++) {
      if (signal?.aborted) throw new Error("Export cancelled by user");
      const framesInPacket = Math.min(chunkFrames, audioLen - p * chunkFrames);
      const planar = new Float32Array(framesInPacket * 2);
      planar.set(d0.subarray(p * chunkFrames, p * chunkFrames + framesInPacket), 0);
      planar.set(d1.subarray(p * chunkFrames, p * chunkFrames + framesInPacket), framesInPacket);

      const audioData = new AudioData({
        format: "f32-planar",
        sampleRate,
        numberOfFrames: framesInPacket,
        numberOfChannels: 2,
        timestamp: Math.round((p * chunkFrames) / sampleRate * 1e6),
        data: planar,
      });

      audioEncoder.encode(audioData);
      audioData.close();

      if (audioEncoder.encodeQueueSize > 20) {
        await whenQueueDrains(audioEncoder, 8, signal);
      }
    }

    await audioEncoder.flush();
    try { audioEncoder.close(); } catch {}
  }

  // 2. Encode Video frames deterministically
  for (let f = 0; f < totalFrames; f++) {
    if (signal?.aborted) {
      try { videoEncoder.close(); } catch {}
      throw new Error("Export cancelled by user");
    }
    if (encoderError) throw encoderError;

    const t = frameToTime(f, fps);
    videoCompositor.render(ctx, blueprint, t, { isShorts: options.isShorts });

    const videoFrame = new VideoFrame(canvas, {
      timestamp: Math.round(f * (1e6 / fps)),
      duration: Math.round(1e6 / fps),
    });

    const isKeyframe = f % (fps * 2) === 0;
    videoEncoder.encode(videoFrame, { keyFrame: isKeyframe });
    videoFrame.close();

    if (f % 5 === 0 && onProgress) {
      const progressPct = Math.round((f / totalFrames) * 100);
      onProgress(
        progressPct,
        `Rendering frame ${f + 1} / ${totalFrames} (${progressPct}%)`
      );
    }

    if (videoEncoder.encodeQueueSize > 8) {
      await whenQueueDrains(videoEncoder, 2, signal);
    }

    // Microtask yield periodically so UI updates and memory is reclaimed
    if (f % 16 === 0) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  if (onProgress) onProgress(100, "Finalizing video container...");
  await videoEncoder.flush();
  try { videoEncoder.close(); } catch {}

  const finalBlob = muxer.finalize(duration);
  return finalBlob;
}

/**
 * MediaRecorder fallback engine for environments without WebCodecs.
 */
async function exportVideoMediaRecorder(
  blueprint: VideoBlueprint,
  options: ExportOptions,
  duration: number,
  fps: number,
  width: number,
  height: number,
  onProgress?: (progressPct: number, stage: string) => void,
  signal?: AbortSignal
): Promise<Blob> {
  const totalFrames = Math.max(1, timeToFrame(duration, fps));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Could not acquire 2D canvas context for export");

  const codecInfo = checkSupportedExportFormat(options.format || "mp4");
  let mimeType = codecInfo.mimeType;

  let audioTrack: MediaStreamTrack | null = null;
  let audioCtx: AudioContext | null = null;
  let audioDest: MediaStreamAudioDestinationNode | null = null;

  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
      audioDest = audioCtx.createMediaStreamDestination();

      let hasAudioSource = false;
      if (options.audioBuffer) {
        const bufferSource = audioCtx.createBufferSource();
        bufferSource.buffer = options.audioBuffer;
        bufferSource.connect(audioDest);
        bufferSource.start(0);
        hasAudioSource = true;
      }

      if (hasAudioSource && audioDest.stream.getAudioTracks().length > 0) {
        audioTrack = audioDest.stream.getAudioTracks()[0];
      }
    }
  } catch (e) {
    console.warn("Audio mixing fallback:", e);
  }

  const canvasStream = canvas.captureStream(0);
  const combinedStream = new MediaStream();
  const videoTracks = canvasStream.getVideoTracks();
  if (videoTracks.length > 0) combinedStream.addTrack(videoTracks[0]);
  if (audioTrack) combinedStream.addTrack(audioTrack);

  const recorder = new MediaRecorder(combinedStream, {
    mimeType,
    videoBitsPerSecond: 8_000_000,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const videoTrack = videoTracks[0] as any;

  return new Promise<Blob>(async (resolve, reject) => {
    recorder.onerror = (err) => {
      if (audioCtx) audioCtx.close().catch(() => {});
      reject(err);
    };

    recorder.onstop = () => {
      if (audioCtx) audioCtx.close().catch(() => {});
      const finalBlob = new Blob(chunks, { type: mimeType });
      resolve(finalBlob);
    };

    try {
      recorder.start(1000); // Flush chunks every second to avoid internal buffer overflow
      for (let f = 0; f < totalFrames; f++) {
        if (signal?.aborted) {
          recorder.stop();
          return reject(new Error("Export cancelled by user"));
        }

        const t = frameToTime(f, fps);
        videoCompositor.render(ctx, blueprint, t, { isShorts: options.isShorts });

        if (videoTrack?.requestFrame) {
          videoTrack.requestFrame();
        }

        if (f % 5 === 0 && onProgress) {
          const progressPct = Math.round((f / totalFrames) * 100);
          onProgress(
            progressPct,
            `Rendering frame ${f + 1} / ${totalFrames} (${progressPct}%)`
          );
        }

        if (f % 4 === 0) {
          await new Promise((r) => setTimeout(r, 0));
        }
      }

      if (onProgress) onProgress(100, "Finalizing video container...");

      setTimeout(() => {
        try {
          if (recorder.state === "recording") {
            try { recorder.requestData(); } catch {}
            recorder.stop();
          }
        } catch (e) {
          if (recorder.state !== "inactive") {
            try { recorder.stop(); } catch {}
          }
        }
      }, 150);
    } catch (err) {
      if (recorder.state === "recording") recorder.stop();
      if (audioCtx) audioCtx.close().catch(() => {});
      reject(err);
    }
  });
}

/**
 * Main export routine. Chooses high-performance WebCodecs when available,
 * falling back to MediaRecorder.
 */
export async function exportVideo(
  blueprint: VideoBlueprint,
  options: ExportOptions = {},
  onProgress?: (progressPct: number, stage: string) => void,
  signal?: AbortSignal
): Promise<Blob> {
  const fps = options.fps || blueprint.project.fps || 30;

  // Full production export by default; explicit 30s preview only when requested
  const isPreviewMode = options.mode === "preview";
  const duration = isPreviewMode
    ? Math.min(30, blueprint.timeline.duration || 10)
    : Math.max(0.5, blueprint.timeline.duration || 10);

  const width = options.width || blueprint.project.width || 1920;
  const height = options.height || blueprint.project.height || 1080;

  if (supportsWebCodecs()) {
    try {
      return await exportVideoWebCodecs(
        blueprint,
        options,
        duration,
        fps,
        width,
        height,
        onProgress,
        signal
      );
    } catch (err) {
      console.warn("WebCodecs export failed, falling back to MediaRecorder:", err);
    }
  }

  return exportVideoMediaRecorder(
    blueprint,
    options,
    duration,
    fps,
    width,
    height,
    onProgress,
    signal
  );
}
