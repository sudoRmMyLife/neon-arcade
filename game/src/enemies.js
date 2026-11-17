// enemies.js — the swarm: five enemy kinds with their own movement brains, the
// Warden boss, and the wave director that composes each wave from a points budget.
// Enemies only move and shoot here; world.js owns damage, collisions and death.

import { COLORS, VIEW, WAVES } from './config.js';

// cost is what the wave director pays per enemy; mass divides knockback.
export const ENEMY_KINDS = {
  seeker: { hp: 2, speed: 110, radius: 14, score: 50, cost: 1, mass: 1, color: COLORS.seeker },
  lancer: { hp: 1, speed: 94, radius: 11, score: 80, cost: 2, mass: 0.8, color: COLORS.lancer },
  pod: { hp: 3, speed: 66, radius: 16, score: 70, cost: 2, mass: 1.4, color: COLORS.pod },
  mini: { hp: 1, speed: 162, radius: 8, score: 25, cost: 0, mass: 0.5, color: COLORS.mini },
  weaver: { hp: 3, speed: 98, radius: 14, score: 120, cost: 3, mass: 1, color: COLORS.weaver },
  bulwark: { hp: 16, speed: 41, radius: 30, score: 250, cost: 6, mass: 6, color: COLORS.bulwark },
  warden: { hp: 120, speed: 36, radius: 46, score: 2000, cost: 0, mass: 14, color: COLORS.warden },
};

// Which kinds a wave may field; later waves unlock the nastier shapes.
const UNLOCKS = [
  { wave: 1, kind: 'seeker', weight: 10 },
  { wave: 2, kind: 'lancer', weight: 5 },
  { wave: 3, kind: 'pod', weight: 5 },
  { wave: 4, kind: 'weaver', weight: 4 },
  { wave: 6, kind: 'bulwark', weight: 3 },
];

export function isBossWave(wave) {
  return wave % WAVES.bossEvery === 0;
}

export function waveHpScale(wave) {
  return 1 + Math.max(0, wave - 3) * 0.09;
}

export function waveSpeedScale(wave) {
  return 1 + Math.min(0.35, wave * 0.012);
}

export function makeEnemy(kind, x, y, elite, wave) {
  const base = ENEMY_KINDS[kind];
  const hpScale = kind === 'warden' ? 1 + (wave / WAVES.bossEvery - 1) * 0.6 : waveHpScale(wave);
  const hp = Math.max(1, Math.round(base.hp * hpScale * (elite ? 2.6 : 1)));
  return {
    kind,
    x, y,
    vx: 0, vy: 0,   // desired velocity, set by its brain each step
    kx: 0, ky: 0,   // knockback velocity, decays away
    hp, maxHp: hp,
    r: base.radius * (elite ? 1.35 : 1),
    speed: base.speed * waveSpeedScale(wave),
    score: base.score * (elite ? 3 : 1),
    mass: base.mass,
    elite,
    angle: 0,
    t: Math.random() * 10, // wander phase; visual only, so Math.random is fine here
    state: 'stalk',
    stateT: 0,
    fireT: 1 + Math.random() * 1.5,
    flashT: 0,
    spawnT: 0.35,   // rise-in: briefly harmless and translucent while it materialises
    strafeDir: Math.random() < 0.5 ? -1 : 1,
    strafeT: 2,
    attackT: 2.2,
    burstLeft: 0,
    burstT: 0,
    lockX: 0, lockY: 0,
  };
}

// Compose a wave: spend the budget on unlocked kinds, weighted, then shuffle so
// the mix arrives interleaved. Boss waves field the Warden plus a light escort.
export function buildWaveQueue(wave, rng) {
  const queue = [];
  if (isBossWave(wave)) {
    queue.push({ kind: 'warden', elite: false });
    const escort = 3 + Math.floor(wave / 2);
    for (let i = 0; i < escort; i++) {
      queue.push({ kind: rng.chance(0.7) ? 'seeker' : 'lancer', elite: false });
    }
    return queue;
  }
  let budget = WAVES.baseBudget + (wave - 1) * WAVES.budgetPerWave;
  const pool = UNLOCKS.filter((u) => wave >= u.wave);
  const totalWeight = pool.reduce((sum, u) => sum + u.weight, 0);
  let guard = 0;
  while (budget > 0 && guard++ < 220) {
    let roll = rng.next() * totalWeight;
    let chosen = pool[0];
    for (const u of pool) {
      roll -= u.weight;
      if (roll <= 0) {
        chosen = u;
        break;
      }
    }
    const cost = ENEMY_KINDS[chosen.kind].cost;
    if (cost > budget && queue.length > 0) break;
    budget -= cost;
    const elite = wave >= 3 && rng.chance(0.05 + wave * 0.004);
    queue.push({ kind: chosen.kind, elite });
  }
  // Shuffle so kinds interleave instead of arriving in clumps.
  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [queue[i], queue[j]] = [queue[j], queue[i]];
  }
  return queue;
}

