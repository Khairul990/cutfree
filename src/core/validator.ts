/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Authoritative Blueprint JSON v1.0 Validator and Reconciler.
 */

import { VideoBlueprint, ValidationResult, ValidationIssue } from "../types/blueprint";
import { quantizeToFrame } from "./time";

export interface ValidateOptions {
  actualAudioDuration?: number; // In seconds (from media decoder / AudioBuffer)
  autoRepair?: boolean;
}

/**
 * Validates a VideoBlueprint according to the CutFree Production Studio Specification.
 */
export function validateBlueprint(raw: any, options: ValidateOptions = {}): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (!raw || typeof raw !== "object") {
    return {
      valid: false,
      errors: [{ severity: "error", code: "INVALID_JSON", field: "root", message: "Blueprint must be a non-null object" }],
      warnings: [],
    };
  }

  // 1. Version check
  if (raw.version !== "1.0") {
    errors.push({
      severity: "error",
      code: "INVALID_VERSION",
      field: "version",
      message: `Expected version "1.0", found "${raw.version}"`,
    });
  }

  // 2. Project check
  const project = raw.project || {};
  if (!project.id) {
    errors.push({ severity: "error", code: "MISSING_PROJECT_ID", field: "project.id", message: "Project ID is required" });
  }
  const fps = Number(project.fps) || 30;

  // 3. Audio & Timeline duration check
  const declaredAudioDur = Number(raw.audio?.duration) || 0;
  let projectDuration = Number(raw.timeline?.duration) || declaredAudioDur;

  if (projectDuration <= 0) {
    errors.push({
      severity: "error",
      code: "INVALID_DURATION",
      field: "timeline.duration",
      message: "Project duration must be greater than 0",
    });
  }

  // Authoritative Audio Check (Section 9 & 41)
  if (options.actualAudioDuration && options.actualAudioDuration > 0) {
    const diff = Math.abs(options.actualAudioDuration - projectDuration);
    if (diff > 0.05) {
      warnings.push({
        severity: "warning",
        code: "AUDIO_DURATION_MISMATCH",
        field: "timeline.duration",
        message: `Audio file duration (${options.actualAudioDuration.toFixed(2)}s) differs from blueprint duration (${projectDuration.toFixed(2)}s). Audio is authoritative.`,
        fixable: true,
      });
      if (options.autoRepair) {
        projectDuration = options.actualAudioDuration;
      }
    }
  }

  // 4. Metadata Count Mismatch Checks (Section 43)
  const scenes = Array.isArray(raw.scenes) ? raw.scenes : [];
  const segments = Array.isArray(raw.segments) ? raw.segments : [];
  const captions = Array.isArray(raw.captions) ? raw.captions : [];

  const declaredScenes = Number(raw.timeline?.totalScenes);
  if (Number.isFinite(declaredScenes) && declaredScenes !== scenes.length) {
    warnings.push({
      severity: "warning",
      code: "COUNT_MISMATCH_SCENES",
      field: "timeline.totalScenes",
      message: `Declared totalScenes (${declaredScenes}) does not match actual scenes array length (${scenes.length}). Actual length will be used.`,
      fixable: true,
    });
  }

  const declaredSegments = Number(raw.timeline?.totalSegments);
  if (Number.isFinite(declaredSegments) && declaredSegments !== segments.length) {
    warnings.push({
      severity: "warning",
      code: "COUNT_MISMATCH_SEGMENTS",
      field: "timeline.totalSegments",
      message: `Declared totalSegments (${declaredSegments}) does not match actual segments array length (${segments.length}). Actual length will be used.`,
      fixable: true,
    });
  }

  // 5. Scene Continuity & Coverage Check (Section 44)
  if (scenes.length === 0) {
    errors.push({ severity: "error", code: "NO_SCENES", field: "scenes", message: "Video must contain at least one scene" });
  } else {
    // Check first scene start
    if (scenes[0].start > 0.05) {
      warnings.push({
        severity: "warning",
        code: "SCENE_START_GAP",
        field: "scenes[0].start",
        message: `First scene starts at ${scenes[0].start}s instead of 0s`,
        fixable: true,
      });
    }

    let prevEnd = 0;
    for (let i = 0; i < scenes.length; i++) {
      const s = scenes[i];
      const start = Number(s.start);
      const end = Number(s.end);

      if (!Number.isFinite(start) || start < 0) {
        errors.push({ severity: "error", code: "INVALID_SCENE_START", field: `scenes[${i}].start`, message: `Scene ${s.id || i} has invalid start time: ${s.start}` });
      }
      if (!Number.isFinite(end) || end <= start) {
        errors.push({ severity: "error", code: "INVALID_SCENE_END", field: `scenes[${i}].end`, message: `Scene ${s.id || i} has invalid end time: ${s.end} (start: ${start})` });
      }

      // Check gap or overlap with previous scene
      if (i > 0) {
        const gap = start - prevEnd;
        if (Math.abs(gap) > 0.1) {
          if (gap > 0) {
            warnings.push({
              severity: "warning",
              code: "SCENE_GAP",
              field: `scenes[${i}].start`,
              message: `Uncovered gap of ${gap.toFixed(2)}s between scene ${scenes[i - 1].id} and ${s.id}`,
              fixable: true,
            });
          } else {
            warnings.push({
              severity: "warning",
              code: "SCENE_OVERLAP",
              field: `scenes[${i}].start`,
              message: `Scene ${s.id} overlaps previous scene ${scenes[i - 1].id} by ${(-gap).toFixed(2)}s`,
              fixable: true,
            });
          }
        }
      }
      prevEnd = Math.max(prevEnd, end);
    }

    // Check last scene coverage
    const lastSceneEnd = scenes[scenes.length - 1].end;
    if (projectDuration > 0 && Math.abs(lastSceneEnd - projectDuration) > 0.2) {
      warnings.push({
        severity: "warning",
        code: "SCENE_COVERAGE_INCOMPLETE",
        field: `scenes[${scenes.length - 1}].end`,
        message: `Last scene ends at ${lastSceneEnd.toFixed(2)}s, but project duration is ${projectDuration.toFixed(2)}s. Coverage must be complete.`,
        fixable: true,
      });
    }
  }

  // 6. Segment Continuity (Speech + Pause) (Section 10 & 45)
  if (segments.length > 0) {
    let prevSegEnd = 0;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const start = Number(seg.start);
      const end = Number(seg.end);

      if (start < 0 || end < start) {
        errors.push({ severity: "error", code: "INVALID_SEGMENT_TIMING", field: `segments[${i}]`, message: `Segment ${seg.id || i} has invalid timing (${start} -> ${end})` });
      }

      if (i > 0) {
        const gap = start - prevSegEnd;
        if (gap > 0.2) {
          warnings.push({
            severity: "warning",
            code: "UNACCOUNTED_AUDIO_GAP",
            field: `segments[${i}]`,
            message: `Gap of ${gap.toFixed(2)}s between segment ${segments[i - 1].id} and ${seg.id}. Speech/pause should be continuous.`,
            fixable: true,
          });
        }
      }
      prevSegEnd = Math.max(prevSegEnd, end);
    }
  }

  // 7. Caption boundary check
  for (let i = 0; i < captions.length; i++) {
    const c = captions[i];
    if (c.start < 0 || c.end <= c.start) {
      errors.push({ severity: "error", code: "INVALID_CAPTION_TIMING", field: `captions[${i}]`, message: `Caption #${i + 1} has invalid timing` });
    }
  }

  // 8. Asset Duplicate IDs Check
  const assets = Array.isArray(raw.assets) ? raw.assets : [];
  const seenAssetIds = new Set<string>();
  for (const asset of assets) {
    if (asset.id) {
      if (seenAssetIds.has(asset.id)) {
        warnings.push({
          severity: "warning",
          code: "DUPLICATE_ASSET_ID",
          field: "assets",
          message: `Duplicate asset ID: "${asset.id}"`,
        });
      }
      seenAssetIds.add(asset.id);
    }
  }

  // Auto-Repair construction if requested or feasible
  let repairedBlueprint: VideoBlueprint | undefined;
  if (options.autoRepair || errors.length === 0) {
    repairedBlueprint = repairBlueprint(raw, options.actualAudioDuration);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    repairedBlueprint,
  };
}

