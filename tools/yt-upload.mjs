#!/usr/bin/env node
/* ============================================================================
   CutFree Studio — unattended YouTube uploader
   Zero dependencies (Node 18+ built-ins only). Device-flow OAuth, so no
   redirect URI, no browser-side CORS, no server, no cost.

   One-time setup (2 minutes, free):
     1. console.cloud.google.com → new project
     2. APIs & Services → Library → enable "YouTube Data API v3"
     3. APIs & Services → OAuth consent screen → External → add yourself as a
        test user (no verification needed for personal use)
     4. Credentials → Create credentials → OAuth client ID
        → Application type: "TVs and Limited Input devices"   ← this is the key
     5. copy the Client ID (and secret if Google shows one) and run:
          node tools/yt-upload.mjs login --client-id <ID> [--client-secret <SECRET>]

   Then drop the folder exported by "পাবলিশ প্যাক" here and run:
          node tools/yt-upload.mjs upload --dir ./publish --privacy private

   What it does per video:
     - videos.insert (resumable, chunked) with title/description/tags/category,
       privacy + optional publishAt schedule read from metadata.json
     - thumbnails.set with thumbnail.png/jpg when present (needs the video to be
       verified for custom thumbnails)
     - remembers uploads in .cutfree-uploads.json so re-runs never double-post
     - stops politely at 6 uploads (the free daily quota is 10,000 units and an
       upload costs 1,600) and tells you when the quota resets

   Flags: --dir, --privacy public|unlisted|private, --schedule, --limit N,
          --dry-run, --only <substring>, --client-id, --client-secret, --help
   ============================================================================ */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';

const CONFIG_DIR = path.join(os.homedir(), '.cutfree-studio');
const TOKEN_FILE = path.join(CONFIG_DIR, 'youtube-tokens.json');
const CONFIG_FILE = path.join(CONFIG_DIR, 'youtube-config.json');
const STATE_FILE = '.cutfree-uploads.json';

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube'
].join(' ');

/* ------------------------------------------------------------------ helpers */
const c = {
  dim: s => `\x1b[2m${s}\x1b[0m`,
  bold: s => `\x1b[1m${s}\x1b[0m`,
  green: s => `\x1b[32m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  red: s => `\x1b[31m${s}\x1b[0m`,
  cyan: s => `\x1b[36m${s}\x1b[0m`
};

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      const key = k.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
      if (v !== undefined) out[key] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) out[key] = argv[++i];
      else out[key] = true;
    } else out._.push(a);
  }
  return out;
}

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
}

function loadJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
}
function saveJson(file, data) {
  ensureConfigDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2), { mode: 0o600 });
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function fmtBytes(n) {
  const u = ['B', 'KB', 'MB', 'GB']; let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i ? 1 : 0)} ${u[i]}`;
}

async function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()); }));
}

async function postForm(url, params) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString()
  });
  const text = await res.text();
  let json = {};
  try { json = JSON.parse(text); } catch (e) { }
  if (!res.ok) {
    const err = new Error(json.error_description || json.error || `HTTP ${res.status}: ${text.slice(0, 200)}`);
    err.status = res.status;
    err.code = json.error;
    throw err;
  }
  return json;
}

