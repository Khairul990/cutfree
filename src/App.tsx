/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * CutFree Studio — Canonical Video Production Studio
 * Single source of truth driving Preview, Multi-Track Timeline, and Exporter.
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { VideoBlueprint, BlueprintScene, BlueprintAsset } from "./types/blueprint";
import { DEFAULT_BLUEPRINT } from "./core/default-blueprint";
import { validateBlueprint, repairBlueprint } from "./core/validator";
import { createHistory } from "./core/history";
import { TopToolbar } from "./ui/TopToolbar";
import { LeftNav, LeftNavTab } from "./ui/LeftNav";
import { AssetPanel } from "./ui/AssetPanel";
import { PreviewPlayer } from "./ui/PreviewPlayer";
import { Inspector } from "./ui/Inspector";
import { TimelineTrackView } from "./ui/TimelineTrackView";
import { BlueprintModal } from "./ui/BlueprintModal";
import { ExportModal } from "./ui/ExportModal";
import { ProjectModal } from "./ui/ProjectModal";
import { assetResolver } from "./core/asset-resolver";

export default function App() {
  // ---------------------------------------------------------------------------
  // Core Authoritative Blueprint State
  // ---------------------------------------------------------------------------
  const [blueprint, setBlueprint] = useState<VideoBlueprint>(() => {\n    try {\n      const saved = localStorage.getItem("cutfree_blueprint_saved");\n      if (saved) {\n        const parsed = JSON.parse(saved) as VideoBlueprint;\n        const result = validateBlueprint(parsed);\n        if (result.valid) return parsed;\n      }\n    } catch {}\n    return DEFAULT_BLUEPRINT;\n  });
  const [duration, setDuration] = useState<number>(() => {\n    try {\n      const saved = localStorage.getItem("cutfree_blueprint_saved");\n      if (saved) return (JSON.parse(saved) as VideoBlueprint).timeline.duration || 341.89;\n    } catch {}\n    return DEFAULT_BLUEPRINT.timeline.duration || 341.89;\n  });
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(
    DEFAULT_BLUEPRINT.scenes[0]?.id || null
  );

  // Aspect Ratio (16:9, 9:16, 1:1)
  const [aspect, setAspect] = useState<"16:9" | "9:16" | "1:1">(
    (DEFAULT_BLUEPRINT.project.aspectRatio as any) || "16:9"
  );

  // Navigation & Panels
  const [leftNavTab, setLeftNavTab] = useState<LeftNavTab>("assets");
  const [isAssetPanelOpen, setIsAssetPanelOpen] = useState<boolean>(true);
  const [isInspectorOpen, setIsInspectorOpen] = useState<boolean>(true);

  // Modals
  const [isBlueprintModalOpen, setIsBlueprintModalOpen] = useState<boolean>(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState<boolean>(false);

  // Audio System
  const [audioUrl, setAudioUrl] = useState<string>("");
  const [actualAudioDuration, setActualAudioDuration] = useState<number | undefined>(341.89);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | undefined>(undefined);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);

  // Undo / Redo History
  const historyRef = useRef(createHistory<VideoBlueprint>(30));
  const [historyVersion, setHistoryVersion] = useState<number>(0);

  // Animation Loop ticker
  const animFrameRef = useRef<number | null>(null);
  const lastTickTimeRef = useRef<number>(performance.now());

  // Currently selected scene object
  const selectedScene = useMemo(() => {
    if (!selectedSceneId) return blueprint.scenes[0] || null;
    return blueprint.scenes.find((s) => s.id === selectedSceneId) || blueprint.scenes[0] || null;
  }, [blueprint.scenes, selectedSceneId]);

  // Push state to history
  const commitBlueprint = useCallback(
    (newBp: VideoBlueprint) => {
      historyRef.current.push(blueprint);
      setBlueprint(newBp);
      setDuration(newBp.timeline.duration);
      setHistoryVersion((v) => v + 1);
    },
    [blueprint]
  );

  // ---------------------------------------------------------------------------
  // Playback Loop & Clock
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isPlaying) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
      }
      return;
    }

    lastTickTimeRef.current = performance.now();

    if (audioRef.current && audioUrl) {
      audioRef.current.currentTime = currentTime;
      audioRef.current.play().catch(() => {});
    }

    const tick = (now: number) => {
      const deltaSec = (now - lastTickTimeRef.current) / 1000;
      lastTickTimeRef.current = now;

      setCurrentTime((prev) => {
        const next = prev + deltaSec;
        if (next >= duration) {
          setIsPlaying(false);
          return duration;
        }
        return next;
      });

      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);

    const handleApplyTemplate = useCallback((templateId: string) => {
    const presets: Record<string, { camera: any; transition: any; textAnimation: any; mood: string }> = {
      islamic_story: { camera: "slow_zoom_in", transition: "fade", textAnimation: "word_reveal", mood: "warm" },
      cinematic: { camera: "zoom_focus", transition: "blurZoom", textAnimation: "fade", mood: "cinematic" },
      shorts_fast: { camera: "camera_push", transition: "zoom", textAnimation: "pop", mood: "energetic" },
      minimal: { camera: "static", transition: "none", textAnimation: "fade", mood: "clean" },
    };
    const preset = presets[templateId];
    if (!preset || !blueprint.scenes.length) return;
    const scenes = blueprint.scenes.map((scene, index) => ({
      ...scene,
      camera: { ...(scene.camera || {}), preset: preset.camera, intensity: scene.camera?.intensity ?? 1 },
      transition: preset.transition,
      textAnimation: preset.textAnimation,
      mood: scene.mood || preset.mood,
      title: scene.title || "Scene " + (index + 1),
    }));
    const nextAspect = templateId === "shorts_fast" ? "9:16" : aspect;
    setAspect(nextAspect);
    commitBlueprint({ ...blueprint, project: { ...blueprint.project, aspectRatio: nextAspect }, scenes });
  }, [blueprint, aspect, commitBlueprint]);

  return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, duration, audioUrl]);

  // Sync active scene with currentTime
  useEffect(() => {
    const active = blueprint.scenes.find(
      (s) => currentTime >= s.start && currentTime <= s.end
    );
    if (active && active.id !== selectedSceneId) {
      setSelectedSceneId(active.id);
    }
  }, [currentTime, blueprint.scenes]);

  const handleSeek = useCallback(
    (targetSec: number) => {
      const clamped = Math.max(0, Math.min(duration, targetSec));
      setCurrentTime(clamped);
      if (audioRef.current && audioUrl) {
        audioRef.current.currentTime = clamped;
      }
    },
    [duration, audioUrl]
  );

  const togglePlay = useCallback(() => {
    if (currentTime >= duration) {
      setCurrentTime(0);
    }
    setIsPlaying((p) => !p);
  }, [currentTime, duration]);

  // Next / Prev scene jumps
  const handleNextScene = useCallback(() => {
    const idx = blueprint.scenes.findIndex((s) => s.id === selectedSceneId);
    if (idx >= 0 && idx < blueprint.scenes.length - 1) {
      const next = blueprint.scenes[idx + 1];
      setSelectedSceneId(next.id);
      handleSeek(next.start + 0.05);
    }
  }, [blueprint.scenes, selectedSceneId, handleSeek]);

  const handlePrevScene = useCallback(() => {
    const idx = blueprint.scenes.findIndex((s) => s.id === selectedSceneId);
    if (idx > 0) {
      const prev = blueprint.scenes[idx - 1];
      setSelectedSceneId(prev.id);
      handleSeek(prev.start + 0.05);
    }
  }, [blueprint.scenes, selectedSceneId, handleSeek]);

  // ---------------------------------------------------------------------------
  // Scene Mutations
  // ---------------------------------------------------------------------------
  const handleUpdateScene = useCallback(
    (updated: BlueprintScene) => {
      const newScenes = blueprint.scenes.map((s) => (s.id === updated.id ? updated : s));
      commitBlueprint({
        ...blueprint,
        scenes: newScenes,
      });
    },
    [blueprint, commitBlueprint]
  );

  const handleDeleteScene = useCallback(
    (sceneId: string) => {
      if (blueprint.scenes.length <= 1) {
        alert("A video project must have at least one scene.");
        return;
      }
      const filtered = blueprint.scenes.filter((s) => s.id !== sceneId);
      // Re-anchor start & end to maintain continuity
      let cursor = 0;
      const reconciled = filtered.map((s) => {
        const len = s.end - s.start;
        const res = { ...s, start: cursor, end: cursor + len };
        cursor += len;
        return res;
      });

      commitBlueprint({
        ...blueprint,
        scenes: reconciled,
        timeline: {
          ...blueprint.timeline,
          duration: cursor,
          totalScenes: reconciled.length,
        },
      });
      setSelectedSceneId(reconciled[0]?.id || null);
    },
    [blueprint, commitBlueprint]
  );

  const handleSplitScene = useCallback(() => {
    if (!selectedScene) return;
    if (currentTime <= selectedScene.start + 0.5 || currentTime >= selectedScene.end - 0.5) {
      return; // Cannot split too close to edges
    }

    const firstHalf: BlueprintScene = {
      ...selectedScene,
      end: currentTime,
    };
    const secondHalf: BlueprintScene = {
      ...selectedScene,
      id: `scene_${Date.now().toString().slice(-4)}`,
      title: `${selectedScene.title} (Part 2)`,
      start: currentTime,
    };

    const newScenes: BlueprintScene[] = [];
    blueprint.scenes.forEach((s) => {
      if (s.id === selectedScene.id) {
        newScenes.push(firstHalf, secondHalf);
      } else {
        newScenes.push(s);
      }
    });

    commitBlueprint({
      ...blueprint,
      scenes: newScenes,
      timeline: {
        ...blueprint.timeline,
        totalScenes: newScenes.length,
      },
    });
    setSelectedSceneId(secondHalf.id);
  }, [selectedScene, currentTime, blueprint, commitBlueprint]);

  const handleDuplicateSelectedScene = useCallback(() => {
    if (!selectedScene) return;
    const dur = selectedScene.end - selectedScene.start;
    const dup: BlueprintScene = {
      ...selectedScene,
      id: `scene_${Date.now().toString().slice(-4)}`,
      title: `${selectedScene.title} (Copy)`,
      start: selectedScene.end,
      end: selectedScene.end + dur,
    };

    // Shift all subsequent scenes
    const newScenes: BlueprintScene[] = [];
    blueprint.scenes.forEach((s) => {
      newScenes.push(s);
      if (s.id === selectedScene.id) {
        newScenes.push(dup);
      }
    });

    let cursor = 0;
    const reconciled = newScenes.map((s) => {
      const len = s.end - s.start;
      const res = { ...s, start: cursor, end: cursor + len };
      cursor += len;
      return res;
    });

    commitBlueprint({
      ...blueprint,
      scenes: reconciled,
      timeline: {
        ...blueprint.timeline,
        duration: cursor,
        totalScenes: reconciled.length,
      },
    });
    setSelectedSceneId(dup.id);
  }, [selectedScene, blueprint, commitBlueprint]);

  // ---------------------------------------------------------------------------
  // Asset Insertion to Scene
  // ---------------------------------------------------------------------------
  const handleInsertAsset = useCallback(
    (asset: BlueprintAsset) => {
      if (!selectedScene) return;

      if (asset.type === "background") {
        handleUpdateScene({
          ...selectedScene,
          background: {
            assetId: asset.id,
            fit: "cover",
            motion: "slow_pan",
          },
        });
      } else if (asset.type === "character") {
        const existingChars = selectedScene.characters || [];
        // Prevent duplicate addition of identical character
        if (existingChars.some((c) => c.id === asset.id)) return;

        const newChar = {
          id: asset.id,
          position: { x: existingChars.length === 0 ? 0.5 : 0.35 + existingChars.length * 0.25, y: 0.72 },
          scale: 1.0,
          emotion: "happy" as const,
          action: "idle" as const,
          entrance: "fade_in" as const,
        };

        handleUpdateScene({
          ...selectedScene,
          characters: [...existingChars, newChar],
        });
      } else if (asset.type === "object") {
        const existingObjs = selectedScene.objects || [];
        const newObj = {
          id: `${asset.id}_${Date.now().toString().slice(-4)}`,
          assetId: asset.id,
          position: { x: 0.2 + existingObjs.length * 0.25, y: 0.68 },
          scale: 0.9,
          animation: "glow" as const,
        };

        handleUpdateScene({
          ...selectedScene,
          objects: [...existingObjs, newObj],
        });
      }
    },
    [selectedScene, handleUpdateScene]
  );

  const handleCustomImageUpload = useCallback(
    (id: string, img: HTMLImageElement) => {
      assetResolver.registerCustomImage(id, img);
      if (selectedScene) {
        handleUpdateScene({
          ...selectedScene,
          background: {
            assetId: id,
            fit: "cover",
            motion: "drift",
          },
        });
      }
    },
    [selectedScene, handleUpdateScene]
  );

  // ---------------------------------------------------------------------------
  // Audio Import (Authoritative duration sync)
  // ---------------------------------------------------------------------------
  const handleAudioFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const url = URL.createObjectURL(file);
      setAudioUrl(url);

      // Decode audio for authoritative duration and exporter mixing
      const arrayBuffer = await file.arrayBuffer();
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      setAudioBuffer(decodedBuffer);

      const realDur = parseFloat(decodedBuffer.duration.toFixed(2));
      setActualAudioDuration(realDur);
      setDuration(realDur);

      // Reconcile blueprint scenes to match exact audio duration without truncating
      const lastScene = blueprint.scenes[blueprint.scenes.length - 1];
      if (lastScene) {
        const updatedScenes = [...blueprint.scenes];
        updatedScenes[updatedScenes.length - 1] = {
          ...lastScene,
          end: realDur,
        };

        commitBlueprint({
          ...blueprint,
          audio: {
            ...blueprint.audio,
            duration: realDur,
            fileName: file.name,
          },
          timeline: {
            ...blueprint.timeline,
            duration: realDur,
          },
          scenes: updatedScenes,
        });
      }
    } catch (err) {
      console.error("Audio import error:", err);
      alert("Failed to read audio file. Please try another MP3 or WAV file.");
    }
  };

  // ---------------------------------------------------------------------------
  // Undo / Redo
  // ---------------------------------------------------------------------------
  const handleUndo = useCallback(() => {
    const prev = historyRef.current.undo(blueprint);
    if (prev) {
      setBlueprint(prev);
      setDuration(prev.timeline.duration);
      setHistoryVersion((v) => v + 1);
    }
  }, [blueprint]);

  const handleRedo = useCallback(() => {
    const next = historyRef.current.redo(blueprint);
    if (next) {
      setBlueprint(next);
      setDuration(next.timeline.duration);
      setHistoryVersion((v) => v + 1);
    }
  }, [blueprint]);

  // Keyboard Shortcuts (Space, Arrow keys, Ctrl+Z, Ctrl+Y)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in text input
      if (["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        handleSeek(currentTime - (e.shiftKey ? 5 : 1));
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        handleSeek(currentTime + (e.shiftKey ? 5 : 1));
      } else if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ") {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.code === "KeyY") {
        e.preventDefault();
        handleRedo();
      } else if (e.code === "KeyS" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        handleSplitScene();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePlay, handleSeek, currentTime, handleUndo, handleRedo, handleSplitScene]);

  return (
    <div className="h-screen w-screen bg-[#07101A] text-[#EEF4FB] flex flex-col overflow-hidden select-none font-sans">
      {/* Hidden Audio Element for synchronised audio playback */}
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onEnded={() => setIsPlaying(false)}
          className="hidden"
        />
      )}

      {/* Hidden Audio File Input */}
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*"
        onChange={handleAudioFileChange}
        className="hidden"
      />

      {/* 1. TOP TOOLBAR */}
      <TopToolbar
        projectTitle={blueprint.project.title || "Untitled Video"}
        onOpenProjectModal={() => setIsProjectModalOpen(true)}
        onImportAudioClick={() => audioInputRef.current?.click()}
        onImportJsonClick={() => setIsBlueprintModalOpen(true)}
        onSave={() => {
          localStorage.setItem("cutfree_blueprint_saved", JSON.stringify(blueprint));
        }}
        canUndo={historyRef.current.canUndo()}
        canRedo={historyRef.current.canRedo()}
        onUndo={handleUndo}
        onRedo={handleRedo}
        isPlaying={isPlaying}
        onTogglePlay={togglePlay}
        onOpenExportModal={() => setIsExportModalOpen(true)}
        onOpenSettingsModal={() => setIsProjectModalOpen(true)}
      />

      {/* 2. MAIN WORKSPACE (LeftNav + AssetPanel + Video Preview + Inspector) */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Navigation Rail */}
        <LeftNav
          activeTab={leftNavTab}
          onSelectTab={(tab) => {
            setLeftNavTab(tab);
            setIsAssetPanelOpen(true);
          }}
          assetCount={blueprint.assets?.length || 4}
        />

        {/* Assets Library Panel */}
        {isAssetPanelOpen && (
          <AssetPanel
            onInsertAsset={handleInsertAsset}
            onCustomImageUpload={handleCustomImageUpload}
            activeNavTab={leftNavTab}
            onApplyTemplate={handleApplyTemplate}
          />
        )}

        {/* Video Preview (Dominating Center) */}
        <PreviewPlayer
          blueprint={blueprint}
          currentTime={currentTime}
          duration={duration}
          isPlaying={isPlaying}
          onSeek={handleSeek}
          onTogglePlay={togglePlay}
          aspect={aspect}
          onChangeAspect={(a) => {
            setAspect(a);
            commitBlueprint({
              ...blueprint,
              project: {
                ...blueprint.project,
                aspectRatio: a,
              },
            });
          }}
          onNextScene={handleNextScene}
          onPrevScene={handlePrevScene}
        />

        {/* Dynamic Inspector (Right Panel) */}
        {isInspectorOpen && (
          <Inspector
            scene={selectedScene}
            captions={blueprint.captions}
            currentTime={currentTime}
            onUpdateScene={handleUpdateScene}
            onDeleteScene={handleDeleteScene}
            onClose={() => setIsInspectorOpen(false)}
          />
        )}
      </div>

      {/* 3. MULTI-TRACK TIMELINE (Bottom Area) */}
      <TimelineTrackView
        blueprint={blueprint}
        currentTime={currentTime}
        duration={duration}
        isPlaying={isPlaying}
        onSeek={handleSeek}
        onTogglePlay={togglePlay}
        onSelectScene={(id) => setSelectedSceneId(id)}
        selectedSceneId={selectedSceneId}
        onSplitScene={handleSplitScene}
        onDeleteScene={() => selectedScene && handleDeleteScene(selectedScene.id)}
        onDuplicateScene={handleDuplicateSelectedScene}
      />

      {/* 4. STATUS BAR (Very bottom, compact 24px) */}
      <footer className="h-[24px] bg-[#070e17] border-t border-[#213248] px-3 flex items-center justify-between text-[10px] text-[#8DA0B4] shrink-0 select-none">
        <div className="flex items-center gap-2">
          <span className="font-extrabold text-white">CutFree Studio</span>
          <span>v2.6 • Production</span>
          <span className="text-[#475569]">•</span>
          <span>Create • Animate • Edit • Export</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[#e2e8f0]">❤️ Made for Creators</span>
          <span className="text-[#475569]">|</span>
          <span className="text-[#94a3b8]">Turn Ideas into Videos</span>
        </div>
      </footer>

      {/* 5. MODALS & POPUPS */}
      {/* Blueprint JSON Modal */}
      <BlueprintModal
        isOpen={isBlueprintModalOpen}
        onClose={() => setIsBlueprintModalOpen(false)}
        currentBlueprint={blueprint}
        actualAudioDuration={actualAudioDuration}
        onApplyBlueprint={(bp) => {
          commitBlueprint(bp);
          if (bp.scenes.length > 0) {
            setSelectedSceneId(bp.scenes[0].id);
          }
        }}
      />

      {/* Video Exporter Modal */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        blueprint={blueprint}
        audioBuffer={audioBuffer}
      />

      {/* Project Settings Modal */}
      <ProjectModal
        isOpen={isProjectModalOpen}
        onClose={() => setIsProjectModalOpen(false)}
        blueprint={blueprint}
        onUpdateTitle={(title) => {
          commitBlueprint({
            ...blueprint,
            project: { ...blueprint.project, title },
          });
        }}
        onNewProject={() => {
          commitBlueprint(DEFAULT_BLUEPRINT);
          setCurrentTime(0);
          setSelectedSceneId(DEFAULT_BLUEPRINT.scenes[0]?.id || null);
        }}
        onExportBlueprintJson={() => {
          const jsonStr = JSON.stringify(blueprint, null, 2);
          const blob = new Blob([jsonStr], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${(blueprint.project.title || "blueprint").replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;
          a.click();
          URL.revokeObjectURL(url);
        }}
        onImportBlueprintClick={() => setIsBlueprintModalOpen(true)}
      />
    </div>
  );
}
