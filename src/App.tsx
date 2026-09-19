/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * CutFree Studio — React Production Studio
 * Deterministic Auto-Director + motion engine. Offline-first, no paid API required.
 */

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  Sparkles,
  Play,
  Pause,
  Wand2,
  Film,
  Palette,
  Music4,
  Download,
  Languages,
  Clock3,
  Layers3,
  Mic2,
  Type,
  Zap,
  MonitorPlay,
  Settings2,
  RotateCcw,
  SquareStack,
  AudioLines,
  Video,
  Check,
  Loader2,
  ArrowRight,
  Globe,
  Timer,
  Monitor,
  Smartphone,
  Image as ImageIcon,
  Upload,
  FileAudio,
  Waves,
  Highlighter,
  Captions,
  Youtube,
  ShieldCheck,
  Cpu,
  Undo2,
  Redo2,
  Magnet,
} from "lucide-react";
import { cameraAt, textAnimAt, characterAt, PARALLAX_LAYERS, CAMERA_PRESETS, TEXT_PRESETS, TRANSITIONS } from "./motion/presets";
import { autoCreateVideo } from "./director/autoDirector";
import { HistoryStack } from "./director/history";
import { snapTime, collectSnapTargets, clampTime as clampT } from "./time";
import { validateBlueprintJson } from "./brain/validator";
import { normalizeBlueprint } from "./brain/normalizer";
import { migrateBlueprint } from "./director/migrate";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type ThemeKey =
  | "aurora"
  | "neonNoir"
  | "goldenHour"
  | "emerald"
  | "royalInk"
  | "candy"
  | "obsidian"
  | "cyber"
  | "cyberMatrix"
  | "vaporwave"
  | "obsidianLuxury"
  | "royalEmerald"
  | "arabicGold";
type MoodKey = "uplifting" | "cinematic" | "chill" | "tech" | "ambient" | "epic";
type Aspect = "16:9" | "9:16" | "1:1" | "4:5";
type Quality = "480p" | "720p" | "1080p";
type Perf = "high" | "balanced" | "fast";
type SceneType =
  | "intro"
  | "text"
  | "bullets"
  | "stat"
  | "quote"
  | "broll"
  | "outro"
  | "storyTitle"
  | "story"
  | "storyBeat"
  | "storyEnd";

interface Scene {
  type: SceneType;
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
  id?: string;
  purpose?: string;
  camera?: string;
  textAnimation?: string;
  start?: number;
  end?: number;
  character?: { action?: string; emotion?: string; x?: number; y?: number; scale?: number; opacity?: number };
  visual?: { description?: string; treatment?: string };
}

interface Spec {
  meta: {
    title: string;
    theme: ThemeKey;
    mood: MoodKey;
    seed: number;
    watermark: string;
    showProgress: boolean;
    language: "bn" | "en";
    aspect: Aspect;
    perf: Perf;
    shorts: boolean;
    safe: { top: number; bottom: number };
    captions: { enabled: boolean; style: string; scale: number };
  };
  fps: number;
  width: number;
  height: number;
  scenes: Scene[];
  captions?: { start: number; end: number; text: string; words?: { w: string; s: number; e: number }[] }[];
  duration: number;
}

interface ThemeDef {
  name: { bn: string; en: string };
  bg: string;
  blobs: string[];
  text: string;
  sub: string;
  accent: string;
  accent2: string;
  grain: number;
  vignette: number;
  aurora: boolean;
}

// ---------------------------------------------------------------------------
// Theme / Mood definitions (mirrors js/studio/themes.js)
// ---------------------------------------------------------------------------
const THEMES: Record<ThemeKey, ThemeDef> = {
  aurora: {
    name: { bn: "অরোরা", en: "Aurora" },
    bg: "#05070f",
    blobs: ["#7c5cff", "#22d3ee", "#3bf0a0", "#ff6bd6"],
    text: "#ffffff",
    sub: "#c9d6ff",
    accent: "#22d3ee",
    accent2: "#7c5cff",
    grain: 0.06,
    vignette: 0.55,
    aurora: true,
  },
  neonNoir: {
    name: { bn: "নিয়ন নয়ার", en: "Neon Noir" },
    bg: "#07040e",
    blobs: ["#ff2d95", "#7a2dff", "#00e5ff", "#ff8a00"],
    text: "#ffffff",
    sub: "#ffc9e6",
    accent: "#ff2d95",
    accent2: "#00e5ff",
    grain: 0.09,
    vignette: 0.7,
    aurora: false,
  },
  goldenHour: {
    name: { bn: "গোল্ডেন আওয়ার", en: "Golden Hour" },
    bg: "#120803",
    blobs: ["#ffb347", "#ff5e3a", "#ffd76e", "#ff2e63"],
    text: "#fffaf2",
    sub: "#ffd9b0",
    accent: "#ffb347",
    accent2: "#ff5e3a",
    grain: 0.07,
    vignette: 0.5,
    aurora: true,
  },
  emerald: {
    name: { bn: "এমারল্ড ডিপ", en: "Emerald Deep" },
    bg: "#03110d",
    blobs: ["#2ee6a8", "#22d3ee", "#0ea5e9", "#a3ff9e"],
    text: "#f2fffb",
    sub: "#b8ffe6",
    accent: "#2ee6a8",
    accent2: "#22d3ee",
    grain: 0.05,
    vignette: 0.5,
    aurora: true,
  },
  royalInk: {
    name: { bn: "রয়্যাল ইঙ্ক", en: "Royal Ink" },
    bg: "#060a1c",
    blobs: ["#4f7cff", "#8b5cf6", "#22d3ee", "#e0e7ff"],
    text: "#ffffff",
    sub: "#c7d2fe",
    accent: "#8b5cf6",
    accent2: "#4f7cff",
    grain: 0.05,
    vignette: 0.55,
    aurora: true,
  },
  candy: {
    name: { bn: "ক্যান্ডি ফ্লস", en: "Candy Floss" },
    bg: "#150512",
    blobs: ["#ff6bd6", "#ffd166", "#7c5cff", "#4cd4ff"],
    text: "#fff7fd",
    sub: "#ffd6f2",
    accent: "#ff6bd6",
    accent2: "#ffd166",
    grain: 0.08,
    vignette: 0.45,
    aurora: true,
  },
  obsidian: {
    name: { bn: "অবসিডিয়ান গোল্ড", en: "Obsidian Gold" },
    bg: "#08080a",
    blobs: ["#d4af37", "#8a6a20", "#f5e6a8", "#6b7280"],
    text: "#fdfcf7",
    sub: "#e8d9a8",
    accent: "#d4af37",
    accent2: "#f5e6a8",
    grain: 0.1,
    vignette: 0.72,
    aurora: false,
  },
  cyber: {
    name: { bn: "সাইবার লাইম", en: "Cyber Lime" },
    bg: "#040a08",
    blobs: ["#c6ff00", "#00e5ff", "#00ffa3", "#7c5cff"],
    text: "#f4ffe0",
    sub: "#d3ff8a",
    accent: "#c6ff00",
    accent2: "#00e5ff",
    grain: 0.07,
    vignette: 0.6,
    aurora: false,
  },
  cyberMatrix: {
    name: { bn: "সাইবার ম্যাট্রিক্স", en: "Cyber Matrix" },
    bg: "#020906",
    blobs: ["#00ff66", "#00f0ff", "#10b981", "#064e3b"],
    text: "#e6fff4",
    sub: "#86efac",
    accent: "#00ff66",
    accent2: "#00f0ff",
    grain: 0.08,
    vignette: 0.65,
    aurora: true,
  },
  vaporwave: {
    name: { bn: "ভেপরওয়েভ", en: "Vaporwave" },
    bg: "#10041a",
    blobs: ["#ff3399", "#7928ca", "#ff0080", "#00dfd8"],
    text: "#ffffff",
    sub: "#fbcfe8",
    accent: "#ff3399",
    accent2: "#00dfd8",
    grain: 0.07,
    vignette: 0.5,
    aurora: true,
  },
  obsidianLuxury: {
    name: { bn: "লাক্সারি", en: "Luxury" },
    bg: "#050505",
    blobs: ["#f59e0b", "#d97706", "#fbbf24", "#78350f"],
    text: "#fffbeb",
    sub: "#fde68a",
    accent: "#fbbf24",
    accent2: "#f59e0b",
    grain: 0.09,
    vignette: 0.75,
    aurora: true,
  },
  royalEmerald: {
    name: { bn: "রয়্যাল এমারল্ড", en: "Royal Emerald" },
    bg: "#02120d",
    blobs: ["#059669", "#10b981", "#34d399", "#0284c7"],
    text: "#ecfdf5",
    sub: "#a7f3d0",
    accent: "#10b981",
    accent2: "#38bdf8",
    grain: 0.06,
    vignette: 0.55,
    aurora: true,
  },
  arabicGold: {
    name: { bn: "অ্যারাবিক গোল্ড", en: "Arabic Gold" },
    bg: "#040b14",
    blobs: ["#f59e0b", "#10b981", "#fbbf24", "#064e3b"],
    text: "#fffdf5",
    sub: "#fef3c7",
    accent: "#fbbf24",
    accent2: "#34d399",
    grain: 0.08,
    vignette: 0.65,
    aurora: true,
  },
};

const MOODS: Record<MoodKey, { bn: string; en: string; bpm: number }> = {
  uplifting: { bn: "উৎসবমুখর", en: "Uplifting", bpm: 112 },
  cinematic: { bn: "সিনেমাটিক", en: "Cinematic", bpm: 84 },
  chill: { bn: "চিল", en: "Chill", bpm: 92 },
  tech: { bn: "টেক", en: "Tech", bpm: 124 },
  ambient: { bn: "অ্যাম্বিয়েন্ট", en: "Ambient", bpm: 70 },
  epic: { bn: "এপিক", en: "Epic", bpm: 96 },
};

// ---------------------------------------------------------------------------
// Director helpers (deterministic)
// ---------------------------------------------------------------------------
function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const WORDS_PER_SEC = 2.55;
const MIN_SCENE = 2.0;
const MAX_SCENE = 9.5;

