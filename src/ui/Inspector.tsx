/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Inspector Component for CutFree Studio.
 * Matches exact layout, segmented tabs (Scene, Text, Character, Animation),
 * and dynamic controls from design specification.
 */

import React, { useState } from "react";
import {
  X,
  Clock,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Type,
  User,
  Film,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  BlueprintScene,
  CameraPreset,
  CharacterAction,
  CharacterEmotion,
  CaptionItem,
} from "../types/blueprint";

export interface InspectorProps {
  scene: BlueprintScene | null;
  captions?: CaptionItem[];
  currentTime: number;
  onUpdateScene: (updated: BlueprintScene) => void;
  onDeleteScene: (sceneId: string) => void;
  onClose?: () => void;
}

const CAMERA_PRESETS: { id: CameraPreset; label: string }[] = [
  { id: "static", label: "Static (No Motion)" },
  { id: "slow_zoom_in", label: "Slow Zoom In" },
  { id: "slow_zoom_out", label: "Slow Zoom Out" },
  { id: "pan_left", label: "Pan Left" },
  { id: "pan_right", label: "Pan Right" },
  { id: "pan_up", label: "Pan Up" },
  { id: "pan_down", label: "Pan Down" },
  { id: "zoom_focus", label: "Zoom Focus" },
  { id: "camera_push", label: "Camera Push" },
  { id: "camera_pull", label: "Camera Pull" },
  { id: "shake_light", label: "Shake Light" },
  { id: "shake_medium", label: "Shake Medium" },
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
  captions = [],
  currentTime,
  onUpdateScene,
  onDeleteScene,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<"scene" | "text" | "character" | "animation">("scene");
  const [notesOpen, setNotesOpen] = useState<boolean>(true);
  const [opacityVal, setOpacityVal] = useState<number>(100);

  // Format seconds to MM:SS.SS
  const fmt = (sec: number) => {
    const s = Math.max(0, sec);
    const m = Math.floor(s / 60);
    const remainder = s % 60;
    const secWhole = Math.floor(remainder);
    const frac = Math.floor((remainder - secWhole) * 100);
    return `${String(m).padStart(2, "0")}:${String(secWhole).padStart(2, "0")}.${String(frac).padStart(2, "0")}`;
  };

  if (!scene) {
    return (
      <aside className="w-[300px] bg-[#0C1724] border-l border-[#213248] p-5 text-[#8DA0B4] text-[12px] flex flex-col items-center justify-center text-center select-none">
        <Film className="w-8 h-8 mb-2 opacity-40 text-[#259CFF]" />
        <p className="font-bold text-white text-[13px]">No Scene Selected</p>
        <p className="text-[11px] mt-1 text-[#8DA0B4]">
          Click any scene block in the timeline or preview to edit its properties.
        </p>
      </aside>
    );
  }

  const updateField = (field: keyof BlueprintScene, val: any) => {
    onUpdateScene({ ...scene, [field]: val });
  };

  // Find active caption if any
  const currentCaption = captions.find(
    (c) => currentTime >= c.start && currentTime <= c.end
  );

  return (
    <aside className="w-[300px] bg-[#0C1724] border-l border-[#213248] flex flex-col h-full shrink-0 z-10 select-none text-[12px] overflow-hidden">
      {/* Inspector Header */}
      <div className="p-3.5 border-b border-[#213248] flex items-center justify-between">
        <h2 className="font-extrabold text-white text-[14px] tracking-tight">Inspector</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onDeleteScene(scene.id)}
            className="p-1 rounded-lg text-[#ef4444] hover:bg-[#ef4444]/15 transition"
            title="Delete Scene"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-[#8DA0B4] hover:text-white hover:bg-[#0F1C2A] transition"
              title="Close Inspector"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Segmented Tab Bar: Scene | Text | Character | Animation */}
      <div className="p-2 border-b border-[#213248] bg-[#09111c] flex items-center gap-1">
        {(["scene", "text", "character", "animation"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold capitalize transition ${
              activeTab === tab
                ? "bg-[#259CFF] text-white shadow-sm"
                : "text-[#8DA0B4] hover:text-white hover:bg-[#0F1C2A]"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 scrollbar-thin">
        {/* ================= SCENE TAB ================= */}
        {activeTab === "scene" && (
          <>
            {/* Scene Title */}
            <div>
              <label className="block text-[11px] font-semibold text-[#8DA0B4] mb-1">Scene Title</label>
              <input
                type="text"
                value={scene.title || ""}
                onChange={(e) => updateField("title", e.target.value)}
                placeholder="Scene Title..."
                className="w-full bg-[#07101A] border border-[#213248] focus:border-[#259CFF] rounded-lg px-2.5 py-1.5 text-white outline-none text-[12px] transition"
              />
            </div>

            {/* Start Time & End Time */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-[#8DA0B4] mb-1">Start Time</label>
                <div className="flex items-center gap-1.5 bg-[#07101A] border border-[#213248] rounded-lg px-2 py-1.5 text-white font-mono text-[11px]">
                  <Clock className="w-3.5 h-3.5 text-[#8DA0B4]" />
                  <span>{fmt(scene.start)}</span>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#8DA0B4] mb-1">End Time</label>
                <div className="flex items-center gap-1.5 bg-[#07101A] border border-[#213248] rounded-lg px-2 py-1.5 text-white font-mono text-[11px]">
                  <Clock className="w-3.5 h-3.5 text-[#8DA0B4]" />
                  <span>{fmt(scene.end)}</span>
                </div>
              </div>
            </div>

            {/* Background */}
            <div>
              <label className="block text-[11px] font-semibold text-[#8DA0B4] mb-1">Background</label>
              <div className="flex items-center justify-between p-2 rounded-lg bg-[#07101A] border border-[#213248]">
                <div className="flex items-center gap-2 truncate">
                  <div className="w-7 h-7 rounded-md bg-[#1e293b] flex items-center justify-center text-white shrink-0">
                    <ImageIcon className="w-4 h-4 text-[#259CFF]" />
                  </div>
                  <span className="font-medium text-white truncate text-[11px]">
                    {scene.background?.assetId ? `${scene.background.assetId}.jpg` : "None"}
                  </span>
                </div>
                {scene.background?.assetId && (
                  <button
                    onClick={() =>
                      updateField("background", { ...scene.background, assetId: "" })
                    }
                    className="p-1 rounded text-[#8DA0B4] hover:text-white"
                    title="Remove Background"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Fit & Opacity */}
            <div className="grid grid-cols-2 gap-2 items-center">
              <div>
                <label className="block text-[11px] font-semibold text-[#8DA0B4] mb-1">Fit</label>
                <select
                  value={scene.background?.fit || "cover"}
                  onChange={(e) =>
                    updateField("background", {
                      ...scene.background,
                      fit: e.target.value as any,
                    })
                  }
                  className="w-full bg-[#07101A] border border-[#213248] rounded-lg px-2 py-1.5 text-white outline-none text-[11px]"
                >
                  <option value="cover">Cover</option>
                  <option value="contain">Contain</option>
                  <option value="fill">Fill</option>
                </select>
              </div>
              <div>
                <div className="flex items-center justify-between text-[11px] font-semibold text-[#8DA0B4] mb-1">
                  <span>Opacity</span>
                  <span className="text-white">{opacityVal}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={opacityVal}
                  onChange={(e) => setOpacityVal(Number(e.target.value))}
                  className="w-full"
                />
              </div>
            </div>

            {/* Camera Animation */}
            <div>
              <label className="block text-[11px] font-semibold text-[#8DA0B4] mb-1">Camera Animation</label>
              <select
                value={scene.camera?.preset || "slow_zoom_in"}
                onChange={(e) =>
                  updateField("camera", {
                    ...scene.camera,
                    preset: e.target.value as CameraPreset,
                  })
                }
                className="w-full bg-[#07101A] border border-[#213248] focus:border-[#259CFF] rounded-lg px-2.5 py-1.5 text-white outline-none text-[11px]"
              >
                {CAMERA_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Transition & Duration */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-[#8DA0B4] mb-1">Transition</label>
                <select
                  value={scene.transition || "fade"}
                  onChange={(e) => updateField("transition", e.target.value)}
                  className="w-full bg-[#07101A] border border-[#213248] rounded-lg px-2 py-1.5 text-white outline-none text-[11px]"
                >
                  <option value="fade">Fade</option>
                  <option value="none">Cut</option>
                  <option value="slide">Slide</option>
                  <option value="zoom">Zoom</option><option value="wipe">Wipe</option><option value="glitch">Glitch</option><option value="pageTurn">Page Turn</option><option value="blurZoom">Blur Zoom</option><option value="whipPan">Whip Pan</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#8DA0B4] mb-1">Duration</label>
                <select
                  value={String(scene.transitionDuration || 1.0)}
                  onChange={(e) => updateField("transitionDuration", parseFloat(e.target.value))}
                  className="w-full bg-[#07101A] border border-[#213248] rounded-lg px-2 py-1.5 text-white outline-none text-[11px]"
                >
                  <option value="0.5">0.5s</option>
                  <option value="1.0">1.0s</option>
                  <option value="1.5">1.5s</option>
                  <option value="2.0">2.0s</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#8DA0B4] mb-1">Text Animation</label>
              <select value={scene.textAnimation || "fade"} onChange={(e) => updateField("textAnimation", e.target.value as any)}
                className="w-full bg-[#07101A] border border-[#213248] rounded-lg px-2.5 py-1.5 text-white outline-none text-[11px]">
                <option value="fade">Fade</option><option value="slide_up">Slide Up</option><option value="slide_down">Slide Down</option>
                <option value="slide_left">Slide Left</option><option value="slide_right">Slide Right</option><option value="scale">Scale</option>
                <option value="typewriter">Typewriter</option><option value="word_reveal">Word Reveal</option><option value="line_reveal">Line Reveal</option>
                <option value="pop">Pop</option><option value="emphasis">Emphasis</option>
              </select>
            </div>
            {/* Scene Notes Accordion */}
            <div className="border border-[#213248] rounded-xl bg-[#07101A] overflow-hidden">
              <button
                onClick={() => setNotesOpen(!notesOpen)}
                className="w-full p-2.5 flex items-center justify-between font-bold text-white text-[11px] hover:bg-[#0F1C2A] transition"
              >
                <span>Scene Notes</span>
                {notesOpen ? <ChevronUp className="w-3.5 h-3.5 text-[#8DA0B4]" /> : <ChevronDown className="w-3.5 h-3.5 text-[#8DA0B4]" />}
              </button>
              {notesOpen && (
                <div className="p-2.5 pt-0">
                  <textarea
                    rows={3}
                    value={scene.body || ""}
                    onChange={(e) => updateField("body", e.target.value)}
                    placeholder="Show Nooruddin and Nuri, introduce the story with a warm and peaceful background."
                    className="w-full bg-[#0C1724] border border-[#213248] rounded-lg p-2 text-white outline-none text-[11px] placeholder-[#8DA0B4] resize-none"
                  />
                </div>
              )}
            </div>
          </>
        )}

        {/* ================= TEXT TAB ================= */}
        {activeTab === "text" && (
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-[#8DA0B4] mb-1">Active Caption / Text</label>
              <textarea
                rows={3}
                value={currentCaption?.text || scene.body || ""}
                onChange={(e) => updateField("body", e.target.value)}
                placeholder="Caption text..."
                className="w-full bg-[#07101A] border border-[#213248] rounded-lg p-2 text-white outline-none text-[12px] resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-[#8DA0B4] mb-1">Font Family</label>
                <select className="w-full bg-[#07101A] border border-[#213248] rounded-lg px-2 py-1.5 text-white outline-none text-[11px]">
                  <option>Noto Sans Bengali</option>
                  <option>Hind Siliguri</option>
                  <option>Inter</option>
                  <option>Roboto</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#8DA0B4] mb-1">Font Weight</label>
                <select className="w-full bg-[#07101A] border border-[#213248] rounded-lg px-2 py-1.5 text-white outline-none text-[11px]">
                  <option>Bold (700)</option>
                  <option>Extra Bold (800)</option>
                  <option>Black (900)</option>
                  <option>Medium (500)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#8DA0B4] mb-1">Animation Style</label>
              <select className="w-full bg-[#07101A] border border-[#213248] rounded-lg px-2.5 py-1.5 text-white outline-none text-[11px]">
                <option value="fade">Word Reveal & Fade</option>
                <option value="slide">Slide In Up</option>
                <option value="typewriter">Typewriter</option>
                <option value="scale">Bounce Scale</option>
              </select>
            </div>
          </div>
        )}

        {/* ================= CHARACTER TAB ================= */}
        {activeTab === "character" && (
          <div className="space-y-3">
            {scene.characters && scene.characters.length > 0 ? (
              scene.characters.map((char, i) => (
                <div key={char.id + i} className="p-3 bg-[#07101A] border border-[#213248] rounded-xl space-y-2">
                  <div className="flex items-center justify-between font-bold text-white text-[12px]">
                    <span className="capitalize">{char.id}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#259CFF]/20 text-[#259CFF]">
                      Character #{i + 1}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-semibold text-[#8DA0B4] mb-1">Action</label>
                      <select
                        value={char.action || "idle"}
                        onChange={(e) => {
                          const copy = [...scene.characters!];
                          copy[i] = { ...copy[i], action: e.target.value as any };
                          updateField("characters", copy);
                        }}
                        className="w-full bg-[#0C1724] border border-[#213248] rounded-lg px-2 py-1 text-white outline-none text-[11px]"
                      >
                        {CHARACTER_ACTIONS.map((act) => (
                          <option key={act} value={act}>
                            {act}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-semibold text-[#8DA0B4] mb-1">Emotion</label>
                      <select
                        value={char.emotion || "neutral"}
                        onChange={(e) => {
                          const copy = [...scene.characters!];
                          copy[i] = { ...copy[i], emotion: e.target.value as any };
                          updateField("characters", copy);
                        }}
                        className="w-full bg-[#0C1724] border border-[#213248] rounded-lg px-2 py-1 text-white outline-none text-[11px]"
                      >
                        {CHARACTER_EMOTIONS.map((emo) => (
                          <option key={emo} value={emo}>
                            {emo}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-[#8DA0B4] mb-1">Exit</label>
                    <select value={char.exit || "none"} onChange={(e) => { const copy = [...scene.characters!]; copy[i] = { ...copy[i], exit: e.target.value as any }; updateField("characters", copy); }}
                      className="w-full bg-[#0C1724] border border-[#213248] rounded-lg px-2 py-1 text-white outline-none text-[11px]">
                      <option value="none">None</option><option value="fade_out">Fade Out</option><option value="exit_left">Exit Left</option>
                      <option value="exit_right">Exit Right</option><option value="scale_out">Scale Out</option><option value="slide_out">Slide Out</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-[#8DA0B4] mb-1">Entrance</label>
                    <select
                      value={char.entrance || "fade_in"}
                      onChange={(e) => {
                        const copy = [...scene.characters!];
                        copy[i] = { ...copy[i], entrance: e.target.value as any };
                        updateField("characters", copy);
                      }}
                      className="w-full bg-[#0C1724] border border-[#213248] rounded-lg px-2 py-1 text-white outline-none text-[11px]"
                    >
                      <option value="fade_in">Fade In</option>
                      <option value="enter_left">Enter From Left</option>
                      <option value="enter_right">Enter From Right</option>
                      <option value="scale_in">Scale In</option>
                    </select>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-6 text-[#8DA0B4]">
                <User className="w-8 h-8 mx-auto mb-2 opacity-40 text-[#259CFF]" />
                <p>No characters in this scene.</p>
                <p className="text-[10px] mt-1">Click a character from the Asset Library to add.</p>
              </div>
            )}
          </div>
        )}

        {/* ================= ANIMATION TAB ================= */}
        {activeTab === "animation" && (
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-[#8DA0B4] mb-1">Camera Preset</label>
              <select
                value={scene.camera?.preset || "slow_zoom_in"}
                onChange={(e) =>
                  updateField("camera", {
                    ...scene.camera,
                    preset: e.target.value as CameraPreset,
                  })
                }
                className="w-full bg-[#07101A] border border-[#213248] rounded-lg px-2.5 py-1.5 text-white outline-none text-[11px]"
              >
                {CAMERA_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between text-[11px] font-semibold text-[#8DA0B4] mb-1">
                <span>Motion Intensity</span>
                <span className="text-white">{(scene.camera?.intensity ?? 1.0).toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={scene.camera?.intensity ?? 1.0}
                onChange={(e) =>
                  updateField("camera", {
                    ...scene.camera,
                    intensity: parseFloat(e.target.value),
                  })
                }
                className="w-full"
              />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
