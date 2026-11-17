// render.js — everything NEONVOID draws: the arena, the actors, the HUD and the
// screens (title, upgrade draft, pause, game over). It only reads the world; the
// one pre-rendered background keeps the per-frame cost to the actors themselves.

import { COLORS, COMBO, VIEW, WAVES } from './config.js';
import { ENEMY_KINDS } from './enemies.js';
import { PICKUP_LABELS, comboMultiplier } from './world.js';
import { particlePool, ringPool, textPool } from './particles.js';

let background = null;

function makeBackground() {
  const c = document.createElement('canvas');
  c.width = VIEW.width;
  c.height = VIEW.height;
  const g = c.getContext('2d');
  g.fillStyle = COLORS.background;
  g.fillRect(0, 0, VIEW.width, VIEW.height);

  // Starfield: two depths of dim dots.
  let seed = 1234567;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = 0; i < 150; i++) {
    const big = rnd() > 0.82;
    g.fillStyle = big ? 'rgba(165, 243, 252, 0.5)' : 'rgba(148, 163, 184, 0.28)';
    g.beginPath();
    g.arc(rnd() * VIEW.width, rnd() * VIEW.height, big ? 1.6 : 1, 0, Math.PI * 2);
    g.fill();
  }

  // Grid: fine lines every 40px, majors every 200.
  for (let x = 0; x <= VIEW.width; x += 40) {
    g.strokeStyle = x % 200 === 0 ? COLORS.gridMajor : COLORS.grid;
    g.beginPath();
    g.moveTo(x + 0.5, 0);
    g.lineTo(x + 0.5, VIEW.height);
    g.stroke();
  }
  for (let y = 0; y <= VIEW.height; y += 40) {
    g.strokeStyle = y % 200 === 0 ? COLORS.gridMajor : COLORS.grid;
    g.beginPath();
    g.moveTo(0, y + 0.5);
    g.lineTo(VIEW.width, y + 0.5);
    g.stroke();
  }

  // Centre glow and edge vignette.
  const glow = g.createRadialGradient(640, 360, 60, 640, 360, 620);
  glow.addColorStop(0, 'rgba(34, 211, 238, 0.07)');
  glow.addColorStop(1, 'rgba(34, 211, 238, 0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, VIEW.width, VIEW.height);
  const vig = g.createRadialGradient(640, 360, 380, 640, 360, 900);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.5)');
  g.fillStyle = vig;
  g.fillRect(0, 0, VIEW.width, VIEW.height);
  return c;
}

function polygon(g, x, y, r, sides, rot) {
  g.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
}

// A neon shape: a wide translucent pass for the glow, a bright rim, a dark fill.
function neonShape(g, x, y, r, sides, rot, color, flash) {
  polygon(g, x, y, r, sides, rot);
  g.fillStyle = 'rgba(5, 6, 15, 0.82)';
  g.fill();
  g.strokeStyle = color;
  g.globalAlpha = 0.22;
  g.lineWidth = 7;
  g.stroke();
  g.globalAlpha = 1;
  g.lineWidth = 2;
  g.stroke();
  if (flash > 0) {
    g.fillStyle = `rgba(255,255,255,${Math.min(0.85, flash * 7)})`;
    g.fill();
  }
}

function text(g, str, x, y, size, color, align = 'center', weight = 600, alpha = 1) {
  g.globalAlpha = alpha;
  g.font = `${weight} ${size}px "Segoe UI", system-ui, -apple-system, sans-serif`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillStyle = color;
  g.fillText(str, x, y);
  g.globalAlpha = 1;
}

