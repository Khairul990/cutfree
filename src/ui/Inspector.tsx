/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Scene & Object Inspector Component for CutFree Studio.
 */

import React from "react";
import {
  Settings,
  Layers,
  Camera,
  Image as ImageIcon,
  User,
  Type,
  Trash2,
  Plus,
} from "lucide-react";
import {
  BlueprintScene,
  CameraPreset,
  CharacterAction,
  CharacterEmotion,
} from "../types/blueprint";

export interface InspectorProps {
  scene: BlueprintScene | null;
  onUpdateScene: (updated: BlueprintScene) => void;
  onDeleteScene: (sceneId: string) => void;
}

const CAMERA_PRESETS: CameraPreset[] = [
  "static",
  "slow_zoom_in",
  "slow_zoom_out",
  "pan_left",
  "pan_right",
  "pan_up",
  "pan_down",
  "zoom_focus",
  "camera_push",
  "camera_pull",
  "shake_light",
  "shake_medium",
];

const CHARACTER_ACTIONS: CharacterAction[] = [
  "idle",
  "walk",
  "run",
  "talk",
  "point",
  "nod",
  "bounce",
];

const CHARACTER_EMOTIONS: CharacterEmotion[] = [
  "neutral",
  "happy",
  "serious",
  "mysterious",
  "alert",
  "sad",
  "inspired",
];

