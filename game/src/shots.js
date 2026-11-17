// shots.js — deterministic screenshot staging. The kit's shots.json loads the game
// with ?shot=<scene>&seed=<n>; this module builds the named scene from the seed and,
// for the play scene, drives a small bot so the captured frame is a real game being
// played, not a diorama. Nothing here runs in normal play.

import { VIEW } from './config.js';
import { makeEnemy } from './enemies.js';
import { UPGRADES, startRun } from './world.js';

function place(G, kind, x, y, elite = false) {
  const e = makeEnemy(kind, x, y, elite, G.wave);
  e.spawnT = 0;
  G.enemies.push(e);
  return e;
}

function scatterShards(G, cx, cy, count) {
  for (let i = 0; i < count; i++) {
    const a = G.rng.next() * Math.PI * 2;
    const d = G.rng.range(20, 130);
    G.shards.push({
      x: cx + Math.cos(a) * d,
      y: cy + Math.sin(a) * d,
      vx: 0, vy: 0, r: 5, life: 7, value: 10,
    });
  }
}

export function stageShot(G, name) {
  if (name === 'start') {
    // The title screen over its ambient swarm: createWorld already seeded it.
    return;
  }

  startRun(G); // resets the run; the scenes below dress it from there

  if (name === 'play') {
    G.wave = 6;
    G.waveState = 'active';
    // A deep bench: the scene must still be mid-fight whenever the capture lands.
    G.spawnQueue = [
      { kind: 'seeker', elite: false }, { kind: 'pod', elite: false },
      { kind: 'lancer', elite: false }, { kind: 'seeker', elite: false },
      { kind: 'weaver', elite: false }, { kind: 'seeker', elite: true },
      { kind: 'pod', elite: false }, { kind: 'lancer', elite: false },
      { kind: 'seeker', elite: false }, { kind: 'bulwark', elite: false },
      { kind: 'weaver', elite: false }, { kind: 'seeker', elite: false },
      { kind: 'pod', elite: false }, { kind: 'lancer', elite: false },
    ];
    G.score = 8450;
    G.combo = 19;
    G.comboTimer = 2.2;
    G.maxCombo = 19;
    G.stats.kills = 87;
    const p = G.player;
    p.x = 430;
    p.y = 400;
    p.maxHp = 4;
    p.hp = 3;
    p.spreadT = 8;
    place(G, 'seeker', 760, 300);
    place(G, 'seeker', 830, 430);
    place(G, 'seeker', 690, 470, true);
    place(G, 'lancer', 920, 210);
    place(G, 'pod', 980, 520);
    place(G, 'weaver', 1080, 330);
    place(G, 'bulwark', 240, 170);
    place(G, 'seeker', 300, 560);
    scatterShards(G, 640, 380, 9);
    G.pickups.push({ kind: 'shield', x: 560, y: 250, r: 11, life: 9, t: 0 });
    return;
  }

  if (name === 'upgrade') {
    G.wave = 4;
    G.score = 5230;
    G.combo = 0;
    G.stats.kills = 61;
    G.upgrades.damage = 1;
    G.upgradeChoices = [UPGRADES[0], UPGRADES[3]]; // Heavy Rounds, Reinforced Hull
    G.screen = 'upgrade';
    G.waveState = 'clear';
    G.hoverCard = 0;
    scatterShards(G, 640, 430, 7);
    G.pickups.push({ kind: 'rapid', x: 350, y: 300, r: 11, life: 9, t: 0 });
    return;
  }

  if (name === 'end') {
    G.wave = 9;
    G.score = 18640;
    G.maxCombo = 34;
    G.runTime = 372;
    G.stats = { kills: 148, shots: 720, hits: 402, dashes: 26 };
    G.best = { score: 18640, wave: 9, combo: 34 };
    G.player.alive = false;
    G.screen = 'over';
    G.enemies.length = 0;
    place(G, 'seeker', 900, 240);
    place(G, 'weaver', 300, 500);
    place(G, 'pod', 1020, 520);
    scatterShards(G, 640, 360, 6);
    return;
  }
}

// A simple pilot for the play scene: keep a fighting distance, strafe, and fire
// at the nearest hostile. Deterministic — it reads only the world's state.
export function shotBotIntent(G) {
  const p = G.player;
  let target = null;
  let bestD2 = Infinity;
  for (const e of G.enemies) {
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      target = e;
    }
  }
  if (!target) {
    return { moveX: 0, moveY: 0, aimX: p.x + 100, aimY: p.y, firing: false, dash: false, pause: false, confirm: false, choose: -1 };
  }
  const dx = target.x - p.x;
  const dy = target.y - p.y;
  const d = Math.hypot(dx, dy) || 1;
  // Lead the target a little so bolts and bullets cross in the frame.
  const lead = Math.min(0.22, d / 900);
  const aimX = target.x + target.vx * lead;
  const aimY = target.y + target.vy * lead;
  let moveX = (-dy / d) * 0.8; // strafe
  let moveY = (dx / d) * 0.8;
  if (d > 330) {
    moveX += (dx / d) * 0.7;
    moveY += (dy / d) * 0.7;
  } else if (d < 170) {
    moveX -= (dx / d) * 0.8;
    moveY -= (dy / d) * 0.8;
  }
  const m = Math.hypot(moveX, moveY) || 1;
  return {
    moveX: moveX / m,
    moveY: moveY / m,
    aimX, aimY,
    firing: true,
    dash: false, pause: false, confirm: false, choose: -1,
  };
}

export const IDLE_INTENT = Object.freeze({
  moveX: 0, moveY: 0, aimX: VIEW.width / 2 + 100, aimY: VIEW.height / 2,
  firing: false, dash: false, pause: false, confirm: false, choose: -1,
});
