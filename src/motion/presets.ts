/**
 * Deterministic motion presets. Semantic names only — renderer executes them.
 */

import type { KeyframeTrack } from './keyframes';
import { pair } from './keyframes';
import { applyEasing } from './easing';

export type CameraPreset =
  | 'static'
  | 'slow_zoom_in'
  | 'slow_zoom_out'
  | 'pan_left'
  | 'pan_right'
  | 'pan_up'
  | 'pan_down'
  | 'push_in'
  | 'pull_out'
  | 'drift'
  | 'parallax'
  | 'handheld_soft';

export type TextPreset =
  | 'fade'
  | 'slide_up'
  | 'slide_down'
  | 'slide_left'
  | 'slide_right'
  | 'scale'
  | 'pop'
  | 'typewriter'
  | 'word_reveal'
  | 'line_reveal'
  | 'emphasis'
  | 'blur_reveal';

export type ObjectPreset =
  | 'enter_left'
  | 'enter_right'
  | 'enter_top'
  | 'enter_bottom'
  | 'float'
  | 'bounce'
  | 'rotate'
  | 'scale_in'
  | 'scale_out';

export type CharacterAction = 'enter' | 'exit' | 'idle' | 'walk' | 'talk' | 'point' | 'wave' | 'surprised' | 'happy' | 'sad' | 'thinking';
export type CharacterEmotion = 'neutral' | 'happy' | 'sad' | 'surprised' | 'thinking' | 'tense';

export const CAMERA_PRESETS: CameraPreset[] = [
  'static', 'slow_zoom_in', 'slow_zoom_out', 'pan_left', 'pan_right', 'pan_up', 'pan_down',
  'push_in', 'pull_out', 'drift', 'parallax', 'handheld_soft',
];
export const TEXT_PRESETS: TextPreset[] = [
  'fade', 'slide_up', 'slide_down', 'slide_left', 'slide_right', 'scale', 'pop',
  'typewriter', 'word_reveal', 'line_reveal', 'emphasis', 'blur_reveal',
];
export const OBJECT_PRESETS: ObjectPreset[] = [
  'enter_left', 'enter_right', 'enter_top', 'enter_bottom', 'float', 'bounce', 'rotate', 'scale_in', 'scale_out',
];
export const CHARACTER_ACTIONS: CharacterAction[] = [
  'enter', 'exit', 'idle', 'walk', 'talk', 'point', 'wave', 'surprised', 'happy', 'sad', 'thinking',
];

export const TRANSITIONS = ['none', 'fade', 'crossfade', 'slide', 'wipe', 'zoom', 'blur', 'whip_pan', 'page_turn', 'glitch'] as const;
export type TransitionName = typeof TRANSITIONS[number];

export interface CameraState {
  x: number; // -1..1 relative
  y: number;
  zoom: number;
  rotation: number; // radians
}

export function isCameraPreset(s: string | undefined): s is CameraPreset {
  return !!s && (CAMERA_PRESETS as string[]).includes(s);
}
export function isTextPreset(s: string | undefined): s is TextPreset {
  return !!s && (TEXT_PRESETS as string[]).includes(s);
}
export function isTransition(s: string | undefined): s is TransitionName {
  return !!s && (TRANSITIONS as readonly string[]).includes(s);
}

