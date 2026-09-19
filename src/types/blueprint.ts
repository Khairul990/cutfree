/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * CutFree Video Blueprint JSON v1.0 Specification
 * Authoritative schema for AI-driven deterministic video generation.
 */

export type AspectRatio = "16:9" | "9:16" | "1:1" | "4:5";
export type VideoFormat = "mp4" | "webm";
export type VideoCodec = "h264" | "vp9" | "vp8";
export type AudioCodec = "aac" | "opus";

export type CameraPreset =
  | "static"
  | "slow_zoom_in"
  | "slow_zoom_out"
  | "pan_left"
  | "pan_right"
  | "pan_up"
  | "pan_down"
  | "zoom_focus"
  | "camera_push"
  | "camera_pull"
  | "shake_light"
  | "shake_medium";

export type CharacterAction =
  | "idle"
  | "walk"
  | "run"
  | "talk"
  | "point"
  | "nod"
  | "look_left"
  | "look_right"
  | "bounce"
  | "shake";

export type CharacterEmotion =
  | "neutral"
  | "happy"
  | "serious"
  | "mysterious"
  | "alert"
  | "sad"
  | "inspired";

export type TransitionPreset =
  | "none"
  | "fade"
  | "slide"
  | "zoom"
  | "wipe"
  | "glitch"
  | "pageTurn"
  | "blurZoom"
  | "whipPan";

export type TextAnimationPreset =
  | "fade"
  | "slide_up"
  | "slide_down"
  | "slide_left"
  | "slide_right"
  | "scale"
  | "typewriter"
  | "word_reveal"
  | "line_reveal"
  | "pop"
  | "emphasis";

export type SegmentType = "speech" | "pause";

export interface BlueprintProject {
  id: string;
  title: string;
  language: string;
  fps: number;
  width: number;
  height: number;
  aspectRatio: AspectRatio;
  theme?: string;
  mood?: string;
  watermark?: string;
}

export interface BlueprintAudio {
  source?: string;
  duration: number;
  sampleRate?: number;
  channels?: number;
  fileName?: string;
}

export interface BlueprintTimeline {
  duration: number;
  totalScenes: number;
  totalSegments: number;
  totalCaptions?: number;
}

export interface CharacterRef {
  id: string;
  position?: { x: number; y: number }; // 0.0 - 1.0 normalized
  scale?: number;
  anchor?: "bottom" | "center" | "top";
  emotion?: CharacterEmotion;
  action?: CharacterAction;
  entrance?: "enter_left" | "enter_right" | "fade_in" | "slide_in" | "scale_in" | "none";
  exit?: "exit_left" | "exit_right" | "fade_out" | "slide_out" | "scale_out" | "none";
}

export interface SceneObjectRef {
  id: string;
  assetId: string;
  position: { x: number; y: number }; // 0.0 - 1.0 normalized
  scale?: number;
  rotation?: number; // degrees
  opacity?: number;
  start?: number; // relative to scene or absolute
  end?: number;
  animation?: "float" | "pulse" | "spin" | "glow" | "fade" | "none";
}

export interface SceneBackground {
  assetId: string;
  fit?: "cover" | "contain" | "fill";
  motion?: "static" | "slow_pan" | "slow_zoom" | "drift";
  parallax?: number; // 0.0 - 1.0
  blur?: number;
  opacity?: number;
}

export interface BlueprintScene {
  id: string;
  start: number; // seconds
  end: number;   // seconds
  purpose?: string;
  title?: string;
  subtitle?: string;
  text?: string;
  heading?: string;
  body?: string;
  items?: string[];
  background?: SceneBackground;
  characters?: CharacterRef[];
  objects?: SceneObjectRef[];
  camera?: {
    preset: CameraPreset;
    target?: { x: number; y: number };
    intensity?: number;
  };
  transition?: TransitionPreset;
  textAnimation?: TextAnimationPreset;
  mood?: string;
}

export interface BlueprintSegment {
  id: string;
  start: number;
  end: number;
  type: SegmentType;
  text?: string;
}

export interface WordTiming {
  text: string;
  start: number;
  end: number;
}

export interface BlueprintCaption {
  id?: string;
  start: number;
  end: number;
  text: string;
  style?: any;
  position?: "bottom" | "top" | "center";
  words?: WordTiming[];
}

export type CaptionItem = BlueprintCaption;

export type AssetType =
  | "character"
  | "background"
  | "object"
  | "prop"
  | "audio"
  | "music"
  | "sfx"
  | "video"
  | "image"
  | "subtitle"
  | "thumbnail"
  | "font";

export interface AssetMetadata {
  duration?: number;
  width?: number;
  height?: number;
  mimeType?: string;
  fileSize?: number;
  format?: string;
  sampleRate?: number;
  channels?: number;
  fps?: number;
  captionCount?: number;
  createdAt?: number;
  updatedAt?: number;
  originalFileName?: string;
  sourceUrl?: string;
  tags?: string[];
}

export interface BlueprintAsset {
  id: string;
  type: AssetType;
  name?: string;
  description?: string;
  url?: string;
  src?: string;
  category?: string;
  source?: "builtin" | "upload" | "url" | "generated" | "recorded";
  metadata?: AssetMetadata;
  thumbnailUrl?: string;
  colorPreset?: { bg: string; accent: string };
}

export interface BlueprintExport {
  format: VideoFormat;
  videoCodec: VideoCodec;
  audioCodec: AudioCodec;
  bitrate?: number;
  preset?: "youtube" | "shorts" | "square";
}

export interface BlueprintMarker {
  id: string;
  time: number; // in seconds
  label: string;
  color?: string;
}

export interface TimelineTrackConfig {
  id: string;
  type: "scenes" | "video" | "character" | "objects" | "captions" | "voice" | "music" | "sfx" | "markers";
  name: string;
  muted?: boolean;
  locked?: boolean;
  visible?: boolean;
  collapsed?: boolean;
  solo?: boolean;
}

export interface VideoBlueprint {
  version: "1.0";
  project: BlueprintProject;
  audio: BlueprintAudio;
  timeline: BlueprintTimeline;
  scenes: BlueprintScene[];
  segments: BlueprintSegment[];
  captions: BlueprintCaption[];
  assets: BlueprintAsset[];
  markers?: BlueprintMarker[];
  tracks?: TimelineTrackConfig[];
  export?: BlueprintExport;
}

export interface ValidationIssue {
  severity: "error" | "warning";
  code: string;
  field: string;
  message: string;
  fixable?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  repairedBlueprint?: VideoBlueprint;
}