export const Inspector: React.FC<InspectorProps> = ({
  scene,
  onUpdateScene,
  onDeleteScene,
}) => {
  if (!scene) {
    return (
      <div className="w-80 bg-[#0d1222] border-l border-[#1e2740] p-5 text-[#64748b] text-[13px] flex flex-col items-center justify-center text-center">
        <Layers className="w-8 h-8 mb-2 opacity-40 text-[#5b8dff]" />
        <p className="font-semibold text-white">No Scene Selected</p>
        <p className="text-[11px] mt-1 text-[#8d9cc2]">Click any scene block in the timeline to inspect and edit its properties.</p>
      </div>
    );
  }

  const updateField = (field: keyof BlueprintScene, val: any) => {
    onUpdateScene({ ...scene, [field]: val });
  };

  return (
    <aside className="w-80 bg-[#0d1222] border-l border-[#1e2740] flex flex-col h-full overflow-y-auto text-[12px] scrollbar-thin scrollbar-thumb-[#232d47]">
      {/* Inspector Header */}
      <div className="p-4 border-b border-[#1e2740] flex items-center justify-between bg-[#090e1c] shrink-0">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-[#5b8dff]" />
          <span className="font-extrabold text-white text-[13px]">Scene Inspector</span>
        </div>
        <button
          onClick={() => onDeleteScene(scene.id)}
          className="p-1.5 rounded-lg text-[#ef4444] hover:bg-[#ef4444]/15 transition"
          title="Delete Scene"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 space-y-5">
        {/* Timing Section */}
        <div className="space-y-2">
          <label className="font-bold text-[#8d9cc2] uppercase text-[10px] tracking-wider block">Timing (Seconds)</label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-[10px] text-[#64748b]">Start:</span>
              <input
                type="number"
                step="0.1"
                value={scene.start}
                onChange={(e) => updateField("start", parseFloat(e.target.value) || 0)}
                className="w-full bg-[#151b2e] border border-[#232d47] rounded-lg px-2.5 py-1.5 text-white font-mono"
              />
            </div>
            <div>
              <span className="text-[10px] text-[#64748b]">End:</span>
              <input
                type="number"
                step="0.1"
                value={scene.end}
                onChange={(e) => updateField("end", parseFloat(e.target.value) || 0)}
                className="w-full bg-[#151b2e] border border-[#232d47] rounded-lg px-2.5 py-1.5 text-white font-mono"
              />
            </div>
          </div>
        </div>

        {/* Scene Text / Title */}
        <div className="space-y-2">
          <label className="font-bold text-[#8d9cc2] uppercase text-[10px] tracking-wider flex items-center gap-1.5">
            <Type className="w-3.5 h-3.5 text-[#38bdf8]" /> Scene Title
          </label>
          <input
            type="text"
            value={scene.title || ""}
            onChange={(e) => updateField("title", e.target.value)}
            placeholder="e.g. বন্ধ দরজার ওপাশে কী ছিল?"
            className="w-full bg-[#151b2e] border border-[#232d47] rounded-lg px-2.5 py-1.5 text-white outline-none focus:border-[#5b8dff]"
          />
        </div>

        {/* Scene Body / Dialogue */}
        <div className="space-y-2">
          <label className="font-bold text-[#8d9cc2] uppercase text-[10px] tracking-wider block">Subtitle / Narration</label>
          <textarea
            rows={3}
            value={scene.body || scene.text || ""}
            onChange={(e) => updateField("body", e.target.value)}
            placeholder="Scene narration text..."
            className="w-full bg-[#151b2e] border border-[#232d47] rounded-lg p-2.5 text-white outline-none focus:border-[#5b8dff] resize-none"
          />
        </div>

        {/* Background Asset */}
        <div className="space-y-2">
          <label className="font-bold text-[#8d9cc2] uppercase text-[10px] tracking-wider flex items-center gap-1.5">
            <ImageIcon className="w-3.5 h-3.5 text-[#2dd4bf]" /> Background Asset ID
          </label>
          <input
            type="text"
            value={scene.background?.assetId || ""}
            onChange={(e) =>
              updateField("background", {
                ...(scene.background || {}),
                assetId: e.target.value,
              })
            }
            placeholder="e.g. night_sky, rainy_street"
            className="w-full bg-[#151b2e] border border-[#232d47] rounded-lg px-2.5 py-1.5 text-white outline-none focus:border-[#5b8dff]"
          />
        </div>

        {/* Camera Preset */}
        <div className="space-y-2">
          <label className="font-bold text-[#8d9cc2] uppercase text-[10px] tracking-wider flex items-center gap-1.5">
            <Camera className="w-3.5 h-3.5 text-[#a78bfa]" /> Camera Motion
          </label>
          <select
            value={scene.camera?.preset || "static"}
            onChange={(e) =>
              updateField("camera", {
                ...(scene.camera || {}),
                preset: e.target.value as CameraPreset,
              })
            }
            className="w-full bg-[#151b2e] border border-[#232d47] rounded-lg px-2.5 py-1.5 text-white outline-none focus:border-[#5b8dff]"
          >
            {CAMERA_PRESETS.map((preset) => (
              <option key={preset} value={preset}>
                {preset.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>

        {/* Characters in Scene */}
        <div className="space-y-3 pt-2 border-t border-[#1e2740]">
          <div className="flex items-center justify-between">
            <label className="font-bold text-[#8d9cc2] uppercase text-[10px] tracking-wider flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-[#f472b6]" /> Characters ({scene.characters?.length || 0})
            </label>
            <button
              onClick={() => {
                const chars = scene.characters ? [...scene.characters] : [];
                chars.push({ id: `character_${chars.length + 1}`, action: "idle", emotion: "neutral", scale: 1.0 });
                updateField("characters", chars);
              }}
              className="text-[11px] font-bold text-[#5b8dff] hover:underline flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Add
            </button>
          </div>

          {scene.characters?.map((char, cIdx) => (
            <div key={cIdx} className="p-2.5 rounded-lg bg-[#151b2e] border border-[#232d47] space-y-2">
              <div className="flex items-center justify-between">
                <input
                  type="text"
                  value={char.id}
                  onChange={(e) => {
                    const chars = [...(scene.characters || [])];
                    chars[cIdx] = { ...chars[cIdx], id: e.target.value };
                    updateField("characters", chars);
                  }}
                  className="font-bold text-white bg-transparent border-b border-transparent focus:border-[#5b8dff] outline-none text-[11.5px]"
                />
                <button
                  onClick={() => {
                    const chars = (scene.characters || []).filter((_, i) => i !== cIdx);
                    updateField("characters", chars);
                  }}
                  className="text-[#ef4444] hover:text-red-300 text-[10px]"
                >
                  Remove
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-[10px] text-[#64748b]">Action:</span>
                  <select
                    value={char.action || "idle"}
                    onChange={(e) => {
                      const chars = [...(scene.characters || [])];
                      chars[cIdx] = { ...chars[cIdx], action: e.target.value as CharacterAction };
                      updateField("characters", chars);
                    }}
                    className="w-full bg-[#0b0f1a] border border-[#232d47] rounded px-1.5 py-1 text-white text-[11px]"
                  >
                    {CHARACTER_ACTIONS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <span className="text-[10px] text-[#64748b]">Emotion:</span>
                  <select
                    value={char.emotion || "neutral"}
                    onChange={(e) => {
                      const chars = [...(scene.characters || [])];
                      chars[cIdx] = { ...chars[cIdx], emotion: e.target.value as CharacterEmotion };
                      updateField("characters", chars);
                    }}
                    className="w-full bg-[#0b0f1a] border border-[#232d47] rounded px-1.5 py-1 text-white text-[11px]"
                  >
                    {CHARACTER_EMOTIONS.map((em) => (
                      <option key={em} value={em}>
                        {em}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
};
