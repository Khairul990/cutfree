import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

let appDir = process.cwd();
try {
  if (typeof __dirname !== 'undefined') {
    appDir = __dirname;
  } else {
    appDir = path.dirname(fileURLToPath(import.meta.url));
  }
} catch {
  appDir = process.cwd();
}

// Find base directory containing index.html and studio.html
const rootDir = fs.existsSync(path.join(appDir, 'index.html'))
  ? appDir
  : fs.existsSync(path.join(appDir, '..', 'index.html'))
  ? path.resolve(appDir, '..')
  : process.cwd();

const app = express();
const PORT = 3000;

app.use(express.json());

// API health endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'CutFree Studio',
    aiAvailable: Boolean(process.env.GEMINI_API_KEY)
  });
});

// Fallback script generator if Gemini key is not configured or offline
function generateFallbackScript(topic: string, lang: string = 'bn', style: string = 'explainer'): string {
  const isBn = lang === 'bn';
  const cleanTopic = topic.trim() || (isBn ? 'আধুনিক প্রযুক্তি ও উৎপাদনশীলতা' : 'Modern Productivity and Technology');

  if (isBn) {
    if (style === 'shorts') {
      return [
        cleanTopic,
        'আপনি কি জানেন এই একটি কৌশল আপনার জীবন বদলে দিতে পারে?',
        'মাত্র ১% উন্নতি প্রতিদিন করলে বছর শেষে আপনি ৩৭ গুণ বেশি দক্ষ হবেন।',
        'প্রধান ৩টি নিয়ম মনে রাখুন:\n- লক্ষ্য নির্দিষ্ট করুন\n- বিভ্রান্তি দূর করুন\n- প্রতিদিন চর্চা চালিয়ে যান',
        '"সাফল্য কোনো দুর্ঘটনা নয়, এটি সঠিক অভ্যাসের ফল।" — সাফল্য দর্শন',
        'আজ থেকেই শুরু করুন এবং নিজের সেরা সংস্করণ হয়ে উঠুন।\n🔔 চ্যানেলটি সাবস্ক্রাইব করতে ভুলবেন না!'
      ].join('\n\n');
    }
    return [
      cleanTopic,
      `আজকের দ্রুত পরিবর্তনশীল পৃথিবীতে ${cleanTopic} কেন এতো গুরুত্বপূর্ণ?`,
      'আমরা প্রায়শই সাধারণ বিষয়ে আটকে থাকি, কিন্তু আসল পরিবর্তন আসে গভীর উপলব্ধি ও সুনির্দিষ্ট কৌশল থেকে।',
      '৮০% ফলাফল আসে মাত্র ২০% গুরুত্বপূর্ণ কাজ থেকে।',
      'যে তিনটি মৌলিক বিষয় জেনে রাখা প্রয়োজন:\n- সঠিক তথ্যের কার্যকর প্রয়োগ\n- সময় ও শক্তির ভারসাম্য রক্ষা\n- আধুনিক প্রযুক্তির বুদ্ধিদীপ্ত ব্যবহার',
      'প্রথমে ভিত্তি মজবুত করা দরকার। যখন প্রক্রিয়া স্পষ্ট হয়, তখন জটিল কাজও সহজ হয়ে যায়।',
      'বাস্তবে কাজ শুরু করার সহজ রূপরেখা:\n- ছোট ছোট পদক্ষেপে পরিকল্পনা তৈরি\n- প্রতিদিনের কাজের নিরীক্ষা ও মূল্যায়ন\n- ধারাবাহিক অনুশীলনে দক্ষতা বৃদ্ধি',
      '৪x দ্রুত ফলাফল পাওয়া সম্ভব যখন সঠিক পদ্ধতি অনুসরণ করা হয়।',
      '"শুরু করাটাই সবচেয়ে কঠিন, কিন্তু একবার শুরু করলে পথ নিজেই উন্মোচিত হয়।" — অনুপ্রাণিত চিন্তা',
      'আজ থেকেই প্রস্তুতি নিন এবং এগিয়ে যান।\n🔔 ভালো লাগলে লাইক ও সাবস্ক্রাইব করে সাথে থাকুন!'
    ].join('\n\n');
  } else {
    if (style === 'shorts') {
      return [
        cleanTopic,
        'Did you know this one single shift can change everything?',
        'A tiny 1% improvement every day makes you 37 times better by the end of the year.',
        'Keep these 3 golden rules in mind:\n- Set clear goals\n- Eliminate unnecessary noise\n- Execute consistently every day',
        '"Success is not accidental; it is the compound interest of good habits."',
        'Start today and transform your trajectory!\n🔔 Subscribe for more daily insights!'
      ].join('\n\n');
    }
    return [
      cleanTopic,
      `Why is understanding ${cleanTopic} more critical today than ever before?`,
      'Most people get overwhelmed by complexities, but real breakthroughs always come from mastering foundational principles.',
      '80% of your meaningful results stem from just 20% of your focused efforts.',
      'Three core fundamentals to remember:\n- Apply knowledge with surgical clarity\n- Protect your attention and energy\n- Leverage modern automated systems',
      'When you streamline the workflow, what previously took days now happens in minutes.',
      'A practical step-by-step framework:\n- Break large ambitions into modular milestones\n- Review and iterate on feedback loops\n- Maintain momentum through daily habits',
      '4x faster progress is achievable with disciplined execution.',
      '"The secret of getting ahead is getting started." — Mark Twain',
      'Put this into practice today.\n🔔 Don\'t forget to like and subscribe for more deep dives!'
    ].join('\n\n');
  }
}

