// audio.js — all of NEONVOID's sound is synthesized with WebAudio: no audio files.
// Short oscillator and noise voices make the effects; a lookahead step sequencer
// plays the bass-and-hat music loop and adds layers as the waves climb. The context
// is created lazily on the first user gesture, as browsers require, and every call
// is a no-op until then, so the game code never has to care whether sound is live.

let ctx = null;
let master = null;
let musicGain = null;
let noiseBuffer = null;
let muted = false;

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.5;
  master.connect(ctx.destination);
  musicGain = ctx.createGain();
  musicGain.gain.value = 0.34;
  musicGain.connect(master);
  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  startSequencer();
}

export function setMuted(value) {
  muted = value;
  if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.5, ctx.currentTime, 0.02);
}

export function isMuted() {
  return muted;
}

// --- one-shot voices -------------------------------------------------------

function tone({ type = 'square', from = 440, to = null, dur = 0.1, vol = 0.2, delay = 0, curve = 'exp' }) {
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  if (to !== null) {
    if (curve === 'exp') osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    else osc.frequency.linearRampToValueAtTime(to, t0 + dur);
  }
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise({ dur = 0.2, vol = 0.25, delay = 0, filterFrom = 3000, filterTo = 300, type = 'lowpass' }) {
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(filterFrom, t0);
  filter.frequency.exponentialRampToValueAtTime(Math.max(40, filterTo), t0 + dur);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(filter).connect(gain).connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

let lastShardAt = 0;

export const sfx = {
  shoot() {
    tone({ type: 'square', from: 840 + Math.random() * 120, to: 240, dur: 0.07, vol: 0.055 });
  },
  enemyHit() {
    tone({ type: 'square', from: 300, to: 190, dur: 0.04, vol: 0.05 });
  },
  enemyDie() {
    noise({ dur: 0.22, vol: 0.16, filterFrom: 2600, filterTo: 200 });
    tone({ type: 'sine', from: 320, to: 46, dur: 0.24, vol: 0.18 });
  },
  bigDie() {
    noise({ dur: 0.5, vol: 0.3, filterFrom: 3200, filterTo: 90 });
    tone({ type: 'sine', from: 200, to: 30, dur: 0.55, vol: 0.3 });
    tone({ type: 'sawtooth', from: 90, to: 24, dur: 0.5, vol: 0.12, delay: 0.03 });
  },
  playerHit() {
    tone({ type: 'sawtooth', from: 220, to: 38, dur: 0.32, vol: 0.3 });
    noise({ dur: 0.25, vol: 0.2, filterFrom: 1800, filterTo: 150 });
  },
  shieldBreak() {
    tone({ type: 'triangle', from: 1200, to: 300, dur: 0.18, vol: 0.22 });
    noise({ dur: 0.15, vol: 0.12, filterFrom: 5000, filterTo: 900, type: 'bandpass' });
  },
  dash() {
    noise({ dur: 0.16, vol: 0.13, filterFrom: 500, filterTo: 4200, type: 'bandpass' });
  },
  shard() {
    if (!ctx) return;
    const now = performance.now();
    if (now - lastShardAt < 45) return; // a stream of shards is one sparkle, not twenty
    lastShardAt = now;
    tone({ type: 'sine', from: 1320 + Math.random() * 240, to: 1980, dur: 0.06, vol: 0.05 });
  },
  pickup() {
    tone({ type: 'triangle', from: 660, dur: 0.09, vol: 0.16 });
    tone({ type: 'triangle', from: 990, dur: 0.12, vol: 0.16, delay: 0.07 });
  },
  upgrade() {
    [523, 659, 784, 1047].forEach((f, i) =>
      tone({ type: 'triangle', from: f, dur: 0.16, vol: 0.15, delay: i * 0.06 }));
  },
  waveStart() {
    tone({ type: 'sawtooth', from: 110, to: 440, dur: 0.4, vol: 0.1, curve: 'lin' });
    tone({ type: 'square', from: 55, to: 220, dur: 0.4, vol: 0.07, curve: 'lin' });
  },
  bossAlarm() {
    for (let i = 0; i < 3; i++) {
      tone({ type: 'square', from: 392, dur: 0.14, vol: 0.14, delay: i * 0.32 });
      tone({ type: 'square', from: 311, dur: 0.14, vol: 0.14, delay: i * 0.32 + 0.16 });
    }
  },
  comboLost() {
    tone({ type: 'sine', from: 500, to: 240, dur: 0.16, vol: 0.08 });
  },
  gameOver() {
    [440, 349, 262, 196].forEach((f, i) =>
      tone({ type: 'triangle', from: f, dur: 0.34, vol: 0.16, delay: i * 0.17 }));
  },
  click() {
    tone({ type: 'square', from: 700, to: 500, dur: 0.05, vol: 0.08 });
  },
};

// --- music sequencer -------------------------------------------------------
// A minor bass line with hats; from wave 3 a plucked lead joins, and the boss
// waves drop to a tenser two-note pulse. Steps are scheduled ahead of time.

const BPM = 112;
const STEP = 60 / BPM / 2; // eighth notes
const BASS_LINE = [45, 0, 45, 0, 53, 0, 45, 0, 41, 0, 41, 0, 48, 0, 50, 0]; // A minor walk, MIDI notes
const LEAD_LINE = [69, 0, 72, 0, 76, 0, 72, 0, 74, 0, 69, 0, 67, 0, 64, 0];

let seqStep = 0;
let nextStepAt = 0;
let intensity = 0; // 0 = title calm, 1 = mid waves, 2 = boss

export function setMusicIntensity(level) {
  intensity = level;
}

function midiHz(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function scheduleStep(step, t0) {
  const delay = Math.max(0, t0 - ctx.currentTime);
  const bar = BASS_LINE[step % 16];
  if (bar) {
    tone({ type: 'sawtooth', from: midiHz(bar), dur: STEP * 0.9, vol: 0.11, delay });
    tone({ type: 'sine', from: midiHz(bar - 12), dur: STEP * 0.9, vol: 0.1, delay });
  }
  if (step % 2 === 0) noise({ dur: 0.03, vol: 0.028, delay, filterFrom: 8000, filterTo: 6000, type: 'highpass' });
  if (intensity >= 1) {
    const lead = LEAD_LINE[step % 16];
    if (lead && step % 32 >= 16) tone({ type: 'triangle', from: midiHz(lead), dur: 0.14, vol: 0.05, delay });
  }
  if (intensity >= 2 && step % 8 === 4) {
    tone({ type: 'sine', from: midiHz(33), dur: 0.3, vol: 0.16, delay }); // boss pulse, low A
  }
}

function startSequencer() {
  nextStepAt = ctx.currentTime + 0.06;
  setInterval(() => {
    if (!ctx || muted) return;
    while (nextStepAt < ctx.currentTime + 0.14) {
      scheduleStep(seqStep, nextStepAt);
      seqStep++;
      nextStepAt += STEP;
    }
  }, 27);
}
