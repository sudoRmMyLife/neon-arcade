// world.js — NEONVOID's simulation: the player, bullets, pickups, score shards,
// the combo, the wave flow and the upgrade draft. Fixed-step and free of any
// rendering: render.js draws what this file decides, and main.js feeds it intent.

import { COLORS, COMBO, DASH, PICKUPS, PLAYER, SCORE, STORAGE_KEYS, VIEW, WAVES } from './config.js';
import { ENEMY_KINDS, buildWaveQueue, isBossWave, makeEnemy, spawnPoint, updateEnemy } from './enemies.js';
import { burst, clearParticles, floatText, ring, sparks, stepParticles, trailDot } from './particles.js';
import { setMusicIntensity, sfx } from './audio.js';

export const PICKUP_KINDS = ['spread', 'rapid', 'shield', 'repair', 'magnet'];

export const PICKUP_LABELS = {
  spread: 'TRIPLE SHOT',
  rapid: 'RAPID FIRE',
  shield: 'SHIELD',
  repair: '+1 HULL',
  magnet: 'MAGNET',
};

// The upgrade draft: two of these are offered after every cleared wave.
export const UPGRADES = [
  { id: 'damage', name: 'Heavy Rounds', desc: '+1 damage per bullet', max: 4 },
  { id: 'fireRate', name: 'Overclock', desc: '+18% fire rate', max: 4 },
  { id: 'speed', name: 'Ion Thrusters', desc: '+10% move speed', max: 3 },
  { id: 'hull', name: 'Reinforced Hull', desc: '+1 max hull, repair 1', max: 3 },
  { id: 'dash', name: 'Phase Coils', desc: 'Dash recharges 25% faster', max: 3 },
  { id: 'magnet', name: 'Tractor Field', desc: '+70% shard magnet radius', max: 3 },
  { id: 'pierce', name: 'Lance Rounds', desc: 'Bullets pierce +1 enemy', max: 2 },
  { id: 'combo', name: 'Adrenaline', desc: 'Combo window +0.9s', max: 3 },
];

function loadBest() {
  try {
    return {
      score: Number(localStorage.getItem(STORAGE_KEYS.bestScore)) || 0,
      wave: Number(localStorage.getItem(STORAGE_KEYS.bestWave)) || 0,
      combo: Number(localStorage.getItem(STORAGE_KEYS.bestCombo)) || 0,
    };
  } catch {
    return { score: 0, wave: 0, combo: 0 };
  }
}

function saveBest(best) {
  try {
    localStorage.setItem(STORAGE_KEYS.bestScore, String(best.score));
    localStorage.setItem(STORAGE_KEYS.bestWave, String(best.wave));
    localStorage.setItem(STORAGE_KEYS.bestCombo, String(best.combo));
  } catch {
    // Storage can be unavailable (private mode, sandboxed frame): the run goes on.
  }
}

export function createWorld(rng) {
  const G = {
    screen: 'title',
    rng,
    time: 0,
    runTime: 0,
    score: 0,
    best: loadBest(),
    combo: 0,
    comboTimer: 0,
    maxCombo: 0,
    wave: 0,
    waveState: 'idle',
    waveTimer: 0,
    spawnQueue: [],
    spawnTimer: 0,
    player: freshPlayer(),
    enemies: [],
    bullets: [],
    enemyBullets: [],
    pickups: [],
    shards: [],
    boss: null,
    upgrades: { damage: 0, fireRate: 0, speed: 0, hull: 0, dash: 0, magnet: 0, pierce: 0, combo: 0 },
    upgradeChoices: [],
    shake: 0,
    freeze: 0,
    flash: 0,
    stats: { kills: 0, shots: 0, hits: 0, dashes: 0 },
    ambientT: 0,
  };
  seedAmbient(G);
  return G;
}

function freshPlayer() {
  return {
    x: VIEW.width / 2,
    y: VIEW.height / 2,
    vx: 0, vy: 0,
    r: PLAYER.radius,
    hp: PLAYER.maxHp,
    maxHp: PLAYER.maxHp,
    angle: -Math.PI / 2,
    fireT: 0,
    dashT: 0,
    dashCd: 0,
    dashDirX: 1, dashDirY: 0,
    ghostT: 0,
    invuln: 0,
    shield: false,
    spreadT: 0, rapidT: 0, magnetT: 0,
    alive: true,
  };
}

