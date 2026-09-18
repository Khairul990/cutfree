/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Asset Manager & Library Panel for CutFree Studio.
 */

import React, { useState } from "react";
import {
  FolderKanban,
  User,
  Image as ImageIcon,
  Box,
  Music,
  Plus,
  Search,
} from "lucide-react";
import { BlueprintAsset } from "../types/blueprint";
import { assetResolver } from "../core/asset-resolver";

export interface AssetPanelProps {
  onInsertAsset: (asset: BlueprintAsset) => void;
  onCustomImageUpload: (id: string, img: HTMLImageElement) => void;
}

export const AssetPanel: React.FC<AssetPanelProps> = ({
  onInsertAsset,
  onCustomImageUpload,
}) => {
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const allAssets = assetResolver.getAllAssets();

  const filteredAssets = allAssets.filter((asset) => {
    const matchesCat = activeCategory === "all" || asset.type === activeCategory;
    const matchesSearch =
      !searchQuery ||
      (asset.name && asset.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      asset.id.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const id = `custom_${file.name.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
        assetResolver.registerCustomImage(id, img);
        assetResolver.registerAsset({
          id,
          type: "image",
          name: file.name,
          description: "User uploaded image",
        });
        onCustomImageUpload(id, img);
      };
      img.src = String(ev.target?.result);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="w-[270px] bg-[#0d131d] border-r border-[#202c3d] flex flex-col h-full text-[12px]">
      {/* Header */}
      <div className="p-3.5 border-b border-[#1e2740] flex items-center justify-between bg-[#0a1018]">
        <div className="flex items-center gap-2">
          <FolderKanban className="w-4 h-4 text-[#38bdf8]" />
          <span className="font-extrabold text-white">Asset Library</span>
        </div>
        <label className="p-1 rounded-lg bg-[#151b2e] hover:bg-[#1e2740] text-[#38bdf8] border border-[#29374b] cursor-pointer" title="Upload Custom Asset">
          <Plus className="w-4 h-4" />
          <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
        </label>
      </div>

      {/* Search */}
      <div className="p-2.5 border-b border-[#1e2740] bg-[#0b1119]">
        <div className="flex items-center gap-2 bg-[#111925] px-2.5 py-1.5 rounded-lg border border-[#232d47]">
          <Search className="w-3.5 h-3.5 text-[#5f6d82]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search assets..."
            className="w-full bg-transparent text-white outline-none text-[11px]"
          />
        </div>
      </div>

      {/* Categories */}
      <div className="grid grid-cols-4 p-1.5 gap-1 bg-[#090d1a] border-b border-[#1e2740] text-[10px] font-bold">
        {[
          { id: "all", label: "All" },
          { id: "background", label: "BG" },
          { id: "character", label: "Cast" },
          { id: "object", label: "Props" },
        ].map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`py-1 rounded text-center transition ${
              activeCategory === cat.id ? "bg-[#38bdf8] text-[#051018]" : "text-[#8d9bb0] hover:bg-[#151b2e]"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Assets Grid */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2 scrollbar-thin scrollbar-thumb-[#232d47]">
        {filteredAssets.map((asset) => (
          <div
            key={asset.id}
            onClick={() => onInsertAsset(asset)}
            className="p-2 rounded-lg bg-[#121829] border border-[#1e2740] hover:border-[#38bdf8] transition cursor-pointer flex items-center gap-2.5 group"
          >
            <div className="w-8 h-8 rounded-lg bg-[#1a233d] flex items-center justify-center text-[#38bdf8] shrink-0 group-hover:scale-105 transition">
              {asset.type === "character" ? (
                <User className="w-4 h-4 text-[#f472b6]" />
              ) : asset.type === "background" ? (
                <ImageIcon className="w-4 h-4 text-[#2dd4bf]" />
              ) : (
                <Box className="w-4 h-4 text-[#fbbf24]" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-white text-[11.5px] truncate">{asset.name || asset.id}</div>
              <div className="text-[10px] text-[#64748b] truncate">{asset.id}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
