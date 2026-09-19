/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Professional Media Library & Import Panel for CutFree Studio (Phase 2.1 & 2.2).
 * Integrates canonical MediaImportEngine, permanent IndexedDB storage, Drag & Drop,
 * batch import, duplicate resolution, technical metadata inspection, and relink/replace workflows.
 */

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Search,
  SlidersHorizontal,
  Plus,
  Users,
  Image as ImageIcon,
  Box,
  Music,
  Sparkles,
  Layers,
  LayoutTemplate,
  Monitor,
  Smartphone,
  Square,
  Check,
  Link,
  Download,
  FileText,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Globe,
  Subtitles,
  Trash2,
  Edit2,
  Eye,
  X,
  Film,
  Volume2,
  Tag,
  Clock,
  HardDrive,
  Maximize2,
  Play,
  Pause,
  ArrowUpDown,
  Upload,
  RefreshCw,
  AlertTriangle,
  FileWarning,
} from "lucide-react";
import { BlueprintAsset, AssetType, VideoBlueprint } from "../types/blueprint";
import { assetResolver } from "../core/asset-resolver";
import { mediaImportEngine, ImportProgress } from "../core/media-import-engine";
import { mediaStorage } from "../core/media-storage";

export interface AssetPanelProps {
  blueprint?: VideoBlueprint;
  onInsertAsset: (asset: BlueprintAsset) => void;
  onCustomImageUpload: (id: string, img: HTMLImageElement) => void;
  onApplyTemplate?: (templateId: string) => void;
  onImportSubtitles?: (captions: any[]) => void;
  onImportAudioFromUrl?: (audioUrl: string, title: string) => void;
  onUpdateAssets?: (assets: BlueprintAsset[]) => void;
  activeNavTab?: string;
}

export type AssetFilter =
  | "all"
  | "characters"
  | "backgrounds"
  | "objects"
  | "audio_music"
  | "video"
  | "subtitles"
  | "url_import";

export type AssetSort =
  | "name_asc"
  | "name_desc"
  | "date_desc"
  | "date_asc"
  | "duration_desc"
  | "size_desc";

