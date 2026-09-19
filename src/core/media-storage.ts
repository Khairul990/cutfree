/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Local-First IndexedDB Media Storage & Object URL Lifecycle Manager for CutFree Studio.
 * Stores raw media Blobs (images, video, audio) in IndexedDB so large media survives
 * page reloads without touching localStorage or requiring external cloud services.
 */

const DB_NAME = "cutfree_media_db";
const DB_VERSION = 1;
const STORE_NAME = "media_blobs";

export interface StoredMediaRecord {
  id: string; // stable asset ID
  blob: Blob;
  mimeType: string;
  fileName: string;
  fileSize: number;
  checksum?: string;
  updatedAt: number;
}

class MediaStorageManager {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private activeUrls: Map<string, string> = new Map(); // assetId -> active object URL

  constructor() {
    // Safe cleanup on window unload to revoke all temporary object URLs
    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", () => {
        this.revokeAllUrls();
      });
    }
  }

  private getDB(): Promise<IDBDatabase> {
    if (typeof indexedDB === "undefined") {
      return Promise.reject(new Error("IndexedDB is not supported in this environment"));
    }

    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = (e) => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: "id" });
          }
        };

        req.onsuccess = () => resolve(req.result);
        req.onerror = () => {
          console.error("Failed to open IndexedDB media database:", req.error);
          reject(req.error);
        };
      });
    }

    return this.dbPromise;
  }

  /**
   * Saves a media Blob or File into permanent IndexedDB storage.
   */
  public async saveMediaBlob(
    id: string,
    blob: Blob,
    meta?: { fileName?: string; mimeType?: string; checksum?: string }
  ): Promise<void> {
    const db = await this.getDB();
    const record: StoredMediaRecord = {
      id,
      blob,
      mimeType: meta?.mimeType || blob.type || "application/octet-stream",
      fileName: meta?.fileName || id,
      fileSize: blob.size,
      checksum: meta?.checksum,
      updatedAt: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(record);

      req.onsuccess = () => resolve();
      req.onerror = () => {
        console.error(`Error saving media blob for asset ${id}:`, req.error);
        reject(req.error);
      };
    });
  }

  /**
   * Retrieves a stored media Blob by stable asset ID.
   */
  public async getMediaBlob(id: string): Promise<Blob | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);

      req.onsuccess = () => {
        const record = req.result as StoredMediaRecord | undefined;
        resolve(record ? record.blob : null);
      };
      req.onerror = () => {
        console.error(`Error retrieving media blob for asset ${id}:`, req.error);
        reject(req.error);
      };
    });
  }

  /**
   * Checks if a media Blob exists for an asset ID.
   */
  public async hasMediaBlob(id: string): Promise<boolean> {
    const blob = await this.getMediaBlob(id);
    return blob !== null;
  }

  /**
   * Deletes a stored media Blob by stable asset ID.
   */
  public async deleteMediaBlob(id: string): Promise<void> {
    // Revoke any active temporary object URL
    this.revokeUrl(id);

    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);

      req.onsuccess = () => resolve();
      req.onerror = () => {
        console.error(`Error deleting media blob for asset ${id}:`, req.error);
        reject(req.error);
      };
    });
  }

  /**
   * Returns a temporary playback object URL for the given asset.
   * If an active object URL already exists, it is reused.
   * If not, a new one is created from the IndexedDB Blob and cached.
   */
  public async getOrCreatePlaybackUrl(id: string, fallbackBlob?: Blob): Promise<string | null> {
    if (this.activeUrls.has(id)) {
      return this.activeUrls.get(id)!;
    }

    let blob = fallbackBlob;
    if (!blob) {
      blob = (await this.getMediaBlob(id)) || undefined;
    }

    if (!blob) return null;

    if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
      const url = URL.createObjectURL(blob);
      this.activeUrls.set(id, url);
      return url;
    }

    return null;
  }

  /**
   * Registers or replaces an active object URL for an asset ID.
   * Revokes the old URL if one was already active.
   */
  public registerPlaybackUrl(id: string, url: string): void {
    if (this.activeUrls.has(id)) {
      const oldUrl = this.activeUrls.get(id);
      if (oldUrl && oldUrl !== url && oldUrl.startsWith("blob:")) {
        URL.revokeObjectURL(oldUrl);
      }
    }
    this.activeUrls.set(id, url);
  }

  /**
   * Revokes the temporary object URL for an asset ID to release memory.
   */
  public revokeUrl(id: string): void {
    if (this.activeUrls.has(id)) {
      const url = this.activeUrls.get(id);
      if (url && url.startsWith("blob:") && typeof URL !== "undefined") {
        try {
          URL.revokeObjectURL(url);
        } catch {}
      }
      this.activeUrls.delete(id);
    }
  }

  /**
   * Revokes all active temporary object URLs.
   */
  public revokeAllUrls(): void {
    for (const [id, url] of this.activeUrls.entries()) {
      if (url && url.startsWith("blob:") && typeof URL !== "undefined") {
        try {
          URL.revokeObjectURL(url);
        } catch {}
      }
    }
    this.activeUrls.clear();
  }

  /**
   * Returns a list of all stored asset IDs in IndexedDB.
   */
  public async listStoredMediaIds(): Promise<string[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAllKeys();

      req.onsuccess = () => {
        resolve((req.result as string[]) || []);
      };
      req.onerror = () => reject(req.error);
    });
  }
}

export const mediaStorage = new MediaStorageManager();
