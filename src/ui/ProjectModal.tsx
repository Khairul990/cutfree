/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Project Settings & Management Modal for CutFree Studio.
 */

import React, { useState } from "react";
import {
  X,
  FolderKanban,
  FileDown,
  FileUp,
  PlusCircle,
  Save,
  Check,
} from "lucide-react";
import { VideoBlueprint } from "../types/blueprint";

export interface ProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  blueprint: VideoBlueprint;
  onUpdateTitle: (title: string) => void;
  onNewProject: () => void;
  onExportBlueprintJson: () => void;
  onImportBlueprintClick: () => void;
}

export const ProjectModal: React.FC<ProjectModalProps> = ({
  isOpen,
  onClose,
  blueprint,
  onUpdateTitle,
  onNewProject,
  onExportBlueprintJson,
  onImportBlueprintClick,
}) => {
  const [title, setTitle] = useState(blueprint.project.title || "Untitled Video");

  if (!isOpen) return null;

  const handleSaveTitle = () => {
    onUpdateTitle(title);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-[480px] bg-[#0C1724] border border-[#213248] rounded-2xl shadow-2xl overflow-hidden text-[12px] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-[#213248] flex items-center justify-between bg-[#08101a]">
          <div className="flex items-center gap-2">
            <FolderKanban className="w-5 h-5 text-[#259CFF]" />
            <h2 className="font-extrabold text-white text-[15px]">Project Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#8DA0B4] hover:text-white hover:bg-[#0F1C2A] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-[#8DA0B4] mb-1.5">Project Name</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-[#07101A] border border-[#213248] focus:border-[#259CFF] rounded-xl px-3 py-2 text-white outline-none text-[13px] font-semibold transition"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              onClick={onExportBlueprintJson}
              className="p-3 rounded-xl bg-[#07101A] border border-[#213248] hover:border-[#259CFF] text-[#EEF4FB] flex flex-col items-center gap-1.5 transition text-center"
            >
              <FileDown className="w-5 h-5 text-[#259CFF]" />
              <span className="font-bold text-[11px]">Save Blueprint JSON</span>
              <span className="text-[10px] text-[#8DA0B4]">Download local file</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onClose();
                onImportBlueprintClick();
              }}
              className="p-3 rounded-xl bg-[#07101A] border border-[#213248] hover:border-[#765CFF] text-[#EEF4FB] flex flex-col items-center gap-1.5 transition text-center"
            >
              <FileUp className="w-5 h-5 text-[#765CFF]" />
              <span className="font-bold text-[11px]">Import Blueprint</span>
              <span className="text-[10px] text-[#8DA0B4]">Load from external AI</span>
            </button>
          </div>

          <div className="pt-2 border-t border-[#213248]">
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Start a new project? Unsaved changes will be replaced.")) {
                  onNewProject();
                  onClose();
                }
              }}
              className="w-full py-2.5 rounded-xl border border-[#ef4444]/30 hover:bg-[#ef4444]/10 text-[#ef4444] font-bold flex items-center justify-center gap-2 transition"
            >
              <PlusCircle className="w-4 h-4" />
              New Project
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#213248] bg-[#08101a] flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-[#213248] text-[#8DA0B4] hover:text-white transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSaveTitle}
            className="px-5 py-2 rounded-xl bg-[#259CFF] hover:bg-[#1d82d8] text-white font-bold flex items-center gap-1.5 transition"
          >
            <Check className="w-4 h-4" />
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};
