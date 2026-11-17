// config.js — every tuning number for NEONVOID lives here, grouped by the system it
// belongs to, so the rest of the source can stay about behaviour instead of constants.

export const VIEW = {
  width: 1280,          // logical arena width; the canvas letterboxes to this 16:9 stage
  height: 720,
  wall: 26,             // thickness of the arena's glowing border wall
};

export const PLAYER = {
  radius: 13,
  speed: 268,           // px per second
  accel: 2400,          // velocity approach rate; high means snappy, low means drifty
  maxHp: 3,
  hpCap: 6,             // upgrades may never raise max HP past this
  invulnTime: 1.25,     // seconds of blink-invulnerability after taking a hit
  fireInterval: 0.145,  // seconds between shots at base fire rate
  bulletSpeed: 660,
  bulletRadius: 4,
  bulletLife: 0.95,     // seconds a bullet flies before it burns out
  bulletDamage: 1,
};

export const DASH = {
  time: 0.16,           // seconds a dash lasts
  speed: 980,           // px per second during a dash
  cooldown: 1.6,        // seconds before the next dash
  ghostEvery: 0.018,    // seconds between trail ghosts while dashing
};

export const COMBO = {
  window: 2.6,          // seconds a kill chain stays alive without another kill
  killsPerTier: 8,      // kills per multiplier tier
  maxMultiplier: 8,
};

export const PICKUPS = {
  dropChance: 0.13,     // chance a normal enemy drops a power-up
  radius: 11,
  life: 11,             // seconds before an unclaimed power-up fades
  spreadTime: 12,
  rapidTime: 10,
  magnetTime: 10,
  magnetRadius: 120,    // shard attraction radius with no magnet power-up
  magnetBoostRadius: 340,
};

export const WAVES = {
  bannerTime: 2.1,      // seconds the WAVE N banner holds before spawning starts
  clearTime: 1.4,       // beat between the last kill and the upgrade choice
  spawnInterval: 0.55,  // seconds between spawn-queue releases
  maxAlive: 26,         // the arena never holds more live enemies than this
  bossEvery: 5,         // every Nth wave is a Warden boss wave
  baseBudget: 6,        // wave 1 spends this many composition points
  budgetPerWave: 4.5,   // and this many more per wave after it
};

export const SCORE = {
  shard: 10,            // points per collected shard, before the combo multiplier
  waveClear: 150,       // flat bonus per wave number on clearing a wave
};

// The neon palette: one colour per actor, so a scene reads at a glance.
export const COLORS = {
  background: '#05060f',
  grid: 'rgba(56, 189, 248, 0.08)',
  gridMajor: 'rgba(56, 189, 248, 0.16)',
  wall: '#155e75',
  wallGlow: '#22d3ee',
  player: '#a5f3fc',
  playerCore: '#ecfeff',
  bullet: '#a5f3fc',
  enemyBullet: '#fda4af',
  shard: '#ffd60a',
  elite: '#ffd60a',
  text: '#e2e8f0',
  textDim: '#7d8aa5',
  danger: '#fb7185',
  seeker: '#ff2d95',
  lancer: '#ff9f1c',
  pod: '#3dff7a',
  mini: '#8affb0',
  weaver: '#38bdf8',
  bulwark: '#ff2e4d',
  warden: '#e0aaff',
};

export const STORAGE_KEYS = {
  bestScore: 'neonvoid.bestScore',
  bestWave: 'neonvoid.bestWave',
  bestCombo: 'neonvoid.bestCombo',
  muted: 'neonvoid.muted',
};