export function comboMultiplier(G) {
  return Math.min(COMBO.maxMultiplier, 1 + Math.floor(G.combo / COMBO.killsPerTier));
}

export function startRun(G) {
  G.score = 0;
  G.combo = 0;
  G.comboTimer = 0;
  G.maxCombo = 0;
  G.wave = 0;
  G.runTime = 0;
  G.player = freshPlayer();
  G.enemies.length = 0;
  G.bullets.length = 0;
  G.enemyBullets.length = 0;
  G.pickups.length = 0;
  G.shards.length = 0;
  G.boss = null;
  for (const key of Object.keys(G.upgrades)) G.upgrades[key] = 0;
  G.stats = { kills: 0, shots: 0, hits: 0, dashes: 0 };
  clearParticles();
  nextWave(G);
  G.screen = 'playing';
}

function nextWave(G) {
  G.wave++;
  G.spawnQueue = buildWaveQueue(G.wave, G.rng);
  G.waveState = 'banner';
  G.waveTimer = WAVES.bannerTime;
  G.spawnTimer = 0.4;
  if (isBossWave(G.wave)) {
    sfx.bossAlarm();
    setMusicIntensity(2);
  } else {
    sfx.waveStart();
    setMusicIntensity(G.wave >= 3 ? 1 : 0);
  }
}

// --- the step ---------------------------------------------------------------

export function stepWorld(G, intent, dt) {
  G.time += dt;
  if (G.freeze > 0) {
    G.freeze -= dt;
    stepParticles(dt * 0.12); // hit-stop: the world holds its breath, sparks crawl
    return;
  }
  G.shake *= Math.exp(-7 * dt);
  G.flash = Math.max(0, G.flash - dt * 3);

  switch (G.screen) {
    case 'title':
      stepAmbient(G, dt);
      stepParticles(dt);
      break;
    case 'playing':
      stepPlaying(G, intent, dt);
      stepParticles(dt);
      break;
    case 'upgrade':
      stepParticles(dt);
      if (intent.choose >= 0) applyUpgrade(G, intent.choose);
      break;
    case 'paused':
      if (intent.pause || intent.confirm) G.screen = 'playing';
      break;
    case 'over':
      for (const e of G.enemies) updateEnemy(G, e, dt * 0.35);
      G.enemyBullets.length = 0;
      stepParticles(dt);
      if (intent.confirm) startRun(G);
      break;
  }

  if (G.screen === 'title' && intent.confirm) startRun(G);
  if (G.screen === 'playing' && intent.pause) G.screen = 'paused';
}

function stepPlaying(G, intent, dt) {
  G.runTime += dt;
  stepPlayer(G, intent, dt);
  stepSpawning(G, dt);
  for (const e of G.enemies) updateEnemy(G, e, dt);
  separateEnemies(G);
  stepBullets(G, dt);
  stepEnemyBullets(G, dt);
  stepContact(G, dt);
  stepPickups(G, dt);
  stepShards(G, dt);
  stepCombo(G, dt);
  stepWaveFlow(G, dt);
}

// --- player -----------------------------------------------------------------

function stepPlayer(G, intent, dt) {
  const p = G.player;
  if (!p.alive) return;
  p.invuln = Math.max(0, p.invuln - dt);
  p.spreadT = Math.max(0, p.spreadT - dt);
  p.rapidT = Math.max(0, p.rapidT - dt);
  p.magnetT = Math.max(0, p.magnetT - dt);
  p.dashCd = Math.max(0, p.dashCd - dt);
  p.fireT -= dt;

  const speed = PLAYER.speed * (1 + G.upgrades.speed * 0.10);
  if (p.dashT > 0) {
    p.dashT -= dt;
    p.vx = p.dashDirX * DASH.speed;
    p.vy = p.dashDirY * DASH.speed;
    p.ghostT -= dt;
    if (p.ghostT <= 0) {
      p.ghostT = DASH.ghostEvery;
      trailDot(p.x, p.y, COLORS.player, 15, 0.28);
    }
  } else {
    const k = 1 - Math.exp(-14 * dt);
    p.vx += (intent.moveX * speed - p.vx) * k;
    p.vy += (intent.moveY * speed - p.vy) * k;
    if (intent.dash && p.dashCd <= 0) {
      const dx = intent.moveX !== 0 || intent.moveY !== 0 ? intent.moveX : Math.cos(p.angle);
      const dy = intent.moveX !== 0 || intent.moveY !== 0 ? intent.moveY : Math.sin(p.angle);
      const d = Math.hypot(dx, dy) || 1;
      p.dashDirX = dx / d;
      p.dashDirY = dy / d;
      p.dashT = DASH.time;
      p.dashCd = DASH.cooldown * Math.pow(0.75, G.upgrades.dash);
      G.stats.dashes++;
      sfx.dash();
    }
  }
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  const m = VIEW.wall + p.r;
  p.x = Math.min(VIEW.width - m, Math.max(m, p.x));
  p.y = Math.min(VIEW.height - m, Math.max(m, p.y));

  p.angle = Math.atan2(intent.aimY - p.y, intent.aimX - p.x);

  if (intent.firing && p.fireT <= 0) {
    const interval = PLAYER.fireInterval / ((1 + G.upgrades.fireRate * 0.18) * (p.rapidT > 0 ? 1.7 : 1));
    p.fireT = interval;
    fireBullets(G);
  }
}

