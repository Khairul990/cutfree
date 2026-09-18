/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Character rendering and animation engine for CutFree Studio.
 */

import { CharacterRef } from "../types/blueprint";
import { assetResolver } from "../core/asset-resolver";

export function renderCharacter(
  ctx: CanvasRenderingContext2D,
  char: CharacterRef,
  sceneProgress: number, // 0.0 - 1.0
  width: number,
  height: number,
  timeSec: number
) {
  const resolved = assetResolver.resolve(char.id, "character");

  // Entrance & Exit animation offsets
  let opacity = 1.0;
  let offsetX = 0;
  let offsetY = 0;
  let scaleMult = 1.0;

  // Entrance (first 15% of scene)
  if (sceneProgress < 0.15) {
    const ep = sceneProgress / 0.15;
    if (char.entrance === "enter_left") offsetX = (1 - ep) * -width * 0.3;
    else if (char.entrance === "enter_right") offsetX = (1 - ep) * width * 0.3;
    else if (char.entrance === "fade_in") opacity = ep;
    else if (char.entrance === "scale_in") scaleMult = 0.5 + 0.5 * ep;
    else if (char.entrance === "slide_in") offsetY = (1 - ep) * height * 0.2;
  }

  // Exit (last 15% of scene)
  if (sceneProgress > 0.85) {
    const xp = (sceneProgress - 0.85) / 0.15;
    if (char.exit === "exit_left") offsetX = xp * -width * 0.3;
    else if (char.exit === "exit_right") offsetX = xp * width * 0.3;
    else if (char.exit === "fade_out") opacity = 1 - xp;
    else if (char.exit === "scale_out") scaleMult = 1.0 - 0.5 * xp;
    else if (char.exit === "slide_out") offsetY = xp * height * 0.2;
  }

  // Base position (default centered bottom)
  const normX = char.position?.x ?? 0.5;
  const normY = char.position?.y ?? 0.75;
  const baseScale = (char.scale ?? 1.0) * scaleMult;

  const targetX = normX * width + offsetX;
  const targetY = normY * height + offsetY;

  // Action dynamics
  const action = char.action || "idle";
  let bobY = 0;
  let tilt = 0;
  let armGesture = 0;

  if (action === "idle") {
    // Gentle breathing bob
    bobY = Math.sin(timeSec * 2.5) * 5 * baseScale;
  } else if (action === "walk") {
    // Walking stride bob + slight sway
    bobY = Math.abs(Math.sin(timeSec * 5.5)) * 14 * baseScale;
    tilt = Math.sin(timeSec * 5.5) * 0.04;
  } else if (action === "talk") {
    // Conversational gesture
    bobY = Math.sin(timeSec * 4) * 4 * baseScale;
    armGesture = Math.sin(timeSec * 5) * 15;
  } else if (action === "point") {
    armGesture = 35;
  } else if (action === "bounce") {
    bobY = Math.abs(Math.sin(timeSec * 8)) * 22 * baseScale;
  }

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
  ctx.translate(targetX, targetY - bobY);
  ctx.rotate(tilt);

  if (resolved.image) {
    // Render custom uploaded character image
    const charW = resolved.image.width * 0.5 * baseScale;
    const charH = resolved.image.height * 0.5 * baseScale;
    ctx.drawImage(resolved.image, -charW / 2, -charH, charW, charH);
  } else {
    // Render high-quality artistic silhouette / vector character
    renderProceduralCharacter(ctx, baseScale, char.emotion, action, armGesture, resolved.name);
  }

  ctx.restore();
}

function renderProceduralCharacter(
  ctx: CanvasRenderingContext2D,
  scale: number,
  emotion: string = "neutral",
  action: string,
  armAngleDeg: number,
  name: string
) {
  const s = scale * 1.6;

  // Shadow
  ctx.beginPath();
  ctx.ellipse(0, 10 * s, 45 * s, 10 * s, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
  ctx.fill();

  // Robe / Body
  ctx.beginPath();
  ctx.moveTo(-28 * s, 0);
  ctx.lineTo(-20 * s, -110 * s);
  ctx.quadraticCurveTo(0, -125 * s, 20 * s, -110 * s);
  ctx.lineTo(28 * s, 0);
  ctx.closePath();
  ctx.fillStyle = "#1e293b";
  ctx.fill();
  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 2.5 * s;
  ctx.stroke();

  // Head
  ctx.beginPath();
  ctx.arc(0, -145 * s, 22 * s, 0, Math.PI * 2);
  ctx.fillStyle = "#f8fafc";
  ctx.fill();

  // Turban / Headdress
  ctx.beginPath();
  ctx.arc(0, -152 * s, 23 * s, Math.PI * 0.8, Math.PI * 2.2);
  ctx.fillStyle = "#0284c7";
  ctx.fill();

  // Expressive Eyes / Emotion
  ctx.fillStyle = "#0f172a";
  if (emotion === "mysterious" || emotion === "serious") {
    ctx.fillRect(-10 * s, -148 * s, 6 * s, 3 * s);
    ctx.fillRect(4 * s, -148 * s, 6 * s, 3 * s);
  } else if (emotion === "happy" || emotion === "inspired") {
    ctx.beginPath();
    ctx.arc(-7 * s, -146 * s, 4 * s, Math.PI, 0);
    ctx.arc(7 * s, -146 * s, 4 * s, Math.PI, 0);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(-7 * s, -146 * s, 3 * s, 0, Math.PI * 2);
    ctx.arc(7 * s, -146 * s, 3 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  // Arm / Gesture
  ctx.save();
  ctx.translate(18 * s, -95 * s);
  ctx.rotate((armAngleDeg * Math.PI) / 180);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(25 * s, 20 * s);
  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 4 * s;
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.restore();

  // Name Tag / Character Badge
  ctx.font = `bold ${Math.round(11 * s)}px system-ui, sans-serif`;
  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.textAlign = "center";
  ctx.fillText(name, 0, 28 * s);
}