/* ------------------------------------------------------------- device flow */
async function login(args) {
  const cfg = loadJson(CONFIG_FILE, {});
  let clientId = args.clientId || cfg.clientId || process.env.CUTFREE_YT_CLIENT_ID;
  let clientSecret = args.clientSecret || cfg.clientSecret || process.env.CUTFREE_YT_CLIENT_SECRET || '';

  if (!clientId) {
    console.log(c.yellow('No client id yet.'));
    console.log('Create one at console.cloud.google.com → Credentials → OAuth client ID');
    console.log('Application type must be: ' + c.bold('TVs and Limited Input devices'));
    console.log(c.dim('(docs: README → "YouTube অটো-আপলোড সেটআপ")'));
    clientId = await ask('Client ID: ');
    if (!clientId) throw new Error('client id is required');
    const s = await ask('Client secret (leave empty if none): ');
    if (s) clientSecret = s;
  }

  console.log(c.dim('Requesting a device code…'));
  const device = await postForm('https://oauth2.googleapis.com/device/code', {
    client_id: clientId, scope: SCOPES
  });

  console.log('');
  console.log(c.bold('  1. Open: ') + c.cyan(device.verification_url || 'https://google.com/device'));
  console.log(c.bold('  2. Enter code: ') + c.green(device.user_code));
  console.log(c.dim('  (waiting for you to approve…)'));
  console.log('');

  const interval = (Number(device.interval) || 5) * 1000;
  const deadline = Date.now() + (Number(device.expires_in) || 1800) * 1000;

  while (Date.now() < deadline) {
    await sleep(interval);
    try {
      const tok = await postForm('https://oauth2.googleapis.com/token', {
        client_id: clientId,
        client_secret: clientSecret,
        device_code: device.device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
      });
      saveJson(CONFIG_FILE, Object.assign({}, cfg, { clientId, clientSecret }));
      saveJson(TOKEN_FILE, {
        access_token: tok.access_token,
        refresh_token: tok.refresh_token,
        expires_at: Date.now() + (tok.expires_in || 3600) * 1000 - 60000
      });
      console.log(c.green('✅ Logged in. Tokens saved to ') + TOKEN_FILE);
      console.log(c.dim('   (the refresh token keeps working for unattended uploads)'));
      return;
    } catch (err) {
      if (err.code === 'authorization_pending') continue;
      if (err.code === 'slow_down') { await sleep(2000); continue; }
      if (err.code === 'access_denied') throw new Error('access denied — did you approve the request?');
      if (err.code === 'expired_token') throw new Error('device code expired, run login again');
      throw err;
    }
  }
  throw new Error('timed out waiting for approval');
}

async function accessToken() {
  const cfg = loadJson(CONFIG_FILE, {});
  const tok = loadJson(TOKEN_FILE, null);
  if (!tok || !tok.refresh_token) throw new Error('not logged in — run: node tools/yt-upload.mjs login');
  if (tok.expires_at && Date.now() < tok.expires_at) return tok.access_token;

  const fresh = await postForm('https://oauth2.googleapis.com/token', {
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret || undefined,
    refresh_token: tok.refresh_token,
    grant_type: 'refresh_token'
  });
  const merged = Object.assign({}, tok, {
    access_token: fresh.access_token,
    expires_at: Date.now() + (fresh.expires_in || 3600) * 1000 - 60000
  });
  saveJson(TOKEN_FILE, merged);
  return merged.access_token;
}

/* ------------------------------------------------------------------ upload */
async function resumableUpload({ token, file, meta, onProgress }) {
  const stat = fs.statSync(file);
  const body = {
    snippet: {
      title: (meta.title || path.basename(file)).slice(0, 100),
      description: meta.description || '',
      tags: meta.tags || [],
      categoryId: meta.categoryId || '22',
      defaultLanguage: meta.defaultLanguage || 'en'
    },
    status: {
      privacyStatus: meta.publishAt ? 'private' : (meta.privacyStatus || 'private'),
      selfDeclaredMadeForKids: false
    }
  };
  if (meta.publishAt) body.status.publishAt = meta.publishAt;

  const init = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Length': String(stat.size),
      'X-Upload-Content-Type': 'video/webm'
    },
    body: JSON.stringify(body)
  });
  if (!init.ok) {
    const t = await init.text();
    const err = new Error(`init failed: ${init.status} ${t.slice(0, 300)}`);
    if (/quota/i.test(t)) err.quota = true;
    throw err;
  }
  const session = init.headers.get('location');
  if (!session) throw new Error('no resumable session URL');

  // 4 MB chunks, resumable across failures
  const CHUNK = 4 * 1024 * 1024;
  const fd = fs.openSync(file, 'r');
  let offset = 0;
  let result = null;
  try {
    while (offset < stat.size) {
      const size = Math.min(CHUNK, stat.size - offset);
      const buf = Buffer.allocUnsafe(size);
      fs.readSync(fd, buf, 0, size, offset);
      const end = offset + size - 1;
      const res = await fetch(session, {
        method: 'PUT',
        headers: {
          'Content-Length': String(size),
          'Content-Range': `bytes ${offset}-${end}/${stat.size}`
        },
        body: buf
      });
      if (res.status === 308) {                       // resumable incomplete
        const range = res.headers.get('range');
        offset = range ? Number(range.split('-')[1]) + 1 : end + 1;
        if (onProgress) onProgress(offset / stat.size);
        continue;
      }
      if (!res.ok) {
        const t = await res.text();
        const err = new Error(`upload failed: ${res.status} ${t.slice(0, 300)}`);
        if (/quota/i.test(t)) err.quota = true;
        throw err;
      }
      result = await res.json();
      if (onProgress) onProgress(1);
      break;
    }
  } finally {
    fs.closeSync(fd);
  }
  if (!result) throw new Error('upload did not complete');
  return result;
}

