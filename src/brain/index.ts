/**
 * CutFree Brain — Public Entry (Phase 1)
 * Offline-first, free, provider-independent.
 * Existing editor works even if Brain is unavailable.
 */

export * from './types';
export * from './audioAnalyzer';
export * from './transcription';
export * from './validator';
export * from './normalizer';
export * from './fallback';
export * from './videoBrain';
export * from './ollama';

import { BrowserAudioAnalyzer } from './audioAnalyzer';
import { VadTranscriptionProvider, transcriptFromScript } from './transcription';
import { DeterministicVideoBrain } from './videoBrain';
import { OllamaVideoBrain } from './ollama';
import type { VideoBrainProvider, VideoBrainInput } from './types';

// ---------------------------------------------------------------------------
// Facade — simple, deterministic, no external dependency
// ---------------------------------------------------------------------------
export const brain = {
  audioAnalyzer: new BrowserAudioAnalyzer(),
  transcription: new VadTranscriptionProvider(),
  deterministic: new DeterministicVideoBrain(),

  /**
   * One-shot pipeline: audio file (+ optional script) → Blueprint
   * This is the Phase 1 foundation that future AI will extend.
   * It never trusts AI directly — it validates and normalizes.
   */
  async analyzeAudioFile(file: File, script?: string, opts?: { provider?: VideoBrainProvider; language?: 'bn' | 'en' }) {
    const analyzer = new BrowserAudioAnalyzer();
    const audioAnalysis = await analyzer.analyze(file);
    const language = opts?.language || (script && /[a-zA-Z]/.test(script) && !/[\u0980-\u09FF]/.test(script) ? 'en' : 'bn') as 'bn' | 'en';
    const transcription = await new VadTranscriptionProvider().transcribe(file, { language, script, timing: audioAnalysis.timing });

    const input: VideoBrainInput = {
      audioFile: file,
      audioAnalysis,
      transcript: transcription,
      script: script || transcription.fullText,
    };

    const provider = opts?.provider || new DeterministicVideoBrain();
    return provider.analyze(input);
  },

  /**
   * Create Ollama brain on demand — never mandatory, never auto-downloads.
   * Usage: brain.ollama({ baseUrl: 'http://localhost:11434', model: 'llama3' })
   */
  ollama: (cfg: { baseUrl: string; model: string }) => new OllamaVideoBrain(cfg),

  /**
   * Script-only pipeline (no audio) — deterministic fallback still works.
   */
  async fromScript(script: string, language: 'bn' | 'en' = 'bn') {
    const provider = new DeterministicVideoBrain();
    const transcript = transcriptFromScript(script, null, language);
    return provider.analyze({ script, transcript, audioAnalysis: undefined });
  },
};
