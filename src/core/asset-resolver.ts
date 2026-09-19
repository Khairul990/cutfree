/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Semantic Asset Resolver & Registry for CutFree Studio.
 * Resolves character, background, prop/object, audio, and subtitle references.
 */

import { BlueprintAsset, AssetType, AssetMetadata } from "../types/blueprint";

export interface ResolvedAsset {
  id: string;
  type: AssetType;
  isResolved: boolean;
  name: string;
  description?: string;
  image?: HTMLImageElement;
  audioBuffer?: AudioBuffer;
  colorPreset?: { bg: string; accent: string };
  fallbackText?: string;
  metadata?: AssetMetadata;
}

class AssetRegistry {
  private userAssets: Map<string, BlueprintAsset> = new Map();
  private loadedImages: Map<string, HTMLImageElement> = new Map();
  private loadedAudio: Map<string, AudioBuffer> = new Map();

  constructor() {
    this.registerBuiltInPresets();
  }

  private registerBuiltInPresets() {
    // 1. Preset Characters
    this.registerAsset({
      id: "nooruddin",
      type: "character",
      name: "Nooruddin",
      description: "Young cheerful boy wearing a white kufi and green jubbah",
      category: "protagonist",
      source: "builtin",
      metadata: { createdAt: 1700000000000, tags: ["character", "boy", "islamic"] },
    });
    this.registerAsset({
      id: "nuri",
      type: "character",
      name: "Nuri",
      description: "Friendly smiling yellow glowing star companion",
      category: "companion",
      source: "builtin",
      metadata: { createdAt: 1700000000000, tags: ["character", "star", "companion"] },
    });
    this.registerAsset({
      id: "ayesha",
      type: "character",
      name: "Ayesha",
      description: "Gentle girl wearing a lavender hijab",
      category: "protagonist",
      source: "builtin",
      metadata: { createdAt: 1700000000000, tags: ["character", "girl", "islamic"] },
    });
    this.registerAsset({
      id: "narrator",
      type: "character",
      name: "Narrator (Islamic Voice)",
      description: "Wise silhouette character with gentle speech gesture",
      category: "narrator",
      source: "builtin",
      metadata: { createdAt: 1700000000000, tags: ["character", "narrator"] },
    });
    this.registerAsset({
      id: "salman",
      type: "character",
      name: "Salman",
      description: "Young contemplative man walking at night",
      category: "secondary",
      source: "builtin",
      metadata: { createdAt: 1700000000000, tags: ["character", "youth"] },
    });

    // 2. Preset Backgrounds
    this.registerAsset({
      id: "mosque",
      type: "background",
      name: "Mosque",
      description: "Illuminated nighttime Islamic mosque with golden minarets and crescent moon",
      category: "architecture",
      source: "builtin",
      metadata: { width: 1920, height: 1080, createdAt: 1700000000000, tags: ["background", "mosque", "night"] },
    });
    this.registerAsset({
      id: "village",
      type: "background",
      name: "Village",
      description: "Picturesque peaceful countryside village with green rolling hills",
      category: "landscape",
      source: "builtin",
      metadata: { width: 1920, height: 1080, createdAt: 1700000000000, tags: ["background", "village", "nature"] },
    });
    this.registerAsset({
      id: "forest",
      type: "background",
      name: "Forest",
      description: "Lush ancient woodland with sunbeams cutting through canopy",
      category: "landscape",
      source: "builtin",
      metadata: { width: 1920, height: 1080, createdAt: 1700000000000, tags: ["background", "forest", "nature"] },
    });
    this.registerAsset({
      id: "night_sky",
      type: "background",
      name: "Night Sky",
      description: "Starry dark blue night sky with gentle nebulae",
      category: "sky",
      source: "builtin",
      metadata: { width: 1920, height: 1080, createdAt: 1700000000000, tags: ["background", "stars", "night"] },
    });
    this.registerAsset({
      id: "rainy_street",
      type: "background",
      name: "Rainy Street",
      description: "Atmospheric rainy city street with warm lantern reflections",
      category: "urban",
      source: "builtin",
      metadata: { width: 1920, height: 1080, createdAt: 1700000000000, tags: ["background", "rain", "street"] },
    });
    this.registerAsset({
      id: "old_mysterious_door",
      type: "background",
      name: "Mysterious Closed Door",
      description: "Historic closed wooden doorway with moonlight glow",
      category: "architecture",
      source: "builtin",
      metadata: { width: 1920, height: 1080, createdAt: 1700000000000, tags: ["background", "door", "mystery"] },
    });

    // 3. Preset Objects / Props
    this.registerAsset({
      id: "lantern",
      type: "prop",
      name: "Lantern",
      description: "Warm brass lantern emitting soft golden light",
      category: "item",
      source: "builtin",
      metadata: { createdAt: 1700000000000, tags: ["prop", "lantern", "light"] },
    });
    this.registerAsset({
      id: "book",
      type: "prop",
      name: "Book",
      description: "Illuminated open sacred book with gentle radiant glow",
      category: "item",
      source: "builtin",
      metadata: { createdAt: 1700000000000, tags: ["prop", "book", "wisdom"] },
    });
    this.registerAsset({
      id: "tree",
      type: "prop",
      name: "Tree",
      description: "Lush flourishing tree with deep green foliage",
      category: "nature",
      source: "builtin",
      metadata: { createdAt: 1700000000000, tags: ["prop", "tree", "nature"] },
    });
    this.registerAsset({
      id: "closed_door",
      type: "prop",
      name: "Closed Door",
      description: "Engraved wooden door with antique handle",
      category: "item",
      source: "builtin",
      metadata: { createdAt: 1700000000000, tags: ["prop", "door"] },
    });

    // 4. Preset Music & Sound Effects
    this.registerAsset({
      id: "ambient_peaceful",
      type: "music",
      name: "Serene Acoustic Reflections",
      description: "Peaceful ambient background score with gentle strings",
      category: "ambient",
      source: "builtin",
      metadata: { duration: 341.89, format: "ambient", sampleRate: 44100, channels: 2, createdAt: 1700000000000 },
    });
    this.registerAsset({
      id: "subtle_chime",
      type: "sfx",
      name: "Subtle Chime",
      description: "Gentle shimmering transition sound effect",
      category: "transition",
      source: "builtin",
      metadata: { duration: 1.5, format: "wav", createdAt: 1700000000000 },
    });
    this.registerAsset({
      id: "door_creak",
      type: "sfx",
      name: "Mysterious Door Creak",
      description: "Atmospheric vintage wooden door creak",
      category: "foley",
      source: "builtin",
      metadata: { duration: 2.2, format: "wav", createdAt: 1700000000000 },
    });
  }

