/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Scene object and props rendering engine for CutFree Studio.
 */

import { SceneObjectRef } from "../types/blueprint";
import { assetResolver } from "../core/asset-resolver";

export function renderSceneObject(
  ctx: CanvasRenderingContext2D,
  obj: SceneObjectRef,
  sceneProgress: number,
  width: number,
  height: number,
  timeSec: number
) {
  const resolved = assetResolver.resolve(obj.assetId, "object");
  const posX = (obj.position?.x ?? 0.5) * width;
  const posY = (obj.position?.y ?? 0.5) * height;
  const baseScale = obj.scale ?? 1.0;
  let rot = ((obj.rotation ?? 0) * Math.PI) / 180;
  let alpha = obj.opacity ?? 1.0;

  // Animation dynamics
  let animScale = 1.0;
  let offsetY = 0;

  if (obj.animation === "float") {
    offsetY = Math.sin(timeSec * 2.5 + posX) * 8 * baseScale;
  } else if (obj.animation === "pulse") {
    animScale = 1.0 + Math.sin(timeSec * 3) * 0.08;
  } else if (obj.animation === "spin") {
    rot += timeSec * 0.8;
  } else if (obj.animation === "glow") {
    alpha *= 0.7 + Math.sin(timeSec * 4) * 0.3;
  }

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.translate(posX, posY + offsetY);
  ctx.rotate(rot);
  ctx.scale(baseScale * animScale, baseScale * animScale);

  if (resolved.image) {
    const w = resolved.image.width * 0.4;
    const h = resolved.image.height * 0.4;
    ctx.drawImage(resolved.image, -w / 2, -h / 2, w, h);
  } else {
    // High-quality vector rendering based on object type
    renderProceduralObject(ctx, obj.assetId, resolved.name);
  }

  ctx.restore();
}

function renderProceduralObject(ctx: CanvasRenderingContext2D, assetId: string, name: string) {
  const id = assetId.toLowerCase();

  if (id.includes("door")) {
    // Closed Door Prop
    ctx.fillStyle = "#334155";
    ctx.fillRect(-35, -70, 70, 140);
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 3;
    ctx.strokeRect(-35, -70, 70, 140);
    // Door handle & keyhole
    ctx.fillStyle = "#fbbf24";
    ctx.beginPath();
    ctx.arc(20, 0, 5, 0, Math.PI * 2);
    ctx.fill();
  } else if (id.includes("lamp") || id.includes("lantern")) {
    // Glowing Lantern
    ctx.fillStyle = "#d97706";
    ctx.fillRect(-15, -25, 30, 50);
    ctx.beginPath();
    ctx.arc(0, 0, 35, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(251, 191, 36, 0.25)";
    ctx.fill();
    ctx.fillStyle = "#fef08a";
    ctx.fillRect(-8, -15, 16, 30);
  } else if (id.includes("book")) {
    // Open Book
    ctx.fillStyle = "#e2e8f0";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-25, -20, -45, -15);
    ctx.lineTo(-45, 25);
    ctx.quadraticCurveTo(-25, 20, 0, 40);
    ctx.quadraticCurveTo(25, 20, 45, 25);
    ctx.lineTo(45, -15);
    ctx.quadraticCurveTo(25, -20, 0, 0);
    ctx.fill();
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 2;
    ctx.stroke();
  } else if (id.includes("tree")) {
    // Flourishing Tree
    ctx.fillStyle = "#78350f";
    ctx.fillRect(-8, 5, 16, 35);
    ctx.fillStyle = "#15803d";
    ctx.beginPath();
    ctx.arc(0, -5, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#16a34a";
    ctx.beginPath();
    ctx.arc(-10, -15, 20, 0, Math.PI * 2);
    ctx.arc(10, -15, 20, 0, Math.PI * 2);
    ctx.arc(0, -25, 22, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Generic prop badge
    ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-40, -25, 80, 50, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(name.slice(0, 10), 0, 4);
  }
}