// A spawn point on an arena edge, kept away from the player so nothing lands on them.
export function spawnPoint(G) {
  const { rng, player } = G;
  const m = VIEW.wall + 34;
  for (let tries = 0; tries < 8; tries++) {
    const side = rng.int(0, 3);
    let x, y;
    if (side === 0) { x = rng.range(m, VIEW.width - m); y = m; }
    else if (side === 1) { x = rng.range(m, VIEW.width - m); y = VIEW.height - m; }
    else if (side === 2) { x = m; y = rng.range(m, VIEW.height - m); }
    else { x = VIEW.width - m; y = rng.range(m, VIEW.height - m); }
    const dx = x - player.x;
    const dy = y - player.y;
    if (dx * dx + dy * dy > 280 * 280 || tries === 7) return { x, y };
  }
  return { x: m, y: m };
}

function seek(e, tx, ty, speed) {
  const dx = tx - e.x;
  const dy = ty - e.y;
  const d = Math.hypot(dx, dy) || 1;
  e.vx = (dx / d) * speed;
  e.vy = (dy / d) * speed;
  e.angle = Math.atan2(dy, dx);
}

function fireBolt(G, e, speed = 245) {
  const p = G.player;
  const dx = p.x - e.x;
  const dy = p.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  const spread = (G.rng.next() - 0.5) * 0.14;
  const cos = Math.cos(spread);
  const sin = Math.sin(spread);
  const nx = (dx / d) * cos - (dy / d) * sin;
  const ny = (dx / d) * sin + (dy / d) * cos;
  G.enemyBullets.push({ x: e.x + nx * (e.r + 6), y: e.y + ny * (e.r + 6), vx: nx * speed, vy: ny * speed, r: 5, life: 4.5 });
}

export function updateEnemy(G, e, dt) {
  const p = G.player;
  e.t += dt;
  e.flashT = Math.max(0, e.flashT - dt);
  if (e.spawnT > 0) e.spawnT -= dt;
  const dx = p.x - e.x;
  const dy = p.y - e.y;
  const dist = Math.hypot(dx, dy) || 1;

  switch (e.kind) {
    case 'seeker': {
      seek(e, p.x, p.y, e.speed);
      const wob = Math.sin(e.t * 3.1) * 26;
      e.vx += (-dy / dist) * wob;
      e.vy += (dx / dist) * wob;
      break;
    }
    case 'mini': {
      seek(e, p.x, p.y, e.speed);
      e.vx += Math.sin(e.t * 9) * 30;
      e.vy += Math.cos(e.t * 7.3) * 30;
      break;
    }
    case 'pod': {
      seek(e, p.x, p.y, e.speed);
      e.angle += dt * 1.4;
      break;
    }
    case 'bulwark': {
      seek(e, p.x, p.y, e.speed);
      e.angle += dt * 0.5;
      break;
    }
    case 'lancer': {
      e.stateT -= dt;
      if (e.state === 'stalk') {
        seek(e, p.x, p.y, e.speed);
        if (dist < 320 || e.stateT <= 0) {
          e.state = 'aim';
          e.stateT = 0.45;
        }
      } else if (e.state === 'aim') {
        e.vx *= 0.8;
        e.vy *= 0.8;
        e.angle = Math.atan2(dy, dx);
        e.lockX = dx / dist;
        e.lockY = dy / dist;
        if (e.stateT <= 0) {
          e.state = 'lunge';
          e.stateT = 0.32;
        }
      } else if (e.state === 'lunge') {
        e.vx = e.lockX * 545;
        e.vy = e.lockY * 545;
        if (e.stateT <= 0) {
          e.state = 'rest';
          e.stateT = 0.65;
        }
      } else {
        e.vx *= 0.86;
        e.vy *= 0.86;
        if (e.stateT <= 0) {
          e.state = 'stalk';
          e.stateT = 1.1;
        }
      }
      break;
    }
    case 'weaver': {
      e.strafeT -= dt;
      if (e.strafeT <= 0) {
        e.strafeT = 1.6 + G.rng.next() * 1.4;
        e.strafeDir *= -1;
      }
      const radial = dist > 285 ? 1 : dist < 195 ? -1 : 0;
      const px = (-dy / dist) * e.strafeDir;
      const py = (dx / dist) * e.strafeDir;
      e.vx = (dx / dist) * radial * e.speed * 0.8 + px * e.speed * 0.75;
      e.vy = (dy / dist) * radial * e.speed * 0.8 + py * e.speed * 0.75;
      e.angle = Math.atan2(dy, dx);
      e.fireT -= dt;
      if (e.fireT <= 0 && dist < 560 && e.spawnT <= 0) {
        e.fireT = 2.1 + G.rng.next() * 0.7;
        fireBolt(G, e);
      }
      break;
    }
    case 'warden': {
      updateWarden(G, e, dt, dist);
      break;
    }
  }

  // Integrate: desired velocity plus decaying knockback, clamped inside the walls.
  const dragK = Math.exp(-6 * dt);
  e.kx *= dragK;
  e.ky *= dragK;
  e.x += (e.vx + e.kx) * dt;
  e.y += (e.vy + e.ky) * dt;
  const m = VIEW.wall + e.r * 0.6;
  e.x = Math.min(VIEW.width - m, Math.max(m, e.x));
  e.y = Math.min(VIEW.height - m, Math.max(m, e.y));
}