/**
 * Repairs safe metadata and timeline defects automatically.
 * Ensures the blueprint strictly covers the authoritative duration with zero gaps.
 */
export function repairBlueprint(raw: any, authoritativeAudioDuration?: number): VideoBlueprint {
  const fps = Number(raw.project?.fps) || 30;
  let duration = authoritativeAudioDuration && authoritativeAudioDuration > 0
    ? authoritativeAudioDuration
    : Number(raw.timeline?.duration) || Number(raw.audio?.duration) || 10;

  duration = quantizeToFrame(duration, fps);

  // Normalize scenes
  const rawScenes = Array.isArray(raw.scenes) ? raw.scenes : [];
  const repairedScenes: any[] = [];
  let currentCursor = 0;

  for (let i = 0; i < rawScenes.length; i++) {
    const s = { ...rawScenes[i] };
    const originalStart = Number(s.start) || 0;
    const originalEnd = Number(s.end) || (originalStart + 5);

    // Continuous chaining
    const sceneStart = i === 0 ? 0 : currentCursor;
    let sceneEnd = Math.max(sceneStart + 0.5, originalEnd);

    // For the last scene, snap exactly to project duration
    if (i === rawScenes.length - 1) {
      sceneEnd = Math.max(sceneStart + 0.5, duration);
    }

    s.start = quantizeToFrame(sceneStart, fps);
    s.end = quantizeToFrame(sceneEnd, fps);
    currentCursor = s.end;

    repairedScenes.push(s);
  }

  // If no scenes, create a fallback scene covering the entire duration
  if (repairedScenes.length === 0) {
    repairedScenes.push({
      id: "scene_01",
      start: 0,
      end: duration,
      purpose: "main",
      title: raw.project?.title || "Story Scene",
      background: { assetId: "default_bg", fit: "cover" },
    });
  }

  // Update total duration to match end of last scene
  if (repairedScenes.length > 0) {
    duration = repairedScenes[repairedScenes.length - 1].end;
  }

  // Repair segments continuity
  const rawSegments = Array.isArray(raw.segments) ? raw.segments : [];
  const repairedSegments: any[] = [];
  let segCursor = 0;

  for (let i = 0; i < rawSegments.length; i++) {
    const seg = { ...rawSegments[i] };
    const segStart = Number(seg.start) || 0;
    const segEnd = Number(seg.end) || (segStart + 1);

    // If there's a gap between segCursor and segStart, insert a pause segment
    if (segStart > segCursor + 0.05) {
      repairedSegments.push({
        id: `pause_${i}`,
        start: quantizeToFrame(segCursor, fps),
        end: quantizeToFrame(segStart, fps),
        type: "pause",
      });
    }

    seg.start = quantizeToFrame(segStart, fps);
    seg.end = quantizeToFrame(segEnd, fps);
    segCursor = seg.end;
    repairedSegments.push(seg);
  }

  // Final gap to duration
  if (segCursor < duration - 0.05) {
    repairedSegments.push({
      id: `pause_final`,
      start: quantizeToFrame(segCursor, fps),
      end: duration,
      type: "pause",
    });
  }

  // Normalize captions
  const rawCaptions = Array.isArray(raw.captions) ? raw.captions : [];
  const repairedCaptions = rawCaptions.map((c: any, idx: number) => ({
    ...c,
    id: c.id || `cap_${idx + 1}`,
    start: quantizeToFrame(Math.max(0, Number(c.start) || 0), fps),
    end: quantizeToFrame(Math.min(duration, Number(c.end) || 1), fps),
  }));

  return {
    version: "1.0",
    project: {
      id: raw.project?.id || `proj_${Date.now()}`,
      title: raw.project?.title || "CutFree Project",
      language: raw.project?.language || "bn-BD",
      fps,
      width: Number(raw.project?.width) || 1920,
      height: Number(raw.project?.height) || 1080,
      aspectRatio: raw.project?.aspectRatio || "16:9",
      theme: raw.project?.theme || "aurora",
      mood: raw.project?.mood || "cinematic",
      watermark: raw.project?.watermark || "",
    },
    audio: {
      source: raw.audio?.source || "",
      duration,
      sampleRate: Number(raw.audio?.sampleRate) || 44100,
      channels: Number(raw.audio?.channels) || 2,
      fileName: raw.audio?.fileName || "",
    },
    timeline: {
      duration,
      totalScenes: repairedScenes.length,
      totalSegments: repairedSegments.length,
      totalCaptions: repairedCaptions.length,
    },
    scenes: repairedScenes,
    segments: repairedSegments,
    captions: repairedCaptions,
    assets: Array.isArray(raw.assets) ? raw.assets : [],
    export: raw.export || {
      format: "mp4",
      videoCodec: "h264",
      audioCodec: "aac",
    },
  };
}
