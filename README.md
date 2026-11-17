# neon-arcade

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/sudoRmMyLife/neon-arcade/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/sudoRmMyLife/neon-arcade/reward.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

**NEONVOID** is an original neon twin-stick arena survival shooter that plays offline in a desktop browser from the static files under `game/` — no build step, no network, no library. You are the last light in a dark arena. Move with WASD, aim with the mouse, and hold fire to burn down five kinds of geometric swarm — chasers, lunging darts, splitters, strafing weavers and armoured bulwarks — while a Warden boss arrives every fifth wave. Kills chain into a combo multiplier, fallen enemies drop score shards and power-ups (spread shot, rapid fire, shield, repair, magnet), and clearing a wave lets you pick one of two upgrades, so every run builds differently. A dash with invulnerability frames, hit-stop, screen shake, particles and a synthesized WebAudio soundtrack (no audio files) carry the feel; the best score, best wave and best combo are kept in `localStorage`.

The source is split by job under `game/src/`: `config.js` (tuning), `random.js` (seeded RNG), `input.js`, `audio.js` (synth effects and music), `particles.js` (particles, shockwaves, floating text), `enemies.js` (the five swarm kinds and the Warden), `world.js` (simulation: player, bullets, pickups, waves, upgrades, collisions), `render.js` (canvas drawing and every screen), `shots.js` (deterministic screenshot staging) and `main.js` (boot and the fixed-step loop).

## Run it

```sh
node serve.ts   # serves game/ at http://localhost:8080
```

To hand the entry in the way the grader does:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=2tnm35pq&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>
