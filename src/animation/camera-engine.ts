/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Camera motion and multi-layer parallax engine for CutFree Studio.
 */

import { CameraPreset } from "../types/blueprint";

export interface CameraTransform {
  scale: number;
  translateX: number;
  translateY: number;
  rotation: number; // radians
  parallaxX: number;
  parallaxY: number;
}

export function computeCameraTransform(
  preset: CameraPreset = "static",
  progress: number, // 0.0 to 1.0 within the scene
  width: number,
  height: number,
  intensity: number = 1.0
): CameraTransform {
  const p = Math.max(0, Math.min(1, progress));
  let scale = 1.0;
  let translateX = 0;
  let translateY = 0;
  let rotation = 0;
  let parallaxX = 0;
  let parallaxY = 0;

  switch (preset) {
    case "slow_zoom_in":
      scale = 1.0 + 0.12 * p * intensity;
      break;

    case "slow_zoom_out":
      scale = 1.12 - 0.12 * p * intensity;
      break;

    case "pan_left":
      scale = 1.08;
      translateX = (width * 0.05 * (1 - p) - width * 0.05 * p) * intensity;
      parallaxX = translateX * 0.4;
      break;

    case "pan_right":
      scale = 1.08;
      translateX = (-width * 0.05 * (1 - p) + width * 0.05 * p) * intensity;
      parallaxX = translateX * 0.4;
      break;

    case "pan_up":
      scale = 1.08;
      translateY = (height * 0.04 * (1 - p) - height * 0.04 * p) * intensity;
      parallaxY = translateY * 0.4;
      break;

    case "pan_down":
      scale = 1.08;
      translateY = (-height * 0.04 * (1 - p) + height * 0.04 * p) * intensity;
      parallaxY = translateY * 0.4;
      break;

    case "zoom_focus":
      scale = 1.0 + 0.22 * Math.sin(p * Math.PI) * intensity;
      break;

    case "camera_push":
      // Smooth dynamic push into action
      scale = 1.0 + 0.18 * (p * p) * intensity;
      break;

    case "camera_pull":
      scale = 1.18 - 0.18 * (p * p) * intensity;
      break;

    case "shake_light": {
      scale = 1.04;
      const freq = p * 40;
      translateX = Math.sin(freq) * 4 * intensity;
      translateY = Math.cos(freq * 1.3) * 3 * intensity;
      rotation = (Math.sin(freq * 0.7) * 0.005) * intensity;
      break;
    }

    case "shake_medium": {
      scale = 1.08;
      const freq = p * 60;
      translateX = Math.sin(freq) * 10 * intensity;
      translateY = Math.cos(freq * 1.4) * 8 * intensity;
      rotation = (Math.sin(freq * 0.8) * 0.012) * intensity;
      break;
    }

    case "static":
    default:
      scale = 1.0;
      translateX = 0;
      translateY = 0;
      break;
  }

  return {
    scale,
    translateX,
    translateY,
    rotation,
    parallaxX,
    parallaxY,
  };
}
