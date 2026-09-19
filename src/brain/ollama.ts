/**
 * CutFree Brain — Ollama Adapter (Phase 1, optional)
 * Never mandatory. Never mutates state directly. Output is untrusted.
 * Must go through: JSON parse → schema validation → normalization → Blueprint
 */

import type { VideoBrainProvider, VideoBrainInput, VideoBrainResult, OllamaAdapterConfig } from './types';
import { BLUEPRINT_SCHEMA_VERSION } from './types';
import { validateBlueprintJson } from './validator';
import { normalizeBlueprint } from './normalizer';
import { fallbackBlueprintFromAudio } from './fallback';

export class OllamaVideoBrain implements VideoBrainProvider {
  readonly id = 'ollama';
  readonly displayName: string;

  constructor(private config: OllamaAdapterConfig) {
    this.displayName = `Ollama (${config.model}@${config.baseUrl})`;
  }

  isAvailable(): boolean {
    // Availability is checked via network probe, but we don't block UI if not.
    // For typecheck, we return boolean; actual probe is async in analyze().
    return typeof fetch !== 'undefined';
  }

  private async probe(): Promise<boolean> {
    try {
      const res = await fetch(`${this.config.baseUrl.replace(/\/$/, '')}/api/tags`, { method: 'GET' });
      return res.ok;
    } catch {
      return false;
    }
  }

  async analyze(input: VideoBrainInput): Promise<VideoBrainResult> {
    const available = await this.probe();
    if (!available) {
      // Graceful fallback — do NOT throw, return deterministic blueprint
      const blueprint = fallbackBlueprintFromAudio(input.audioAnalysis || null, input.script || '', 'bn');
      return {
        blueprint,
        blueprintFile: {
          meta: {
            schemaVersion: BLUEPRINT_SCHEMA_VERSION,
            projectId: `fallback-${Date.now()}`,
            title: blueprint.meta.title,
            createdAt: new Date().toISOString(),
            language: blueprint.meta.language as 'bn' | 'en',
            audioRef: input.audioAnalysis ? {
              assetId: input.audioAnalysis.assetId,
              fileName: input.audioAnalysis.fileName,
              mime: input.audioAnalysis.mime,
              duration: input.audioAnalysis.duration,
            } : undefined,
            timingRef: input.audioAnalysis?.timing,
          },
          blueprint,
          captions: [],
        },
        warnings: ['Ollama not available — used deterministic fallback'],
        timing: input.audioAnalysis?.timing || null,
      };
    }

    // If available, request structured JSON — but this is a stub for Phase 1.
    // We do NOT implement full prompt engineering here; we just demonstrate the pipeline.
    // A real implementation would POST to /api/generate with a system prompt that
    // requests: { schemaVersion, project, timeline, scenes, captions, etc. }
    // For Phase 1, we still return deterministic blueprint to avoid overbuilding.
    try {
      const prompt = `Generate CutFree Blueprint JSON for: ${input.script?.slice(0, 400) || 'untitled'}`;
      const res = await fetch(`${this.config.baseUrl.replace(/\/$/, '')}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.model,
          prompt,
          stream: false,
          format: 'json',
        }),
      });
      if (!res.ok) throw new Error(`Ollama ${res.status}`);
      const data = await res.json() as { response?: string };
      const rawText = data.response || '';
      let parsed: unknown;
      try { parsed = JSON.parse(rawText); } catch { throw new Error('Ollama returned invalid JSON'); }
      const validation = validateBlueprintJson(parsed);
      if (!validation.valid) {
        throw new Error(`Ollama JSON failed validation: ${validation.errors[0]?.message}`);
      }
      const { blueprint, changes } = normalizeBlueprint(parsed);
      return {
        blueprint,
        blueprintFile: {
          meta: {
            schemaVersion: BLUEPRINT_SCHEMA_VERSION,
            projectId: `ollama-${Date.now()}`,
            title: blueprint.meta.title,
            createdAt: new Date().toISOString(),
            language: blueprint.meta.language as 'bn' | 'en',
          },
          blueprint,
        },
        warnings: changes,
        timing: input.audioAnalysis?.timing || null,
      };
    } catch (e) {
      // On any Ollama error, fall back deterministically — never break editor
      const blueprint = fallbackBlueprintFromAudio(input.audioAnalysis || null, input.script || '', 'bn');
      return {
        blueprint,
        blueprintFile: {
          meta: {
            schemaVersion: BLUEPRINT_SCHEMA_VERSION,
            projectId: `fallback-${Date.now()}`,
            title: blueprint.meta.title,
            createdAt: new Date().toISOString(),
            language: 'bn',
          },
          blueprint,
        },
        warnings: [`Ollama error, used fallback: ${(e as Error).message}`],
        timing: input.audioAnalysis?.timing || null,
      };
    }
  }
}

// Factory — never auto-downloads, never consumes GB without user action
export function createOllamaBrain(config: OllamaAdapterConfig): VideoBrainProvider {
  return new OllamaVideoBrain(config);
}
