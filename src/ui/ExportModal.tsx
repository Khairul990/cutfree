/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Video Export Modal for CutFree Studio.
 * Drives real rendering engine with WebCodecs/MediaRecorder, progress tracking,
 * full production duration rendering, and direct video download.
 */

import React, { useState } from "react";
import {
  X,
  Upload,
  Download,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Film,
  Monitor,
  Smartphone,
  Square,
  Sparkles,
  Clock,
} from "lucide-react";
import { VideoBlueprint } from "../types/blueprint";
import { exportVideo, checkSupportedExportFormat } from "../render/exporter";

export interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  blueprint: VideoBlueprint;
  audioBuffer?: AudioBuffer;
  audioElement?: HTMLAudioElement | null;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  blueprint,
  audioBuffer,
  audioElement,
}) => {
  const [preset, setPreset] = useState<"landscape" | "shorts" | "square">("landscape");
  const [format, setFormat] = useState<"mp4" | "webm">("mp4");
  const [quality, setQuality] = useState<"1080p" | "720p">("1080p");
  const [exportMode, setExportMode] = useState<"full" | "preview">("full");
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [stage, setStage] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [exportedResult, setExportedResult] = useState<{
    url: string;
    fileName: string;
    sizeMB: number;
    durationSec: number;
  } | null>(null);

  if (!isOpen) return null;

  const handleStartExport = async () => {
    setIsExporting(true);
    setProgress(0);
    setStage("Initializing video pipeline...");
    setErrorMsg("");
    setExportedResult(null);

    let width = 1920;
    let height = 1080;
    let isShorts = false;

    if (preset === "shorts") {
      width = 1080;
      height = 1920;
      isShorts = true;
    } else if (preset === "square") {
      width = 1080;
      height = 1080;
    }

    if (quality === "720p") {
      width = Math.round(width * 0.6667);
      height = Math.round(height * 0.6667);
    }

    try {
      const blob = await exportVideo(
        blueprint,
        {
          width,
          height,
          fps: blueprint.project.fps || 30,
          format,
          isShorts,
          quality,
          audioBuffer,
          audioElement,
          mode: exportMode,
        },
        (p, msg) => {
          setProgress(p);
          setStage(msg);
        }
      );

      const url = URL.createObjectURL(blob);
      const codecInfo = checkSupportedExportFormat(format);
      const actualExt = codecInfo.format;
      const cleanTitle = (blueprint.project.title || "video").replace(/[^a-zA-Z0-9_-]/g, "_");
      const fileName = `${cleanTitle}_${preset}_${quality}_${exportMode}.${actualExt}`;
      const sizeMB = parseFloat((blob.size / (1024 * 1024)).toFixed(2));
      const targetDuration = exportMode === "preview"
        ? Math.min(30, blueprint.timeline.duration)
        : blueprint.timeline.duration;

      setExportedResult({
        url,
        fileName,
        sizeMB,
        durationSec: targetDuration,
      });
      setIsExporting(false);
    } catch (err: any) {
      console.error("Export failure:", err);
      setErrorMsg(err?.message || "Failed to render video. Please check settings.");
      setIsExporting(false);
    }
  };

  const totalDuration = blueprint.timeline.duration || 10;
  const activeDuration = exportMode === "preview" ? Math.min(30, totalDuration) : totalDuration;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-[560px] bg-[#0C1724] border border-[#213248] rounded-2xl shadow-2xl overflow-hidden text-[12px] flex flex-col">
        {/* Modal Header */}
        <div className="p-4 border-b border-[#213248] flex items-center justify-between bg-[#08101a]">
          <div className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-[#765CFF]" />
            <h2 className="font-extrabold text-white text-[15px]">Export Production Video</h2>
          </div>
          {!isExporting && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#8DA0B4] hover:text-white hover:bg-[#0F1C2A] transition"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4">
          {/* Export Mode Toggle: Full vs Preview */}
          <div>
            <label className="block text-[11px] font-bold text-[#8DA0B4] mb-2 uppercase tracking-wide">
              Export Scope
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setExportMode("full")}
                className={`p-3 rounded-xl border flex flex-col items-center gap-1 transition ${
                  exportMode === "full"
                    ? "bg-[#259CFF]/15 border-[#259CFF] text-white ring-2 ring-[#259CFF]/30"
                    : "bg-[#07101A] border-[#213248] text-[#8DA0B4] hover:text-white"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-[#259CFF]" />
                  <span className="font-extrabold text-[12px]">Full Production Export</span>
                </div>
                <span className="text-[10px] text-[#8DA0B4]">
                  Full duration ({totalDuration.toFixed(1)}s)
                </span>
              </button>

              <button
                type="button"
                onClick={() => setExportMode("preview")}
                className={`p-3 rounded-xl border flex flex-col items-center gap-1 transition ${
                  exportMode === "preview"
                    ? "bg-[#765CFF]/15 border-[#765CFF] text-white ring-2 ring-[#765CFF]/30"
                    : "bg-[#07101A] border-[#213248] text-[#8DA0B4] hover:text-white"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-[#765CFF]" />
                  <span className="font-extrabold text-[12px]">Quick Preview (30s)</span>
                </div>
                <span className="text-[10px] text-[#8DA0B4]">Fast test render</span>
              </button>
            </div>
          </div>

          {/* Preset Cards */}
          <div>
            <label className="block text-[11px] font-bold text-[#8DA0B4] mb-2 uppercase tracking-wide">
              Target Preset
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setPreset("landscape")}
                className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition ${
                  preset === "landscape"
                    ? "bg-[#259CFF]/15 border-[#259CFF] text-white ring-2 ring-[#259CFF]/30"
                    : "bg-[#07101A] border-[#213248] text-[#8DA0B4] hover:text-white"
                }`}
              >
                <Monitor className="w-5 h-5 text-[#259CFF]" />
                <span className="font-bold text-[11px]">Landscape</span>
                <span className="text-[10px] text-[#8DA0B4]">16:9 • 1080p</span>
              </button>

              <button
                type="button"
                onClick={() => setPreset("shorts")}
                className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition ${
                  preset === "shorts"
                    ? "bg-[#765CFF]/15 border-[#765CFF] text-white ring-2 ring-[#765CFF]/30"
                    : "bg-[#07101A] border-[#213248] text-[#8DA0B4] hover:text-white"
                }`}
              >
                <Smartphone className="w-5 h-5 text-[#765CFF]" />
                <span className="font-bold text-[11px]">Shorts / Reels</span>
                <span className="text-[10px] text-[#8DA0B4]">9:16 • Vertical</span>
              </button>

              <button
                type="button"
                onClick={() => setPreset("square")}
                className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition ${
                  preset === "square"
                    ? "bg-[#28D7A0]/15 border-[#28D7A0] text-white ring-2 ring-[#28D7A0]/30"
                    : "bg-[#07101A] border-[#213248] text-[#8DA0B4] hover:text-white"
                }`}
              >
                <Square className="w-5 h-5 text-[#28D7A0]" />
                <span className="font-bold text-[11px]">Square</span>
                <span className="text-[10px] text-[#8DA0B4]">1:1 • Post</span>
              </button>
            </div>
          </div>

          {/* Format & Quality */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-[#8DA0B4] mb-1">Container Format</label>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as any)}
                className="w-full bg-[#07101A] border border-[#213248] rounded-xl px-3 py-2 text-white outline-none"
              >
                <option value="mp4">MP4 (H.264 / AVC)</option>
                <option value="webm">WebM (VP9 / Opus)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#8DA0B4] mb-1">Resolution Quality</label>
              <select
                value={quality}
                onChange={(e) => setQuality(e.target.value as any)}
                className="w-full bg-[#07101A] border border-[#213248] rounded-xl px-3 py-2 text-white outline-none"
              >
                <option value="1080p">Full HD (1080p)</option>
                <option value="720p">Standard HD (720p)</option>
              </select>
            </div>
          </div>

          {/* Authoritative Duration Info */}
          <div className="p-3 bg-[#07101A] border border-[#213248] rounded-xl flex items-center justify-between text-[#8DA0B4] text-[11px]">
            <span>Active Render Duration:</span>
            <span className="font-mono font-bold text-white">
              {activeDuration.toFixed(2)}s ({Math.floor(activeDuration / 60)}m{" "}
              {Math.floor(activeDuration % 60)}s)
            </span>
          </div>

          {/* Rendering Progress Bar */}
          {isExporting && (
            <div className="space-y-2 p-3.5 bg-[#08101a] border border-[#213248] rounded-xl">
              <div className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1.5 text-white font-semibold">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#765CFF]" />
                  {stage}
                </span>
                <span className="font-mono font-bold text-[#765CFF]">{progress}%</span>
              </div>
              <div className="w-full h-2 bg-[#162234] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#259CFF] to-[#765CFF] rounded-full transition-all duration-150"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3 bg-[#ef4444]/15 border border-[#ef4444]/40 rounded-xl text-[#ef4444] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Success Result & Instant Download */}
          {exportedResult && (
            <div className="p-4 bg-[#28D7A0]/10 border border-[#28D7A0]/30 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-[#28D7A0] font-bold">
                <CheckCircle2 className="w-5 h-5" />
                <span>Video Rendered Successfully!</span>
              </div>
              <div className="text-[11px] text-[#8DA0B4] flex items-center justify-between">
                <span>{exportedResult.fileName}</span>
                <span className="font-mono text-white font-bold">{exportedResult.sizeMB} MB</span>
              </div>
              <a
                href={exportedResult.url}
                download={exportedResult.fileName}
                className="w-full py-2.5 rounded-xl bg-[#28D7A0] hover:bg-[#22c55e] text-[#022c22] font-black text-[13px] flex items-center justify-center gap-2 shadow-lg transition"
              >
                <Download className="w-4 h-4" />
                Download Final Video
              </a>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-[#213248] bg-[#08101a] flex items-center justify-end gap-2">
          {!isExporting && (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-[#213248] text-[#8DA0B4] hover:text-white hover:bg-[#0F1C2A] transition"
            >
              Close
            </button>
          )}
          {!exportedResult && (
            <button
              type="button"
              onClick={handleStartExport}
              disabled={isExporting}
              className="px-5 py-2 rounded-xl bg-[#765CFF] hover:bg-[#6366f1] disabled:opacity-50 text-white font-extrabold flex items-center gap-2 shadow-lg shadow-[#765CFF]/25 transition"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Rendering...</span>
                </>
              ) : (
                <>
                  <Film className="w-4 h-4" />
                  <span>Start Render</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