export function drawGame(g, G) {
  if (!background) background = makeBackground();
  g.drawImage(background, 0, 0);

  const shakeX = (Math.random() - 0.5) * 2 * G.shake;
  const shakeY = (Math.random() - 0.5) * 2 * G.shake;
  g.save();
  g.translate(shakeX, shakeY);

  drawArenaFrame(g, G);
  for (const s of G.shards) drawShard(g, s, G.time);
  for (const pk of G.pickups) drawPickup(g, pk, G.time);
  for (const e of G.enemies) drawEnemy(g, e, G.time);
  for (const b of G.enemyBullets) drawEnemyBullet(g, b);
  for (const b of G.bullets) drawBullet(g, b);
  if (G.player.alive && G.screen !== 'title') drawPlayer(g, G);
  drawParticles(g);
  g.restore();

  if (G.flash > 0) {
    g.fillStyle = `rgba(251, 113, 133, ${G.flash * 0.22})`;
    g.fillRect(0, 0, VIEW.width, VIEW.height);
  }

  if (G.screen === 'title') {
    drawTitle(g, G);
  } else {
    drawHud(g, G);
    if (G.screen === 'upgrade') drawUpgrade(g, G);
    if (G.screen === 'paused') drawPaused(g, G);
    if (G.screen === 'over') drawGameOver(g, G);
  }
}

function drawArenaFrame(g, G) {
  const w = VIEW.wall;
  g.strokeStyle = COLORS.wall;
  g.lineWidth = 3;
  g.strokeRect(w / 2 + 6, w / 2 + 6, VIEW.width - w - 12, VIEW.height - w - 12);
  g.strokeStyle = COLORS.wallGlow;
  g.globalAlpha = 0.5 + Math.sin(G.time * 2) * 0.08;
  g.lineWidth = 1.5;
  g.strokeRect(w / 2 + 6, w / 2 + 6, VIEW.width - w - 12, VIEW.height - w - 12);
  g.globalAlpha = 1;
}

// --- actors -------------------------------------------------------------------

function drawPlayer(g, G) {
  const p = G.player;
  if (p.invuln > 0 && p.dashT <= 0 && Math.floor(G.time * 14) % 2 === 0) return; // blink
  g.save();
  g.translate(p.x, p.y);
  g.rotate(p.angle);
  // Engine glow behind the ship.
  const flick = 0.75 + Math.sin(G.time * 31) * 0.25;
  g.beginPath();
  g.moveTo(-p.r - 7 * flick - 3, 0);
  g.lineTo(-p.r + 2, -4.5);
  g.lineTo(-p.r + 2, 4.5);
  g.closePath();
  g.fillStyle = 'rgba(34, 211, 238, 0.55)';
  g.fill();
  // Hull: a sleek arrow.
  g.beginPath();
  g.moveTo(p.r + 5, 0);
  g.lineTo(-p.r + 3, -p.r + 2);
  g.lineTo(-p.r * 0.45, 0);
  g.lineTo(-p.r + 3, p.r - 2);
  g.closePath();
  g.fillStyle = 'rgba(8, 20, 30, 0.9)';
  g.fill();
  g.strokeStyle = COLORS.player;
  g.globalAlpha = 0.25;
  g.lineWidth = 7;
  g.stroke();
  g.globalAlpha = 1;
  g.lineWidth = 2;
  g.stroke();
  g.beginPath();
  g.arc(1, 0, 3.6, 0, Math.PI * 2);
  g.fillStyle = COLORS.playerCore;
  g.fill();
  g.restore();

  if (p.shield) {
    g.beginPath();
    g.arc(p.x, p.y, p.r + 9 + Math.sin(G.time * 5) * 1.5, 0, Math.PI * 2);
    g.strokeStyle = 'rgba(165, 243, 252, 0.65)';
    g.lineWidth = 1.6;
    g.stroke();
  }
}

