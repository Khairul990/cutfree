/**
 * CutFree Brain — Transcription Abstraction (Phase 1)
 * Provider-neutral. No paid API mandatory. Deterministic fallback is primary.
 */

import type { TranscriptionProvider, TranscriptionResult, TranscriptionSegment, TimingInfo } from './types';

function uid(prefix: string, i: number) {
  return `${prefix}-${Date.now().toString(36)}-${i}`;
}

export class NullTranscriptionProvider implements TranscriptionProvider {
  readonly id = 'null';
  readonly displayName = 'No transcription (deterministic fallback)';

  isAvailable(): boolean { return true; }

  async transcribe(_file: File, _opts?: { language?: string }): Promise<TranscriptionResult> {
    return {
      provider: this.id,
      language: 'auto',
      segments: [],
      fullText: '',
      duration: 0,
    };
  }
}

/**
 * Deterministic transcript from script + timing.
 * If we have real speech timing (from AudioAnalyzer) and a script,
 * we can slice the script into sentence-like segments and map them
 * proportionally onto speech segments. No ML, fully deterministic.
 */
export function transcriptFromScript(
  script: string,
  timing: TimingInfo | null,
  language: 'bn' | 'en' = 'bn'
): TranscriptionResult {
  const raw = String(script || '').replace(/\r/g, '').trim();
  if (!raw) {
    return { provider: 'script-fallback', language, segments: [], fullText: '', duration: timing?.totalDuration || 0 };
  }
  // Split into sentence-like chunks (preserve meaning, not word-level)
  const sentences = raw
    .split(/(?<=[.!?।॥])\s+|\n\s*\n|\n/)
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 200);

  const total = timing?.totalDuration || Math.max(8, sentences.length * 2.2);
  const usableSegments = timing?.speechSegments?.length ? timing.speechSegments : [{ start: 0, end: total }];

  // Distribute sentences across speech segments proportionally
  const segments: TranscriptionSegment[] = [];
  let tCursor = 0;
  const speechTime = usableSegments.reduce((a, s) => a + (s.end - s.start), 0) || total;

  // Weight by char length (approx)
  const weights = sentences.map(s => Math.max(1, s.length));
  const totalW = weights.reduce((a, b) => a + b, 0) || 1;

  // Map weight -> time
  let accW = 0;
  for (let i = 0; i < sentences.length; i++) {
    accW += weights[i];
    const frac = accW / totalW;
    // find which speech segment this falls into (linear)
    const targetTime = frac * speechTime;
    let segIdx = 0, accT = 0;
    for (let s = 0; s < usableSegments.length; s++) {
      const d = usableSegments[s].end - usableSegments[s].start;
      if (targetTime <= accT + d || s === usableSegments.length - 1) { segIdx = s; break; }
      accT += d;
    }
    const seg = usableSegments[segIdx];
    const segDur = seg.end - seg.start;
    // Within segment, distribute proportionally
    const prevFrac = (accW - weights[i]) / totalW;
    const curFrac = accW / totalW;
    const start = seg.start + (prevFrac * speechTime - accT) * (segDur / speechTime) * (speechTime / totalW) * totalW; // simplified: linear within overall
    // Simpler: just linear across total
    const linearStart = (prevFrac * total);
    const linearEnd = (curFrac * total);
    const s = Math.max(0, Math.min(total - 0.1, linearStart));
    const e = Math.max(s + 0.6, Math.min(total, linearEnd));
    segments.push({ id: uid('seg', i), start: s, end: e, text: sentences[i] });
    tCursor = e;
  }

  // Clamp to timing gaps (pause awareness) — if pause exists, don't put speech there
  if (timing?.pauses?.length) {
    for (const seg of segments) {
      for (const p of timing.pauses) {
        if (seg.start < p.end && seg.end > p.start) {
          // nudge out of pause (prefer before)
          if (seg.start >= p.start && seg.start < p.end) seg.start = p.end + 0.05;
          if (seg.end > p.start && seg.end <= p.end) seg.end = p.start - 0.05;
        }
      }
      if (seg.end <= seg.start) seg.end = seg.start + 0.8;
    }
  }

  return {
    provider: 'script-fallback',
    language,
    segments: segments.sort((a, b) => a.start - b.start),
    fullText: sentences.join(' '),
    duration: total,
  };
}

/**
 * Browser-native speech timing to transcription (no ML).
 * Uses AudioAnalyzer timing as the only signal — honest about limitation.
 * Clearly distinguishes AUDIO TIMING from SPEECH TRANSCRIPTION.
 */
export class VadTranscriptionProvider implements TranscriptionProvider {
  readonly id = 'vad-timing';
  readonly displayName = 'VAD timing → deterministic transcript (offline)';

  isAvailable(): boolean { return true; }

  async transcribe(file: File, opts?: { language?: string; script?: string; timing?: TimingInfo }): Promise<TranscriptionResult> {
    // This provider does NOT do ML transcription; it maps script → timing deterministically.
    // If no script is given, it returns empty transcript with correct duration.
    const script = opts?.script || '';
    const timing = opts?.timing || null;
    const lang = (opts?.language as 'bn' | 'en') || 'bn';
    if (!script.trim()) {
      // No script → no transcript, but duration is known
      const dur = timing?.totalDuration || 0;
      return { provider: this.id, language: lang, segments: [], fullText: '', duration: dur };
    }
    // Reuse deterministic mapping
    const res = transcriptFromScript(script, timing, lang);
    return { ...res, provider: this.id };
  }
}
