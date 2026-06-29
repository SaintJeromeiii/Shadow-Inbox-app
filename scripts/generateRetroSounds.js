#!/usr/bin/env node
/**
 * Generates original retro WAV assets for Shadow Inbox (no external samples).
 */
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'assets', 'audio');
const SAMPLE_RATE = 22050;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function writeWav(filePath, samples) {
  const numSamples = samples.length;
  const buffer = Buffer.alloc(44 + numSamples * 2);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + numSamples * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(numSamples * 2, 40);

  for (let i = 0; i < numSamples; i += 1) {
    const value = clamp(Math.round(samples[i] * 32767), -32768, 32767);
    buffer.writeInt16LE(value, 44 + i * 2);
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);
}

function renderTone({ frequency, durationSec, volume = 0.35, wave = 'square' }) {
  const count = Math.floor(SAMPLE_RATE * durationSec);
  const samples = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const t = i / SAMPLE_RATE;
    const envelope = Math.exp(-t * 6);
    let sample = 0;
    if (wave === 'square') {
      sample = Math.sign(Math.sin(2 * Math.PI * frequency * t));
    } else {
      sample = Math.sin(2 * Math.PI * frequency * t);
    }
    samples[i] = sample * volume * envelope;
  }
  return samples;
}

function renderNoiseBurst(durationSec, volume = 0.22) {
  const count = Math.floor(SAMPLE_RATE * durationSec);
  const samples = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const t = i / SAMPLE_RATE;
    const envelope = Math.exp(-t * 14);
    samples[i] = (Math.random() * 2 - 1) * volume * envelope;
  }
  return samples;
}

function concatSegments(segments) {
  const total = segments.reduce((sum, segment) => sum + segment.length, 0);
  const merged = new Float32Array(total);
  let offset = 0;
  for (const segment of segments) {
    merged.set(segment, offset);
    offset += segment.length;
  }
  return merged;
}

function renderDeleteAction() {
  const tones = [880, 660, 440, 220].map((frequency, index) =>
    renderTone({
      frequency,
      durationSec: 0.09,
      volume: 0.28 - index * 0.04,
      wave: 'square',
    }),
  );
  return concatSegments([...tones, renderNoiseBurst(0.08, 0.18)]);
}

function renderActionComplete() {
  const tones = [523.25, 659.25, 783.99, 1046.5].map((frequency) =>
    renderTone({
      frequency,
      durationSec: 0.07,
      volume: 0.32,
      wave: 'square',
    }),
  );
  return concatSegments(tones);
}

function renderLevelUp() {
  const tones = [220, 277.18, 329.63, 392, 493.88, 659.25, 783.99, 1046.5].map(
    (frequency, index) =>
      renderTone({
        frequency,
        durationSec: 0.1,
        volume: 0.26 + index * 0.015,
        wave: 'square',
      }),
  );
  const shimmer = renderTone({
    frequency: 1318.5,
    durationSec: 0.22,
    volume: 0.2,
    wave: 'square',
  });
  return concatSegments([...tones, shimmer]);
}

/** Neon Warden — arcade punch impact */
function renderDeletePunch() {
  const thump = renderTone({
    frequency: 95,
    durationSec: 0.12,
    volume: 0.55,
    wave: 'square',
  });
  const crack = renderNoiseBurst(0.05, 0.42);
  const snap = renderTone({
    frequency: 180,
    durationSec: 0.04,
    volume: 0.35,
    wave: 'square',
  });
  return concatSegments([crack, thump, snap]);
}

/** Grid Stalker — ratcheting wrench clicks */
function renderDeleteWrench() {
  const clicks = [520, 640, 520, 720, 580].map((frequency, index) =>
    renderTone({
      frequency,
      durationSec: 0.035,
      volume: 0.3,
      wave: 'square',
    }),
  );
  const clanks = clicks.map((click, index) => {
    const gap =
      index === 0
        ? new Float32Array(0)
        : new Float32Array(Math.floor(SAMPLE_RATE * 0.04));
    return concatSegments([gap, click, renderNoiseBurst(0.02, 0.12)]);
  });
  return concatSegments(clanks);
}

/** Void Singularity — solar beam charge and fire */
function renderDeleteSolarBeam() {
  const chargeCount = Math.floor(SAMPLE_RATE * 0.08);
  const charge = new Float32Array(chargeCount);
  for (let i = 0; i < chargeCount; i += 1) {
    const t = i / SAMPLE_RATE;
    const freq = 320 + t * 2400;
    const envelope = 0.15 + t * 4;
    charge[i] = Math.sin(2 * Math.PI * freq * t) * envelope;
  }

  const beamCount = Math.floor(SAMPLE_RATE * 0.18);
  const beam = new Float32Array(beamCount);
  for (let i = 0; i < beamCount; i += 1) {
    const t = i / SAMPLE_RATE;
    const envelope = Math.exp(-t * 4.5);
    const core = Math.sin(2 * Math.PI * 880 * t) * 0.38;
    const shimmer = Math.sin(2 * Math.PI * 1760 * t) * 0.18;
    const sub = Math.sin(2 * Math.PI * 440 * t) * 0.22;
    beam[i] = (core + shimmer + sub) * envelope;
  }

  const tail = renderTone({
    frequency: 660,
    durationSec: 0.1,
    volume: 0.2,
    wave: 'sine',
  });

  return concatSegments([charge, beam, tail]);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
writeWav(path.join(OUT_DIR, 'delete_action.wav'), renderDeleteAction());
writeWav(path.join(OUT_DIR, 'delete_punch.wav'), renderDeletePunch());
writeWav(path.join(OUT_DIR, 'delete_wrench.wav'), renderDeleteWrench());
writeWav(path.join(OUT_DIR, 'delete_solar_beam.wav'), renderDeleteSolarBeam());
writeWav(path.join(OUT_DIR, 'action_complete.wav'), renderActionComplete());
writeWav(path.join(OUT_DIR, 'level_up.wav'), renderLevelUp());
console.log('Generated retro sounds in assets/audio/');
