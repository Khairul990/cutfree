/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Frame-accurate timing calculations for CutFree Studio.
 */

export const DEFAULT_FPS = 30;

/**
 * Converts time in seconds to exact integer frame number.
 */
export function timeToFrame(timeSec: number, fps: number = DEFAULT_FPS): number {
  return Math.max(0, Math.round(timeSec * fps));
}

/**
 * Converts frame number to exact time in seconds.
 */
export function frameToTime(frame: number, fps: number = DEFAULT_FPS): number {
  return Math.max(0, frame / fps);
}

/**
 * Quantizes time in seconds to the nearest discrete video frame.
 */
export function quantizeToFrame(timeSec: number, fps: number = DEFAULT_FPS): number {
  return frameToTime(timeToFrame(timeSec, fps), fps);
}

/**
 * Formats seconds into MM:SS.ff or HH:MM:SS.ff timecode.
 */
export function formatTimecode(seconds: number, fps: number = DEFAULT_FPS, includeFrames: boolean = true): string {
  const sec = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const totalFrames = Math.floor(sec * fps);
  const framePart = totalFrames % fps;
  const s = Math.floor(sec) % 60;
  const m = Math.floor(sec / 60) % 60;
  const h = Math.floor(sec / 3600);

  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  const ff = String(framePart).padStart(2, "0");

  if (h > 0) {
    const hh = String(h).padStart(2, "0");
    return includeFrames ? `${hh}:${mm}:${ss}:${ff}` : `${hh}:${mm}:${ss}`;
  }
  return includeFrames ? `${mm}:${ss}:${ff}` : `${mm}:${ss}`;
}

/**
 * Formats duration in standard M:SS format.
 */
export function formatDuration(seconds: number): string {
  const sec = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Clamps value between min and max.
 */
export function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}
