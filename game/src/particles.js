// particles.js — the juice layer: pooled sparks and dots, expanding shockwave rings
// and floating score text. Everything is pre-allocated and recycled, so a screen
// full of explosions never allocates mid-frame. world.js spawns; render.js draws.

import { makeRng } from './random.js';

const MAX_PARTICLES = 900;
const MAX_RINGS = 40;
const MAX_TEXTS = 28;

const rng = makeRng(0xC0FFEE);

const particles = [];
for (let i = 0; i < MAX_PARTICLES; i++) {
  particles.push({ alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 2, color: '#fff', drag: 1, streak: false });
}
let particleCursor = 0;

const rings = [];
for (let i = 0; i < MAX_RINGS; i++) {
  rings.push({ alive: false, x: 0, y: 0, r: 0, vr: 0, life: 0, maxLife: 1, color: '#fff', width: 2 });
}
let ringCursor = 0;

const texts = [];
for (let i = 0; i < MAX_TEXTS; i++) {
  texts.push({ alive: false, x: 0, y: 0, vy: 0, life: 0, maxLife: 1, value: '', color: '#fff', size: 15 });
}
let textCursor = 0;

function nextParticle() {
  const p = particles[particleCursor];
  particleCursor = (particleCursor + 1) % MAX_PARTICLES;
  return p;
}

export function burst(x, y, color, count, speed = 260, life = 0.5, size = 3) {
  for (let i = 0; i < count; i++) {
    const p = nextParticle();
    const angle = rng.next() * Math.PI * 2;
    const v = speed * (0.25 + rng.next() * 0.95);
    p.alive = true;
    p.x = x;
    p.y = y;
    p.vx = Math.cos(angle) * v;
    p.vy = Math.sin(angle) * v;
    p.maxLife = life * (0.5 + rng.next() * 0.8);
    p.life = p.maxLife;
    p.size = size * (0.6 + rng.next() * 0.9);
    p.color = color;
    p.drag = 3.2;
    p.streak = rng.chance(0.45);
  }
}

export function sparks(x, y, angle, color, count = 6, spread = 0.7) {
  for (let i = 0; i < count; i++) {
    const p = nextParticle();
    const a = angle + (rng.next() - 0.5) * 2 * spread;
    const v = 160 + rng.next() * 320;
    p.alive = true;
    p.x = x;
    p.y = y;
    p.vx = Math.cos(a) * v;
    p.vy = Math.sin(a) * v;
    p.maxLife = 0.16 + rng.next() * 0.22;
    p.life = p.maxLife;
    p.size = 2 + rng.next() * 2;
    p.color = color;
    p.drag = 2.4;
    p.streak = true;
  }
}

export function trailDot(x, y, color, size = 5, life = 0.3) {
  const p = nextParticle();
  p.alive = true;
  p.x = x;
  p.y = y;
  p.vx = 0;
  p.vy = 0;
  p.maxLife = life;
  p.life = life;
  p.size = size;
  p.color = color;
  p.drag = 0;
  p.streak = false;
}

export function ring(x, y, color, vr = 420, life = 0.34, width = 3) {
  const r = rings[ringCursor];
  ringCursor = (ringCursor + 1) % MAX_RINGS;
  r.alive = true;
  r.x = x;
  r.y = y;
  r.r = 6;
  r.vr = vr;
  r.maxLife = life;
  r.life = life;
  r.color = color;
  r.width = width;
}

export function floatText(x, y, value, color = '#e2e8f0', size = 15) {
  const t = texts[textCursor];
  textCursor = (textCursor + 1) % MAX_TEXTS;
  t.alive = true;
  t.x = x + (rng.next() - 0.5) * 14;
  t.y = y - 6;
  t.vy = -56;
  t.maxLife = 0.85;
  t.life = t.maxLife;
  t.value = value;
  t.color = color;
  t.size = size;
}

export function stepParticles(dt) {
  for (const p of particles) {
    if (!p.alive) continue;
    p.life -= dt;
    if (p.life <= 0) {
      p.alive = false;
      continue;
    }
    const dragK = Math.max(0, 1 - p.drag * dt);
    p.vx *= dragK;
    p.vy *= dragK;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  for (const r of rings) {
    if (!r.alive) continue;
    r.life -= dt;
    if (r.life <= 0) {
      r.alive = false;
      continue;
    }
    r.r += r.vr * dt;
    r.vr *= Math.max(0, 1 - 2.6 * dt);
  }
  for (const t of texts) {
    if (!t.alive) continue;
    t.life -= dt;
    if (t.life <= 0) {
      t.alive = false;
      continue;
    }
    t.y += t.vy * dt;
    t.vy *= Math.max(0, 1 - 2.2 * dt);
  }
}

export function clearParticles() {
  for (const p of particles) p.alive = false;
  for (const r of rings) r.alive = false;
  for (const t of texts) t.alive = false;
}

// The live pools, for render.js to draw.
export const particlePool = particles;
export const ringPool = rings;
export const textPool = texts;