function fireBullets(G) {
  const p = G.player;
  const angles = p.spreadT > 0 ? [-0.16, 0, 0.16] : [0];
  for (const off of angles) {
    const a = p.angle + off + (G.rng.next() - 0.5) * 0.02;
    G.bullets.push({
      x: p.x + Math.cos(p.angle) * (p.r + 6),
      y: p.y + Math.sin(p.angle) * (p.r + 6),
      vx: Math.cos(a) * PLAYER.bulletSpeed,
      vy: Math.sin(a) * PLAYER.bulletSpeed,
      r: PLAYER.bulletRadius,
      life: PLAYER.bulletLife,
      damage: PLAYER.bulletDamage + G.upgrades.damage,
      pierce: G.upgrades.pierce,
    });
    G.stats.shots++;
  }
  sparks(p.x + Math.cos(p.angle) * (p.r + 8), p.y + Math.sin(p.angle) * (p.r + 8), p.angle, COLORS.bullet, 2, 0.5);
  sfx.shoot();
}

// --- spawning and waves -----------------------------------------------------

function stepSpawning(G, dt) {
  if (G.waveState !== 'active' || G.spawnQueue.length === 0) return;
  G.spawnTimer -= dt;
  if (G.spawnTimer > 0) return;
  if (G.enemies.length >= WAVES.maxAlive) return;
  G.spawnTimer = WAVES.spawnInterval * G.rng.range(0.7, 1.25);
  const next = G.spawnQueue.shift();
  const at = spawnPoint(G);
  const e = makeEnemy(next.kind, at.x, at.y, next.elite, G.wave);
  G.enemies.push(e);
  if (e.kind === 'warden') G.boss = e;
  ring(at.x, at.y, ENEMY_KINDS[next.kind].color, 200, 0.3, 2);
}

function stepWaveFlow(G, dt) {
  if (G.waveState === 'banner') {
    G.waveTimer -= dt;
    if (G.waveTimer <= 0) G.waveState = 'active';
    return;
  }
  if (G.waveState === 'active') {
    if (G.spawnQueue.length === 0 && G.enemies.length === 0 && G.player.alive) {
      G.waveState = 'clear';
      G.waveTimer = WAVES.clearTime;
      const bonus = SCORE.waveClear * G.wave;
      G.score += bonus;
      floatText(G.player.x, G.player.y - 34, `WAVE ${G.wave} CLEAR  +${bonus}`, COLORS.shard, 19);
    }
    return;
  }
  if (G.waveState === 'clear') {
    G.waveTimer -= dt;
    if (G.waveTimer <= 0) {
      G.upgradeChoices = rollUpgrades(G);
      G.screen = 'upgrade';
    }
  }
}

function rollUpgrades(G) {
  const open = UPGRADES.filter((u) => G.upgrades[u.id] < u.max);
  if (open.length === 0) {
    return [
      { id: 'cache', name: 'Cache Bonus', desc: '+750 points, right now', max: 99 },
      { id: 'patch', name: 'Field Patch', desc: 'Repair 2 hull', max: 99 },
    ];
  }
  const first = open[Math.floor(G.rng.next() * open.length)];
  const rest = open.filter((u) => u.id !== first.id);
  if (rest.length === 0) return [first, { id: 'cache', name: 'Cache Bonus', desc: '+750 points, right now', max: 99 }];
  const second = rest[Math.floor(G.rng.next() * rest.length)];
  return [first, second];
}