function wordCount(s: string) {
  return (String(s).trim().match(/[^\s]+/g) || []).length;
}
function splitBeats(script: string) {
  const raw = String(script || "").replace(/\r/g, "").trim();
  if (!raw) return [];
  // Line-by-line mode: if no blank line (\n\n) but many single lines, each non-empty line = one scene
  // This fulfills hero promise "প্রতি লাইন = এক সিন" — blank line still creates new scene,
  // and consecutive bullet lines (≥2) are grouped as before.
  let blocks: string[];
  if (/\n\s*\n/.test(raw)) {
    blocks = raw.split(/\n\s*\n+/);
  } else if (raw.includes("\n")) {
    const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
    // Group consecutive bullet lines so "- a\n- b\n- c" stays as one bullets scene
    blocks = [];
    for (let i = 0; i < lines.length; ) {
      if (/^([-*•▪◦]|\d+[.)])\s+/.test(lines[i])) {
        const grp: string[] = [];
        while (i < lines.length && /^([-*•▪◦]|\d+[.)])\s+/.test(lines[i])) {
          grp.push(lines[i]);
          i++;
        }
        // keep bullets together as one block
        blocks.push(grp.join("\n"));
      } else {
        blocks.push(lines[i]);
        i++;
      }
    }
  } else {
    blocks = [raw];
  }
  const beats: { kind: string; heading?: string; text?: string; items?: string[] }[] = [];
  blocks.forEach((block) => {
    const lines = block
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) return;
    const bullets = lines.filter((l) => /^([-*•▪◦]|\d+[.)])\s+/.test(l));
    if (bullets.length >= 2) {
      beats.push({
        kind: "bullets",
        heading: lines[0] && !/^([-*•]|\d+[.)])\s+/.test(lines[0]) ? lines[0] : "",
        items: bullets.map((l) => l.replace(/^([-*•▪◦]|\d+[.)])\s+/, "")),
      });
      return;
    }
    if (lines.length === 1) {
      beats.push({ kind: "line", text: lines[0] });
      return;
    }
    beats.push({ kind: "block", heading: lines[0], text: lines.slice(1).join(" ") });
  });
  return beats;
}
function classify(beat: { kind: string; heading?: string; text?: string }) {
  if (beat.kind === "bullets") return "bullets";
  const text = (beat.heading ? beat.heading + ". " : "") + (beat.text || "");
  if (/^["“'].*["”']/.test(text.trim()) || /\s—\s*\S+$/.test(text.trim())) return "quote";
  if (/[\d]/.test(beat.heading || beat.text || "") && wordCount(beat.text || "") <= 14 && beat.kind !== "block") {
    // has number and short -> stat
    const hasNum = /(-?\d[\d,]*\s*(%|x|k|m|bn|cr|লাখ|কোটি)?)/i.test(beat.text || beat.heading || "");
    if (hasNum) return "stat";
  }
  if (beat.kind === "block") return "explain";
  return "line";
}
function sceneDuration(beat: { items?: string[]; text?: string; heading?: string }, type: string) {
  if (type === "bullets") {
    const items = (beat.items || []).length;
    return Math.min(MAX_SCENE, Math.max(MIN_SCENE, 1.2 + items * 1.15));
  }
  if (type === "stat") return 2.6;
  if (type === "quote") return Math.min(MAX_SCENE, Math.max(2.8, wordCount(beat.text || "") / WORDS_PER_SEC + 1.6));
  const words = wordCount((beat.heading || "") + " " + (beat.text || ""));
  return Math.min(MAX_SCENE, Math.max(MIN_SCENE, words / WORDS_PER_SEC + 1.5));
}
function parseNumber(text: string) {
  const m = String(text).match(/(-?\d[\d,.]*)\s*(%|x|X|k|K|m|M|bn|cr|লাখ|কোটি)?/);
  if (!m) return null;
  let value = parseFloat(m[1].replace(/,/g, ""));
  if (!isFinite(value)) return null;
  const suffix = m[2] || "";
  if (/^[kK]$/.test(suffix)) value *= 1e3;
  if (/^[mM]$/.test(suffix)) value *= 1e6;
  if (/^bn$/i.test(suffix)) value *= 1e9;
  if (/^(cr|কোটি)$/i.test(suffix)) value *= 1e7;
  const label = String(text).replace(m[1], "").replace(suffix, "").replace(/[:\-–—]/g, " ").trim();
  return { value, suffix: /%/.test(suffix) ? "%" : /[xX]/.test(suffix) ? "x" : "", label: label || "fact" };
}

function buildSpec(input: {
  title?: string;
  script: string;
  language?: "bn" | "en";
  theme?: ThemeKey;
  mood?: MoodKey;
  aspect?: Aspect;
  quality?: Quality;
  perf?: Perf;
  seed?: number;
  durationTarget?: number;
  shorts?: boolean;
  watermark?: string;
}): Spec {
  let title = (input.title || "").trim();
  let script = String(input.script || "").trim();
  const seed = input.seed || hashString((title + "|" + script).slice(0, 400)) || 12345;
  const rand = mulberry32(seed);
  const lang = input.language === "en" ? "en" : "bn";

  if (!title) {
    const firstLine = script
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)[0] || "";
    const isProbablyTitle = firstLine && firstLine.length <= 70 && !/[.!?]$/.test(firstLine) && script.indexOf("\n") > -1;
    if (isProbablyTitle) {
      title = firstLine;
      script = script.slice(script.indexOf("\n")).trim();
    } else {
      title = firstLine.slice(0, 68) || (lang === "bn" ? "নতুন ভিডিও" : "New video");
    }
  }

  const beats = splitBeats(script);
  const scenes: Scene[] = [];
  const themeKeys = Object.keys(THEMES) as ThemeKey[];
  const moodKeys = Object.keys(MOODS) as MoodKey[];
  const theme = input.theme && THEMES[input.theme] ? input.theme : themeKeys[Math.floor(rand() * themeKeys.length)];
  const mood = input.mood && MOODS[input.mood] ? input.mood : moodKeys[Math.floor(rand() * moodKeys.length)];

  const hook =
    beats.length && beats[0].kind === "line"
      ? (beats.shift()!.text as string)
      : lang === "bn"
        ? "শুরু করা যাক।"
        : "Let's dive in.";

  scenes.push({
    type: "intro",
    dur: 3.4,
    title,
    subtitle: hook.slice(0, 90),
    isHook: true,
    transitionOut: "zoom",
  });

  const brollEvery = beats.length > 4 ? 3 : 2;
  beats.forEach((beat, i) => {
    const type = classify(beat);
    if (type === "bullets") {
      scenes.push({
        type: "bullets",
        heading: beat.heading || (lang === "bn" ? "মূল পয়েন্ট" : "Key points"),
        items: (beat.items || []).slice(0, 5),
        dur: sceneDuration(beat, type),
        transitionOut: "slide",
      });
    } else if (type === "stat") {
      const num = parseNumber(beat.text || beat.heading || "") || { value: 100, suffix: "%", label: "" };
      scenes.push({
        type: "stat",
        value: num.value,
        suffix: num.suffix,
        label: num.label,
        dur: sceneDuration(beat, type),
        transitionOut: "fade",
      });
    } else if (type === "quote") {
      const q = (beat.text || "").replace(/^["“']|["”']$/g, "");
      const parts = q.split(/\s—\s|\s-\s/);
      scenes.push({
        type: "quote",
        text: parts[0] || q,
        author: parts[1] || "",
        dur: sceneDuration(beat, type),
        transitionOut: "fade",
      });
    } else if (type === "explain") {
      scenes.push({
        type: "text",
        heading: beat.heading,
        body: beat.text,
        dur: sceneDuration(beat, type),
        transitionOut: "glitch",
      });
    } else {
      scenes.push({
        type: "text",
        heading: "",
        body: beat.text || beat.heading || "",
        dur: sceneDuration(beat, type),
        transitionOut: "fade",
      });
    }
    if ((i + 1) % brollEvery === 0 && i < beats.length - 1) {
      scenes.push({ type: "broll", dur: 2.4, label: "", transitionOut: "fade" });
    }
  });

  scenes.push({
    type: "outro",
    dur: 4.2,
    title: lang === "bn" ? "ধন্যবাদ!" : "Thanks for watching!",
    subtitle: lang === "bn" ? "ভালো লাগলে লাইক, শেয়ার আর সাবস্ক্রাইব করুন।" : "Like, share and subscribe for more.",
    cta: lang === "bn" ? "সাবস্ক্রাইব" : "SUBSCRIBE",
    transitionOut: "fade",
  });

  if (input.durationTarget) {
    const raw = scenes.reduce((s, sc) => s + sc.dur, 0);
    const factor = Math.max(0.4, Math.min(8.0, input.durationTarget / raw));
    if (Math.abs(factor - 1) > 0.02) {
      scenes.forEach((sc) => {
        sc.dur = Math.max(1.6, Math.min(18.0, sc.dur * factor));
        if (sc.type === "stat" || sc.type === "broll") sc.dur = Math.max(2.0, Math.min(7.5, sc.dur));
      });
    }
  }

  const aspect = input.aspect || (input.shorts ? "9:16" : "16:9");
  const dims: Record<Aspect, [number, number]> = {
    "16:9": [1920, 1080],
    "9:16": [1080, 1920],
    "1:1": [1080, 1080],
    "4:5": [1080, 1350],
  };
  const [baseW, baseH] = dims[aspect] || [1920, 1080];
  const quality = input.quality || "720p";
  const scale: Record<Quality, number> = { "480p": 480 / 1080, "720p": 720 / 1080, "1080p": 1 };
  const s = scale[quality] || 720 / 1080;
  const width = Math.round((baseW * s) / 2) * 2;
  const height = Math.round((baseH * s) / 2) * 2;
  const duration = scenes.reduce((a, b) => a + b.dur, 0);

  return {
    meta: {
      title,
      theme: theme as ThemeKey,
      mood: mood as MoodKey,
      seed,
      watermark: input.watermark || "",
      showProgress: true,
      language: lang,
      aspect,
      perf: input.perf || "high",
      shorts: !!input.shorts,
      safe: input.shorts ? { top: 0.11, bottom: 0.19 } : { top: 0.05, bottom: 0.08 },
      captions: { enabled: true, style: "bar", scale: 1 },
    },
    fps: 30,
    width,
    height,
    scenes,
    duration,
  };
}

// ---------------------------------------------------------------------------
// Voice Tracking — zero-cost VAD + weight-proportional word sync (port of js/studio/align.js)
// 100% client-side, no API, no upload. Maps script words onto real speech.
// ---------------------------------------------------------------------------
function percentile(values: Float32Array | number[], p: number) {
  if (!values.length) return 0;
  const arr = Array.from(values as number[]).sort((a, b) => a - b);
  const idx = clamp(Math.round((arr.length - 1) * p), 0, arr.length - 1);
  return arr[idx];
}
async function decodeToMono(file: File): Promise<{ data: Float32Array; sampleRate: number; duration: number }> {
  const ab = await file.arrayBuffer();
  const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  const buf = await ctx.decodeAudioData(ab.slice(0));
  const ch = buf.numberOfChannels;
  const len = buf.length;
  const out = new Float32Array(len);
  for (let c = 0; c < ch; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) out[i] += d[i] / ch;
  }
  await ctx.close();
  return { data: out, sampleRate: buf.sampleRate, duration: buf.duration };
}
interface VADResult {
  duration: number;
  sampleRate: number;
  phrases: { start: number; end: number }[];
  gaps: { start: number; end: number }[];
  envelope: Float32Array;
  hop: number;
  noiseFloor: number;
  threshold: number;
  speechRatio: number;
  speechTime: number;
  usable: boolean;
}
function analyseVAD(mono: { data: Float32Array; sampleRate: number; duration: number }): VADResult {
  const data = mono.data;
  const sr = mono.sampleRate;
  const duration = mono.duration;
  const win = Math.max(1, Math.round(0.03 * sr));
  const hop = Math.max(1, Math.round(0.01 * sr));
  const frames = Math.max(0, Math.floor((data.length - win) / hop) + 1);
  const rms = new Float32Array(frames);
  const smooth = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    const base = f * hop;
    let sum = 0;
    for (let i = base; i < base + win; i++) sum += data[i] * data[i];
    rms[f] = Math.sqrt(sum / win);
  }
  for (let s = 0; s < frames; s++) {
    const a = rms[Math.max(0, s - 1)], b = rms[s], c = rms[Math.min(frames - 1, s + 1)];
    smooth[s] = (a + b + c) / 3;
  }
  const floor = percentile(smooth, 0.2);
  const loud = percentile(smooth, 0.95);
  const hi = Math.max(floor * 3.0, floor + 0.01, loud * 0.16);
  const lo = Math.max(floor * 1.7, floor + 0.005, hi * 0.55);
  const minSpeech = 0.16, minGap = 0.14, mergeGap = 0.22, pad = 0.035;
  const minSpeechF = Math.max(1, Math.round(minSpeech / (hop / sr)));
  const minGapF = Math.max(1, Math.round(minGap / (hop / sr)));
  const phrases: { a: number; b: number }[] = [];
  let speaking = false, startF = 0, quiet = 0;
  for (let k = 0; k < frames; k++) {
    const level = smooth[k];
    if (!speaking) { if (level >= hi) { speaking = true; startF = k; quiet = 0; } }
    else {
      if (level < lo) { quiet++; if (quiet >= minGapF) { phrases.push({ a: startF, b: k - quiet + 1 }); speaking = false; } }
      else quiet = 0;
    }
  }
  if (speaking) phrases.push({ a: startF, b: frames });
  const spans = phrases.filter(p => p.b - p.a >= minSpeechF).map(p => ({ start: Math.max(0, p.a * hop / sr - pad), end: Math.min(duration, (p.b * hop + win) / sr + pad) }));
  const merged: { start: number; end: number }[] = [];
  spans.forEach(sp => {
    const prev = merged[merged.length - 1];
    if (prev && sp.start - prev.end < mergeGap) prev.end = sp.end;
    else merged.push({ start: sp.start, end: sp.end });
  });
  const speechTime = merged.reduce((t, p) => t + (p.end - p.start), 0);
  const gaps: { start: number; end: number }[] = [];
  for (let g = 1; g < merged.length; g++) gaps.push({ start: merged[g - 1].end, end: merged[g].start });
  return { duration, sampleRate: sr, phrases: merged, gaps, envelope: smooth, hop: hop / sr, noiseFloor: floor, threshold: hi, speechRatio: duration > 0 ? speechTime / duration : 0, speechTime, usable: merged.length >= 2 && speechTime > 0.8 };
}
// Bengali matra-aware weight + pause
const BN_MATRA = /[\u09BE-\u09CD\u09D7\u09E2\u09E3]/;
const BN_LETTER = /[\u0985-\u0994\u0995-\u09B9\u09DC-\u09DF\u09F0\u09F1\u09E6-\u09EF]/;
const LAT_VOWEL = /[aeiouyAEIOUY]/;
function wordWeight(word: string) {
  let sum = 0;
  for (let i = 0; i < word.length; i++) {
    const ch = word[i];
    if (BN_MATRA.test(ch)) sum += 0.45;
    else if (BN_LETTER.test(ch)) sum += 1;
    else if (/[0-9]/.test(ch)) sum += 1.1;
    else if (LAT_VOWEL.test(ch)) sum += 1;
    else if (/[a-zA-Z]/.test(ch)) sum += 0.72;
  }
  return Math.max(1, sum);
}
function pauseAfter(word: string) {
  const s = String(word || "");
  if (/[.!?…]+["'”’)]?$/.test(s)) return 0.3;
  if (/[।॥]$/.test(s)) return 0.34;
  if (/[,;:—–-]$/.test(s)) return 0.17;
  return 0.045;
}
interface WordItem { w: string; core: string; weight: number; pause: number; para: number }
function splitWords(text: string, para: number): WordItem[] {
  return String(text || "").split(/\s+/).map(t => t.trim()).filter(Boolean).map(t => {
    const core = t.replace(/^[^A-Za-z0-9\u0980-\u09FF]+|[^A-Za-z0-9\u0980-\u09FF]+$/g, "") || t;
    return { w: t, core, weight: wordWeight(core), pause: pauseAfter(t), para };
  });
}
function assignVoiceTiming(script: string, vad: VADResult): { words: { w: string; s: number; e: number; para: number }[]; paragraphs: { index: number; text: string; words: { w: string; s: number; e: number }[]; start: number; end: number }[]; cues: { start: number; end: number; text: string }[] } | null {
  const rawScript = String(script || "").replace(/\r/g, "").trim();
  let blocks: string[];
  if (/\n\s*\n/.test(rawScript)) {
    blocks = rawScript.split(/\n\s*\n+/).map(b => b.replace(/\s+/g, " ").trim()).filter(Boolean);
  } else if (rawScript.includes("\n")) {
    const lines = rawScript.split("\n").map(l => l.trim()).filter(Boolean);
    blocks = [];
    for (let i = 0; i < lines.length; ) {
      if (/^([-*•▪◦]|\d+[.)])\s+/.test(lines[i])) {
        const grp: string[] = [];
        while (i < lines.length && /^([-*•▪◦]|\d+[.)])\s+/.test(lines[i])) { grp.push(lines[i]); i++; }
        blocks.push(grp.join(" "));
      } else { blocks.push(lines[i].replace(/\s+/g, " ").trim()); i++; }
    }
  } else {
    blocks = [rawScript.replace(/\s+/g, " ").trim()].filter(Boolean);
  }
  if (!blocks.length || !vad.usable) return null;
  const flat: WordItem[] = [];
  blocks.forEach((b, bi) => flat.push(...splitWords(b, bi)));
  if (!flat.length) return null;
  const slots = vad.phrases.map((p, i) => {
    const next = vad.phrases[i + 1];
    const end = next ? next.start : Math.min(vad.duration, p.end + 0.45);
    return { start: p.start, spokenEnd: p.end, end: Math.max(p.end, end) };
  });
  // paragraph weight
  const paras: { weight: number; words: WordItem[] }[] = [];
  flat.forEach(it => {
    const idx = it.para;
    if (!paras[idx]) paras[idx] = { weight: 0, words: [] };
    paras[idx].weight += it.weight + it.pause;
    paras[idx].words.push(it);
  });
  const cleanParas = paras.filter(Boolean);
  // simple greedy: each paragraph gets proportional slots
  const totalW = cleanParas.reduce((t, p) => t + p.weight, 0) || 1;
  const totalT = slots.reduce((t, s) => t + (s.end - s.start), 0) || 1;
  let pCursor = 0;
  const paraSlots: { from: number; to: number }[] = [];
  let accW = 0;
  cleanParas.forEach((p, pi) => {
    accW += p.weight;
    const frac = accW / totalW;
    const targetSlot = Math.min(slots.length - 1, Math.round(frac * slots.length) - 1);
    const from = pi === 0 ? 0 : paraSlots[pi - 1].to + 1;
    const to = Math.max(from, targetSlot);
    paraSlots.push({ from, to });
  });
  // fix last
  if (paraSlots.length) paraSlots[paraSlots.length - 1].to = slots.length - 1;

  const placed: { w: string; s: number; e: number; para: number }[] = [];
  const tailAllow = 0.3, spw = 0.075;
  cleanParas.forEach((para, pi) => {
    const run = paraSlots[pi];
    const runSlots = slots.slice(run.from, run.to + 1);
    if (!runSlots.length) return;
    const runTime = runSlots.reduce((t, s) => t + (s.end - s.start), 0) || 1;
    const groupWeight = para.weight;
    let wi = 0;
    runSlots.forEach(slot => {
      const slotTime = Math.max(0.12, slot.end - slot.start);
      const slotWeight = groupWeight * (slotTime / runTime);
      let used = 0; const assigned: WordItem[] = [];
      while (wi < para.words.length && (used < slotWeight * 0.999 || !assigned.length)) {
        assigned.push(para.words[wi]); used += para.words[wi].weight + para.words[wi].pause; wi++;
      }
      if (!assigned.length) return;
      const readable = assigned.reduce((t, x) => t + x.weight, 0) * spw;
      const windowEnd = Math.min(slot.end, Math.max(slot.spokenEnd, Math.min(slot.spokenEnd + tailAllow, slot.start + readable)));
      const win = Math.max(0.15, windowEnd - slot.start);
      const wSum = assigned.reduce((t, x) => t + x.weight + x.pause, 0) || 1;
      let cursor = 0;
      assigned.forEach(item => {
        const share = (item.weight + item.pause) / wSum;
        const dur = clamp(win * share, 0.09, 3.2);
        const start = slot.start + cursor;
        const soft = Math.min(item.pause, dur * 0.5);
        const end = Math.min(slot.end, start + Math.max(0.05, dur - soft));
        placed.push({ w: item.w, s: start, e: end, para: pi });
        cursor += dur;
      });
    });
    while (wi < para.words.length) {
      const prev = placed[placed.length - 1];
      const st = prev ? prev.e + 0.04 : 0;
      const step = clamp(para.words[wi].weight * spw, 0.12, 1.1);
      placed.push({ w: para.words[wi].w, s: st, e: st + step * 0.85, para: pi });
      wi++;
    }
  });
  // order & dedup
  placed.sort((a, b) => a.s - b.s);
  let last = 0;
  placed.forEach(t => { if (t.s < last) t.s = last + 0.02; if (t.e <= t.s) t.e = t.s + 0.06; last = t.e; });
  const paragraphs = blocks.map((text, i) => {
    const ws = placed.filter(p => p.para === i);
    if (!ws.length) return null;
    return { index: i, text, words: ws.map(w => ({ w: w.w, s: w.s, e: w.e })), start: ws[0].s, end: ws[ws.length - 1].e };
  }).filter(Boolean) as { index: number; text: string; words: { w: string; s: number; e: number }[]; start: number; end: number }[];
  // cues: per paragraph, 2.8s max
  const cues: { start: number; end: number; text: string }[] = [];
  paragraphs.forEach(p => {
    let cur: { w: string; s: number; e: number }[] = []; let curStart = p.words[0]?.s || 0;
    p.words.forEach(w => {
      cur.push(w);
      const txt = cur.map(c => c.w).join(" ");
      const dur = w.e - curStart;
      if (txt.length > 40 || dur > 2.8) {
        cues.push({ start: curStart, end: w.e, text: txt });
        cur = []; curStart = w.e + 0.05;
      }
    });
    if (cur.length) cues.push({ start: curStart, end: cur[cur.length - 1].e, text: cur.map(c => c.w).join(" ") });
  });
  return { words: placed, paragraphs, cues };
}
function buildVoiceSpec(script: string, vad: VADResult, baseSpec: Spec, opts: { title?: string; kicker?: string }): Spec | null {
  const mapped = assignVoiceTiming(script, vad);
  if (!mapped) return null;
  // Build scenes with voice timing: intro (2.6s) + one scene per paragraph synced to voice
  const lang = baseSpec.meta.language;
  const scenes: Scene[] = [];
  const title = opts.title || baseSpec.meta.title;
  scenes.push({ type: "intro", dur: 2.6, title, subtitle: mapped.paragraphs[0]?.text.slice(0, 90) || "", isHook: true, transitionOut: "zoom" });
  // intro shift: voice starts after intro
  const shift = 2.6 - (mapped.paragraphs[0]?.start || 0);
  // each paragraph -> text scene with voice-synced words
  mapped.paragraphs.forEach((para, idx) => {
    const dur = Math.max(1.8, Math.min(9.5, para.end - para.start + 0.6));
    // split heading/body if first sentence short
    const parts = para.text.split(/[.।!?]\s+/);
    const heading = parts.length > 1 && parts[0].length < 60 ? parts[0] : "";
    const body = heading ? para.text.slice(heading.length).trim() : para.text;
    const words = para.words.map(w => ({ w: w.w, s: w.s + shift - (para.start + shift - 0.3), e: w.e + shift - (para.start + shift - 0.3) }));
    // durations handled via real voice, but we keep dur as window
    scenes.push({
      type: "text", heading: heading || undefined, body: body || para.text, dur, transitionOut: idx % 2 ? "slide" : "fade",
      words: words as unknown as { w: string; s: number; e: number }[],
      // @ts-ignore custom
      _voiceStart: para.start + shift, _voiceEnd: para.end + shift,
    } as Scene & { _voiceStart: number });
  });
  scenes.push({ type: "outro", dur: 3.8, title: lang === "bn" ? "ধন্যবাদ!" : "Thanks for watching!", subtitle: lang === "bn" ? "লাইক • শেয়ার • সাবস্ক্রাইব" : "Like • Share • Subscribe", cta: lang === "bn" ? "সাবস্ক্রাইব" : "SUBSCRIBE", transitionOut: "fade" });
  // adjust durs to exactly fit voice + intro/outro
  const voiceSpan = (mapped.paragraphs[mapped.paragraphs.length - 1]?.end || 0) - (mapped.paragraphs[0]?.start || 0);
  const total = scenes.reduce((a, b) => a + b.dur, 0);
  void voiceSpan; void total;
  // build new spec with voice captions
  const width = baseSpec.width, height = baseSpec.height;
  const captions = mapped.cues.map(c => ({ start: c.start + shift, end: c.end + shift, text: c.text }));
  const spec: Spec = {
    ...baseSpec,
    width, height,
    duration: scenes.reduce((a, b) => a + b.dur, 0),
    scenes,
    captions,
    meta: { ...baseSpec.meta, title },
  };
  // store voice words for renderer sync
  (spec as unknown as { _voiceWords: typeof mapped.words })._voiceWords = mapped.words.map(w => ({ ...w, s: w.s + shift, e: w.e + shift }));
  (spec as unknown as { _vad: VADResult })._vad = vad;
  return spec;
}

// Timeline provided by user (speech ↔ word timings) — zero VAD needed
function buildSpecFromTimeline(script: string, words: { w: string; s: number; e: number; para: number }[], baseSpec: Spec): Spec | null {
  if (!words.length) return null;
  const blocks = script.split("\n").map(s=>s.trim()).filter(Boolean);
  const lang = baseSpec.meta.language;
  const title = baseSpec.meta.title;
  const scenes: Scene[] = [];
  scenes.push({ type: "intro", dur: 2.2, title, subtitle: (blocks[0]||"").slice(0,80), isHook: true, transitionOut: "zoom" });
  const maxPara = Math.max(...words.map(w=>w.para), 0);
  for (let pi=0; pi<=maxPara; pi++) {
    const ws = words.filter(w=>w.para===pi);
    if (!ws.length) continue;
    const text = blocks[pi] || ws.map(x=>x.w).join(" ");
    const dur = Math.max(1.8, Math.min(9.5, ws[ws.length-1].e - ws[0].s + 0.5));
    const parts = text.split(/[.।!?]\s+/);
    const heading = parts.length>1 && parts[0].length<60 ? parts[0] : "";
    const body = heading ? text.slice(heading.length).trim() : text;
    const shift = 2.2 - (words[0]?.s || 0);
    const localWords = ws.map(w=>({ w: w.w, s: w.s+shift, e: w.e+shift }));
    scenes.push({
      type: "text", heading: heading||undefined, body: body||text, dur, transitionOut: pi%2?"slide":"fade",
      words: localWords as unknown as { w: string; s: number; e: number }[],
    } as Scene);
  }
  scenes.push({ type: "outro", dur: 3.5, title: lang==="bn"?"ধন্যবাদ!":"Thanks for watching!", subtitle: lang==="bn"?"লাইক • শেয়ার • সাবস্ক্রাইব":"Like • Share • Subscribe", cta: lang==="bn"?"সাবস্ক্রাইব":"SUBSCRIBE", transitionOut: "fade" });
  const shift2 = 2.2 - (words[0]?.s || 0);
  const srt: {start:number,end:number,text:string}[] = [];
  let curWords: typeof words = [];
  let curStart = words[0]?.s||0;
  words.forEach(w=>{
    curWords.push(w);
    const txt = curWords.map(c=>c.w).join(" ");
    const dur = w.e - curStart;
    if (txt.length>42 || dur>2.6) {
      srt.push({ start: curStart+shift2, end: w.e+shift2, text: txt });
      curWords = []; curStart = (words[words.indexOf(w)+1]?.s)||w.e+0.05;
    }
  });
  if (curWords.length) srt.push({ start: curStart+shift2, end: curWords[curWords.length-1].e+shift2, text: curWords.map(c=>c.w).join(" ") });
  const spec: Spec = { ...baseSpec, width: baseSpec.width, height: baseSpec.height, duration: scenes.reduce((a,b)=>a+b.dur,0), scenes, captions: srt, meta: { ...baseSpec.meta, title } };
  (spec as unknown as { _voiceWords: typeof words })._voiceWords = words.map(w=>({ ...w, s: w.s+shift2, e: w.e+shift2 }));
  return spec;
}

function buildSpecFromSegmentTimeline(script: string, segments: { time: number; text: string }[], baseSpec: Spec): Spec | null {
  if (!segments.length) return null;
  const sorted = [...segments].sort((a,b)=>a.time-b.time);
  const lang = baseSpec.meta.language;
  const title = baseSpec.meta.title;
  const blocks = script.split("\n").map(s=>s.trim()).filter(Boolean);
  const scenes: Scene[] = [];
  scenes.push({ type: "intro", dur: 2.2, title, subtitle: (blocks[0]||sorted[0]?.text||"").slice(0,80), isHook: true, transitionOut: "zoom" });
  const shift = 2.2 - (sorted[0]?.time || 0);
  for (let i=0; i<sorted.length; i++) {
    const seg = sorted[i];
    const next = sorted[i+1];
    const dur = next ? Math.max(0.9, Math.min(9.5, next.time - seg.time)) : Math.max(1.8, Math.min(9.5, (wordCount(seg.text)/WORDS_PER_SEC)+0.9));
    const text = seg.text || "";
    const parts = text.split(/[.।!?]\s+/);
    const heading = parts.length>1 && parts[0].length<60 ? parts[0] : "";
    const body = heading ? text.slice(heading.length).trim() : text;
    scenes.push({
      type: "text",
      heading: heading||undefined,
      body: body||text,
      dur,
      transitionOut: i%2?"slide":"fade",
    } as Scene);
  }
  scenes.push({ type: "outro", dur: 3.5, title: lang==="bn"?"ধন্যবাদ!":"Thanks for watching!", subtitle: lang==="bn"?"লাইক • শেয়ার • সাবস্ক্রাইব":"Like • Share • Subscribe", cta: lang==="bn"?"সাবস্ক্রাইব":"SUBSCRIBE", transitionOut: "fade" });
  const srt = sorted.map((seg,i)=>{
    const next = sorted[i+1];
    const start = seg.time + shift;
    const end = next ? next.time + shift - 0.05 : start + Math.max(1.2, Math.min(3.2, wordCount(seg.text)/WORDS_PER_SEC+0.7));
    return { start, end: Math.max(start+0.45, end), text: seg.text };
  });
  const spec: Spec = { ...baseSpec, width: baseSpec.width, height: baseSpec.height, duration: scenes.reduce((a,b)=>a+b.dur,0), scenes, captions: srt, meta: { ...baseSpec.meta, title } };
  (spec as unknown as { _segments: typeof sorted })._segments = sorted.map(s=>({ ...s, time: s.time+shift }));
  (spec as unknown as { _voiceWords: {w:string,s:number,e:number,para:number}[] })._voiceWords = sorted.map((s,i)=>({ w: s.text, s: s.time+shift, e: (sorted[i+1]?.time||(s.time+2.2))+shift, para: i }));
  return spec;
}

// ---------------------------------------------------------------------------
// Canvas renderer (lightweight React port of engine.js)
// ---------------------------------------------------------------------------
function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgba(hex: string, a: number) {
  const c = hexToRgb(hex);
  return `rgba(${c.r},${c.g},${c.b},${a})`;
}
function clamp(v: number, a: number, b: number) {
  return v < a ? a : v > b ? b : v;
}
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const paragraphs = String(text || "").split("\n");
  const lines: string[] = [];
  paragraphs.forEach((para) => {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      return;
    }
    let line = "";
    words.forEach((word) => {
      const test = line ? line + " " + word : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = test;
    });
    if (line) lines.push(line);
  });
  return lines;
}

