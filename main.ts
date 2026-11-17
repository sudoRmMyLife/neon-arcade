// NEONVOID — entry program for make.fun's best-game-01 bounty (Node 22, standard library only).
//
// The game itself is the static site in game/: plain files a desktop browser opens offline
// (game/index.html plus its ES modules — no build step, no library, no network request).
// This program is only the courier. It copies game/ and screenshots/ from beside itself into
// the output directory and writes dossier.json there with buildDossier from the vendored
// make.fun library, byte for byte the summary the sealed scorer rebuilds and compares.
//
// Run it the way the grader does:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// MAKEFUN_OUTPUT_DIR stands in for /output outside the grader's container.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outDir, { recursive: true });
cpSync(join(repoDir, 'game'), join(outDir, 'game'), { recursive: true });

mkdirSync(join(outDir, 'screenshots'), { recursive: true });
const shotsDir = join(repoDir, 'screenshots');
if (existsSync(shotsDir)) {
  cpSync(shotsDir, join(outDir, 'screenshots'), { recursive: true });
}

// The caps below are the scorer's own (reference/gate.json). text_max_bytes shapes the
// dossier's text; the rest make this program refuse a tree the scorer would refuse anyway:
// at most 4 screenshots of at most 256 KiB, at most 993 files and 48 MiB under game/, and
// no path under game/ longer than 1000 bytes.
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
