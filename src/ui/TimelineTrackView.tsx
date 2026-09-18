/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Multi-Track Timeline Component for CutFree Studio.
 */

import React, { useRef, useState, useCallback, useMemo } from "react";
import {
  Layers,
  Music,
  Type,
  User,
  Camera,
  Play,
  Pause,
  ZoomIn,
  ZoomOut,
  Magnet,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { VideoBlueprint, BlueprintScene } from "../types/blueprint";
import { formatTimecode, timeToFrame } from "../core/time";

export interface TimelineTrackViewProps {
  blueprint: VideoBlueprint;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
  onSelectScene: (sceneId: string) => void;
  selectedSceneId: string | null;
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
}) => {
  const [zoomLevel, setZoomLevel] = useState<number>(1.0); // 0.5x to 3.0x
  const [isSnapping, setIsSnapping] = useState<boolean>(true);
  const trackContainerRef = useRef<HTMLDivElement>(null);
  const isDraggingPlayhead = useRef<boolean>(false);

  const fps = blueprint.project.fps || 30;
  const safeDuration = Math.max(0.1, duration);

  // Snap points (scene starts, ends, segment bounds)
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
      const thresholdSec = (safeDuration / 1000) * 8; // ~8px snap radius
      for (const p of snapPoints) {
        if (Math.abs(time - p) <= thresholdSec) {
          return p;
        }
      }
      return Math.max(0, Math.min(safeDuration, time));
    },
    [isSnapping, safeDuration, snapPoints]
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    isDraggingPlayhead.current = true;
    updateSeekFromEvent(e);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isDraggingPlayhead.current) {
      updateSeekFromEvent(e);
    }
  };

  const handlePointerUp = () => {
    isDraggingPlayhead.current = false;
  };

  const updateSeekFromEvent = (e: React.PointerEvent) => {
    if (!trackContainerRef.current) return;
    const rect = trackContainerRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const rawTime = ratio * safeDuration;
    onSeek(snapTime(rawTime));
  };

  const progressPct = Math.min(100, Math.max(0, (currentTime / safeDuration) * 100));

  return (
    <div className="bg-[#0b1119] border-t border-[#202c3d] flex flex-col select-none text-[12px] h-[272px] shrink-0">
      {/* Timeline Controls Header */}
      <div className="h-10 border-b border-[#1e2740] px-4 flex items-center justify-between bg-[#0d141e]">
        <div className="flex items-center gap-3">
          <button
            onClick={onTogglePlay}
            className="w-8 h-8 rounded-lg bg-[#5b8dff] hover:bg-[#4a7cee] text-white flex items-center justify-center transition shadow-none cursor-pointer"
            title={isPlaying ? "Pause (Space)" : "Play (Space)"}
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 ml-0.5 fill-current" />}
          </button>

          <div className="font-mono text-[13px] font-bold text-white bg-[#111925] px-3 py-1 rounded-md border border-[#29374b]">
            {formatTimecode(currentTime, fps)} / {formatTimecode(safeDuration, fps, false)}
          </div>

          <span className="text-[11px] text-[#8d9bb0] font-semibold hidden sm:inline">
            Frame: {timeToFrame(currentTime, fps)} • {fps} FPS
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsSnapping(!isSnapping)}
            className={`px-2.5 py-1 rounded-md border font-semibold text-[11px] flex items-center gap-1 transition ${
              isSnapping ? "bg-[#1e293b] border-[#38bdf8] text-[#38bdf8]" : "bg-transparent border-[#232d47] text-[#5f6d82]"
            }`}
            title="Toggle Snapping"
          >
            <Magnet className="w-3.5 h-3.5" />
            <span>Snap</span>
          </button>

          <div className="h-4 w-px bg-[#1e2740] mx-1" />

          <button
            onClick={() => setZoomLevel((z) => Math.max(0.6, z - 0.2))}
            className="p-1.5 rounded-md hover:bg-[#151b2e] text-[#8d9cc2] hover:text-white"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-[11px] text-[#8d9cc2] font-mono w-9 text-center">{Math.round(zoomLevel * 100)}%</span>
          <button
            onClick={() => setZoomLevel((z) => Math.min(2.5, z + 0.2))}
            className="p-1.5 rounded-md hover:bg-[#151b2e] text-[#8d9cc2] hover:text-white"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Track Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Track Headers (Left column) */}
        <div className="w-36 shrink-0 bg-[#0d141e] border-r border-[#1e2740] flex flex-col justify-between py-1 text-[11px] font-bold text-[#8d9cc2]">
          <div className="h-9 px-3 flex items-center gap-2 border-b border-[#171f34]">
            <Layers className="w-3.5 h-3.5 text-[#5b8dff]" /> <span>Scenes</span>
          </div>
          <div className="h-8 px-3 flex items-center gap-2 border-b border-[#171f34]">
            <Music className="w-3.5 h-3.5 text-[#2dd4bf]" /> <span>Audio / VAD</span>
          </div>
          <div className="h-8 px-3 flex items-center gap-2 border-b border-[#171f34]">
            <Type className="w-3.5 h-3.5 text-[#fbbf24]" /> <span>Captions</span>
          </div>
          <div className="h-8 px-3 flex items-center gap-2 border-b border-[#171f34]">
            <User className="w-3.5 h-3.5 text-[#f472b6]" /> <span>Characters</span>
          </div>
          <div className="h-8 px-3 flex items-center gap-2">
            <Camera className="w-3.5 h-3.5 text-[#a78bfa]" /> <span>Camera</span>
          </div>
        </div>

        {/* Tracks Content (Scrollable Right column) */}
        <div
          ref={trackContainerRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="flex-1 relative overflow-x-auto overflow-y-hidden bg-[#080e16] cursor-crosshair"
        >
          {/* Zoom Wrapper */}
          <div style={{ width: `${100 * zoomLevel}%`, minWidth: "100%", height: "100%" }} className="relative">
            {/* Playhead Indicator */}
            <div
              className="absolute top-0 bottom-0 z-30 pointer-events-none"
              style={{ left: `${progressPct}%` }}
            >
              <div className="w-px h-full bg-[#ef4444]" />
              <div className="w-3 h-3 bg-[#ef4444] rounded-full -ml-1.5 -mt-1 shadow-md shadow-red-500/50" />
            </div>

            {/* TRACK 1: SCENES */}
            <div className="h-9 border-b border-[#171f34] relative bg-[#0b1119]">
              {blueprint.scenes.map((scene, idx) => {
                const left = (scene.start / safeDuration) * 100;
                const width = ((scene.end - scene.start) / safeDuration) * 100;
                const isSelected = selectedSceneId === scene.id;

                return (
                  <div
                    key={scene.id || idx}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectScene(scene.id);
                    }}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    className={`absolute top-1 bottom-1 rounded-md px-2 flex items-center justify-between border cursor-pointer transition truncate ${
                      isSelected
                        ? "bg-[#5b8dff]/30 border-[#5b8dff] text-white font-bold"
                        : "bg-[#1e293b]/70 border-[#334155] text-[#cbd5e1] hover:bg-[#1e293b]"
                    }`}
                  >
                    <span className="truncate text-[10.5px]">
                      {idx + 1}. {scene.title || scene.purpose || `Scene ${idx + 1}`}
                    </span>
                    <span className="text-[9px] text-[#94a3b8] font-mono shrink-0 ml-1">
                      {(scene.end - scene.start).toFixed(1)}s
                    </span>
                  </div>
                );
              })}
            </div>

            {/* TRACK 2: AUDIO & SEGMENTS (Continuous Speech / Pause) */}
            <div className="h-8 border-b border-[#171f34] relative bg-[#060913]">
              {blueprint.segments.map((seg, idx) => {
                const left = (seg.start / safeDuration) * 100;
                const width = ((seg.end - seg.start) / safeDuration) * 100;
                const isPause = seg.type === "pause";

                return (
                  <div
                    key={seg.id || idx}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    className={`absolute top-1 bottom-1 rounded border truncate text-[9.5px] px-1.5 flex items-center ${
                      isPause
                        ? "bg-[#334155]/20 border-[#334155]/40 text-[#64748b]"
                        : "bg-[#2dd4bf]/15 border-[#2dd4bf]/40 text-[#5eead4]"
                    }`}
                    title={`${seg.type}: ${seg.start.toFixed(2)}s - ${seg.end.toFixed(2)}s ${seg.text ? `(${seg.text})` : ""}`}
                  >
                    {isPause ? "⏸️" : "🎙️"} {seg.text || seg.type}
                  </div>
                );
              })}
            </div>

            {/* TRACK 3: CAPTIONS */}
            <div className="h-8 border-b border-[#171f34] relative bg-[#090d1c]">
              {blueprint.captions.map((cap, idx) => {
                const left = (cap.start / safeDuration) * 100;
                const width = ((cap.end - cap.start) / safeDuration) * 100;

                return (
                  <div
                    key={cap.id || idx}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    className="absolute top-1 bottom-1 rounded bg-[#fbbf24]/15 border border-[#fbbf24]/40 text-[#fde047] text-[9.5px] px-1.5 flex items-center truncate"
                    title={cap.text}
                  >
                    💬 {cap.text}
                  </div>
                );
              })}
            </div>

            {/* TRACK 4: CHARACTERS */}
            <div className="h-8 border-b border-[#171f34] relative bg-[#060913]">
              {blueprint.scenes.map((scene, idx) => {
                if (!scene.characters || scene.characters.length === 0) return null;
                const left = (scene.start / safeDuration) * 100;
                const width = ((scene.end - scene.start) / safeDuration) * 100;

                return (
                  <div
                    key={`char_${scene.id}_${idx}`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    className="absolute top-1 bottom-1 rounded bg-[#f472b6]/15 border border-[#f472b6]/40 text-[#fbcfe8] text-[9.5px] px-1.5 flex items-center gap-1 truncate"
                  >
                    👤 {scene.characters.map((c) => c.id).join(", ")}
                  </div>
                );
              })}
            </div>

            {/* TRACK 5: CAMERA PRESETS */}
            <div className="h-8 relative bg-[#090d1c]">
              {blueprint.scenes.map((scene, idx) => {
                const preset = scene.camera?.preset || "static";
                const left = (scene.start / safeDuration) * 100;
                const width = ((scene.end - scene.start) / safeDuration) * 100;

                return (
                  <div
                    key={`cam_${scene.id}_${idx}`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    className="absolute top-1 bottom-1 rounded bg-[#a78bfa]/15 border border-[#a78bfa]/40 text-[#ddd6fe] text-[9.5px] px-1.5 flex items-center gap-1 truncate font-mono"
                  >
                    🎥 {preset}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
