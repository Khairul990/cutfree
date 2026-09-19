const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const AUDIO_PATH = path.join(ROOT, 'tests', 'fixtures', 'islamic-story-voice-341s.wav');

(async () => {
  const server = spawn('node', ['dist/server.cjs'], { env: { ...process.env, PORT: '8160' }, stdio: 'pipe' });
  await new Promise(r => setTimeout(r, 1200));

  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  
  await page.goto('http://127.0.0.1:8160/app');
  
  const audioBufferData = fs.readFileSync(AUDIO_PATH).toString('base64');

  const testResult = await page.evaluate(async (b64) => {
    // 1. Decode audio
    const raw = atob(b64);
    const u8 = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
    const audioCtx = new AudioContext();
    const origBuffer = await audioCtx.decodeAudioData(u8.buffer);
    
    // 2. Resample to 48000 if needed
    const offlineCtx = new OfflineAudioContext(2, Math.ceil(origBuffer.duration * 48000), 48000);
    const src = offlineCtx.createBufferSource();
    src.buffer = origBuffer;
    src.connect(offlineCtx.destination);
    src.start();
    const audioBuffer = await offlineCtx.startRendering();

    // 3. Test AudioEncoder
    let audioChunks = 0;
    let audioDesc = null;
    const audioEncoder = new AudioEncoder({
      output: (chunk, meta) => {
        audioChunks++;
        if (meta && meta.decoderConfig && meta.decoderConfig.description) {
          audioDesc = meta.decoderConfig.description;
        }
      },
      error: (e) => console.error('AudioEncoder error:', e)
    });

    audioEncoder.configure({
      codec: 'opus',
      sampleRate: 48000,
      numberOfChannels: 2,
      bitrate: 128000
    });

    const chunkFrames = 960; // 20ms at 48kHz
    const total = Math.ceil(audioBuffer.length / chunkFrames);
    const d0 = audioBuffer.getChannelData(0);
    const d1 = audioBuffer.getChannelData(1);

    for (let p = 0; p < total; p++) {
      const frames = Math.min(chunkFrames, audioBuffer.length - p * chunkFrames);
      const planar = new Float32Array(frames * 2);
      planar.set(d0.subarray(p * chunkFrames, p * chunkFrames + frames), 0);
      planar.set(d1.subarray(p * chunkFrames, p * chunkFrames + frames), frames);

      const ad = new AudioData({
        format: 'f32-planar',
        sampleRate: 48000,
        numberOfFrames: frames,
        numberOfChannels: 2,
        timestamp: Math.round(p * chunkFrames / 48000 * 1e6),
        data: planar
      });
      audioEncoder.encode(ad);
      ad.close();
    }

    await audioEncoder.flush();
    audioEncoder.close();

    return {
      origDuration: origBuffer.duration,
      resampledDuration: audioBuffer.duration,
      audioChunks,
      hasDesc: !!audioDesc,
    };
  }, audioBufferData);

  console.log('Audio encoding test result:', testResult);

  await browser.close();
  server.kill();
})();
