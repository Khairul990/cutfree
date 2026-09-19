/**
 * Deterministic Auto-Director.
 * Input: script + optional audio timing/segments → Output: Spec-compatible Blueprint.
 * No LLM. Audio duration is authoritative when present.
 */

import type { Blueprint, BlueprintScene, TimingInfo } from '../brain/types';
import { BLUEPRINT_SCHEMA_VERSION } from '../brain/types';
import { validateBlueprintJson } from '../brain/validator';
import { normalizeBlueprint } from '../brain/normalizer';
import { parseScript, countWords } from './scriptParser';
import { detectStoryBeats, type StoryBeat } from './storyBeats';
import { pacingFor } from './pacing';
import { specToTimeline, type TimelineTracks } from './timeline';
import { isCameraPreset, isTextPreset, isTransition } from '../motion/presets';
import { migrateBlueprint } from './migrate';

const WORDS_PER_SEC = 2.55;
const MIN_SCENE = 0.9;
const MAX_SCENE = 18;

export interface AutoDirectorInput {
  script: string;
  language?: 'bn' | 'en';
  title?: string;
  theme?: string;
  mood?: string;
  aspect?: string;
  quality?: '480p' | '720p' | '1080p';
  shorts?: boolean;
  seed?: number;
  timing?: TimingInfo | null;
  audioDuration?: number;
  segments?: { time: number; text: string }[];
  words?: { w: string; s: number; e: number; para: number }[];
}

export interface DirectedScene extends BlueprintScene {
  id: string;
  purpose?: string;
  camera?: string;
  textAnimation?: string;
  character?: { action: string; emotion: string; x?: number; y?: number; scale?: number; opacity?: number };
  visual?: { description?: string; treatment?: string };
  start?: number;
  end?: number;
}

export interface AutoDirectorResult {
  blueprint: Blueprint;
  timeline: TimelineTracks;
  beats: StoryBeat[];
  warnings: string[];
  status: 'ready' | 'complete' | 'error';
}

function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function sceneTypeFor(beat: StoryBeat, blockKind: string): BlueprintScene['type'] {
  if (beat.type === 'hook' || beat.type === 'intro') return 'intro';
  if (beat.type === 'cta' || beat.type === 'ending') return 'outro';
  if (blockKind === 'bullets') return 'bullets';
  if (beat.type === 'dialogue') return 'quote';
  return 'text';
}

function durFromText(text: string): number {
  const w = countWords(text);
  return Math.min(MAX_SCENE, Math.max(MIN_SCENE, w / WORDS_PER_SEC + 0.8));
}

function mapScene(beat: StoryBeat, dur: number, i: number, lang: 'bn' | 'en', blockKind: string): DirectedScene {
  const type = sceneTypeFor(beat, blockKind);
  const parts = beat.text.split(/[.!?।॥]\s+/);
  const heading = parts.length > 1 && parts[0].length < 60 ? parts[0] : '';
  const body = heading ? beat.text.slice(heading.length).trim() : beat.text;
  const items = blockKind === 'bullets'
    ? beat.text.split('\n').map((l) => l.replace(/^([-*•▪◦]|\d+[.)])\s+/, '').trim()).filter(Boolean)
    : undefined;
  const sc: DirectedScene = {
    id: `scene_${String(i).padStart(3, '0')}`,
    type: type as string,
    dur,
    purpose: beat.type,
    camera: beat.camera,
    textAnimation: beat.textAnimation,
    transitionOut: beat.transition,
    character: { action: beat.characterAction, emotion: beat.characterEmotion, x: 0.28, y: 0.18, scale: 1, opacity: 1 },
    visual: { treatment: beat.backgroundTreatment, description: beat.type },
    isHook: beat.type === 'hook',
  };
  if (type === 'intro') {
    sc.title = heading || body.slice(0, 80);
    sc.subtitle = heading ? body.slice(0, 90) : '';
  } else if (type === 'outro') {
    sc.title = lang === 'bn' ? 'ধন্যবাদ!' : 'Thanks for watching!';
    sc.subtitle = body.slice(0, 90) || (lang === 'bn' ? 'লাইক • শেয়ার • সাবস্ক্রাইব' : 'Like • Share • Subscribe');
    sc.cta = lang === 'bn' ? 'সাবস্ক্রাইব' : 'SUBSCRIBE';
  } else if (type === 'bullets') {
    sc.heading = heading || (lang === 'bn' ? 'মূল পয়েন্ট' : 'Key points');
    sc.items = (items || []).slice(0, 6);
  } else if (type === 'quote') {
    sc.text = body || beat.text;
  } else {
    sc.heading = heading || undefined;
    sc.body = body || beat.text;
  }
  return sc;
}

