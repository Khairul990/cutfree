/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Video Preview Player Component for CutFree Studio.
 * Dominating center preview with real compositor canvas, scrubber, and transport controls.
 */

import React, { useRef, useEffect, useState, useCallback } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  ChevronDown,
} from "lucide-react";
import { VideoBlueprint } from "../types/blueprint";
import { videoCompositor } from "../render/compositor";

export interface PreviewPlayerProps {
  blueprint: VideoBlueprint;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
  aspect: "16:9" | "9:16" | "1:1";
  onChangeAspect: (aspect: "16:9" | "9:16" | "1:1") => void;
  onNextScene?: () => void;
  onPrevScene?: () => void;
}

export const PreviewPlayer: React.FC<PreviewPlayerProps> = ({
  blueprint,
  currentTime,
  duration,
  isPlaying,
  onSeek,
  onTogglePlay,
  aspect,
  onChangeAspect,
  onNextScene,
  onPrevScene,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrubberRef = useRef<HTMLDivElement>(null);
  const isDraggingScrubber = useRef<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [aspectMenuOpen, setAspectMenuOpen] = useState<boolean>(false);

  const safeDuration = Math.max(0.1, duration);
  const progressPercent = Math.min(100, Math.max(0, (currentTime / safeDuration) * 100));

  // Render canvas frame on time/blueprint/aspect updates
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let targetW = 1920;
    let targetH = 1080;
    if (aspect === "9:16") {
      targetW = 1080;
      targetH = 1920;
    } else if (aspect === "1:1") {
      targetW = 1080;
      targetH = 1080;
    }

    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    videoCompositor.renderFrame(canvas, blueprint, currentTime, aspect === "9:16");
  }, [blueprint, currentTime, aspect]);

  // Format time to MM:SS.SS
  const formatTimecode = (sec: number) => {
    const s = Math.max(0, sec);
    const m = Math.floor(s / 60);
    const remainder = s % 60;
    const secWhole = Math.floor(remainder);
    const frac = Math.floor((remainder - secWhole) * 100);
    return `${String(m).padStart(2, "0")}:${String(secWhole).padStart(2, "0")}.${String(frac).padStart(2, "0")}`;
  };

  // Scrubber dragging
  const handleScrubberPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingScrubber.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateSeek(e);
  };

  const handleScrubberPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingScrubber.current) {
      updateSeek(e);
    }
  };

  const handleScrubberPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingScrubber.current) {
      isDraggingScrubber.current = false;
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  const updateSeek = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubberRef.current) return;
    const rect = scrubberRef.current.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(frac * safeDuration);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Determine aspect ratio class
  let aspectStyle = "aspect-video max-h-[56vh]";
  if (aspect === "9:16") {
    aspectStyle = "aspect-[9/16] max-h-[64vh]";
  } else if (aspect === "1:1") {
    aspectStyle = "aspect-square max-h-[58vh]";
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 flex flex-col items-center justify-center p-3 sm:p-5 bg-[#07101A] overflow-hidden select-none relative"
    >
      {/* Centered Video Canvas Container */}
      <div className="relative w-full max-w-[960px] flex flex-col items-center">
        {/* Canvas Frame */}
        <div
          className={`relative w-full ${aspectStyle} bg-[#020408] rounded-2xl overflow-hidden border border-[#213248] shadow-2xl flex items-center justify-center`}
        >
          <canvas
            ref={canvasRef}
            className="w-full h-full object-contain cursor-pointer"
            onClick={onTogglePlay}
          />
        </div>

        {/* Scrubber Bar */}
        <div
          ref={scrubberRef}
          onPointerDown={handleScrubberPointerDown}
          onPointerMove={handleScrubberPointerMove}
          onPointerUp={handleScrubberPointerUp}
          className="w-full h-5 flex items-center cursor-pointer group mt-2.5 px-0.5"
        >
          <div className="w-full h-1.5 bg-[#162234] rounded-full relative overflow-visible">
            {/* Filled progress bar */}
            <div
              className="h-full bg-[#259CFF] rounded-full relative transition-[width] duration-75"
              style={{ width: `${progressPercent}%` }}
            >
              {/* Draggable playhead thumb */}
              <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-3.5 h-3.5 rounded-full bg-[#259CFF] ring-4 ring-[#259CFF]/30 shadow-md group-hover:scale-125 transition-transform" />
            </div>
          </div>
        </div>

        {/* Transport Controls Bar */}
        <div className="w-full flex items-center justify-between mt-1 text-[#EEF4FB]">
          {/* Left / Center: Step back, Play/Pause circular button, Step forward, Volume */}
          <div className="flex items-center gap-3">
            {/* Previous Frame / Scene */}
            <button
              onClick={() => (onPrevScene ? onPrevScene() : onSeek(Math.max(0, currentTime - 1)))}
              className="p-1.5 rounded-lg text-[#8DA0B4] hover:text-white hover:bg-[#0F1C2A] transition"
              title="Previous Scene (Home / [)"
            >
              <SkipBack className="w-4 h-4 fill-current" />
            </button>

            {/* Play / Pause Circular Button */}
            <button
              onClick={onTogglePlay}
              className="w-10 h-10 rounded-full bg-[#259CFF] hover:bg-[#1d82d8] active:scale-95 text-white flex items-center justify-center shadow-lg shadow-[#259CFF]/30 transition"
              title={isPlaying ? "Pause (Space)" : "Play (Space)"}
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 fill-white text-white" />
              ) : (
                <Play className="w-4 h-4 fill-white text-white ml-0.5" />
              )}
            </button>

            {/* Next Frame / Scene */}
            <button
              onClick={() =>
                onNextScene ? onNextScene() : onSeek(Math.min(safeDuration, currentTime + 1))
              }
              className="p-1.5 rounded-lg text-[#8DA0B4] hover:text-white hover:bg-[#0F1C2A] transition"
              title="Next Scene (End / ])"
            >
              <SkipForward className="w-4 h-4 fill-current" />
            </button>

            {/* Volume / Mute Toggle */}
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="p-1.5 rounded-lg text-[#8DA0B4] hover:text-white hover:bg-[#0F1C2A] transition ml-1"
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            {/* Timecode display */}
            <div className="font-mono text-[12px] text-[#EEF4FB] ml-2 tracking-tight">
              <span className="text-white font-semibold">{formatTimecode(currentTime)}</span>
              <span className="text-[#8DA0B4] mx-1">/</span>
              <span className="text-[#8DA0B4]">{formatTimecode(safeDuration)}</span>
            </div>
          </div>

          {/* Right: Aspect Ratio Selector & Fullscreen */}
          <div className="flex items-center gap-2">
            {/* Aspect Ratio Dropdown */}
            <div className="relative">
              <button
                onClick={() => setAspectMenuOpen(!aspectMenuOpen)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#0F1C2A] border border-[#213248] text-[11px] font-bold text-white hover:border-[#259CFF] transition"
              >
                <span>{aspect}</span>
                <ChevronDown className="w-3 h-3 text-[#8DA0B4]" />
              </button>

              {aspectMenuOpen && (
                <div className="absolute right-0 bottom-full mb-1 w-28 bg-[#0C1724] border border-[#213248] rounded-xl shadow-2xl p-1 z-50 text-[11px]">
                  {(["16:9", "9:16", "1:1"] as const).map((asp) => (
                    <button
                      key={asp}
                      onClick={() => {
                        onChangeAspect(asp);
                        setAspectMenuOpen(false);
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg font-semibold transition ${
                        aspect === asp ? "bg-[#259CFF] text-white" : "text-[#8DA0B4] hover:bg-[#0F1C2A] hover:text-white"
                      }`}
                    >
                      {asp}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Fullscreen Toggle */}
            <button
              onClick={toggleFullscreen}
              className="p-1.5 rounded-lg text-[#8DA0B4] hover:text-white hover:bg-[#0F1C2A] transition"
              title="Toggle Fullscreen"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