  public registerAsset(asset: BlueprintAsset) {
    this.userAssets.set(asset.id, asset);

    // Auto-hydrate image if data URL or valid image src is present
    if (
      asset.src &&
      typeof Image !== "undefined" &&
      (asset.type === "image" || asset.type === "background" || asset.type === "thumbnail" || asset.type === "prop" || asset.type === "object") &&
      !this.loadedImages.has(asset.id)
    ) {
      const img = new Image();
      img.onload = () => {
        this.loadedImages.set(asset.id, img);
      };
      img.src = asset.src;
    }
  }

  public registerCustomImage(id: string, img: HTMLImageElement) {
    this.loadedImages.set(id, img);
  }

  public registerCustomAudio(id: string, buf: AudioBuffer) {
    this.loadedAudio.set(id, buf);
  }

  public getAsset(id: string): BlueprintAsset | undefined {
    return this.userAssets.get(id);
  }

  public updateAsset(id: string, updates: Partial<BlueprintAsset>): BlueprintAsset | undefined {
    const existing = this.userAssets.get(id);
    if (!existing) return undefined;
    const updated = {
      ...existing,
      ...updates,
      metadata: {
        ...existing.metadata,
        ...updates.metadata,
        updatedAt: Date.now(),
      },
    };
    this.userAssets.set(id, updated);
    return updated;
  }

  public deleteAsset(id: string): boolean {
    const asset = this.userAssets.get(id);
    // Don't delete protected builtins unless explicitly requested
    if (asset?.source === "builtin") return false;
    this.loadedImages.delete(id);
    this.loadedAudio.delete(id);
    return this.userAssets.delete(id);
  }

  public syncWithBlueprint(assets: BlueprintAsset[]) {
    if (!Array.isArray(assets)) return;
    for (const asset of assets) {
      if (asset?.id) {
        this.registerAsset(asset);
      }
    }
  }

  public resolve(assetId: string, expectedType: AssetType = "background"): ResolvedAsset {
    if (!assetId) {
      return {
        id: "none",
        type: expectedType,
        isResolved: false,
        name: "Default",
        colorPreset: { bg: "#060914", accent: "#5b8dff" },
        fallbackText: "Default Background",
      };
    }

    // Direct image match
    if (this.loadedImages.has(assetId)) {
      const img = this.loadedImages.get(assetId)!;
      const registered = this.userAssets.get(assetId);
      return {
        id: assetId,
        type: (registered?.type as AssetType) || expectedType,
        isResolved: true,
        name: registered?.name || assetId,
        description: registered?.description,
        image: img,
        metadata: registered?.metadata || { width: img.naturalWidth, height: img.naturalHeight },
      };
    }

    // Registered metadata match
    const registered = this.userAssets.get(assetId);
    if (registered) {
      return {
        id: assetId,
        type: registered.type,
        isResolved: true,
        name: registered.name || registered.id,
        description: registered.description,
        colorPreset: this.generateColorPalette(assetId),
        metadata: registered.metadata,
      };
    }

    // Fallback: Safe Semantic Resolution (Never crashes!)
    return {
      id: assetId,
      type: expectedType,
      isResolved: false,
      name: assetId.replace(/[_-]/g, " "),
      description: `Asset "${assetId}"`,
      colorPreset: this.generateColorPalette(assetId),
      fallbackText: assetId.replace(/[_-]/g, " "),
    };
  }

  private generateColorPalette(id: string) {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash % 360);
    return {
      bg: `hsl(${h}, 45%, 8%)`,
      accent: `hsl(${h}, 80%, 65%)`,
    };
  }

  public getAllAssets(): BlueprintAsset[] {
    return Array.from(this.userAssets.values());
  }
}

export const assetResolver = new AssetRegistry();