function scaleToDuration(scenes: DirectedScene[], target: number) {
  const raw = scenes.reduce((a, s) => a + s.dur, 0);
  if (!(target > 0) || !(raw > 0)) return;
  const factor = target / raw;
  scenes.forEach((s) => { s.dur = Math.max(0.5, s.dur * factor); });
  // fix float remainder on last
  const sum = scenes.reduce((a, s) => a + s.dur, 0);
  const drift = target - sum;
  if (scenes.length) scenes[scenes.length - 1].dur = Math.max(0.5, scenes[scenes.length - 1].dur + drift);
}

function stampStarts(scenes: DirectedScene[]) {
  let acc = 0;
  scenes.forEach((s) => {
    s.start = acc;
    s.end = acc + s.dur;
    acc = s.end;
  });
}

function captionsFromScenes(scenes: DirectedScene[]): { start: number; end: number; text: string }[] {
  const caps: { start: number; end: number; text: string }[] = [];
  scenes.forEach((s) => {
    const text = (s.body || s.text || s.title || s.heading || (s.items || []).join(' • ') || '').trim();
    if (!text) return;
    const start = s.start ?? 0;
    const end = s.end ?? start + s.dur;
    // wrap long captions
    if (text.length <= 90) {
      caps.push({ start, end: Math.max(start + 0.4, end), text });
    } else {
      const mid = Math.floor(text.length / 2);
      const splitAt = text.lastIndexOf(' ', mid);
      const a = text.slice(0, splitAt > 20 ? splitAt : mid).trim();
      const b = text.slice(splitAt > 20 ? splitAt : mid).trim();
      const half = (end - start) / 2;
      caps.push({ start, end: start + half, text: a });
      caps.push({ start: start + half, end, text: b });
    }
  });
  return caps;
}

