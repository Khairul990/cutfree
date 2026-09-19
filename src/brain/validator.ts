/**
 * CutFree Brain — Blueprint Validator (Phase 1)
 * Validates JSON syntax, schema, timing, and asset references.
 * Never trusts AI output directly — all AI JSON goes through this.
 */

import type { Blueprint, ValidationResult, ValidationError } from './types';
import { BLUEPRINT_SCHEMA_VERSION } from './types';

function err(path: string, message: string): ValidationError {
  return { path, message, severity: 'error' };
}
function warn(path: string, message: string): ValidationError {
  return { path, message, severity: 'warning' };
}

export function validateBlueprintJson(raw: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (!raw || typeof raw !== 'object') {
    return { valid: false, errors: [err('', 'Blueprint must be an object')], warnings };
  }
  const obj = raw as Record<string, unknown>;

  // Schema version
  const meta = obj['meta'] as Record<string, unknown> | undefined;
  const schemaVersion = (obj as unknown as { schemaVersion?: string }).schemaVersion || (meta as unknown as { schemaVersion?: string })?.schemaVersion;
  if (schemaVersion && schemaVersion !== BLUEPRINT_SCHEMA_VERSION) {
    warnings.push(warn('schemaVersion', `Expected ${BLUEPRINT_SCHEMA_VERSION}, got ${schemaVersion} — will normalize`));
  }
  if (!obj['scenes'] && !(obj as unknown as { blueprint?: unknown }).blueprint) {
    // Allow both raw Spec and wrapped CutFreeBlueprintFile
    const hasBlueprint = !!(obj as unknown as { blueprint?: unknown }).blueprint;
    if (!hasBlueprint) errors.push(err('scenes', 'Missing scenes array'));
  }

  // Extract blueprint for deeper checks
  const blueprint: Blueprint = ((obj as unknown as { blueprint?: Blueprint }).blueprint as Blueprint) || (obj as unknown as Blueprint);
  if (!blueprint) {
    errors.push(err('blueprint', 'Missing blueprint object'));
    return { valid: errors.length === 0, errors, warnings };
  }

  // Duration
  if (typeof blueprint.duration !== 'number' || !(blueprint.duration > 0)) {
    errors.push(err('duration', 'duration must be > 0'));
  }
  if (blueprint.duration > 60 * 60) warnings.push(warn('duration', 'Unusually long duration > 1h'));

  // Scenes
  if (!Array.isArray(blueprint.scenes)) {
    errors.push(err('scenes', 'scenes must be an array'));
  } else {
    let acc = 0;
    blueprint.scenes.forEach((sc, i) => {
      const p = `scenes[${i}]`;
      if (typeof sc.dur !== 'number' || !(sc.dur > 0)) errors.push(err(`${p}.dur`, 'dur must be > 0'));
      if (sc.dur < 0.3) warnings.push(warn(`${p}.dur`, 'Very short scene <0.3s'));
      if (sc.dur > 30) warnings.push(warn(`${p}.dur`, 'Very long scene >30s'));
      const start = acc;
      const end = acc + (typeof sc.dur === 'number' ? sc.dur : 0);
      if (start < 0) errors.push(err(`${p}.start`, 'start must be >=0'));
      if (end < start) errors.push(err(`${p}.end`, 'end must be >= start'));
      if (blueprint.duration && end > blueprint.duration + 0.001) {
        // Allow small epsilon, but flag
        warnings.push(warn(p, `Scene end ${end.toFixed(2)} exceeds project duration ${blueprint.duration.toFixed(2)}`));
      }
      acc = end;
      // Asset reference check (if scene references assetId, it must exist)
      const assetId = (sc as unknown as { assetId?: string }).assetId;
      if (assetId && typeof assetId === 'string' && assetId.startsWith('__unknown')) {
        warnings.push(warn(`${p}.assetId`, `Unknown asset reference ${assetId} — should be semantic`));
      }
    });
    const total = blueprint.scenes.reduce((a, s) => a + (typeof s.dur === 'number' ? s.dur : 0), 0);
    if (Math.abs(total - blueprint.duration) > 0.05) {
      warnings.push(warn('duration', `Sum of scene durs ${total.toFixed(2)} != duration ${blueprint.duration.toFixed(2)} — will normalize`));
    }
  }

  // Captions
  if (blueprint.captions) {
    if (!Array.isArray(blueprint.captions)) errors.push(err('captions', 'captions must be array'));
    else {
      blueprint.captions.forEach((c, i) => {
        const p = `captions[${i}]`;
        if (typeof c.start !== 'number' || typeof c.end !== 'number') errors.push(err(p, 'start/end must be numbers'));
        else {
          if (c.start < 0) errors.push(err(`${p}.start`, 'start >=0'));
          if (c.end < c.start) errors.push(err(`${p}.end`, 'end >= start'));
          if (c.end - c.start < 0.2) warnings.push(warn(p, 'Very short caption <0.2s'));
          if (c.text && c.text.length > 120) warnings.push(warn(`${p}.text`, 'Long caption >120 chars — may overflow'));
        }
      });
    }
  }

  // Meta
  if (blueprint.meta) {
    if (!blueprint.meta.title) warnings.push(warn('meta.title', 'Missing title — will default'));
    if (!['bn', 'en'].includes(blueprint.meta.language)) errors.push(err('meta.language', 'language must be bn|en'));
    if (!blueprint.meta.aspect) warnings.push(warn('meta.aspect', 'Missing aspect — will default to 16:9'));
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function parseAndValidateBlueprint(jsonText: string): { result: ValidationResult; parsed: unknown } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    return {
      parsed: null,
      result: { valid: false, errors: [err('json', `Invalid JSON: ${(e as Error).message}`)], warnings: [] },
    };
  }
  return { parsed, result: validateBlueprintJson(parsed) };
}
