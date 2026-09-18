/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Asset Library Panel for CutFree Studio.
 * Matches exact layout, styling, and categories from design specification.
 */

import React, { useEffect, useState } from "react";
import {
  Search,
  SlidersHorizontal,
  ChevronRight,
  Plus,
  Users,
  Image as ImageIcon,
  Box,
  Music,
} from "lucide-react";
import { BlueprintAsset } from "../types/blueprint";
import { assetResolver } from "../core/asset-resolver";

export interface AssetPanelProps {
  onInsertAsset: (asset: BlueprintAsset) => void;
  onCustomImageUpload: (id: string, img: HTMLImageElement) => void;
  activeNavTab?: string;
}

export const AssetPanel: React.FC<AssetPanelProps> = ({
  onInsertAsset,
  onCustomImageUpload,
  activeNavTab = "assets",
}) => {
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedFilter, setSelectedFilter] = useState<string>("all");

  const characters = [
    { id: "nooruddin", name: "Nooruddin", type: "character" as const, gradient: "from-[#065f46] to-[#047857]", badge: "Boy" },
    { id: "nuri", name: "Nuri", type: "character" as const, gradient: "from-[#f59e0b] to-[#fbbf24]", badge: "Star" },
    { id: "ayesha", name: "Ayesha", type: "character" as const, gradient: "from-[#7c3aed] to-[#a855f7]", badge: "Girl" },
  ];

  const backgrounds = [
    { id: "mosque", name: "Mosque", type: "background" as const, gradient: "from-[#0f172a] via-[#1e293b] to-[#0369a1]" },
    { id: "village", name: "Village", type: "background" as const, gradient: "from-[#064e3b] via-[#065f46] to-[#15803d]" },
    { id: "forest", name: "Forest", type: "background" as const, gradient: "from-[#022c22] via-[#064e3b] to-[#047857]" },
  ];

  const objects = [
    { id: "lantern", name: "Lantern", type: "object" as const, gradient: "from-[#78350f] to-[#d97706]" },
    { id: "book", name: "Book", type: "object" as const, gradient: "from-[#1e293b] to-[#475569]" },
    { id: "tree", name: "Tree", type: "object" as const, gradient: "from-[#14532d] to-[#16a34a]" },
  ];

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const id = `custom_${file.name.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
        assetResolver.registerCustomImage(id, img);
        const asset: BlueprintAsset = {
          id,
          type: "image",
          name: file.name,
          description: "User uploaded image",
        };
        assetResolver.registerAsset(asset);
        onCustomImageUpload(id, img);
        onInsertAsset(asset);
      };
      img.src = String(ev.target?.result);
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    const map: Record<string, string> = { characters: "characters", backgrounds: "backgrounds", objects: "objects" };
    if (map[activeNavTab]) setSelectedFilter(map[activeNavTab]);
    else if (activeNavTab === "assets") setSelectedFilter("all");
  }, [activeNavTab]);

  const matchesSearch = (name: string, id: string) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return name.toLowerCase().includes(q) || id.toLowerCase().includes(q);
  };

  const showCharacters = selectedFilter === "all" || selectedFilter === "characters";
  const showBackgrounds = selectedFilter === "all" || selectedFilter === "backgrounds";
  const showObjects = selectedFilter === "all" || selectedFilter === "objects";

  return (
    <aside className="w-[280px] bg-[#0C1724] border-r border-[#213248] flex flex-col h-full shrink-0 z-10 select-none text-[12px] overflow-hidden">
      {/* Top Header */}
      <div className="p-3.5 border-b border-[#213248] flex items-center justify-between">
        <h2 className="font-extrabold text-white text-[14px] tracking-tight">Assets Library</h2>
        <label
          className="p-1 rounded-lg bg-[#0F1C2A] hover:bg-[#16273b] text-[#259CFF] border border-[#213248] cursor-pointer transition"
          title="Upload Custom Image Asset"
        >
          <Plus className="w-4 h-4" />
          <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
        </label>
      </div>

      {/* Search Bar & Filter Toggle */}
      <div className="px-3.5 py-2.5 border-b border-[#213248] flex items-center gap-2">
        <div className="flex-1 flex items-center gap-2 bg-[#07101A] px-2.5 py-1.5 rounded-lg border border-[#213248] focus-within:border-[#259CFF] transition">
          <Search className="w-3.5 h-3.5 text-[#8DA0B4]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search assets..."
            className="w-full bg-transparent text-white outline-none text-[11px] placeholder-[#8DA0B4]"
          />
        </div>
        <button
          onClick={() => setSelectedFilter(selectedFilter === "all" ? "characters" : "all")}
          className="p-1.5 rounded-lg bg-[#0F1C2A] border border-[#213248] hover:border-[#259CFF] text-[#8DA0B4] hover:text-white transition"
          title="Toggle Filter"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Filter Category Pills */}
      <div className="px-3.5 py-2 border-b border-[#213248] flex items-center gap-1.5 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setSelectedFilter("all")}
          className={`px-3 py-1 rounded-full text-[11px] font-bold transition whitespace-nowrap ${
            selectedFilter === "all"
              ? "bg-[#259CFF] text-white"
              : "bg-[#0F1C2A] text-[#8DA0B4] hover:text-white border border-[#213248]"
          }`}
        >
          All
        </button>
        <button
          onClick={() => setSelectedFilter("characters")}
          className={`px-3 py-1 rounded-full text-[11px] font-bold transition whitespace-nowrap ${
            selectedFilter === "characters"
              ? "bg-[#259CFF] text-white"
              : "bg-[#0F1C2A] text-[#8DA0B4] hover:text-white border border-[#213248]"
          }`}
        >
          Characters
        </button>
        <button
          onClick={() => setSelectedFilter("backgrounds")}
          className={`px-3 py-1 rounded-full text-[11px] font-bold transition whitespace-nowrap ${
            selectedFilter === "backgrounds"
              ? "bg-[#259CFF] text-white"
              : "bg-[#0F1C2A] text-[#8DA0B4] hover:text-white border border-[#213248]"
          }`}
        >
          Backgrounds
        </button>
        <button
          onClick={() => setSelectedFilter("objects")}
          className={`p-1 rounded-full text-[11px] font-bold bg-[#0F1C2A] text-[#8DA0B4] hover:text-white border border-[#213248] transition`}
          title="More categories"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Scrollable Categories List */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-4 scrollbar-thin">
        {activeNavTab === "templates" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <LayoutTemplate className="w-4 h-4 text-[#765CFF]" />
              <div>
                <div className="font-extrabold text-white text-[12px]">Production Templates</div>
                <div className="text-[10px] text-[#8DA0B4]">Apply a visual treatment to the whole project.</div>
              </div>
            </div>
            {[
              ["islamic_story", "Islamic Story", "Warm • slow camera • word reveal"],
              ["cinematic", "Cinematic", "Dramatic camera • blur transitions"],
              ["shorts_fast", "Shorts Fast", "9:16 • energetic motion • pop text"],
              ["minimal", "Minimal", "Clean cuts • static camera"],
            ].map(([id, name, desc]) => (
              <button key={id} onClick={() => onApplyTemplate?.(id)} className="w-full text-left p-3 rounded-xl bg-[#07101A] border border-[#213248] hover:border-[#765CFF] hover:bg-[#0F1C2A] transition group">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#765CFF]" />
                  <span className="font-bold text-white text-[12px]">{name}</span>
                </div>
                <div className="text-[10px] text-[#8DA0B4] mt-1 pl-6">{desc}</div>
              </button>
            ))}
          </div>
        )}

        {activeNavTab === "text" && (
          <div className="p-3 rounded-xl bg-[#07101A] border border-[#213248]">
            <div className="font-bold text-white text-[12px]">Text & Captions</div>
            <p className="text-[10px] text-[#8DA0B4] mt-1">Select a scene, then use Inspector → Text to edit text animation.</p>
          </div>
        )}

        {activeNavTab === "scenes" && (
          <div className="p-3 rounded-xl bg-[#07101A] border border-[#213248]">
            <div className="font-bold text-white text-[12px]">Scenes</div>
            <p className="text-[10px] text-[#8DA0B4] mt-1">Use the timeline to select, split, duplicate and delete scenes.</p>
          </div>
        )}

        {/* CHARACTERS SECTION */}
        {showCharacters && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="font-extrabold text-white text-[12px] tracking-tight">Characters</span>
              <button
                onClick={() => setSelectedFilter("characters")}
                className="text-[10px] text-[#259CFF] hover:underline font-semibold"
              >
                See all
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {characters
                .filter((c) => matchesSearch(c.name, c.id))
                .map((char) => (
                  <button
                    key={char.id}
                    onClick={() =>
                      onInsertAsset({
                        id: char.id,
                        type: char.type,
                        name: char.name,
                      })
                    }
                    className="flex flex-col items-center group text-left cursor-pointer transition active:scale-95"
                    title={`Click to add ${char.name} to active scene`}
                  >
                    <div
                      className={`w-[74px] h-[74px] rounded-2xl bg-gradient-to-br ${char.gradient} p-0.5 border border-[#213248] group-hover:border-[#259CFF] group-hover:shadow-lg group-hover:shadow-[#259CFF]/20 flex flex-col items-center justify-center relative overflow-hidden transition`}
                    >
                      {/* Stylized vector preview representation */}
                      {char.id === "nooruddin" && (
                        <div className="flex flex-col items-center">
                          <div className="w-7 h-7 rounded-full bg-[#ffedd5] border border-white flex items-center justify-center text-[10px] font-black text-slate-800">
                            👦
                          </div>
                          <div className="w-8 h-4 rounded-t-lg bg-[#065f46] mt-0.5" />
                        </div>
                      )}
                      {char.id === "nuri" && (
                        <div className="text-2xl animate-pulse">⭐</div>
                      )}
                      {char.id === "ayesha" && (
                        <div className="flex flex-col items-center">
                          <div className="w-7 h-7 rounded-full bg-[#ffedd5] border border-[#c084fc] flex items-center justify-center text-[10px] font-black text-slate-800">
                            🧕
                          </div>
                          <div className="w-8 h-4 rounded-t-lg bg-[#7c3aed] mt-0.5" />
                        </div>
                      )}
                    </div>
                    <span className="mt-1 text-[11px] font-medium text-[#EEF4FB] group-hover:text-[#259CFF] text-center truncate w-full">
                      {char.name}
                    </span>
                  </button>
                ))}
            </div>
          </div>
        )}

        {/* BACKGROUNDS SECTION */}
        {showBackgrounds && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="font-extrabold text-white text-[12px] tracking-tight">Backgrounds</span>
              <button
                onClick={() => setSelectedFilter("backgrounds")}
                className="text-[10px] text-[#259CFF] hover:underline font-semibold"
              >
                See all
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {backgrounds
                .filter((b) => matchesSearch(b.name, b.id))
                .map((bg) => (
                  <button
                    key={bg.id}
                    onClick={() =>
                      onInsertAsset({
                        id: bg.id,
                        type: bg.type,
                        name: bg.name,
                      })
                    }
                    className="flex flex-col items-center group text-left cursor-pointer transition active:scale-95"
                    title={`Click to set ${bg.name} as scene background`}
                  >
                    <div
                      className={`w-[74px] h-[52px] rounded-xl bg-gradient-to-br ${bg.gradient} border border-[#213248] group-hover:border-[#259CFF] group-hover:shadow-lg group-hover:shadow-[#259CFF]/20 flex items-center justify-center relative overflow-hidden transition`}
                    >
                      <ImageIcon className="w-4 h-4 text-white/70 group-hover:scale-110 transition" />
                    </div>
                    <span className="mt-1 text-[11px] font-medium text-[#EEF4FB] group-hover:text-[#259CFF] text-center truncate w-full">
                      {bg.name}
                    </span>
                  </button>
                ))}
            </div>
          </div>
        )}

        {/* OBJECTS SECTION */}
        {showObjects && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="font-extrabold text-white text-[12px] tracking-tight">Objects</span>
              <button
                onClick={() => setSelectedFilter("objects")}
                className="text-[10px] text-[#259CFF] hover:underline font-semibold"
              >
                See all
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {objects
                .filter((o) => matchesSearch(o.name, o.id))
                .map((obj) => (
                  <button
                    key={obj.id}
                    onClick={() =>
                      onInsertAsset({
                        id: obj.id,
                        type: obj.type,
                        name: obj.name,
                      })
                    }
                    className="flex flex-col items-center group text-left cursor-pointer transition active:scale-95"
                    title={`Click to add ${obj.name} to active scene`}
                  >
                    <div
                      className={`w-[74px] h-[52px] rounded-xl bg-gradient-to-br ${obj.gradient} border border-[#213248] group-hover:border-[#259CFF] group-hover:shadow-lg group-hover:shadow-[#259CFF]/20 flex items-center justify-center relative overflow-hidden transition`}
                    >
                      {obj.id === "lantern" && <span className="text-lg">🏮</span>}
                      {obj.id === "book" && <span className="text-lg">📖</span>}
                      {obj.id === "tree" && <span className="text-lg">🌳</span>}
                    </div>
                    <span className="mt-1 text-[11px] font-medium text-[#EEF4FB] group-hover:text-[#259CFF] text-center truncate w-full">
                      {obj.name}
                    </span>
                  </button>
                ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
