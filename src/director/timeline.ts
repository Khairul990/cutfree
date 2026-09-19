/**
 * Timeline VIEW of the authoritative Spec/Blueprint.
 * Not a second source of truth — derived, then discarded.
 */

import { durationFromRange } from '../time';
import type { Blueprint, BlueprintScene } from '../brain/types';

export type TrackName = 'voice' | 'captions' | 'scenes' | 'characters' | 'background' | 'objects' | 'camera' | 'effects';

export interface TimelineItem {
  id: string;
  type: string;
  start: number;
  end: number;
  duration: number;
  track: TrackName;
  sceneId?: string;
  assetId?: string;
  position?: { x: number; y: number };
  scale?: number;
  rotation?: number;
  opacity?: number;
  animation?: string;
  keyframes?: { time: number; value: number; easing?: string }[];
  label?: string;
}

export interface TimelineTracks {
  duration: number;
  fps: number;
  tracks: Record<TrackName, TimelineItem[]>;
  items: TimelineItem[];
}

function uid(prefix: string, i: number, extra = ''): string {
  return `${prefix}_${i}${extra ? '_' + extra : ''}`;
}

export function specToTimeline(spec: Blueprint): TimelineTracks {
  const fps = spec.fps > 0 ? spec.fps : 30;
  const tracks: Record<TrackName, TimelineItem[]> = {
    voice: [], captions: [], scenes: [], characters: [], background: [], objects: [], camera: [], effects: [],
  };
  let acc = 0;
  spec.scenes.forEach((sc: BlueprintScene, i: number) => {
    const start = acc;
    const end = acc + sc.dur;
    const sceneId = (sc as unknown as { id?: string }).id || uid('scene', i);
    const purpose = (sc as unknown as { purpose?: string }).purpose || sc.type;
    const camera = (sc as unknown as { camera?: string }).camera || 'static';
    const textAnim = (sc as unknown as { textAnimation?: string }).textAnimation || 'fade';
    const character = (sc as unknown as { character?: { action?: string } }).character;
    tracks.scenes.push({
      id: sceneId, type: sc.type, start, end, duration: sc.dur, track: 'scenes', sceneId, label: purpose,
      animation: textAnim,
    });
    tracks.camera.push({
      id: uid('cam', i), type: camera, start, end, duration: sc.dur, track: 'camera', sceneId, animation: camera,
    });
    tracks.background.push({
      id: uid('bg', i), type: 'background', start, end, duration: sc.dur, track: 'background', sceneId,
    });
    tracks.effects.push({
      id: uid('fx', i), type: sc.transitionOut || 'fade', start: Math.max(start, end - 0.35), end, duration: 0.35, track: 'effects', sceneId,
    });
    if (character) {
      tracks.characters.push({
        id: uid('ch', i), type: character.action || 'idle', start, end, duration: sc.dur, track: 'characters', sceneId,
        animation: character.action,
      });
    }
    acc = end;
  });

  if (spec.captions) {
    spec.captions.forEach((c, i) => {
      const start = c.start;
      const end = c.end;
      tracks.captions.push({
        id: uid('cap', i), type: 'caption', start, end, duration: durationFromRange(start, end),
        track: 'captions', label: c.text,
      });
    });
  }

  // Voice track: from first caption or full duration
  const dur = spec.duration;
  tracks.voice.push({
    id: 'voice_0', type: 'voice', start: 0, end: dur, duration: dur, track: 'voice',
  });

  const items = (Object.keys(tracks) as TrackName[]).flatMap((k) => tracks[k]);
  return { duration: dur, fps, tracks, items };
}

export function timelineContinuity(tl: TimelineTracks): { gaps: number[]; overlaps: number[]; ok: boolean } {
  const scenes = [...tl.tracks.scenes].sort((a, b) => a.start - b.start);
  const gaps: number[] = [];
  const overlaps: number[] = [];
  for (let i = 1; i < scenes.length; i++) {
    const prev = scenes[i - 1];
    const cur = scenes[i];
    const delta = cur.start - prev.end;
    if (delta > 0.05) gaps.push(delta);
    if (delta < -0.05) overlaps.push(-delta);
  }
  return { gaps, overlaps, ok: gaps.length === 0 && overlaps.length === 0 };
}
