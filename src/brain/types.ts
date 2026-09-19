/**
 * CutFree Brain Foundation — Phase 1
 * Central type definitions for the AI Video Brain.
 * Extends the existing Spec (Blueprint) without replacing it.
 * All types are browser-native and offline-first.
 */

export const BLUEPRINT_SCHEMA_VERSION = '1.0.0' as const;

// Minimal Blueprint shape — mirrors Spec in src/App.tsx without coupling.
// The authoritative Blueprint remains Spec; this is a structural contract for validation.
export interface BlueprintScene {
  type: string;
  dur: number;
  title?: string;
  subtitle?: string;
  heading?: string;
  body?: string;
  text?: string;
  items?: string[];
  value?: number;
  suffix?: string;
  label?: string;
  author?: string;
  cta?: string;
  isHook?: boolean;
  kicker?: string;
  transitionOut?: string;
  words?: { w: string; s: number; e: number }[];
  style?: string;
  emphasis?: number[];
}

export interface Blueprint {
  meta: {
    title: string;
    theme: string;
    mood: string;
    seed: number;
    watermark: string;
    showProgress: boolean;
    language: 'bn' | 'en';
    aspect: string;
    perf: string;
    shorts: boolean;
    safe: { top: number; bottom: number };
    captions: { enabled: boolean; style: string; scale: number };
  };
  fps: number;
  width: number;
  height: number;
  scenes: BlueprintScene[];
  captions?: { start: number; end: number; text: string; words?: { w: string; s: number; e: number }[] }[];
  duration: number;
}

// ---------------------------------------------------------------------------
// Audio Analysis — Timing Information
// ---------------------------------------------------------------------------
export interface AudioSpeechSegment {
  start: number; // seconds, >=0
  end: number;   // seconds, >= start
  confidence?: number; // 0..1, optional
}

export interface AudioPause {
  start: number;
  end: number;
  duration: number;
  kind: 'short' | 'long'; // short <0.6s, long >=0.6s
}

export interface TimingInfo {
  totalDuration: number;
  speechSegments: AudioSpeechSegment[];
  pauses: AudioPause[];
  speechTime: number;
  silenceTime: number;
  speechRatio: number; // 0..1
}

export interface AudioAnalysisResult {
  assetId: string; // stable ID from media import (or derived from file name)
  fileName: string;
  mime: string;
  duration: number; // real duration from decoded audio
  sampleRate: number;
  timing: TimingInfo;
  // raw vad for debugging, not required for blueprint
  vad?: {
    phrases: AudioSpeechSegment[];
    gaps: AudioPause[];
    noiseFloor: number;
    threshold: number;
  };
}

// ---------------------------------------------------------------------------
// Transcription Abstraction (provider-neutral)
// ---------------------------------------------------------------------------
export interface TranscriptionSegment {
  id: string;
  start: number;
  end: number;
  text: string;
  words?: { w: string; s: number; e: number }[];
}

export interface TranscriptionResult {
  provider: string; // e.g. "browser-vad", "whisper-local", "null"
  language: 'bn' | 'en' | 'auto';
  segments: TranscriptionSegment[];
  fullText: string;
  duration: number;
}

export interface TranscriptionProvider {
  readonly id: string;
  readonly displayName: string;
  isAvailable(): Promise<boolean> | boolean;
  transcribe(file: File, opts?: { language?: string }): Promise<TranscriptionResult>;
}

// ---------------------------------------------------------------------------
// JSON Blueprint Contract
// ---------------------------------------------------------------------------
export interface BlueprintMeta {
  schemaVersion: typeof BLUEPRINT_SCHEMA_VERSION;
  projectId: string;
  title: string;
  createdAt: string; // ISO
  language: 'bn' | 'en';
  audioRef?: {
    assetId: string;
    fileName: string;
    mime: string;
    duration: number;
  };
  timingRef?: TimingInfo;
}

export interface CutFreeBlueprintFile {
  meta: BlueprintMeta;
  blueprint: Blueprint; // the authoritative Spec
  segments?: TranscriptionSegment[]; // optional intermediate representation
  captions?: { start: number; end: number; text: string }[];
}

// ---------------------------------------------------------------------------
// Video Brain Abstraction
// ---------------------------------------------------------------------------
export interface VideoBrainInput {
  audioFile?: File;
  audioAnalysis?: AudioAnalysisResult;
  transcript?: TranscriptionResult;
  script?: string; // user-provided script (optional)
  styleHint?: string; // e.g. "islamic", "educational"
  theme?: string;
  mood?: string;
}

export interface VideoBrainResult {
  blueprint: Blueprint;
  blueprintFile: CutFreeBlueprintFile;
  warnings: string[]; // normalization warnings
  timing: TimingInfo | null;
}

export interface VideoBrainProvider {
  readonly id: string;
  readonly displayName: string;
  isAvailable(): Promise<boolean> | boolean;
  analyze(input: VideoBrainInput): Promise<VideoBrainResult>;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
export interface ValidationError {
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

// ---------------------------------------------------------------------------
// Ollama Adapter (optional, never mandatory)
// ---------------------------------------------------------------------------
export interface OllamaAdapterConfig {
  baseUrl: string; // e.g. http://localhost:11434
  model: string;   // e.g. llama3, mistral
}
