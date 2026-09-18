/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Semantic Asset Resolver for CutFree Studio.
 * Resolves character, background, prop/object and audio references without crashing on missing files.
 */

import { BlueprintAsset } from "../types/blueprint";

export interface ResolvedAsset {
  id: string;
  type: "character" | "background" | "object" | "audio" | "image";
  isResolved: boolean;
  name: string;
  description?: string;
  image?: HTMLImageElement;
  audioBuffer?: AudioBuffer;
  colorPreset?: { bg: string; accent: string };
  fallbackText?: string;
}

class AssetRegistry {
  private userAssets: Map<string, BlueprintAsset> = new Map();
  private loadedImages: Map<string, HTMLImageElement> = new Map();
  private loadedAudio: Map<string, AudioBuffer> = new Map();

  constructor() {
    this.registerBuiltInPresets();
  }

  private registerBuiltInPresets() {
    // Preset characters from design specification
    this.registerAsset({
      id: "nooruddin",
      type: "character",
      name: "Nooruddin",
      description: "Young cheerful boy wearing a white kufi and green jubbah",
    });
    this.registerAsset({
      id: "nuri",
      type: "character",
      name: "Nuri",
      description: "Friendly smiling yellow glowing star companion",
    });
    this.registerAsset({
      id: "ayesha",
      type: "character",
      name: "Ayesha",
      description: "Gentle girl wearing a lavender hijab",
    });
    this.registerAsset({
      id: "narrator",
      type: "character",
      name: "Narrator (Islamic Voice)",
      description: "Wise silhouette character with gentle speech gesture",
    });
    this.registerAsset({
      id: "salman",
      type: "character",
      name: "Salman",
      description: "Young contemplative man walking at night",
    });

    // Preset backgrounds from design specification
    this.registerAsset({
      id: "mosque",
      type: "background",
      name: "Mosque",
      description: "Illuminated nighttime Islamic mosque with golden minarets and crescent moon",
    });
    this.registerAsset({
      id: "village",
      type: "background",
      name: "Village",
      description: "Picturesque peaceful countryside village with green rolling hills",
    });
    this.registerAsset({
      id: "forest",
      type: "background",
      name: "Forest",
      description: "Lush ancient woodland with sunbeams cutting through canopy",
    });
    this.registerAsset({
      id: "night_sky",
      type: "background",
      name: "Night Sky",
      description: "Starry dark blue night sky with gentle nebulae",
    });
    this.registerAsset({
      id: "rainy_street",
      type: "background",
      name: "Rainy Street",
      description: "Atmospheric rainy city street with warm lantern reflections",
    });
    this.registerAsset({
      id: "old_mysterious_door",
      type: "background",
      name: "Mysterious Closed Door",
      description: "Historic closed wooden doorway with moonlight glow",
    });

    // Preset objects / props from design specification
    this.registerAsset({
      id: "lantern",
      type: "object",
      name: "Lantern",
      description: "Warm brass lantern emitting soft golden light",
    });
    this.registerAsset({
      id: "book",
      type: "object",
      name: "Book",
      description: "Illuminated open sacred book with gentle radiant glow",
    });
    this.registerAsset({
      id: "tree",
      type: "object",
      name: "Tree",
      description: "Lush flourishing tree with deep green foliage",
    });
    this.registerAsset({
      id: "closed_door",
      type: "object",
      name: "Closed Door",
      description: "Engraved wooden door with antique handle",
    });
  }

  public registerAsset(asset: BlueprintAsset) {
    this.userAssets.set(asset.id, asset);
  }

  public registerCustomImage(id: string, img: HTMLImageElement) {
    this.loadedImages.set(id, img);
  }

  public resolve(assetId: string, expectedType: "character" | "background" | "object" | "audio" | "image" = "background"): ResolvedAsset {
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
      return {
        id: assetId,
        type: expectedType,
        isResolved: true,
        name: assetId,
        image: this.loadedImages.get(assetId),
      };
    }

    // Registered metadata match
    const registered = this.userAssets.get(assetId);
    if (registered) {
      return {
        id: assetId,
        type: registered.type as any,
        isResolved: true,
        name: registered.name || registered.id,
        description: registered.description,
        colorPreset: this.generateColorPalette(assetId),
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
