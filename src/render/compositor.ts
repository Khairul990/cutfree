/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Unified Canvas Compositor for CutFree Studio.
 * Synchronously renders frame at time `t` identically for live preview and video export.
 */

import { VideoBlueprint, BlueprintScene } from "../types/blueprint";
import { computeCameraTransform } from "../animation/camera-engine";
import { renderCharacter } from "../animation/character-engine";
import { renderSceneObject } from "../animation/object-engine";
import { assetResolver } from "../core/asset-resolver";

export interface CompositorOptions {
  showWatermark?: boolean;
  showCaptions?: boolean;
  watermarkText?: string;
  isShorts?: boolean;
}

export class VideoCompositor {
  private noiseCanvas: HTMLCanvasElement | null = null;

  constructor() {
    this.initNoise();
  }

  private initNoise() {
    if (typeof document === "undefined") return;
    const c = document.createElement("canvas");
    c.width = c.height = 120;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const img = ctx.createImageData(120, 120);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 110 + Math.random() * 90;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    this.noiseCanvas = c;
  }

  public renderFrame(
    canvas: HTMLCanvasElement,
    blueprint: VideoBlueprint,
    currentTime: number,
    isShorts: boolean = false
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    this.render(ctx, blueprint, currentTime, { isShorts });
  }

  public render(
    ctx: CanvasRenderingContext2D,
    blueprint: VideoBlueprint,
    currentTime: number,
    opts: CompositorOptions = {}
  ) {
    const width = blueprint.project.width || 1920;
    const height = blueprint.project.height || 1080;
    const isShorts = blueprint.project.aspectRatio === "9:16";

    // 1. Find active scene at currentTime
    const scenes = blueprint.scenes || [];
    let currentScene: BlueprintScene | null = null;
    let sceneIndex = 0;

    for (let i = 0; i < scenes.length; i++) {
      const s = scenes[i];
      if (currentTime >= s.start && currentTime <= s.end) {
        currentScene = s;
        sceneIndex = i;
        break;
      }
    }

    // Fallback to last or first scene if out of bounds
    if (!currentScene && scenes.length > 0) {
      if (currentTime < scenes[0].start) {
        currentScene = scenes[0];
        sceneIndex = 0;
      } else {
        currentScene = scenes[scenes.length - 1];
        sceneIndex = scenes.length - 1;
      }
    }

    const sceneDur = currentScene ? Math.max(0.1, currentScene.end - currentScene.start) : 5;
    const sceneElapsed = currentScene ? Math.max(0, currentTime - currentScene.start) : 0;
    const sceneProgress = Math.min(1.0, sceneElapsed / sceneDur);

    // 2. Compute camera transformation
    const cameraPreset = currentScene?.camera?.preset || "static";
    const cameraIntensity = currentScene?.camera?.intensity ?? 1.0;
    const camera = computeCameraTransform(cameraPreset, sceneProgress, width, height, cameraIntensity);

    ctx.save();
    ctx.clearRect(0, 0, width, height);

    // Base background color
    ctx.fillStyle = "#05070f";
    ctx.fillRect(0, 0, width, height);

    // 3. Render Background with Camera Transform & Parallax
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.scale(camera.scale, camera.scale);
    ctx.rotate(camera.rotation);
    ctx.translate(-width / 2 + camera.parallaxX, -height / 2 + camera.parallaxY);

    this.renderBackground(ctx, currentScene, width, height, currentTime, sceneProgress);
    ctx.restore();

    // 4. Render Characters with Camera Transform
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.scale(camera.scale, camera.scale);
    ctx.rotate(camera.rotation);
    ctx.translate(-width / 2 + camera.translateX, -height / 2 + camera.translateY);

    if (currentScene?.characters && currentScene.characters.length > 0) {
      for (const char of currentScene.characters) {
        renderCharacter(ctx, char, sceneProgress, width, height, currentTime);
      }
    }

    // 5. Render Scene Objects / Props
    if (currentScene?.objects && currentScene.objects.length > 0) {
      for (const obj of currentScene.objects) {
        renderSceneObject(ctx, obj, sceneProgress, width, height, currentTime);
      }
    }
    ctx.restore();

    // 6. Kinetic Scene Text / Typography (Foreground HUD)
    this.renderSceneText(ctx, currentScene, width, height, sceneProgress, isShorts);

    // 7. Synchronized Subtitles / Captions (Word-level or segment-level)
    if (opts.showCaptions !== false) {
      this.renderCaptions(ctx, blueprint, currentTime, width, height, isShorts);
    }

    // 8. Filmic Vignette & Texture
    this.renderVignette(ctx, width, height);

    // 9. Watermark Badge
    const watermark = opts.watermarkText || blueprint.project.watermark;
    if (opts.showWatermark !== false && watermark) {
      this.renderWatermark(ctx, watermark, width, height);
    }

    // 10. Scene Transition Overlay
    if (currentScene) {
      this.renderTransition(ctx, currentScene, sceneElapsed, width, height);
    }

    ctx.restore();
  }

