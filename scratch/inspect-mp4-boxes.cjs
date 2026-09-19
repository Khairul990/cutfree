const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox'],
  });

  const page = await browser.newPage();
  await page.goto('about:blank');

  const mp4Buffer = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 180;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'blue';
    ctx.fillRect(0, 0, 320, 180);

    const stream = canvas.captureStream(0);
    const track = stream.getVideoTracks()[0];

    const recorder = new MediaRecorder(stream, {
      mimeType: 'video/mp4;codecs=avc3',
    });

    const chunks = [];
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

    recorder.start();
    for (let f = 0; f < 30; f++) {
      ctx.fillStyle = f % 2 === 0 ? 'red' : 'blue';
      ctx.fillRect(0, 0, 320, 180);
      track.requestFrame();
      await new Promise(r => setTimeout(r, 10));
    }
    recorder.requestData();
    recorder.stop();

    await new Promise(r => { recorder.onstop = r; });
    const blob = new Blob(chunks, { type: 'video/mp4' });
    const ab = await blob.arrayBuffer();
    return Array.from(new Uint8Array(ab));
  });

  console.log('MP4 byte length:', mp4Buffer.length);
  const buf = Buffer.from(mp4Buffer);
  fs.writeFileSync('scratch/test-sample.mp4', buf);

  // Parse top-level boxes
  let offset = 0;
  while (offset < buf.length) {
    const size = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    console.log(`Box: ${type}, size: ${size}, offset: ${offset}`);
    if (size === 0) break;
    offset += size;
  }

  await browser.close();
})();
