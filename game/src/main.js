// main.js — NEONVOID's boot and heartbeat: it sizes the canvas to the window, runs
// the world at a fixed 60 steps a second however fast the display refreshes, turns
// raw keyboard and mouse state into the intent the world reads, and draws every
// frame. It also wires the kit's screenshot staging (?shot=<scene>&seed=<n>).

import { STORAGE_KEYS, VIEW } from './config.js';
import { attachInput, consumePresses, isHeld, moveVector, pointerState } from './input.js';
import { initAudio, setMusicIntensity, setMuted, sfx } from './audio.js';
import { makeLiveRng, makeRng } from './random.js';
import { createWorld, stepWorld } from './world.js';
import { drawGame } from './render.js';
import { IDLE_INTENT, shotBotIntent, stageShot } from './shots.js';

const STEP = 1 / 60;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const status = document.getElementById('status');

const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const shotSeed = Number(params.get('seed') ?? 1) || 1;
const inShotMode = shotName !== null;

const G = createWorld(inShotMode ? makeRng(shotSeed * 7919 + 13) : makeLiveRng());
if (inShotMode) stageShot(G, shotName);

const view = { scale: 1, offsetX: 0, offsetY: 0 };
function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  const fit = Math.min(window.innerWidth / VIEW.width, window.innerHeight / VIEW.height);
  view.scale = fit;
  view.offsetX = (window.innerWidth - VIEW.width * fit) / 2;
  view.offsetY = (window.innerHeight - VIEW.height * fit) / 2;
  view.dpr = dpr;
}
window.addEventListener('resize', resize);
resize();

attachInput(canvas);

// Sound starts on the first gesture, as browsers require; the stored mute
// preference is honoured from the first note.
let audioStarted = false;
try {
  setMuted(localStorage.getItem(STORAGE_KEYS.muted) === '1');
} catch { /* storage unavailable: sound simply defaults to on */ }
function wakeAudio() {
  if (audioStarted) return;
  audioStarted = true;
  initAudio();
}
window.addEventListener('pointerdown', wakeAudio);
window.addEventListener('keydown', wakeAudio);

document.addEventListener('visibilitychange', () => {
  if (document.hidden && G.screen === 'playing') G.screen = 'paused';
});

function cardAt(pointer) {
  // The upgrade cards' geometry, matching render.js's drawUpgrade.
  const w = 330;
  const h = 188;
  const y = 268;
  for (let i = 0; i < 2; i++) {
    const x = VIEW.width / 2 + (i === 0 ? -w - 26 : 26);
    if (pointer.x >= x && pointer.x <= x + w && pointer.y >= y && pointer.y <= y + h) return i;
  }
  return -1;
}

function buildIntent(presses, pointer) {
  const move = moveVector();
  const intent = {
    moveX: move.x,
    moveY: move.y,
    aimX: pointer.x,
    aimY: pointer.y,
    firing: pointer.down || isHeld('Space'),
    dash: presses.keys.has('ShiftLeft') || presses.keys.has('ShiftRight') || presses.rightClicked,
    pause: presses.keys.has('KeyP') || presses.keys.has('Escape'),
    confirm: presses.keys.has('Enter') || presses.clicked,
    choose: -1,
  };
  if (G.screen === 'upgrade') {
    if (presses.keys.has('Digit1')) intent.choose = 0;
    if (presses.keys.has('Digit2')) intent.choose = 1;
    if (presses.clicked) intent.choose = cardAt(pointer);
    intent.confirm = false; // a click here is a card pick, never a confirm
  }
  if (presses.keys.has('KeyM')) {
    let now = false;
    try {
      now = localStorage.getItem(STORAGE_KEYS.muted) !== '1';
      localStorage.setItem(STORAGE_KEYS.muted, now ? '1' : '0');
    } catch { /* ignore */ }
    setMuted(now);
    sfx.click();
  }
  return intent;
}

let lastAnnounced = '';
function announce() {
  const msg =
    G.screen === 'title' ? 'NEONVOID. Press Enter or click to play.' :
    G.screen === 'over' ? `Game over. Score ${G.score}, wave ${G.wave}. Press Enter to play again.` :
    G.screen === 'upgrade' ? `Wave ${G.wave} cleared. Choose an upgrade: 1 or 2.` :
    G.screen === 'paused' ? 'Paused.' : '';
  if (msg && msg !== lastAnnounced) {
    lastAnnounced = msg;
    if (status) status.textContent = msg;
  }
}

let previous = performance.now();
let accumulator = 0;
let shotSteps = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let delta = (now - previous) / 1000;
  previous = now;
  if (delta > 0.25) delta = 0.25; // a stalled tab resumes gently, never in a leap
  accumulator += delta;

  const pointer = pointerState(view);
  G.pointer = pointer;
  if (G.screen === 'upgrade') G.hoverCard = cardAt(pointer);

  while (accumulator >= STEP) {
    accumulator -= STEP;
    let intent;
    if (inShotMode) {
      intent = shotName === 'play' ? shotBotIntent(G) : IDLE_INTENT;
      shotSteps++;
      if (shotSteps === 100) window.__shotReady = true;
    } else {
      intent = buildIntent(consumePresses(), pointer);
    }
    stepWorld(G, intent, STEP);
  }
  if (!inShotMode) consumePresses(); // presses never leak into a later frame

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#05060f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const s = view.scale * view.dpr;
  ctx.setTransform(s, 0, 0, s, view.offsetX * view.dpr, view.offsetY * view.dpr);
  drawGame(ctx, G);
  announce();
  if (G.screen === 'title') setMusicIntensity(0);
}

requestAnimationFrame(frame);
window.__neonvoid = { world: G };
