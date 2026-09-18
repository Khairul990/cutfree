/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Left Navigation Rail for CutFree Studio.
 * Matches exact layout and visual design specification.
 */

import React from "react";
import {
  FolderKanban,
  Film,
  AudioLines,
  Type,
  Users,
  Image as ImageIcon,
  Box,
  Music,
  LayoutTemplate,
} from "lucide-react";

export type LeftNavTab =
  | "assets"
  | "scenes"
  | "audio"
  | "text"
  | "characters"
  | "backgrounds"
  | "objects"
  | "music"
  | "templates";

export interface LeftNavProps {
  activeTab: LeftNavTab;
  onSelectTab: (tab: LeftNavTab) => void;
  assetCount?: number;
}

const NAV_ITEMS: { id: LeftNavTab; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number }[] = [
  { id: "assets", label: "Assets", icon: FolderKanban, badge: 4 },
  { id: "scenes", label: "Scenes", icon: Film },
  { id: "audio", label: "Audio", icon: AudioLines },
  { id: "text", label: "Text", icon: Type },
  { id: "characters", label: "Characters", icon: Users },
  { id: "backgrounds", label: "Backgrounds", icon: ImageIcon },
  { id: "objects", label: "Objects", icon: Box },
  { id: "music", label: "Music & SFX", icon: Music },
  { id: "templates", label: "Templates", icon: LayoutTemplate },
];

export const LeftNav: React.FC<LeftNavProps> = ({
  activeTab,
  onSelectTab,
  assetCount = 4,
}) => {
  return (
    <nav className="w-[76px] bg-[#0C1724] border-r border-[#213248] flex flex-col items-center py-2.5 gap-1 shrink-0 z-20 select-none overflow-y-auto scrollbar-none">
      {NAV_ITEMS.map((item) => {
        const isActive = activeTab === item.id;
        const Icon = item.icon;

        return (
          <button
            key={item.id}
            onClick={() => onSelectTab(item.id)}
            className={`w-[66px] h-[58px] rounded-xl flex flex-col items-center justify-center relative transition group ${
              isActive
                ? "bg-[#259CFF] text-white shadow-md shadow-[#259CFF]/25 font-bold"
                : "text-[#8DA0B4] hover:text-white hover:bg-[#0F1C2A]"
            }`}
            title={item.label}
          >
            <div className="relative">
              <Icon className={`w-5 h-5 mb-1 ${isActive ? "text-white" : "text-[#8DA0B4] group-hover:text-white"}`} />
              {item.badge && !isActive && (
                <span className="absolute -top-1 -right-2 w-4 h-4 rounded-full bg-[#259CFF] text-white text-[9px] font-extrabold flex items-center justify-center">
                  {item.badge}
                </span>
              )}
            </div>
            <span className="text-[10px] leading-tight tracking-tight text-center truncate w-full px-1">
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};
