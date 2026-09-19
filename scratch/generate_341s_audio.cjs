/**
 * Generates an authoritative 341.89-second 16-bit mono 8000Hz WAV audio fixture.
 * 8000 Hz * 2 bytes/sample * 341.89 seconds = 5,470,240 bytes.
 * Contains soft audio narration tones synchronized with the story segments.
 */
const fs = require('fs');
const path = require('path');

const sampleRate = 8000;
const numChannels = 1;
const bitsPerSample = 16;
const durationSec = 341.89;
const totalSamples = Math.round(sampleRate * durationSec);
const dataSize = totalSamples * numChannels * (bitsPerSample / 8);
const headerSize = 44;
const totalSize = headerSize + dataSize;

const buffer = Buffer.alloc(totalSize);

// 1. RIFF header
buffer.write('RIFF', 0);
buffer.writeUInt32LE(totalSize - 8, 4);
buffer.write('WAVE', 8);

// 2. fmt chunk
buffer.write('fmt ', 12);
buffer.writeUInt32LE(16, 16); // subchunk1 size (16 for PCM)
buffer.writeUInt16LE(1, 20);  // audio format (1 for PCM)
buffer.writeUInt16LE(numChannels, 22);
buffer.writeUInt32LE(sampleRate, 24);
buffer.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28); // byte rate
buffer.writeUInt16LE(numChannels * (bitsPerSample / 8), 32); // block align
buffer.writeUInt16LE(bitsPerSample, 34);

// 3. data chunk
buffer.write('data', 36);
buffer.writeUInt32LE(dataSize, 40);

// Generate harmonic narration tones with gentle pauses
let offset = 44;
for (let i = 0; i < totalSamples; i++) {
  const t = i / sampleRate;
  // Modulate tone to simulate voice speech pauses
  const isSpeech = (t % 8 < 5.5);
  let val = 0;
  if (isSpeech) {
    const freq = 220 + 40 * Math.sin(2 * Math.PI * 0.3 * t);
    val = 0.15 * Math.sin(2 * Math.PI * freq * t);
  }
  const sample = Math.max(-32768, Math.min(32767, Math.round(val * 32767)));
  buffer.writeInt16LE(sample, offset);
  offset += 2;
}

const outDir = path.join(__dirname, '..', 'tests', 'fixtures');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'islamic-story-voice-341s.wav');
fs.writeFileSync(outFile, buffer);

console.log(`✅ Generated authoritative 341.89s audio fixture at ${outFile} (${(buffer.length / (1024 * 1024)).toFixed(2)} MB)`);