export function applyUpgrade(G, index) {
  const choice = G.upgradeChoices[index];
  if (!choice) return;
  const p = G.player;
  switch (choice.id) {
    case 'damage': G.upgrades.damage++; break;
    case 'fireRate': G.upgrades.fireRate++; break;
    case 'speed': G.upgrades.speed++; break;
    case 'hull':
      G.upgrades.hull++;
      p.maxHp = Math.min(PLAYER.hpCap, p.maxHp + 1);
      p.hp = Math.min(p.maxHp, p.hp + 1);
      break;
    case 'dash': G.upgrades.dash++; break;
    case 'magnet': G.upgrades.magnet++; break;
    case 'pierce': G.upgrades.pierce++; break;
    case 'combo': G.upgrades.combo++; break;
    case 'cache': G.score += 750; break;
    case 'patch': p.hp = Math.min(p.maxHp, p.hp + 2); break;
  }
  sfx.upgrade();
  G.screen = 'playing';
  nextWave(G);
}

// --- bullets and collisions ---------------------------------------------------

function stepBullets(G, dt) {
  const kept = [];
  for (const b of G.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0 || b.x < VIEW.wall || b.x > VIEW.width - VIEW.wall || b.y < VIEW.wall || b.y > VIEW.height - VIEW.wall) {
      sparks(b.x, b.y, Math.atan2(-b.vy, -b.vx), COLORS.bullet, 2, 0.6);
      continue;
    }
    let dead = false;
    for (const e of G.enemies) {
      if (e.spawnT > 0.1) continue;
      const dx = e.x - b.x;
      const dy = e.y - b.y;
      const rr = e.r + b.r;
      if (dx * dx + dy * dy > rr * rr) continue;
      damageEnemy(G, e, b.damage, b.vx, b.vy);
      G.stats.hits++;
      if (b.pierce > 0) {
        b.pierce--;
      } else {
        dead = true;
      }
      break;
    }
    if (!dead) kept.push(b);
  }
  G.bullets = kept;
}

function stepEnemyBullets(G, dt) {
  const p = G.player;
  const kept = [];
  for (const b of G.enemyBullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0 || b.x < VIEW.wall || b.x > VIEW.width - VIEW.wall || b.y < VIEW.wall || b.y > VIEW.height - VIEW.wall) continue;
    if (p.alive && p.dashT <= 0 && p.invuln <= 0) {
      const dx = p.x - b.x;
      const dy = p.y - b.y;
      const rr = p.r + b.r;
      if (dx * dx + dy * dy <= rr * rr) {
        hitPlayer(G, b.x, b.y);
        continue;
      }
    }
    kept.push(b);
  }
  G.enemyBullets = kept;
}

function stepContact(G, dt) {
  const p = G.player;
  if (!p.alive) return;
  for (const e of G.enemies) {
    if (e.spawnT > 0.1) continue;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const rr = p.r + e.r * 0.86;
    if (dx * dx + dy * dy <= rr * rr) {
      if (p.dashT > 0 || p.invuln > 0) continue;
      hitPlayer(G, e.x, e.y);
      // The thing that hit you pays for it: contact destroys the smaller kinds.
      if (e.kind !== 'bulwark' && e.kind !== 'warden') damageEnemy(G, e, 999, -dx * 4, -dy * 4);
      break;
    }
  }
  void dt;
}

function separateEnemies(G) {
  const list = G.enemies;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const rr = (a.r + b.r) * 0.82;
      const d2 = dx * dx + dy * dy;
      if (d2 === 0 || d2 >= rr * rr) continue;
      const d = Math.sqrt(d2);
      const push = ((rr - d) / d) * 0.5 * 0.6;
      const am = b.mass / (a.mass + b.mass);
      const bm = a.mass / (a.mass + b.mass);
      a.x -= dx * push * am;
      a.y -= dy * push * am;
      b.x += dx * push * bm;
      b.y += dy * push * bm;
    }
  }
}

