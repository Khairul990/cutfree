/**
 * CutFree keyframe interpolator — property curves in seconds (local or global).
 */

import { applyEasing, type EasingName } from './easing';

export interface Keyframe {
  time: number;
  value: number;
  easing?: EasingName | string;
}

export interface KeyframeTrack {
  property: 'x' | 'y' | 'scale' | 'rotation' | 'opacity' | 'blur' | 'brightness' | 'saturation' | string;
  keyframes: Keyframe[];
}

export function validateKeyframes(kfs: Keyframe[]): { ok: boolean; message?: string } {
  if (!Array.isArray(kfs) || kfs.length === 0) return { ok: false, message: 'empty keyframes' };
  for (const k of kfs) {
    if (!Number.isFinite(k.time) || !Number.isFinite(k.value)) return { ok: false, message: 'non-finite keyframe' };
  }
  return { ok: true };
}

export function sortKeyframes(kfs: Keyframe[]): Keyframe[] {
  return [...kfs].sort((a, b) => a.time - b.time);
}

export function sampleKeyframes(kfs: Keyframe[], t: number): number {
  if (!kfs.length) return 0;
  const sorted = kfs.length > 1 && kfs[0].time > kfs[kfs.length - 1].time ? sortKeyframes(kfs) : kfs;
  if (t <= sorted[0].time) return sorted[0].value;
  const last = sorted[sorted.length - 1];
  if (t >= last.time) return last.value;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (t >= a.time && t <= b.time) {
      const span = b.time - a.time;
      const u = span <= 1e-9 ? 1 : (t - a.time) / span;
      const e = applyEasing(b.easing || a.easing || 'easeOut', u);
      return a.value + (b.value - a.value) * e;
    }
  }
  return last.value;
}

export function sampleTracks(tracks: KeyframeTrack[], t: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const tr of tracks) out[tr.property] = sampleKeyframes(tr.keyframes, t);
  return out;
}

/** Build a 2-keyframe 0→1 local track. */
export function pair(property: string, a: number, b: number, easing: EasingName = 'easeOut'): KeyframeTrack {
  return { property, keyframes: [{ time: 0, value: a, easing }, { time: 1, value: b, easing }] };
}