  private renderBackground(
    ctx: CanvasRenderingContext2D,
    scene: BlueprintScene | null,
    width: number,
    height: number,
    timeSec: number,
    sceneProgress: number
  ) {
    ctx.save();
    const opacity = scene?.background?.opacity !== undefined
      ? (scene.background.opacity <= 1 ? scene.background.opacity : scene.background.opacity / 100)
      : 1.0;
    ctx.globalAlpha = Math.max(0, Math.min(1, opacity));

    const bgAssetId = scene?.background?.assetId || "night_sky";
    const resolved = assetResolver.resolve(bgAssetId, "background");

    if (resolved.image) {
      // Draw image with fit
      const img = resolved.image;
      const fit = scene?.background?.fit || "cover";
      if (fit === "cover") {
        const scale = Math.max(width / img.width, height / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
      } else {
        ctx.drawImage(img, 0, 0, width, height);
      }
    } else {
      // Atmospheric Procedural Gradient + Aurora
      const grad = ctx.createRadialGradient(
        width * 0.5 + Math.sin(timeSec * 0.5) * 80,
        height * 0.35 + Math.cos(timeSec * 0.4) * 60,
        40,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.8
      );

      const color = resolved.colorPreset || { bg: "#060914", accent: "#38bdf8" };
      grad.addColorStop(0, color.accent);
      grad.addColorStop(0.5, color.bg);
      grad.addColorStop(1, "#020408");

      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Starfield / Ambient Particles
      this.renderAtmosphericStars(ctx, width, height, timeSec);

      // Scenic vector silhouettes (Mosque, Village, Forest)
      this.renderScenicSilhouette(ctx, bgAssetId, width, height, timeSec);
    }
    ctx.restore();
  }

  private renderScenicSilhouette(ctx: CanvasRenderingContext2D, bgAssetId: string, width: number, height: number, timeSec: number) {
    const id = bgAssetId.toLowerCase();
    ctx.save();

    if (id.includes("mosque")) {
      // Golden Moon
      ctx.save();
      ctx.fillStyle = "#fef08a";
      ctx.shadowColor = "rgba(253, 224, 71, 0.6)";
      ctx.shadowBlur = 24;
      ctx.beginPath();
      ctx.arc(width * 0.78, height * 0.22, 38, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#0c1724";
      ctx.beginPath();
      ctx.arc(width * 0.78 + 12, height * 0.22 - 6, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Distant Mosque Domes and Minarets Silhouette
      ctx.fillStyle = "#09121f";
      const ground = height * 0.82;
      ctx.fillRect(0, ground, width, height - ground);

      // Main dome
      ctx.beginPath();
      ctx.arc(width * 0.5, ground, width * 0.12, Math.PI, 0);
      ctx.fill();
      // Left dome
      ctx.beginPath();
      ctx.arc(width * 0.32, ground, width * 0.08, Math.PI, 0);
      ctx.fill();
      // Right dome
      ctx.beginPath();
      ctx.arc(width * 0.68, ground, width * 0.08, Math.PI, 0);
      ctx.fill();

      // Left Minaret
      ctx.fillRect(width * 0.22, ground - height * 0.35, width * 0.025, height * 0.35);
      ctx.beginPath();
      ctx.moveTo(width * 0.21, ground - height * 0.35);
      ctx.lineTo(width * 0.2325, ground - height * 0.42);
      ctx.lineTo(width * 0.255, ground - height * 0.35);
      ctx.fill();

      // Right Minaret
      ctx.fillRect(width * 0.755, ground - height * 0.35, width * 0.025, height * 0.35);
      ctx.beginPath();
      ctx.moveTo(width * 0.745, ground - height * 0.35);
      ctx.lineTo(width * 0.7675, ground - height * 0.42);
      ctx.lineTo(width * 0.79, ground - height * 0.35);
      ctx.fill();

      // Warm interior arch glow
      ctx.fillStyle = "rgba(251, 191, 36, 0.35)";
      ctx.beginPath();
      ctx.arc(width * 0.5, ground, width * 0.04, Math.PI, 0);
      ctx.fill();
    } else if (id.includes("village")) {
      // Rolling Village Hills
      ctx.fillStyle = "#062817";
      ctx.beginPath();
      ctx.moveTo(0, height * 0.75);
      ctx.quadraticCurveTo(width * 0.3, height * 0.68, width * 0.6, height * 0.74);
      ctx.quadraticCurveTo(width * 0.85, height * 0.79, width, height * 0.72);
      ctx.lineTo(width, height);
      ctx.lineTo(0, height);
      ctx.fill();

      ctx.fillStyle = "#03170d";
      ctx.beginPath();
      ctx.moveTo(0, height * 0.82);
      ctx.quadraticCurveTo(width * 0.4, height * 0.88, width, height * 0.8);
      ctx.lineTo(width, height);
      ctx.lineTo(0, height);
      ctx.fill();
    } else if (id.includes("forest")) {
      // Forest Pine Silhouettes
      ctx.fillStyle = "#03140e";
      for (let i = 0; i < width; i += 40) {
        const treeH = 90 + Math.sin(i * 0.1) * 40;
        ctx.beginPath();
        ctx.moveTo(i, height * 0.85);
        ctx.lineTo(i + 20, height * 0.85 - treeH);
        ctx.lineTo(i + 40, height * 0.85);
        ctx.fill();
      }
      ctx.fillRect(0, height * 0.85, width, height * 0.15);
    }

    ctx.restore();
  }

  private renderAtmosphericStars(ctx: CanvasRenderingContext2D, width: number, height: number, timeSec: number) {
    ctx.save();
    ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
    for (let i = 0; i < 35; i++) {
      const seed = (i * 12345.67) % 1;
      const x = ((seed * width * 3) + timeSec * 4) % width;
      const y = ((i * 9876.54) % 1) * height * 0.65;
      const size = 1 + (i % 3) * 0.8;
      const alpha = 0.3 + 0.7 * Math.sin(timeSec * 3 + i);
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private renderSceneText(
    ctx: CanvasRenderingContext2D,
    scene: BlueprintScene | null,
    width: number,
    height: number,
    sceneProgress: number,
    isShorts: boolean
  ) {
    if (!scene) return;
    const title = scene.title || scene.heading || "";
    const body = scene.body || scene.text || "";

    if (!title && !body) return;

    // Entrance animation
    const textAlpha = Math.min(1.0, sceneProgress / 0.12);
    const slideOffset = (1.0 - textAlpha) * 20;

    ctx.save();
    ctx.globalAlpha = textAlpha;

    const centerX = width / 2;
    const baseY = isShorts ? height * 0.28 : height * 0.24;

    if (title) {
      const fontSize = isShorts ? Math.round(width * 0.058) : Math.round(width * 0.038);
      ctx.font = `900 ${fontSize}px "Noto Sans Bengali", "Hind Siliguri", system-ui, sans-serif`;
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // Backdrop glow
      ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 4;

      ctx.fillText(title, centerX, baseY - slideOffset);
    }

    if (body) {
      const fontSize = isShorts ? Math.round(width * 0.044) : Math.round(width * 0.024);
      ctx.font = `600 ${fontSize}px "Noto Sans Bengali", "Hind Siliguri", system-ui, sans-serif`;
      ctx.fillStyle = "#cbd5e1";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 2;

      ctx.fillText(body, centerX, baseY + (isShorts ? 60 : 45) - slideOffset);
    }

    ctx.restore();
  }

  private renderCaptions(
    ctx: CanvasRenderingContext2D,
    blueprint: VideoBlueprint,
    currentTime: number,
    width: number,
    height: number,
    isShorts: boolean
  ) {
    const captions = blueprint.captions || [];
    const active = captions.find((c) => currentTime >= c.start && currentTime <= c.end);
    if (!active || !active.text) return;

    const capElapsed = Math.max(0, currentTime - active.start);
    const capDuration = Math.max(0.1, active.end - active.start);
    const capProgress = Math.min(1.0, capElapsed / capDuration);

    const style = (active as any).style || {};
    const fontFamily = style.fontFamily || "Noto Sans Bengali";
    const fontWeight = style.fontWeight || "800";
    const animStyle = style.animation || "fade";

    let animScale = 1.0;
    let animOffsetY = 0;
    let animOpacity = 1.0;
    let displayText = active.text;

    if (animStyle === "typewriter") {
      const charCount = Math.max(1, Math.floor(active.text.length * Math.min(1.0, capProgress * 2.2)));
      displayText = active.text.slice(0, charCount);
    } else if (animStyle === "slide") {
      if (capElapsed < 0.25) {
        animOffsetY = (1 - capElapsed / 0.25) * 20;
        animOpacity = capElapsed / 0.25;
      }
    } else if (animStyle === "scale") {
      if (capElapsed < 0.2) {
        animScale = 0.85 + 0.15 * (capElapsed / 0.2);
      }
    } else {
      if (capElapsed < 0.2) {
        animOpacity = capElapsed / 0.2;
      }
    }

    ctx.save();
    const capY = (isShorts ? height * 0.78 : height * 0.86) + animOffsetY;
    const fontSize = isShorts ? Math.round(width * 0.048) : Math.round(width * 0.028);

    ctx.globalAlpha = Math.max(0, Math.min(1, animOpacity));
    ctx.font = `${fontWeight} ${fontSize}px "${fontFamily}", "Hind Siliguri", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Caption Box Background
    const textWidth = ctx.measureText(displayText).width;
    const padX = fontSize * 0.8;
    const padY = fontSize * 0.45;

    ctx.translate(width / 2, capY);
    ctx.scale(animScale, animScale);

    ctx.fillStyle = "rgba(9, 14, 28, 0.78)";
    ctx.beginPath();
    ctx.roundRect(-textWidth / 2 - padX, -padY, textWidth + padX * 2, padY * 2, 12);
    ctx.fill();

    ctx.strokeStyle = "rgba(56, 189, 248, 0.4)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Text rendering
    ctx.fillStyle = style.color || "#38bdf8";
    ctx.fillText(displayText, 0, 0);

    ctx.restore();
  }

  private renderTransition(
    ctx: CanvasRenderingContext2D,
    scene: BlueprintScene,
    elapsed: number,
    width: number,
    height: number
  ) {
    const duration = Math.max(0.1, scene.transitionDuration ?? 1.0);
    if (elapsed >= duration) return;

    const progress = elapsed / duration;
    const transition = scene.transition || "fade";

    ctx.save();
    if (transition === "fade") {
      const alpha = Math.max(0, 1 - progress);
      ctx.fillStyle = `rgba(5, 7, 15, ${alpha.toFixed(3)})`;
      ctx.fillRect(0, 0, width, height);
    } else if (transition === "dissolve") {
      const alpha = Math.max(0, 1 - progress);
      ctx.fillStyle = `rgba(15, 23, 42, ${(alpha * 0.85).toFixed(3)})`;
      ctx.fillRect(0, 0, width, height);
    } else if (transition === "slide") {
      const slideOffset = (1 - progress) * width;
      ctx.fillStyle = "#07101A";
      ctx.fillRect(width - slideOffset, 0, slideOffset, height);
    }
    ctx.restore();
  }

  private renderVignette(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const vig = ctx.createRadialGradient(
      width / 2,
      height / 2,
      Math.min(width, height) * 0.45,
      width / 2,
      height / 2,
      Math.max(width, height) * 0.75
    );
    vig.addColorStop(0, "rgba(0, 0, 0, 0)");
    vig.addColorStop(1, "rgba(0, 0, 0, 0.58)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, width, height);
  }

  private renderWatermark(ctx: CanvasRenderingContext2D, text: string, width: number, height: number) {
    ctx.save();
    ctx.font = "bold 13px system-ui, sans-serif";
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
    ctx.shadowBlur = 6;
    ctx.fillText(text, width - 24, height - 20);
    ctx.restore();
  }
}

export const videoCompositor = new VideoCompositor();
