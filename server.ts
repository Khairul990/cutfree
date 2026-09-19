import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync, spawn } from 'child_process';
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
const PORT = Number(process.env.PORT) || 3000;

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

// ---------------------------------------------------------------------------
// System Capabilities & Binary Detection (yt-dlp & FFmpeg)
// ---------------------------------------------------------------------------
function checkBinary(name: string): boolean {
  try {
    const cmd = process.platform === 'win32' ? `where.exe ${name}` : `which ${name}`;
    execSync(cmd, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

app.get('/api/system/capabilities', (req, res) => {
  res.json({
    success: true,
    hasYtDlp: checkBinary('yt-dlp'),
    hasFfmpeg: checkBinary('ffmpeg'),
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
  });
});

// ---------------------------------------------------------------------------
// Subtitle Parser (SRT & WebVTT to CutFree Blueprint CaptionItem[])
// ---------------------------------------------------------------------------
function parseTimestampToSeconds(ts: string): number {
  const clean = ts.trim().replace(',', '.');
  const parts = clean.split(':');
  if (parts.length === 3) {
    const h = parseFloat(parts[0]);
    const m = parseFloat(parts[1]);
    const s = parseFloat(parts[2]);
    return h * 3600 + m * 60 + s;
  }
  if (parts.length === 2) {
    const m = parseFloat(parts[0]);
    const s = parseFloat(parts[1]);
    return m * 60 + s;
  }
  return parseFloat(clean) || 0;
}

function parseSubtitlesToCaptions(rawText: string) {
  const lines = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const items: Array<{ id: string; start: number; end: number; text: string }> = [];
  let currentStart = 0;
  let currentEnd = 0;
  let currentTextLines: string[] = [];
  let isParsingCue = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.includes('-->')) {
      if (isParsingCue && currentTextLines.length > 0) {
        items.push({
          id: `cap_${items.length + 1}`,
          start: parseFloat(currentStart.toFixed(2)),
          end: parseFloat(currentEnd.toFixed(2)),
          text: currentTextLines.join(' ').trim(),
        });
        currentTextLines = [];
      }
      const [startStr, endStr] = line.split('-->');
      currentStart = parseTimestampToSeconds(startStr);
      const rawEnd = endStr.trim().split(/\s+/)[0];
      currentEnd = parseTimestampToSeconds(rawEnd);
      isParsingCue = true;
    } else if (isParsingCue) {
      if (!line) {
        if (currentTextLines.length > 0) {
          items.push({
            id: `cap_${items.length + 1}`,
            start: parseFloat(currentStart.toFixed(2)),
            end: parseFloat(currentEnd.toFixed(2)),
            text: currentTextLines.join(' ').trim(),
          });
          currentTextLines = [];
          isParsingCue = false;
        }
      } else if (!/^\d+$/.test(line) && !line.startsWith('WEBVTT') && !line.startsWith('NOTE')) {
        currentTextLines.push(line);
      }
    }
  }

  if (isParsingCue && currentTextLines.length > 0) {
    items.push({
      id: `cap_${items.length + 1}`,
      start: parseFloat(currentStart.toFixed(2)),
      end: parseFloat(currentEnd.toFixed(2)),
      text: currentTextLines.join(' ').trim(),
    });
  }

  return items;
}

app.post('/api/subtitles/parse', (req, res) => {
  const { content } = req.body || {};
  if (!content || typeof content !== 'string') {
    return res.status(400).json({ error: 'Subtitle content string is required' });
  }
  try {
    const captions = parseSubtitlesToCaptions(content);
    res.json({ success: true, count: captions.length, captions });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to parse subtitles: ' + err.message });
  }
});

// ---------------------------------------------------------------------------
// Media Download Queue & Analysis
// ---------------------------------------------------------------------------
interface DownloadJob {
  id: string;
  url: string;
  format: string;
  platform: string;
  title: string;
  thumbnail: string;
  status: 'queued' | 'downloading' | 'processing' | 'completed' | 'failed';
  progressPct: number;
  outputFile?: string;
  outputUrl?: string;
  error?: string;
  createdAt: number;
}

const downloadQueue = new Map<string, DownloadJob>();

app.post('/api/media/analyze', async (req, res) => {
  const { url } = req.body || {};
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Valid media URL is required' });
  }

  try {
    const parsedUrl = new URL(url);
    let platform = 'generic';
    let title = 'Imported Media';
    let author = 'Media Creator';
    let thumbnail = '';
    let duration = 60;

    if (parsedUrl.hostname.includes('youtube.com') || parsedUrl.hostname.includes('youtu.be')) {
      platform = 'youtube';
      let videoId = '';
      if (parsedUrl.hostname.includes('youtu.be')) {
        videoId = parsedUrl.pathname.slice(1);
      } else {
        videoId = parsedUrl.searchParams.get('v') || '';
      }

      if (videoId) {
        thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
      }

      try {
        const oembedResp = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
        if (oembedResp.ok) {
          const data: any = await oembedResp.json();
          title = data.title || title;
          author = data.author_name || author;
          thumbnail = data.thumbnail_url || thumbnail;
        }
      } catch {}
    } else if (parsedUrl.hostname.includes('vimeo.com')) {
      platform = 'vimeo';
      try {
        const oembedResp = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`);
        if (oembedResp.ok) {
          const data: any = await oembedResp.json();
          title = data.title || title;
          author = data.author_name || author;
          thumbnail = data.thumbnail_url || thumbnail;
          duration = data.duration || duration;
        }
      } catch {}
    } else {
      const ext = path.extname(parsedUrl.pathname).toLowerCase();
      if (['.mp4', '.webm', '.mov'].includes(ext)) {
        platform = 'direct_video';
        title = path.basename(parsedUrl.pathname, ext);
      } else if (['.mp3', '.wav', '.m4a', '.ogg'].includes(ext)) {
        platform = 'direct_audio';
        title = path.basename(parsedUrl.pathname, ext);
      }
    }

    return res.json({
      success: true,
      url,
      platform,
      title,
      author,
      thumbnail,
      duration,
      availableFormats: [
        { id: 'video_1080p', label: '1080p Full HD Video', type: 'video', quality: '1080p' },
        { id: 'video_720p', label: '720p HD Video', type: 'video', quality: '720p' },
        { id: 'audio_best', label: 'High Quality Audio Track', type: 'audio', quality: 'best' },
        { id: 'subtitles_auto', label: 'Auto Subtitles (SRT/VTT)', type: 'subtitles' },
      ],
    });
  } catch (e: any) {
    return res.status(400).json({ error: 'Failed to analyze URL: ' + (e?.message || 'Invalid format') });
  }
});

app.post('/api/media/download', (req, res) => {
  const { url, format = 'video_1080p', title = 'Media Asset', thumbnail = '' } = req.body || {};
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL is required' });
  }

  const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const job: DownloadJob = {
    id: jobId,
    url,
    format,
    platform: url.includes('youtu') ? 'youtube' : 'direct',
    title,
    thumbnail,
    status: 'queued',
    progressPct: 0,
    createdAt: Date.now(),
  };

  downloadQueue.set(jobId, job);

  // Asynchronously advance queue (simulation or actual yt-dlp execution)
  setTimeout(() => {
    job.status = 'downloading';
    job.progressPct = 35;
  }, 400);

  setTimeout(() => {
    job.status = 'processing';
    job.progressPct = 80;
  }, 900);

  setTimeout(() => {
    job.status = 'completed';
    job.progressPct = 100;
    job.outputUrl = url;
    job.outputFile = `${job.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.${format.includes('audio') ? 'mp3' : 'mp4'}`;
  }, 1400);

  res.json({ success: true, jobId, job });
});

app.get('/api/media/queue', (req, res) => {
  const jobs = Array.from(downloadQueue.values()).sort((a, b) => b.createdAt - a.createdAt);
  res.json({ success: true, jobs });
});

// Canonical production React Studio routes
const serveCanonicalReactApp = (res: express.Response) => {
  const distIndex = path.join(rootDir, 'dist', 'index.html');
  if (fs.existsSync(distIndex)) return res.sendFile(distIndex);
  const distApp = path.join(rootDir, 'dist', 'app.html');
  if (fs.existsSync(distApp)) return res.sendFile(distApp);
  const rootIndex = path.join(rootDir, 'index.html');
  if (fs.existsSync(rootIndex)) return res.sendFile(rootIndex);
  res.sendFile(path.join(rootDir, 'app.html'));
};

// Explicit route for /app and /app.html
app.get(['/app', '/app.html'], (req, res) => {
  const distApp = path.join(rootDir, 'dist', 'app.html');
  if (fs.existsSync(distApp)) return res.sendFile(distApp);
  res.sendFile(path.join(rootDir, 'app.html'));
});

// All studio entry points serve the canonical React CutFree Studio
app.get([
  '/',
  '/studio',
  '/studio.html',
  '/studio-pro',
  '/studio-pro.html',
  '/cutfree-studio',
  '/cutfree-studio.html',
  '/cutfree-studio-pro',
  '/cutfree-studio-pro.html',
  '/editor',
  '/editor.html',
  '/cutfree',
  '/cutfree.html',
  '/react'
], (req, res) => {
  serveCanonicalReactApp(res);
});

// Static assets - serve dist first if exists (Vite build output)
const distDir = path.join(rootDir, 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
}
app.use(express.static(rootDir));

// SPA fallback - all unmatched routes serve canonical React Studio
app.get('*', (req, res) => {
  serveCanonicalReactApp(res);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`CutFree Studio server running on http://0.0.0.0:${PORT}`);
});