function renderFrame(
  ctx: CanvasRenderingContext2D,
  spec: Spec,
  t: number,
  spriteCache: Map<string, HTMLCanvasElement>,
  bgImage?: HTMLImageElement | null,
  voiceWords?: { w: string; s: number; e: number; para: number }[]
) {
  const theme = THEMES[spec.meta.theme] || THEMES.aurora;
  const W = spec.width;
  const H = spec.height;
  const U = Math.min(W, H);
  const total = spec.duration;
  // find scene
  let acc = 0;
  let curIndex = 0;
  let local = 0;
  for (let i = 0; i < spec.scenes.length; i++) {
    const d = spec.scenes[i].dur;
    if (t < acc + d || i === spec.scenes.length - 1) {
      curIndex = i;
      local = t - acc;
      break;
    }
    acc += d;
  }
  const cur = spec.scenes[curIndex];
  const progress = clamp(local / cur.dur, 0, 1);
  const cam = cameraAt(cur.camera, progress, spec.meta.seed || 0);
  const tAnim = textAnimAt(cur.textAnimation, progress);
  const next = spec.scenes[curIndex + 1];
  const transName = cur.transitionOut || "fade";
  const transWindow = 0.35;
  const transT = cur.dur > transWindow && local > cur.dur - transWindow ? (local - (cur.dur - transWindow)) / transWindow : 0;

  // ---- background (image or procedural)
  if (bgImage && bgImage.complete && bgImage.naturalWidth > 0) {
    // cover
    const imgW = bgImage.naturalWidth, imgH = bgImage.naturalHeight;
    const scale = Math.max(W / imgW, H / imgH);
    const dw = imgW * scale, dh = imgH * scale;
    const dx = (W - dw) / 2, dy = (H - dh) / 2;
    ctx.save();
    // slight blur via low-alpha procedural overlay will keep text readable, but we draw sharp image
    ctx.drawImage(bgImage, dx, dy, dw, dh);
    // adaptive overlay for text readability — theme-aware gradient + dark wash
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "rgba(0,0,0,0.55)");
    grad.addColorStop(0.35, "rgba(0,0,0,0.18)");
    grad.addColorStop(0.7, "rgba(0,0,0,0.42)");
    grad.addColorStop(1, "rgba(0,0,0,0.62)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    // subtle color wash from theme to tie image into palette
    ctx.globalCompositeOperation = "overlay";
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = theme.accent;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.restore();
  } else {
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, W, H);
  }
  // voice-word sync hint: if voiceWords exists, we pulse particles to voice energy
  const hasVoiceSync = !!(voiceWords && voiceWords.length);

  // blobs (screen blend simulation via radial gradients)
  const e = 0.45 + 0.2 * Math.sin(t * 0.9);
  const blobCount = 5;
  for (let i = 0; i < blobCount; i++) {
    const col = theme.blobs[i % theme.blobs.length];
    const key = `${col}-${W}x${H}-${i}`;
    let sprite = spriteCache.get(key);
    if (!sprite) {
      const sc = document.createElement("canvas");
      sc.width = sc.height = 320;
      const g = sc.getContext("2d")!;
      const grad = g.createRadialGradient(160, 160, 0, 160, 160, 160);
      grad.addColorStop(0, rgba(col, 0.9));
      grad.addColorStop(0.5, rgba(col, 0.35));
      grad.addColorStop(1, rgba(col, 0));
      g.fillStyle = grad;
      g.fillRect(0, 0, 320, 320);
      spriteCache.set(key, sc);
      sprite = sc;
    }
    const nx = (0.2 + 0.6 * ((Math.sin(t * (0.08 + i * 0.02) + i * 1.3) + 1) / 2)) * W + cam.x * W * PARALLAX_LAYERS.background;
    const ny = (0.25 + 0.5 * ((Math.cos(t * (0.07 + i * 0.015) + i * 2.1) + 1) / 2)) * H + cam.y * H * PARALLAX_LAYERS.background;
    const rad = U * (0.18 + i * 0.04) * (1 + 0.2 * e);
    // draw with screen-like feel: reduce alpha and let overlapping brighten
    ctx.globalAlpha = 0.55;
    ctx.globalCompositeOperation = "screen" as GlobalCompositeOperation;
    ctx.drawImage(sprite, nx - rad, ny - rad, rad * 2, rad * 2);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  }

  // aurora ribbons
  if (theme.aurora) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.35 + 0.15 * e;
    for (let rb = 0; rb < 2; rb++) {
      const phase = t * (0.14 + rb * 0.06) + rb * 2.2;
      const grad = ctx.createLinearGradient(0, H * (0.2 + rb * 0.2), W, H * (0.8 - rb * 0.15));
      grad.addColorStop(0, rgba(theme.blobs[rb % theme.blobs.length], 0));
      grad.addColorStop(0.5, rgba(theme.blobs[(rb + 1) % theme.blobs.length], 0.55));
      grad.addColorStop(1, rgba(theme.blobs[(rb + 2) % theme.blobs.length], 0));
      ctx.strokeStyle = grad;
      ctx.lineWidth = H * (0.06 + rb * 0.02);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-W * 0.1, H * (0.3 + rb * 0.22) + Math.sin(phase) * H * 0.12);
      ctx.bezierCurveTo(
        W * 0.3,
        H * (0.15 + rb * 0.25) + Math.cos(phase * 1.3) * H * 0.18,
        W * 0.7,
        H * (0.85 - rb * 0.2) + Math.sin(phase * 0.8) * H * 0.16,
        W * 1.1,
        H * (0.65 - rb * 0.2) + Math.cos(phase * 1.1) * H * 0.12
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  // vignette
  const vig = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.7);
  vig.addColorStop(0, "rgba(255,255,255,1)");
  vig.addColorStop(1, `rgba(${Math.round(255 * (1 - theme.vignette))},${Math.round(255 * (1 - theme.vignette))},${Math.round(255 * (1 - theme.vignette))},1)`);
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = 1;
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;

  // safe area
  const safeTop = H * spec.meta.safe.top;
  const safeBottom = H * (1 - spec.meta.safe.bottom);
  const winH = safeBottom - safeTop;
  const winCY = safeTop + winH / 2;

  // ---- scene content helpers
  const accentGrad = (x: number, y: number, w: number, h: number) => {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, theme.text);
    g.addColorStop(0.55, theme.accent);
    g.addColorStop(1, theme.accent2);
    return g;
  };

  const easeOutExpo = (x: number) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
  const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
  const inRamp = clamp(progress / 0.22, 0, 1);
  const reveal = easeOutExpo(inRamp);
  const hookBoost = cur.isHook && local < 0.45 ? (1 - local / 0.45) * 0.08 : 0;

  // generic text fitting
  const fitText = (text: string, maxWidth: number, maxLines: number, maxSize: number, weight = 700) => {
    let size = maxSize;
    let lines: string[] = [];
    for (let g = 0; g < 20; g++) {
      ctx.font = `${weight} ${size}px "Hind Siliguri","Noto Sans Bengali",system-ui,sans-serif`;
      lines = wrapLines(ctx, text, maxWidth);
      const widest = Math.max(...lines.map((l) => ctx.measureText(l).width), 0);
      const tooTall = lines.length > maxLines;
      const tooWide = widest > maxWidth * 1.001;
      if ((!tooTall && !tooWide) || size <= maxSize * 0.42) break;
      size *= 0.93;
    }
    return { size, lines };
  };

  const margin = U * 0.085;
  const maxW = W - margin * 2;

  const treat = cur.visual?.treatment;
  if (treat === "particles" || treat === "stars" || treat === "glow") {
    ctx.save();
    ctx.globalAlpha = treat === "glow" ? 0.18 : 0.35;
    for (let p = 0; p < 18; p++) {
      const px = ((p * 97 + t * (treat === "stars" ? 8 : 40)) % (W + 40)) - 20;
      const py = ((p * 53 + t * 12) % (H + 40)) - 20;
      ctx.fillStyle = treat === "glow" ? theme.accent : "#ffffff";
      ctx.beginPath();
      ctx.arc(px, py, treat === "glow" ? U * 0.04 : 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  } else if (treat === "fog") {
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = "#c7d2fe";
    ctx.fillRect(0, H * 0.55, W, H * 0.45);
    ctx.restore();
  }

  ctx.save();
  const zoom = cam.zoom * tAnim.scale * (1.02 + 0.03 * progress + hookBoost);
  const shakeX = cur.isHook && local < 0.4 ? Math.sin(local * 62) * U * 0.008 * (1 - local / 0.4) : 0;
  const shakeY = cur.isHook && local < 0.4 ? Math.cos(local * 52) * U * 0.006 * (1 - local / 0.4) : 0;
  ctx.translate(W / 2 + shakeX + cam.x * W * PARALLAX_LAYERS.foreground + tAnim.tx * W, winCY + shakeY + cam.y * H * PARALLAX_LAYERS.foreground + tAnim.ty * H);
  ctx.rotate(cam.rotation);
  ctx.scale(zoom, zoom);
  ctx.globalAlpha = Math.max(0.05, tAnim.opacity);
  ctx.translate(-W / 2, -winCY);

  // draw scene
  switch (cur.type) {
    case "intro": {
      const fitted = fitText(cur.title || "", maxW, 3, U * 0.125, 800);
      const subFitted = cur.subtitle ? fitText(cur.subtitle, maxW * 0.84, 2, U * 0.044, 500) : null;
      const blockH = fitted.lines.length * fitted.size * 1.22;
      const subH = subFitted ? subFitted.lines.length * subFitted.size * 1.4 : 0;
      const gap = U * 0.055;
      const top = winCY - (blockH + subH + gap) / 2;

      // rule
      ctx.save();
      ctx.globalAlpha = reveal;
      const ruleW = U * 0.32 * reveal;
      const rg = ctx.createLinearGradient(W / 2 - ruleW / 2, 0, W / 2 + ruleW / 2, 0);
      rg.addColorStop(0, theme.accent);
      rg.addColorStop(1, theme.accent2);
      ctx.fillStyle = rg;
      ctx.fillRect(W / 2 - ruleW / 2, top - U * 0.045, ruleW, Math.max(2, U * 0.006));
      ctx.restore();

      // title
      fitted.lines.forEach((line, i) => {
        const y = top + blockH / 2 - ((fitted.lines.length - 1) * fitted.size * 1.22) / 2 + i * fitted.size * 1.22;
        const p = clamp((reveal - i * 0.08) / 0.26, 0, 1);
        ctx.save();
        ctx.globalAlpha = p;
        ctx.translate(0, (1 - easeOutCubic(p)) * fitted.size * 0.45);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `800 ${fitted.size}px "Hind Siliguri","Noto Sans Bengali",system-ui,sans-serif`;
        ctx.fillStyle = accentGrad(W / 2 - maxW / 2, y - fitted.size / 2, maxW, fitted.size);
        ctx.fillText(line, W / 2, y);
        ctx.restore();
      });
      if (subFitted) {
        subFitted.lines.forEach((line, i) => {
          const y = top + blockH + gap + subH / 2 - ((subFitted.lines.length - 1) * subFitted.size * 1.4) / 2 + i * subFitted.size * 1.4;
          const p = clamp((reveal - 0.45 - i * 0.08) / 0.28, 0, 1);
          ctx.save();
          ctx.globalAlpha = p * 0.95;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.font = `500 ${subFitted.size}px "Hind Siliguri","Noto Sans Bengali",system-ui,sans-serif`;
          ctx.fillStyle = hexToRgb(theme.sub).r ? rgba(theme.sub, 1) : theme.sub;
          ctx.fillText(line, W / 2, y);
          ctx.restore();
        });
      }
      break;
    }
    case "text": {
      const h = cur.heading || cur.title || "";
      const b = cur.body || cur.text || "";
      const headFit = h ? fitText(h, maxW, 2, U * 0.055, 800) : null;
      const bodyFit = fitText(b, maxW * 0.9, 5, U * 0.062, 600);
      const headH = headFit ? headFit.lines.length * headFit.size * 1.24 : 0;
      const bodyH = bodyFit.lines.length * bodyFit.size * 1.34;
      const gap = headFit ? U * 0.05 : 0;
      const top = winCY - (headH + gap + bodyH) / 2;
      if (headFit) {
        headFit.lines.forEach((line, i) => {
          const y = top + headH / 2 - ((headFit.lines.length - 1) * headFit.size * 1.24) / 2 + i * headFit.size * 1.24;
          const p = clamp((reveal - i * 0.06) / 0.3, 0, 1);
          ctx.save();
          ctx.globalAlpha = p;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.font = `800 ${headFit.size}px "Hind Siliguri","Noto Sans Bengali",system-ui,sans-serif`;
          ctx.fillStyle = theme.accent;
          ctx.fillText(line, W / 2, y);
          ctx.restore();
        });
      }
      bodyFit.lines.forEach((line, i) => {
        const y = top + headH + gap + bodyH / 2 - ((bodyFit.lines.length - 1) * bodyFit.size * 1.34) / 2 + i * bodyFit.size * 1.34;
        const p = clamp((reveal - 0.18 - i * 0.07) / 0.32, 0, 1);
        ctx.save();
        ctx.globalAlpha = p;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `600 ${bodyFit.size}px "Hind Siliguri","Noto Sans Bengali",system-ui,sans-serif`;
        ctx.fillStyle = accentGrad(W / 2 - maxW / 2, y - bodyFit.size / 2, maxW, bodyFit.size);
        ctx.fillText(line, W / 2, y);
        ctx.restore();
      });
      break;
    }
    case "bullets": {
      const items = cur.items || [];
      const headFit = cur.heading ? fitText(cur.heading, maxW, 2, U * 0.052, 800) : null;
      const headH = headFit ? headFit.lines.length * headFit.size * 1.22 : 0;
      const rowH = U * 0.115;
      const stackH = headH + (headFit ? U * 0.09 : 0) + items.length * rowH;
      const top = winCY - stackH / 2;
      if (headFit) {
        headFit.lines.forEach((line, i) => {
          const y = top + headH / 2 - ((headFit.lines.length - 1) * headFit.size * 1.22) / 2 + i * headFit.size * 1.22;
          ctx.save();
          ctx.globalAlpha = clamp(reveal * 1.5 - i * 0.1, 0, 1);
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.font = `800 ${headFit.size}px "Hind Siliguri","Noto Sans Bengali",system-ui,sans-serif`;
          ctx.fillStyle = theme.accent;
          ctx.fillText(line, W / 2, y);
          ctx.restore();
        });
      }
      const startY = top + headH + U * 0.09;
      items.forEach((item, idx) => {
        const rp = clamp((reveal - 0.14 - idx * 0.12) / 0.3, 0, 1);
        const eased = easeOutCubic(rp);
        const y = startY + idx * rowH;
        // chip
        ctx.save();
        ctx.globalAlpha = eased;
        const chip = U * 0.032;
        const chipGrad = ctx.createLinearGradient(margin * 1.1, y - chip, margin * 1.1 + chip * 2, y + chip);
        chipGrad.addColorStop(0, theme.accent2);
        chipGrad.addColorStop(1, theme.accent);
        ctx.fillStyle = chipGrad;
        ctx.beginPath();
        (ctx as unknown as { roundRect?: (...a: unknown[]) => void }).roundRect
          ? (ctx as unknown as { roundRect: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect(
              margin * 1.1,
              y - chip * 0.8,
              chip * 1.9,
              chip * 1.6,
              chip * 0.5
            )
          : ctx.rect(margin * 1.1, y - chip * 0.8, chip * 1.9, chip * 1.6);
        ctx.fill();
        ctx.restore();
        const itemFit = fitText(item, maxW - chip * 3.2, 2, U * 0.048, 600);
        const iy = y;
        ctx.save();
        ctx.globalAlpha = eased;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.font = `600 ${itemFit.size}px "Hind Siliguri","Noto Sans Bengali",system-ui,sans-serif`;
        ctx.fillStyle = theme.text;
        // single line bullet
        const txt = itemFit.lines.join(" ");
        ctx.fillText(txt, margin * 1.1 + chip * 2.9, iy);
        ctx.restore();
      });
      break;
    }
    case "stat": {
      const val = cur.value ?? 0;
      const shown = val * easeOutCubic(clamp(reveal * 1.2, 0, 1));
      const display = (Number.isInteger(val) ? Math.round(shown).toLocaleString("en-US") : shown.toFixed(1)) + (cur.suffix || "");
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `800 ${U * 0.19}px ui-monospace,monospace`;
      ctx.fillStyle = accentGrad(W / 2 - U * 0.3, winCY - U * 0.15, U * 0.6, U * 0.19);
      ctx.globalAlpha = clamp(reveal * 1.4, 0, 1);
      ctx.fillText(display, W / 2, winCY - U * 0.045);
      ctx.restore();
      const labelFit = cur.label ? fitText(cur.label, maxW, 2, U * 0.044, 600) : null;
      if (labelFit) {
        labelFit.lines.forEach((line, i) => {
          const y = winCY + U * 0.14 + i * labelFit.size * 1.3;
          ctx.save();
          ctx.globalAlpha = clamp((reveal - 0.3) * 2, 0, 1);
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.font = `600 ${labelFit.size}px "Hind Siliguri","Noto Sans Bengali",system-ui,sans-serif`;
          ctx.fillStyle = theme.sub;
          ctx.fillText(line, W / 2, y);
          ctx.restore();
        });
      }
      // bar
      ctx.save();
      ctx.globalAlpha = clamp((reveal - 0.35) * 1.6, 0, 1);
      const barW = U * 0.42 * easeOutCubic(clamp((reveal - 0.35) * 1.6, 0, 1));
      const barGrad = ctx.createLinearGradient(W / 2 - barW / 2, 0, W / 2 + barW / 2, 0);
      barGrad.addColorStop(0, theme.accent);
      barGrad.addColorStop(1, theme.accent2);
      ctx.fillStyle = barGrad;
      ctx.fillRect(W / 2 - barW / 2, winCY + U * 0.21, barW, Math.max(2, U * 0.005));
      ctx.restore();
      break;
    }
    case "quote": {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = theme.accent;
      ctx.font = `900 ${U * 0.32}px "Hind Siliguri",system-ui,sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("“", W / 2, winCY - U * 0.18);
      ctx.restore();
      const qFit = fitText(cur.text || "", maxW * 0.84, 5, U * 0.058, 600);
      const qH = qFit.lines.length * qFit.size * 1.36;
      const qTop = winCY - qH / 2;
      qFit.lines.forEach((line, i) => {
        const y = qTop + qH / 2 - ((qFit.lines.length - 1) * qFit.size * 1.36) / 2 + i * qFit.size * 1.36;
        ctx.save();
        ctx.globalAlpha = clamp(reveal * 1.25 - i * 0.06, 0, 1);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `600 ${qFit.size}px "Hind Siliguri","Noto Sans Bengali",system-ui,sans-serif`;
        ctx.fillStyle = accentGrad(W / 2 - maxW / 2, y - qFit.size / 2, maxW, qFit.size);
        ctx.fillText(line, W / 2, y);
        ctx.restore();
      });
      if (cur.author) {
        ctx.save();
        ctx.globalAlpha = clamp((reveal - 0.5) * 2, 0, 1);
        ctx.textAlign = "center";
        ctx.font = `700 ${U * 0.036}px "Hind Siliguri",system-ui,sans-serif`;
        ctx.fillStyle = theme.accent;
        ctx.fillText(`— ${cur.author}`, W / 2, qTop + qH + U * 0.075);
        ctx.restore();
      }
      break;
    }
    case "broll": {
      ctx.save();
      // rings + bars
      for (let i = 0; i < 5; i++) {
        const rp = clamp(reveal * 1.4 - i * 0.12, 0, 1);
        if (rp <= 0) continue;
        const rr = U * (0.1 + i * 0.075) * (0.85 + 0.3 * rp);
        ctx.globalAlpha = (0.5 - i * 0.07) * rp;
        ctx.strokeStyle = theme.blobs[i % theme.blobs.length];
        ctx.lineWidth = U * 0.008;
        ctx.beginPath();
        ctx.arc(W / 2, winCY, rr, -Math.PI / 2 + i * 0.7 + local * 0.4, -Math.PI / 2 + i * 0.7 + local * 0.4 + 1.9 + i * 0.4);
        ctx.stroke();
      }
      // bars
      const bars = 28;
      const bw = (W * 0.62) / bars;
      for (let b = 0; b < bars; b++) {
        const amp = 0.45 + 0.45 * Math.sin(t * 2 + b * 0.8);
        const hh = U * (0.02 + amp * 0.12) * reveal;
        const x = W / 2 - (bars * bw) / 2 + b * bw;
        const bg = ctx.createLinearGradient(0, winCY - hh / 2, 0, winCY + hh / 2);
        bg.addColorStop(0, theme.accent2);
        bg.addColorStop(1, theme.accent);
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = bg;
        ctx.beginPath();
        (ctx as unknown as { roundRect?: (...a: unknown[]) => void }).roundRect
          ? (ctx as unknown as { roundRect: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect(x, winCY + U * 0.2 - hh / 2, bw * 0.62, hh, bw * 0.3)
          : ctx.rect(x, winCY + U * 0.2 - hh / 2, bw * 0.62, hh);
        ctx.fill();
      }
      ctx.restore();
      break;
    }
    case "outro": {
      const oFit = fitText(cur.title || "", maxW, 3, U * 0.1, 800);
      const oSubFit = cur.subtitle ? fitText(cur.subtitle, maxW * 0.86, 3, U * 0.042, 500) : null;
      const oTitleH = oFit.lines.length * oFit.size * 1.22;
      const oSubH = oSubFit ? oSubFit.lines.length * oSubFit.size * 1.36 : 0;
      const gap = oSubFit ? U * 0.05 : 0;
      const pillH = cur.cta ? U * 0.095 : 0;
      const pillGap = cur.cta ? U * 0.06 : 0;
      const oTotal = oTitleH + gap + oSubH + pillGap + pillH;
      const oTop = winCY - oTotal / 2;
      oFit.lines.forEach((line, i) => {
        const y = oTop + oTitleH / 2 - ((oFit.lines.length - 1) * oFit.size * 1.22) / 2 + i * oFit.size * 1.22;
        ctx.save();
        ctx.globalAlpha = clamp(reveal * 1.3 - i * 0.05, 0, 1);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `800 ${oFit.size}px "Hind Siliguri","Noto Sans Bengali",system-ui,sans-serif`;
        ctx.fillStyle = accentGrad(W / 2 - maxW / 2, y - oFit.size / 2, maxW, oFit.size);
        ctx.fillText(line, W / 2, y);
        ctx.restore();
      });
      if (oSubFit) {
        oSubFit.lines.forEach((line, i) => {
          const y = oTop + oTitleH + gap + oSubH / 2 - ((oSubFit.lines.length - 1) * oSubFit.size * 1.36) / 2 + i * oSubFit.size * 1.36;
          ctx.save();
          ctx.globalAlpha = clamp((reveal - 0.35) * 2 - i * 0.07, 0, 1);
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.font = `500 ${oSubFit.size}px "Hind Siliguri","Noto Sans Bengali",system-ui,sans-serif`;
          ctx.fillStyle = theme.sub;
          ctx.fillText(line, W / 2, y);
          ctx.restore();
        });
      }
      if (cur.cta) {
        const pillW = U * 0.46, pillHT = U * 0.095;
        const px = W / 2 - pillW / 2, py = oTop + oTitleH + gap + oSubH + pillGap;
        const pp = easeOutCubic(clamp((reveal - 0.5) * 2.2, 0, 1));
        ctx.save();
        ctx.globalAlpha = pp;
        const pg = ctx.createLinearGradient(px, py, px + pillW, py + pillHT);
        pg.addColorStop(0, theme.accent2);
        pg.addColorStop(1, theme.accent);
        ctx.fillStyle = pg;
        ctx.beginPath();
        (ctx as unknown as { roundRect?: (...a: unknown[]) => void }).roundRect
          ? (ctx as unknown as { roundRect: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect(px, py, pillW * pp, pillHT, pillHT / 2)
          : ctx.rect(px, py, pillW * pp, pillHT);
        ctx.fill();
        if (pp > 0.85) {
          ctx.fillStyle = "#05070f";
          ctx.font = `800 ${U * 0.038}px "Hind Siliguri",system-ui,sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(cur.cta, W / 2, py + pillHT / 2 + 1);
        }
        ctx.restore();
      }
      break;
    }
    default:
      break;
  }

  // 2D character transform fallback (no skeletal animation)
  if (cur.character) {
    const ch = characterAt(cur.character.action, cur.character.emotion, progress);
    ctx.save();
    ctx.globalAlpha = (cur.character.opacity ?? 1) * ch.opacity * 0.85;
    const cx = W * (cur.character.x ?? ch.x);
    const cy = winCY + H * (cur.character.y ?? ch.y) * 0.15;
    ctx.translate(cx, cy);
    ctx.rotate(ch.rotation);
    ctx.scale(ch.scale * (cur.character.scale ?? 1), ch.scale * (cur.character.scale ?? 1));
    ctx.fillStyle = theme.accent2;
    ctx.beginPath();
    ctx.arc(0, -U * 0.055, U * 0.038, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = theme.accent;
    ctx.beginPath();
    ctx.ellipse(0, U * 0.02, U * 0.042, U * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();

  // transition overlay (Blueprint-driven, not UI-only)
  if (transT > 0 && next) {
    ctx.save();
    if (transName === "fade" || transName === "crossfade") {
      ctx.globalAlpha = transT * 0.35;
      ctx.fillStyle = theme.bg;
      ctx.fillRect(0, 0, W, H);
    } else if (transName === "wipe" || transName === "slide") {
      ctx.fillStyle = theme.bg;
      ctx.fillRect(0, 0, W * transT, H);
    } else if (transName === "zoom") {
      ctx.globalAlpha = transT * 0.4;
      ctx.fillStyle = theme.accent;
      ctx.fillRect(0, 0, W, H);
    } else if (transName === "glitch") {
      ctx.globalAlpha = 0.25 * transT;
      ctx.fillStyle = theme.accent2;
      ctx.fillRect(0, (H * transT) % H, W, 8);
    } else if (transName === "blur" || transName === "whip_pan" || transName === "page_turn") {
      ctx.globalAlpha = transT * 0.3;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  // progress bar
  if (spec.meta.showProgress) {
    const barH = Math.max(3, U * 0.007);
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.fillRect(0, H - barH, W, barH);
    const pw = W * clamp(t / total, 0, 1);
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, theme.accent2);
    g.addColorStop(1, theme.accent);
    ctx.fillStyle = g;
    ctx.fillRect(0, H - barH, pw, barH);
  }

  // watermark
  if (spec.meta.watermark) {
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = `600 ${U * 0.028}px "Hind Siliguri",system-ui,sans-serif`;
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText(spec.meta.watermark, W - U * 0.05, H - U * 0.045);
  }

  // flash
  const flashDur = cur.isHook ? 0.35 : 0.18;
  const flash = clamp(1 - local / flashDur, 0, 1);
  if (flash > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = (cur.isHook ? 0.22 : 0.12) * flash;
    const fg = ctx.createLinearGradient(0, 0, W, H);
    fg.addColorStop(0, theme.accent);
    fg.addColorStop(1, theme.accent2);
    ctx.fillStyle = fg;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Demo scripts
// ---------------------------------------------------------------------------
const DEMO_SCRIPT_BN = `৫টি সকালের অভ্যাস যা জীবন বদলে দেবে

আপনি কি জানেন মাত্র ৫টি ছোট অভ্যাস আপনার পুরো দিনটাই বদলে দিতে পারে?

সকাল ৬টায় ওঠা মানে দিনে ২ ঘণ্টা বেশি — বছরে ৭৩০ ঘণ্টা এক্সট্রা!

যে ৩টি অভ্যাস আজ থেকেই শুরু করুন:
- ৫ মিনিট মেডিটেশন আর গভীর শ্বাস
- এক গ্লাস পানি আর হালকা স্ট্রেচিং
- দিনের সবচেয়ে গুরুত্বপূর্ণ ৩টি কাজ লিখুন

৯৫% সফল মানুষ বলেন — সকালের রুটিনই তাদের সাফল্যের আসল রহস্য।

"সকাল কীভাবে কাটাবেন, সারাদিন সেভাবেই কাটবে।" — রবিন শর্মা

আজ থেকেই শুরু করুন, ২১ দিনেই অভ্যাস গড়ে উঠবে।
🔔 ভালো লাগলে লাইক ও সাবস্ক্রাইব করুন!`;

const SHORTS_SCRIPT = `৩০ সেকেন্ডে প্রোডাক্টিভিটি হ্যাক

এই একটা ট্রিক আপনার সময় দ্বিগুণ বাঁচাবে!

পমোডোরো: ২৫ মিনিট কাজ + ৫ মিনিট বিরতি — মস্তিষ্ক ফোকাস থাকে ৪x বেশি।

- ফোন সাইলেন্ট করুন
- একসাথে একটা কাজ
- বিরতিতে হাঁটুন

৮০% মানুষ মাল্টিটাস্কিংয়ে ভুল করে — সিঙ্গেল-টাস্ক জিতবেই!

আজই ট্রাই করুন! 🔔`;

const EDU_SCRIPT = `কৃত্রিম বুদ্ধিমত্তা কীভাবে কাজ করে?

AI হলো এমন প্রযুক্তি যা মানুষের মতো চিন্তা ও শেখার চেষ্টা করে।

মেশিন লার্নিং হলো AI-এর হৃদয় — ডেটা থেকে প্যাটার্ন শিখে সিদ্ধান্ত নেয়।

৩টি প্রধান ধাপ:
- ডেটা সংগ্রহ ও পরিষ্কার করা
- মডেলকে হাজারো উদাহরণ দিয়ে প্রশিক্ষণ
- নতুন পরিস্থিতিতে ভবিষ্যদ্বাণী করা

ChatGPT-এর মতো মডেল ১৭৫ বিলিয়ন প্যারামিটার দিয়ে তৈরি!

"AI মানুষকে প্রতিস্থাপন করবে না, কিন্তু AI ব্যবহারকারী মানুষ করবে।"

ভবিষ্যৎ এখনই — শিখতে শুরু করুন। 🚀`;

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const spriteCacheRef = useRef<Map<string, HTMLCanvasElement>>(new Map());

  const [lang, setLang] = useState<"bn" | "en">("bn");
  const [topic, setTopic] = useState("");
  const [script, setScript] = useState(DEMO_SCRIPT_BN);
  const [theme, setTheme] = useState<ThemeKey>("aurora");
  const [mood, setMood] = useState<MoodKey>("uplifting");
  const [aspect, setAspect] = useState<Aspect>("16:9");
  const [quality, setQuality] = useState<Quality>("720p");
  const [perf, setPerf] = useState<Perf>("high");
  const [wpm, setWpm] = useState(145);
  const [shortsMode, setShortsMode] = useState(false);
  const [watermark, setWatermark] = useState("");
  const [activeTab, setActiveTab] = useState<"script" | "design" | "audio" | "export">("script");
  // Timeline provided by user (extra - single-page will use it)
  const [timelineFileName, setTimelineFileName] = useState<string>("");
  const [customTimeline, setCustomTimeline] = useState<{ w: string; s: number; e: number; para: number }[] | null>(null);
  const [customSegments, setCustomSegments] = useState<{ time: number; text: string }[] | null>(null);
  const timelineInputRef = useRef<HTMLInputElement>(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [aiStatus, setAiStatus] = useState<string>(
    lang === "bn" ? "যেকোনো বিষয়ে লিখুন — সিন, স্ট্যাট আর কোট নিজে থেকেই সাজবে।" : "Type any topic — scenes, stats & quotes auto-arranged."
  );
  const [spec, setSpec] = useState<Spec | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [ttsRate, setTtsRate] = useState(1);
  const [ttsVoice, setTtsVoice] = useState<string>("");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [showToast, setShowToast] = useState<string | null>(null);

  // ——— Voice-tracked auto video (100% free, client-side) ———
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [bgName, setBgName] = useState<string>("");
  const [voiceFile, setVoiceFile] = useState<File | null>(null);
  const [voiceName, setVoiceName] = useState<string>("");
  const [vadResult, setVadResult] = useState<VADResult | null>(null);
  const [voiceSpec, setVoiceSpec] = useState<Spec | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [voiceError, setVoiceError] = useState<string>("");
  const [autoStory, setAutoStory] = useState(false);
  const [storyStyle, setStoryStyle] = useState<string>("reveal");
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [directorStatus, setDirectorStatus] = useState<"ready" | "parsing" | "directing" | "validating" | "complete" | "error">("ready");
  const [directorNote, setDirectorNote] = useState("");
  const historyRef = useRef(new HistoryStack<Spec>(40));
  const waveformRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);
  const voiceInputRef = useRef<HTMLInputElement>(null);
  const [audioUrl, setAudioUrl] = useState<string>("");

  const isBn = lang === "bn";

  // Load voices
  useEffect(() => {
    const load = () => {
      const v = speechSynthesis.getVoices();
      setVoices(v);
      if (v.length && !ttsVoice) setTtsVoice(v[0].name);
    };
    load();
    speechSynthesis.onvoiceschanged = load;
  }, [ttsVoice]);

  // Build spec whenever script/theme etc change (auto plan)
  const builtSpec = useMemo(() => {
    try {
      const s = buildSpec({
        script,
        language: lang,
        theme,
        mood,
        aspect: shortsMode ? "9:16" : aspect,
        quality,
        perf,
        shorts: shortsMode,
        watermark,
      });
      return s;
    } catch {
      return null;
    }
  }, [script, lang, theme, mood, aspect, quality, perf, shortsMode, watermark]);

  // Effective spec: voice-synced overrides auto spec
  const effectiveSpec = voiceSpec || builtSpec;

  useEffect(() => {
    if (effectiveSpec) {
      setSpec(effectiveSpec);
      setDuration(effectiveSpec.duration);
      setCurrentTime(0);
      setIsPlaying(false);
    }
  }, [effectiveSpec]);

  // If script/theme changes while voice is loaded, keep VAD but offer re-sync (don't auto-override)
  useEffect(() => {
    if (voiceSpec && builtSpec && vadResult) {
      // script changed after voice sync — keep old voiceSpec until user hits re-sync
      // just invalidate toast hint: we don't auto-rebuild to avoid jumping
    }
  }, [builtSpec, voiceSpec, vadResult]);

  // Draw waveform when VAD ready
  useEffect(() => {
    if (!vadResult || !waveformRef.current) return;
    const c = waveformRef.current;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth * dpr;
    const h = 64 * dpr;
    c.width = w;
    c.height = h;
    c.style.width = "100%";
    c.style.height = "64px";
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    // bg
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, w, h);
    // envelope
    const env = vadResult.envelope;
    if (env.length) {
      const max = Math.max(...Array.from(env as unknown as number[]), 0.001);
      ctx.strokeStyle = "rgba(124,92,255,0.18)";
      ctx.lineWidth = 1 * dpr;
      ctx.beginPath();
      for (let i = 0; i < env.length; i++) {
        const x = (i / env.length) * w;
        const y = h - (env[i] / max) * (h * 0.7) - h * 0.15;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      // phrases
      vadResult.phrases.forEach((p) => {
        const x0 = (p.start / vadResult.duration) * w;
        const x1 = (p.end / vadResult.duration) * w;
        ctx.fillStyle = "rgba(45,212,191,0.34)";
        ctx.fillRect(x0, h * 0.08, Math.max(1, x1 - x0), h * 0.84);
        ctx.fillStyle = "rgba(45,212,191,0.95)";
        ctx.fillRect(x0, h * 0.5 - 1, Math.max(1, x1 - x0), 2);
      });
      // threshold line
      const thrY = h - (vadResult.threshold / max) * (h * 0.7) - h * 0.15;
      ctx.strokeStyle = "rgba(251,191,36,0.55)";
      ctx.setLineDash([4 * dpr, 4 * dpr]);
      ctx.beginPath();
      ctx.moveTo(0, thrY);
      ctx.lineTo(w, thrY);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // labels
    ctx.fillStyle = "#8d9cc2";
    ctx.font = `${10 * dpr}px ui-monospace,monospace`;
    ctx.fillText(`${vadResult.phrases.length} slots • ${vadResult.speechTime.toFixed(1)}s / ${vadResult.duration.toFixed(1)}s • ${(vadResult.speechRatio * 100).toFixed(0)}%`, 8 * dpr, 14 * dpr);
  }, [vadResult]);

  // canvas setup
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !spec) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const displayW = spec.width;
    const displayH = spec.height;
    canvas.width = displayW;
    canvas.height = displayH;
    canvas.style.width = "100%";
    canvas.style.height = "auto";
    const ctx = canvas.getContext("2d");
    if (ctx) {
      void dpr;
      const vw = (spec as unknown as { _voiceWords?: { w: string; s: number; e: number; para: number }[] })._voiceWords;
      renderFrame(ctx, spec, currentTime, spriteCacheRef.current, bgImage, vw);
    }
  }, [spec, currentTime, bgImage]);

  // playback loop
  useEffect(() => {
    if (!isPlaying || !spec) return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setCurrentTime((prev) => {
        const next = prev + dt;
        if (next >= spec.duration) {
          setIsPlaying(false);
          return spec.duration;
        }
        return next;
      });
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [isPlaying, spec]);

  // render on time change (includes bg + voice sync)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !spec) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const vw = (spec as unknown as { _voiceWords?: { w: string; s: number; e: number; para: number }[] })._voiceWords;
    renderFrame(ctx, spec, currentTime, spriteCacheRef.current, bgImage, vw);
  }, [currentTime, spec, bgImage]);

  const toast = useCallback((msg: string) => {
    setShowToast(msg);
    setTimeout(() => setShowToast(null), 2200);
  }, []);

  useEffect(() => {
    try {
      if (localStorage.getItem("cutfree.spec.ok") !== "1") return;
      const raw = localStorage.getItem("cutfree.spec.v2");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const migrated = migrateBlueprint(parsed);
      const { blueprint: norm } = normalizeBlueprint(migrated);
      const check = validateBlueprintJson({ blueprint: norm });
      if (check.valid && Array.isArray(norm.scenes) && norm.scenes.length) {
        setVoiceSpec(norm as unknown as Spec);
        historyRef.current.seed(norm as unknown as Spec);
      }
    } catch { /* corrupt recovery ignored */ }
  }, []);

  // ——— Background image handler (free, client-side, theme-aware overlay) ———
  const handleBgSelect = useCallback(
    async (file: File | null) => {
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        toast(isBn ? "ছবি ফাইল দিন (jpg/png/webp)" : "Please select an image file");
        return;
      }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        setBgImage(img);
        setBgName(file.name);
        toast(isBn ? `ব্যাকগ্রাউন্ড: ${file.name}` : `Background: ${file.name}`);
      };
      img.onerror = () => toast(isBn ? "ছবি লোড হয়নি" : "Failed to load image");
      img.src = url;
    },
    [isBn, toast]
  );

  const clearBg = useCallback(() => {
    setBgImage(null);
    setBgName("");
    if (bgInputRef.current) bgInputRef.current.value = "";
    toast(isBn ? "ব্যাকগ্রাউন্ড সরানো হলো" : "Background removed");
  }, [isBn, toast]);

  // ——— Voice-tracked animation (VAD → word timing) ———
  const handleVoiceSelect = useCallback(
    async (file: File | null) => {
      if (!file) return;
      if (!file.type.startsWith("audio/") && !file.name.match(/\.(mp3|wav|m4a|ogg|webm|aac|flac)$/i)) {
        toast(isBn ? "অডিও ফাইল দিন (mp3/wav/m4a/ogg)" : "Please select an audio file");
        return;
      }
      setVoiceFile(file);
      setVoiceName(file.name);
      setVoiceError("");
      setVadResult(null);
      setVoiceSpec(null);
      setIsTracking(true);
      const u = URL.createObjectURL(file);
      setAudioUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return u;
      });
      try {
        const mono = await decodeToMono(file);
        const vad = analyseVAD(mono);
        setVadResult(vad);
        if (!vad.usable) {
          setVoiceError(isBn ? `অডিওতে স্পিচ কম পাওয়া গেছে (${vad.phrases.length} স্লট)। পরিষ্কার ভয়েস দিন বা দীর্ঘ রেকর্ড ব্যবহার করুন।` : `Low speech detected (${vad.phrases.length} slots). Try clearer or longer recording.`);
          toast(isBn ? "VAD: স্পিচ কম — অন্য অডিও ট্রাই করুন" : "VAD: low speech — try another file");
          return;
        }
        // auto-build voice-synced spec if script exists
        if (script.trim() && builtSpec) {
          const vSpec = buildVoiceSpec(script, vad, builtSpec, { title: builtSpec.meta.title });
          if (vSpec) {
            setVoiceSpec(vSpec);
            toast(isBn ? `🎙️ ভয়েস ট্র্যাকড! ${vad.phrases.length} স্লট → ${wordCount(script)} শব্দ সিঙ্ক` : `🎙️ Voice-tracked! ${vad.phrases.length} slots → ${wordCount(script)} words synced`);
          }
        } else {
          toast(isBn ? `VAD রেডি: ${vad.phrases.length} স্লট, ${vad.speechTime.toFixed(1)}s speech` : `VAD ready: ${vad.phrases.length} slots, ${vad.speechTime.toFixed(1)}s speech`);
        }
      } catch (e) {
        console.error(e);
        setVoiceError(isBn ? "অডিও ডিকোড হয়নি — অন্য ফরম্যাট ট্রাই করুন" : "Audio decode failed — try another format");
        toast(isBn ? "অডিও পড়া যায়নি" : "Failed to read audio");
      } finally {
        setIsTracking(false);
      }
    },
    [isBn, toast, script, builtSpec]
  );

  const clearVoice = useCallback(() => {
    setVoiceFile(null);
    setVoiceName("");
    setVadResult(null);
    setVoiceSpec(null);
    setVoiceError("");
    setAudioUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return "";
    });
    if (voiceInputRef.current) voiceInputRef.current.value = "";
    toast(isBn ? "ভয়েস সরানো হলো" : "Voice removed");
  }, [isBn, toast]);

  const applyVoiceSync = useCallback(() => {
    if (!vadResult || !builtSpec) {
      toast(isBn ? "আগে অডিও ও স্ক্রিপ্ট দিন" : "Add audio & script first");
      return;
    }
    const vSpec = buildVoiceSpec(script, vadResult, builtSpec, { title: builtSpec.meta.title });
    if (!vSpec) {
      toast(isBn ? "সিঙ্ক ব্যর্থ — স্ক্রিপ্ট/অডিও চেক করুন" : "Sync failed — check script/audio");
      return;
    }
    setVoiceSpec(vSpec);
    toast(isBn ? "✅ ভয়েস-সিঙ্কড প্ল্যান প্রস্তুত!" : "✅ Voice-synced plan ready!");
    setCurrentTime(0);
  }, [vadResult, builtSpec, script, isBn, toast]);

  // ——— User-provided timeline (speech → word timings) — supports both [{time,text}] and [{w,s,e,para}] ———
  const handleTimelineSelect = useCallback(async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const raw = JSON.parse(text);
      const arr: any[] = Array.isArray(raw) ? raw : raw.words || raw.timeline || raw.segments || [];
      if (!arr.length) throw new Error("empty");
      // Detect segment format: {time, text} — your "বন্ধ দরজার..." JSON
      const isSegment = arr[0] && typeof arr[0].time !== "undefined" && typeof arr[0].text === "string" && typeof arr[0].w === "undefined";
      if (isSegment) {
        const segs: { time: number; text: string }[] = arr.map((it:any)=>({
          time: Number(it.time ?? it.t ?? it.start ?? 0),
          text: String(it.text ?? it.t ?? "").trim()
        })).filter((x:any)=>x.text);
        if (!segs.length) throw new Error("empty segs");
        segs.sort((a,b)=>a.time-b.time);
        setCustomSegments(segs);
        setCustomTimeline(null);
        setTimelineFileName(file.name);
        toast(isBn ? `📋 টাইমলাইন লোড: ${segs.length} সেগমেন্ট` : `📋 Timeline loaded: ${segs.length} segments`);
        if (builtSpec && script.trim()) {
          const tSpec = buildSpecFromSegmentTimeline(script, segs, builtSpec);
          if (tSpec) { setVoiceSpec(tSpec); toast(isBn ? "🎬 টাইমলাইন-সিঙ্কড ভিডিও রেডি!" : "🎬 Timeline-synced video ready!"); }
        }
        return;
      }
      const words: { w: string; s: number; e: number; para: number }[] = arr.map((it:any, idx:number)=>{
        const w = String(it.w ?? it.text ?? it.word ?? it.t ?? "").trim() || `w${idx}`;
        const s = Number(it.s ?? it.start ?? it.st ?? it.time ?? 0);
        const e = Number(it.e ?? it.end ?? it.et ?? s+0.3);
        const para = Number(it.para ?? it.p ?? it.segment ?? 0);
        return { w, s: Math.max(0,s), e: Math.max(s+0.05, e), para: Math.max(0, para) };
      }).filter((x:any)=>x.w);
      if (!words.length) throw new Error("empty");
      words.sort((a,b)=>a.s-b.s);
      setCustomTimeline(words);
      setCustomSegments(null);
      setTimelineFileName(file.name);
      toast(isBn ? `📋 টাইমলাইন লোড: ${words.length} শব্দ` : `📋 Timeline loaded: ${words.length} words`);
      if (builtSpec && script.trim()) {
        const tSpec = buildSpecFromTimeline(script, words, builtSpec);
        if (tSpec) { setVoiceSpec(tSpec); toast(isBn ? "🎬 টাইমলাইন-সিঙ্কড ভিডিও রেডি!" : "🎬 Timeline-synced video ready!"); }
      }
    } catch (e) {
      console.error(e);
      toast(isBn ? "টাইমলাইন JSON পার্স হয়নি — [{time,text}] বা [{w,s,e,para}] দিন" : "Failed to parse timeline JSON — need [{time,text}] or [{w,s,e,para}]");
    }
  }, [isBn, toast, builtSpec, script]);

  const clearTimeline = useCallback(()=>{
    setCustomTimeline(null); setCustomSegments(null); setTimelineFileName(""); if (timelineInputRef.current) timelineInputRef.current.value=""; toast(isBn ? "টাইমলাইন সরানো হলো" : "Timeline removed");
  }, [isBn, toast]);

  const applyTimelineSync = useCallback(()=>{
    if (customSegments && builtSpec) {
      const tSpec = buildSpecFromSegmentTimeline(script, customSegments, builtSpec);
      if (!tSpec) { toast(isBn ? "টাইমলাইন সিঙ্ক ব্যর্থ" : "Timeline sync failed"); return; }
      setVoiceSpec(tSpec); setCurrentTime(0); toast(isBn ? "✅ টাইমলাইন-সিঙ্ক প্রয়োগ!" : "✅ Timeline sync applied!"); return;
    }
    if (!customTimeline || !builtSpec) { toast(isBn ? "আগে টাইমলাইন JSON ও স্ক্রিপ্ট দিন" : "Add timeline JSON & script first"); return; }
    const tSpec = buildSpecFromTimeline(script, customTimeline, builtSpec);
    if (!tSpec) { toast(isBn ? "টাইমলাইন সিঙ্ক ব্যর্থ" : "Timeline sync failed"); return; }
    setVoiceSpec(tSpec); setCurrentTime(0); toast(isBn ? "✅ টাইমলাইন-সিঙ্ক প্রয়োগ!" : "✅ Timeline sync applied!");
  }, [customTimeline, customSegments, builtSpec, script, isBn, toast]);

  // Auto Create Video — deterministic director (no cloud, no model)
  const handleAutoVideo = useCallback(() => {
    if (!script.trim() && !customSegments && !vadResult) {
      toast(isBn ? "স্ক্রিপ্ট লিখুন" : "Write a script first");
      setDirectorStatus("error");
      return;
    }
    setDirectorStatus("parsing");
    setDirectorNote(isBn ? "স্ক্রিপ্ট পার্স + স্টোরি বিট..." : "Parsing script + story beats...");
    try {
      const audioDuration = vadResult?.duration || (customSegments && customSegments.length ? customSegments[customSegments.length - 1].time + 2 : undefined);
      setDirectorStatus("directing");
      const directed = autoCreateVideo({
        script,
        language: lang,
        theme,
        mood,
        aspect: shortsMode ? "9:16" : aspect,
        quality,
        shorts: shortsMode,
        timing: vadResult
          ? {
              totalDuration: vadResult.duration,
              speechSegments: vadResult.phrases,
              pauses: vadResult.gaps.map((g) => ({ start: g.start, end: g.end, duration: g.end - g.start, kind: g.end - g.start >= 0.6 ? "long" : "short" })),
              speechTime: vadResult.speechTime,
              silenceTime: Math.max(0, vadResult.duration - vadResult.speechTime),
              speechRatio: vadResult.speechRatio,
            }
          : null,
        audioDuration,
        segments: customSegments || undefined,
        words: customTimeline || undefined,
      });
      setDirectorStatus("validating");
      const migrated = migrateBlueprint(directed.blueprint);
      const { blueprint: norm } = normalizeBlueprint(migrated);
      const check = validateBlueprintJson({ schemaVersion: "2.0.0", blueprint: norm });
      if (!check.valid) {
        setDirectorStatus("error");
        setDirectorNote(check.errors[0]?.message || "validation failed");
        toast(isBn ? "ভ্যালিডেশন ব্যর্থ" : "Validation failed");
        return;
      }
      const asSpec = norm as unknown as Spec;
      if (historyRef.current.value) historyRef.current.push(asSpec);
      else historyRef.current.seed(asSpec);
      setVoiceSpec(asSpec);
      setDirectorStatus("complete");
      setDirectorNote(`${asSpec.scenes.length} scenes • ${asSpec.duration.toFixed(1)}s • ${directed.beats.length} beats`);
      try {
        localStorage.setItem("cutfree.spec.v2", JSON.stringify(asSpec));
        localStorage.setItem("cutfree.spec.ok", "1");
      } catch { /* ignore quota */ }
      toast(isBn ? "▶ অটো ভিডিও রেডি — প্রিভিউ দেখুন" : "▶ Auto video ready — see preview");
      setCurrentTime(0);
      setIsPlaying(false);
    } catch (e) {
      console.error(e);
      setDirectorStatus("error");
      setDirectorNote((e as Error).message);
      toast(isBn ? "অটো ডিরেক্টর ব্যর্থ" : "Auto director failed");
    }
  }, [script, lang, theme, mood, aspect, quality, shortsMode, vadResult, customSegments, customTimeline, isBn, toast]);

  const handleAiGenerate = useCallback(async () => {
    const clean = topic.trim();
    if (!clean) {
      toast(isBn ? "বিষয় লিখুন (যেমন: ৫টি অভ্যাস)" : "Enter a topic (e.g. 5 habits)");
      return;
    }
    setIsGenerating(true);
    setAiStatus(isBn ? "স্ক্রিপ্ট তৈরি হচ্ছে..." : "Building script...");
    try {
      const res = await fetch("/api/ai/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: clean,
          language: lang,
          style: shortsMode ? "shorts" : "explainer",
        }),
      });
      const data = await res.json();
      if (data?.script) {
        setScript(data.script);
        setAiStatus(
          data.source === "gemini"
            ? isBn
              ? "✨ Gemini দিয়ে তৈরি — প্ল্যান বানাতে প্রস্তুত"
              : "✨ Generated by Gemini — ready to plan"
            : isBn
              ? "📝 টেমপ্লেট ইঞ্জিন থেকে তৈরি (Gemini key নেই বা অফলাইন)"
              : "📝 From template engine (no Gemini key / offline)"
        );
        /* single-page: no tab switch */
        toast(isBn ? "স্ক্রিপ্ট তৈরি হয়েছে!" : "Script generated!");
      } else {
        throw new Error("empty");
      }
    } catch (e) {
      // fallback local
      const fallback = buildSpec({ script: clean + "\n\n" + DEMO_SCRIPT_BN.split("\n").slice(1).join("\n"), language: lang });
      setScript(clean + "\n\n" + DEMO_SCRIPT_BN.split("\n").slice(1).join("\n"));
      void fallback;
      setAiStatus(isBn ? "অফলাইন ফলব্যাক ব্যবহার করা হলো" : "Offline fallback used");
      toast(isBn ? "অফলাইন মোডে স্ক্রিপ্ট বানানো হলো" : "Offline script generated");
      console.warn(e);
    } finally {
      setIsGenerating(false);
    }
  }, [topic, lang, shortsMode, isBn, toast]);

  const handleChip = (t: string) => {
    setTopic(t);
    // auto trigger after tiny delay
    setTimeout(() => {
      const el = document.getElementById("aiTopic") as HTMLInputElement | null;
      if (el) el.focus();
    }, 50);
  };

  const handleTtsTest = useCallback(() => {
    if (!("speechSynthesis" in window)) {
      toast(isBn ? "এই ব্রাউজারে TTS নেই" : "TTS not supported");
      return;
    }
    speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(script.split("\n").filter(Boolean)[0]?.slice(0, 120) || (isBn ? "হ্যালো, এটি কাটফ্রি স্টুডিও।" : "Hello, this is CutFree Studio."));
    utter.lang = isBn ? "bn-BD" : "en-US";
    utter.rate = ttsRate;
    const v = voices.find((x) => x.name === ttsVoice);
    if (v) utter.voice = v;
    speechSynthesis.speak(utter);
    toast(isBn ? "ভয়েস টেস্ট চালু" : "Voice test playing");
  }, [script, isBn, ttsRate, ttsVoice, voices, toast]);

  // High-quality export: VP9/Opus, voice mix, SRT + thumbnail (100% free, highest quality)
  const handleExport = useCallback(async () => {
    if (!spec || !canvasRef.current) return;
    const canvas = canvasRef.current;
    // High-quality: VP9/Opus + voice mix
    toast(isBn ? "⚡ রেন্ডার শুরু — সর্বোচ্চ কোয়ালিটি..." : "⚡ Rendering — highest quality...");
    try {
      const fps = spec.fps;
      const canvasStream = (canvas as HTMLCanvasElement).captureStream(fps);
      let mixedStream: MediaStream = canvasStream;
      let voiceAudio: HTMLAudioElement | null = null;
      if (audioUrl) {
        try {
          voiceAudio = new Audio(audioUrl);
          voiceAudio.crossOrigin = "anonymous";
          // @ts-ignore
          if (typeof (voiceAudio as unknown as { captureStream?: () => MediaStream }).captureStream === "function") {
            const aStream = (voiceAudio as unknown as { captureStream: () => MediaStream }).captureStream();
            const aTrack = aStream.getAudioTracks()[0];
            if (aTrack) mixedStream = new MediaStream([...canvasStream.getVideoTracks(), aTrack]);
          } else if (typeof (voiceAudio as unknown as { mozCaptureStream?: () => MediaStream }).mozCaptureStream === "function") {
            const aStream = (voiceAudio as unknown as { mozCaptureStream: () => MediaStream }).mozCaptureStream!();
            const aTrack = aStream.getAudioTracks()[0];
            if (aTrack) mixedStream = new MediaStream([...canvasStream.getVideoTracks(), aTrack]);
          }
        } catch {}
      }
      const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp9", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
      const mime = candidates.find((m) => MediaRecorder.isTypeSupported(m)) || "video/webm";
      const bitrate = spec.width >= 1920 || quality === "1080p" ? 5000000 : spec.width >= 1280 || quality === "720p" ? 2500000 : 1200000;
      const recorder = new MediaRecorder(mixedStream, { mimeType: mime, videoBitsPerSecond: bitrate } as unknown as MediaRecorderOptions);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: mime });
        const ext = mime.includes("mp4") ? "mp4" : "webm";
        const safeTitle = (spec.meta.title.slice(0, 40).replace(/[^\w\-]+/g, "_") || "cutfree").replace(/^_+|_+$/g, "");
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = `${safeTitle}-${spec.width}x${spec.height}.${ext}`; a.click();
        const caps = spec.captions && spec.captions.length ? spec.captions : null;
        if (caps && caps.length) {
          const srt = caps.map((c, i) => {
            const fmt = (s: number) => { const h = Math.floor(s/3600); const m2=Math.floor((s%3600)/60); const s2=Math.floor(s%60); const ms=Math.floor((s%1)*1000); return `${String(h).padStart(2,"0")}:${String(m2).padStart(2,"0")}:${String(s2).padStart(2,"0")},${String(ms).padStart(3,"0")}`; };
            return `${i+1}\n${fmt(c.start)} --> ${fmt(c.end)}\n${c.text}\n`;
          }).join("\n");
          const srtBlob = new Blob([srt], { type: "text/srt" }); const srtUrl=URL.createObjectURL(srtBlob); const srtA=document.createElement("a"); srtA.href=srtUrl; srtA.download=`${safeTitle}.srt`; setTimeout(()=>{srtA.click(); URL.revokeObjectURL(srtUrl);},600);
        }
        try {
          const thumbCanvas=document.createElement("canvas"); thumbCanvas.width=spec.width; thumbCanvas.height=spec.height; const tctx=thumbCanvas.getContext("2d")!;
          const vw=(spec as unknown as { _voiceWords?: {w:string;s:number;e:number;para:number}[] })._voiceWords;
          renderFrame(tctx, spec, Math.min(spec.duration*0.12,1.2), new Map(), bgImage, vw);
          const thumbUrl=thumbCanvas.toDataURL("image/jpeg",0.92); const tA=document.createElement("a"); tA.href=thumbUrl; tA.download=`${safeTitle}-thumb.jpg`; setTimeout(()=>tA.click(),900);
        } catch {}
        URL.revokeObjectURL(url);
        toast(isBn ? `✅ ভিডিও + ${caps ? "SRT" : "থাম্ব"} রেডি!` : `✅ Video + ${caps ? "SRT" : "thumb"} ready!`);
        if (voiceAudio) { voiceAudio.pause(); voiceAudio.src=""; }
      };
      recorder.start(100);
      setCurrentTime(0); setIsPlaying(true);
      if (voiceAudio) { voiceAudio.currentTime=0; voiceAudio.play().catch(()=>{}); }
      setTimeout(()=>{ recorder.stop(); setIsPlaying(false); if(voiceAudio) voiceAudio.pause(); }, spec.duration*1000+500);
    } catch (e) {
      console.error(e);
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a"); a.href=url; a.download="cutfree-frame.png"; a.click();
      toast(isBn ? "ফ্রেম PNG হিসেবে সেভ হলো" : "Frame saved as PNG (fallback)");
    }
  }, [spec, isBn, toast, audioUrl, bgImage, quality]);

  const scenes = spec?.scenes || [];
  const curSceneIndex = useMemo(() => {
    if (!spec) return 0;
    let acc = 0;
    for (let i = 0; i < spec.scenes.length; i++) {
      if (currentTime < acc + spec.scenes[i].dur) return i;
      acc += spec.scenes[i].dur;
    }
    return spec.scenes.length - 1;
  }, [currentTime, spec]);

  const progressPct = duration ? (currentTime / duration) * 100 : 0;

  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  const totalStats = useMemo(() => {
    const words = wordCount(script);
    const estMin = (words / wpm).toFixed(1);
    return { words, estMin, scenes: scenes.length };
  }, [script, wpm, scenes.length]);

  return (
    <div className="min-h-screen bg-[#06080e] text-[#e9eefb] flex flex-col selection:bg-[#7c5cff]/30">
      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#0d1120]/80 border-b border-[#232d47]">
        <div className="mx-auto max-w-[1600px] px-4 md:px-6 h-[56px] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#5b8dff] to-[#b06cff] grid place-items-center font-black text-white shadow-lg shadow-[#5b8dff]/20">
              ⚡
            </div>
            <div className="leading-tight">
              <div className="flex items-center gap-2">
                <span className="font-extrabold tracking-tight text-[15px]">CutFree</span>
                <span className="text-[#5b8dff] font-extrabold text-[15px]">Studio</span>
                <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#1a2440] border border-[#2a365c] text-[#8cb4ff]">
                  v2.4 • Factory
                </span>
              </div>
              <div className="text-[11px] text-[#8d9cc2] hidden sm:block -mt-0.5">
                {isBn ? "ব্রাউজারেই পুরো ভিডিও ফ্যাক্টরি — শূন্য খরচ, শূন্য সার্ভার" : "Full video factory in your browser — zero cost, zero server"}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden lg:flex items-center gap-1.5 text-[11px] bg-[#151b2e] border border-[#232d47] rounded-full px-2.5 py-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[#8d9cc2]">{isBn ? "ডিরেক্টর রেডি" : "Director ready"}</span>
              <span className="w-px h-3 bg-[#232d47] mx-1" />
              <span className="text-white font-semibold">
                {spec ? `${fmtTime(duration)} • ${spec.scenes.length} সিন` : "—"}
              </span>
            </div>
            <a
              href="/studio.html"
              className="hidden md:inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-full bg-[#151b2e] border border-[#2e3a5c] hover:border-[#5b8dff] transition"
            >
              <Film className="w-3.5 h-3.5" /> {isBn ? "ক্লাসিক স্টুডিও" : "Classic Studio"}
            </a>
            <a
              href="/cutfree.html"
              className="hidden md:inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-full bg-[#151b2e] border border-[#2e3a5c] hover:border-[#5b8dff] transition"
            >
              ✂️ {isBn ? "এডিটর" : "Editor"}
            </a>
            <button
              onClick={() => {
                /* single-page: no tab switch */
                handleAutoVideo();
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="hidden md:inline-flex items-center gap-1.5 text-xs font-black px-4 py-2 rounded-full bg-gradient-to-br from-[#5b8dff] to-[#22d3ee] text-white shadow-lg shadow-[#5b8dff]/20 hover:brightness-110 transition"
            >
              <Film className="w-3.5 h-3.5" /> {isBn ? "ভিডিও তৈরি করুন" : "Create Video"}
            </button>
            <button
              onClick={() => setLang((v) => (v === "bn" ? "en" : "bn"))}
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-full bg-white text-[#0d1120] hover:bg-[#e9eefb] transition"
            >
              <Languages className="w-3.5 h-3.5" /> {lang === "bn" ? "বাংলা / EN" : "EN / বাংলা"}
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <div className="flex-1 mx-auto max-w-[1600px] w-full flex flex-col lg:flex-row min-h-0">
        {/* Sidebar */}
        <aside className="w-full lg:w-[380px] xl:w-[400px] lg:shrink-0 bg-[#0d1120] lg:border-r border-[#232d47] flex flex-col lg:h-[calc(100vh-56px)] lg:sticky lg:top-[56px] lg:overflow-hidden">
          {/* Single-page header — no tabs, everything on one page */}
          <div className="px-4 py-3 border-b border-[#232d47] bg-gradient-to-br from-[#0f1124] to-[#1a1540] sticky top-0 z-10">
            <div className="flex items-center gap-2 text-[11px] font-black tracking-widest uppercase text-[#8d9cc2]">
              <Layers3 className="w-3.5 h-3.5 text-[#5b8dff]" /> {isBn ? "এক পেজে সবকিছু — স্ক্রিপ্ট + ভয়েস + ডিজাইন + এক্সপোর্ট" : "All in one page — script + voice + design + export"}
              <span className="ml-auto px-2 py-1 rounded-full bg-[#5b8dff] text-white text-[10px]">SINGLE PAGE</span>
            </div>
            <div className="mt-1 text-[11px] leading-relaxed text-[#a3b4dc]">{isBn ? "আপনি শুধু স্পিচ + ভয়েস + টাইমলাইন দেবেন, বাকি সব এখানেই হবে — নিচে স্ক্রল করুন।" : "You provide speech + voice + timeline, we do the rest — scroll down."}</div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-[#26314e] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full">
            {/* SCRIPT TAB */}
            {/* single-page: script */}
              <>
                {/* AI Box */}
                <div className="rounded-2xl bg-gradient-to-br from-[#16192b] to-[#1a1540] border border-[#3c2a68] p-4 shadow-xl">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-[#c4b5fd] font-extrabold text-[12px] tracking-wide">
                      <Sparkles className="w-4 h-4" /> {isBn ? "স্ক্রিপ্ট জেনারেটর (ঐচ্ছিক)" : "Script generator (optional)"}
                    </div>
                    <span className="text-[10px] font-black px-2 py-1 rounded-full bg-[#241b3d] border border-[#433170] text-[#c4b5fd]">optional</span>
                  </div>

                  <div className="flex gap-2 mb-3">
                    <div className="flex-1 relative">
                      <input
                        id="aiTopic"
                        value={topic}
                        onChange={(e) => setTopic(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleAiGenerate()}
                        placeholder={isBn ? "ভিডিওর বিষয় লিখুন (যেমন: ৫টি অভ্যাস, AI টুলস...)" : "Enter video topic (e.g. 5 habits, AI tools...)"}
                        className="w-full bg-[#0f1124] border border-[#2e1065] focus:border-[#7c5cff] focus:ring-2 focus:ring-[#7c5cff]/20 rounded-xl px-3 py-2.5 text-[13px] placeholder:text-[#6b7bb0] outline-none transition"
                      />
                    </div>
                    <button
                      onClick={handleAiGenerate}
                      disabled={isGenerating}
                      className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-br from-[#7c5cff] to-[#5b8dff] text-white font-extrabold text-[13px] shadow-lg shadow-[#7c5cff]/25 disabled:opacity-60 hover:brightness-110 transition"
                    >
                      {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                      {isGenerating ? (isBn ? "তৈরি হচ্ছে..." : "Generating...") : isBn ? "তৈরি করো" : "Generate"}
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {[
                      { l: "💡 " + (isBn ? "সকালের অভ্যাস" : "Morning habits"), v: "৫টি শক্তিশালী সকালের অভ্যাস" },
                      { l: "🚀 " + (isBn ? "AI ও ক্যারিয়ার" : "AI & Career"), v: "কৃত্রিম বুদ্ধিমত্তা ও ভবিষ্যতের চাকরি" },
                      { l: "💰 " + (isBn ? "অর্থ ব্যবস্থাপনা" : "Money"), v: "টাকা জমানোর সেরা ৩টি কৌশল" },
                      { l: "🌌 " + (isBn ? "মহাকাশ" : "Space"), v: "মহাকাশের রহস্যময় ৫টি ঘটনা" },
                      { l: "⚡ " + (isBn ? "টেক হ্যাকস" : "Tech hacks"), v: "সময় বাঁচানোর ৫টি টেক হ্যাকস" },
                    ].map((c) => (
                      <button
                        key={c.v}
                        onClick={() => handleChip(c.v)}
                        className="px-2.5 py-1.5 rounded-full bg-[#241b3d] border border-[#433170] text-[#c4b5fd] text-[11px] font-semibold hover:bg-[#35255a] hover:border-[#7c5cff] hover:text-white transition"
                      >
                        {c.l}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-start gap-2 text-[11px] leading-relaxed text-[#a3b4dc] bg-[#0f1124]/60 rounded-xl px-3 py-2 border border-[#2e1065]/50">
                    <Zap className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#c4b5fd]" />
                    <span>{aiStatus}</span>
                  </div>
                </div>

                <div className="rounded-2xl bg-gradient-to-br from-[#0f172a] to-[#1a1440] border border-[#2a365c] p-4">
                  <div className="flex items-center gap-2 text-[12px] font-extrabold text-white mb-2">
                    <Cpu className="w-4 h-4 text-[#7c5cff]" /> {isBn ? "অটো ডিরেক্টর" : "Auto Director"}
                    <span className="ml-auto text-[10px] px-2 py-1 rounded-full bg-[#1a2440] border border-[#2a365c] text-[#8cb4ff]">{directorStatus}</span>
                  </div>
                  <div className="text-[11px] leading-relaxed text-[#a3b4dc] mb-2">
                    {isBn ? "স্ক্রিপ্ট + ভয়েস → স্টোরি বিট → সিন → ক্যামেরা → মোশন। ডিটারমিনিস্টিক, অফলাইন।" : "Script + voice → story beats → scenes → camera → motion. Deterministic, offline."}
                  </div>
                  {directorNote && <div className="text-[11px] text-[#8cb4ff] mb-2">{directorNote}</div>}
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={handleAutoVideo} className="py-2.5 rounded-xl bg-gradient-to-br from-[#7c5cff] to-[#5b8dff] text-white font-black text-[12px]">{isBn ? "অটো ভিডিও তৈরি" : "Auto Create Video"}</button>
                    <button onClick={() => { if (voiceSpec) setVoiceSpec(null); setDirectorStatus("ready"); }} className="py-2.5 rounded-xl bg-[#151b2e] border border-[#232d47] text-white font-bold text-[12px]">{isBn ? "ম্যানুয়াল এডিট" : "Manual edit"}</button>
                  </div>
                </div>

                {/* HERO — সবচেয়ে বড় ভিডিও তৈরি বাটন (বাংলা) */}
                <div className="rounded-2xl bg-gradient-to-br from-[#5b8dff] via-[#7c5cff] to-[#22d3ee] p-[1.5px] shadow-xl">
                  <div className="rounded-[15px] bg-gradient-to-br from-[#0f1124] to-[#1a1540] p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#5b8dff] to-[#b06cff] grid place-items-center text-white font-black shadow-lg">▶</span>
                      <div className="leading-tight">
                        <div className="text-[15px] font-black text-white leading-none">{isBn ? "ভিডিও তৈরি করুন — লাইন বাই লাইন" : "Create Video — line by line"}</div>
                        <div className="text-[11px] text-[#a3b4dc]">{isBn ? "প্রতি লাইন = এক সিন • ছবি যোগ করুন • এক ক্লিকে ভিডিও" : "Each line = one scene • add image • one-click video"}</div>
                      </div>
                      <span className="ml-auto hidden sm:flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-500 text-white text-[10px] font-black">100% FREE</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <button onClick={() => bgInputRef.current?.click()} className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#1e2a4a] border border-[#2a365c] text-white font-bold text-[12px] hover:border-[#5b8dff] hover:bg-[#23325a] transition">
                        <ImageIcon className="w-4 h-4" /> {isBn ? "ছবি যোগ করুন" : "Add image"}
                      </button>
                      <button onClick={() => voiceInputRef.current?.click()} className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#1e2a4a] border border-[#2a365c] text-white font-bold text-[12px] hover:border-[#2dd4bf] hover:bg-[#1a3a3a] transition">
                        <FileAudio className="w-4 h-4" /> {isBn ? "ভয়েস যোগ করুন" : "Add voice"}
                      </button>
                    </div>
                    <button onClick={handleAutoVideo} className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-gradient-to-br from-[#5b8dff] to-[#22d3ee] text-white font-black text-[16px] shadow-lg shadow-[#5b8dff]/30 hover:brightness-110 active:scale-[0.99] transition">
                      <Film className="w-6 h-6" /> {isBn ? "▶ ভিডিও তৈরি করুন" : "▶ Create Video"} <ArrowRight className="w-5 h-5" />
                    </button>
                    <div className="mt-2 text-center text-[11px] text-[#8d9cc2]">{isBn ? "স্ক্রিপ্ট লিখুন → ছবি/ভয়েস (ঐচ্ছিক) → তৈরি → এক্সপোর্ট" : "Write script → add image/voice (optional) → create → export"}</div>
                    {(bgImage || voiceFile) && (
                      <div className="mt-2 flex flex-wrap gap-1.5 justify-center">
                        {bgImage && <span className="px-2 py-1 rounded-full bg-emerald-500 text-white text-[10px] font-black flex items-center gap-1"><ImageIcon className="w-3 h-3" /> {bgName.slice(0,18)}</span>}
                        {voiceFile && <span className="px-2 py-1 rounded-full bg-[#2dd4bf] text-[#021018] text-[10px] font-black flex items-center gap-1"><FileAudio className="w-3 h-3" /> {voiceName.slice(0,18)}</span>}
                      </div>
                    )}
                  </div>
                </div>

                {/* Line-by-line builder — প্রতিটি লাইন আলাদা কার্ড */}
                <div className="rounded-2xl bg-[#0f1124] border border-[#232d47] p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[11px] font-extrabold tracking-widest uppercase text-[#8d9cc2] flex items-center gap-1.5"><Type className="w-3.5 h-3.5" /> {isBn ? "লাইন বাই লাইন এডিটর" : "Line-by-line editor"} • {script.split("\n").filter(s=>s.trim()).length} {isBn ? "লাইন" : "lines"}</div>
                    <button onClick={() => setScript(s => s + "\nনতুন লাইন এখানে লিখুন")} className="px-3 py-1.5 rounded-full bg-[#5b8dff] text-white text-[11px] font-black hover:brightness-110 active:scale-95 transition">+ {isBn ? "লাইন যোগ" : "Add line"}</button>
                  </div>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-[#2a365c]">
                    {script.split("\n").map((line, idx) => (
                      <div key={idx} className="flex gap-2 items-start p-2 rounded-xl bg-[#151b2e] border border-[#232d47] group focus-within:border-[#5b8dff]/50 transition">
                        <span className="w-7 h-7 rounded-lg bg-[#1a2440] border border-[#2a365c] grid place-items-center text-[11px] font-black text-[#8cb4ff] shrink-0 mt-0.5">{idx+1}</span>
                        <textarea
                          value={line}
                          onChange={(e) => {
                            const parts = script.split("\n");
                            parts[idx] = e.target.value;
                            setScript(parts.join("\n"));
                          }}
                          rows={1}
                          placeholder={isBn ? `লাইন ${idx+1} — এখানে লিখুন (ফাঁকা লাইন = নতুন সিন)` : `Line ${idx+1} — write here (blank = new scene)`}
                          className="flex-1 min-h-[36px] bg-transparent outline-none text-[13px] leading-relaxed placeholder:text-[#5a6a9a] resize-none py-1"
                        />
                        <button
                          onClick={() => {
                            const parts = script.split("\n");
                            parts.splice(idx, 1);
                            setScript(parts.join("\n") || " ");
                          }}
                          className="w-7 h-7 rounded-lg bg-[#1a233e] border border-[#2a365c] grid place-items-center text-[#8d9cc2] hover:border-[#ef4444] hover:text-[#fecaca] transition shrink-0"
                          title="Delete"
                        >×</button>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button onClick={() => bgInputRef.current?.click()} className={`py-2.5 rounded-xl border font-bold text-[12px] flex items-center justify-center gap-1.5 transition ${bgImage ? "bg-emerald-500 border-emerald-500 text-white" : "bg-[#151b2e] border-[#232d47] text-white hover:border-[#5b8dff]"}`}>
                      <ImageIcon className="w-4 h-4" /> {bgImage ? (isBn ? `ছবি: ${bgName.slice(0,12)}` : `Image: ${bgName.slice(0,12)}`) : isBn ? "ব্যাকগ্রাউন্ড ছবি" : "Background image"}
                    </button>
                    <button onClick={handleAutoVideo} className="py-2.5 rounded-xl bg-gradient-to-br from-[#5b8dff] to-[#22d3ee] text-white font-black text-[12px] flex items-center justify-center gap-1.5 hover:brightness-110 transition">
                      <Film className="w-4 h-4" /> {isBn ? "প্রিভিউ আপডেট" : "Update preview"}
                    </button>
                  </div>
                  <div className="mt-2 text-[11px] leading-relaxed text-[#6b7bb0] bg-[#0b0f1e] rounded-xl px-3 py-2 border border-[#232d47]">
                    {isBn ? '💡 টিপস: প্রতি লাইন = এক সিন। ফাঁকা লাইন দিয়ে সিন ভাগ করুন। - দিয়ে বুলেট, ৯৫% দিয়ে স্ট্যাট, "উক্তি" — নাম দিয়ে কোট। ছবি দিলে সব সিনে কভার + থিম ওভারলে হবে।' : '💡 Tip: each line = scene. Blank line splits scenes. - for bullets, 95% for stat, "quote" — name for quote. Image becomes cover + theme wash.'}
                  </div>
                </div>

                {/* Template quick actions */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "demo", label: isBn ? "ডেমো" : "Demo", icon: MonitorPlay, action: () => setScript(DEMO_SCRIPT_BN) },
                    { id: "shorts", label: "Shorts", icon: Smartphone, action: () => setScript(SHORTS_SCRIPT) },
                    { id: "edu", label: isBn ? "শিক্ষা" : "Education", icon: SquareStack, action: () => setScript(EDU_SCRIPT) },
                  ].map((b) => (
                    <button
                      key={b.id}
                      onClick={b.action}
                      className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-[#151b2e] border border-[#232d47] hover:border-[#5b8dff] hover:bg-[#1d2642] transition group"
                    >
                      <b.icon className="w-5 h-5 text-[#8d9cc2] group-hover:text-white" />
                      <span className="text-[11px] font-bold text-[#cbd5e1]">{b.label}</span>
                    </button>
                  ))}
                </div>

                <div>
                  <label className="flex items-center justify-between text-[11px] font-extrabold tracking-widest text-[#8d9cc2] uppercase mb-2">
                    <span className="flex items-center gap-1.5">
                      <Type className="w-3.5 h-3.5" /> {isBn ? "স্ক্রিপ্ট" : "Script"}
                    </span>
                    <span className="normal-case tracking-normal font-semibold text-[#5b8dff] bg-[#1a2440] px-2 py-1 rounded-full border border-[#2a365c] text-[10px]">
                      {totalStats.words} শব্দ • {totalStats.scenes} সিন • ~{totalStats.estMin} মিনিট
                    </span>
                  </label>
                  <textarea
                    value={script}
                    onChange={(e) => setScript(e.target.value)}
                    spellCheck={false}
                    placeholder={
                      isBn
                        ? "প্রথম লাইন = টাইটেল\n\nপ্রতিটি প্যারাগ্রাফ = একটি সিন\n- বুলেট লাইন\n৯৫% পরিসংখ্যান\n\"উক্তি\" — লেখক\n--- দিয়ে আলাদা ভিডিও"
                        : "First line = Title\n\nEach paragraph = scene\n- bullet line\n95% stat\n\"Quote\" — Author\n--- for next video"
                    }
                    className="w-full min-h-[280px] bg-[#151b2e] border border-[#232d47] focus:border-[#5b8dff] focus:ring-2 focus:ring-[#5b8dff]/15 rounded-xl p-3 text-[13px] leading-relaxed placeholder:text-[#5a6a9a] outline-none resize-y"
                  />
                  <div className="mt-2 text-[11px] leading-relaxed text-[#6b7bb0] bg-[#0f1124] border border-[#232d47] rounded-xl px-3 py-2">
                    <span className="font-bold text-[#8d9cc2]">{isBn ? "নিয়ম:" : "Rules:"}</span>{" "}
                    {isBn ? (
                      <>
                        ফাঁকা লাইন = নতুন সিন • প্রথম লাইন = টাইটেল • <code className="bg-[#1a2440] px-1 py-0.5 rounded text-[#cbd5e1]">- লাইন</code> = বুলেট •{" "}
                        <code className="bg-[#1a2440] px-1 py-0.5 rounded text-[#cbd5e1]">৯৫%</code> = স্ট্যাট •{" "}
                        <code className="bg-[#1a2440] px-1 py-0.5 rounded text-[#cbd5e1]">"উক্তি" — নাম</code> = কোট
                      </>
                    ) : (
                      <>
                        Blank line = new scene • First line = title • <code className="bg-[#1a2440] px-1 py-0.5 rounded">- line</code> = bullet •{" "}
                        <code className="bg-[#1a2440] px-1 py-0.5 rounded">95%</code> = stat • <code className="bg-[#1a2440] px-1 py-0.5 rounded">"Quote" — Name</code> = quote
                      </>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-extrabold tracking-widest uppercase text-[#8d9cc2] flex items-center gap-1.5">
                      <Timer className="w-3.5 h-3.5" /> {isBn ? "ন্যারেশন গতি" : "Narration speed"} • {wpm}{" "}
                      {isBn ? "শব্দ/মিনিট" : "wpm"}
                    </label>
                    <span className="text-[11px] font-bold text-[#5b8dff]">{Math.round((wordCount(script) / wpm) * 60)}s</span>
                  </div>
                  <input
                    type="range"
                    min={90}
                    max={220}
                    value={wpm}
                    onChange={(e) => setWpm(parseInt(e.target.value))}
                    className="w-full accent-[#5b8dff] h-2"
                  />
                  <div className="flex items-center justify-between text-[11px] text-[#6b7bb0]">
                    <span>{isBn ? "ধীর" : "Slow"}</span>
                    <span>{isBn ? "স্বাভাবিক" : "Natural"}</span>
                    <span>{isBn ? "দ্রুত" : "Fast"}</span>
                  </div>
                </div>

                {/* Auto video — one click, zero cost */}
                <div className="rounded-2xl bg-gradient-to-br from-[#0b1220] via-[#0f1f3a] to-[#0b1a28] border border-[#1e3a5e] p-3">
                  <div className="flex items-center gap-2 mb-2.5 text-[11px] font-extrabold tracking-widest uppercase text-[#8d9cc2]">
                    <Cpu className="w-3.5 h-3.5 text-[#22d3ee]" /> {isBn ? "অটো ভিডিও — ওয়ান ক্লিক" : "Auto video — one click"}
                    {voiceSpec && <span className="ml-auto px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-black">VOICE-SYNCED</span>}
                    {!voiceSpec && vadResult?.usable && <span className="ml-auto px-2 py-0.5 rounded-full bg-[#2dd4bf] text-[#021018] text-[10px] font-black">VAD READY</span>}
                  </div>
                  <button
                    onClick={handleAutoVideo}
                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-br from-[#5b8dff] via-[#7c5cff] to-[#22d3ee] text-white font-black text-[13px] shadow-xl shadow-[#5b8dff]/25 hover:brightness-110 transition"
                  >
                    <Film className="w-5 h-5" /> {voiceSpec ? (isBn ? "🎬 ভয়েস-সিঙ্কড প্রিভিউ" : "🎬 Voice-synced preview") : isBn ? "🎬 অটো ভিডিও বানাও" : "🎬 Build auto video"} <ArrowRight className="w-4 h-4" />
                  </button>
                  <div className="grid grid-cols-2 gap-2 mt-2.5">
                    <button
                      onClick={() => {
                        const base = builtSpec;
                        if (base) {
                          if (voiceSpec) setVoiceSpec(null);
                          setCurrentTime(0);
                          toast(isBn ? "প্ল্যান রিফ্রেশ — ভয়েস ছাড়া" : "Plan refreshed — without voice");
                        }
                      }}
                      className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#151b2e] border border-[#232d47] text-white font-bold text-[12px] hover:border-[#5b8dff] transition"
                    >
                      <RotateCcw className="w-4 h-4" /> {isBn ? "রিসেট (VAD ছাড়া)" : "Reset (no VAD)"}
                    </button>
                    <button
                      onClick={() => /* single-page */ (document.getElementById("export-section")?.scrollIntoView({behavior:"smooth"}))}
                      className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#0f172a] border border-[#1e3a5e] text-[#22d3ee] font-bold text-[12px] hover:bg-[#1e293b] transition"
                    >
                      <Download className="w-4 h-4" /> {isBn ? "এক্সপোর্ট" : "Export"}
                    </button>
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-1.5 text-[10px] font-bold">
                    <span className="px-2 py-1 rounded-full bg-[#1a2440] border border-[#2a365c] text-[#8cb4ff] flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" /> {isBn ? "১০০% ফ্রি" : "100% free"}
                    </span>
                    <span className="px-2 py-1 rounded-full bg-[#1a2440] border border-[#2a365c] text-[#8cb4ff] flex items-center gap-1">
                      <Youtube className="w-3 h-3" /> {isBn ? "YouTube রেডি" : "YouTube ready"}
                    </span>
                    <span className="px-2 py-1 rounded-full bg-[#1a2440] border border-[#2a365c] text-[#8cb4ff] flex items-center gap-1">
                      <Captions className="w-3 h-3" /> {isBn ? "অটো ক্যাপশন" : "Auto captions"}
                    </span>
                  </div>
                  <div className="mt-2 text-[11px] leading-relaxed text-[#6b7bb0]">
                    {voiceSpec
                      ? isBn
                        ? `✅ ${vadResult?.phrases.length || 0} VAD স্লটে সিঙ্কড — টেক্সট ভয়েসের সাথে ফুটবে। Export এ WebM (VP9/Opus) + SRT।`
                        : `✅ Synced to ${vadResult?.phrases.length || 0} VAD slots — text pops with voice. Export is WebM (VP9/Opus) + SRT.`
                      : isBn
                        ? "স্ক্রিপ্ট একাই ভিডিও বানাবে — ভয়েস দিলে শব্দ-স্তরে সিঙ্ক হবে।"
                        : "Script alone builds video — add voice for word-level sync."}
                  </div>
                </div>
              </>

            {/* single-page: design */}
              <div className="space-y-5">
                <div className="rounded-xl bg-gradient-to-br from-[#0f1124] to-[#15152b] border border-[#232d47] p-3">
                  <div className="text-[11px] font-extrabold tracking-widest uppercase text-[#8d9cc2] mb-3 flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5" /> {isBn ? "ভিজ্যুয়াল ডিজাইন" : "Visual Design"}
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="text-[11px] font-bold text-[#8d9cc2] uppercase tracking-wide mb-1.5 block">
                        {isBn ? "থিম (১৩টি)" : "Theme (13)"}
                      </label>
                      <div className="grid grid-cols-2 gap-2 max-h-[220px] overflow-y-auto pr-1">
                        {(Object.keys(THEMES) as ThemeKey[]).map((k) => {
                          const th = THEMES[k];
                          const active = theme === k;
                          return (
                            <button
                              key={k}
                              onClick={() => setTheme(k)}
                              className={`relative text-left p-2.5 rounded-xl border-2 transition overflow-hidden ${active ? "border-[#5b8dff] shadow-lg" : "border-[#232d47] hover:border-[#334155] bg-[#151b2e]"}`}
                              style={{ background: active ? `linear-gradient(135deg, ${th.bg}, #1a1f3a)` : undefined }}
                            >
                              <div className="flex items-center gap-2 mb-1.5">
                                <span className="w-6 h-6 rounded-full border-2 border-white/20 shadow-inner" style={{ background: `linear-gradient(135deg, ${th.blobs[0]}, ${th.blobs[1]})` }} />
                                <span className="text-[11px] font-extrabold truncate text-white">{isBn ? th.name.bn : th.name.en}</span>
                              </div>
                              <div className="flex gap-1">
                                {th.blobs.slice(0, 3).map((c) => (
                                  <span key={c} className="w-3 h-3 rounded-full border border-white/10" style={{ background: c }} />
                                ))}
                              </div>
                              {active && (
                                <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[#5b8dff] grid place-items-center">
                                  <Check className="w-3 h-3 text-white" />
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-[#8d9cc2] uppercase tracking-wide mb-1.5 block">
                        {isBn ? "মুড / মিউজিক" : "Mood / Music"}
                      </label>
                      <div className="grid grid-cols-3 gap-1.5">
                        {(Object.keys(MOODS) as MoodKey[]).map((m) => (
                          <button
                            key={m}
                            onClick={() => setMood(m)}
                            className={`px-2 py-2 rounded-xl text-[11px] font-bold border transition text-center leading-tight ${
                              mood === m ? "bg-[#5b8dff] text-white border-[#5b8dff]" : "bg-[#151b2e] text-[#8d9cc2] border-[#232d47] hover:text-white"
                            }`}
                          >
                            <div>{isBn ? MOODS[m].bn : MOODS[m].en}</div>
                            <div className="text-[10px] opacity-70">{MOODS[m].bpm} BPM</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-bold text-[#8d9cc2] uppercase tracking-wide mb-1.5 block flex items-center gap-1">
                          <Monitor className="w-3 h-3" /> {isBn ? "ফরম্যাট" : "Aspect"}
                        </label>
                        <select
                          value={shortsMode ? "9:16" : aspect}
                          onChange={(e) => {
                            const v = e.target.value as Aspect;
                            if (v === "9:16") setShortsMode(true);
                            else {
                              setShortsMode(false);
                              setAspect(v);
                            }
                          }}
                          className="w-full bg-[#151b2e] border border-[#232d47] rounded-xl px-3 py-2.5 text-[13px] outline-none focus:border-[#5b8dff]"
                        >
                          <option value="16:9">16:9 — YouTube</option>
                          <option value="9:16">9:16 — Shorts / Reels</option>
                          <option value="1:1">1:1 — Square</option>
                          <option value="4:5">4:5 — Portrait</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-[#8d9cc2] uppercase tracking-wide mb-1.5 block">
                          {isBn ? "কোয়ালিটি" : "Quality"}
                        </label>
                        <select
                          value={quality}
                          onChange={(e) => setQuality(e.target.value as Quality)}
                          className="w-full bg-[#151b2e] border border-[#232d47] rounded-xl px-3 py-2.5 text-[13px] outline-none focus:border-[#5b8dff]"
                        >
                          <option value="480p">480p — Fast</option>
                          <option value="720p">720p — Balanced</option>
                          <option value="1080p">1080p — Full HD</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-bold text-[#8d9cc2] uppercase tracking-wide mb-1.5 block">
                          {isBn ? "পারফরম্যান্স" : "Performance"}
                        </label>
                        <select
                          value={perf}
                          onChange={(e) => setPerf(e.target.value as Perf)}
                          className="w-full bg-[#151b2e] border border-[#232d47] rounded-xl px-3 py-2.5 text-[13px] outline-none focus:border-[#5b8dff]"
                        >
                          <option value="high">High — Desktop</option>
                          <option value="balanced">Balanced — Tablet</option>
                          <option value="fast">Fast — Mobile</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-[#8d9cc2] uppercase tracking-wide mb-1.5 block">
                          {isBn ? "ওয়াটারমার্ক" : "Watermark"}
                        </label>
                        <input
                          value={watermark}
                          onChange={(e) => setWatermark(e.target.value)}
                          placeholder={isBn ? "ঐচ্ছিক" : "Optional"}
                          className="w-full bg-[#151b2e] border border-[#232d47] rounded-xl px-3 py-2.5 text-[13px] outline-none focus:border-[#5b8dff] placeholder:text-[#5a6a9a]"
                        />
                      </div>
                    </div>

                    <label className="flex items-center gap-2.5 p-3 rounded-xl bg-[#151b2e] border border-[#232d47] cursor-pointer hover:border-[#5b8dff]/50 transition">
                      <input
                        type="checkbox"
                        checked={shortsMode}
                        onChange={(e) => setShortsMode(e.target.checked)}
                        className="w-4 h-4 accent-[#5b8dff]"
                      />
                      <div className="flex-1">
                        <div className="text-[13px] font-bold text-white flex items-center gap-1.5">
                          <Smartphone className="w-3.5 h-3.5" /> {isBn ? "Shorts মোড (৯:১৬, ≤৫৮s)" : "Shorts Mode (9:16, ≤58s)"}
                        </div>
                        <div className="text-[11px] text-[#8d9cc2]">{isBn ? "সেফ-জোন + কারাওকে + #Shorts" : "Safe zone + karaoke + #Shorts"}</div>
                      </div>
                    </label>

                    {/* Background image — free, local, overlay for text */}
                    <div className="rounded-xl bg-[#0f1124] border border-[#232d47] p-3">
                      <div className="text-[11px] font-extrabold tracking-widest uppercase text-[#8d9cc2] mb-2 flex items-center gap-1.5">
                        <ImageIcon className="w-3.5 h-3.5" /> {isBn ? "ব্যাকগ্রাউন্ড ছবি (ঐচ্ছিক)" : "Background image (optional)"}
                        {bgImage && <span className="ml-auto px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-black">ON</span>}
                      </div>
                      <input ref={bgInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleBgSelect(e.target.files?.[0] || null)} />
                      {!bgImage ? (
                        <button
                          onClick={() => bgInputRef.current?.click()}
                          className="w-full flex flex-col items-center gap-2 py-5 rounded-xl border-2 border-dashed border-[#2a365c] bg-[#151b2e] hover:border-[#5b8dff] hover:bg-[#1d2642] transition group"
                        >
                          <span className="w-10 h-10 rounded-xl bg-[#1e2a4a] border border-[#2a365c] grid place-items-center group-hover:border-[#5b8dff]/50 transition">
                            <Upload className="w-5 h-5 text-[#8d9cc2] group-hover:text-white" />
                          </span>
                          <span className="text-[13px] font-bold text-white">{isBn ? "ছবি বাছাই করুন" : "Choose image"}</span>
                          <span className="text-[11px] text-[#8d9cc2]">JPG / PNG / WebP • {isBn ? "কভার + থিম ওভারলে" : "cover + theme overlay"}</span>
                        </button>
                      ) : (
                        <div className="space-y-2">
                          <div className="relative rounded-xl overflow-hidden border border-[#2a365c] bg-black">
                            <img src={bgImage.src} alt="bg" className="w-full h-[140px] object-cover" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                            <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                              <span className="text-[11px] font-bold text-white truncate bg-black/50 backdrop-blur px-2 py-1 rounded-full border border-white/20 max-w-[150px]">{bgName}</span>
                              <span className="text-[10px] font-black px-2 py-1 rounded-full bg-[#5b8dff] text-white">COVER</span>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <button onClick={() => bgInputRef.current?.click()} className="py-2.5 rounded-xl bg-white text-[#0d1120] font-bold text-[12px] flex items-center justify-center gap-1.5 hover:bg-[#e9eefb] transition">
                              <ImageIcon className="w-4 h-4" /> {isBn ? "বদলান" : "Change"}
                            </button>
                            <button onClick={clearBg} className="py-2.5 rounded-xl bg-[#1a233e] border border-[#2a365c] text-white font-bold text-[12px] hover:border-[#ef4444] hover:text-[#fecaca] transition">
                              {isBn ? "সরান" : "Remove"}
                            </button>
                          </div>
                          <div className="text-[11px] leading-relaxed text-[#6b7bb0] bg-[#151b2e] rounded-xl px-3 py-2 border border-[#232d47]">
                            {isBn ? "টেক্সট যাতে পড়া যায় তাই গ্রেডিয়েন্ট + থিম wash অটো প্রয়োগ হবে।" : "Gradient + theme wash auto-applied for text legibility."}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl bg-[#0f1124] border border-[#232d47] p-3">
                  <div className="text-[11px] font-extrabold tracking-widest uppercase text-[#8d9cc2] mb-2 flex items-center gap-1.5">
                    <Settings2 className="w-3.5 h-3.5" /> {isBn ? "প্রিভিউ" : "Preview"} • {spec?.width}×{spec?.height}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-[#151b2e] rounded-xl p-2.5 border border-[#232d47]">
                      <div className="text-[11px] text-[#8d9cc2] uppercase tracking-wide font-bold">FPS</div>
                      <div className="text-[16px] font-black text-white">{spec?.fps || 30}</div>
                    </div>
                    <div className="bg-[#151b2e] rounded-xl p-2.5 border border-[#232d47]">
                      <div className="text-[11px] text-[#8d9cc2] uppercase tracking-wide font-bold">{isBn ? "সময়" : "Duration"}</div>
                      <div className="text-[16px] font-black text-white">{fmtTime(duration)}</div>
                    </div>
                    <div className="bg-[#151b2e] rounded-xl p-2.5 border border-[#232d47]">
                      <div className="text-[11px] text-[#8d9cc2] uppercase tracking-wide font-bold">{isBn ? "বিটরেট" : "Bitrate"}</div>
                      <div className="text-[16px] font-black text-white">2.5M</div>
                    </div>
                  </div>
                </div>
              </div>

            {/* single-page: audio */}
              <div className="space-y-4">
                {/* Voice-tracked kinetic typography — free VAD */}
                <div className="rounded-2xl bg-gradient-to-br from-[#0f172a] via-[#1a1440] to-[#0f1f2e] border border-[#2a365c] p-4 shadow-xl">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-[12px] font-extrabold tracking-wide text-white flex items-center gap-2">
                      <Waves className="w-4 h-4 text-[#2dd4bf]" /> {isBn ? "ভয়েস-ট্র্যাকড টেক্সট — ১০০% ফ্রি" : "Voice-tracked text — 100% free"}
                    </div>
                    {voiceSpec ? <span className="text-[10px] font-black px-2 py-1 rounded-full bg-emerald-500 text-white">SYNCED ✓</span> : vadResult?.usable ? <span className="text-[10px] font-black px-2 py-1 rounded-full bg-[#2dd4bf] text-[#06111a]">VAD ✓</span> : null}
                  </div>
                  <div className="text-[11px] leading-relaxed text-[#a3b4dc] mb-3 bg-[#0f1124]/60 rounded-xl px-3 py-2 border border-[#2a365c]/60">
                    {isBn ? "আপনার ভয়েস ফাইল + স্ক্রিপ্ট দিলে প্রতিটি শব্দ ঠিক যখন বলবেন তখনই পর্দায় ফুটবে — কোনো সার্ভার নেই, সব ব্রাউজারেই।" : "Drop voice file + script — each word reveals exactly when you speak it. Zero server, 100% in browser."}
                  </div>
                  <input ref={voiceInputRef} type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm,.aac,.flac" className="hidden" onChange={(e) => handleVoiceSelect(e.target.files?.[0] || null)} />
                  {!voiceFile ? (
                    <button
                      onClick={() => voiceInputRef.current?.click()}
                      className="w-full flex flex-col items-center gap-2 py-6 rounded-xl border-2 border-dashed border-[#2a365c] bg-[#0f1124] hover:border-[#2dd4bf] hover:bg-[#102a2a] transition group"
                    >
                      <span className="w-12 h-12 rounded-2xl bg-[#1a3340] border border-[#2a5a5a] grid place-items-center group-hover:border-[#2dd4bf]/50 transition">
                        <FileAudio className="w-6 h-6 text-[#5eead4] group-hover:text-white" />
                      </span>
                      <span className="text-[13px] font-black text-white flex items-center gap-1.5">
                        {isTracking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} {isBn ? "ভয়েস ফাইল বাছাই করুন" : "Choose voice file"}
                      </span>
                      <span className="text-[11px] text-[#8d9cc2]">MP3 / WAV / M4A / OGG • {isBn ? "VAD অটো-ট্র্যাক" : "VAD auto-track"}</span>
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[#0f1124] border border-[#2a365c]">
                        <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#2dd4bf] to-[#0ea5e9] grid place-items-center text-white shrink-0">
                          <FileAudio className="w-5 h-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[12px] font-bold text-white truncate">{voiceName}</div>
                          <div className="text-[11px] text-[#8d9cc2]">{vadResult ? `${vadResult.phrases.length} slots • ${vadResult.speechTime.toFixed(1)}s speech` : isTracking ? (isBn ? "VAD চলছে..." : "VAD running...") : ""}</div>
                        </div>
                        <button onClick={clearVoice} className="px-3 py-1.5 rounded-full bg-[#1e2a4a] border border-[#2a365c] text-[#cbd5e1] text-[11px] font-bold hover:border-[#ef4444] hover:text-[#fecaca] transition">
                          {isBn ? "সরান" : "Remove"}
                        </button>
                      </div>
                      {/* waveform */}
                      <div className="rounded-xl overflow-hidden border border-[#1e3a5e] bg-[#020610]">
                        <canvas ref={waveformRef} className="w-full block" />
                        <div className="flex items-center gap-1.5 px-2 py-1.5 bg-[#0b1220] border-t border-[#1e3a5e] text-[10px] font-bold text-[#8d9cc2]">
                          <Waves className="w-3 h-3 text-[#2dd4bf]" /> {isBn ? "স্পিচ স্লট (টিল = থ্রেশহোল্ড)" : "Speech slots (teal), threshold dashed"} • {vadResult?.usable ? <span className="text-emerald-400">{isBn ? "ব্যবহারযোগ্য" : "usable"}</span> : <span className="text-amber-400">{isBn ? "চেক করুন" : "check"}</span>}
                        </div>
                      </div>
                      {audioUrl && <audio ref={audioRef} src={audioUrl} controls className="w-full h-9 rounded-xl" />}
                      {voiceError && <div className="rounded-xl bg-[#450a0a] border border-[#7f1d1d] text-[#fecaca] px-3 py-2.5 text-[11px] leading-relaxed">{voiceError}</div>}
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => voiceInputRef.current?.click()} className="py-2.5 rounded-xl bg-[#1e2a4a] border border-[#2a365c] text-white font-bold text-[12px] flex items-center justify-center gap-1.5 hover:border-[#2dd4bf] transition">
                          <Upload className="w-4 h-4" /> {isBn ? "অন্য ফাইল" : "Change"}
                        </button>
                        <button
                          onClick={applyVoiceSync}
                          disabled={!vadResult?.usable}
                          className="py-2.5 rounded-xl bg-gradient-to-br from-[#2dd4bf] to-[#0ea5e9] text-[#021018] font-black text-[12px] flex items-center justify-center gap-1.5 shadow-lg shadow-[#2dd4bf]/20 disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110 transition"
                        >
                          <Highlighter className="w-4 h-4" /> {isBn ? "সিঙ্ক প্রয়োগ" : "Apply sync"}
                        </button>
                      </div>
                      <div className="rounded-xl bg-[#2dd4bf]/10 border border-[#2dd4bf]/25 px-3 py-2.5 text-[11px] leading-relaxed text-[#99f6e4]">
                        <span className="font-black">✨ {isBn ? "কী হয়?" : "What happens?"}</span> {isBn ? "প্রতিটি প্যারাগ্রাফ নিজস্ব সিন পাবে, শব্দগুলো VAD স্লটে ওজন অনুযায়ী সিঙ্ক হবে — বাংলা মাত্রা-সচেতন।" : "Each paragraph gets its own scene, words sync weight-wise into VAD slots — Bengali matra-aware."}
                      </div>
                    </div>
                  )}
                </div>

                {/* Timeline JSON — user provides word timings (you said you will provide) */}
                <div className="rounded-2xl bg-gradient-to-br from-[#0f1420] via-[#1a1525] to-[#0f1a20] border border-[#2a365c] p-4 shadow-xl">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[12px] font-extrabold text-white flex items-center gap-2"><FileAudio className="w-4 h-4 text-[#fbbf24]" /> {isBn ? "টাইমলাইন JSON (আপনি দেবেন)" : "Timeline JSON (you provide)"}</div>
                    {(customTimeline || customSegments) && <span className="text-[10px] font-black px-2 py-1 rounded-full bg-[#fbbf24] text-[#1a1300]">{customSegments ? `${customSegments.length} SEGS` : `${customTimeline?.length} WORDS`}</span>}
                  </div>
                  <div className="text-[11px] leading-relaxed text-[#a3b4dc] mb-3 bg-[#0f1124]/60 rounded-xl px-3 py-2 border border-[#2a365c]/60">
                    {isBn ? "আপনার [{time,text}] ফরম্যাট সরাসরি চলবে — যেমন {time:0.0, text:\"বন্ধ দরজার ওপাশে কী ছিল?\"} — আমরা মিলিসেকেন্ডে সিঙ্ক করব। [{w,s,e,para}] ও চলবে।" : "Your [{time,text}] format works directly — e.g. {time:0.0, text:\"...\"} — we sync millisecond-accurate. [{w,s,e,para}] also works."}
                  </div>
                  <input ref={timelineInputRef} type="file" accept=".json,application/json" className="hidden" onChange={(e)=>handleTimelineSelect(e.target.files?.[0]||null)} />
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={()=>timelineInputRef.current?.click()} className="flex flex-col items-center gap-1.5 py-4 rounded-xl border-2 border-dashed border-[#2a365c] bg-[#0f1124] hover:border-[#fbbf24] hover:bg-[#1a180f] transition group">
                      <Upload className="w-5 h-5 text-[#fbbf24] group-hover:text-white" />
                      <span className="text-[12px] font-black text-white">{timelineFileName ? timelineFileName.slice(0,22) : (isBn ? "টাইমলাইন JSON বাছাই" : "Choose timeline JSON")}</span>
                      <span className="text-[10px] text-[#8d9cc2]">JSON • time/text বা w/s/e</span>
                    </button>
                    <div className="flex flex-col gap-2">
                      <button onClick={applyTimelineSync} disabled={!customTimeline && !customSegments} className="flex-1 py-2.5 rounded-xl bg-gradient-to-br from-[#fbbf24] to-[#f59e0b] text-[#1a1300] font-black text-[12px] flex items-center justify-center gap-1.5 disabled:opacity-50 hover:brightness-110 transition">
                        <Highlighter className="w-4 h-4" /> {isBn ? "টাইমলাইন প্রয়োগ" : "Apply timeline"}
                      </button>
                      <button onClick={clearTimeline} className="py-2 rounded-xl bg-[#1a233e] border border-[#2a365c] text-white font-bold text-[11px] hover:border-[#ef4444] transition">{isBn ? "সরান" : "Clear"}</button>
                      <div className="text-[10px] text-[#6b7bb0] leading-tight">{isBn ? "ফরম্যাট: [{\"time\":0.0, \"text\":\"বিসমিল্লাহ...\"}] ✓" : "Format: [{\"time\":0.0, \"text\":\"hello\"}] ✓"}</div>
                    </div>
                  </div>
                  {customTimeline && (
                    <div className="mt-3 rounded-xl bg-[#1a1505] border border-[#fbbf24]/20 p-2 max-h-[120px] overflow-y-auto">
                      <div className="text-[10px] font-bold text-[#fbbf24] mb-1">Preview (first 12 words)</div>
                      <div className="flex flex-wrap gap-1">
                        {customTimeline.slice(0,12).map((w,i)=>(<span key={i} className="px-1.5 py-0.5 rounded bg-[#2a1f0a] border border-[#fbbf24]/20 text-[10px] text-[#fde68a]">{w.w} {w.s.toFixed(2)}→{w.e.toFixed(2)}</span>))}
                        {customTimeline.length>12 && <span className="text-[10px] text-[#8d9cc2]">+{customTimeline.length-12} more</span>}
                      </div>
                    </div>
                  )}
                  {customSegments && (
                    <div className="mt-3 rounded-xl bg-[#1a1505] border border-[#fbbf24]/20 p-2 max-h-[140px] overflow-y-auto">
                      <div className="text-[10px] font-bold text-[#fbbf24] mb-1">Preview — {customSegments.length} segments (first 8)</div>
                      <div className="flex flex-col gap-1">
                        {customSegments.slice(0,8).map((s,i)=>(<span key={i} className="px-2 py-1 rounded bg-[#2a1f0a] border border-[#fbbf24]/20 text-[11px] text-[#fde68a] flex justify-between"><span className="font-mono text-[#fbbf24]">{s.time.toFixed(2)}s</span> <span className="truncate ml-2">{s.text.slice(0,48)}</span></span>))}
                        {customSegments.length>8 && <span className="text-[10px] text-[#8d9cc2]">+{customSegments.length-8} more segments</span>}
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl bg-gradient-to-br from-[#0f172a] to-[#1e1b3a] border border-[#2a365c] p-4">
                  <div className="text-[12px] font-extrabold tracking-wide text-white mb-3 flex items-center gap-2">
                    <Mic2 className="w-4 h-4 text-[#7c5cff]" /> {isBn ? "ভয়েসওভার (TTS) — ব্রাউজারেই" : "Voice-over (TTS) — in browser"}

                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="text-[11px] font-bold text-[#8d9cc2] uppercase tracking-wide mb-1.5 block">
                        {isBn ? "ভয়েস" : "Voice"} • {voices.length} {isBn ? "টি" : "available"}
                      </label>
                      <select
                        value={ttsVoice}
                        onChange={(e) => setTtsVoice(e.target.value)}
                        className="w-full bg-[#151b2e] border border-[#232d47] rounded-xl px-3 py-2.5 text-[12px] outline-none focus:border-[#5b8dff]"
                      >
                        {voices.length === 0 ? (
                          <option>{isBn ? "লোড হচ্ছে..." : "Loading..."}</option>
                        ) : (
                          voices.map((v) => (
                            <option key={v.name} value={v.name}>
                              {v.name} — {v.lang} {v.default ? "• default" : ""}
                            </option>
                          ))
                        )}
                      </select>
                      <div className="text-[11px] text-[#6b7bb0] mt-1">
                        {isBn ? "L: Linux/headless-এ ভয়েস কম থাকে, Windows/macOS/Android-এ বেশি।" : "Linux/headless has fewer voices; Windows/macOS/Android has more."}
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[11px] font-bold text-[#8d9cc2] uppercase tracking-wide">
                          {isBn ? "গতি" : "Rate"} • {ttsRate.toFixed(2)}x
                        </label>
                        <span className="text-[11px] text-[#5b8dff] font-bold">{ttsRate < 1 ? (isBn ? "ধীর" : "Slow") : ttsRate > 1.2 ? (isBn ? "দ্রুত" : "Fast") : isBn ? "স্বাভাবিক" : "Normal"}</span>
                      </div>
                      <input type="range" min={0.6} max={1.6} step={0.05} value={ttsRate} onChange={(e) => setTtsRate(parseFloat(e.target.value))} className="w-full accent-[#7c5cff] h-2" />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={handleTtsTest}
                        className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white text-[#0d1120] font-extrabold text-[13px] hover:bg-[#e9eefb] transition"
                      >
                        <AudioLines className="w-4 h-4" /> {isBn ? "ভয়েস টেস্ট" : "Test voice"}
                      </button>
                      <button
                        onClick={() => {
                          speechSynthesis.cancel();
                          toast(isBn ? "বন্ধ করা হলো" : "Stopped");
                        }}
                        className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#151b2e] border border-[#232d47] text-white font-bold text-[13px] hover:border-[#5b8dff] transition"
                      >
                        <Pause className="w-4 h-4" /> {isBn ? "থামাও" : "Stop"}
                      </button>
                    </div>

                    <div className="rounded-xl bg-[#ffb020]/10 border border-[#ffb020]/30 p-3 text-[11px] leading-relaxed text-[#ffd88a]">
                      <span className="font-extrabold">💡 Pro:</span>{" "}
                      {isBn
                        ? "Chrome/Edge-এ 'এই ট্যাব শেয়ার + tab audio' দিয়ে TTS রেকর্ড করে ভিডিওতে অটো-ডাকিং সহ মিক্স করা যায়। iOS-এ mp3/wav আপলোড করুন।"
                        : "On Chrome/Edge, use 'Share this tab + tab audio' to capture TTS into the video with auto-ducking. On iOS upload mp3/wav."}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl bg-[#0f1124] border border-[#232d47] p-4">
                  <div className="text-[11px] font-extrabold tracking-widest uppercase text-[#8d9cc2] mb-3 flex items-center gap-1.5">
                    <Music4 className="w-3.5 h-3.5" /> {isBn ? "মিউজিক & SFX" : "Music & SFX"}
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {[
                      { k: "uplifting", label: "Uplifting", bpm: 112 },
                      { k: "cinematic", label: "Cinematic", bpm: 84 },
                      { k: "chill", label: "Chill", bpm: 92 },
                      { k: "tech", label: "Tech", bpm: 124 },
                    ].map((m) => (
                      <div
                        key={m.k}
                        className={`p-3 rounded-xl border text-center ${mood === m.k ? "bg-[#7c5cff] border-[#7c5cff] text-white" : "bg-[#151b2e] border-[#232d47] text-[#8d9cc2]"}`}
                      >
                        <div className="text-[12px] font-black">{m.label}</div>
                        <div className="text-[10px] opacity-80">{m.bpm} BPM • {m.k}</div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-[#8d9cc2] bg-[#151b2e] rounded-xl px-3 py-2.5 border border-[#232d47]">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    {isBn ? "প্রসিডিউরাল মিউজিক: প্যাড + বেস + আর্প + ড্রাম — ১০০% কপিরাইট-ফ্রি" : "Procedural music: pad + bass + arp + drums — 100% copyright-free"}
                  </div>
                </div>

                <div className="rounded-xl bg-[#0f1124] border border-[#232d47] p-3">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input type="checkbox" checked={isRecording} onChange={(e) => setIsRecording(e.target.checked)} className="w-4 h-4 accent-[#e11d48]" />
                    <span className="text-[13px] font-bold text-white flex items-center gap-1.5">
                      <span className={`w-2.5 h-2.5 rounded-full ${isRecording ? "bg-[#e11d48] animate-pulse" : "bg-[#475569]"}`} />{" "}
                      {isBn ? "ট্যাব অডিও রেকর্ড (getDisplayMedia)" : "Record tab audio (getDisplayMedia)"}
                    </span>
                  </label>
                  <div className="text-[11px] text-[#6b7bb0] mt-2 leading-relaxed">
                    {isBn
                      ? "ডেস্কটপ Chrome/Edge-এ কাজ করে। রেকর্ড শুরু → TTS চালান → স্টপ → অটো মিক্স।"
                      : "Works on desktop Chrome/Edge. Start record → play TTS → stop → auto-mixed."}
                  </div>
                </div>
              </div>

            {/* single-page: export */}
              <div id="export-section" className="space-y-4">
                <div className="rounded-2xl bg-gradient-to-br from-[#0f172a] to-[#0f1a2e] border border-[#1e3a5e] p-4">
                  <div className="text-[12px] font-extrabold text-white mb-3 flex items-center gap-2">
                    <Video className="w-4 h-4 text-[#22d3ee]" /> {isBn ? "এক্সপোর্ট — ১০০% ব্রাউজারে" : "Export — 100% in browser"}
                  </div>

                  <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                    <div className="bg-[#0b1220] rounded-xl p-3 border border-[#1e3a5e]">
                      <div className="text-[10px] font-bold tracking-widest uppercase text-[#8d9cc2]">Codec</div>
                      <div className="text-[12px] font-black text-white mt-1">VP9 + Opus</div>
                      <div className="text-[10px] text-[#6b7bb0]">WebM</div>
                    </div>
                    <div className="bg-[#0b1220] rounded-xl p-3 border border-[#1e3a5e]">
                      <div className="text-[10px] font-bold tracking-widest uppercase text-[#8d9cc2]">{isBn ? "সময়" : "Duration"}</div>
                      <div className="text-[12px] font-black text-white mt-1">{fmtTime(duration)}</div>
                      <div className="text-[10px] text-[#6b7bb0]">{spec?.fps} fps</div>
                    </div>
                    <div className="bg-[#0b1220] rounded-xl p-3 border border-[#1e3a5e]">
                      <div className="text-[10px] font-bold tracking-widest uppercase text-[#8d9cc2]">{isBn ? "রেজোলিউশন" : "Resolution"}</div>
                      <div className="text-[12px] font-black text-white mt-1">
                        {spec?.width}×{spec?.height}
                      </div>
                      <div className="text-[10px] text-[#6b7bb0]">{quality}</div>
                    </div>
                  </div>

                  <button
                    onClick={handleExport}
                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-br from-[#22d3ee] to-[#0ea5e9] text-[#051018] font-black text-[14px] shadow-lg shadow-[#22d3ee]/20 hover:brightness-110 transition"
                  >
                    <Download className="w-5 h-5" /> {isBn ? "⚡ ফাস্ট রেন্ডার & ডাউনলোড" : "⚡ Fast Render & Download"}
                  </button>

                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <button
                      onClick={() => {
                        if (!spec) return;
                        const data = {
                          title: spec.meta.title,
                          spec,
                          script,
                          exportedAt: new Date().toISOString(),
                        };
                        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `cutfree-${Date.now()}.cutfree.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                        toast(isBn ? "প্রজেক্ট JSON সেভ হলো" : "Project JSON saved");
                      }}
                      className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#151b2e] border border-[#232d47] text-white font-bold text-[12px] hover:border-[#5b8dff] transition"
                    >
                      <SquareStack className="w-4 h-4" /> {isBn ? "প্রজেক্ট সেভ" : "Save project"}
                    </button>
                    <button
                      onClick={() => {
                        const canvas = canvasRef.current;
                        if (!canvas) return;
                        const url = canvas.toDataURL("image/png");
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = "cutfree-thumbnail.png";
                        a.click();
                        toast(isBn ? "থাম্বনেইল PNG সেভ হলো" : "Thumbnail saved");
                      }}
                      className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#151b2e] border border-[#232d47] text-white font-bold text-[12px] hover:border-[#5b8dff] transition"
                    >
                      <Palette className="w-4 h-4" /> {isBn ? "থাম্বনেইল" : "Thumbnail"}
                    </button>
                  </div>

                  <div className="mt-3 rounded-xl bg-[#ffb020]/10 border border-[#ffb020]/20 p-3 text-[11px] leading-relaxed text-[#ffd88a]">
                    {isBn
                      ? "WebCodecs থাকলে GPU-তে সেকেন্ডে রেন্ডার হবে; না থাকলে MediaRecorder ফলব্যাকে রিয়েল-টাইম রেন্ডার (Chrome/Edge = MP4, Firefox = WebM)।"
                      : "GPU render in seconds with WebCodecs; otherwise MediaRecorder fallback renders in real-time (Chrome/Edge = MP4, Firefox = WebM)."}
                  </div>
                </div>

                <div className="rounded-xl bg-[#0f1124] border border-[#232d47] p-4">
                  <div className="text-[11px] font-extrabold tracking-widest uppercase text-[#8d9cc2] mb-3 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5" /> {isBn ? "YouTube পাবলিশ কিট" : "YouTube publish kit"}
                  </div>
                  <div className="space-y-2 text-[12px] leading-relaxed">
                    <div className="bg-[#151b2e] rounded-xl p-3 border border-[#232d47]">
                      <div className="font-bold text-white truncate">{spec?.meta.title || "—"}</div>
                      <div className="text-[#8d9cc2] text-[11px] mt-1 line-clamp-2">
                        {spec?.scenes
                          .slice(0, 2)
                          .map((s) => s.title || s.heading || s.body || s.text || "")
                          .join(" • ")
                          .slice(0, 160) || (isBn ? "ডেসক্রিপশন অটো-জেনারেট হবে" : "Description auto-generates")}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {(spec?.meta.theme ? [spec.meta.theme, spec.meta.mood, spec.meta.aspect] : ["aurora", "uplifting", "16:9"]).map((t) => (
                          <span key={t} className="px-2 py-1 rounded-full bg-[#1e2a4a] border border-[#2a365c] text-[#8cb4ff] text-[10px] font-bold">
                            #{String(t).replace(/\s+/g, "")}
                          </span>
                        ))}
                        {shortsMode && <span className="px-2 py-1 rounded-full bg-[#7c5cff] text-white text-[10px] font-black">#Shorts</span>}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className="bg-[#151b2e] rounded-xl px-3 py-2.5 border border-[#232d47]">
                        <div className="font-bold text-[#8d9cc2] uppercase tracking-wide text-[10px]">Tags</div>
                        <div className="text-white font-semibold truncate">video, education, {spec?.meta.theme}</div>
                      </div>
                      <div className="bg-[#151b2e] rounded-xl px-3 py-2.5 border border-[#232d47]">
                        <div className="font-bold text-[#8d9cc2] uppercase tracking-wide text-[10px]">Chapters</div>
                        <div className="text-white font-semibold">{spec?.scenes.length || 0} • 0:00 start</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-dashed border-[#2a365c] bg-[#0f1124]/50 p-4 text-center">
                  <div className="text-[12px] font-bold text-white mb-1">{isBn ? "CLI দিয়ে অটো আপলোড" : "Auto upload via CLI"}</div>
                  <code className="block text-left text-[11px] bg-[#0b0f1e] border border-[#232d47] rounded-xl px-3 py-2.5 font-mono text-[#cbd5e1] overflow-x-auto">
                    node tools/yt-upload.mjs upload --dir ./publish
                  </code>
                  <div className="text-[11px] text-[#6b7bb0] mt-2">
                    {isBn ? "YouTube Data API ফ্রি 10k ইউনিট/দিন → ৬টি ভিডিও/দিন" : "YouTube Data API free 10k units/day → 6 videos/day"}
                  </div>
                </div>
              </div>
          </div>
        </aside>

        {/* Preview */}
        <main className="flex-1 min-w-0 flex flex-col bg-[#04060b] lg:h-[calc(100vh-56px)] lg:overflow-hidden">
          {/* Stage */}
          <div className="flex-1 relative flex items-center justify-center p-3 md:p-6 bg-gradient-to-br from-[#04060b] via-[#070a14] to-[#0b0f1e] min-h-[360px] lg:min-h-0">
            {/* canvas wrapper with aspect */}
            <div className="relative w-full max-w-[960px] mx-auto">
              <div className="relative rounded-2xl overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.06)] bg-black">
                <canvas ref={canvasRef} className="w-full h-auto block" style={{ aspectRatio: spec ? `${spec.width}/${spec.height}` : "16/9" }} />
                {/* badge */}
                <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/55 backdrop-blur-xl border border-white/10 rounded-full px-3 py-1.5 text-[11px] font-bold text-white">
                  <span className={`w-2 h-2 rounded-full ${isPlaying ? "bg-emerald-400 animate-pulse" : "bg-[#5b8dff]"}`} />
                  {isPlaying ? (isBn ? "প্লে হচ্ছে" : "Playing") : isBn ? "প্রিভিউ" : "Preview"} • {spec?.width}×{spec?.height} • {fmtTime(currentTime)} / {fmtTime(duration)}
                  {shortsMode && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-[#7c5cff] text-white text-[10px] font-black">9:16</span>}
                </div>
                {/* watermark preview */}
                {watermark && <div className="absolute bottom-3 right-3 text-[11px] font-semibold text-white/70 bg-black/30 backdrop-blur px-2 py-1 rounded-full border border-white/10">{watermark}</div>}
                {/* play overlay when paused at 0 */}
                {!isPlaying && currentTime < 0.05 && (
                  <button
                    onClick={() => setIsPlaying(true)}
                    className="absolute inset-0 grid place-items-center bg-black/20 backdrop-blur-[1px] group"
                  >
                    <span className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-white text-[#0d1120] grid place-items-center shadow-2xl group-hover:scale-105 transition">
                      <Play className="w-7 h-7 md:w-8 md:h-8 ml-0.5" />
                    </span>
                  </button>
                )}
              </div>

              {/* scene chips directly under canvas on mobile */}
              <div className="mt-3 flex items-center justify-between text-[11px] text-[#8d9cc2]">
                <span className="flex items-center gap-1.5">
                  <Layers3 className="w-3.5 h-3.5" /> {isBn ? `${curSceneIndex + 1} / ${scenes.length} সিন` : `${curSceneIndex + 1} / ${scenes.length} scenes`}
                  <span className="hidden sm:inline-flex items-center gap-1 ml-2 px-2 py-1 rounded-full bg-[#1a2440] border border-[#2a365c] text-[#8cb4ff] font-bold text-[10px]">
                    {scenes[curSceneIndex]?.type || "intro"}
                  </span>
                </span>
                <span className="hidden md:inline-flex items-center gap-1.5">
                  <Clock3 className="w-3.5 h-3.5" /> {fmtTime(currentTime)} / {fmtTime(duration)} • {progressPct.toFixed(1)}%
                </span>
              </div>
            </div>

            {showToast && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-[#151b2e] border border-[#2e3a5c] text-white px-4 py-2.5 rounded-full shadow-2xl text-[13px] font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
                <Check className="w-4 h-4 text-emerald-400" /> {showToast}
              </div>
            )}
          </div>

          {/* Transport */}
          <div className="border-t border-[#1e293b] bg-[#0d1120] px-3 md:px-4 py-3 flex flex-col gap-3">
            <div className="flex items-center gap-2 md:gap-3">
              <button
                onClick={() => setIsPlaying((v) => !v)}
                className={`w-10 h-10 md:w-11 md:h-11 rounded-full grid place-items-center shrink-0 shadow-lg transition ${isPlaying ? "bg-[#1e293b] border border-[#334155] text-white" : "bg-gradient-to-br from-[#5b8dff] to-[#7c5cff] text-white shadow-[#5b8dff]/20"}`}
              >
                {isPlaying ? <Pause className="w-4 h-4 md:w-5 md:h-5" /> : <Play className="w-4 h-4 md:w-5 md:h-5 ml-0.5" />}
              </button>

              <button
                onClick={() => {
                  setCurrentTime(0);
                  setIsPlaying(false);
                }}
                className="w-9 h-9 rounded-full bg-[#151b2e] border border-[#232d47] grid place-items-center text-[#8d9cc2] hover:text-white hover:border-[#5b8dff] transition shrink-0"
                title={isBn ? "শুরুতে" : "Restart"}
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                onClick={() => { const prev = historyRef.current.undo(); if (prev) setVoiceSpec(prev); }}
                className="w-9 h-9 rounded-full bg-[#151b2e] border border-[#232d47] grid place-items-center text-[#8d9cc2] hover:text-white hover:border-[#5b8dff] transition shrink-0"
                title="Undo"
              >
                <Undo2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => { const nxt = historyRef.current.redo(); if (nxt) setVoiceSpec(nxt); }}
                className="w-9 h-9 rounded-full bg-[#151b2e] border border-[#232d47] grid place-items-center text-[#8d9cc2] hover:text-white hover:border-[#5b8dff] transition shrink-0"
                title="Redo"
              >
                <Redo2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setSnapEnabled((v) => !v)}
                className={`w-9 h-9 rounded-full border grid place-items-center transition shrink-0 ${snapEnabled ? "bg-[#5b8dff] border-[#5b8dff] text-white" : "bg-[#151b2e] border-[#232d47] text-[#8d9cc2]"}`}
                title={snapEnabled ? "Snap on" : "Snap off"}
              >
                <Magnet className="w-4 h-4" />
              </button>

              <div className="flex-1 min-w-0">
                <div
                  className="relative h-[28px] flex items-center cursor-pointer group"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const pct = clamp((e.clientX - rect.left) / rect.width, 0, 1);
                    let t = pct * duration;
                    if (snapEnabled && spec) {
                      let acc = 0;
                      const sceneStarts: number[] = [];
                      spec.scenes.forEach((s) => { sceneStarts.push(acc); acc += s.dur; });
                      t = snapTime(t, collectSnapTargets({
                        duration,
                        sceneStarts,
                        captionStarts: spec.captions?.map((c) => c.start),
                        captionEnds: spec.captions?.map((c) => c.end),
                        playhead: currentTime,
                      }), 0.05, true);
                    }
                    setCurrentTime(clampT(t, 0, duration));
                  }}
                >
                  <div className="absolute left-0 right-0 h-[6px] bg-[#1a2440] rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-[#5b8dff] to-[#b06cff] rounded-full transition-[width] duration-75" style={{ width: `${progressPct}%` }} />
                  </div>
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-[16px] h-[16px] rounded-full bg-white shadow-[0_0_0_4px_rgba(91,141,255,0.3)] -translate-x-1/2 transition-[left] duration-75"
                    style={{ left: `${progressPct}%` }}
                  />
                  {/* scene ticks */}
                  <div className="absolute inset-0 pointer-events-none">
                    {spec &&
                      (() => {
                        let acc = 0;
                        return spec.scenes.map((s, i) => {
                          const left = (acc / duration) * 100;
                          acc += s.dur;
                          return <span key={i} className="absolute top-1/2 -translate-y-1/2 w-px h-3 bg-white/25 -translate-x-px" style={{ left: `${left}%` }} />;
                        });
                      })()}
                  </div>
                </div>
                <div className="flex items-center justify-between text-[11px] font-medium text-[#6b7bb0] mt-1">
                  <span className="font-mono text-[#cbd5e1]">{fmtTime(currentTime)}</span>
                  <span className="hidden sm:block text-[#8d9cc2]">{scenes[curSceneIndex]?.title || scenes[curSceneIndex]?.heading || scenes[curSceneIndex]?.label || scenes[curSceneIndex]?.type}</span>
                  <span className="font-mono">{fmtTime(duration)}</span>
                </div>
              </div>

              <div className="hidden md:flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => setCurrentTime((t) => clamp(t - 2, 0, duration))}
                  className="px-3 py-2 rounded-full bg-[#151b2e] border border-[#232d47] text-[#cbd5e1] text-[12px] font-bold hover:border-[#5b8dff] transition"
                >
                  -2s
                </button>
                <button
                  onClick={() => setCurrentTime((t) => clamp(t + 2, 0, duration))}
                  className="px-3 py-2 rounded-full bg-[#151b2e] border border-[#232d47] text-[#cbd5e1] text-[12px] font-bold hover:border-[#5b8dff] transition"
                >
                  +2s
                </button>
              </div>
            </div>

            {/* Timeline chips */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-[#26314e] [&::-webkit-scrollbar]:h-1.5">
              {scenes.map((sc, i) => {
                const active = i === curSceneIndex;
                // compute start time
                let start = 0;
                for (let k = 0; k < i; k++) start += scenes[k].dur;
                const typeColor: Record<string, string> = {
                  intro: "from-[#2b2350] to-[#3a2a6a]",
                  bullets: "from-[#16324a] to-[#1e4a6a]",
                  stat: "from-[#3a2a1a] to-[#5a3a1a]",
                  quote: "from-[#2f1f3a] to-[#4a2f5a]",
                  text: "from-[#1c2a4d] to-[#2a3a6a]",
                  broll: "from-[#1c2436] to-[#2a344a]",
                  outro: "from-[#3a1f2a] to-[#5a2a3a]",
                };
                return (
                  <button
                    key={i}
                    onClick={() => {
                      setCurrentTime(start + 0.05);
                      setIsPlaying(false);
                    }}
                    className={`shrink-0 min-w-[92px] max-w-[160px] text-left px-2.5 py-2 rounded-xl border text-[11px] leading-tight transition bg-gradient-to-br ${typeColor[sc.type] || typeColor.text} ${active ? "border-[#5b8dff] ring-2 ring-[#5b8dff]/30 scale-[1.02]" : "border-white/10 hover:border-white/20"}`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-white/60 font-mono text-[10px]">{fmtTime(start)}</span>
                      <span className="text-white/90 font-black text-[10px] uppercase tracking-wide">{sc.type}</span>
                    </div>
                    <div className="text-white font-semibold truncate text-[11px]">{(sc.title || sc.heading || sc.label || sc.text || sc.body || "").slice(0, 28) || "—"}</div>
                    <div className="text-white/60 text-[10px]">{sc.dur.toFixed(1)}s</div>
                  </button>
                );
              })}
            </div>
            {spec && scenes[curSceneIndex] && (
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className="text-[#8d9cc2] font-bold uppercase tracking-wide">Motion</span>
                <select
                  value={scenes[curSceneIndex].camera || "static"}
                  onChange={(e) => {
                    if (!spec) return;
                    historyRef.current.push(spec);
                    const next = { ...spec, scenes: spec.scenes.map((s, i) => i === curSceneIndex ? { ...s, camera: e.target.value } : s) };
                    setVoiceSpec(next);
                  }}
                  className="bg-[#151b2e] border border-[#232d47] rounded-lg px-2 py-1 text-[11px]"
                >
                  {CAMERA_PRESETS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <select
                  value={scenes[curSceneIndex].textAnimation || "fade"}
                  onChange={(e) => {
                    if (!spec) return;
                    historyRef.current.push(spec);
                    const next = { ...spec, scenes: spec.scenes.map((s, i) => i === curSceneIndex ? { ...s, textAnimation: e.target.value } : s) };
                    setVoiceSpec(next);
                  }}
                  className="bg-[#151b2e] border border-[#232d47] rounded-lg px-2 py-1 text-[11px]"
                >
                  {TEXT_PRESETS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <select
                  value={scenes[curSceneIndex].transitionOut || "fade"}
                  onChange={(e) => {
                    if (!spec) return;
                    historyRef.current.push(spec);
                    const next = { ...spec, scenes: spec.scenes.map((s, i) => i === curSceneIndex ? { ...s, transitionOut: e.target.value } : s) };
                    setVoiceSpec(next);
                  }}
                  className="bg-[#151b2e] border border-[#232d47] rounded-lg px-2 py-1 text-[11px]"
                >
                  {TRANSITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Footer */}
      <footer className="border-t border-[#1a2440] bg-[#0d1120] px-4 md:px-6 py-3">
        <div className="mx-auto max-w-[1600px] flex flex-col md:flex-row items-center justify-between gap-3 text-[11px] text-[#6b7bb0]">
          <div className="flex items-center gap-2 flex-wrap justify-center md:justify-start">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#0f1124] border border-[#232d47] text-[#8d9cc2] font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> {isBn ? "১০০% ক্লায়েন্ট-সাইড • কোনো আপলোড নেই" : "100% client-side • no upload"}
            </span>
            <span className="hidden sm:inline">•</span>
            <span>{isBn ? "MIT লাইসেন্স • ফ্রি, ওয়াটারমার্ক-ফ্রি" : "MIT • free, watermark-free"}</span>
            <span className="hidden sm:inline">•</span>
            <span className="flex items-center gap-1">
              <Globe className="w-3 h-3" /> {isBn ? "অফলাইন PWA রেডি" : "Offline PWA ready"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <a href="https://github.com/Khairul990/cutfree" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#151b2e] border border-[#232d47] hover:border-[#5b8dff] text-[#cbd5e1] font-semibold transition">
              GitHub
            </a>
            <span className="text-[#475569] hidden sm:inline">CutFree Studio — {isBn ? "শূন্য খরচে ভিডিও ফ্যাক্টরি" : "zero-cost video factory"}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
