/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Frame-accurate video export engine for CutFree Studio.
 * Uses MediaRecorder with AudioContext mixing and deterministic frame pacing.
 */

import { VideoBlueprint } from "../types/blueprint";
import { videoCompositor } from "./compositor";
import { frameToTime, timeToFrame } from "../core/time";

export interface ExportProgress {
  stage: string;
  progressPct: number; // 0 - 100
  renderedFrames: number;
  totalFrames: number;
}

export interface ExportResult {
  blob: Blob;
  url: string;
  fileName: string;
  sizeMb: string;
  format: "mp4" | "webm";
}

export async function exportVideo(
  blueprint: VideoBlueprint,
  audioElement: HTMLAudioElement | null,
  onProgress?: (p: ExportProgress) => void,
  signal?: AbortSignal
): Promise<ExportResult> {
  const fps = blueprint.project.fps || 30;
  const duration = blueprint.timeline.duration || 10;
  const totalFrames = timeToFrame(duration, fps);
  const width = blueprint.project.width || 1920;
  const height = blueprint.project.height || 1080;

  // Offscreen canvas for rendering
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Could not acquire 2D canvas context");

  // Pick best supported MIME type
  let mimeType = "video/webm;codecs=vp9,opus";
  let format: "mp4" | "webm" = "webm";

  if (MediaRecorder.isTypeSupported("video/mp4;codecs=avc1,mp4a.40.2")) {
    mimeType = "video/mp4;codecs=avc1,mp4a.40.2";
    format = "mp4";
  } else if (MediaRecorder.isTypeSupported("video/mp4")) {
    mimeType = "video/mp4";
    format = "mp4";
  } else if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")) {
    mimeType = "video/webm;codecs=vp9,opus";
    format = "webm";
  } else if (MediaRecorder.isTypeSupported("video/webm")) {
    mimeType = "video/webm";
    format = "webm";
  }

  // Set up audio destination
  let audioTrack: MediaStreamTrack | null = null;
  let audioCtx: AudioContext | null = null;
  let audioDest: MediaStreamAudioDestinationNode | null = null;

  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass && audioElement && audioElement.src) {
      audioCtx = new AudioContextClass();
      audioDest = audioCtx.createMediaStreamDestination();
      const source = audioCtx.createMediaElementSource(audioElement);
      source.connect(audioDest);
      source.connect(audioCtx.destination);
      if (audioDest.stream.getAudioTracks().length > 0) {
        audioTrack = audioDest.stream.getAudioTracks()[0];
      }
    }
  } catch (e) {
    console.warn("Audio mixing fallback for export:", e);
  }

  const canvasStream = canvas.captureStream(0); // On-demand frame capture
  const combinedStream = new MediaStream();
  combinedStream.addTrack(canvasStream.getVideoTracks()[0]);
  if (audioTrack) {
    combinedStream.addTrack(audioTrack);
  }

  const recorder = new MediaRecorder(combinedStream, {
    mimeType,
    videoBitsPerSecond: 8_000_000,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const videoTrack = canvasStream.getVideoTracks()[0] as any;

  return new Promise<ExportResult>(async (resolve, reject) => {
    recorder.onerror = (err) => reject(err);

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const sizeMb = (blob.size / (1024 * 1024)).toFixed(2) + " MB";
      const sanitizedTitle = (blueprint.project.title || "cutfree")
        .toLowerCase()
        .replace(/[^a-z0-9_-]/gi, "-");
      const fileName = `${sanitizedTitle}-${Date.now()}.${format}`;

      if (audioCtx) {
        audioCtx.close().catch(() => {});
      }

      resolve({ blob, url, fileName, sizeMb, format });
    };

    recorder.start();

    if (audioElement) {
      audioElement.currentTime = 0;
      audioElement.play().catch(() => {});
    }

    try {
      // Deterministic frame-by-frame pacing
      const frameIntervalMs = 1000 / fps;
      for (let f = 0; f < totalFrames; f++) {
        if (signal?.aborted) {
          recorder.stop();
          if (audioElement) audioElement.pause();
          return reject(new Error("Export cancelled"));
        }

        const t = frameToTime(f, fps);
        videoCompositor.render(ctx, blueprint, t);

        if (videoTrack?.requestFrame) {
          videoTrack.requestFrame();
        }

        if (f % 5 === 0 && onProgress) {
          const progressPct = Math.round((f / totalFrames) * 100);
          onProgress({
            stage: `Rendering frame ${f} / ${totalFrames}`,
            progressPct,
            renderedFrames: f,
            totalFrames,
          });
        }

        // Allow microtask cycle for smooth UI and memory release
        await new Promise((r) => setTimeout(r, Math.max(2, frameIntervalMs * 0.4)));
      }

      if (onProgress) {
        onProgress({
          stage: "Finalizing video container...",
          progressPct: 100,
          renderedFrames: totalFrames,
          totalFrames,
        });
      }

      if (audioElement) {
        audioElement.pause();
      }

      // Finish recorder
      setTimeout(() => {
        if (recorder.state === "recording") {
          recorder.stop();
        }
      }, 300);
    } catch (err) {
      if (recorder.state === "recording") recorder.stop();
      if (audioElement) audioElement.pause();
      reject(err);
    }
  });
}
