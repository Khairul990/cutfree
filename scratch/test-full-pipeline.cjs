const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const MUXER_JS = fs.readFileSync(path.join(ROOT, 'js', 'studio', 'muxer.js'), 'utf8');

(async () => {
  const server = spawn('node', ['dist/server.cjs'], { env: { ...process.env, PORT: '8165' }, stdio: 'pipe' });
  await new Promise(r => setTimeout(r, 1200));

  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  
  await page.goto('http://127.0.0.1:8165/app');
  
  // Inject muxer script
  await page.addScriptTag({ content: MUXER_JS });

  const result = await page.evaluate(async () => {
    const duration = 10;
    const fps = 30;
    const width = 640;
    const height = 360;
    const totalFrames = duration * fps;

    const muxer = window.CFX.webm.createMuxer({
      width,
      height,
      fps,
      videoCodec: 'vp09',
      sampleRate: 48000,
      channels: 2,
    });

    const videoEncoder = new VideoEncoder({
      output: (chunk) => muxer.addVideoChunk(chunk),
      error: (e) => console.error(e)
    });

    videoEncoder.configure({
      codec: 'vp09.00.10.08',
      width,
      height,
      bitrate: 2_000_000,
      framerate: fps,
    });

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    for (let f = 0; f < totalFrames; f++) {
      ctx.fillStyle = f % 2 === 0 ? '#112233' : '#223344';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#ffffff';
      ctx.font = '24px sans-serif';
      ctx.fillText(`Frame ${f} / ${totalFrames}`, 50, 100);

      const frame = new VideoFrame(canvas, {
        timestamp: Math.round(f * (1e6 / fps)),
        duration: Math.round(1e6 / fps),
      });
      videoEncoder.encode(frame, { keyFrame: f % 60 === 0 });
      frame.close();
      if (videoEncoder.encodeQueueSize > 4) {
        await new Promise(r => setTimeout(r, 1));
      }
    }

    await videoEncoder.flush();
    videoEncoder.close();

    const blob = muxer.finalize(duration);
    const url = URL.createObjectURL(blob);

    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = url;
    const meta = await new Promise(resolve => {
      video.onloadedmetadata = () => resolve({
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        duration: video.duration,
      });
      video.onerror = () => resolve({ error: video.error ? video.error.message : 'error' });
      setTimeout(() => resolve({ timeout: true, duration: video.duration }), 3000);
    });

    return {
      blobSize: blob.size,
      blobType: blob.type,
      meta,
    };
  });

  console.log('Muxer + WebCodecs result:', result);

  await browser.close();
  server.kill();
})();
