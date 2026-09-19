/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Professional Media Import Engine for CutFree Studio (Phase 2.2).
 * Implements deterministic media validation, metadata extraction, stable ID generation,
 * duplicate detection, thumbnail generation, IndexedDB persistence, and relink/replace workflows.
 */

import { BlueprintAsset, AssetType, AssetMetadata } from "../types/blueprint";
import { mediaStorage } from "./media-storage";
import { assetResolver } from "./asset-resolver";

export interface ImportValidationResult {
  valid: boolean;
  error?: string;
  detectedType?: AssetType;
  mimeType?: string;
  extension?: string;
}

export type ImportStage =
  | "idle"
  | "validating"
  | "extracting"
  | "persisting"
  | "registering"
  | "complete"
  | "failed"
  | "cancelled";

export interface ImportProgress {
  stage: ImportStage;
  fileName: string;
  progressPct: number;
  message?: string;
  error?: string;
}

export interface ImportOptions {
  forceDuplicate?: boolean;
  customCategory?: string;
  onProgress?: (progress: ImportProgress) => void;
}

export interface ImportResult {
  success: boolean;
  asset?: BlueprintAsset;
  isDuplicate?: boolean;
  duplicateOf?: BlueprintAsset;
  error?: string;
}

export interface BatchImportResult {
  total: number;
  imported: BlueprintAsset[];
  duplicates: { file: File; existingAsset: BlueprintAsset }[];
  failed: { file: File; error: string }[];
}

const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024; // 500MB safety limit

export class MediaImportEngine {
  /**
   * Generates a stable, collision-free asset ID that survives reloads, renames, and restores.
   */
  public generateStableAssetId(prefix: string, fileName: string): string {
    const timestamp = Date.now().toString(36);
    const randomHex = Math.random().toString(36).substring(2, 8);
    const sanitizedName = fileName
      .replace(/\.[^/.]+$/, "") // strip extension
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .substring(0, 16)
      .toLowerCase();

    return `asset_${prefix}_${timestamp}_${sanitizedName}_${randomHex}`;
  }

  /**
   * Validates file size, readable data, MIME type, and extension.
   */
  public validateFile(file: File): ImportValidationResult {
    if (!file || !(file instanceof File)) {
      return { valid: false, error: "Invalid media: provided object is not a readable File" };
    }

    if (file.size === 0) {
      return { valid: false, error: "Invalid media: file is empty (0 bytes)" };
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      return { valid: false, error: `File too large: ${sizeMB}MB exceeds 500MB safety limit` };
    }

    const name = file.name || "";
    const ext = name.includes(".") ? name.split(".").pop()?.toLowerCase() || "" : "";
    const mime = (file.type || "").toLowerCase();

    // 1. Subtitles
    if (ext === "srt" || ext === "vtt" || mime.includes("subrip") || mime.includes("vtt") || ext === "txt") {
      return { valid: true, detectedType: "subtitle", mimeType: mime || "text/vtt", extension: ext };
    }

    // 2. Images
    if (
      mime.startsWith("image/") ||
      ["png", "jpg", "jpeg", "webp", "gif", "svg", "bmp"].includes(ext)
    ) {
      return { valid: true, detectedType: "image", mimeType: mime || `image/${ext}`, extension: ext };
    }

    // 3. Audio
    if (
      mime.startsWith("audio/") ||
      ["mp3", "wav", "ogg", "m4a", "aac", "flac"].includes(ext)
    ) {
      return { valid: true, detectedType: "audio", mimeType: mime || `audio/${ext}`, extension: ext };
    }

    // 4. Video
    if (
      mime.startsWith("video/") ||
      ["mp4", "webm", "mov", "mkv", "avi"].includes(ext)
    ) {
      return { valid: true, detectedType: "video", mimeType: mime || `video/${ext}`, extension: ext };
    }

    return {
      valid: false,
      error: `Unsupported format: .${ext || "unknown"} is not a supported video, audio, image, or subtitle format`,
    };
  }

  /**
   * Detects if a file matches an already registered asset by name, size, and type.
   */
  public findDuplicate(file: File, existingAssets: BlueprintAsset[]): BlueprintAsset | undefined {
    if (!existingAssets || !Array.isArray(existingAssets)) return undefined;

    return existingAssets.find((a) => {
      const meta = a.metadata;
      if (!meta) return false;

      // Exact match on original filename and file size
      if (meta.originalFileName && meta.fileSize) {
        if (meta.originalFileName === file.name && meta.fileSize === file.size) {
          return true;
        }
      }

      // Match on asset name and file size
      if (a.name === file.name && meta.fileSize === file.size) {
        return true;
      }

      return false;
    });
  }

