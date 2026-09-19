/**
 * Lightweight easing — no animation library required.
 * All functions map t in [0,1] → [0,1] (elastic/back may overshoot).
 */

export type EasingName = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'smooth' | 'back' | 'elastic';

export function clamp01(t: number): number {
  if (!Number.isFinite(t)) return 0;
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t;
}

export function easeLinear(t: number): number { return clamp01(t); }
export function easeIn(t: number): number { const x = clamp01(t); return x * x; }
export function easeOut(t: number): number { const x = clamp01(t); return 1 - (1 - x) * (1 - x); }
export function easeInOut(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}
export function easeSmooth(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}
export function easeBack(t: number): number {
  const x = clamp01(t);
  if (x === 0 || x === 1) return x;
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}
export function easeElastic(t: number): number {
  const x = clamp01(t);
  if (x === 0 || x === 1) return x;
  const c4 = (2 * Math.PI) / 3;
  return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1;
}

const TABLE: Record<EasingName, (t: number) => number> = {
  linear: easeLinear,
  easeIn,
  easeOut,
  easeInOut,
  smooth: easeSmooth,
  back: easeBack,
  elastic: easeElastic,
};

export function applyEasing(name: string | undefined, t: number): number {
  const fn = TABLE[(name as EasingName) || 'easeOut'] || easeOut;
  return fn(t);
}

export const EASING_NAMES: EasingName[] = ['linear', 'easeIn', 'easeOut', 'easeInOut', 'smooth', 'back', 'elastic'];
