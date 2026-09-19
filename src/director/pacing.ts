/**
 * Deterministic pacing — maps beat energy + speech/pause into duration multipliers.
 */

import type { StoryBeat } from './storyBeats';

export interface PacingHint {
  durationScale: number;
  cameraIntensity: number;
  textSpeed: number; // 1 = normal, >1 faster reveal
  transitionMs: number;
}

export function pacingFor(beat: StoryBeat, opts?: { speechDur?: number; pauseDur?: number; sentenceLen?: number; position?: number }): PacingHint {
  const speech = opts?.speechDur ?? 0;
  const pause = opts?.pauseDur ?? 0;
  const len = opts?.sentenceLen ?? beat.text.length;
  let durationScale = 1;
  let cameraIntensity = 0.5;
  let textSpeed = 1;
  let transitionMs = 280;

  switch (beat.energy) {
    case 'high':
      durationScale = 0.88;
      cameraIntensity = 0.9;
      textSpeed = 1.25;
      transitionMs = 160;
      break;
    case 'low':
      durationScale = 1.12;
      cameraIntensity = 0.28;
      textSpeed = 0.8;
      transitionMs = 420;
      break;
    default:
      durationScale = 1;
      cameraIntensity = 0.5;
      textSpeed = 1;
      transitionMs = 280;
  }

  if (beat.type === 'suspense') {
    durationScale *= 1.08;
    cameraIntensity = 0.22;
    textSpeed = 0.72;
  }
  if (beat.type === 'climax') {
    durationScale *= 0.82;
    cameraIntensity = 1;
    textSpeed = 1.35;
    transitionMs = 120;
  }
  if (pause >= 0.6) durationScale *= 1.06;
  if (speech > 0 && speech < 1.2) durationScale *= 0.9;
  if (len > 160) durationScale *= 1.08;
  if (len < 28) durationScale *= 0.92;

  durationScale = Math.max(0.7, Math.min(1.35, durationScale));
  return { durationScale, cameraIntensity, textSpeed, transitionMs };
}
