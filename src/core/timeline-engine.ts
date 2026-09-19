/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Professional Timeline Engine for CutFree Studio.
 * Deterministic nonlinear editing math: snapping, moving, trimming, splitting,
 * duplicating, and marker management.
 */

import { BlueprintScene, BlueprintCaption, BlueprintMarker } from "../types/blueprint";
import { clamp, isTimeEqual } from "./time";

export interface SnapResult {
  time: number;
  didSnap: boolean;
  snapTarget?: number;
}

/**
 * Calculates snapping to the nearest target within the threshold.
 */
export function calculateSnap(
  targetTime: number,
  snapPoints: number[],
  threshold: number = 0.5
): SnapResult {
  let closestDist = Infinity;
  let closestTarget: number | undefined;

  for (const p of snapPoints) {
    const dist = Math.abs(targetTime - p);
    if (dist <= threshold && dist < closestDist) {
      closestDist = dist;
      closestTarget = p;
    }
  }

  if (closestTarget !== undefined) {
    return {
      time: closestTarget,
      didSnap: true,
      snapTarget: closestTarget,
    };
  }

  return {
    time: targetTime,
    didSnap: false,
  };
}

/**
 * Trims a scene's start or end boundary respecting minimum duration.
 */
export function trimScene(
  scenes: BlueprintScene[],
  sceneId: string,
  edge: "start" | "end",
  newTime: number,
  minDuration: number = 0.2
): BlueprintScene[] {
  return scenes.map((s) => {
    if (s.id !== sceneId) return s;

    if (edge === "start") {
      const clampedStart = clamp(newTime, 0, s.end - minDuration);
      return { ...s, start: clampedStart };
    } else {
      const clampedEnd = Math.max(s.start + minDuration, newTime);
      return { ...s, end: clampedEnd };
    }
  });
}

/**
 * Moves a scene by shifting both its start and end by deltaSec, or to absolute newStart.
 */
export function moveScene(
  scenes: BlueprintScene[],
  sceneId: string,
  newStart: number,
  maxBoundary?: number
): BlueprintScene[] {
  const target = scenes.find((s) => s.id === sceneId);
  if (!target) return scenes;

  const duration = Math.max(0.1, target.end - target.start);
  let safeStart = Math.max(0, newStart);
  if (maxBoundary !== undefined && safeStart + duration > maxBoundary) {
    safeStart = Math.max(0, maxBoundary - duration);
  }
  const safeEnd = safeStart + duration;

  return scenes.map((s) => {
    if (s.id !== sceneId) return s;
    return { ...s, start: safeStart, end: safeEnd };
  });
}

/**
 * Splits a scene at splitTime, creating two independent scene clips.
 */
export function splitSceneAtTime(
  scenes: BlueprintScene[],
  sceneId: string,
  splitTime: number,
  minDuration: number = 0.2
): { scenes: BlueprintScene[]; newSceneId: string } | null {
  const target = scenes.find((s) => s.id === sceneId);
  if (!target) return null;

  if (splitTime <= target.start + minDuration || splitTime >= target.end - minDuration) {
    return null; // Cannot split too close to edge
  }

  const newSceneId = `scene_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const firstHalf: BlueprintScene = {
    ...target,
    end: splitTime,
  };

  const secondHalf: BlueprintScene = {
    ...target,
    id: newSceneId,
    title: target.title ? `${target.title} (Part 2)` : "Split Scene",
    start: splitTime,
    end: target.end,
  };

  const result: BlueprintScene[] = [];
  for (const s of scenes) {
    if (s.id === sceneId) {
      result.push(firstHalf, secondHalf);
    } else {
      result.push(s);
    }
  }

  return { scenes: result, newSceneId };
}

/**
 * Duplicates a scene, placing the clone immediately after the target.
 */
export function duplicateScene(
  scenes: BlueprintScene[],
  sceneId: string
): { scenes: BlueprintScene[]; duplicatedSceneId: string } | null {
  const target = scenes.find((s) => s.id === sceneId);
  if (!target) return null;

  const duration = Math.max(0.1, target.end - target.start);
  const newSceneId = `scene_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  const clone: BlueprintScene = {
    ...JSON.parse(JSON.stringify(target)),
    id: newSceneId,
    title: target.title ? `${target.title} (Copy)` : "Scene Copy",
    start: target.end,
    end: target.end + duration,
  };

  const result: BlueprintScene[] = [];
  for (const s of scenes) {
    result.push(s);
    if (s.id === sceneId) {
      result.push(clone);
    }
  }

  // Reconcile continuous timing
  let cursor = 0;
  const reconciled = result.map((s) => {
    const len = Math.max(0.1, s.end - s.start);
    const res = { ...s, start: cursor, end: cursor + len };
    cursor += len;
    return res;
  });

  return { scenes: reconciled, duplicatedSceneId: newSceneId };
}