// The Warden: a rotating fortress that cycles radial bursts, aimed spreads,
// mini summons and — below two-thirds health — telegraphed charges.
function updateWarden(G, e, dt, dist) {
  const p = G.player;
  const phase = e.hp > e.maxHp * 0.66 ? 1 : e.hp > e.maxHp * 0.33 ? 2 : 3;
  e.angle += dt * (0.55 + (3 - phase) * 0.22);
  e.stateT -= dt;

  if (e.state === 'chargeTele') {
    e.vx *= 0.8;
    e.vy *= 0.8;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    e.lockX = dx / d;
    e.lockY = dy / d;
    if (e.stateT <= 0) {
      e.state = 'charge';
      e.stateT = 0.46;
    }
    return;
  }
  if (e.state === 'charge') {
    e.vx = e.lockX * 470;
    e.vy = e.lockY * 470;
    if (e.stateT <= 0) {
      e.state = 'pace';
      e.attackT = phase === 3 ? 1.5 : 2.0;
    }
    return;
  }
  if (e.state === 'spread') {
    e.vx *= 0.85;
    e.vy *= 0.85;
    e.burstT -= dt;
    if (e.burstT <= 0 && e.burstLeft > 0) {
      e.burstLeft--;
      e.burstT = 0.13;
      fireBolt(G, e, 300);
    }
    if (e.burstLeft <= 0) {
      e.state = 'pace';
      e.attackT = phase === 3 ? 1.6 : 2.2;
    }
    return;
  }

  // 'pace': hold a slow approach, then pick the next attack.
  if (dist > 210) seek(e, p.x, p.y, e.speed);
  else {
    e.vx *= 0.9;
    e.vy *= 0.9;
  }
  e.attackT -= dt;
  if (e.attackT > 0 || e.spawnT > 0) return;
  const roll = G.rng.next();
  if (phase >= 2 && roll < 0.24) {
    e.state = 'chargeTele';
    e.stateT = 0.6;
  } else if (roll < 0.52) {
    // Radial burst: a full ring of bolts from the Warden's rim.
    const count = phase === 3 ? 18 : 14;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + e.angle;
      G.enemyBullets.push({
        x: e.x + Math.cos(a) * (e.r + 8),
        y: e.y + Math.sin(a) * (e.r + 8),
        vx: Math.cos(a) * 205,
        vy: Math.sin(a) * 205,
        r: 5,
        life: 3.6,
      });
    }
    e.attackT = phase === 3 ? 1.7 : 2.3;
  } else if (roll < 0.78) {
    e.state = 'spread';
    e.burstLeft = 3;
    e.burstT = 0;
  } else {
    // Summon minis, capped so the arena stays readable.
    const minis = G.enemies.reduce((n, o) => n + (o.kind === 'mini' ? 1 : 0), 0);
    for (let i = 0; i < Math.min(3, Math.max(0, 7 - minis)); i++) {
      const a = (i / 3) * Math.PI * 2 + e.angle;
      const mini = makeEnemy('mini', e.x + Math.cos(a) * (e.r + 16), e.y + Math.sin(a) * (e.r + 16), false, G.wave);
      mini.spawnT = 0.25;
      G.enemies.push(mini);
    }
    e.attackT = 2.4;
  }
}
