/**
 * Deterministic script parser — no LLM.
 * Splits paragraphs, sentences, classifies line kinds.
 */

export type LineKind =
  | 'blank'
  | 'paragraph'
  | 'sentence'
  | 'short'
  | 'long'
  | 'question'
  | 'exclamation'
  | 'dialogue'
  | 'bullet'
  | 'emphasis'
  | 'heading';

export interface ParsedLine {
  index: number;
  text: string;
  kind: LineKind;
  charCount: number;
  wordCount: number;
  isQuestion: boolean;
  isExclamation: boolean;
  isDialogue: boolean;
  isBullet: boolean;
  isShort: boolean;
  isLong: boolean;
  isRepeated: boolean;
}

export interface ParsedBlock {
  index: number;
  text: string;
  lines: ParsedLine[];
  kind: 'blank' | 'bullets' | 'paragraph' | 'heading';
}

export interface ParsedScript {
  language: 'bn' | 'en';
  title: string;
  raw: string;
  blocks: ParsedBlock[];
  lines: ParsedLine[];
  sentenceCount: number;
  wordCount: number;
}

const WORD_RE = /[^\s]+/g;

export function countWords(s: string): number {
  return (String(s).trim().match(WORD_RE) || []).length;
}

export function detectLanguage(s: string): 'bn' | 'en' {
  const bn = (s.match(/[\u0980-\u09FF]/g) || []).length;
  const en = (s.match(/[A-Za-z]/g) || []).length;
  return bn >= en ? 'bn' : 'en';
}

function isBulletLine(s: string): boolean {
  return /^([-*•▪◦]|\d+[.)])\s+/.test(s);
}

function isQuestion(s: string): boolean {
  const t = s.trim();
  if (/[?؟]\s*$/.test(t)) return true;
  if (/কি\s*[?।]?$|কী\s*[?।]?$|কেন|কীভাবে|কিভাবে|না কি/.test(t)) return true;
  if (/^(who|what|why|how|when|where|did you|do you|are you)\b/i.test(t)) return true;
  return false;
}

function isExclamation(s: string): boolean {
  return /[!！]/.test(s) || /[!]$/.test(s.trim());
}

function isDialogue(s: string): boolean {
  const t = s.trim();
  if (/^[\"“'‘].+[\"”'’]/.test(t)) return true;
  if (/[:：]\s*[\"“]/.test(t)) return true;
  if (/বলল|বললেন|বলে|বললো|said|asked|replied/i.test(t) && t.length < 140) return true;
  return false;
}

function classifyLine(text: string, index: number): ParsedLine {
  const t = text.trim();
  const wc = countWords(t);
  const cc = t.length;
  const q = isQuestion(t);
  const ex = isExclamation(t);
  const dlg = isDialogue(t);
  const bullet = isBulletLine(t);
  const short = wc > 0 && wc <= 8;
  const long = wc >= 28 || cc >= 140;
  let kind: LineKind = 'sentence';
  if (!t) kind = 'blank';
  else if (bullet) kind = 'bullet';
  else if (dlg) kind = 'dialogue';
  else if (q) kind = 'question';
  else if (ex) kind = 'exclamation';
  else if (short && cc <= 48 && !/[.।!?]$/.test(t)) kind = 'heading';
  else if (short) kind = 'short';
  else if (long) kind = 'long';
  else kind = 'paragraph';
  return {
    index, text: t, kind, charCount: cc, wordCount: wc,
    isQuestion: q, isExclamation: ex, isDialogue: dlg, isBullet: bullet,
    isShort: short, isLong: long, isRepeated: false,
  };
}

export function parseScript(script: string, language?: 'bn' | 'en'): ParsedScript {
  const raw = String(script || '').replace(/\r/g, '');
  const lang = language || detectLanguage(raw);
  const physical = raw.split('\n');
  const lines: ParsedLine[] = physical.map((l, i) => classifyLine(l, i));

  // mark repeated phrases (normalized)
  const seen = new Map<string, number>();
  lines.forEach((ln) => {
    const key = ln.text.replace(/\s+/g, ' ').toLowerCase();
    if (!key || key.length < 8) return;
    seen.set(key, (seen.get(key) || 0) + 1);
  });
  lines.forEach((ln) => {
    const key = ln.text.replace(/\s+/g, ' ').toLowerCase();
    if ((seen.get(key) || 0) > 1) {
      ln.isRepeated = true;
      if (ln.kind === 'paragraph' || ln.kind === 'sentence') ln.kind = 'emphasis';
    }
  });

  const blocks: ParsedBlock[] = [];
  if (/\n\s*\n/.test(raw)) {
    const parts = raw.split(/\n\s*\n+/);
    let idx = 0;
    parts.forEach((p, bi) => {
      const ls = p.split('\n').map((x) => x.trim()).filter(Boolean).map((x, i) => classifyLine(x, idx + i));
      idx += ls.length;
      if (!ls.length) return;
      const kind: ParsedBlock['kind'] = ls.filter((l) => l.isBullet).length >= 2 ? 'bullets' : (ls.length === 1 && ls[0].kind === 'heading' ? 'heading' : 'paragraph');
      blocks.push({ index: bi, text: p.trim(), lines: ls, kind });
    });
  } else {
    // line-by-line: each non-empty line is a block, consecutive bullets grouped
    let bi = 0;
    for (let i = 0; i < lines.length; ) {
      if (!lines[i].text) { i++; continue; }
      if (lines[i].isBullet) {
        const grp: ParsedLine[] = [];
        while (i < lines.length && lines[i].isBullet) { grp.push(lines[i]); i++; }
        blocks.push({ index: bi++, text: grp.map((g) => g.text).join('\n'), lines: grp, kind: 'bullets' });
      } else {
        blocks.push({
          index: bi++,
          text: lines[i].text,
          lines: [lines[i]],
          kind: lines[i].kind === 'heading' ? 'heading' : 'paragraph',
        });
        i++;
      }
    }
  }

  const first = lines.find((l) => l.text)?.text || '';
  const title = first.length <= 70 && !/[.!?।]$/.test(first) ? first : first.slice(0, 68);
  const wordCount = countWords(raw);
  const sentenceCount = (raw.match(/[.!?।॥]+/g) || []).length || blocks.length;

  return { language: lang, title, raw, blocks, lines: lines.filter((l) => l.text), sentenceCount, wordCount };
}