export function autoCreateVideo(input: AutoDirectorInput): AutoDirectorResult {
  const warnings: string[] = [];
  const script = String(input.script || '').trim();
  const lang = input.language || (script.match(/[\u0980-\u09FF]/) ? 'bn' : 'en');
  const seed = input.seed || hashString((input.title || '') + '|' + script.slice(0, 400)) || 12345;

  if (!script && !(input.audioDuration && input.audioDuration > 0) && !(input.segments && input.segments.length)) {
    warnings.push('Empty script and no audio — placeholder blueprint');
  }

  const parsed = parseScript(script || (lang === 'bn' ? 'নতুন ভিডিও' : 'New video'), lang);
  const beats = detectStoryBeats(parsed);
  const scenes: DirectedScene[] = [];

  // Path A: user segment timeline is authoritative
  if (input.segments && input.segments.length) {
    const segs = [...input.segments].sort((a, b) => a.time - b.time);
    segs.forEach((seg, i) => {
      const next = segs[i + 1];
      const rawDur = next ? next.time - seg.time : Math.max(1.2, durFromText(seg.text));
      const fakeBeat = beats[Math.min(i, beats.length - 1)] || beats[0];
      const beat: StoryBeat = fakeBeat
        ? { ...fakeBeat, text: seg.text, index: i }
        : {
            index: i, type: i === 0 ? 'hook' : 'exposition', energy: 'medium', text: seg.text, blockIndex: i,
            camera: 'slow_zoom_in', textAnimation: 'word_reveal', transition: 'fade',
            characterAction: 'idle', characterEmotion: 'neutral', backgroundTreatment: 'aurora', reasons: ['segment'],
          };
      const pace = pacingFor(beat, { speechDur: rawDur, sentenceLen: seg.text.length, position: i / segs.length });
      const dur = Math.max(MIN_SCENE, rawDur * (rawDur < 1.2 ? 1 : pace.durationScale));
      const sc = mapScene({ ...beat, text: seg.text }, dur, i, lang, 'paragraph');
      scenes.push(sc);
    });
    const audioDur = input.audioDuration || input.timing?.totalDuration;
    if (audioDur && audioDur > 0) {
      const sum = scenes.reduce((a, s) => a + s.dur, 0);
      if (Math.abs(sum - audioDur) > 0.08) {
        scaleToDuration(scenes, audioDur);
        warnings.push(`Scaled segments to audio duration ${audioDur.toFixed(2)}s`);
      }
    }
  } else if (input.words && input.words.length) {
    const words = [...input.words].sort((a, b) => a.s - b.s);
    const maxPara = Math.max(...words.map((w) => w.para), 0);
    for (let pi = 0; pi <= maxPara; pi++) {
      const ws = words.filter((w) => w.para === pi);
      if (!ws.length) continue;
      const text = ws.map((w) => w.w).join(' ');
      const dur = Math.max(MIN_SCENE, ws[ws.length - 1].e - ws[0].s);
      const beat = beats[Math.min(pi, beats.length - 1)] || beats[0];
      scenes.push(mapScene({ ...(beat || { index: pi, type: 'exposition', energy: 'medium', text, blockIndex: pi, camera: 'static', textAnimation: 'word_reveal', transition: 'fade', characterAction: 'idle', characterEmotion: 'neutral', backgroundTreatment: 'aurora', reasons: [] } as StoryBeat), text }, dur, pi, lang, 'paragraph'));
    }
    const audioDur = input.audioDuration || input.timing?.totalDuration;
    if (audioDur && audioDur > 0) scaleToDuration(scenes, audioDur);
  } else {
    const blocks = parsed.blocks.filter((b) => b.text.trim());
    if (!blocks.length) {
      scenes.push({
        id: 'scene_000', type: 'intro', dur: input.audioDuration && input.audioDuration > 0 ? input.audioDuration : 8,
        title: input.title || parsed.title, purpose: 'intro', camera: 'slow_zoom_in', textAnimation: 'emphasis',
        transitionOut: 'fade', isHook: true,
      });
    } else {
      blocks.forEach((block, i) => {
        const beat = beats[i];
        let dur = durFromText(block.text);
        if (input.timing?.speechSegments?.[i]) {
          const sp = input.timing.speechSegments[i];
          dur = Math.max(MIN_SCENE, sp.end - sp.start);
        }
        const pace = pacingFor(beat, { speechDur: dur, sentenceLen: block.text.length, position: i / blocks.length });
        dur = Math.max(MIN_SCENE, Math.min(MAX_SCENE, dur * pace.durationScale));
        scenes.push(mapScene(beat, dur, i, lang, block.kind));
      });
    }
    const audioDur = input.audioDuration || input.timing?.totalDuration;
    if (audioDur && audioDur > 0) {
      scaleToDuration(scenes, audioDur);
      warnings.push(`Audio duration ${audioDur.toFixed(2)}s is authoritative`);
    }
  }

  stampStarts(scenes);
  const duration = scenes.reduce((a, s) => a + s.dur, 0);
  const aspect = (input.shorts ? '9:16' : input.aspect) || '16:9';
  const dims: Record<string, [number, number]> = { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080], '4:5': [1080, 1350] };
  const [baseW, baseH] = dims[aspect] || [1920, 1080];
  const quality = input.quality || '720p';
  const scale: Record<string, number> = { '480p': 480 / 1080, '720p': 720 / 1080, '1080p': 1 };
  const s = scale[quality] || 720 / 1080;
  const width = Math.round((baseW * s) / 2) * 2;
  const height = Math.round((baseH * s) / 2) * 2;

  const captions = captionsFromScenes(scenes);

  let blueprint: Blueprint = {
    meta: {
      title: input.title || parsed.title || (lang === 'bn' ? 'নতুন ভিডিও' : 'New video'),
      theme: (input.theme as string) || 'aurora',
      mood: (input.mood as string) || 'cinematic',
      seed,
      watermark: '',
      showProgress: true,
      language: lang,
      aspect,
      perf: 'high',
      shorts: !!input.shorts,
      safe: input.shorts ? { top: 0.11, bottom: 0.19 } : { top: 0.05, bottom: 0.08 },
      captions: { enabled: true, style: 'bar', scale: 1 },
    },
    fps: 30,
    width,
    height,
    scenes,
    captions,
    duration,
  };
  (blueprint as unknown as { schemaVersion: string }).schemaVersion = '2.0.0';

  blueprint = migrateBlueprint(blueprint);
  const { blueprint: norm, changes } = normalizeBlueprint(blueprint);
  warnings.push(...changes);
  const val = validateBlueprintJson({ schemaVersion: '2.0.0', blueprint: norm });
  if (!val.valid) {
    warnings.push(...val.errors.map((e) => e.message));
  }
  warnings.push(...val.warnings.map((w) => w.message));

  const timeline = specToTimeline(norm);
  return {
    blueprint: norm,
    timeline,
    beats,
    warnings,
    status: val.valid ? 'complete' : 'error',
  };
}

export { isCameraPreset, isTextPreset, isTransition };
