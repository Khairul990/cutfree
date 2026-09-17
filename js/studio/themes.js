/* ============================================================================
   CutFree Studio — themes & colour-blending recipes
   Every theme is a palette + a blending recipe. The renderer stacks gradients
   and layers with canvas blend modes (screen / overlay / soft-light / color-dodge)
   which is what gives the output its "graded" premium look without any footage.
   ========================================================================== */
(function (w) {
  'use strict';

  var THEMES = {
    aurora: {
      name: { bn: 'অরোরা', en: 'Aurora' },
      bg: '#05070f',
      blobs: ['#7c5cff', '#22d3ee', '#3bf0a0', '#ff6bd6'],
      text: '#ffffff',
      sub: '#c9d6ff',
      accent: '#22d3ee',
      accent2: '#7c5cff',
      blend: ['screen', 'screen', 'lighter'],
      grain: 0.06,
      vignette: 0.55,
      aurora: true
    },
    neonNoir: {
      name: { bn: 'নিয়ন নয়ার', en: 'Neon Noir' },
      bg: '#07040e',
      blobs: ['#ff2d95', '#7a2dff', '#00e5ff', '#ff8a00'],
      text: '#ffffff',
      sub: '#ffc9e6',
      accent: '#ff2d95',
      accent2: '#00e5ff',
      blend: ['screen', 'color-dodge', 'screen'],
      grain: 0.09,
      vignette: 0.7,
      aurora: false
    },
    goldenHour: {
      name: { bn: 'গোল্ডেন আওয়ার', en: 'Golden Hour' },
      bg: '#120803',
      blobs: ['#ffb347', '#ff5e3a', '#ffd76e', '#ff2e63'],
      text: '#fffaf2',
      sub: '#ffd9b0',
      accent: '#ffb347',
      accent2: '#ff5e3a',
      blend: ['screen', 'overlay', 'lighter'],
      grain: 0.07,
      vignette: 0.5,
      aurora: true
    },
    emerald: {
      name: { bn: 'এমারল্ড ডিপ', en: 'Emerald Deep' },
      bg: '#03110d',
      blobs: ['#2ee6a8', '#22d3ee', '#0ea5e9', '#a3ff9e'],
      text: '#f2fffb',
      sub: '#b8ffe6',
      accent: '#2ee6a8',
      accent2: '#22d3ee',
      blend: ['screen', 'lighter', 'screen'],
      grain: 0.05,
      vignette: 0.5,
      aurora: true
    },
    royalInk: {
      name: { bn: 'রয়্যাল ইঙ্ক', en: 'Royal Ink' },
      bg: '#060a1c',
      blobs: ['#4f7cff', '#8b5cf6', '#22d3ee', '#e0e7ff'],
      text: '#ffffff',
      sub: '#c7d2fe',
      accent: '#8b5cf6',
      accent2: '#4f7cff',
      blend: ['screen', 'soft-light', 'lighter'],
      grain: 0.05,
      vignette: 0.55,
      aurora: true
    },
    candy: {
      name: { bn: 'ক্যান্ডি ফ্লস', en: 'Candy Floss' },
      bg: '#150512',
      blobs: ['#ff6bd6', '#ffd166', '#7c5cff', '#4cd4ff'],
      text: '#fff7fd',
      sub: '#ffd6f2',
      accent: '#ff6bd6',
      accent2: '#ffd166',
      blend: ['screen', 'lighter', 'overlay'],
      grain: 0.08,
      vignette: 0.45,
      aurora: true
    },
    obsidian: {
      name: { bn: 'অবসিডিয়ান গোল্ড', en: 'Obsidian Gold' },
      bg: '#08080a',
      blobs: ['#d4af37', '#8a6a20', '#f5e6a8', '#6b7280'],
      text: '#fdfcf7',
      sub: '#e8d9a8',
      accent: '#d4af37',
      accent2: '#f5e6a8',
      blend: ['screen', 'overlay', 'soft-light'],
      grain: 0.1,
      vignette: 0.72,
      aurora: false
    },
    cyber: {
      name: { bn: 'সাইবার লাইম', en: 'Cyber Lime' },
      bg: '#040a08',
      blobs: ['#c6ff00', '#00e5ff', '#00ffa3', '#7c5cff'],
      text: '#f4ffe0',
      sub: '#d3ff8a',
      accent: '#c6ff00',
      accent2: '#00e5ff',
      blend: ['color-dodge', 'screen', 'lighter'],
      grain: 0.07,
      vignette: 0.6,
      aurora: false
    },
    cyberMatrix: {
      name: { bn: 'সাইবার ম্যাট্রিক্স', en: 'Cyber Matrix' },
      bg: '#020906',
      blobs: ['#00ff66', '#00f0ff', '#10b981', '#064e3b'],
      text: '#e6fff4',
      sub: '#86efac',
      accent: '#00ff66',
      accent2: '#00f0ff',
      blend: ['color-dodge', 'screen', 'lighter'],
      grain: 0.08,
      vignette: 0.65,
      aurora: true
    },
    vaporwave: {
      name: { bn: 'ভেপরওয়েভ সানসেট', en: 'Vaporwave Sunset' },
      bg: '#10041a',
      blobs: ['#ff3399', '#7928ca', '#ff0080', '#00dfd8'],
      text: '#ffffff',
      sub: '#fbcfe8',
      accent: '#ff3399',
      accent2: '#00dfd8',
      blend: ['screen', 'color-dodge', 'overlay'],
      grain: 0.07,
      vignette: 0.5,
      aurora: true
    },
    obsidianLuxury: {
      name: { bn: 'অবসিডিয়ান লাক্সারি', en: 'Obsidian Luxury' },
      bg: '#050505',
      blobs: ['#f59e0b', '#d97706', '#fbbf24', '#78350f'],
      text: '#fffbeb',
      sub: '#fde68a',
      accent: '#fbbf24',
      accent2: '#f59e0b',
      blend: ['screen', 'overlay', 'lighter'],
      grain: 0.09,
      vignette: 0.75,
      aurora: true
    },
    royalEmerald: {
      name: { bn: 'রয়্যাল এমারল্ড', en: 'Royal Emerald' },
      bg: '#02120d',
      blobs: ['#059669', '#10b981', '#34d399', '#0284c7'],
      text: '#ecfdf5',
      sub: '#a7f3d0',
      accent: '#10b981',
      accent2: '#38bdf8',
      blend: ['screen', 'soft-light', 'lighter'],
      grain: 0.06,
      vignette: 0.55,
      aurora: true
    },
    arabicGold: {
      name: { bn: 'অ্যারাবিক ক্যালিগ্রাফি গোল্ড', en: 'Arabic Calligraphy Gold' },
      bg: '#040b14',
      blobs: ['#f59e0b', '#10b981', '#fbbf24', '#064e3b'],
      text: '#fffdf5',
      sub: '#fef3c7',
      accent: '#fbbf24',
      accent2: '#34d399',
      blend: ['screen', 'color-dodge', 'lighter'],
      grain: 0.08,
      vignette: 0.65,
      aurora: true
    }
  };

  var MOODS = {
    uplifting: { name: { bn: 'উৎসবমুখর', en: 'Uplifting' }, bpm: 112, key: 0, scale: 'major' },
    cinematic: { name: { bn: 'সিনেমাটিক', en: 'Cinematic' }, bpm: 84, key: -3, scale: 'minor' },
    chill: { name: { bn: 'চিল', en: 'Chill' }, bpm: 92, key: 2, scale: 'dorian' },
    tech: { name: { bn: 'টেক', en: 'Tech' }, bpm: 124, key: 5, scale: 'minor' },
    ambient: { name: { bn: 'অ্যাম্বিয়েন্ট', en: 'Ambient' }, bpm: 70, key: -5, scale: 'minor' },
    epic: { name: { bn: 'এপিক', en: 'Epic' }, bpm: 96, key: -2, scale: 'minor' }
  };

  var FONTS = {
    display: '"Amiri","Scheherazade New","Hind Siliguri","Noto Sans Bengali","Nirmala UI",system-ui,"Segoe UI",sans-serif',
    arabic: '"Amiri","Scheherazade New","Noto Naskh Arabic","Traditional Arabic",serif',
    mono: 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace'
  };

  w.CFX = w.CFX || {};
  w.CFX.THEMES = THEMES;
  w.CFX.MOODS = MOODS;
  w.CFX.FONTS = FONTS;
  w.CFX.themeList = Object.keys(THEMES);
  w.CFX.moodList = Object.keys(MOODS);
})(window);