export function cameraTracks(preset: CameraPreset): KeyframeTrack[] {
  switch (preset) {
    case 'slow_zoom_in': return [pair('zoom', 1.0, 1.12, 'smooth'), pair('x', 0, 0), pair('y', 0, 0), pair('rotation', 0, 0)];
    case 'slow_zoom_out': return [pair('zoom', 1.12, 1.0, 'smooth'), pair('x', 0, 0), pair('y', 0, 0), pair('rotation', 0, 0)];
    case 'pan_left': return [pair('x', 0.04, -0.04, 'smooth'), pair('zoom', 1.06, 1.06), pair('y', 0, 0), pair('rotation', 0, 0)];
    case 'pan_right': return [pair('x', -0.04, 0.04, 'smooth'), pair('zoom', 1.06, 1.06), pair('y', 0, 0), pair('rotation', 0, 0)];
    case 'pan_up': return [pair('y', 0.03, -0.03, 'smooth'), pair('zoom', 1.05, 1.05), pair('x', 0, 0), pair('rotation', 0, 0)];
    case 'pan_down': return [pair('y', -0.03, 0.03, 'smooth'), pair('zoom', 1.05, 1.05), pair('x', 0, 0), pair('rotation', 0, 0)];
    case 'push_in': return [pair('zoom', 1.0, 1.22, 'easeOut'), pair('x', 0, 0), pair('y', 0.01, -0.01), pair('rotation', 0, 0)];
    case 'pull_out': return [pair('zoom', 1.18, 1.0, 'easeInOut'), pair('x', 0, 0), pair('y', 0, 0), pair('rotation', 0, 0)];
    case 'drift': return [pair('x', -0.02, 0.025, 'smooth'), pair('y', 0.015, -0.02, 'smooth'), pair('zoom', 1.04, 1.08, 'smooth'), pair('rotation', -0.004, 0.004, 'smooth')];
    case 'parallax': return [pair('x', -0.03, 0.03, 'linear'), pair('zoom', 1.08, 1.08), pair('y', 0, 0), pair('rotation', 0, 0)];
    case 'handheld_soft': return [pair('x', -0.008, 0.01, 'smooth'), pair('y', 0.006, -0.007, 'smooth'), pair('zoom', 1.03, 1.05, 'smooth'), pair('rotation', -0.006, 0.005, 'smooth')];
    case 'static':
    default:
      return [pair('x', 0, 0, 'linear'), pair('y', 0, 0), pair('zoom', 1, 1), pair('rotation', 0, 0)];
  }
}

export function cameraAt(preset: CameraPreset | string | undefined, progress: number, seed = 0): CameraState {
  const name = isCameraPreset(preset) ? preset : 'static';
  const tracks = cameraTracks(name);
  const p = Math.max(0, Math.min(1, progress));
  const sample = (prop: string, fallback: number) => {
    const tr = tracks.find((t) => t.property === prop);
    if (!tr) return fallback;
    const a = tr.keyframes[0]?.value ?? fallback;
    const b = tr.keyframes[tr.keyframes.length - 1]?.value ?? a;
    // reuse first easing
    const eName = (tr.keyframes[1]?.easing || tr.keyframes[0]?.easing || 'smooth') as string;
    const u = applyEasing(eName, p);
    return a + (b - a) * u;
  };
  let x = sample('x', 0);
  let y = sample('y', 0);
  let zoom = sample('zoom', 1);
  let rotation = sample('rotation', 0);
  if (name === 'handheld_soft' || name === 'drift') {
    const s = (seed % 997) / 997;
    x += Math.sin(p * 12.7 + s * 6) * 0.004;
    y += Math.cos(p * 9.3 + s * 4) * 0.003;
  }
  return { x, y, zoom, rotation };
}

export interface TextAnimState {
  opacity: number;
  tx: number; // relative -1..1
  ty: number;
  scale: number;
  blur: number;
  reveal: number; // 0..1 how much text to show
}

