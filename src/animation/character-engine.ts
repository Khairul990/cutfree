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
  } else if (char.id === "nuri" || resolved.name.toLowerCase().includes("nuri")) {
    renderNuriStar(ctx, baseScale, char.emotion, action, resolved.name);
  } else if (char.id === "nooruddin" || resolved.name.toLowerCase().includes("nooruddin")) {
    renderNooruddin(ctx, baseScale, char.emotion, action, armGesture, resolved.name);
  } else {
    // Render high-quality artistic silhouette / vector character
    renderProceduralCharacter(ctx, baseScale, char.emotion, action, armGesture, resolved.name);
  }

  ctx.restore();
}

function renderNuriStar(
  ctx: CanvasRenderingContext2D,
  scale: number,
  emotion: string = "happy",
  action: string,
  name: string
) {
  const s = scale * 1.5;

  // Star glow
  ctx.save();
  ctx.shadowColor = "rgba(251, 191, 36, 0.85)";
  ctx.shadowBlur = 30 * s;

  // 5-point Star
  ctx.beginPath();
  const spikes = 5;
  const outerRadius = 52 * s;
  const innerRadius = 26 * s;
  let rot = (Math.PI / 2) * 3;
  let x = 0;
  let y = -70 * s;
  const step = Math.PI / spikes;

  ctx.moveTo(x, y - outerRadius);
  for (let i = 0; i < spikes; i++) {
    x = Math.cos(rot) * outerRadius;
    y = -70 * s + Math.sin(rot) * outerRadius;
    ctx.lineTo(x, y);
    rot += step;

    x = Math.cos(rot) * innerRadius;
    y = -70 * s + Math.sin(rot) * innerRadius;
    ctx.lineTo(x, y);
    rot += step;
  }
  ctx.lineTo(0, -70 * s - outerRadius);
  ctx.closePath();

  // Gradient fill for star
  const grad = ctx.createRadialGradient(0, -70 * s, 5 * s, 0, -70 * s, 55 * s);
  grad.addColorStop(0, "#fffbeb");
  grad.addColorStop(0.4, "#fde047");
  grad.addColorStop(1, "#f59e0b");
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = "#fbbf24";
  ctx.lineWidth = 2 * s;
  ctx.stroke();
  ctx.restore();

  // Star cute eyes
  ctx.fillStyle = "#1e1b4b";
  ctx.beginPath();
  ctx.arc(-11 * s, -74 * s, 4 * s, 0, Math.PI * 2);
  ctx.arc(11 * s, -74 * s, 4 * s, 0, Math.PI * 2);
  ctx.fill();

  // Eye highlights
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(-12 * s, -76 * s, 1.5 * s, 0, Math.PI * 2);
  ctx.arc(10 * s, -76 * s, 1.5 * s, 0, Math.PI * 2);
  ctx.fill();

  // Blushing cheeks
  ctx.fillStyle = "rgba(244, 63, 94, 0.4)";
  ctx.beginPath();
  ctx.arc(-17 * s, -68 * s, 5 * s, 0, Math.PI * 2);
  ctx.arc(17 * s, -68 * s, 5 * s, 0, Math.PI * 2);
  ctx.fill();

  // Cute smiling mouth
  ctx.beginPath();
  ctx.arc(0, -68 * s, 7 * s, 0.1 * Math.PI, 0.9 * Math.PI);
  ctx.strokeStyle = "#78350f";
  ctx.lineWidth = 2.2 * s;
  ctx.stroke();

  // Name tag
  ctx.font = `bold ${Math.round(11 * s)}px system-ui, sans-serif`;
  ctx.fillStyle = "#fbbf24";
  ctx.textAlign = "center";
  ctx.fillText(name, 0, 15 * s);
}

function renderNooruddin(
  ctx: CanvasRenderingContext2D,
  scale: number,
  emotion: string = "neutral",
  action: string,
  armAngleDeg: number,
  name: string
) {
  const s = scale * 1.5;

  // Shadow
  ctx.beginPath();
  ctx.ellipse(0, 10 * s, 40 * s, 9 * s, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
  ctx.fill();

  // Green Jubbah / Robe
  ctx.beginPath();
  ctx.moveTo(-25 * s, 5 * s);
  ctx.lineTo(-18 * s, -90 * s);
  ctx.quadraticCurveTo(0, -105 * s, 18 * s, -90 * s);
  ctx.lineTo(25 * s, 5 * s);
  ctx.closePath();
  ctx.fillStyle = "#065f46"; // Islamic rich emerald green
  ctx.fill();
  ctx.strokeStyle = "#34d399";
  ctx.lineWidth = 2 * s;
  ctx.stroke();

  // Gold Trim Collar
  ctx.beginPath();
  ctx.arc(0, -88 * s, 8 * s, 0, Math.PI);
  ctx.strokeStyle = "#fbbf24";
  ctx.lineWidth = 2.5 * s;
  ctx.stroke();

  // Head / Face
  ctx.beginPath();
  ctx.arc(0, -125 * s, 24 * s, 0, Math.PI * 2);
  ctx.fillStyle = "#ffedd5";
  ctx.fill();

  // White Kufi / Prayer Cap
  ctx.beginPath();
  ctx.arc(0, -132 * s, 24.5 * s, Math.PI * 0.9, Math.PI * 2.1);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 2 * s;
  ctx.stroke();

  // Cute Eyes
  ctx.fillStyle = "#0f172a";
  ctx.beginPath();
  ctx.arc(-8 * s, -123 * s, 3.5 * s, 0, Math.PI * 2);
  ctx.arc(8 * s, -123 * s, 3.5 * s, 0, Math.PI * 2);
  ctx.fill();

  // Eye highlights
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(-9 * s, -125 * s, 1.2 * s, 0, Math.PI * 2);
  ctx.arc(7 * s, -125 * s, 1.2 * s, 0, Math.PI * 2);
  ctx.fill();

  // Cheerful Smile
  ctx.beginPath();
  ctx.arc(0, -117 * s, 6 * s, 0.1 * Math.PI, 0.9 * Math.PI);
  ctx.strokeStyle = "#c2410c";
  ctx.lineWidth = 1.8 * s;
  ctx.stroke();

  // Arm with gesture
  ctx.save();
  ctx.translate(16 * s, -80 * s);
  ctx.rotate((armAngleDeg * Math.PI) / 180);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(22 * s, 18 * s);
  ctx.strokeStyle = "#047857";
  ctx.lineWidth = 4 * s;
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.restore();

  // Name Tag
  ctx.font = `bold ${Math.round(11 * s)}px system-ui, sans-serif`;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.fillText(name, 0, 26 * s);
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
