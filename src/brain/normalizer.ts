/**
 * CutFree Brain — Normalizer (Phase 1)
 * Normalizes AI-generated blueprints before they enter the editor.
 * Sorts, clamps, and fills defaults — but records changes.
 */

import type { Blueprint } from './types';
import { BLUEPRINT_SCHEMA_VERSION } from './types';

const VALID_ASPECTS = new Set(['16:9', '9:16', '1:1', '4:5']);
const VALID_TRANSITIONS = new Set(['none', 'fade', 'crossfade', 'slide', 'wipe', 'zoom', 'blur', 'whip_pan', 'page_turn', 'glitch']);
const VALID_ANIMS = new Set(['fadeIn', 'fadeOut', 'slideLeft', 'slideRight', 'scaleIn', 'scaleOut', 'zoomIn', 'zoomOut', 'typewriter', 'wordReveal', 'word_reveal', 'bounce', 'emphasis', 'cameraPan', 'cameraDolly', 'fade', 'slide_up', 'pop', 'blur_reveal', 'line_reveal', 'scale']);
const VALID_CAMERAS = new Set(['static', 'slow_zoom_in', 'slow_zoom_out', 'pan_left', 'pan_right', 'pan_up', 'pan_down', 'push_in', 'pull_out', 'drift', 'parallax', 'handheld_soft']);

export interface NormalizationResult {
  blueprint: Blueprint;
  changes: string[];
}

export function normalizeBlueprint(raw: unknown): NormalizationResult {
  const changes: string[] = [];
  // Accept both wrapped and raw
  const obj = raw as Record<string, unknown>;
  const maybeWrapped = (obj as unknown as { blueprint?: Blueprint }).blueprint;
  const bp: Blueprint = (maybeWrapped ? maybeWrapped : (obj as unknown as Blueprint)) as Blueprint;

  // Clone
  const blueprint: Blueprint = JSON.parse(JSON.stringify(bp));

  // Schema version
  if ((blueprint as unknown as { schemaVersion?: string }).schemaVersion !== BLUEPRINT_SCHEMA_VERSION) {
    (blueprint as unknown as { schemaVersion: string }).schemaVersion = BLUEPRINT_SCHEMA_VERSION;
    changes.push(`schemaVersion normalized to ${BLUEPRINT_SCHEMA_VERSION}`);
  }
  if (!blueprint.meta) {
    (blueprint as unknown as { meta: unknown }).meta = {
      title: 'Untitled',
      theme: 'aurora',
      mood: 'cinematic',
      seed: 12345,
      watermark: '',
      showProgress: true,
      language: 'bn',
      aspect: '16:9',
      perf: 'high',
      shorts: false,
      safe: { top: 0.05, bottom: 0.08 },
      captions: { enabled: true, style: 'bar', scale: 1 },
    } as unknown as Blueprint['meta'];
    changes.push('meta created with defaults');
  }

  // Aspect
  const aspect = blueprint.meta.aspect as string;
  if (!VALID_ASPECTS.has(aspect)) {
    const old = aspect;
    blueprint.meta.aspect = '16:9';
    changes.push(`aspect ${old} → 16:9`);
  }

  // Language
  if (!['bn', 'en'].includes(blueprint.meta.language)) {
    const old = blueprint.meta.language;
    blueprint.meta.language = 'bn';
    changes.push(`language ${old} → bn`);
  }

  // Scenes: sort is not needed (order is chronological), but clamp durs
  if (Array.isArray(blueprint.scenes)) {
    blueprint.scenes.forEach((sc, i) => {
      if (typeof sc.dur !== 'number' || !(sc.dur > 0)) {
        const old = sc.dur;
        sc.dur = 2.5;
        changes.push(`scenes[${i}].dur ${old} → 2.5`);
      }
      sc.dur = Math.max(0.5, Math.min(30, sc.dur));
      // transition
      const tr = (sc as unknown as { transitionOut?: string }).transitionOut;
      if (tr && !VALID_TRANSITIONS.has(tr)) {
        const old = tr;
        (sc as unknown as { transitionOut: string }).transitionOut = 'fade';
        changes.push(`scenes[${i}].transitionOut ${old} → fade`);
      }
      // animation style
      const st = (sc as unknown as { style?: string }).style;
      if (st && !VALID_ANIMS.has(st)) {
        // keep but warn — normalize to fadeIn
        changes.push(`scenes[${i}].style ${st} kept (unknown anim)`);
      }
      // words timing clamp
      if (Array.isArray(sc.words)) {
        sc.words.forEach((w, j) => {
          if (w.s < 0) { w.s = 0; changes.push(`scenes[${i}].words[${j}].s clamped to 0`); }
          if (w.e < w.s) { w.e = w.s + 0.2; changes.push(`scenes[${i}].words[${j}].e fixed`); }
        });
        sc.words.sort((a, b) => a.s - b.s);
      }
    });
    // Ensure chronological order already (scenes are ordered)
    // Recompute duration
    const total = blueprint.scenes.reduce((a, s) => a + s.dur, 0);
    if (Math.abs(total - blueprint.duration) > 0.01) {
      changes.push(`duration ${blueprint.duration} → ${total.toFixed(2)} (sum of scenes)`);
      blueprint.duration = total;
    }
  } else {
    blueprint.scenes = [];
    changes.push('scenes created as empty array');
  }

  // Captions: sort and clamp
  if (Array.isArray(blueprint.captions)) {
    blueprint.captions.sort((a, b) => a.start - b.start);
    blueprint.captions.forEach((c, i) => {
      if (c.start < 0) { c.start = 0; changes.push(`captions[${i}].start clamped`); }
      if (c.end < c.start) { c.end = c.start + 0.5; changes.push(`captions[${i}].end fixed`); }
      if (c.end > blueprint.duration) {
        const old = c.end;
        c.end = blueprint.duration;
        changes.push(`captions[${i}].end ${old} → ${c.end} (clamped to duration)`);
      }
    });
  }

  // FPS, width, height defaults
  if (!blueprint.fps || blueprint.fps < 1) {
    blueprint.fps = 30;
    changes.push('fps → 30');
  }
  if (!blueprint.width || blueprint.width < 100) {
    blueprint.width = 1280;
    changes.push('width → 1280');
  }
  if (!blueprint.height || blueprint.height < 100) {
    blueprint.height = 720;
    changes.push('height → 720');
  }

  return { blueprint, changes };
}
