/**
 * Deterministic generator for the Authoritative 14-Scene, 251-Segment Blueprint JSON (341.89s).
 * Generates:
 * - 14 continuous scenes from 0.0s to 341.89s
 * - 251 continuous speech and pause segments from 0.0s to 341.89s
 * - Sets metadata totalSegments to 125 intentionally to verify dynamic validator repair
 */
const fs = require('fs');
const path = require('path');

const TOTAL_DURATION = 341.89;
const SCENE_COUNT = 14;
const SEGMENT_COUNT = 251;

// 14 scene titles and visual themes
const SCENE_DEFS = [
  { id: "scene_01", title: "বন্ধ দরজার ওপাশে কী ছিল?", bg: "night_sky", cam: "slow_zoom_in", char: "narrator", action: "talk", emotion: "mysterious" },
  { id: "scene_02", title: "এক অদ্ভুত নীরব শহর", bg: "rainy_street", cam: "pan_right", char: "salman", action: "walk", emotion: "serious" },
  { id: "scene_03", title: "রহস্যময় পুরোনো বাড়ি", bg: "old_mysterious_door", cam: "camera_push", char: "salman", action: "look", emotion: "alert" },
  { id: "scene_04", title: "অন্তরের পরীক্ষা", bg: "islamic_mosque", cam: "zoom_focus", char: "salman", action: "talk", emotion: "inspired" },
  { id: "scene_05", title: "বন্ধ দরজার সামনে দাঁড়িয়ে", bg: "old_mysterious_door", cam: "slow_zoom_in", char: "salman", action: "point", emotion: "serious" },
  { id: "scene_06", title: "শয়তানের প্ররোচনা ও দ্বিধা", bg: "night_sky", cam: "pan_left", char: "narrator", action: "talk", emotion: "mysterious" },
  { id: "scene_07", title: "আল্লাহর ভয়ের স্মরণ", bg: "islamic_mosque", cam: "slow_zoom_out", char: "salman", action: "talk", emotion: "inspired" },
  { id: "scene_08", title: "একটি গোপন ভালো আমল", bg: "village", cam: "slow_pan", char: "salman", action: "walk", emotion: "happy" },
  { id: "scene_09", title: "দরজা খুলে যাওয়ার বিস্ময়", bg: "old_mysterious_door", cam: "camera_pull", char: "salman", action: "celebrate", emotion: "happy" },
  { id: "scene_10", title: "অন্ধকারে এক টুকরো নূর", bg: "night_sky", cam: "zoom_focus", char: "narrator", action: "talk", emotion: "inspired" },
  { id: "scene_11", title: "সততার অপূর্ব পুরস্কার", bg: "village", cam: "pan_right", char: "salman", action: "talk", emotion: "happy" },
  { id: "scene_12", title: "জীবনের সবচেয়ে বড় শিক্ষা", bg: "islamic_mosque", cam: "slow_zoom_in", char: "narrator", action: "talk", emotion: "inspired" },
  { id: "scene_13", title: "যখন কেউ দেখে না, তখন আল্লাহ দেখেন", bg: "night_sky", cam: "pan_up", char: "narrator", action: "talk", emotion: "serious" },
  { id: "scene_14", title: "হেদায়েতের ডাক ও সমাপনী", bg: "islamic_mosque", cam: "slow_zoom_out", char: "narrator", action: "point", emotion: "happy" },
];

// Generate 14 continuous scenes
const scenes = [];
let sceneCursor = 0;
const sceneDurations = [24.0, 26.0, 22.0, 25.0, 23.0, 27.0, 24.0, 25.0, 24.0, 26.0, 25.0, 24.0, 24.0, 0];
// Calculate remaining for last scene
let sumFirst13 = sceneDurations.slice(0, 13).reduce((a, b) => a + b, 0);
sceneDurations[13] = parseFloat((TOTAL_DURATION - sumFirst13).toFixed(2));

for (let i = 0; i < SCENE_COUNT; i++) {
  const def = SCENE_DEFS[i];
  const start = parseFloat(sceneCursor.toFixed(2));
  const dur = sceneDurations[i];
  const end = i === SCENE_COUNT - 1 ? TOTAL_DURATION : parseFloat((start + dur).toFixed(2));
  sceneCursor = end;

  scenes.push({
    id: def.id,
    start,
    end,
    purpose: i === 0 ? "intro_hook" : (i === SCENE_COUNT - 1 ? "outro" : "narrative"),
    title: def.title,
    body: `দৃশ্য ${i + 1}: ${def.title} — সত্য ও সততার পথে অবিচল থাকার এক অনুপ্রেরণামূলক মুহূর্ত।`,
    background: {
      assetId: def.bg,
      fit: "cover",
      motion: "slow_pan",
      transition: "fade",
      transitionDuration: 1.0,
    },
    characters: [
      {
        id: def.char,
        position: { x: 0.5, y: 0.72 },
        scale: 1.0,
        emotion: def.emotion,
        action: def.action,
        entrance: "fade_in",
        exit: "fade_out",
      },
    ],
    objects: [],
    camera: {
      preset: def.cam,
      intensity: 1.0,
    },
  });
}

// Generate 251 continuous segments (alternating speech and pause)
const segments = [];
let segCursor = 0;
const avgSegDur = TOTAL_DURATION / SEGMENT_COUNT;