/**
 * Deletes scenes by IDs.
 */
export function deleteScenes(scenes: BlueprintScene[], sceneIds: string[]): BlueprintScene[] {
  const idSet = new Set(sceneIds);
  const remaining = scenes.filter((s) => !idSet.has(s.id));
  if (remaining.length === 0) return scenes; // Never delete all scenes

  // Reconcile continuity
  let cursor = 0;
  return remaining.map((s) => {
    const len = Math.max(0.1, s.end - s.start);
    const res = { ...s, start: cursor, end: cursor + len };
    cursor += len;
    return res;
  });
}

/**
 * Caption operations
 */
export function trimCaption(
  captions: BlueprintCaption[],
  captionId: string,
  edge: "start" | "end",
  newTime: number,
  minDuration: number = 0.2
): BlueprintCaption[] {
  return captions.map((c) => {
    if (c.id !== captionId) return c;
    if (edge === "start") {
      const clampedStart = clamp(newTime, 0, c.end - minDuration);
      return { ...c, start: clampedStart };
    } else {
      const clampedEnd = Math.max(c.start + minDuration, newTime);
      return { ...c, end: clampedEnd };
    }
  });
}

export function moveCaption(
  captions: BlueprintCaption[],
  captionId: string,
  newStart: number,
  maxBoundary?: number
): BlueprintCaption[] {
  const target = captions.find((c) => c.id === captionId);
  if (!target) return captions;

  const duration = Math.max(0.1, target.end - target.start);
  let safeStart = Math.max(0, newStart);
  if (maxBoundary !== undefined && safeStart + duration > maxBoundary) {
    safeStart = Math.max(0, maxBoundary - duration);
  }
  const safeEnd = safeStart + duration;

  return captions.map((c) => {
    if (c.id !== captionId) return c;
    return { ...c, start: safeStart, end: safeEnd };
  });
}

export function splitCaptionAtTime(
  captions: BlueprintCaption[],
  captionId: string,
  splitTime: number,
  minDuration: number = 0.2
): { captions: BlueprintCaption[]; newCaptionId: string } | null {
  const target = captions.find((c) => c.id === captionId);
  if (!target) return null;

  if (splitTime <= target.start + minDuration || splitTime >= target.end - minDuration) {
    return null;
  }

  const words = target.text.split(" ");
  const mid = Math.max(1, Math.floor(words.length / 2));
  const text1 = words.slice(0, mid).join(" ") || target.text;
  const text2 = words.slice(mid).join(" ") || target.text;

  const newCaptionId = `cap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const cap1: BlueprintCaption = {
    ...target,
    end: splitTime,
    text: text1,
  };

  const cap2: BlueprintCaption = {
    ...target,
    id: newCaptionId,
    start: splitTime,
    end: target.end,
    text: text2,
  };

  const result: BlueprintCaption[] = [];
  for (const c of captions) {
    if (c.id === captionId) {
      result.push(cap1, cap2);
    } else {
      result.push(c);
    }
  }

  return { captions: result, newCaptionId };
}

export function duplicateCaption(
  captions: BlueprintCaption[],
  captionId: string
): { captions: BlueprintCaption[]; duplicatedCaptionId: string } | null {
  const target = captions.find((c) => c.id === captionId);
  if (!target) return null;

  const duration = Math.max(0.1, target.end - target.start);
  const newId = `cap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const clone: BlueprintCaption = {
    ...JSON.parse(JSON.stringify(target)),
    id: newId,
    start: target.end + 0.1,
    end: target.end + 0.1 + duration,
  };

  return {
    captions: [...captions, clone].sort((a, b) => a.start - b.start),
    duplicatedCaptionId: newId,
  };
}

export function deleteCaptions(captions: BlueprintCaption[], captionIds: string[]): BlueprintCaption[] {
  const idSet = new Set(captionIds);
  return captions.filter((c) => !c.id || !idSet.has(c.id));
}

/**
 * Marker operations
 */
export function addMarker(
  markers: BlueprintMarker[] = [],
  time: number,
  label?: string,
  color?: string
): BlueprintMarker[] {
  const newMarker: BlueprintMarker = {
    id: `marker_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    time: Math.max(0, time),
    label: label || `Marker ${markers.length + 1}`,
    color: color || "#259CFF",
  };
  return [...markers, newMarker].sort((a, b) => a.time - b.time);
}

export function updateMarker(
  markers: BlueprintMarker[],
  markerId: string,
  updates: Partial<BlueprintMarker>
): BlueprintMarker[] {
  return markers
    .map((m) => (m.id === markerId ? { ...m, ...updates } : m))
    .sort((a, b) => a.time - b.time);
}

export function deleteMarker(markers: BlueprintMarker[], markerId: string): BlueprintMarker[] {
  return markers.filter((m) => m.id !== markerId);
}