function drawEnemy(g, e, time) {
  const kind = ENEMY_KINDS[e.kind];
  const color = kind.color;
  g.save();
  if (e.spawnT > 0) g.globalAlpha = 1 - (e.spawnT / 0.35) * 0.75;
  g.translate(e.x, e.y);

  if (e.kind === 'lancer' && e.state === 'aim') {
    // Telegraph: a thin warning line along the locked lunge.
    g.save();
    g.rotate(Math.atan2(e.lockY, e.lockX));
    g.strokeStyle = 'rgba(255, 159, 28, 0.4)';
    g.setLineDash([6, 8]);
    g.beginPath();
    g.moveTo(e.r, 0);
    g.lineTo(230, 0);
    g.stroke();
    g.restore();
  }

  switch (e.kind) {
    case 'seeker':
      neonShape(g, 0, 0, e.r, 3, e.angle, color, e.flashT);
      break;
    case 'lancer': {
      const stretch = e.state === 'lunge' ? 1.35 : 1;
      g.rotate(e.angle);
      g.beginPath();
      g.moveTo(e.r * stretch, 0);
      g.lineTo(-e.r * 0.7, -e.r * 0.62);
      g.lineTo(-e.r * 0.25, 0);
      g.lineTo(-e.r * 0.7, e.r * 0.62);
      g.closePath();
      g.fillStyle = 'rgba(5,6,15,0.85)';
      g.fill();
      g.strokeStyle = e.state === 'aim' && Math.floor(time * 16) % 2 === 0 ? '#ffffff' : color;
      g.lineWidth = 2;
      g.stroke();
      break;
    }
    case 'pod':
      neonShape(g, 0, 0, e.r, 4, e.angle, color, e.flashT);
      neonShape(g, 0, 0, e.r * 0.5, 4, -e.angle * 1.7, color, 0);
      break;
    case 'mini':
      neonShape(g, 0, 0, e.r, 4, e.angle + time * 2, color, e.flashT);
      break;
    case 'weaver':
      neonShape(g, 0, 0, e.r, 4, e.angle + Math.PI / 4, color, e.flashT);
      g.beginPath();
      g.arc(0, 0, 4, 0, Math.PI * 2);
      g.fillStyle = color;
      g.fill();
      break;
    case 'bulwark':
      neonShape(g, 0, 0, e.r, 6, e.angle, color, e.flashT);
      neonShape(g, 0, 0, e.r * 0.62, 6, -e.angle * 0.8, color, 0);
      break;
    case 'warden': {
      neonShape(g, 0, 0, e.r, 8, e.angle, color, e.flashT);
      neonShape(g, 0, 0, e.r * 0.66, 4, -e.angle * 1.6, color, 0);
      const pulse = 0.8 + Math.sin(time * 4) * 0.2;
      g.beginPath();
      g.arc(0, 0, 10 * pulse, 0, Math.PI * 2);
      g.fillStyle = e.state === 'chargeTele' ? '#ffffff' : color;
      g.fill();
      break;
    }
  }
  g.restore();

  if (e.elite) {
    g.beginPath();
    g.arc(e.x, e.y, e.r + 6 + Math.sin(time * 6) * 1.5, 0, Math.PI * 2);
    g.strokeStyle = COLORS.elite;
    g.globalAlpha = 0.8;
    g.lineWidth = 1.6;
    g.stroke();
    g.globalAlpha = 1;
  }

  // A slim health bar for anything tanky enough to need one.
  if (e.hp < e.maxHp && e.maxHp >= 3 && e.kind !== 'warden') {
    const w = e.r * 2;
    g.fillStyle = 'rgba(148, 163, 184, 0.35)';
    g.fillRect(e.x - e.r, e.y - e.r - 10, w, 3);
    g.fillStyle = color;
    g.fillRect(e.x - e.r, e.y - e.r - 10, w * Math.max(0, e.hp / e.maxHp), 3);
  }
}

function drawBullet(g, b) {
  g.strokeStyle = COLORS.bullet;
  g.lineWidth = 3;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016);
  g.lineTo(b.x, b.y);
  g.stroke();
}

function drawEnemyBullet(g, b) {
  g.beginPath();
  g.arc(b.x, b.y, b.r + 3, 0, Math.PI * 2);
  g.fillStyle = 'rgba(253, 164, 175, 0.25)';
  g.fill();
  g.beginPath();
  g.arc(b.x, b.y, b.r, 0, Math.PI * 2);
  g.fillStyle = COLORS.enemyBullet;
  g.fill();
}

function drawShard(g, s, time) {
  const blink = s.life < 1.6 && Math.floor(time * 10) % 2 === 0;
  g.save();
  g.translate(s.x, s.y);
  g.rotate(time * 3 + s.x);
  g.globalAlpha = blink ? 0.3 : 0.95;
  g.beginPath();
  g.moveTo(0, -6);
  g.lineTo(4.4, 0);
  g.lineTo(0, 6);
  g.lineTo(-4.4, 0);
  g.closePath();
  g.fillStyle = COLORS.shard;
  g.fill();
  g.restore();
}