async function setThumbnail(token, videoId, file) {
  const buf = fs.readFileSync(file);
  const mime = /\.png$/i.test(file) ? 'image/png' : 'image/jpeg';
  const res = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': mime, 'Content-Length': String(buf.length) },
    body: buf
  });
  if (!res.ok) {
    const t = await res.text();
    return { ok: false, reason: `${res.status} ${t.slice(0, 120)}` };
  }
  return { ok: true };
}

/* -------------------------------------------------------------------- scan */
function findJobs(dir, only) {
  const files = fs.readdirSync(dir);
  const videos = files.filter(f => /\.(webm|mp4|mov|mkv)$/i.test(f) && !f.startsWith('.'));
  return videos
    .filter(v => !only || v.includes(only))
    .map(video => {
      const base = video.replace(/\.[^.]+$/, '');
      const metaFile = files.find(f => f === base + '.json') ||
        files.find(f => f === 'metadata.json' && videos.length === 1);
      let meta = {};
      let specMeta = {};
      if (metaFile) {
        const raw = loadJson(path.join(dir, metaFile), {});
        specMeta = raw.youtube || raw;
        meta = Object.assign({}, specMeta);
        if (raw.spec && raw.spec.meta) {
          meta.title = meta.title || raw.spec.meta.title;
          meta.defaultLanguage = raw.spec.meta.language === 'en' ? 'en' : 'bn';
        }
      }
      if (!meta.title) meta.title = base.replace(/[-_]+/g, ' ');
      const thumb = files.find(f => /^thumbnail\.(png|jpg|jpeg)$/i.test(f) &&
        (!base || f.startsWith('thumbnail')));
      return {
        video: path.join(dir, video),
        videoName: video,
        thumb: thumb ? path.join(dir, thumb) : null,
        meta
      };
    });
}

