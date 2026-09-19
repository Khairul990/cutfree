/**
 * CutFree Brain — Audio Analyzer (Phase 1)
 * Browser-native, offline-first, provider-independent.
 * Reuses the proven VAD from src/App.tsx without duplicating the timeline.
 */

import type { AudioAnalysisResult, TimingInfo, AudioSpeechSegment, AudioPause } from './types';

// ---------------------------------------------------------------------------
// Local VAD — deterministic, no external service
// Ported from src/App.tsx analyseVAD (same algorithm, isolated)
// ---------------------------------------------------------------------------
function percentile(values: Float32Array | number[], p: number) {
  if (!values.length) return 0;
  const arr = Array.from(values as number[]).sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(arr.length - 1, Math.round((arr.length - 1) * p)));
  return arr[idx];
}

async function decodeToMono(file: File): Promise<{ data: Float32Array; sampleRate: number; duration: number }> {
  const ab = await file.arrayBuffer();
  const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  const buf = await ctx.decodeAudioData(ab.slice(0));
  const ch = buf.numberOfChannels;
  const len = buf.length;
  const out = new Float32Array(len);
  for (let c = 0; c < ch; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) out[i] += d[i] / ch;
  }
  await ctx.close();
  return { data: out, sampleRate: buf.sampleRate, duration: buf.duration };
}

function analyseVAD(mono: { data: Float32Array; sampleRate: number; duration: number }) {
  const data = mono.data;
  const sr = mono.sampleRate;
  const duration = mono.duration;
  const win = Math.max(1, Math.round(0.03 * sr));
  const hop = Math.max(1, Math.round(0.01 * sr));
  const frames = Math.max(0, Math.floor((data.length - win) / hop) + 1);
  const rms = new Float32Array(frames);
  const smooth = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    const base = f * hop;
    let sum = 0;
    for (let i = base; i < base + win; i++) sum += data[i] * data[i];
    rms[f] = Math.sqrt(sum / win);
  }
  for (let s = 0; s < frames; s++) {
    const a = rms[Math.max(0, s - 1)], b = rms[s], c = rms[Math.min(frames - 1, s + 1)];
    smooth[s] = (a + b + c) / 3;
  }
  const floor = percentile(smooth, 0.2);
  const loud = percentile(smooth, 0.95);
  const hi = Math.max(floor * 3.0, floor + 0.01, loud * 0.16);
  const lo = Math.max(floor * 1.7, floor + 0.005, hi * 0.55);
  const minSpeech = 0.16, minGap = 0.14, mergeGap = 0.22, pad = 0.035;
  const minSpeechF = Math.max(1, Math.round(minSpeech / (hop / sr)));
  const minGapF = Math.max(1, Math.round(minGap / (hop / sr)));
  const phrases: { a: number; b: number }[] = [];
  let speaking = false, startF = 0, quiet = 0;
  for (let k = 0; k < frames; k++) {
    const level = smooth[k];
    if (!speaking) { if (level >= hi) { speaking = true; startF = k; quiet = 0; } }
    else {
      if (level < lo) { quiet++; if (quiet >= minGapF) { phrases.push({ a: startF, b: k - quiet + 1 }); speaking = false; } }
      else quiet = 0;
    }
  }
  if (speaking) phrases.push({ a: startF, b: frames });
  const corrected = phrases.filter(p => p.b - p.a >= minSpeechF).map(p => ({ start: Math.max(0, p.a * hop / sr - pad), end: Math.min(duration, (p.b * hop + win) / sr + pad) }));
  const merged: { start: number; end: number }[] = [];
  corrected.forEach(sp => {
    const prev = merged[merged.length - 1];
    if (prev && sp.start - prev.end < mergeGap) prev.end = sp.end;
    else merged.push({ start: sp.start, end: sp.end });
  });
  const speechTime = merged.reduce((t, p) => t + (p.end - p.start), 0);
  const gaps: { start: number; end: number }[] = [];
  for (let g = 1; g < merged.length; g++) gaps.push({ start: merged[g - 1].end, end: merged[g].start });
  return { duration, sampleRate: sr, phrases: merged, gaps, envelope: smooth, hop: hop / sr, noiseFloor: floor, threshold: hi, speechRatio: duration > 0 ? speechTime / duration : 0, speechTime, usable: merged.length >= 2 && speechTime > 0.8 };
}

function toTimingInfo(vad: ReturnType<typeof analyseVAD>): TimingInfo {
  const pauses: AudioPause[] = vad.gaps.map(g => {
    const d = g.end - g.start;
    return { start: g.start, end: g.end, duration: d, kind: (d >= 0.6 ? 'long' : 'short') as 'short' | 'long' };
  });
  const speechSegments: AudioSpeechSegment[] = vad.phrases.map(p => ({ start: p.start, end: p.end }));
  return {
    totalDuration: vad.duration,
    speechSegments,
    pauses,
    speechTime: vad.speechTime,
    silenceTime: Math.max(0, vad.duration - vad.speechTime),
    speechRatio: vad.speechRatio,
  };
}

// ---------------------------------------------------------------------------
// Public Analyzer Interface
// ---------------------------------------------------------------------------
export interface AudioAnalyzer {
  readonly id: string;
  readonly displayName: string;
  isAvailable(): boolean;
  analyze(file: File): Promise<AudioAnalysisResult>;
}

export class BrowserAudioAnalyzer implements AudioAnalyzer {
  readonly id = 'browser-vad';
  readonly displayName = 'Browser VAD (offline)';

  isAvailable(): boolean {
    return typeof window !== 'undefined' && !!(window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
  }

  async analyze(file: File): Promise<AudioAnalysisResult> {
    if (!this.isAvailable()) throw new Error('WebAudio not available');
    const mono = await decodeToMono(file);
    const vad = analyseVAD(mono);
    const timing = toTimingInfo(vad);
    const assetId = `audio-${file.name.replace(/[^a-z0-9]/gi, '_')}-${Math.round(mono.duration * 1000)}`;
    return {
      assetId,
      fileName: file.name,
      mime: file.type || 'audio/*',
      duration: mono.duration,
      sampleRate: mono.sampleRate,
      timing,
      vad: {
        phrases: vad.phrases,
        gaps: vad.gaps.map(g => ({ start: g.start, end: g.end, duration: g.end - g.start, kind: g.end - g.start >= 0.6 ? 'long' : 'short' })),
        noiseFloor: vad.noiseFloor,
        threshold: vad.threshold,
      },
    };
  }
}

// Deterministic fallback when no audio (duration from script etc.)
export function timingFromDuration(duration: number): TimingInfo {
  return {
    totalDuration: duration,
    speechSegments: duration > 0 ? [{ start: 0, end: duration }] : [],
    pauses: [],
    speechTime: duration,
    silenceTime: 0,
    speechRatio: duration > 0 ? 1 : 0,
  };
}