export function damageEnemy(G, e, damage, vx, vy) {
  e.hp -= damage;
  e.flashT = 0.09;
  const kb = 130 / e.mass;
  e.kx += (vx / (PLAYER.bulletSpeed || 1)) * kb;
  e.ky += (vy / (PLAYER.bulletSpeed || 1)) * kb;
  if (e.hp > 0) {
    sfx.enemyHit();
    sparks(e.x, e.y, Math.atan2(vy, vx), ENEMY_KINDS[e.kind].color, 3, 0.8);
    return;
  }
  killEnemy(G, e);
}

function killEnemy(G, e) {
  const idx = G.enemies.indexOf(e);
  if (idx === -1) return;
  G.enemies.splice(idx, 1);
  if (G.boss === e) G.boss = null;
  G.stats.kills++;

  G.combo++;
  G.comboTimer = COMBO.window + G.upgrades.combo * 0.9;
  G.maxCombo = Math.max(G.maxCombo, G.combo);
  const gained = e.score * comboMultiplier(G);
  G.score += gained;

  const color = ENEMY_KINDS[e.kind].color;
  const big = e.kind === 'bulwark' || e.kind === 'warden' || e.elite;
  burst(e.x, e.y, color, big ? 42 : 16, big ? 360 : 280, 0.55, big ? 4 : 3);
  ring(e.x, e.y, color, big ? 560 : 320, 0.36, big ? 4 : 2);
  floatText(e.x, e.y, `+${gained}`, big ? COLORS.shard : COLORS.text, big ? 19 : 14);
  G.shake = Math.min(15, G.shake + (big ? 7 : 2.2));
  if (big) {
    G.freeze = Math.max(G.freeze, 0.045);
    sfx.bigDie();
  } else {
    sfx.enemyDie();
  }

  // Shards: the score you still have to pick up.
  const shardCount = e.kind === 'warden' ? 14 : e.kind === 'bulwark' ? 6 : G.rng.int(1, 3);
  for (let i = 0; i < shardCount; i++) {
    const a = G.rng.next() * Math.PI * 2;
    const v = G.rng.range(40, 190);
    G.shards.push({
      x: e.x, y: e.y,
      vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      r: 5, life: 7, value: SCORE.shard,
    });
  }

  if (e.kind === 'pod') {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + G.rng.next();
      const mini = makeEnemy('mini', e.x + Math.cos(a) * 16, e.y + Math.sin(a) * 16, false, G.wave);
      mini.spawnT = 0.15;
      G.enemies.push(mini);
    }
  }

  const dropChance = e.elite || e.kind === 'warden' ? 1 : PICKUPS.dropChance;
  if (G.rng.chance(dropChance)) {
    const kind = e.kind === 'warden' ? G.rng.pick(['spread', 'shield']) : G.rng.pick(PICKUP_KINDS);
    G.pickups.push({ kind, x: e.x, y: e.y, r: PICKUPS.radius, life: PICKUPS.life, t: 0 });
  }
  if (e.kind === 'warden') {
    G.pickups.push({ kind: 'repair', x: e.x + 30, y: e.y + 10, r: PICKUPS.radius, life: PICKUPS.life, t: 0 });
    G.flash = 0.7;
    G.shake = 16;
  }
}

function hitPlayer(G, fromX, fromY) {
  const p = G.player;
  // Knockback: a hit shoves you clear of the swarm, so one touch is never a chain-stun.
  if (fromX !== undefined) {
    const dx = p.x - fromX;
    const dy = p.y - fromY;
    const d = Math.hypot(dx, dy) || 1;
    p.vx += (dx / d) * 430;
    p.vy += (dy / d) * 430;
  }
  if (p.shield) {
    p.shield = false;
    p.invuln = 1;
    sfx.shieldBreak();
    ring(p.x, p.y, COLORS.player, 380, 0.3, 3);
    return;
  }
  p.hp--;
  p.invuln = PLAYER.invulnTime;
  G.combo = 0;
  G.comboTimer = 0;
  G.shake = Math.min(18, G.shake + 9);
  G.freeze = Math.max(G.freeze, 0.06);
  G.flash = Math.max(G.flash, 0.35);
  burst(p.x, p.y, COLORS.danger, 22, 320, 0.5, 3);
  sfx.playerHit();
  if (p.hp <= 0) {
    p.alive = false;
    burst(p.x, p.y, COLORS.player, 60, 420, 0.8, 4);
    ring(p.x, p.y, COLORS.player, 640, 0.5, 4);
    G.shake = 18;
    G.freeze = 0.12;
    sfx.bigDie();
    sfx.gameOver();
    setMusicIntensity(0);
    if (G.score > G.best.score) G.best.score = G.score;
    if (G.wave > G.best.wave) G.best.wave = G.wave;
    if (G.maxCombo > G.best.combo) G.best.combo = G.maxCombo;
    saveBest(G.best);
    G.screen = 'over';
  }
}

