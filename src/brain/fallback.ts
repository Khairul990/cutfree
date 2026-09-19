/**
 * CutFree Brain — Deterministic Fallback (Phase 1)
 * Critical: if AI is unavailable, CutFree must still produce a valid timeline
 * from audio duration + script + templates. No broken editor.
 */

import type { Blueprint, TimingInfo } from './types';
import type { AudioAnalysisResult } from './types';

// Minimal deterministic Spec builder — mirrors src/App.tsx buildSpec but isolated
// to avoid coupling. This is the fallback; the real Spec builder lives in App.tsx
// and is used when the editor is active. Here we only need a valid Blueprint.

type ThemeKey = 'aurora' | 'cyber' | 'emerald' | 'royalInk';
type MoodKey = 'cinematic' | 'uplifting' | 'chill';

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function wordCount(s: string) { return (String(s).trim().match(/[^\s]+/g) || []).length; }

export function buildDeterministicBlueprint(
  script: string,
  timing: TimingInfo | null,
  opts: { title?: string; language?: 'bn' | 'en'; theme?: string; duration?: number } = {}
): Blueprint {
  const lang = opts.language === 'en' ? 'en' : 'bn';
  const title = (opts.title || script.split('\n').map(l => l.trim()).filter(Boolean)[0]?.slice(0, 60) || (lang === 'bn' ? 'নতুন ভিডিও' : 'New video')).trim();
  const seed = hashString(title + '|' + script.slice(0, 400)) || 12345;
  const rand = mulberry32(seed);
  const themes: ThemeKey[] = ['aurora', 'cyber', 'emerald', 'royalInk'];
  const moods: MoodKey[] = ['cinematic', 'uplifting', 'chill'];
  const theme = (opts.theme as ThemeKey) || themes[Math.floor(rand() * themes.length)];
  const mood = moods[Math.floor(rand() * moods.length)];

  const rawBlocks = String(script || '').replace(/\r/g, '').trim().split(/\n\s*\n+/).map(b => b.trim()).filter(Boolean);
  const blocks = rawBlocks.length ? rawBlocks : [lang === 'bn' ? 'শুরু করা যাক।' : "Let's begin."];
  const scenes: Blueprint['scenes'] = [];

  // Intro
  scenes.push({ type: 'intro', dur: 2.6, title, subtitle: blocks[0]?.slice(0, 90) || '', isHook: true, transitionOut: 'zoom' });

  // Each block -> text scene, duration based on word count or timing
  const totalTiming = timing?.totalDuration || opts.duration || 20;
  const perBlock = blocks.length > 1 ? Math.max(1.8, Math.min(9.5, totalTiming / (blocks.length + 2))) : 4;

  blocks.forEach((block, i) => {
    const wc = wordCount(block);
    const dur = Math.max(1.8, Math.min(9.5, wc / 2.55 + 1.5, perBlock + (rand() * 0.6 - 0.3)));
    // Simple heading/body split
    const parts = block.split(/[.!?।॥]\s+/);
    const heading = parts.length > 1 && parts[0].length < 60 ? parts[0] : '';
    const body = heading ? block.slice(heading.length).trim() : block;
    scenes.push({
      type: 'text',
      heading: heading || undefined,
      body: body || block,
      dur,
      transitionOut: i % 2 ? 'slide' : 'fade',
    });
  });

  scenes.push({
    type: 'outro',
    dur: 3.8,
    title: lang === 'bn' ? 'ধন্যবাদ!' : 'Thanks for watching!',
    subtitle: lang === 'bn' ? 'লাইক • শেয়ার • সাবস্ক্রাইব' : 'Like • Share • Subscribe',
    cta: lang === 'bn' ? 'সাবস্ক্রাইব' : 'SUBSCRIBE',
    transitionOut: 'fade',
  });

  // If timing has speech segments, align scene durs proportionally (deterministic)
  if (timing && timing.speechSegments.length > 1 && scenes.length > 2) {
    const contentScenes = scenes.slice(1, -1); // exclude intro/outro
    const totalSpeech = timing.speechTime || totalTiming * 0.8;
    const perSceneTime = totalSpeech / contentScenes.length;
    contentScenes.forEach(sc => {
      sc.dur = Math.max(1.5, Math.min(9.5, perSceneTime + (rand() * 0.4 - 0.2)));
    });
  }

  // Duration target
  const duration = scenes.reduce((a, s) => a + s.dur, 0);
  const width = 1280, height = 720;

  return {
    meta: {
      title,
      theme,
      mood,
      seed,
      watermark: '',
      showProgress: true,
      language: lang,
      aspect: '16:9',
      perf: 'high',
      shorts: false,
      safe: { top: 0.05, bottom: 0.08 },
      captions: { enabled: true, style: 'bar', scale: 1 },
    },
    fps: 30,
    width,
    height,
    scenes,
    captions: [],
    duration,
  };
}

export function fallbackBlueprintFromAudio(
  audio: AudioAnalysisResult | null,
  script: string,
  language: 'bn' | 'en' = 'bn'
): Blueprint {
  const timing = audio?.timing || null;
  const duration = audio?.duration || timing?.totalDuration || undefined;
  return buildDeterministicBlueprint(script, timing, { language, duration, title: script.split('\n')[0]?.slice(0,60) });
}