// AI script generation endpoint
app.post('/api/ai/script', async (req, res) => {
  const { topic, language = 'bn', style = 'explainer' } = req.body || {};
  const cleanTopic = (topic || '').toString().trim();

  if (!cleanTopic) {
    return res.status(400).json({ error: 'Topic is required' });
  }

  // If Gemini API key is configured, use Gemini 3.8 Flash
  if (process.env.GEMINI_API_KEY) {
    try {
      const ai = new GoogleGenAI();
      const isBn = language === 'bn';
      const prompt = `You are an expert video director creating an animated motion-graphics script for CutFree Studio.
Topic: "${cleanTopic}"
Language: ${isBn ? 'Bengali (বাংলা)' : 'English'}
Style: ${style === 'shorts' ? 'Shorts/Reels (40-60 seconds, fast-paced)' : 'Comprehensive Explainer (2-3 minutes)'}

STRICT FORMAT RULES:
1. Every distinct scene MUST be separated by a double newline (blank line between paragraphs).
2. Write only pure text and paragraphs. Do NOT include scene markers like "[Scene 1]", markdown headers (###), or asterisks for bolding.
3. Structure:
   - Scene 1: Bold, punchy Title line.
   - Scene 2: Hook question or surprising statement.
   - Scene 3+: Core narrative paragraphs (1-2 sentences each).
   - Include 1 or 2 bullet point lists starting with "- ".
   - Include at least one dramatic stat/number line (e.g. "৯৫% কাজ" or "৪x দ্রুত" or "80% of results").
   - Include one profound quote in quotes with author: "উক্তি..." — লেখক.
   - Final scene: Warm call-to-action outro (e.g. asking to subscribe).
4. Output ONLY the raw script text.`;

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('AI generation timeout')), 5000)
      );

      const responsePromise = ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt
      });

      const response: any = await Promise.race([responsePromise, timeoutPromise]);
      const script = (response.text || '').trim();
      if (script && script.split('\n\n').length >= 3) {
        return res.json({
          success: true,
          source: 'gemini',
          script: script
        });
      }
    } catch (err: any) {
      console.warn('Gemini script generation fallback triggered:', err?.message || err);
    }
  }

  // Fallback generation (deterministic & instantaneous)
  const fallbackScript = generateFallbackScript(cleanTopic, language, style);
  return res.json({
    success: true,
    source: 'template_engine',
    script: fallbackScript
  });
});

// AI Audio-to-Script Scene Plan Analyzer
app.post('/api/ai/audio-plan', async (req, res) => {
  const { duration = 30, title = '', hints = '', language = 'bn' } = req.body || {};
  const durSec = Math.max(5, Math.min(600, Number(duration) || 30));
  const isBn = language === 'bn';

  if (process.env.GEMINI_API_KEY) {
    try {
      const ai = new GoogleGenAI();
      const prompt = `You are a motion graphics director. A user recorded an audio voiceover of ${durSec.toFixed(1)} seconds.
Title or topic hint: "${title || hints || 'Voiceover story'}"
Language: ${isBn ? 'Bengali' : 'English'}

Task: Generate a synchronized sequence of kinetic typography & motion-graphics scenes matching this exact duration (${durSec.toFixed(1)} seconds).
Structure requirements:
1. Divide the time across 3 to 8 sequential scenes so their durations match the voiceover pace.
2. The scenes MUST be formatted for CutFree Studio:
   - First scene: Punchy Title
   - Middle scenes: Key ideas, bullet points (- point), statistics or numbers, and impactful quotes
   - Last scene: Warm call-to-action outro (Subscribe / Share)
3. Separate each scene with a double blank line.
4. Output ONLY the raw script lines without Markdown headers (###) or markers.`;

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('AI generation timeout')), 5000)
      );

      const responsePromise = ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt
      });

      const response: any = await Promise.race([responsePromise, timeoutPromise]);
      const script = (response.text || '').trim();
      if (script && script.split('\n\n').length >= 2) {
        return res.json({ success: true, source: 'gemini', script, estimatedDuration: durSec });
      }
    } catch (err: any) {
      console.warn('Gemini audio-plan fallback:', err?.message || err);
    }
  }

  // Fallback synchronized script based on duration
  const fallback = generateFallbackScript(title || hints || (isBn ? 'আমার ভয়েসওভার ভিডিও' : 'My Voiceover Video'), language, durSec <= 65 ? 'shorts' : 'explainer');
  return res.json({ success: true, source: 'template_engine', script: fallback, estimatedDuration: durSec });
});

// Explicit routes for major views
app.get('/', (req, res) => {
  res.sendFile(path.join(rootDir, 'studio.html'));
});

app.get('/studio', (req, res) => {
  res.sendFile(path.join(rootDir, 'studio.html'));
});

app.get('/cutfree', (req, res) => {
  res.sendFile(path.join(rootDir, 'cutfree.html'));
});

app.get('/editor', (req, res) => {
  res.sendFile(path.join(rootDir, 'cutfree.html'));
});

// Static assets
app.use(express.static(rootDir));

// SPA / fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(rootDir, 'studio.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`CutFree Studio server running on http://0.0.0.0:${PORT}`);
});


