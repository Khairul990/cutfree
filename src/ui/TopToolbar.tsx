/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Top Toolbar Component for CutFree Studio.
 * Matches exact layout and visual design specification.
 */

import React from "react";
import {
  FolderKanban,
  FileAudio,
  FileCode2,
  Save,
  Undo2,
  Redo2,
  Play,
  Pause,
  Upload,
  Settings,
  User,
  CheckCircle2,
} from "lucide-react";

export interface TopToolbarProps {
  projectTitle: string;
  onOpenProjectModal: () => void;
  onImportAudioClick: () => void;
  onImportJsonClick: () => void;
  onSave: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onOpenExportModal: () => void;
  onOpenSettingsModal: () => void;
}

export const TopToolbar: React.FC<TopToolbarProps> = ({
  projectTitle,
  onOpenProjectModal,
  onImportAudioClick,
  onImportJsonClick,
  onSave,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  isPlaying,
  onTogglePlay,
  onOpenExportModal,
  onOpenSettingsModal,
}) => {
  return (
    <header className="h-[64px] bg-[#0C1724] border-b border-[#213248] px-4 flex items-center justify-between gap-3 shrink-0 z-30 select-none">
      {/* LEFT: CutFree Studio Logo + Project Title */}
      <div className="flex items-center gap-3">
        {/* Brand Icon (Blue Ribbon C) */}
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#259CFF] via-[#38bdf8] to-[#765CFF] flex items-center justify-center shadow-lg shadow-[#259CFF]/20">
            <svg
              className="w-5 h-5 text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 12a7 7 0 1 1-7-7c3 0 5 1.5 6 3" />
              <path d="M21 7l-5 5 5 5" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-1.5 leading-none">
              <span className="font-extrabold text-[15px] tracking-tight text-white">CutFree Studio</span>
            </div>
            <div className="text-[11px] text-[#8DA0B4] leading-tight font-medium mt-0.5">
              Turn Audio into Amazing Videos
            </div>
          </div>
        </div>
      </div>

      {/* CENTER: Project Tools & Actions */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Project Selector Button */}
        <button
          onClick={onOpenProjectModal}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0F1C2A] hover:bg-[#16273b] border border-[#213248] text-left transition text-[#EEF4FB] group"
          title="Project Settings"
        >
          <FolderKanban className="w-4 h-4 text-[#8DA0B4] group-hover:text-[#259CFF] transition" />
          <div className="flex flex-col">
            <span className="text-[10px] text-[#8DA0B4] uppercase font-bold leading-none">Project</span>
            <span className="text-[12px] font-semibold text-white leading-tight truncate max-w-[120px]">
              {projectTitle || "Untitled Video"}
            </span>
          </div>
        </button>

        {/* Import Audio */}
        <button
          onClick={onImportAudioClick}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0F1C2A] hover:bg-[#16273b] border border-[#213248] text-left transition text-[#EEF4FB] group"
          title="Import Audio Track (MP3, WAV, M4A)"
        >
          <FileAudio className="w-4 h-4 text-[#259CFF]" />
          <div className="flex flex-col">
            <span className="text-[12px] font-bold text-white leading-tight">Import Audio</span>
            <span className="text-[10px] text-[#8DA0B4] leading-none">MP3, WAV, M4A</span>
          </div>
        </button>

        {/* Import JSON */}
        <button
          onClick={onImportJsonClick}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0F1C2A] hover:bg-[#16273b] border border-[#213248] text-left transition text-[#EEF4FB] group"
          title="Import External AI Blueprint JSON"
        >
          <FileCode2 className="w-4 h-4 text-[#765CFF]" />
          <div className="flex flex-col">
            <span className="text-[12px] font-bold text-white leading-tight">Import JSON</span>
            <span className="text-[10px] text-[#8DA0B4] leading-none">Blueprint</span>
          </div>
        </button>

        {/* Save Button with Auto-saved badge */}
        <button
          onClick={onSave}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0F1C2A] hover:bg-[#16273b] border border-[#213248] text-left transition text-[#EEF4FB] group"
          title="Save Project (Ctrl+S)"
        >
          <Save className="w-4 h-4 text-[#28D7A0]" />
          <div className="flex flex-col">
            <span className="text-[12px] font-bold text-white leading-tight">Save</span>
            <span className="text-[10px] text-[#28D7A0] font-semibold leading-none flex items-center gap-0.5">
              <CheckCircle2 className="w-2.5 h-2.5" /> Auto-saved
            </span>
          </div>
        </button>

        {/* Undo / Redo */}
        <div className="flex items-center bg-[#0F1C2A] border border-[#213248] rounded-lg p-0.5">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className={`p-1.5 rounded-md transition ${
              canUndo ? "text-white hover:bg-[#16273b]" : "text-[#475569] cursor-not-allowed"
            }`}
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            className={`p-1.5 rounded-md transition ${
              canRedo ? "text-white hover:bg-[#16273b]" : "text-[#475569] cursor-not-allowed"
            }`}
            title="Redo (Ctrl+Y)"
          >
            <Redo2 className="w-4 h-4" />
          </button>
        </div>

        {/* Preview Button */}
        <button
          onClick={onTogglePlay}
          className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0F1C2A] hover:bg-[#16273b] border border-[#213248] text-[12px] font-bold text-white transition"
          title="Toggle Canvas Playback"
        >
          {isPlaying ? <Pause className="w-3.5 h-3.5 text-[#259CFF]" /> : <Play className="w-3.5 h-3.5 text-[#259CFF]" />}
          <span>Preview</span>
        </button>
      </div>

      {/* RIGHT: Export Video & Profile Actions */}
      <div className="flex items-center gap-2">
        {/* Primary Export Video Button */}
        <button
          onClick={onOpenExportModal}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#765CFF] to-[#6366f1] hover:brightness-110 active:scale-95 text-white font-extrabold text-[13px] shadow-lg shadow-[#765CFF]/25 border border-[#8b5cf6]/40 transition"
        >
          <Upload className="w-4 h-4 stroke-[2.5]" />
          <span>Export Video</span>
        </button>

        {/* Settings Button */}
        <button
          onClick={onOpenSettingsModal}
          className="p-2 rounded-xl bg-[#0F1C2A] hover:bg-[#16273b] border border-[#213248] text-[#8DA0B4] hover:text-white transition"
          title="Studio Settings"
        >
          <Settings className="w-4 h-4" />
        </button>

        {/* User Profile Avatar */}
        <div
          className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#259CFF] to-[#0284c7] flex items-center justify-center text-white font-black text-[12px] shadow-md cursor-pointer"
          title="Creator Profile"
        >
          K
        </div>
      </div>
    </header>
  );
};