export function textAnimAt(preset: TextPreset | string | undefined, progress: number): TextAnimState {
  const p = Math.max(0, Math.min(1, progress));
  const name = isTextPreset(preset) ? preset : 'fade';
  const ease = (t: number) => t * t * (3 - 2 * t);
  const inP = ease(Math.min(1, p / 0.28));
  switch (name) {
    case 'slide_up': return { opacity: inP, tx: 0, ty: (1 - inP) * 0.08, scale: 1, blur: 0, reveal: 1 };
    case 'slide_down': return { opacity: inP, tx: 0, ty: (inP - 1) * 0.08, scale: 1, blur: 0, reveal: 1 };
    case 'slide_left': return { opacity: inP, tx: (1 - inP) * 0.1, ty: 0, scale: 1, blur: 0, reveal: 1 };
    case 'slide_right': return { opacity: inP, tx: (inP - 1) * 0.1, ty: 0, scale: 1, blur: 0, reveal: 1 };
    case 'scale': return { opacity: inP, tx: 0, ty: 0, scale: 0.86 + 0.14 * inP, blur: 0, reveal: 1 };
    case 'pop': return { opacity: inP, tx: 0, ty: 0, scale: 0.7 + 0.38 * inP - 0.08 * Math.sin(inP * Math.PI), blur: 0, reveal: 1 };
    case 'typewriter': return { opacity: 1, tx: 0, ty: 0, scale: 1, blur: 0, reveal: Math.min(1, p / 0.7) };
    case 'word_reveal': return { opacity: 1, tx: 0, ty: 0, scale: 1, blur: 0, reveal: Math.min(1, p / 0.65) };
    case 'line_reveal': return { opacity: 1, tx: 0, ty: 0, scale: 1, blur: 0, reveal: Math.min(1, p / 0.55) };
    case 'emphasis': return { opacity: 1, tx: 0, ty: 0, scale: 1 + 0.06 * Math.sin(Math.min(1, p / 0.35) * Math.PI), blur: 0, reveal: 1 };
    case 'blur_reveal': return { opacity: inP, tx: 0, ty: 0, scale: 1, blur: (1 - inP) * 8, reveal: 1 };
    case 'fade':
    default:
      return { opacity: inP, tx: 0, ty: 0, scale: 1, blur: 0, reveal: 1 };
  }
}

export interface CharacterState {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  action: CharacterAction;
  emotion: CharacterEmotion;
}

export function characterAt(action: CharacterAction | string | undefined, emotion: CharacterEmotion | string | undefined, progress: number): CharacterState {
  const p = Math.max(0, Math.min(1, progress));
  const act = (CHARACTER_ACTIONS as string[]).includes(action || '') ? (action as CharacterAction) : 'idle';
  const emo = (['neutral', 'happy', 'sad', 'surprised', 'thinking', 'tense'] as string[]).includes(emotion || '') ? (emotion as CharacterEmotion) : 'neutral';
  const base: CharacterState = { x: 0.28, y: 0.18, scale: 1, rotation: 0, opacity: 1, action: act, emotion: emo };
  switch (act) {
    case 'enter': return { ...base, x: 0.28 - (1 - Math.min(1, p / 0.35)) * 0.22, opacity: Math.min(1, p / 0.3), scale: 0.92 + 0.08 * Math.min(1, p / 0.35) };
    case 'exit': return { ...base, x: 0.28 + Math.max(0, (p - 0.7) / 0.3) * 0.25, opacity: 1 - Math.max(0, (p - 0.7) / 0.3) };
    case 'walk': return { ...base, x: 0.22 + p * 0.12, y: 0.18 + Math.sin(p * 14) * 0.012 };
    case 'talk': return { ...base, scale: 1 + Math.sin(p * 22) * 0.02, y: 0.18 + Math.sin(p * 18) * 0.006 };
    case 'point': return { ...base, x: 0.32, rotation: -0.08, scale: 1.04 };
    case 'wave': return { ...base, rotation: Math.sin(p * 16) * 0.12, y: 0.16 };
    case 'surprised': return { ...base, scale: 1.08, y: 0.14 };
    case 'happy': return { ...base, y: 0.16 + Math.sin(p * 8) * 0.01, scale: 1.03 };
    case 'sad': return { ...base, y: 0.22, scale: 0.96, opacity: 0.9 };
    case 'thinking': return { ...base, x: 0.26, rotation: 0.05 };
    case 'idle':
    default:
      return { ...base, y: 0.18 + Math.sin(p * 4) * 0.008 };
  }
}

export const PARALLAX_LAYERS = {
  background: 0.15,
  midground: 0.35,
  foreground: 0.6,
  character: 0.75,
  overlay: 1,
} as const;
