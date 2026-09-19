/**
 * CutFree — centralized time utilities.
 * Seconds are authoritative. FPS conversion only at render boundaries.
 */

export const DEFAULT_FPS = 30;
export const DEFAULT_SNAP_THRESHOLD = 0.05; // seconds

export function secondsToFrame(seconds: number, fps: number = DEFAULT_FPS): number {
  if (!Number.isFinite(seconds) || !Number.isFinite(fps) || fps <= 0) return 0;
  return Math.round(seconds * fps);
}

export function frameToSeconds(frame: number, fps: number = DEFAULT_FPS): number {
  if (!Number.isFinite(frame) || !Number.isFinite(fps) || fps <= 0) return 0;
  return frame / fps;
}

export function clampTime(t: number, min = 0, max = Number.POSITIVE_INFINITY): number {
  if (!Number.isFinite(t)) return min;
  if (t < min) return min;
  if (t > max) return max;
  return t;
}

export function normalizeTimeRange(start: number, end: number, max?: number): { start: number; end: number; duration: number } {
  let s = Number.isFinite(start) ? start : 0;
  let e = Number.isFinite(end) ? end : s;
  if (s < 0) s = 0;
  if (e < s) e = s;
  if (typeof max === 'number' && Number.isFinite(max) && max >= 0) {
    if (s > max) s = max;
    if (e > max) e = max;
    if (e < s) e = s;
  }
  return { start: s, end: e, duration: e - s };
}

export function durationFromRange(start: number, end: number): number {
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, end - start);
}

export function snapTime(t: number, targets: number[], threshold: number = DEFAULT_SNAP_THRESHOLD, enabled = true): number {
  if (!enabled || !Number.isFinite(t) || !targets.length) return t;
  const thr = Math.max(0, threshold);
  let best = t;
  let bestD = thr;
  for (let i = 0; i < targets.length; i++) {
    const x = targets[i];
    if (!Number.isFinite(x)) continue;
    const d = Math.abs(x - t);
    if (d <= bestD) {
      bestD = d;
      best = x;
    }
  }
  return best;
}

export function collectSnapTargets(opts: {
  duration: number;
  sceneStarts?: number[];
  captionStarts?: number[];
  captionEnds?: number[];
  voiceStarts?: number[];
  keyframeTimes?: number[];
  playhead?: number;
}): number[] {
  const out: number[] = [0, Math.max(0, opts.duration)];
  const push = (arr?: number[]) => {
    if (!arr) return;
    for (const x of arr) if (Number.isFinite(x)) out.push(x);
  };
  push(opts.sceneStarts);
  push(opts.captionStarts);
  push(opts.captionEnds);
  push(opts.voiceStarts);
  push(opts.keyframeTimes);
  if (typeof opts.playhead === 'number' && Number.isFinite(opts.playhead)) out.push(opts.playhead);
  return out;
}