  /**
   * Extracts technical metadata and generates a lightweight preview/thumbnail.
   */
  public async extractMetadata(
    file: File,
    type: AssetType
  ): Promise<{ metadata: AssetMetadata; thumbnailUrl?: string; parsedCaptions?: any[] }> {
    const baseMeta: AssetMetadata = {
      fileSize: file.size,
      mimeType: file.type || "application/octet-stream",
      originalFileName: file.name,
      createdAt: Date.now(),
      format: file.name.split(".").pop()?.toLowerCase(),
    };

    // 1. Image metadata & dimensions
    if (type === "image" || type === "background" || type === "prop" || type === "thumbnail") {
      return new Promise((resolve) => {
        const objectUrl = URL.createObjectURL(file);
        const img = new Image();

        img.onload = () => {
          const width = img.naturalWidth;
          const height = img.naturalHeight;

          // Generate lightweight thumbnail
          let thumbDataUrl: string | undefined;
          try {
            const canvas = document.createElement("canvas");
            const maxThumb = 160;
            const scale = Math.min(maxThumb / width, maxThumb / height, 1.0);
            canvas.width = Math.max(1, Math.round(width * scale));
            canvas.height = Math.max(1, Math.round(height * scale));
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              thumbDataUrl = canvas.toDataURL("image/webp", 0.7);
            }
          } catch {}

          URL.revokeObjectURL(objectUrl);
          resolve({
            metadata: {
              ...baseMeta,
              width,
              height,
            },
            thumbnailUrl: thumbDataUrl,
          });
        };

        img.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          resolve({ metadata: baseMeta });
        };

        img.src = objectUrl;
      });
    }

    // 2. Audio metadata & duration
    if (type === "audio" || type === "music" || type === "sfx") {
      return new Promise((resolve) => {
        const objectUrl = URL.createObjectURL(file);
        const audio = new Audio(objectUrl);

        audio.onloadedmetadata = () => {
          const duration = audio.duration || 0;
          URL.revokeObjectURL(objectUrl);
          resolve({
            metadata: {
              ...baseMeta,
              duration,
            },
          });
        };

        audio.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          resolve({ metadata: baseMeta });
        };
      });
    }

    // 3. Video metadata & representative frame capture
    if (type === "video") {
      return new Promise((resolve) => {
        const objectUrl = URL.createObjectURL(file);
        const video = document.createElement("video");
        video.preload = "metadata";
        video.muted = true;

        video.onloadedmetadata = () => {
          const width = video.videoWidth;
          const height = video.videoHeight;
          const duration = video.duration || 0;

          // Seek to 0.5s or 10% of duration to capture a non-black frame
          const seekTime = Math.min(Math.max(0.2, duration * 0.1), 2.0);
          video.currentTime = seekTime;

          video.onseeked = () => {
            let thumbDataUrl: string | undefined;
            try {
              const canvas = document.createElement("canvas");
              const maxThumb = 160;
              const scale = Math.min(maxThumb / (width || 320), maxThumb / (height || 180), 1.0);
              canvas.width = Math.max(1, Math.round((width || 320) * scale));
              canvas.height = Math.max(1, Math.round((height || 180) * scale));
              const ctx = canvas.getContext("2d");
              if (ctx) {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                thumbDataUrl = canvas.toDataURL("image/webp", 0.7);
              }
            } catch {}

            URL.revokeObjectURL(objectUrl);
            resolve({
              metadata: {
                ...baseMeta,
                width,
                height,
                duration,
              },
              thumbnailUrl: thumbDataUrl,
            });
          };

          // Fallback if seek doesn't trigger
          setTimeout(() => {
            URL.revokeObjectURL(objectUrl);
            resolve({
              metadata: {
                ...baseMeta,
                width,
                height,
                duration,
              },
            });
          }, 2000);
        };

        video.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          resolve({ metadata: baseMeta });
        };

        video.src = objectUrl;
      });
    }

    // 4. Subtitles (.srt / .vtt)
    if (type === "subtitle") {
      try {
        const text = await file.text();
        const res = await fetch("/api/subtitles/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: text }),
        });
        const data = await res.json();
        const captions = data.captions || [];

        return {
          metadata: {
            ...baseMeta,
            captionCount: captions.length,
          },
          parsedCaptions: captions,
        };
      } catch {
        return { metadata: baseMeta };
      }
    }

    return { metadata: baseMeta };
  }

  /**
   * Main canonical import pipeline for a single File.
   */
  public async importFile(
    file: File,
    existingAssets: BlueprintAsset[] = [],
    options: ImportOptions = {}
  ): Promise<ImportResult> {
    const notify = (stage: ImportStage, progressPct: number, message?: string, error?: string) => {
      if (options.onProgress) {
        options.onProgress({
          stage,
          fileName: file.name,
          progressPct,
          message,
          error,
        });
      }
    };

    try {
      // 1. VALIDATE
      notify("validating", 10, "Validating media file...");
      const validation = this.validateFile(file);
      if (!validation.valid || !validation.detectedType) {
        notify("failed", 0, undefined, validation.error);
        return { success: false, error: validation.error };
      }

      // 2. DUPLICATE CHECK
      if (!options.forceDuplicate) {
        const pool = [...existingAssets, ...assetResolver.getAllAssets()];
        const duplicate = this.findDuplicate(file, pool);
        if (duplicate) {
          notify("complete", 100, "Existing media asset found");
          return {
            success: false,
            isDuplicate: true,
            duplicateOf: duplicate,
            error: `File "${file.name}" already exists in your library`,
          };
        }
      }

      // 3. READ METADATA & THUMBNAIL
      notify("extracting", 35, "Extracting technical metadata...");
      let finalType: AssetType = validation.detectedType;
      const { metadata, thumbnailUrl, parsedCaptions } = await this.extractMetadata(file, finalType);

      // Refine type (e.g. landscape image -> background; short audio -> sfx)
      if (finalType === "image" && metadata.width && metadata.height) {
        if (metadata.width >= metadata.height) {
          finalType = "background";
        }
      } else if (finalType === "audio" && metadata.duration !== undefined) {
        if (metadata.duration < 5.0) {
          finalType = "sfx";
        } else {
          finalType = "music";
        }
      }

      // 4. GENERATE STABLE ASSET ID
      notify("persisting", 60, "Generating asset identity & storing media...");
      const prefix = finalType.substring(0, 3);
      const stableId = this.generateStableAssetId(prefix, file.name);

      // 5. PERSIST RAW MEDIA BLOB TO INDEXEDDB
      await mediaStorage.saveMediaBlob(stableId, file, {
        fileName: file.name,
        mimeType: validation.mimeType,
      });

      // 6. GENERATE TEMPORARY PLAYBACK URL
      const playbackUrl = await mediaStorage.getOrCreatePlaybackUrl(stableId, file);

      // 7. CREATE AUTHORITATIVE ASSET RECORD
      notify("registering", 85, "Registering in CutFree asset resolver...");
      const assetRecord: BlueprintAsset = {
        id: stableId,
        type: finalType,
        name: file.name,
        description: `Imported ${finalType} asset (${file.name})`,
        src: playbackUrl || undefined,
        source: "upload",
        thumbnailUrl,
        category: options.customCategory || "imported",
        metadata: {
          ...metadata,
          sourceUrl: playbackUrl || undefined,
        },
      };

      // 8. REGISTER IN ASSET RESOLVER
      assetResolver.registerAsset(assetRecord);

      // If image, also load into HTMLImageElement
      if (
        playbackUrl &&
        typeof Image !== "undefined" &&
        (finalType === "image" || finalType === "background" || finalType === "prop")
      ) {
        const img = new Image();
        img.src = playbackUrl;
        assetResolver.registerCustomImage(stableId, img);
      }

      notify("complete", 100, `Successfully imported ${file.name}`);
      return {
        success: true,
        asset: assetRecord,
      };
    } catch (err: any) {
      const errMsg = err?.message || "Media import failed due to an unexpected error";
      notify("failed", 0, undefined, errMsg);
      return {
        success: false,
        error: errMsg,
      };
    }
  }

  /**
   * Imports multiple files in a non-blocking queue.
   */
  public async importBatch(
    files: File[],
    existingAssets: BlueprintAsset[] = [],
    options: ImportOptions = {}
  ): Promise<BatchImportResult> {
    const result: BatchImportResult = {
      total: files.length,
      imported: [],
      duplicates: [],
      failed: [],
    };

    let currentAssets = [...existingAssets];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const res = await this.importFile(file, currentAssets, options);

      if (res.success && res.asset) {
        result.imported.push(res.asset);
        currentAssets.push(res.asset);
      } else if (res.isDuplicate && res.duplicateOf) {
        result.duplicates.push({ file, existingAsset: res.duplicateOf });
      } else {
        result.failed.push({ file, error: res.error || "Import failed" });
      }
    }

    return result;
  }

  /**
   * Replaces the media binary of an existing asset while preserving its ID and scene references.
   */
  public async replaceMedia(assetId: string, newFile: File): Promise<BlueprintAsset> {
    const existing = assetResolver.getAsset(assetId);
    if (!existing) {
      throw new Error(`Asset "${assetId}" does not exist`);
    }

    const validation = this.validateFile(newFile);
    if (!validation.valid || !validation.detectedType) {
      throw new Error(validation.error || "Invalid replacement file");
    }

    // Save replacement blob to IndexedDB under the exact same assetId
    await mediaStorage.saveMediaBlob(assetId, newFile, {
      fileName: newFile.name,
      mimeType: validation.mimeType,
    });

    // Revoke old URL and create a fresh playback URL
    mediaStorage.revokeUrl(assetId);
    const newPlaybackUrl = await mediaStorage.getOrCreatePlaybackUrl(assetId, newFile);

    // Extract new technical metadata
    const { metadata, thumbnailUrl } = await this.extractMetadata(newFile, existing.type);

    const updatedAsset: BlueprintAsset = {
      ...existing,
      name: newFile.name,
      src: newPlaybackUrl || undefined,
      thumbnailUrl: thumbnailUrl || existing.thumbnailUrl,
      metadata: {
        ...existing.metadata,
        ...metadata,
        updatedAt: Date.now(),
      },
    };

    // Update in assetResolver
    assetResolver.registerAsset(updatedAsset);

    if (
      newPlaybackUrl &&
      typeof Image !== "undefined" &&
      (existing.type === "image" || existing.type === "background" || existing.type === "prop")
    ) {
      const img = new Image();
      img.src = newPlaybackUrl;
      assetResolver.registerCustomImage(assetId, img);
    }

    return updatedAsset;
  }

  /**
   * Relinks missing media binary for an existing asset ID.
   */
  public async relinkMedia(assetId: string, file: File): Promise<BlueprintAsset> {
    return this.replaceMedia(assetId, file);
  }

  /**
   * Verifies the health of all assets, detecting any missing IndexedDB blobs.
   */
  public async verifyMediaHealth(assets: BlueprintAsset[]): Promise<{ missingIds: string[] }> {
    const missingIds: string[] = [];
    if (!assets || !Array.isArray(assets)) return { missingIds };

    for (const a of assets) {
      // Built-in presets are procedurally generated or bundled
      if (a.source === "builtin") continue;

      const hasBlob = await mediaStorage.hasMediaBlob(a.id);
      if (!hasBlob && (!a.src || a.src.startsWith("blob:"))) {
        missingIds.push(a.id);
      }
    }

    return { missingIds };
  }

  /**
   * Restores temporary playback URLs for all user-uploaded assets from IndexedDB on startup.
   */
  public async hydrateAssetsFromStorage(assets: BlueprintAsset[]): Promise<BlueprintAsset[]> {
    if (!assets || !Array.isArray(assets)) return [];

    const hydrated: BlueprintAsset[] = [];

    for (const a of assets) {
      if (a.source === "upload" || a.source === "url") {
        const blob = await mediaStorage.getMediaBlob(a.id);
        if (blob) {
          const freshUrl = await mediaStorage.getOrCreatePlaybackUrl(a.id, blob);
          const updated: BlueprintAsset = {
            ...a,
            src: freshUrl || a.src,
          };
          assetResolver.registerAsset(updated);

          if (
            freshUrl &&
            typeof Image !== "undefined" &&
            (a.type === "image" || a.type === "background" || a.type === "prop")
          ) {
            const img = new Image();
            img.src = freshUrl;
            assetResolver.registerCustomImage(a.id, img);
          }

          hydrated.push(updated);
          continue;
        }
      }

      hydrated.push(a);
    }

    return hydrated;
  }
}

export const mediaImportEngine = new MediaImportEngine();
