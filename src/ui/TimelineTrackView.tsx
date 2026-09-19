/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Professional Timeline 2.0 Component for CutFree Studio.
 * Full multi-track nonlinear editor with playhead synchronization, zoom presets,
 * horizontal navigation, frame-accurate snapping, clip dragging, edge trimming,
 * splitting, duplication, multi-track controls (lock, mute, solo, visibility),
 * markers, and caption tracks.
 */

import React, { useRef, useState, useCallback, useMemo, useEffect } from "react";
import {
  MousePointer,
  Scissors,
  Trash2,
  Copy,
  Plus,
  ZoomIn,
  Headphones,
  Grid,
  Maximize2,
  Eye,
  EyeOff,
  Volume2,
  VolumeX,
  Lock,
  Unlock,
  Film,
  Users,
  Type,
  AudioLines,
  Music,
  Layers,
  Bookmark,
} from "lucide-react";
import {
  VideoBlueprint,
  BlueprintScene,
  BlueprintCaption,
  BlueprintMarker,
  TimelineTrackConfig,
} from "../types/blueprint";
import { calculateSnap } from "../core/timeline-engine";
import { clamp } from "../core/time";

export interface TimelineTrackViewProps {
  blueprint: VideoBlueprint;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
  onSelectScene: (sceneId: string) => void;
  selectedSceneId: string | null;
  onAddScene?: () => void;
  onSplitScene?: () => void;
  onDeleteScene?: () => void;
  onDuplicateScene?: () => void;
  onTrimScene?: (sceneId: string, edge: "start" | "end", newTime: number) => void;
  onMoveScene?: (sceneId: string, newStart: number) => void;
  onTrimCaption?: (captionId: string, edge: "start" | "end", newTime: number) => void;
  onMoveCaption?: (captionId: string, newStart: number) => void;
  onSplitCaption?: (captionId: string, splitTime: number) => void;
  onDuplicateCaption?: (captionId: string) => void;
  onDeleteCaption?: (captionId: string) => void;
  onAddMarker?: (time: number, label?: string, color?: string) => void;
  onDeleteMarker?: (markerId: string) => void;
}

