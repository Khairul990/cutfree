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

/**
 * Parses timecode string (MM:SS, HH:MM:SS, MM:SS:FF, HH:MM:SS:FF) into seconds.
 */
export function timecodeToSeconds(timecode: string, fps: number = DEFAULT_FPS): number {
  if (!timecode || typeof timecode !== "string") return 0;
  const parts = timecode.trim().split(":").map(Number);
  if (parts.some((p) => Number.isNaN(p))) return 0;

  if (parts.length === 2) {
    // MM:SS
    const [m, s] = parts;
    return m * 60 + s;
  } else if (parts.length === 3) {
    // HH:MM:SS or MM:SS:FF
    const [a, b, c] = parts;
    // If last part looks like frame (< fps) and first part < 60, it could be MM:SS:FF
    if (a < 60 && c < fps) {
      return a * 60 + b + c / fps;
    }
    return a * 3600 + b * 60 + c;
  } else if (parts.length === 4) {
    // HH:MM:SS:FF
    const [h, m, s, f] = parts;
    return h * 3600 + m * 60 + s + f / fps;
  }
  return 0;
}

/**
 * Compares two timestamps with explicit floating point tolerance.
 */
export function isTimeEqual(a: number, b: number, tolerance: number = 0.001): boolean {
  return Math.abs(a - b) <= tolerance;
}