// --- pickups, shards, combo ---------------------------------------------------

function stepPickups(G, dt) {
  const p = G.player;
  const kept = [];
  for (const pk of G.pickups) {
    pk.t += dt;
    pk.life -= dt;
    if (pk.life <= 0) continue;
    if (p.alive) {
      const dx = p.x - pk.x;
      const dy = p.y - pk.y;
      const rr = p.r + pk.r + 4;
      if (dx * dx + dy * dy <= rr * rr) {
        applyPickup(G, pk.kind);
        continue;
      }
    }
    kept.push(pk);
  }
  G.pickups = kept;
}

function applyPickup(G, kind) {
  const p = G.player;
  if (kind === 'spread') p.spreadT = PICKUPS.spreadTime;
  else if (kind === 'rapid') p.rapidT = PICKUPS.rapidTime;
  else if (kind === 'magnet') p.magnetT = PICKUPS.magnetTime;
  else if (kind === 'shield') p.shield = true;
  else if (kind === 'repair') p.hp = Math.min(p.maxHp, p.hp + 1);
  floatText(p.x, p.y - 26, PICKUP_LABELS[kind], COLORS.shard, 16);
  ring(p.x, p.y, COLORS.shard, 260, 0.3, 2);
  sfx.pickup();
}

function stepShards(G, dt) {
  const p = G.player;
  const kept = [];
  const magnetR = (p.magnetT > 0 ? PICKUPS.magnetBoostRadius : PICKUPS.magnetRadius) * (1 + G.upgrades.magnet * 0.7);
  for (const s of G.shards) {
    s.life -= dt;
    if (s.life <= 0) continue;
    const dx = p.x - s.x;
    const dy = p.y - s.y;
    const d2 = dx * dx + dy * dy;
    if (p.alive && d2 < magnetR * magnetR) {
      const d = Math.sqrt(d2) || 1;
      const pull = 1500 * (1 - d / (magnetR * 1.6));
      s.vx += (dx / d) * pull * dt;
      s.vy += (dy / d) * pull * dt;
    } else {
      s.vx *= Math.exp(-3 * dt);
      s.vy *= Math.exp(-3 * dt);
    }
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    if (p.alive && d2 < (p.r + 12) * (p.r + 12)) {
      G.score += s.value * comboMultiplier(G);
      sfx.shard();
      continue;
    }
    kept.push(s);
  }
  G.shards = kept;
}

function stepCombo(G, dt) {
  if (G.combo <= 0) return;
  G.comboTimer -= dt;
  if (G.comboTimer <= 0) {
    if (G.combo >= COMBO.killsPerTier) sfx.comboLost();
    G.combo = 0;
    G.comboTimer = 0;
  }
}

// --- title-screen ambient -----------------------------------------------------

function seedAmbient(G) {
  const kinds = ['seeker', 'lancer', 'pod', 'weaver', 'bulwark', 'seeker', 'pod'];
  for (const kind of kinds) {
    const at = spawnPoint(G);
    const e = makeEnemy(kind, at.x, at.y, false, 1);
    e.spawnT = 0;
    G.enemies.push(e);
  }
}

function stepAmbient(G, dt) {
  // The swarm drifts around a slow-orbiting lure behind the title.
  G.ambientT += dt;
  G.player.x = VIEW.width / 2 + Math.cos(G.ambientT * 0.24) * 190;
  G.player.y = VIEW.height / 2 + Math.sin(G.ambientT * 0.31) * 120;
  for (const e of G.enemies) updateEnemy(G, e, dt);
  separateEnemies(G);
  G.enemyBullets.length = 0;
  if (G.rng.chance(dt * 0.7)) {
    const e = G.rng.pick(G.enemies);
    if (e) burst(e.x, e.y, ENEMY_KINDS[e.kind].color, 8, 160, 0.5, 2.5);
  }
}