export const TimelineTrackView: React.FC<TimelineTrackViewProps> = ({
  blueprint,
  currentTime,
  duration,
  isPlaying,
  onSeek,
  onTogglePlay,
  onSelectScene,
  selectedSceneId,
  onAddScene,
  onSplitScene,
  onDeleteScene,
  onDuplicateScene,
  onTrimScene,
  onMoveScene,
  onTrimCaption,
  onMoveCaption,
  onSplitCaption,
  onDuplicateCaption,
  onDeleteCaption,
  onAddMarker,
  onDeleteMarker,
}) => {
  // Zoom state: 0.25x to 4.0x
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const [isSnapping, setIsSnapping] = useState<boolean>(true);
  const [activeTool, setActiveTool] = useState<"select" | "split">("select");
  const [timelineVolume, setTimelineVolume] = useState<number>(85);

  // Selected item IDs (supporting multi-select)
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());

  // Track configurations (visibility, lock, mute, solo)
  const [trackConfigs, setTrackConfigs] = useState<Record<string, { visible: boolean; locked: boolean; muted: boolean; solo: boolean }>>({
    scenes: { visible: true, locked: false, muted: false, solo: false },
    video: { visible: true, locked: false, muted: false, solo: false },
    characters: { visible: true, locked: false, muted: false, solo: false },
    captions: { visible: true, locked: false, muted: false, solo: false },
    audio: { visible: true, locked: false, muted: false, solo: false },
    music: { visible: true, locked: false, muted: false, solo: false },
  });

  // Drag interaction state
  const [activeSnapGuide, setActiveSnapGuide] = useState<number | null>(null);
  const trackContainerRef = useRef<HTMLDivElement>(null);
  const isDraggingPlayhead = useRef<boolean>(false);

  // Clip drag/trim ref
  const dragInteraction = useRef<{
    type: "move-scene" | "trim-scene-start" | "trim-scene-end" | "move-caption" | "trim-caption-start" | "trim-caption-end";
    itemId: string;
    originX: number;
    originStart: number;
    originEnd: number;
    initialDuration: number;
  } | null>(null);

  const safeDuration = Math.max(0.1, duration);
  const playheadPercent = Math.min(100, Math.max(0, (currentTime / safeDuration) * 100));

  // Sync selectedSceneId with selectedItemIds
  useEffect(() => {
    if (selectedSceneId) {
      setSelectedItemIds(new Set([`scene:${selectedSceneId}`]));
    }
  }, [selectedSceneId]);

  // Format seconds to M:SS or MM:SS
  const formatTimecode = (sec: number) => {
    const s = Math.max(0, sec);
    const m = Math.floor(s / 60);
    const rem = Math.floor(s % 60);
    return `${m}:${String(rem).padStart(2, "0")}`;
  };

  const formatPreciseTime = (sec: number) => {
    const s = Math.max(0, sec);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    const secWhole = Math.floor(rem);
    const frac = Math.floor((rem - secWhole) * 100);
    return `${String(m).padStart(2, "0")}:${String(secWhole).padStart(2, "0")}.${String(frac).padStart(2, "0")}`;
  };

  // Snapping targets
  const snapTargets = useMemo(() => {
    const points = new Set<number>();
    points.add(0);
    points.add(safeDuration);
    blueprint.scenes.forEach((s) => {
      points.add(s.start);
      points.add(s.end);
    });
    blueprint.captions?.forEach((c) => {
      points.add(c.start);
      points.add(c.end);
    });
    blueprint.markers?.forEach((m) => {
      points.add(m.time);
    });
    points.add(currentTime);
    return Array.from(points).sort((a, b) => a - b);
  }, [blueprint, safeDuration, currentTime]);

  const snapTime = useCallback(
    (time: number, customThreshold?: number): { time: number; didSnap: boolean } => {
      if (!isSnapping) return { time: Math.max(0, Math.min(safeDuration, time)), didSnap: false };
      const threshold = customThreshold ?? 1.5 / zoomLevel;
      const res = calculateSnap(time, snapTargets, threshold);
      return {
        time: Math.max(0, Math.min(safeDuration, res.time)),
        didSnap: res.didSnap,
      };
    },
    [isSnapping, safeDuration, snapTargets, zoomLevel]
  );

  // Ruler tick marks adapting to zoom
  const rulerTicks = useMemo(() => {
    const ticks: { time: number; label: string; isMajor: boolean }[] = [];
    let step = 30;
    if (zoomLevel >= 2.5) step = 5;
    else if (zoomLevel >= 1.5) step = 10;
    else if (zoomLevel >= 0.75) step = 30;
    else step = 60;

    for (let t = 0; t <= safeDuration; t += step) {
      ticks.push({ time: t, label: formatTimecode(t), isMajor: true });
    }
    if (ticks.length > 0 && Math.abs(ticks[ticks.length - 1].time - safeDuration) > step * 0.4) {
      ticks.push({ time: safeDuration, label: formatTimecode(safeDuration), isMajor: true });
    }
    return ticks;
  }, [safeDuration, zoomLevel]);

  // Convert clientX to timeline seconds
  const clientXToTime = useCallback(
    (clientX: number): number => {
      if (!trackContainerRef.current) return 0;
      const rect = trackContainerRef.current.getBoundingClientRect();
      const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return frac * safeDuration;
    },
    [safeDuration]
  );

  // Pointer event handlers for playhead seek & scrubbing
  const handleSeekFromEvent = useCallback(
    (e: React.PointerEvent) => {
      const rawTime = clientXToTime(e.clientX);
      const snapped = snapTime(rawTime);
      if (snapped.didSnap) {
        setActiveSnapGuide(snapped.time);
      } else {
        setActiveSnapGuide(null);
      }
      onSeek(snapped.time);
    },
    [clientXToTime, snapTime, onSeek]
  );

  const handlePointerDownContainer = (e: React.PointerEvent) => {
    // Only seek if clicking directly on container background or ruler
    if ((e.target as HTMLElement).closest(".timeline-clip")) return;
    isDraggingPlayhead.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    handleSeekFromEvent(e);
  };

  const handlePointerMoveContainer = (e: React.PointerEvent) => {
    if (isDraggingPlayhead.current) {
      handleSeekFromEvent(e);
    } else if (dragInteraction.current) {
      // Handle active clip move or trim
      const interaction = dragInteraction.current;
      const currentTimeAtPointer = clientXToTime(e.clientX);
      const snapped = snapTime(currentTimeAtPointer);

      if (snapped.didSnap) {
        setActiveSnapGuide(snapped.time);
      } else {
        setActiveSnapGuide(null);
      }

      if (interaction.type === "trim-scene-start" && onTrimScene) {
        onTrimScene(interaction.itemId, "start", snapped.time);
      } else if (interaction.type === "trim-scene-end" && onTrimScene) {
        onTrimScene(interaction.itemId, "end", snapped.time);
      } else if (interaction.type === "move-scene" && onMoveScene) {
        const delta = currentTimeAtPointer - interaction.originX;
        const newStart = Math.max(0, interaction.originStart + delta);
        const snappedStart = snapTime(newStart).time;
        onMoveScene(interaction.itemId, snappedStart);
      } else if (interaction.type === "trim-caption-start" && onTrimCaption) {
        onTrimCaption(interaction.itemId, "start", snapped.time);
      } else if (interaction.type === "trim-caption-end" && onTrimCaption) {
        onTrimCaption(interaction.itemId, "end", snapped.time);
      } else if (interaction.type === "move-caption" && onMoveCaption) {
        const delta = currentTimeAtPointer - interaction.originX;
        const newStart = Math.max(0, interaction.originStart + delta);
        const snappedStart = snapTime(newStart).time;
        onMoveCaption(interaction.itemId, snappedStart);
      }
    }
  };

  const handlePointerUpContainer = (e: React.PointerEvent) => {
    if (isDraggingPlayhead.current) {
      isDraggingPlayhead.current = false;
      setActiveSnapGuide(null);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
    }
    if (dragInteraction.current) {
      dragInteraction.current = null;
      setActiveSnapGuide(null);
    }
  };

  // Toggle track properties (visible, locked, muted, solo)
  const toggleTrackProperty = (trackKey: string, prop: "visible" | "locked" | "muted" | "solo") => {
    setTrackConfigs((prev) => ({
      ...prev,
      [trackKey]: {
        ...prev[trackKey],
        [prop]: !prev[trackKey][prop],
      },
    }));
  };

  // Selection handlers
  const handleItemClick = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (e.shiftKey) {
      // Multi-select toggle
      setSelectedItemIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    } else {
      setSelectedItemIds(new Set([id]));
      if (id.startsWith("scene:")) {
        const sceneId = id.replace("scene:", "");
        onSelectScene(sceneId);
      }
    }
  };

  // Add marker at current playhead
  const handleCreateMarker = () => {
    if (onAddMarker) {
      onAddMarker(currentTime, `Marker at ${formatPreciseTime(currentTime)}`);
    }
  };

  const HEADER_WIDTH = 145;

  return (
    <div
      className="h-[270px] bg-[#0C1724] border-t border-[#213248] flex flex-col shrink-0 select-none z-20"
      onKeyDown={(e) => {
        if (e.key === "Escape") setSelectedItemIds(new Set());
      }}
      tabIndex={0}
    >
      {/* TIMELINE TOOLBAR */}
      <div className="h-[38px] bg-[#09111c] border-b border-[#213248] px-3 flex items-center justify-between text-[11px] text-[#8DA0B4]">
        {/* Left Tools: Selection Arrow, Split, Delete, Duplicate, Add Scene, Marker, Zoom Presets */}
        <div className="flex items-center gap-1.5">
          {/* Select Tool */}
          <button
            onClick={() => setActiveTool("select")}
            className={`p-1.5 rounded-lg transition ${
              activeTool === "select"
                ? "bg-[#259CFF] text-white shadow-sm"
                : "hover:bg-[#162234] hover:text-white text-[#8DA0B4]"
            }`}
            title="Selection Tool (V)"
          >
            <MousePointer className="w-3.5 h-3.5" />
          </button>

          {/* Split Tool */}
          <button
            onClick={() => {
              setActiveTool("split");
              if (onSplitScene) onSplitScene();
            }}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg transition ${
              activeTool === "split"
                ? "bg-[#259CFF] text-white"
                : "hover:bg-[#162234] hover:text-white text-[#8DA0B4]"
            }`}
            title="Split Scene at Playhead (S)"
          >
            <Scissors className="w-3.5 h-3.5" />
            <span className="font-semibold">Split</span>
          </button>

          {/* Delete Tool */}
          <button
            onClick={() => {
              if (onDeleteScene) onDeleteScene();
            }}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-[#162234] hover:text-[#ef4444] text-[#8DA0B4] transition"
            title="Delete Selected Clip (Del)"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="font-semibold">Delete</span>
          </button>

          {/* Duplicate Tool */}
          <button
            onClick={() => {
              if (onDuplicateScene) onDuplicateScene();
            }}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-[#162234] hover:text-white text-[#8DA0B4] transition"
            title="Duplicate Selected Clip (Ctrl+D)"
          >
            <Copy className="w-3.5 h-3.5" />
            <span className="font-semibold">Duplicate</span>
          </button>

          {/* Add Scene Tool */}
          {onAddScene && (
            <button
              onClick={onAddScene}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#259CFF]/15 hover:bg-[#259CFF]/25 text-[#259CFF] border border-[#259CFF]/40 transition"
              title="Add New Scene (+)"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="font-semibold">Add Scene</span>
            </button>
          )}

          {/* Add Marker Tool */}
          <button
            onClick={handleCreateMarker}
            className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-[#162234] hover:text-[#259CFF] text-[#8DA0B4] border border-[#213248] transition"
            title="Add Marker at Playhead (M)"
          >
            <Bookmark className="w-3 h-3 text-[#259CFF]" />
            <span className="font-semibold">Marker</span>
          </button>

          <div className="h-4 w-[1px] bg-[#213248] mx-1" />

          {/* Zoom Presets & Slider */}
          <div className="flex items-center gap-1.5">
            <ZoomIn className="w-3.5 h-3.5 text-[#8DA0B4]" />
            <span className="font-semibold">Zoom</span>
            <div className="flex items-center bg-[#070e17] rounded-md border border-[#213248] p-0.5 text-[10px]">
              {[
                { label: "Fit", val: 1.0 },
                { label: "50%", val: 0.5 },
                { label: "100%", val: 1.0 },
                { label: "200%", val: 2.0 },
              ].map((p) => (
                <button
                  key={p.label}
                  onClick={() => setZoomLevel(p.val)}
                  className={`px-1.5 py-0.5 rounded transition ${
                    zoomLevel === p.val
                      ? "bg-[#259CFF] text-white font-bold"
                      : "text-[#8DA0B4] hover:text-white"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <input
              type="range"
              min="0.25"
              max="3.5"
              step="0.05"
              value={zoomLevel}
              onChange={(e) => setZoomLevel(parseFloat(e.target.value))}
              className="w-16 h-1 bg-[#213248] rounded-lg cursor-pointer"
            />
          </div>
        </div>

        {/* Right Tools: Volume Slider, Duration, Grid Snap, Maximize */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Headphones className="w-3.5 h-3.5 text-[#8DA0B4]" />
            <input
              type="range"
              min="0"
              max="100"
              value={timelineVolume}
              onChange={(e) => setTimelineVolume(Number(e.target.value))}
              className="w-16 h-1 bg-[#213248] rounded-lg cursor-pointer"
              title={`Master Audio Volume: ${timelineVolume}%`}
            />
          </div>

          <div className="font-mono font-bold text-[12px] text-white">
            {formatPreciseTime(safeDuration)}
          </div>

          <button
            onClick={() => setIsSnapping(!isSnapping)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg border transition text-[11px] ${
              isSnapping
                ? "bg-[#259CFF]/20 border-[#259CFF] text-[#259CFF]"
                : "border-[#213248] text-[#8DA0B4] hover:text-white"
            }`}
            title="Toggle Snapping (N)"
          >
            <Grid className="w-3.5 h-3.5" />
            <span className="font-semibold">Snapping</span>
          </button>

          <button
            className="p-1.5 rounded-lg border border-[#213248] text-[#8DA0B4] hover:text-white hover:bg-[#162234] transition"
            title="Maximize Timeline"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* TRACKS CONTAINER */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* FIXED TRACK HEADERS (Left Column) */}
        <div
          style={{ width: `${HEADER_WIDTH}px` }}
          className="bg-[#0A131F] border-r border-[#213248] flex flex-col shrink-0 z-20 select-none text-[11px]"
        >
          {/* Ruler spacer / Marker header */}
          <div className="h-[24px] border-b border-[#213248] bg-[#070e17] px-2 flex items-center justify-between text-[#8DA0B4] text-[10px]">
            <span className="font-mono">RULER</span>
            <Bookmark className="w-3 h-3 text-[#259CFF]" />
          </div>

          {/* 1. Scenes Track Header */}
          <div className="h-[36px] px-2.5 border-b border-[#213248] flex items-center justify-between text-white font-semibold">
            <div className="flex items-center gap-1.5 truncate">
              <Layers className="w-3.5 h-3.5 text-[#259CFF]" />
              <span className="truncate">Scenes</span>
            </div>
            <div className="flex items-center gap-1 text-[#8DA0B4]">
              <button onClick={() => toggleTrackProperty("scenes", "visible")} title="Toggle Visibility">
                {trackConfigs.scenes.visible ? <Eye className="w-3 h-3 hover:text-white cursor-pointer" /> : <EyeOff className="w-3 h-3 text-red-400 cursor-pointer" />}
              </button>
              <button onClick={() => toggleTrackProperty("scenes", "locked")} title="Lock Track">
                {trackConfigs.scenes.locked ? <Lock className="w-3 h-3 text-yellow-400 cursor-pointer" /> : <Unlock className="w-3 h-3 hover:text-white cursor-pointer" />}
              </button>
            </div>
          </div>

          {/* 2. Video Track Header */}
          <div className="h-[34px] px-2.5 border-b border-[#213248] flex items-center justify-between text-white font-semibold">
            <div className="flex items-center gap-1.5 truncate">
              <Film className="w-3.5 h-3.5 text-[#38bdf8]" />
              <span className="truncate">Video</span>
            </div>
            <div className="flex items-center gap-1 text-[#8DA0B4]">
              <button onClick={() => toggleTrackProperty("video", "visible")} title="Toggle Visibility">
                {trackConfigs.video.visible ? <Eye className="w-3 h-3 hover:text-white cursor-pointer" /> : <EyeOff className="w-3 h-3 text-red-400 cursor-pointer" />}
              </button>
              <button onClick={() => toggleTrackProperty("video", "locked")} title="Lock Track">
                {trackConfigs.video.locked ? <Lock className="w-3 h-3 text-yellow-400 cursor-pointer" /> : <Unlock className="w-3 h-3 hover:text-white cursor-pointer" />}
              </button>
            </div>
          </div>

          {/* 3. Characters Track Header */}
          <div className="h-[34px] px-2.5 border-b border-[#213248] flex items-center justify-between text-white font-semibold">
            <div className="flex items-center gap-1.5 truncate">
              <Users className="w-3.5 h-3.5 text-[#765CFF]" />
              <span className="truncate">Characters</span>
            </div>
            <div className="flex items-center gap-1 text-[#8DA0B4]">
              <button onClick={() => toggleTrackProperty("characters", "visible")} title="Toggle Visibility">
                {trackConfigs.characters.visible ? <Eye className="w-3 h-3 hover:text-white cursor-pointer" /> : <EyeOff className="w-3 h-3 text-red-400 cursor-pointer" />}
              </button>
              <button onClick={() => toggleTrackProperty("characters", "locked")} title="Lock Track">
                {trackConfigs.characters.locked ? <Lock className="w-3 h-3 text-yellow-400 cursor-pointer" /> : <Unlock className="w-3 h-3 hover:text-white cursor-pointer" />}
              </button>
            </div>
          </div>

          {/* 4. Text / Captions Track Header */}
          <div className="h-[34px] px-2.5 border-b border-[#213248] flex items-center justify-between text-white font-semibold">
            <div className="flex items-center gap-1.5 truncate">
              <Type className="w-3.5 h-3.5 text-[#28D7A0]" />
              <span className="truncate">Text / Captions</span>
            </div>
            <div className="flex items-center gap-1 text-[#8DA0B4]">
              <button onClick={() => toggleTrackProperty("captions", "visible")} title="Toggle Visibility">
                {trackConfigs.captions.visible ? <Eye className="w-3 h-3 hover:text-white cursor-pointer" /> : <EyeOff className="w-3 h-3 text-red-400 cursor-pointer" />}
              </button>
              <button onClick={() => toggleTrackProperty("captions", "locked")} title="Lock Track">
                {trackConfigs.captions.locked ? <Lock className="w-3 h-3 text-yellow-400 cursor-pointer" /> : <Unlock className="w-3 h-3 hover:text-white cursor-pointer" />}
              </button>
            </div>
          </div>

          {/* 5. Audio Track Header */}
          <div className="h-[34px] px-2.5 border-b border-[#213248] flex items-center justify-between text-white font-semibold">
            <div className="flex items-center gap-1.5 truncate">
              <AudioLines className="w-3.5 h-3.5 text-[#259CFF]" />
              <span className="truncate">Audio (Voice)</span>
            </div>
            <div className="flex items-center gap-1 text-[#8DA0B4]">
              <button onClick={() => toggleTrackProperty("audio", "muted")} title="Mute Track">
                {trackConfigs.audio.muted ? <VolumeX className="w-3 h-3 text-red-400 cursor-pointer" /> : <Volume2 className="w-3 h-3 hover:text-white cursor-pointer" />}
              </button>
              <button onClick={() => toggleTrackProperty("audio", "locked")} title="Lock Track">
                {trackConfigs.audio.locked ? <Lock className="w-3 h-3 text-yellow-400 cursor-pointer" /> : <Unlock className="w-3 h-3 hover:text-white cursor-pointer" />}
              </button>
            </div>
          </div>

          {/* 6. Music Track Header */}
          <div className="h-[34px] px-2.5 border-b border-[#213248] flex items-center justify-between text-white font-semibold">
            <div className="flex items-center gap-1.5 truncate">
              <Music className="w-3.5 h-3.5 text-[#a855f7]" />
              <span className="truncate">Music</span>
            </div>
            <div className="flex items-center gap-1 text-[#8DA0B4]">
              <button onClick={() => toggleTrackProperty("music", "muted")} title="Mute Track">
                {trackConfigs.music.muted ? <VolumeX className="w-3 h-3 text-red-400 cursor-pointer" /> : <Volume2 className="w-3 h-3 hover:text-white cursor-pointer" />}
              </button>
              <button onClick={() => toggleTrackProperty("music", "locked")} title="Lock Track">
                {trackConfigs.music.locked ? <Lock className="w-3 h-3 text-yellow-400 cursor-pointer" /> : <Unlock className="w-3 h-3 hover:text-white cursor-pointer" />}
              </button>
            </div>
          </div>
        </div>

        {/* SCROLLABLE TRACK CONTENT */}
        <div
          ref={trackContainerRef}
          onPointerDown={handlePointerDownContainer}
          onPointerMove={handlePointerMoveContainer}
          onPointerUp={handlePointerUpContainer}
          className="flex-1 flex flex-col overflow-x-auto overflow-y-hidden relative bg-[#07101A] cursor-crosshair"
        >
          {/* INNER SCALED TRACK CANVAS */}
          <div
            style={{ width: `${Math.max(100, 100 * zoomLevel)}%` }}
            className="h-full flex flex-col relative min-w-full"
          >
            {/* TIME RULER & MARKERS */}
            <div
              className="h-[24px] bg-[#0A1422] border-b border-[#213248] relative flex items-center select-none shrink-0"
              onDoubleClick={(e) => {
                const clickTime = clientXToTime(e.clientX);
                if (onAddMarker) onAddMarker(clickTime);
              }}
            >
              {/* Ticks */}
              {rulerTicks.map((tick, i) => {
                const leftPercent = (tick.time / safeDuration) * 100;
                return (
                  <div
                    key={i}
                    className="absolute top-0 bottom-0 flex flex-col justify-end pointer-events-none"
                    style={{ left: `${leftPercent}%` }}
                  >
                    <span className="text-[9px] font-mono text-[#8DA0B4] px-1 transform -translate-x-1/2 select-none">
                      {tick.label}
                    </span>
                    <div className={`w-[1px] bg-[#213248] ${tick.isMajor ? "h-2" : "h-1"}`} />
                  </div>
                );
              })}

              {/* Blueprint Markers */}
              {blueprint.markers?.map((marker) => {
                const leftPercent = (marker.time / safeDuration) * 100;
                const isSelected = selectedItemIds.has(`marker:${marker.id}`);
                return (
                  <div
                    key={marker.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSeek(marker.time);
                      handleItemClick(`marker:${marker.id}`, e);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      if (onDeleteMarker) onDeleteMarker(marker.id);
                    }}
                    style={{ left: `${leftPercent}%` }}
                    className="absolute top-0.5 -translate-x-1/2 cursor-pointer z-40 group"
                    title={`Marker: ${marker.label} (${formatPreciseTime(marker.time)}) - Right-click to delete`}
                  >
                    <div
                      style={{ backgroundColor: marker.color || "#259CFF" }}
                      className={`w-3 h-3 rotate-45 rounded-sm border ${
                        isSelected ? "border-white ring-2 ring-white" : "border-black/50"
                      } shadow-sm`}
                    />
                    <div className="opacity-0 group-hover:opacity-100 transition absolute top-4 left-1/2 -translate-x-1/2 bg-black/90 text-white text-[9px] px-1.5 py-0.5 rounded shadow whitespace-nowrap pointer-events-none z-50">
                      {marker.label}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* TRACK 1: SCENES (h-[36px] preserved for tests) */}
            <div className={`h-[36px] border-b border-[#213248]/60 relative flex items-center bg-[#07111c] shrink-0 ${!trackConfigs.scenes.visible ? "opacity-20 pointer-events-none" : ""}`}>
              {blueprint.scenes.map((sc, i) => {
                const left = (sc.start / safeDuration) * 100;
                const width = Math.max(0.8, ((sc.end - sc.start) / safeDuration) * 100);
                const isSelected = sc.id === selectedSceneId || selectedItemIds.has(`scene:${sc.id}`);

                return (
                  <div
                    key={sc.id}
                    onClick={(e) => {
                      handleItemClick(`scene:${sc.id}`, e);
                      onSeek(sc.start);
                    }}
                    onPointerDown={(e) => {
                      if (trackConfigs.scenes.locked) return;
                      // Don't initiate clip drag if clicked on trim handles
                      const target = e.target as HTMLElement;
                      if (target.classList.contains("trim-handle")) return;

                      dragInteraction.current = {
                        type: "move-scene",
                        itemId: sc.id,
                        originX: clientXToTime(e.clientX),
                        originStart: sc.start,
                        originEnd: sc.end,
                        initialDuration: sc.end - sc.start,
                      };
                    }}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    className={`timeline-clip absolute h-[30px] rounded-lg border flex items-center justify-between px-2 cursor-pointer transition overflow-hidden text-[11px] font-semibold text-white group ${
                      isSelected
                        ? "bg-[#1e40af] border-[#259CFF] ring-2 ring-[#259CFF]/50 shadow-lg shadow-[#259CFF]/25 z-10"
                        : "bg-[#172554] border-[#1e3a8a] hover:border-[#3b82f6]"
                    }`}
                    title={`${i + 1}. ${sc.title} (${sc.start.toFixed(1)}s - ${sc.end.toFixed(1)}s)`}
                  >
                    {/* Left Trim Handle */}
                    {!trackConfigs.scenes.locked && (
                      <div
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          dragInteraction.current = {
                            type: "trim-scene-start",
                            itemId: sc.id,
                            originX: clientXToTime(e.clientX),
                            originStart: sc.start,
                            originEnd: sc.end,
                            initialDuration: sc.end - sc.start,
                          };
                        }}
                        className="trim-handle absolute left-0 top-0 bottom-0 w-2 hover:bg-[#259CFF] cursor-col-resize opacity-0 group-hover:opacity-100 transition z-20"
                        title="Trim In Point"
                      />
                    )}

                    {/* Clip Content */}
                    <div className="flex items-center gap-1.5 truncate pointer-events-none">
                      <span className="px-1 py-0.5 rounded bg-black/40 text-[10px] font-mono shrink-0">
                        {i + 1}
                      </span>
                      <span className="truncate">{sc.title}</span>
                    </div>

                    {/* Right Trim Handle */}
                    {!trackConfigs.scenes.locked && (
                      <div
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          dragInteraction.current = {
                            type: "trim-scene-end",
                            itemId: sc.id,
                            originX: clientXToTime(e.clientX),
                            originStart: sc.start,
                            originEnd: sc.end,
                            initialDuration: sc.end - sc.start,
                          };
                        }}
                        className="trim-handle absolute right-0 top-0 bottom-0 w-2 hover:bg-[#259CFF] cursor-col-resize opacity-0 group-hover:opacity-100 transition z-20"
                        title="Trim Out Point"
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {/* TRACK 2: VIDEO (Filmstrip) */}
            <div className={`h-[34px] border-b border-[#213248]/60 relative flex items-center bg-[#060d17] shrink-0 ${!trackConfigs.video.visible ? "opacity-20 pointer-events-none" : ""}`}>
              {blueprint.scenes.map((sc) => {
                const left = (sc.start / safeDuration) * 100;
                const width = Math.max(0.8, ((sc.end - sc.start) / safeDuration) * 100);
                return (
                  <div
                    key={sc.id}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    className="absolute h-[28px] rounded-md bg-[#0f172a] border border-[#1e293b] flex items-center px-1 overflow-hidden"
                  >
                    <div className="flex items-center gap-1 opacity-70">
                      <Film className="w-3 h-3 text-[#38bdf8] shrink-0" />
                      <span className="text-[10px] text-[#94a3b8] font-mono truncate">
                        {sc.background?.assetId || "scene"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* TRACK 3: CHARACTERS */}
            <div className={`h-[34px] border-b border-[#213248]/60 relative flex items-center bg-[#07111c] shrink-0 ${!trackConfigs.characters.visible ? "opacity-20 pointer-events-none" : ""}`}>
              {blueprint.scenes.map((sc) => {
                if (!sc.characters || sc.characters.length === 0) return null;
                const left = (sc.start / safeDuration) * 100;
                const width = Math.max(0.8, ((sc.end - sc.start) / safeDuration) * 100);
                const charNames = sc.characters.map((c) => c.id).join(" + ");

                return (
                  <div
                    key={sc.id + "_char"}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    className="absolute h-[28px] rounded-lg bg-[#581c87] border border-[#7e22ce] text-white flex items-center gap-1.5 px-2 text-[11px] font-semibold overflow-hidden shadow-sm"
                    title={`Characters: ${charNames}`}
                  >
                    <span className="text-[11px]">⭐</span>
                    <span className="truncate capitalize">{charNames}</span>
                  </div>
                );
              })}
            </div>

            {/* TRACK 4: TEXT / CAPTIONS */}
            <div className={`h-[34px] border-b border-[#213248]/60 relative flex items-center bg-[#060d17] shrink-0 ${!trackConfigs.captions.visible ? "opacity-20 pointer-events-none" : ""}`}>
              {blueprint.captions?.map((cap) => {
                const left = (cap.start / safeDuration) * 100;
                const width = Math.max(0.8, ((cap.end - cap.start) / safeDuration) * 100);
                const isActive = currentTime >= cap.start && currentTime <= cap.end;
                const isSelected = selectedItemIds.has(`caption:${cap.id}`);

                return (
                  <div
                    key={cap.id}
                    onClick={(e) => {
                      handleItemClick(`caption:${cap.id}`, e);
                      onSeek(cap.start);
                    }}
                    onPointerDown={(e) => {
                      if (trackConfigs.captions.locked) return;
                      const target = e.target as HTMLElement;
                      if (target.classList.contains("trim-handle")) return;

                      dragInteraction.current = {
                        type: "move-caption",
                        itemId: cap.id || "",
                        originX: clientXToTime(e.clientX),
                        originStart: cap.start,
                        originEnd: cap.end,
                        initialDuration: cap.end - cap.start,
                      };
                    }}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    className={`timeline-clip absolute h-[28px] rounded-lg border text-white flex items-center justify-between px-2 text-[11px] font-semibold overflow-hidden shadow-sm transition cursor-pointer group ${
                      isSelected || isActive
                        ? "bg-[#059669] border-[#34d399] ring-2 ring-[#34d399]/50 shadow-md z-10"
                        : "bg-[#065f46] border-[#059669] hover:border-[#10b981]"
                    }`}
                    title={cap.text}
                  >
                    {/* Caption Trim In */}
                    {!trackConfigs.captions.locked && (
                      <div
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          dragInteraction.current = {
                            type: "trim-caption-start",
                            itemId: cap.id || "",
                            originX: clientXToTime(e.clientX),
                            originStart: cap.start,
                            originEnd: cap.end,
                            initialDuration: cap.end - cap.start,
                          };
                        }}
                        className="trim-handle absolute left-0 top-0 bottom-0 w-2 hover:bg-[#34d399] cursor-col-resize opacity-0 group-hover:opacity-100 transition z-20"
                      />
                    )}

                    <div className="flex items-center gap-1.5 truncate pointer-events-none">
                      <span className="text-[10px] font-mono px-1 rounded bg-black/30">T</span>
                      <span className="truncate">{cap.text}</span>
                    </div>

                    {/* Caption Trim Out */}
                    {!trackConfigs.captions.locked && (
                      <div
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          dragInteraction.current = {
                            type: "trim-caption-end",
                            itemId: cap.id || "",
                            originX: clientXToTime(e.clientX),
                            originStart: cap.start,
                            originEnd: cap.end,
                            initialDuration: cap.end - cap.start,
                          };
                        }}
                        className="trim-handle absolute right-0 top-0 bottom-0 w-2 hover:bg-[#34d399] cursor-col-resize opacity-0 group-hover:opacity-100 transition z-20"
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {/* TRACK 5: AUDIO (Voice Waveform) */}
            <div className={`h-[34px] border-b border-[#213248]/60 relative flex items-center bg-[#07111c] shrink-0 ${trackConfigs.audio.muted ? "opacity-30" : ""}`}>
              <div className="absolute inset-0 flex items-center px-1">
                <div className="w-full h-[26px] bg-[#0369a1] rounded-lg border border-[#0284c7] relative overflow-hidden flex items-center">
                  <div className="w-full h-full flex items-center justify-between px-1 gap-0.5 opacity-90">
                    {Array.from({ length: 140 }).map((_, i) => {
                      const waveH = 20 + Math.sin(i * 0.3) * 35 + Math.sin(i * 1.5) * 40;
                      return (
                        <div
                          key={i}
                          style={{ height: `${Math.max(15, Math.min(100, waveH))}%` }}
                          className="flex-1 bg-[#bae6fd] rounded-full"
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* TRACK 6: MUSIC (Background Music Waveform) */}
            <div className={`h-[34px] border-b border-[#213248]/60 relative flex items-center bg-[#060d17] shrink-0 ${trackConfigs.music.muted ? "opacity-30" : ""}`}>
              <div className="absolute inset-0 flex items-center px-1">
                <div className="w-full h-[26px] bg-[#4c1d95] rounded-lg border border-[#6d28d9] relative overflow-hidden flex items-center px-2">
                  <span className="text-[10px] text-white font-medium truncate mr-2">
                    Background Music (Soft)
                  </span>
                  <div className="flex-1 h-full flex items-center justify-between gap-0.5 opacity-70">
                    {Array.from({ length: 90 }).map((_, i) => (
                      <div
                        key={i}
                        style={{ height: `${20 + Math.sin(i * 0.4) * 30}%` }}
                        className="flex-1 bg-[#e9d5ff] rounded-full"
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* VISUAL SNAP GUIDE LINE */}
            {activeSnapGuide !== null && (
              <div
                style={{ left: `${(activeSnapGuide / safeDuration) * 100}%` }}
                className="absolute top-0 bottom-0 w-[1px] bg-[#259CFF] shadow-[0_0_8px_#259CFF] pointer-events-none z-25"
              />
            )}

            {/* VERTICAL WHITE PLAYHEAD */}
            <div
              style={{ left: `${playheadPercent}%` }}
              className="absolute top-0 bottom-0 w-[2px] bg-white pointer-events-none z-30 shadow-lg shadow-black/80"
            >
              <div className="absolute -top-0 -translate-x-1/2 w-3.5 h-3.5 bg-white border-2 border-[#259CFF] rotate-45 rounded-sm shadow-md pointer-events-auto cursor-ew-resize" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