export const AssetPanel: React.FC<AssetPanelProps> = ({
  blueprint,
  onInsertAsset,
  onCustomImageUpload,
  onApplyTemplate,
  onImportSubtitles,
  onImportAudioFromUrl,
  onUpdateAssets,
  activeNavTab = "assets",
}) => {
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedFilter, setSelectedFilter] = useState<AssetFilter>("all");
  const [sortOption, setSortOption] = useState<AssetSort>("date_desc");
  const [isSortMenuOpen, setIsSortMenuOpen] = useState<boolean>(false);
  const [appliedTemplateId, setAppliedTemplateId] = useState<string | null>(null);

  // Drag & Drop State
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);

  // Import Progress & Feedback State
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [importStatusToast, setImportStatusToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  // Duplicate Warning State
  const [duplicatePrompt, setDuplicatePrompt] = useState<{
    file: File;
    existingAsset: BlueprintAsset;
  } | null>(null);

  // Missing Media / Relink States
  const [missingAssetIds, setMissingAssetIds] = useState<Set<string>>(new Set());
  const [relinkTargetAssetId, setRelinkTargetAssetId] = useState<string | null>(null);

  // Preview & Modal States
  const [previewAsset, setPreviewAsset] = useState<BlueprintAsset | null>(null);
  const [renamingAsset, setRenamingAsset] = useState<BlueprintAsset | null>(null);
  const [renameValue, setRenameValue] = useState<string>("");

  // URL Import & yt-dlp States
  const [urlInput, setUrlInput] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [analysisError, setAnalysisError] = useState<string>("");
  const [selectedFormat, setSelectedFormat] = useState<string>("video_1080p");
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [downloadJobs, setDownloadJobs] = useState<any[]>([]);
  const [subtitleStatus, setSubtitleStatus] = useState<string>("");

  // File input refs
  const universalFileInputRef = useRef<HTMLInputElement>(null);
  const relinkFileInputRef = useRef<HTMLInputElement>(null);

  // Sync LeftNav tab with filter
  useEffect(() => {
    if (activeNavTab === "characters") setSelectedFilter("characters");
    else if (activeNavTab === "backgrounds") setSelectedFilter("backgrounds");
    else if (activeNavTab === "objects") setSelectedFilter("objects");
    else if (activeNavTab === "music") setSelectedFilter("audio_music");
    else if (activeNavTab === "audio") setSelectedFilter("url_import");
    else if (activeNavTab === "text") setSelectedFilter("subtitles");
    else if (activeNavTab === "assets") setSelectedFilter("all");
  }, [activeNavTab]);

  // Combine built-in assets and blueprint assets
  const allAssets: BlueprintAsset[] = useMemo(() => {
    const builtinMap = new Map<string, BlueprintAsset>();
    for (const a of assetResolver.getAllAssets()) {
      builtinMap.set(a.id, a);
    }
    if (blueprint?.assets && Array.isArray(blueprint.assets)) {
      for (const a of blueprint.assets) {
        builtinMap.set(a.id, { ...builtinMap.get(a.id), ...a });
      }
    }
    return Array.from(builtinMap.values());
  }, [blueprint?.assets]);

  // Media Health Check (Detect any missing IndexedDB blobs)
  useEffect(() => {
    mediaImportEngine.verifyMediaHealth(allAssets).then(({ missingIds }) => {
      setMissingAssetIds(new Set(missingIds));
    });
  }, [allAssets]);

  // Filter and sort assets
  const filteredAssets = useMemo(() => {
    let list = allAssets.filter((asset) => {
      // Category filter
      if (selectedFilter === "characters" && asset.type !== "character") return false;
      if (selectedFilter === "backgrounds" && asset.type !== "background") return false;
      if (selectedFilter === "objects" && asset.type !== "object" && asset.type !== "prop") return false;
      if (
        selectedFilter === "audio_music" &&
        asset.type !== "audio" &&
        asset.type !== "music" &&
        asset.type !== "sfx"
      )
        return false;
      if (selectedFilter === "video" && asset.type !== "video") return false;
      if (selectedFilter === "subtitles" && asset.type !== "subtitle") return false;

      // Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const nameMatch = (asset.name || "").toLowerCase().includes(q);
        const idMatch = asset.id.toLowerCase().includes(q);
        const descMatch = (asset.description || "").toLowerCase().includes(q);
        const tagMatch = asset.metadata?.tags?.some((t) => t.toLowerCase().includes(q));
        if (!nameMatch && !idMatch && !descMatch && !tagMatch) return false;
      }

      return true;
    });

    // Sorting
    list.sort((a, b) => {
      if (sortOption === "name_asc") {
        return (a.name || a.id).localeCompare(b.name || b.id);
      } else if (sortOption === "name_desc") {
        return (b.name || b.id).localeCompare(a.name || a.id);
      } else if (sortOption === "date_desc") {
        return (b.metadata?.createdAt || 0) - (a.metadata?.createdAt || 0);
      } else if (sortOption === "date_asc") {
        return (a.metadata?.createdAt || 0) - (b.metadata?.createdAt || 0);
      } else if (sortOption === "duration_desc") {
        return (b.metadata?.duration || 0) - (a.metadata?.duration || 0);
      } else if (sortOption === "size_desc") {
        return (b.metadata?.fileSize || 0) - (a.metadata?.fileSize || 0);
      }
      return 0;
    });

    return list;
  }, [allAssets, selectedFilter, searchQuery, sortOption]);

  // Canonical Batch Import Handler
  const handleImportFiles = async (files: File[], forceDuplicate: boolean = false) => {
    if (!files || files.length === 0) return;

    setImportStatusToast(null);
    let newlyImported: BlueprintAsset[] = [];
    let hadDuplicates = false;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      const res = await mediaImportEngine.importFile(file, allAssets, {
        forceDuplicate,
        onProgress: (progress) => {
          setImportProgress(progress);
        },
      });

      if (res.success && res.asset) {
        newlyImported.push(res.asset);
        // If single image uploaded, trigger legacy custom image handler for active scene
        if (
          files.length === 1 &&
          (res.asset.type === "image" || res.asset.type === "background") &&
          res.asset.src
        ) {
          const img = new Image();
          img.onload = () => {
            onCustomImageUpload(res.asset!.id, img);
          };
          img.src = res.asset.src;
        }
      } else if (res.isDuplicate && res.duplicateOf) {
        hadDuplicates = true;
        setDuplicatePrompt({ file, existingAsset: res.duplicateOf });
      } else if (res.error) {
        setImportStatusToast({ message: res.error, type: "error" });
      }
    }

    if (newlyImported.length > 0) {
      const updatedList = [...allAssets, ...newlyImported];
      if (onUpdateAssets) onUpdateAssets(updatedList);
      setImportStatusToast({
        message: `✅ Successfully imported ${newlyImported.length} asset${newlyImported.length > 1 ? "s" : ""}`,
        type: "success",
      });
    }

    setTimeout(() => {
      setImportProgress(null);
    }, 1200);
  };

  // Drag and drop events
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      await handleImportFiles(files);
    }
  };

  // Relink / Replace Execution
  const handleExecuteRelink = async (file: File) => {
    if (!relinkTargetAssetId) return;
    try {
      const updated = await mediaImportEngine.relinkMedia(relinkTargetAssetId, file);
      if (onUpdateAssets) {
        onUpdateAssets(allAssets.map((a) => (a.id === relinkTargetAssetId ? updated : a)));
      }
      setMissingAssetIds((prev) => {
        const next = new Set(prev);
        next.delete(relinkTargetAssetId);
        return next;
      });
      if (previewAsset?.id === relinkTargetAssetId) {
        setPreviewAsset(updated);
      }
      setImportStatusToast({
        message: `✅ Media reconnected for "${updated.name || relinkTargetAssetId}"`,
        type: "success",
      });
    } catch (err: any) {
      setImportStatusToast({ message: `Relink error: ${err.message}`, type: "error" });
    } finally {
      setRelinkTargetAssetId(null);
    }
  };

  // Asset Rename
  const handleSaveRename = () => {
    if (!renamingAsset || !renameValue.trim()) return;
    const updated = assetResolver.updateAsset(renamingAsset.id, { name: renameValue.trim() });
    if (updated && onUpdateAssets) {
      const updatedList = allAssets.map((a) =>
        a.id === renamingAsset.id ? { ...a, name: renameValue.trim() } : a
      );
      onUpdateAssets(updatedList);
    }
    setRenamingAsset(null);
  };

  // Asset Delete
  const handleDeleteAsset = async (assetId: string) => {
    if (window.confirm(`Are you sure you want to remove this asset?`)) {
      assetResolver.deleteAsset(assetId);
      await mediaStorage.deleteMediaBlob(assetId);

      if (onUpdateAssets) {
        onUpdateAssets(allAssets.filter((a) => a.id !== assetId));
      }
      if (previewAsset?.id === assetId) {
        setPreviewAsset(null);
      }
    }
  };

  // URL Media Analyze
  const handleAnalyzeUrl = async () => {
    if (!urlInput.trim()) return;
    setIsAnalyzing(true);
    setAnalysisError("");
    setAnalysisResult(null);

    try {
      const res = await fetch("/api/media/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to analyze URL");
      setAnalysisResult(data);
    } catch (err: any) {
      setAnalysisError(err.message || "Could not analyze URL");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Enqueue Media Download
  const handleImportFromUrl = async () => {
    if (!analysisResult) return;
    setIsImporting(true);

    try {
      const res = await fetch("/api/media/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: analysisResult.url,
          format: selectedFormat,
          title: analysisResult.title,
          thumbnail: analysisResult.thumbnail,
        }),
      });
      const data = await res.json();
      if (data.job) {
        setDownloadJobs((prev) => [data.job, ...prev]);

        if (selectedFormat.includes("audio") && onImportAudioFromUrl) {
          onImportAudioFromUrl(analysisResult.url, analysisResult.title);
        } else {
          const stableId = mediaImportEngine.generateStableAssetId("url", analysisResult.title || "media");
          const asset: BlueprintAsset = {
            id: stableId,
            type: selectedFormat.includes("audio") ? "audio" : "video",
            name: analysisResult.title,
            description: `Imported from ${analysisResult.platform}`,
            source: "url",
            metadata: {
              sourceUrl: analysisResult.url,
              duration: analysisResult.duration,
              createdAt: Date.now(),
            },
          };
          assetResolver.registerAsset(asset);
          if (onUpdateAssets) onUpdateAssets([...allAssets, asset]);
          onInsertAsset(asset);
        }
      }
    } catch (err: any) {
      setAnalysisError(err.message || "Failed to enqueue download");
    } finally {
      setIsImporting(false);
    }
  };

  // Subtitle File Upload (.srt / .vtt)
  const handleSubtitleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSubtitleStatus("Parsing subtitles...");
    try {
      const text = await file.text();
      const res = await fetch("/api/subtitles/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to parse subtitles");

      if (onImportSubtitles && data.captions) {
        onImportSubtitles(data.captions);
        setSubtitleStatus(`✅ Imported ${data.captions.length} captions from ${file.name}`);

        const stableId = mediaImportEngine.generateStableAssetId("sub", file.name);
        const asset: BlueprintAsset = {
          id: stableId,
          type: "subtitle",
          name: file.name,
          description: `Subtitle file with ${data.captions.length} captions`,
          source: "upload",
          metadata: {
            captionCount: data.captions.length,
            fileSize: file.size,
            mimeType: file.type || "text/vtt",
            createdAt: Date.now(),
          },
        };
        assetResolver.registerAsset(asset);
        if (onUpdateAssets) onUpdateAssets([...allAssets, asset]);
      }
    } catch (err: any) {
      setSubtitleStatus(`❌ ${err.message}`);
    }
  };

  const templates = [
    {
      id: "islamic_story",
      name: "Islamic Story",
      desc: "Warm • slow camera • word reveal",
      aspect: "16:9",
      theme: "warm",
      icon: Monitor,
      gradient: "from-[#0f172a] via-[#0e7490] to-[#047857]",
    },
    {
      id: "shorts_fast",
      name: "Shorts Fast",
      desc: "9:16 • energetic motion • pop text",
      aspect: "9:16",
      theme: "electric",
      icon: Smartphone,
      gradient: "from-[#4c1d95] via-[#7c3aed] to-[#ec4899]",
    },
    {
      id: "cinematic",
      name: "Cinematic",
      desc: "Dramatic camera • blur transitions",
      aspect: "16:9",
      theme: "cinematic",
      icon: Monitor,
      gradient: "from-[#18181b] via-[#27272a] to-[#3f3f46]",
    },
    {
      id: "minimal",
      name: "Minimal",
      desc: "Clean cuts • static camera",
      aspect: "1:1",
      theme: "clean",
      icon: Square,
      gradient: "from-[#064e3b] via-[#047857] to-[#10b981]",
    },
  ];

  useEffect(() => {
    const map: Record<string, AssetFilter> = {
      characters: "characters",
      backgrounds: "backgrounds",
      objects: "objects",
    };
    if (activeNavTab && map[activeNavTab]) setSelectedFilter(map[activeNavTab]);
    else if (activeNavTab === "assets") setSelectedFilter("all");
  }, [activeNavTab]);

  const isTemplatesMode = activeNavTab === "templates";

  return (
    <aside
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`w-[300px] bg-[#0C1724] border-r border-[#213248] flex flex-col h-full shrink-0 z-30 select-none text-[12px] overflow-hidden relative transition-colors ${
        isDraggingOver ? "ring-2 ring-[#259CFF] bg-[#071524]" : ""
      }`}
    >
      {/* Visual Drag & Drop Overlay */}
      {isDraggingOver && (
        <div className="absolute inset-0 z-40 bg-[#0C1724]/90 backdrop-blur-xs flex flex-col items-center justify-center p-4 border-2 border-dashed border-[#259CFF] rounded-lg">
          <Upload className="w-10 h-10 text-[#259CFF] animate-bounce mb-2" />
          <p className="font-extrabold text-white text-sm text-center">Drop Media Files Here</p>
          <p className="text-[11px] text-[#8DA0B4] text-center mt-1">
            Supports MP4, WebM, WAV, MP3, PNG, JPG, WEBP, and Subtitles
          </p>
        </div>
      )}

      {/* Top Header */}
      <div className="p-3 border-b border-[#213248] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="font-extrabold text-white text-[14px] tracking-tight">
            {isTemplatesMode ? "Video Templates" : "Media Library"}
          </h2>
          {!isTemplatesMode && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-[#16273b] text-[#259CFF] font-bold">
              {filteredAssets.length}
            </span>
          )}
        </div>

        {!isTemplatesMode && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => universalFileInputRef.current?.click()}
              className="px-2 py-1 rounded-lg bg-[#259CFF] hover:bg-[#1d82d8] text-white font-bold text-[11px] flex items-center gap-1 shadow-sm transition"
              title="Import media files (Video, Audio, Images, Subtitles)"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Import</span>
            </button>
            <input
              ref={universalFileInputRef}
              type="file"
              multiple
              accept="image/*,audio/*,video/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleImportFiles(Array.from(e.target.files));
                  e.target.value = "";
                }
              }}
            />

            {/* Hidden Relink File Input */}
            <input
              ref={relinkFileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleExecuteRelink(file);
              }}
            />
          </div>
        )}
      </div>

      {/* Active Import Progress Bar Banner */}
      {importProgress && (
        <div className="bg-[#071322] border-b border-[#213248] px-3 py-2 text-[10px] space-y-1">
          <div className="flex items-center justify-between text-white font-medium">
            <span className="truncate max-w-[200px]">
              {importProgress.stage === "extracting"
                ? `Analyzing ${importProgress.fileName}...`
                : importProgress.stage === "persisting"
                ? `Storing ${importProgress.fileName}...`
                : importProgress.stage === "registering"
                ? `Registering asset...`
                : `Importing ${importProgress.fileName}...`}
            </span>
            <span className="text-[#259CFF] font-mono">{importProgress.progressPct}%</span>
          </div>
          <div className="w-full h-1.5 bg-[#162234] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#259CFF] to-[#28D7A0] transition-all duration-200"
              style={{ width: `${importProgress.progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {importStatusToast && (
        <div
          className={`px-3 py-1.5 text-[10px] font-semibold flex items-center justify-between border-b ${
            importStatusToast.type === "error"
              ? "bg-[#ef4444]/20 text-[#fca5a5] border-[#ef4444]/40"
              : "bg-[#28D7A0]/20 text-[#86efac] border-[#28D7A0]/40"
          }`}
        >
          <span className="truncate">{importStatusToast.message}</span>
          <button onClick={() => setImportStatusToast(null)} className="opacity-70 hover:opacity-100 ml-2">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {isTemplatesMode ? (
        /* TEMPLATES VIEW */
        <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
          <p className="text-[11px] text-[#8DA0B4]">
            Select a curated template to instantly apply colors, aspect ratio, motion presets, and typography.
          </p>
          <div className="space-y-2.5">
            {templates.map((tpl) => {
              const Icon = tpl.icon;
              const isApplied = appliedTemplateId === tpl.id;
              return (
                <div
                  key={tpl.id}
                  className={`p-3 rounded-xl border transition ${
                    isApplied
                      ? "bg-[#259CFF]/15 border-[#259CFF] ring-2 ring-[#259CFF]/30"
                      : "bg-[#07101A] border-[#213248] hover:border-[#259CFF]/60"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-6 h-6 rounded-lg bg-gradient-to-br ${tpl.gradient} flex items-center justify-center text-white`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <span className="font-extrabold text-white text-[12px]">{tpl.name}</span>
                    </div>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/40 text-[#8DA0B4]">
                      {tpl.aspect}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#8DA0B4] mb-2.5 leading-tight">{tpl.desc}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setAppliedTemplateId(tpl.id);
                      if (onApplyTemplate) onApplyTemplate(tpl.id);
                    }}
                    className={`w-full py-1.5 rounded-lg font-bold text-[11px] flex items-center justify-center gap-1.5 transition ${
                      isApplied
                        ? "bg-[#28D7A0] text-[#022c22]"
                        : "bg-[#0F1C2A] hover:bg-[#259CFF] text-[#EEF4FB] border border-[#213248] hover:border-[#259CFF]"
                    }`}
                  >
                    {isApplied ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Applied</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-[#259CFF]" />
                        <span>Apply Template</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* PROFESSIONAL MEDIA LIBRARY VIEW */
        <>
          {/* Search & Sort Bar */}
          <div className="px-3 py-2 border-b border-[#213248] flex items-center gap-2">
            <div className="flex-1 flex items-center gap-1.5 bg-[#07101A] px-2.5 py-1.5 rounded-lg border border-[#213248] focus-within:border-[#259CFF] transition">
              <Search className="w-3.5 h-3.5 text-[#8DA0B4]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search assets, tags, type..."
                className="w-full bg-transparent text-white outline-none text-[11px] placeholder-[#8DA0B4]"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="text-[#8DA0B4] hover:text-white">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Sort Toggle */}
            <div className="relative">
              <button
                onClick={() => setIsSortMenuOpen(!isSortMenuOpen)}
                className={`p-1.5 rounded-lg border text-[#8DA0B4] hover:text-white transition ${
                  isSortMenuOpen
                    ? "bg-[#259CFF] text-white border-[#259CFF]"
                    : "bg-[#0F1C2A] border-[#213248] hover:border-[#259CFF]"
                }`}
                title="Sort Assets"
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
              </button>

              {isSortMenuOpen && (
                <div className="absolute right-0 top-8 w-36 bg-[#0B1522] border border-[#213248] rounded-lg shadow-xl py-1 z-30 text-[10px]">
                  {[
                    { id: "date_desc", label: "Newest First" },
                    { id: "date_asc", label: "Oldest First" },
                    { id: "name_asc", label: "Name (A-Z)" },
                    { id: "name_desc", label: "Name (Z-A)" },
                    { id: "duration_desc", label: "Longest Duration" },
                    { id: "size_desc", label: "Largest Size" },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => {
                        setSortOption(opt.id as AssetSort);
                        setIsSortMenuOpen(false);
                      }}
                      className={`w-full text-left px-2.5 py-1 hover:bg-[#16273b] transition flex items-center justify-between ${
                        sortOption === opt.id ? "text-[#259CFF] font-bold" : "text-[#EEF4FB]"
                      }`}
                    >
                      <span>{opt.label}</span>
                      {sortOption === opt.id && <Check className="w-3 h-3 text-[#259CFF]" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Filter Category Pills */}
          <div className="px-3 py-1.5 border-b border-[#213248] flex items-center gap-1 overflow-x-auto scrollbar-none">
            {[
              { id: "all", label: "All" },
              { id: "characters", label: "Characters" },
              { id: "backgrounds", label: "Backgrounds" },
              { id: "objects", label: "Props" },
              { id: "audio_music", label: "Audio & Music" },
              { id: "video", label: "Video" },
              { id: "subtitles", label: "Subtitles" },
              { id: "url_import", label: "URL Import" },
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedFilter(cat.id as AssetFilter)}
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition whitespace-nowrap ${
                  selectedFilter === cat.id
                    ? "bg-[#259CFF] text-white shadow-sm"
                    : "bg-[#0F1C2A] text-[#8DA0B4] hover:text-white border border-[#213248]"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Main Scrollable Library */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
            {/* URL MEDIA IMPORT SECTION */}
            {(selectedFilter === "url_import" || activeNavTab === "audio") && (
              <div className="p-3 rounded-xl bg-[#08101a] border border-[#213248] space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-white text-[12px]">
                    <Globe className="w-3.5 h-3.5 text-[#259CFF]" />
                    <span>URL Media Import (yt-dlp)</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="url"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      placeholder="Paste YouTube, Vimeo, or Media URL..."
                      className="flex-1 bg-[#0C1724] border border-[#213248] focus:border-[#259CFF] rounded-lg px-2 py-1.5 text-white outline-none text-[11px] placeholder-[#8DA0B4]"
                    />
                    <button
                      type="button"
                      onClick={handleAnalyzeUrl}
                      disabled={isAnalyzing || !urlInput.trim()}
                      className="px-2.5 py-1.5 rounded-lg bg-[#259CFF] hover:bg-[#1e80d4] disabled:opacity-50 text-white font-bold text-[11px] flex items-center gap-1 transition"
                    >
                      {isAnalyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : <span>Analyze</span>}
                    </button>
                  </div>
                  {analysisError && (
                    <div className="text-[10px] text-[#ef4444] flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      <span>{analysisError}</span>
                    </div>
                  )}
                </div>

                {/* Analysis Result Card */}
                {analysisResult && (
                  <div className="p-2.5 rounded-lg bg-[#0C1724] border border-[#213248] space-y-2 text-[11px]">
                    <div className="flex gap-2">
                      {analysisResult.thumbnail ? (
                        <img
                          src={analysisResult.thumbnail}
                          alt="Thumbnail"
                          className="w-16 h-11 object-cover rounded bg-black/40 border border-[#213248]"
                        />
                      ) : (
                        <div className="w-16 h-11 rounded bg-black/40 border border-[#213248] flex items-center justify-center text-[9px] text-[#8DA0B4]">
                          No Preview
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-white truncate" title={analysisResult.title}>
                          {analysisResult.title}
                        </div>
                        <div className="text-[10px] text-[#8DA0B4] flex items-center gap-1">
                          <span className="capitalize">{analysisResult.platform}</span>
                          <span>•</span>
                          <span>{analysisResult.duration}s</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] text-[#8DA0B4] mb-1 font-semibold">
                        Quality & Target Format
                      </label>
                      <select
                        value={selectedFormat}
                        onChange={(e) => setSelectedFormat(e.target.value)}
                        className="w-full bg-[#07101A] border border-[#213248] rounded px-2 py-1 text-white text-[11px] outline-none"
                      >
                        {analysisResult.availableFormats?.map((f: any) => (
                          <option key={f.id} value={f.id}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={handleImportFromUrl}
                      disabled={isImporting}
                      className="w-full py-1.5 rounded bg-[#28D7A0] hover:bg-[#22c55e] text-[#022c22] font-black text-[11px] flex items-center justify-center gap-1 transition"
                    >
                      {isImporting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                      <span>Import to CutFree</span>
                    </button>
                  </div>
                )}

                {/* Download Queue Status */}
                {downloadJobs.length > 0 && (
                  <div className="space-y-1.5 pt-1 border-t border-[#213248]">
                    <span className="text-[10px] font-bold text-[#8DA0B4] uppercase">Download Queue</span>
                    {downloadJobs.slice(0, 3).map((job) => (
                      <div key={job.id} className="p-2 rounded bg-[#0A121E] border border-[#213248] text-[10px]">
                        <div className="flex items-center justify-between font-semibold text-white mb-1 truncate">
                          <span className="truncate">{job.title}</span>
                          <span className="text-[#259CFF] font-mono">{job.progressPct}%</span>
                        </div>
                        <div className="w-full h-1 bg-[#162234] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-[#259CFF] to-[#28D7A0] transition-all duration-300"
                            style={{ width: `${job.progressPct}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* SUBTITLE IMPORT SECTION */}
            {(selectedFilter === "subtitles" || activeNavTab === "text") && (
              <div className="p-3 rounded-xl bg-[#08101a] border border-[#213248] space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-white text-[12px]">
                    <Subtitles className="w-3.5 h-3.5 text-[#28D7A0]" />
                    <span>Subtitle Importer (.srt / .vtt)</span>
                  </div>
                </div>
                <p className="text-[10px] text-[#8DA0B4] leading-tight">
                  Import SRT or WebVTT subtitles directly into timeline caption tracks.
                </p>

                <label className="w-full py-1.5 rounded-lg bg-[#0F1C2A] hover:bg-[#16273b] border border-[#213248] hover:border-[#28D7A0] text-white font-bold text-[11px] flex items-center justify-center gap-1.5 cursor-pointer transition">
                  <FileText className="w-3.5 h-3.5 text-[#28D7A0]" />
                  <span>Upload .SRT / .VTT File</span>
                  <input
                    type="file"
                    accept=".srt,.vtt,text/plain"
                    className="hidden"
                    onChange={handleSubtitleFileUpload}
                  />
                </label>
                {subtitleStatus && (
                  <div className="text-[10px] text-[#28D7A0] font-semibold">{subtitleStatus}</div>
                )}
              </div>
            )}

            {/* ASSET GRID LIST */}
            {filteredAssets.length === 0 ? (
              <div className="py-8 text-center text-[#8DA0B4] space-y-2">
                <Layers className="w-8 h-8 mx-auto opacity-40 text-[#259CFF]" />
                <p className="text-[11px]">No assets found</p>
                <button
                  onClick={() => universalFileInputRef.current?.click()}
                  className="px-3 py-1 bg-[#16273b] hover:bg-[#259CFF] text-white rounded-lg text-[10px] font-bold transition"
                >
                  Upload New Asset
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {filteredAssets.map((asset) => {
                  const isImage = asset.type === "image" || asset.type === "background" || asset.type === "thumbnail";
                  const isAudio = asset.type === "audio" || asset.type === "music" || asset.type === "sfx";
                  const isVideo = asset.type === "video";
                  const isSub = asset.type === "subtitle";
                  const isChar = asset.type === "character";
                  const isMissing = missingAssetIds.has(asset.id);

                  return (
                    <div
                      key={asset.id}
                      className={`group bg-[#07101A] border rounded-xl overflow-hidden flex flex-col transition shadow-sm hover:shadow-md relative ${
                        isMissing
                          ? "border-[#ef4444]/60 bg-[#160a0a]"
                          : "border-[#213248] hover:border-[#259CFF]/70"
                      }`}
                    >
                      {/* Visual Header / Thumbnail */}
                      <div className="h-[76px] bg-[#0A1422] relative flex items-center justify-center overflow-hidden border-b border-[#213248]">
                        {isMissing ? (
                          <div className="flex flex-col items-center gap-1 text-[#ef4444]">
                            <FileWarning className="w-6 h-6 animate-pulse" />
                            <span className="text-[8px] font-bold uppercase tracking-wider">Missing Media</span>
                          </div>
                        ) : asset.thumbnailUrl ? (
                          <img
                            src={asset.thumbnailUrl}
                            alt={asset.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                          />
                        ) : asset.src && (isImage || isVideo) ? (
                          <img
                            src={asset.src}
                            alt={asset.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                          />
                        ) : isChar ? (
                          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#259CFF] to-[#28D7A0] flex items-center justify-center font-extrabold text-white text-base shadow-sm">
                            {(asset.name || "C")[0]}
                          </div>
                        ) : isAudio ? (
                          <div className="flex flex-col items-center gap-1 text-[#28D7A0]">
                            <Volume2 className="w-6 h-6" />
                            <span className="text-[8px] font-mono opacity-70">
                              {asset.metadata?.duration ? `${asset.metadata.duration.toFixed(1)}s` : "Audio"}
                            </span>
                          </div>
                        ) : isSub ? (
                          <div className="flex flex-col items-center gap-1 text-[#f59e0b]">
                            <FileText className="w-6 h-6" />
                            <span className="text-[8px] font-mono opacity-70">
                              {asset.metadata?.captionCount ? `${asset.metadata.captionCount} cues` : "Subtitle"}
                            </span>
                          </div>
                        ) : (
                          <div className="text-2xl">
                            {asset.id.includes("lantern")
                              ? "🏮"
                              : asset.id.includes("book")
                              ? "📖"
                              : asset.id.includes("tree")
                              ? "🌳"
                              : asset.id.includes("door")
                              ? "🚪"
                              : "📦"}
                          </div>
                        )}

                        {/* Top Badges */}
                        <div className="absolute top-1 left-1 flex items-center gap-1">
                          <span className="text-[8px] font-bold uppercase px-1 py-0.5 rounded bg-black/60 backdrop-blur-xs text-white">
                            {asset.type}
                          </span>
                          {isMissing && (
                            <span className="text-[8px] font-bold uppercase px-1 py-0.5 rounded bg-[#ef4444] text-white">
                              Missing
                            </span>
                          )}
                        </div>

                        {/* Floating Action Buttons Overlay */}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-1.5 backdrop-blur-[2px]">
                          <button
                            onClick={() => setPreviewAsset(asset)}
                            className="p-1.5 rounded-lg bg-white/20 hover:bg-[#259CFF] text-white transition"
                            title="Preview asset details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {isMissing ? (
                            <button
                              onClick={() => {
                                setRelinkTargetAssetId(asset.id);
                                relinkFileInputRef.current?.click();
                              }}
                              className="p-1.5 rounded-lg bg-[#f59e0b] hover:bg-[#d97706] text-black font-bold transition flex items-center gap-1"
                              title="Relink missing media file"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              onClick={() => onInsertAsset(asset)}
                              className="p-1.5 rounded-lg bg-[#28D7A0] hover:bg-[#22c55e] text-[#022c22] transition font-bold"
                              title="Insert into current scene"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {asset.source !== "builtin" && (
                            <button
                              onClick={() => handleDeleteAsset(asset.id)}
                              className="p-1.5 rounded-lg bg-white/20 hover:bg-[#ef4444] text-white transition"
                              title="Delete asset"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Footer Info */}
                      <div className="p-2 flex-1 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between gap-1">
                            <span
                              className="font-bold text-white text-[11px] truncate"
                              title={asset.name || asset.id}
                            >
                              {asset.name || asset.id}
                            </span>
                            <button
                              onClick={() => {
                                setRenamingAsset(asset);
                                setRenameValue(asset.name || asset.id);
                              }}
                              className="opacity-0 group-hover:opacity-100 text-[#8DA0B4] hover:text-[#259CFF] transition"
                              title="Rename"
                            >
                              <Edit2 className="w-2.5 h-2.5" />
                            </button>
                          </div>
                          <p className="text-[9px] text-[#8DA0B4] line-clamp-1 mt-0.5" title={asset.description}>
                            {asset.description || asset.id}
                          </p>
                        </div>

                        <div className="flex items-center justify-between text-[9px] text-[#8DA0B4] mt-2 pt-1 border-t border-[#1a2736]">
                          <span className="font-mono capitalize">{asset.source || "library"}</span>
                          {asset.metadata?.fileSize ? (
                            <span className="font-mono">
                              {(asset.metadata.fileSize / 1024).toFixed(0)} KB
                            </span>
                          ) : asset.metadata?.duration ? (
                            <span className="font-mono">{asset.metadata.duration.toFixed(0)}s</span>
                          ) : (
                            <span className="font-mono">
                              {asset.metadata?.width ? `${asset.metadata.width}p` : ""}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* DUPLICATE DETECTION PROMPT MODAL */}
      {duplicatePrompt && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[#0C1724] border border-[#f59e0b]/50 rounded-2xl p-4 w-[360px] space-y-3 shadow-2xl">
            <div className="flex items-center gap-2 text-[#f59e0b]">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span className="font-extrabold text-white text-[13px]">Duplicate Media Detected</span>
            </div>
            <p className="text-[11px] text-[#EEF4FB] leading-relaxed">
              <strong>"{duplicatePrompt.file.name}"</strong> matches existing asset{" "}
              <strong>"{duplicatePrompt.existingAsset.name || duplicatePrompt.existingAsset.id}"</strong> already in
              your library.
            </p>
            <div className="p-2 bg-[#07101A] border border-[#213248] rounded-lg text-[10px] text-[#8DA0B4] space-y-1">
              <div>Type: <span className="text-white capitalize">{duplicatePrompt.existingAsset.type}</span></div>
              <div>ID: <span className="text-white font-mono">{duplicatePrompt.existingAsset.id}</span></div>
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <button
                onClick={() => setDuplicatePrompt(null)}
                className="px-3 py-1.5 rounded-lg bg-[#0F1C2A] text-[#8DA0B4] hover:text-white text-[11px] font-bold"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onInsertAsset(duplicatePrompt.existingAsset);
                  setDuplicatePrompt(null);
                }}
                className="px-3 py-1.5 rounded-lg bg-[#28D7A0] hover:bg-[#22c55e] text-[#022c22] text-[11px] font-extrabold"
              >
                Use Existing
              </button>
              <button
                onClick={() => {
                  const file = duplicatePrompt.file;
                  setDuplicatePrompt(null);
                  handleImportFiles([file], true);
                }}
                className="px-3 py-1.5 rounded-lg bg-[#259CFF] hover:bg-[#1d82d8] text-white text-[11px] font-bold"
              >
                Import Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RENAME MODAL */}
      {renamingAsset && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[#0C1724] border border-[#213248] rounded-xl p-4 w-[320px] space-y-3 shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-white text-[13px]">Rename Asset</span>
              <button onClick={() => setRenamingAsset(null)} className="text-[#8DA0B4] hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="w-full bg-[#07101A] border border-[#213248] focus:border-[#259CFF] rounded-lg px-2.5 py-1.5 text-white text-[12px] outline-none"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setRenamingAsset(null)}
                className="px-3 py-1.5 rounded-lg bg-[#0F1C2A] text-[#8DA0B4] hover:text-white text-[11px] font-bold"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRename}
                className="px-3 py-1.5 rounded-lg bg-[#259CFF] hover:bg-[#1d82d8] text-white text-[11px] font-bold"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ASSET PREVIEW & METADATA MODAL */}
      {previewAsset && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#0C1724] border border-[#213248] rounded-2xl w-[520px] max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="p-3.5 border-b border-[#213248] flex items-center justify-between bg-[#08101a]">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[#259CFF]/20 text-[#259CFF] border border-[#259CFF]/30">
                  {previewAsset.type}
                </span>
                <span className="font-extrabold text-white text-[14px] truncate max-w-[320px]">
                  {previewAsset.name || previewAsset.id}
                </span>
                {missingAssetIds.has(previewAsset.id) && (
                  <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-[#ef4444] text-white">
                    Missing Media
                  </span>
                )}
              </div>
              <button
                onClick={() => setPreviewAsset(null)}
                className="p-1 rounded-lg text-[#8DA0B4] hover:text-white hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Media Player / Visual Canvas */}
            <div className="h-[220px] bg-black/60 flex items-center justify-center relative border-b border-[#213248] overflow-hidden">
              {missingAssetIds.has(previewAsset.id) ? (
                <div className="flex flex-col items-center gap-2 text-[#ef4444] p-4 text-center">
                  <FileWarning className="w-12 h-12 animate-pulse" />
                  <span className="font-extrabold text-sm">Media File Missing from Storage</span>
                  <p className="text-[11px] text-[#8DA0B4] max-w-[320px]">
                    The binary media for this asset could not be located in local storage. Click Relink below to
                    reconnect it.
                  </p>
                </div>
              ) : previewAsset.src && (previewAsset.type === "image" || previewAsset.type === "background") ? (
                <img src={previewAsset.src} alt={previewAsset.name} className="max-h-full max-w-full object-contain" />
              ) : previewAsset.src && previewAsset.type === "video" ? (
                <video src={previewAsset.src} controls className="max-h-full max-w-full" />
              ) : previewAsset.src &&
                (previewAsset.type === "audio" || previewAsset.type === "music" || previewAsset.type === "sfx") ? (
                <div className="w-full px-6 py-4 flex flex-col items-center gap-3">
                  <Volume2 className="w-10 h-10 text-[#28D7A0]" />
                  <audio src={previewAsset.src} controls className="w-full" />
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-[#8DA0B4]">
                  <span className="text-4xl">
                    {previewAsset.id.includes("lantern")
                      ? "🏮"
                      : previewAsset.id.includes("book")
                      ? "📖"
                      : previewAsset.id.includes("tree")
                      ? "🌳"
                      : "🎨"}
                  </span>
                  <span className="text-[11px] font-mono">{previewAsset.name || previewAsset.id}</span>
                </div>
              )}
            </div>

            {/* Detailed Technical Metadata */}
            <div className="p-4 flex-1 overflow-y-auto space-y-3 text-[11px]">
              <div>
                <label className="text-[10px] font-bold text-[#8DA0B4] uppercase tracking-wider block mb-1">
                  Description
                </label>
                <p className="text-white leading-relaxed bg-[#07101A] p-2.5 rounded-lg border border-[#213248]">
                  {previewAsset.description || "Standard CutFree studio asset."}
                </p>
              </div>

              <div>
                <label className="text-[10px] font-bold text-[#8DA0B4] uppercase tracking-wider block mb-1">
                  Technical Specifications
                </label>
                <div className="grid grid-cols-2 gap-2 bg-[#07101A] p-3 rounded-lg border border-[#213248]">
                  <div>
                    <span className="text-[#8DA0B4] block text-[10px]">Asset ID</span>
                    <span className="text-white font-mono select-all">{previewAsset.id}</span>
                  </div>
                  <div>
                    <span className="text-[#8DA0B4] block text-[10px]">Source</span>
                    <span className="text-white capitalize">{previewAsset.source || "Library Builtin"}</span>
                  </div>
                  {previewAsset.metadata?.duration !== undefined && (
                    <div>
                      <span className="text-[#8DA0B4] block text-[10px]">Duration</span>
                      <span className="text-[#28D7A0] font-mono font-bold">
                        {previewAsset.metadata.duration.toFixed(2)}s
                      </span>
                    </div>
                  )}
                  {previewAsset.metadata?.width !== undefined && (
                    <div>
                      <span className="text-[#8DA0B4] block text-[10px]">Resolution</span>
                      <span className="text-white font-mono">
                        {previewAsset.metadata.width} x {previewAsset.metadata.height}
                      </span>
                    </div>
                  )}
                  {previewAsset.metadata?.fileSize !== undefined && (
                    <div>
                      <span className="text-[#8DA0B4] block text-[10px]">File Size</span>
                      <span className="text-white font-mono">
                        {(previewAsset.metadata.fileSize / 1024).toFixed(1)} KB
                      </span>
                    </div>
                  )}
                  {previewAsset.metadata?.mimeType && (
                    <div>
                      <span className="text-[#8DA0B4] block text-[10px]">MIME Type</span>
                      <span className="text-white font-mono">{previewAsset.metadata.mimeType}</span>
                    </div>
                  )}
                  {previewAsset.metadata?.createdAt && (
                    <div>
                      <span className="text-[#8DA0B4] block text-[10px]">Added</span>
                      <span className="text-white font-mono">
                        {new Date(previewAsset.metadata.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="p-3 bg-[#08101a] border-t border-[#213248] flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                {previewAsset.source !== "builtin" && (
                  <>
                    <button
                      onClick={() => handleDeleteAsset(previewAsset.id)}
                      className="px-3 py-1.5 rounded-lg bg-[#ef4444]/20 hover:bg-[#ef4444] text-[#ef4444] hover:text-white text-[11px] font-bold flex items-center gap-1 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                    <button
                      onClick={() => {
                        setRelinkTargetAssetId(previewAsset.id);
                        relinkFileInputRef.current?.click();
                      }}
                      className="px-3 py-1.5 rounded-lg bg-[#0F1C2A] hover:bg-[#213248] text-white text-[11px] font-bold flex items-center gap-1 border border-[#213248] transition"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Replace Media</span>
                    </button>
                  </>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setPreviewAsset(null)}
                  className="px-3.5 py-1.5 rounded-lg bg-[#0F1C2A] hover:bg-[#16273b] text-[#EEF4FB] text-[11px] font-bold transition"
                >
                  Close
                </button>
                {!missingAssetIds.has(previewAsset.id) && (
                  <button
                    onClick={() => {
                      onInsertAsset(previewAsset);
                      setPreviewAsset(null);
                    }}
                    className="px-4 py-1.5 rounded-lg bg-[#259CFF] hover:bg-[#1d82d8] text-white text-[11px] font-black flex items-center gap-1.5 shadow-md transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Apply to Scene</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