/* -------------------------------------------------------------------- main */
async function upload(args) {
  const dir = path.resolve(args.dir || 'publish');
  if (!fs.existsSync(dir)) throw new Error(`folder not found: ${dir}`);
  const jobs = findJobs(dir, args.only);
  if (!jobs.length) throw new Error(`no video files in ${dir}`);

  const statePath = path.join(dir, STATE_FILE);
  const state = loadJson(statePath, { uploaded: {} });
  const limit = args.limit ? Number(args.limit) : 6;      // 6 uploads = 9,600 units of the free 10,000/day
  let done = 0;

  const token = args.dryRun ? null : await accessToken();

  for (const job of jobs) {
    if (done >= limit) {
      console.log(c.yellow(`\n⏸  Stopped after ${done} uploads (free quota is ~6 per day).`));
      console.log(c.dim('   Quota resets at midnight Pacific Time. Re-run then for the rest.'));
      return;
    }
    if (state.uploaded[job.videoName]) {
      console.log(c.dim(`↷ already uploaded: ${job.videoName} → ${state.uploaded[job.videoName].id}`));
      continue;
    }

    const size = fs.statSync(job.video).size;
    const when = job.meta.publishAt ? ` 📅 ${job.meta.publishAt}` : '';
    console.log(`\n${c.bold('⬆️  ' + job.meta.title)}`);
    console.log(c.dim(`   ${job.videoName} · ${fmtBytes(size)} · ${job.meta.privacyStatus || 'private'}${when}`));
    if (job.meta.tags && job.meta.tags.length) console.log(c.dim('   tags: ' + job.meta.tags.slice(0, 8).join(', ')));

    if (args.dryRun) { done++; continue; }

    let lastPct = -1;
    const video = await resumableUpload({
      token, file: job.video, meta: job.meta,
      onProgress: p => {
        const pct = Math.round(p * 100);
        if (pct !== lastPct && pct % 5 === 0) { process.stdout.write(`\r   ${pct}% uploaded…`); lastPct = pct; }
      }
    });
    process.stdout.write('\r   ' + c.green(`✅ uploaded: https://youtu.be/${video.id}`) + '\n');

    if (job.thumb) {
      const t = await setThumbnail(token, video.id, job.thumb);
      console.log(t.ok ? '   🖼  thumbnail set' : c.dim(`   🖼  thumbnail skipped (${t.reason})`));
    }

    state.uploaded[job.videoName] = { id: video.id, title: job.meta.title, at: new Date().toISOString() };
    saveJson(statePath, state);
    done++;
  }

  console.log('\n' + c.green(`🎉 done — ${done} upload(s) this run`));
  console.log(c.dim('   state file: ' + statePath + ' (delete entries to re-upload)'));
}

function help() {
  console.log(`
${c.bold('CutFree Studio — YouTube uploader')} ${c.dim('(zero dependencies)')}

  node tools/yt-upload.mjs login    [--client-id ID] [--client-secret SECRET]
  node tools/yt-upload.mjs upload   [--dir ./publish] [--privacy private|unlisted|public]
                                    [--limit 6] [--only substring] [--dry-run]
  node tools/yt-upload.mjs status

${c.bold('Setup')} (free): Google Cloud → enable "YouTube Data API v3" → create an
OAuth client of type ${c.bold('"TVs and Limited Input devices"')} → then run "login".
Device-flow OAuth means no redirect URL and no server of your own.

${c.bold('Quota')}: the YouTube Data API gives 10,000 units/day free; one upload
costs 1,600 units, so ~6 videos per day per project. Scheduled videos
(publishAt) upload as private and go public by themselves.

${c.bold('Fully unattended' )}: point --dir at the folder you exported from the
studio and add it to cron:
  0 9 * * *  cd /path/to/cutfree && node tools/yt-upload.mjs upload --dir ./publish >> yt.log 2>&1
`);
}

function status() {
  const cfg = loadJson(CONFIG_FILE, {});
  const tok = loadJson(TOKEN_FILE, null);
  console.log(c.bold('\nCutFree Studio — YouTube status\n'));
  console.log('  client id : ' + (cfg.clientId ? c.green('✓ configured') + c.dim(' ' + cfg.clientId.slice(0, 18) + '…') : c.yellow('✗ not set')));
  console.log('  refresh   : ' + (tok && tok.refresh_token ? c.green('✓ stored') : c.yellow('✗ run "login"')));
  if (tok && tok.expires_at) console.log('  access    : ' + c.dim(new Date(tok.expires_at).toISOString()));
  console.log(c.dim('\n  config: ' + CONFIG_FILE));
  console.log(c.dim('  tokens: ' + TOKEN_FILE + '\n'));
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0] || (args.help ? 'help' : 'help');
  try {
    if (cmd === 'login') await login(args);
    else if (cmd === 'upload') await upload(args);
    else if (cmd === 'status') status();
    else help();
  } catch (err) {
    if (err.quota) {
      console.error(c.red('\n⛔ YouTube quota exhausted.'));
      console.error(c.dim('   The free 10,000 units/day reset at midnight Pacific Time.'));
      console.error(c.dim('   Your scheduled videos keep publishing by themselves meanwhile.'));
    } else {
      console.error(c.red('\n✖ ' + err.message));
    }
    process.exit(1);
  }
})();
