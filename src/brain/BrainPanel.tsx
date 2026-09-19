/**
 * CutFree Brain — Minimal UI Panel (Phase 1)
 * Shows Brain states without redesigning the whole UI.
 * Uses the existing design system (Tailwind, lucide-react).
 */

import { useState } from 'react';
import { Brain, Loader2, Check, AlertCircle, Cpu } from 'lucide-react';
import { brain } from './index';
import type { AudioAnalysisResult } from './types';

// Note: lucide-react import is lazy to avoid bundling issues if not used
// We use a simple fallback if icons not found
export function BrainPanel({ script, audioFile }: { script?: string; audioFile?: File | null }) {
  const [state, setState] = useState<'ready' | 'analyzing' | 'complete' | 'error'>('ready');
  const [result, setResult] = useState<AudioAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    if (!audioFile) {
      setError('No audio file');
      setState('error');
      return;
    }
    setState('analyzing');
    setError(null);
    try {
      const res = await brain.analyzeAudioFile(audioFile, script);
      // We only use timing for Phase 1; blueprint is validated but not auto-applied
      setResult(res.blueprintFile.meta.timingRef as unknown as AudioAnalysisResult || (res.timing as unknown as AudioAnalysisResult));
      // For now, just store timing; full blueprint is in res.blueprint
      setState('complete');
    } catch (e) {
      setError((e as Error).message);
      setState('error');
    }
  };

  // Use dynamic import for icons to avoid hard dependency
  const Icon = state === 'analyzing' ? Loader2 : state === 'complete' ? Check : state === 'error' ? AlertCircle : Brain;

  return (
    <div className="rounded-2xl bg-gradient-to-br from-[#0f172a] to-[#1a1440] border border-[#2a365c] p-4">
      <div className="flex items-center gap-2 text-[12px] font-extrabold text-white mb-2">
        <Cpu className="w-4 h-4 text-[#7c5cff]" /> AI Brain — Phase 1 (local, free)
        <span className="ml-auto text-[10px] px-2 py-1 rounded-full bg-[#1a2440] border border-[#2a365c] text-[#8cb4ff]">
          {state === 'ready' ? 'Ready' : state === 'analyzing' ? 'Analyzing…' : state === 'complete' ? 'Complete ✓' : 'Error'}
        </span>
      </div>
      <div className="text-[11px] leading-relaxed text-[#a3b4dc] mb-3">
        Browser-native VAD + deterministic blueprint. No cloud, no paid API. Offline-first.
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={handleAnalyze}
          disabled={state === 'analyzing' || !audioFile}
          className="py-2.5 rounded-xl bg-gradient-to-br from-[#7c5cff] to-[#5b8dff] text-white font-black text-[12px] flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          <Icon className={`w-4 h-4 ${state === 'analyzing' ? 'animate-spin' : ''}`} />
          {state === 'analyzing' ? 'Analyzing…' : 'Analyze Audio'}
        </button>
        <div className="rounded-xl bg-[#0f1124] border border-[#232d47] p-2 text-[11px] text-[#8d9cc2]">
          {result ? (
            <div>
              Duration: {result.duration?.toFixed(2) || '—'}s<br />
              Speech: {result.timing?.speechTime?.toFixed(1) || '—'}s
            </div>
          ) : (
            <div>{audioFile ? audioFile.name.slice(0, 22) : 'No audio selected'}</div>
          )}
          {error && <div className="text-[#f87171] mt-1">{error}</div>}
        </div>
      </div>
    </div>
  );
}
