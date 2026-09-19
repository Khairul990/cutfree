/**
 * CutFree Brain — Video Brain (Phase 1, deterministic foundation)
 * Provider-neutral. The AI does NOT render video — it creates the plan.
 * CutFree executes the plan via validator → normalizer → Blueprint → Timeline.
 */

import type { VideoBrainProvider, VideoBrainInput, VideoBrainResult, TimingInfo } from './types';
import { BLUEPRINT_SCHEMA_VERSION } from './types';
import { fallbackBlueprintFromAudio } from './fallback';
import { transcriptFromScript } from './transcription';

export class DeterministicVideoBrain implements VideoBrainProvider {
  readonly id = 'deterministic';
  readonly displayName = 'Deterministic Brain (offline, free)';

  isAvailable(): boolean { return true; }

  async analyze(input: VideoBrainInput): Promise<VideoBrainResult> {
    const timing: TimingInfo | null = input.audioAnalysis?.timing || null;
    const script = (input.script || '').trim() || input.transcript?.fullText || '';
    const language = (input.script && /[a-zA-Z]/.test(input.script) && !/[\u0980-\u09FF]/.test(input.script) ? 'en' : 'bn') as 'bn' | 'en';

    // If we have transcript segments, prefer them; otherwise derive from script + timing
    let blueprint;
    let warnings: string[] = [];

    if (input.transcript && input.transcript.segments.length) {
      // Use transcript segments as timing guide — but still deterministic
      // For Phase 1, we just log that we have transcript; fallback still generates scenes from script
      warnings.push(`Using transcript with ${input.transcript.segments.length} segments`);
      blueprint = fallbackBlueprintFromAudio(input.audioAnalysis || null, script || input.transcript.fullText, language);
    } else if (script) {
      // Deterministic from script + timing (pause-aware)
      const transcript = transcriptFromScript(script, timing, language);
      if (transcript.segments.length) warnings.push(`Derived ${transcript.segments.length} segments from script + timing`);
      blueprint = fallbackBlueprintFromAudio(input.audioAnalysis || null, script, language);
    } else if (input.audioAnalysis) {
      // Audio only, no script — create placeholder blueprint from duration
      blueprint = fallbackBlueprintFromAudio(input.audioAnalysis, language === 'bn' ? 'অডিও থেকে ভিডিও' : 'Video from audio', language);
      warnings.push('No script — generated placeholder scenes from audio duration');
    } else {
      // Nothing — minimal blueprint
      blueprint = fallbackBlueprintFromAudio(null, language === 'bn' ? 'নতুন ভিডিও' : 'New video', language);
      warnings.push('No audio or script — minimal blueprint');
    }

    // Ensure captions from transcript if available
    if (input.transcript?.segments?.length) {
      blueprint.captions = input.transcript.segments.map(s => ({ start: s.start, end: s.end, text: s.text }));
    } else if (timing) {
      // Generate captions from timing + script (deterministic)
      const t = transcriptFromScript(script, timing, language);
      blueprint.captions = t.segments.slice(0, 50).map(s => ({ start: s.start, end: s.end, text: s.text }));
    }

    return {
      blueprint,
      blueprintFile: {
        meta: {
          schemaVersion: BLUEPRINT_SCHEMA_VERSION,
          projectId: `brain-${Date.now().toString(36)}`,
          title: blueprint.meta.title,
          createdAt: new Date().toISOString(),
          language: blueprint.meta.language as 'bn' | 'en',
          audioRef: input.audioAnalysis ? {
            assetId: input.audioAnalysis.assetId,
            fileName: input.audioAnalysis.fileName,
            mime: input.audioAnalysis.mime,
            duration: input.audioAnalysis.duration,
          } : undefined,
          timingRef: timing || undefined,
        },
        blueprint,
        segments: input.transcript?.segments,
        captions: blueprint.captions,
      },
      warnings,
      timing,
    };
  }
}

export function createDeterministicBrain(): VideoBrainProvider {
  return new DeterministicVideoBrain();
}