function drawPickup(g, pk, time) {
  const bob = Math.sin(time * 3 + pk.x * 0.05) * 3;
  const blink = pk.life < 2.5 && Math.floor(time * 8) % 2 === 0;
  const color = {
    spread: '#f472b6', rapid: '#facc15', shield: '#7dd3fc', repair: '#4ade80', magnet: '#c084fc',
  }[pk.kind];
  g.save();
  g.translate(pk.x, pk.y + bob);
  g.globalAlpha = blink ? 0.35 : 1;
  g.beginPath();
  g.arc(0, 0, pk.r + 4 + Math.sin(time * 4) * 1.6, 0, Math.PI * 2);
  g.strokeStyle = color;
  g.globalAlpha *= 0.5;
  g.lineWidth = 1.4;
  g.stroke();
  g.globalAlpha = blink ? 0.35 : 1;
  g.fillStyle = 'rgba(5, 6, 15, 0.88)';
  g.beginPath();
  g.arc(0, 0, pk.r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = color;
  g.lineWidth = 1.8;
  g.stroke();
  drawPickupIcon(g, pk.kind, color);
  g.restore();
}

function drawPickupIcon(g, kind, color) {
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = 1.8;
  if (kind === 'spread') {
    for (const a of [-0.5, 0, 0.5]) {
      g.beginPath();
      g.arc(Math.sin(a) * 6, -Math.cos(a) * 6 + 2, 1.8, 0, Math.PI * 2);
      g.fill();
    }
  } else if (kind === 'rapid') {
    g.beginPath();
    g.moveTo(1.5, -6);
    g.lineTo(-3, 1);
    g.lineTo(0, 1);
    g.lineTo(-1.5, 6);
    g.lineTo(3.4, -1);
    g.lineTo(0.4, -1);
    g.closePath();
    g.fill();
  } else if (kind === 'shield') {
    g.beginPath();
    g.arc(0, 0, 5.6, 0, Math.PI * 2);
    g.stroke();
  } else if (kind === 'repair') {
    g.fillRect(-1.6, -5.6, 3.2, 11.2);
    g.fillRect(-5.6, -1.6, 11.2, 3.2);
  } else if (kind === 'magnet') {
    g.beginPath();
    g.arc(0, 0.5, 5.4, Math.PI, 0);
    g.stroke();
    g.beginPath();
    g.moveTo(-5.4, 0.5);
    g.lineTo(-5.4, 5);
    g.moveTo(5.4, 0.5);
    g.lineTo(5.4, 5);
    g.stroke();
  }
}

function drawParticles(g) {
  for (const r of ringPool) {
    if (!r.alive) continue;
    g.beginPath();
    g.arc(r.x, r.y, r.r, 0, Math.PI * 2);
    g.strokeStyle = r.color;
    g.globalAlpha = Math.max(0, r.life / r.maxLife) * 0.8;
    g.lineWidth = r.width;
    g.stroke();
  }
  g.globalAlpha = 1;
  for (const p of particlePool) {
    if (!p.alive) continue;
    const a = Math.max(0, p.life / p.maxLife);
    g.globalAlpha = a;
    if (p.streak) {
      g.strokeStyle = p.color;
      g.lineWidth = p.size * 0.7;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
      g.lineTo(p.x, p.y);
      g.stroke();
    } else {
      g.fillStyle = p.color;
      g.beginPath();
      g.arc(p.x, p.y, p.size * a + 0.4, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.globalAlpha = 1;
  for (const t of textPool) {
    if (!t.alive) continue;
    text(g, t.value, t.x, t.y, t.size, t.color, 'center', 700, Math.min(1, (t.life / t.maxLife) * 1.6));
  }
}

// --- HUD ----------------------------------------------------------------------

function drawHud(g, G) {
  const p = G.player;

  // Hull hearts, top-left.
  for (let i = 0; i < p.maxHp; i++) {
    const x = 46 + i * 26;
    const y = 44;
    g.save();
    g.translate(x, y);
    g.rotate(Math.PI / 4);
    const filled = i < p.hp;
    g.fillStyle = filled ? COLORS.danger : 'rgba(251, 113, 133, 0.16)';
    g.fillRect(-6, -6, 12, 12);
    g.strokeStyle = COLORS.danger;
    g.lineWidth = 1.4;
    g.strokeRect(-6, -6, 12, 12);
    g.restore();
  }
  if (p.shield) text(g, 'SHIELD UP', 46, 70, 12, COLORS.player, 'left', 700);

  // Wave, top-centre.
  text(g, `WAVE ${Math.max(1, G.wave)}`, VIEW.width / 2, 40, 21, COLORS.text, 'center', 800);
  if (G.screen === 'playing') {
    const left = G.enemies.length + G.spawnQueue.length;
    text(g, G.waveState === 'banner' ? 'INCOMING' : `${left} HOSTILE${left === 1 ? '' : 'S'}`, VIEW.width / 2, 64, 13, COLORS.textDim, 'center', 600);
  }

  // Score, top-right, with the combo under it.
  text(g, String(G.score).padStart(6, '0'), VIEW.width - 46, 40, 24, COLORS.text, 'right', 800);
  text(g, `BEST ${Math.max(G.best.score, G.score)}`, VIEW.width - 46, 64, 12, COLORS.textDim, 'right', 600);
  if (G.combo >= 2) {
    const mult = comboMultiplier(G);
    const frac = Math.max(0, G.comboTimer / (COMBO.window + G.upgrades.combo * 0.9));
    text(g, `COMBO ${G.combo}  ×${mult}`, VIEW.width - 46, 92, 16, mult >= 4 ? COLORS.shard : COLORS.text, 'right', 800);
    g.fillStyle = 'rgba(148, 163, 184, 0.3)';
    g.fillRect(VIEW.width - 46 - 130, 104, 130, 3);
    g.fillStyle = COLORS.shard;
    g.fillRect(VIEW.width - 46 - 130, 104, 130 * frac, 3);
  }

  // Active power-up chips, bottom-left.
  const chips = [];
  if (p.spreadT > 0) chips.push(['TRIPLE', p.spreadT]);
  if (p.rapidT > 0) chips.push(['RAPID', p.rapidT]);
  if (p.magnetT > 0) chips.push(['MAGNET', p.magnetT]);
  chips.forEach(([label, secs], i) => {
    text(g, `${label} ${secs.toFixed(0)}s`, 46, VIEW.height - 66 + i * 20, 13, COLORS.shard, 'left', 700);
  });

  // Dash state, bottom-right.
  const dashReady = p.dashCd <= 0;
  text(g, dashReady ? 'DASH READY' : 'DASH …', VIEW.width - 46, VIEW.height - 46, 13, dashReady ? COLORS.player : COLORS.textDim, 'right', 700);
  text(g, 'M — SOUND · P — PAUSE', VIEW.width - 46, VIEW.height - 24, 11, COLORS.textDim, 'right', 500);

  // Boss bar, bottom-centre.
  if (G.boss && G.boss.hp > 0) {
    const w = 460;
    const x = (VIEW.width - w) / 2;
    const y = VIEW.height - 52;
    text(g, 'THE WARDEN', VIEW.width / 2, y - 12, 13, COLORS.warden, 'center', 800);
    g.fillStyle = 'rgba(224, 170, 255, 0.18)';
    g.fillRect(x, y, w, 8);
    g.fillStyle = COLORS.warden;
    g.fillRect(x, y, w * Math.max(0, G.boss.hp / G.boss.maxHp), 8);
  }

  // Wave banner.
  if (G.screen === 'playing' && G.waveState === 'banner') {
    const boss = G.wave % WAVES.bossEvery === 0;
    const a = Math.min(1, G.waveTimer / 0.5, (WAVES.bannerTime - G.waveTimer) / 0.2 + 0.2);
    text(g, boss ? '⚠ THE WARDEN APPROACHES ⚠' : `WAVE ${G.wave}`, VIEW.width / 2, 250, boss ? 40 : 52, boss ? COLORS.warden : COLORS.text, 'center', 800, a);
    text(g, boss ? 'Break its guard. Take its hoard.' : 'Hold the line.', VIEW.width / 2, 292, 17, COLORS.textDim, 'center', 500, a);
  }

  // Low-hull warning pulse.
  if (G.screen === 'playing' && p.alive && p.hp === 1) {
    const a = 0.1 + Math.sin(G.time * 6) * 0.05;
    const grad = g.createRadialGradient(640, 360, 320, 640, 360, 880);
    grad.addColorStop(0, 'rgba(251,113,133,0)');
    grad.addColorStop(1, `rgba(251,113,133,${a})`);
    g.fillStyle = grad;
    g.fillRect(0, 0, VIEW.width, VIEW.height);
  }

  // Aim reticle.
  if (G.pointer && G.screen === 'playing') {
    g.beginPath();
    g.arc(G.pointer.x, G.pointer.y, 9, 0, Math.PI * 2);
    g.strokeStyle = 'rgba(165, 243, 252, 0.8)';
    g.lineWidth = 1.4;
    g.stroke();
    g.beginPath();
    g.arc(G.pointer.x, G.pointer.y, 1.6, 0, Math.PI * 2);
    g.fillStyle = COLORS.player;
    g.fill();
  }
}

// --- screens --------------------------------------------------------------------

function dimScreen(g, alpha = 0.55) {
  g.fillStyle = `rgba(3, 4, 10, ${alpha})`;
  g.fillRect(0, 0, VIEW.width, VIEW.height);
}

function drawTitle(g, G) {
  dimScreen(g, 0.45);
  const cx = VIEW.width / 2;
  // Title with a hand-built glow: the same word, widening strokes beneath.
  g.save();
  try { g.letterSpacing = '14px'; } catch { /* older canvas: spacing is a garnish */ }
  text(g, 'NEONVOID', cx, 168, 96, 'rgba(34, 211, 238, 0.25)', 'center', 800);
  text(g, 'NEONVOID', cx, 166, 96, COLORS.player, 'center', 800);
  g.restore();
  text(g, 'O U T L A S T   T H E   S W A R M', cx, 232, 19, COLORS.shard, 'center', 700);

  text(g, 'You are the last light in a dark arena. Burn down the swarm,', cx, 300, 17, COLORS.text, 'center', 500);
  text(g, 'chain kills into combos, and draft an upgrade after every wave.', cx, 326, 17, COLORS.text, 'center', 500);
  text(g, 'Every fifth wave, the Warden comes for you.', cx, 352, 17, COLORS.text, 'center', 500);

  const left = cx - 250;
  const rows = [
    ['WASD / ARROW KEYS', 'move'],
    ['MOUSE', 'aim'],
    ['HOLD CLICK / SPACE', 'fire'],
    ['SHIFT / RIGHT CLICK', 'dash (invulnerable)'],
    ['P', 'pause'],
    ['M', 'sound on/off'],
  ];
  rows.forEach(([keys, what], i) => {
    text(g, keys, left, 404 + i * 27, 15, COLORS.player, 'left', 700);
    text(g, what, left + 215, 404 + i * 27, 15, COLORS.textDim, 'left', 500);
  });

  if (G.best.score > 0) {
    text(g, `BEST ${G.best.score} · WAVE ${G.best.wave} · COMBO ${G.best.combo}`, cx, 592, 15, COLORS.textDim, 'center', 600);
  }
  const blink = Math.floor(G.time * 1.6) % 2 === 0;
  text(g, 'CLICK OR PRESS ENTER TO PLAY', cx, 636, 21, COLORS.text, 'center', 800, blink ? 1 : 0.35);
  text(g, 'An original arena shooter · sound on for the full effect', cx, 678, 13, COLORS.textDim, 'center', 500);
}

function drawUpgrade(g, G) {
  dimScreen(g, 0.62);
  const cx = VIEW.width / 2;
  text(g, `WAVE ${G.wave} CLEARED`, cx, 168, 34, COLORS.text, 'center', 800);
  text(g, 'Choose an upgrade — press 1 or 2, or click', cx, 206, 16, COLORS.textDim, 'center', 500);

  G.upgradeChoices.forEach((choice, i) => {
    const w = 330;
    const h = 188;
    const x = cx + (i === 0 ? -w - 26 : 26);
    const y = 268;
    const hovered = (G.hoverCard ?? -1) === i;
    g.fillStyle = hovered ? 'rgba(21, 34, 54, 0.95)' : 'rgba(10, 15, 28, 0.95)';
    g.fillRect(x, y, w, h);
    g.strokeStyle = hovered ? COLORS.player : 'rgba(56, 189, 248, 0.4)';
    g.lineWidth = hovered ? 2.4 : 1.4;
    g.strokeRect(x, y, w, h);
    text(g, `[ ${i + 1} ]`, x + w / 2, y + 34, 14, COLORS.textDim, 'center', 700);
    text(g, choice.name.toUpperCase(), x + w / 2, y + 72, 24, COLORS.player, 'center', 800);
    text(g, choice.desc, x + w / 2, y + 106, 15, COLORS.text, 'center', 500);
    const stacks = G.upgrades[choice.id] ?? 0;
    if (choice.max < 90) {
      for (let s = 0; s < choice.max; s++) {
        g.beginPath();
        g.arc(x + w / 2 + (s - (choice.max - 1) / 2) * 18, y + 146, 5, 0, Math.PI * 2);
        g.fillStyle = s < stacks ? COLORS.shard : 'rgba(148, 163, 184, 0.3)';
        g.fill();
      }
    }
  });
  text(g, `SCORE ${G.score} · HULL ${G.player.hp}/${G.player.maxHp}`, cx, 516, 15, COLORS.textDim, 'center', 600);
}

function drawPaused(g, G) {
  dimScreen(g, 0.6);
  text(g, 'PAUSED', VIEW.width / 2, 320, 52, COLORS.text, 'center', 800);
  text(g, 'Press P or Enter to resume', VIEW.width / 2, 372, 17, COLORS.textDim, 'center', 500);
}

function drawGameOver(g, G) {
  dimScreen(g, 0.66);
  const cx = VIEW.width / 2;
  text(g, 'SIGNAL LOST', cx, 168, 62, COLORS.danger, 'center', 800);
  const isBest = G.score > 0 && G.score >= G.best.score;
  text(g, isBest ? '★ NEW BEST RUN ★' : `The swarm takes wave ${G.wave}.`, cx, 222, 18, isBest ? COLORS.shard : COLORS.textDim, 'center', 700);

  const accuracy = G.stats.shots > 0 ? Math.round((G.stats.hits / G.stats.shots) * 100) : 0;
  const rows = [
    ['SCORE', String(G.score)],
    ['WAVE REACHED', String(G.wave)],
    ['KILLS', String(G.stats.kills)],
    ['BEST COMBO', `${G.maxCombo} (×${comboMultiplier({ combo: G.maxCombo })})`],
    ['ACCURACY', `${accuracy}%`],
    ['TIME SURVIVED', `${Math.floor(G.runTime / 60)}:${String(Math.floor(G.runTime % 60)).padStart(2, '0')}`],
  ];
  rows.forEach(([label, value], i) => {
    const y = 292 + i * 40;
    text(g, label, cx - 30, y, 16, COLORS.textDim, 'right', 600);
    text(g, value, cx + 30, y, 17, COLORS.text, 'left', 800);
  });

  const blink = Math.floor(G.time * 1.6) % 2 === 0;
  text(g, 'PRESS ENTER TO PLAY AGAIN', cx, 292 + rows.length * 40 + 26, 20, COLORS.text, 'center', 800, blink ? 1 : 0.35);
  text(g, `BEST ${G.best.score} · WAVE ${G.best.wave} · COMBO ${G.best.combo}`, cx, 292 + rows.length * 40 + 62, 14, COLORS.textDim, 'center', 600);
}
