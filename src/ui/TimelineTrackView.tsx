/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Multi-Track Timeline Component for CutFree Studio.
 * Matches exact layout, styling, and 6 tracks from design specification:
 * 1. Scenes
 * 2. Video (filmstrip)
 * 3. Characters
 * 4. Text / Captions
 * 5. Audio (voice waveform)
 * 6. Music (soft background waveform)
 */

import React, { useRef, useState, useCallback, useMemo } from "react";
import {
  MousePointer,
  Scissors,
  Trash2,
  Copy,
  ZoomIn,
  Headphones,
  Grid,
  Maximize2,
  Eye,
  EyeOff,
  Volume2,
  VolumeX,
  Lock,
  Film,
  Users,
  Type,
  AudioLines,
  Music,
  Layers,
} from "lucide-react";
import { VideoBlueprint, BlueprintScene } from "../types/blueprint";

export interface TimelineTrackViewProps {
  blueprint: VideoBlueprint;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
  onSelectScene: (sceneId: string) => void;
  selectedSceneId: string | null;
  onSplitScene?: () => void;
  onDeleteScene?: () => void;
  onDuplicateScene?: () => void;
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
  onSplitScene,
  onDeleteScene,
  onDuplicateScene,
}) => {
  const [zoomLevel, setZoomLevel] = useState<number>(1.0); // 0.5x to 3.0x
  const [isSnapping, setIsSnapping] = useState<boolean>(true);
  const [activeTool, setActiveTool] = useState<"select" | "split">("select");
  const [timelineVolume, setTimelineVolume] = useState<number>(85);
  const trackContainerRef = useRef<HTMLDivElement>(null);
  const isDraggingPlayhead = useRef<boolean>(false);

  const safeDuration = Math.max(0.1, duration);
  const playheadPercent = Math.min(100, Math.max(0, (currentTime / safeDuration) * 100));

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

  // Generate ruler ticks (every 30s or scaled by zoom)
  const rulerTicks = useMemo(() => {
    const ticks: { time: number; label: string }[] = [];
    const step = 30; // 30 seconds interval
    for (let t = 0; t <= safeDuration; t += step) {
      ticks.push({ time: t, label: formatTimecode(t) });
    }
    // ensure end marker is present
    if (ticks.length > 0 && Math.abs(ticks[ticks.length - 1].time - safeDuration) > 10) {
      ticks.push({ time: safeDuration, label: formatTimecode(safeDuration) });
    }
    return ticks;
  }, [safeDuration]);

  // Snapping logic
  const snapPoints = useMemo(() => {
    const points = new Set<number>();
    points.add(0);
    points.add(safeDuration);
    blueprint.scenes.forEach((s) => {
      points.add(s.start);
      points.add(s.end);
    });
    blueprint.segments.forEach((seg) => {
      points.add(seg.start);
      points.add(seg.end);
    });
    return Array.from(points).sort((a, b) => a - b);
  }, [blueprint, safeDuration]);

  const snapTime = useCallback(
    (time: number) => {
      if (!isSnapping) return Math.max(0, Math.min(safeDuration, time));
      const thresholdSec = 1.5 / zoomLevel;
      for (const p of snapPoints) {
        if (Math.abs(time - p) <= thresholdSec) {
          return p;
        }
      }
      return Math.max(0, Math.min(safeDuration, time));
    },
    [isSnapping, safeDuration, snapPoints, zoomLevel]
  );

  const updateSeekFromEvent = (e: React.PointerEvent) => {
    if (!trackContainerRef.current) return;
    const rect = trackContainerRef.current.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetTime = frac * safeDuration;
    onSeek(snapTime(targetTime));
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    isDraggingPlayhead.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateSeekFromEvent(e);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isDraggingPlayhead.current) {
      updateSeekFromEvent(e);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDraggingPlayhead.current) {
      isDraggingPlayhead.current = false;
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  // Fixed track header width
  const HEADER_WIDTH = 145;

  return (
    <div className="h-[260px] bg-[#0C1724] border-t border-[#213248] flex flex-col shrink-0 select-none z-20">
      {/* TIMELINE TOOLBAR */}
      <div className="h-[38px] bg-[#09111c] border-b border-[#213248] px-3 flex items-center justify-between text-[11px] text-[#8DA0B4]">
        {/* Left Tools: Selection Arrow, Split, Delete, Duplicate, Zoom */}
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
            onClick={onDeleteScene}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-[#162234] hover:text-[#ef4444] text-[#8DA0B4] transition"
            title="Delete Selected Clip (Del)"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="font-semibold">Delete</span>
          </button>

          {/* Duplicate Tool */}
          <button
            onClick={onDuplicateScene}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-[#162234] hover:text-white text-[#8DA0B4] transition"
            title="Duplicate Selected Clip (Ctrl+D)"
          >
            <Copy className="w-3.5 h-3.5" />
            <span className="font-semibold">Duplicate</span>
          </button>

          <div className="h-4 w-[1px] bg-[#213248] mx-1" />

          {/* Zoom Slider */}
          <div className="flex items-center gap-1.5">
            <ZoomIn className="w-3.5 h-3.5 text-[#8DA0B4]" />
            <span className="font-semibold">Zoom</span>
            <input
              type="range"
              min="0.5"
              max="2.5"
              step="0.1"
              value={zoomLevel}
              onChange={(e) => setZoomLevel(parseFloat(e.target.value))}
              className="w-20 h-1 bg-[#213248] rounded-lg cursor-pointer"
            />
          </div>
        </div>

        {/* Right Tools: Headphone, Volume Slider, Duration, Grid Snap, Fullscreen */}
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
            className={`p-1.5 rounded-lg border transition ${
              isSnapping
                ? "bg-[#259CFF]/20 border-[#259CFF] text-[#259CFF]"
                : "border-[#213248] text-[#8DA0B4] hover:text-white"
            }`}
            title="Toggle Snapping (N)"
          >
            <Grid className="w-3.5 h-3.5" />
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
          {/* Ruler spacer */}
          <div className="h-[22px] border-b border-[#213248] bg-[#070e17]" />

          {/* 1. Scenes Track Header */}
          <div className="h-[36px] px-2.5 border-b border-[#213248] flex items-center justify-between text-white font-semibold">
            <div className="flex items-center gap-1.5 truncate">
              <Layers className="w-3.5 h-3.5 text-[#259CFF]" />
              <span className="truncate">Scenes</span>
            </div>
            <div className="flex items-center gap-1 text-[#8DA0B4]">
              <Eye className="w-3 h-3 hover:text-white cursor-pointer" />
              <Volume2 className="w-3 h-3 hover:text-white cursor-pointer" />
              <Lock className="w-3 h-3 hover:text-white cursor-pointer" />
            </div>
          </div>

          {/* 2. Video Track Header */}
          <div className="h-[34px] px-2.5 border-b border-[#213248] flex items-center justify-between text-white font-semibold">
            <div className="flex items-center gap-1.5 truncate">
              <Film className="w-3.5 h-3.5 text-[#38bdf8]" />
              <span className="truncate">Video</span>
            </div>
            <div className="flex items-center gap-1 text-[#8DA0B4]">
              <Eye className="w-3 h-3 hover:text-white cursor-pointer" />
              <Volume2 className="w-3 h-3 hover:text-white cursor-pointer" />
              <Lock className="w-3 h-3 hover:text-white cursor-pointer" />
            </div>
          </div>

          {/* 3. Characters Track Header */}
          <div className="h-[34px] px-2.5 border-b border-[#213248] flex items-center justify-between text-white font-semibold">
            <div className="flex items-center gap-1.5 truncate">
              <Users className="w-3.5 h-3.5 text-[#765CFF]" />
              <span className="truncate">Characters</span>
            </div>
            <div className="flex items-center gap-1 text-[#8DA0B4]">
              <Eye className="w-3 h-3 hover:text-white cursor-pointer" />
              <Volume2 className="w-3 h-3 hover:text-white cursor-pointer" />
              <Lock className="w-3 h-3 hover:text-white cursor-pointer" />
            </div>
          </div>

          {/* 4. Text / Captions Track Header */}
          <div className="h-[34px] px-2.5 border-b border-[#213248] flex items-center justify-between text-white font-semibold">
            <div className="flex items-center gap-1.5 truncate">
              <Type className="w-3.5 h-3.5 text-[#28D7A0]" />
              <span className="truncate">Text / Captions</span>
            </div>
            <div className="flex items-center gap-1 text-[#8DA0B4]">
              <Eye className="w-3 h-3 hover:text-white cursor-pointer" />
              <Volume2 className="w-3 h-3 hover:text-white cursor-pointer" />
              <Lock className="w-3 h-3 hover:text-white cursor-pointer" />
            </div>
          </div>

          {/* 5. Audio Track Header */}
          <div className="h-[34px] px-2.5 border-b border-[#213248] flex items-center justify-between text-white font-semibold">
            <div className="flex items-center gap-1.5 truncate">
              <AudioLines className="w-3.5 h-3.5 text-[#259CFF]" />
              <span className="truncate">Audio</span>
            </div>
            <div className="flex items-center gap-1 text-[#8DA0B4]">
              <Eye className="w-3 h-3 hover:text-white cursor-pointer" />
              <Volume2 className="w-3 h-3 hover:text-white cursor-pointer" />
              <Lock className="w-3 h-3 hover:text-white cursor-pointer" />
            </div>
          </div>

          {/* 6. Music Track Header */}
          <div className="h-[34px] px-2.5 border-b border-[#213248] flex items-center justify-between text-white font-semibold">
            <div className="flex items-center gap-1.5 truncate">
              <Music className="w-3.5 h-3.5 text-[#a855f7]" />
              <span className="truncate">Music</span>
            </div>
            <div className="flex items-center gap-1 text-[#8DA0B4]">
              <Eye className="w-3 h-3 hover:text-white cursor-pointer" />
              <Volume2 className="w-3 h-3 hover:text-white cursor-pointer" />
              <Lock className="w-3 h-3 hover:text-white cursor-pointer" />
            </div>
          </div>
        </div>

        {/* SCROLLABLE TRACK CONTENT */}
        <div
          ref={trackContainerRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="flex-1 flex flex-col overflow-x-auto overflow-y-hidden relative bg-[#07101A] cursor-crosshair"
        >
          {/* TIME RULER */}
          <div className="h-[22px] bg-[#0A1422] border-b border-[#213248] relative flex items-center select-none shrink-0">
            {rulerTicks.map((tick, i) => {
              const leftPercent = (tick.time / safeDuration) * 100;
              return (
                <div
                  key={i}
                  className="absolute top-0 bottom-0 flex flex-col justify-end"
                  style={{ left: `${leftPercent}%` }}
                >
                  <span className="text-[9px] font-mono text-[#8DA0B4] px-1 transform -translate-x-1/2">
                    {tick.label}
                  </span>
                  <div className="h-1.5 w-[1px] bg-[#213248]" />
                </div>
              );
            })}
          </div>

          {/* TRACK 1: SCENES */}
          <div className="h-[36px] border-b border-[#213248]/60 relative flex items-center bg-[#07111c] shrink-0">
            {blueprint.scenes.map((sc, i) => {
              const left = (sc.start / safeDuration) * 100;
              const width = Math.max(0.8, ((sc.end - sc.start) / safeDuration) * 100);
              const isSelected = sc.id === selectedSceneId;

              return (
                <div
                  key={sc.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectScene(sc.id);
                    onSeek(sc.start);
                  }}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  className={`absolute h-[30px] rounded-lg border flex items-center gap-1.5 px-2 cursor-pointer transition overflow-hidden text-[11px] font-semibold text-white ${
                    isSelected
                      ? "bg-[#1e40af] border-[#259CFF] ring-2 ring-[#259CFF]/40 shadow-lg shadow-[#259CFF]/25 z-10"
                      : "bg-[#172554] border-[#1e3a8a] hover:border-[#3b82f6]"
                  }`}
                  title={`${i + 1}. ${sc.title} (${sc.start.toFixed(1)}s - ${sc.end.toFixed(1)}s)`}
                >
                  {/* Thumbnail / index badge */}
                  <span className="px-1 py-0.5 rounded bg-black/40 text-[10px] font-mono shrink-0">
                    {i + 1}
                  </span>
                  <span className="truncate">{sc.title}</span>
                </div>
              );
            })}
          </div>

          {/* TRACK 2: VIDEO (Filmstrip) */}
          <div className="h-[34px] border-b border-[#213248]/60 relative flex items-center bg-[#060d17] shrink-0">
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
          <div className="h-[34px] border-b border-[#213248]/60 relative flex items-center bg-[#07111c] shrink-0">
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
          <div className="h-[34px] border-b border-[#213248]/60 relative flex items-center bg-[#060d17] shrink-0">
            {blueprint.captions?.map((cap) => {
              const left = (cap.start / safeDuration) * 100;
              const width = Math.max(0.8, ((cap.end - cap.start) / safeDuration) * 100);

              return (
                <div
                  key={cap.id}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  className="absolute h-[28px] rounded-lg bg-[#065f46] border border-[#059669] text-white flex items-center gap-1.5 px-2 text-[11px] font-semibold overflow-hidden shadow-sm"
                  title={cap.text}
                >
                  <span className="text-[10px] font-mono px-1 rounded bg-black/30">T</span>
                  <span className="truncate">{cap.text}</span>
                </div>
              );
            })}
          </div>

          {/* TRACK 5: AUDIO (Voice Waveform) */}
          <div className="h-[34px] border-b border-[#213248]/60 relative flex items-center bg-[#07111c] shrink-0">
            <div className="absolute inset-0 flex items-center px-1">
              <div className="w-full h-[26px] bg-[#0369a1] rounded-lg border border-[#0284c7] relative overflow-hidden flex items-center">
                {/* Visualized Waveform Simulation */}
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
          <div className="h-[34px] border-b border-[#213248]/60 relative flex items-center bg-[#060d17] shrink-0">
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

          {/* VERTICAL WHITE PLAYHEAD */}
          <div
            style={{ left: `${playheadPercent}%` }}
            className="absolute top-0 bottom-0 w-[2px] bg-white pointer-events-none z-30 shadow-lg shadow-black/80"
          >
            {/* Playhead Diamond Handle at Ruler */}
            <div className="absolute -top-0 -translate-x-1/2 w-3.5 h-3.5 bg-white border-2 border-[#259CFF] rotate-45 rounded-sm shadow-md" />
          </div>
        </div>
      </div>
    </div>
  );
};
