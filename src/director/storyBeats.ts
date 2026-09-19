/**
 * Deterministic story-beat detection via punctuation, position, dictionaries.
 * Does not claim semantic intelligence beyond the rules.
 */

import type { ParsedBlock, ParsedScript } from './scriptParser';
import type { CameraPreset, CharacterAction, CharacterEmotion, TextPreset, TransitionName } from '../motion/presets';

export type BeatType =
  | 'hook'
  | 'intro'
  | 'setup'
  | 'exposition'
  | 'dialogue'
  | 'action'
  | 'discovery'
  | 'emotion'
  | 'suspense'
  | 'conflict'
  | 'climax'
  | 'resolution'
  | 'moral'
  | 'ending'
  | 'cta';

export interface StoryBeat {
  index: number;
  type: BeatType;
  energy: 'low' | 'medium' | 'high';
  text: string;
  blockIndex: number;
  camera: CameraPreset;
  textAnimation: TextPreset;
  transition: TransitionName;
  characterAction: CharacterAction;
  characterEmotion: CharacterEmotion;
  backgroundTreatment: 'gradient' | 'aurora' | 'particles' | 'vignette' | 'fog' | 'glow' | 'stars';
  reasons: string[];
}

const KW = {
  hook: [/তুমি কি|আপনি কি|জানেন কি|did you know|what if|কী ছিল|কি ছিল|রহস্য/i],
  cta: [/সাবস্ক্রাইব|লাইক|শেয়ার|subscribe|follow|bell|🔔|আজ থেকেই শুরু/i],
  moral: [/শিক্ষা|নসিহত|moral|lesson|মনে রাখ|তাই বলা হয়|তাই আমরা/i],
  ending: [/ধন্যবাদ|শেষ|the end|শেষ কথা|সমাপ্ত|আল্লাহ হাফেজ/i],
  climax: [/হঠাৎ|সহসা|চরম|climax|suddenly|বিস্ফোরণ|চিৎকার|দৌড়/i],
  conflict: [/লড়াই|যুদ্ধ|বিরোধ|রাগ|conflict|against|শত্রু|মারামারি/i],
  suspense: [/অপেক্ষা|নিস্তব্ধ|অন্ধকার|দরজা|slow|silence|ফিসফিস|ভয়/i],
  emotion: [/কাঁদ|অশ্রু|ভালোবাসা|sad|love|দুঃখ|হাসি|আবেগ|মন/i],
  discovery: [/দেখল|খুঁজে|আবিষ্কার|discovered|found|বেরোল|জানতে পারল/i],
  action: [/দৌড়|ছুট|লাফ|hit|ran|যাত্রা|চলল|উঠল|নেমে/i],
  dialogue: [/বলল|বললেন|জিজ্ঞেস|said|asked|\"|“/],
  setup: [/একদা|একবার|ছিল|once|there was|গ্রাম|শহর/i],
};

function matchAny(text: string, regs: RegExp[]): boolean {
  return regs.some((r) => r.test(text));
}

function positionBeat(i: number, n: number): BeatType | null {
  if (n <= 1) return 'intro';
  const f = i / Math.max(1, n - 1);
  if (i === 0) return 'hook';
  if (i === n - 1) return 'ending';
  if (f > 0.88) return 'resolution';
  if (f > 0.72 && f <= 0.88) return 'climax';
  return null;
}

export function detectBeat(block: ParsedBlock, index: number, total: number): StoryBeat {
  const text = block.text;
  const reasons: string[] = [];
  let type: BeatType = 'exposition';

  const pos = positionBeat(index, total);
  if (matchAny(text, KW.cta)) { type = 'cta'; reasons.push('cta-keyword'); }
  else if (index === 0 && (block.lines.some((l) => l.isQuestion) || matchAny(text, KW.hook))) { type = 'hook'; reasons.push('opening-question'); }
  else if (matchAny(text, KW.ending) && index >= total - 2) { type = 'ending'; reasons.push('ending-keyword'); }
  else if (matchAny(text, KW.moral) && index >= total - 3) { type = 'moral'; reasons.push('moral-keyword'); }
  else if (matchAny(text, KW.climax)) { type = 'climax'; reasons.push('climax-keyword'); }
  else if (matchAny(text, KW.conflict)) { type = 'conflict'; reasons.push('conflict-keyword'); }
  else if (matchAny(text, KW.suspense)) { type = 'suspense'; reasons.push('suspense-keyword'); }
  else if (matchAny(text, KW.emotion)) { type = 'emotion'; reasons.push('emotion-keyword'); }
  else if (matchAny(text, KW.discovery)) { type = 'discovery'; reasons.push('discovery-keyword'); }
  else if (matchAny(text, KW.action)) { type = 'action'; reasons.push('action-keyword'); }
  else if (block.lines.some((l) => l.isDialogue) || matchAny(text, KW.dialogue)) { type = 'dialogue'; reasons.push('dialogue'); }
  else if (index === 0 && (block.lines.some((l) => l.isQuestion) || matchAny(text, KW.hook))) { type = 'hook'; reasons.push('opening-question'); }
  else if (index <= 1 && matchAny(text, KW.setup)) { type = 'setup'; reasons.push('setup-keyword'); }
  else if (index === 1) { type = 'intro'; reasons.push('second-block'); }
  else if (pos) { type = pos; reasons.push('position'); }
  else { type = 'exposition'; reasons.push('default-exposition'); }

  if (block.lines.some((l) => l.isQuestion) && type === 'exposition') {
    type = index === 0 ? 'hook' : 'suspense';
    reasons.push('question');
  }
  if (block.lines.some((l) => l.isExclamation) && (type === 'exposition' || type === 'setup')) {
    type = 'action';
    reasons.push('exclamation');
  }

  const energy: StoryBeat['energy'] =
    type === 'climax' || type === 'action' || type === 'hook' || type === 'conflict' ? 'high'
      : type === 'emotion' || type === 'suspense' || type === 'moral' || type === 'ending' ? 'low'
        : 'medium';

  const camera: CameraPreset =
    type === 'hook' || type === 'discovery' ? 'slow_zoom_in'
      : type === 'suspense' ? 'slow_zoom_in'
        : type === 'climax' || type === 'action' ? 'push_in'
          : type === 'emotion' || type === 'moral' ? 'drift'
            : type === 'ending' || type === 'cta' ? 'slow_zoom_out'
              : type === 'dialogue' ? 'handheld_soft'
                : type === 'conflict' ? 'pan_right'
                  : index % 3 === 0 ? 'parallax'
                    : index % 3 === 1 ? 'pan_left'
                      : 'static';

  const textAnimation: TextPreset =
    type === 'hook' ? 'emphasis'
      : type === 'dialogue' ? 'line_reveal'
        : type === 'climax' || type === 'action' ? 'pop'
          : type === 'suspense' ? 'blur_reveal'
            : type === 'cta' ? 'scale'
              : type === 'emotion' ? 'fade'
                : block.lines.some((l) => l.isQuestion) ? 'emphasis'
                  : index % 2 === 0 ? 'word_reveal' : 'slide_up';

  const transition: TransitionName =
    type === 'climax' ? 'zoom'
      : type === 'action' ? 'whip_pan'
        : type === 'suspense' ? 'blur'
          : type === 'ending' ? 'fade'
            : type === 'conflict' ? 'glitch'
              : index % 4 === 0 ? 'slide'
                : index % 4 === 1 ? 'crossfade'
                  : 'fade';

  const characterAction: CharacterAction =
    type === 'dialogue' ? 'talk'
      : type === 'hook' || type === 'discovery' ? 'surprised'
        : type === 'emotion' ? 'sad'
          : type === 'cta' || type === 'ending' ? 'wave'
            : type === 'action' || type === 'climax' ? 'enter'
              : type === 'moral' ? 'thinking'
                : 'idle';

  const characterEmotion: CharacterEmotion =
    type === 'emotion' ? 'sad'
      : type === 'hook' || type === 'discovery' || type === 'climax' ? 'surprised'
        : type === 'conflict' || type === 'suspense' ? 'tense'
          : type === 'cta' || type === 'ending' ? 'happy'
            : type === 'moral' ? 'thinking'
              : 'neutral';

  const backgroundTreatment: StoryBeat['backgroundTreatment'] =
    type === 'suspense' ? 'fog'
      : type === 'climax' || type === 'action' ? 'glow'
        : type === 'emotion' ? 'vignette'
          : type === 'hook' ? 'particles'
            : type === 'ending' ? 'stars'
              : 'aurora';

  return {
    index, type, energy, text, blockIndex: block.index,
    camera, textAnimation, transition, characterAction, characterEmotion,
    backgroundTreatment, reasons,
  };
}

export function detectStoryBeats(parsed: ParsedScript): StoryBeat[] {
  const blocks = parsed.blocks.filter((b) => b.text.trim());
  return blocks.map((b, i) => detectBeat(b, i, blocks.length));
}