for (let i = 0; i < SEGMENT_COUNT; i++) {
  const isLast = i === SEGMENT_COUNT - 1;
  const isSpeech = i % 2 === 0;
  const start = parseFloat(segCursor.toFixed(2));
  let dur = avgSegDur;
  // slight natural variation
  if (isSpeech) dur = avgSegDur * 1.35;
  else dur = avgSegDur * 0.65;

  let end = parseFloat((start + dur).toFixed(2));
  if (isLast || end > TOTAL_DURATION) {
    end = TOTAL_DURATION;
  }
  segCursor = end;

  segments.push({
    id: isSpeech ? `seg_${String(Math.floor(i / 2) + 1).padStart(3, '0')}` : `pause_${String(Math.floor(i / 2) + 1).padStart(3, '0')}`,
    type: isSpeech ? "speech" : "pause",
    start,
    end,
    text: isSpeech ? `ইসলামিক ভয়েস গল্প পর্ব #${i + 1} — সততা ও ঈমানের আলো` : undefined,
  });
}
// Ensure last segment reaches exact TOTAL_DURATION
segments[segments.length - 1].end = TOTAL_DURATION;

// 14 rich Bengali captions
const captions = [
  { id: "cap_01", start: 1.5, end: 15.0, text: "বন্ধ দরজার ওপাশে কী ছিল? এক অদ্ভুত সত্য...", style: { animation: "fade" } },
  { id: "cap_02", start: 25.0, end: 42.0, text: "শহরের নির্জন রাতে এক তরুণের কঠিন পরীক্ষা...", style: { animation: "typewriter" } },
  { id: "cap_03", start: 52.0, end: 68.0, text: "সামনে একটি বন্ধ দরজা, যেখানে কেউ দেখার নেই...", style: { animation: "slide" } },
  { id: "cap_04", start: 78.0, end: 92.0, text: "কিন্তু মুমিনের অন্তর জানে—আল্লাহ সর্বদা দেখছেন!", style: { animation: "scale" } },
  { id: "cap_05", start: 102.0, end: 118.0, text: "শয়তান প্ররোচনা দিল, তবুও সে পা বাড়াল না...", style: { animation: "fade" } },
  { id: "cap_06", start: 125.0, end: 140.0, text: "আল্লাহর ভয়ে যে ব্যক্তি কোনো পাপ ত্যাগ করে...", style: { animation: "typewriter" } },
  { id: "cap_07", start: 148.0, end: 165.0, text: "আল্লাহ তাকে তার চেয়েও উত্তম নিয়ামত দান করেন!", style: { animation: "scale" } },
  { id: "cap_08", start: 175.0, end: 190.0, text: "হঠাৎ অলৌকিকভাবে দরজার ওপাশে আলো ছড়িয়ে পড়ল...", style: { animation: "slide" } },
  { id: "cap_09", start: 200.0, end: 215.0, text: "সততার পুরস্কার কখনো বৃথা যায় না...", style: { animation: "fade" } },
  { id: "cap_10", start: 225.0, end: 240.0, text: "অন্ধকার ভেদ করে নূর উজ্জ্বল হয়ে উঠল...", style: { animation: "typewriter" } },
  { id: "cap_11", start: 250.0, end: 268.0, text: "মানুষ যখন একা থাকে, তখন তার আসল চরিত্র প্রকাশ পায়...", style: { animation: "scale" } },
  { id: "cap_12", start: 278.0, end: 295.0, text: "তাকওয়া হলো গোপনে এবং প্রকাশ্যে আল্লাহর ভয়...", style: { animation: "fade" } },
  { id: "cap_13", start: 305.0, end: 320.0, text: "হেদায়েতের এই আলো ছড়িয়ে দিন সবার মাঝে...", style: { animation: "slide" } },
  { id: "cap_14", start: 325.0, end: 341.89, text: "জাযাকাল্লাহু খাইরান! সাবস্ক্রাইব করে সাথে থাকুন।", style: { animation: "scale" } },
];

const blueprint = {
  version: "1.0",
  project: {
    id: "islamic-story-14scenes-341s",
    title: "বন্ধ দরজার ওপাশে কী ছিল? | Islamic Voice Bengali",
    language: "bn-BD",
    fps: 30,
    width: 1920,
    height: 1080,
    aspectRatio: "16:9",
    theme: "aurora",
    mood: "cinematic",
    watermark: "@IslamicVoiceBengali",
  },
  audio: {
    source: "voice.mp3",
    duration: TOTAL_DURATION,
    sampleRate: 44100,
    channels: 2,
    fileName: "islamic-story-voice-341s.wav",
  },
  timeline: {
    duration: TOTAL_DURATION,
    totalScenes: SCENE_COUNT,
    // Intentionally setting 125 to verify dynamic autoRepair to 251 as per prompt Phase 5!
    totalSegments: 125,
    totalCaptions: captions.length,
  },
  scenes,
  segments,
  captions,
  assets: [
    { id: "narrator", type: "character", name: "Narrator (Islamic Voice)" },
    { id: "salman", type: "character", name: "Salman" },
    { id: "night_sky", type: "background", name: "Night Sky" },
    { id: "rainy_street", type: "background", name: "Rainy Street" },
    { id: "old_mysterious_door", type: "background", name: "Mysterious Door" },
    { id: "islamic_mosque", type: "background", name: "Islamic Mosque" },
    { id: "village", type: "background", name: "Peaceful Village" },
    { id: "lantern", type: "object", name: "Lantern" },
    { id: "book", type: "object", name: "Holy Quran" },
  ],
  export: {
    format: "mp4",
    videoCodec: "h264",
    audioCodec: "aac",
  },
};

const outPath = path.join(__dirname, '..', 'tests', 'fixtures', 'sample-blueprint-14scenes-341s.json');
fs.writeFileSync(outPath, JSON.stringify(blueprint, null, 2), 'utf8');
console.log(`✅ Generated 14-scene, 251-segment Blueprint at: ${outPath}`);
console.log(`- Scenes: ${scenes.length}, Segments: ${segments.length}, Duration: ${TOTAL_DURATION}s`);
