// Port Azura Heat — make.fun gta6-01 entrypoint (Node 22, standard library only).
//
// The game itself lives in this directory's game/ folder as plain static files
// (game/index.html plus its ES modules and the vendored three.js build) that a
// desktop browser loads fully offline. This program is only the hand-in
// plumbing: it copies game/ and screenshots/ into the output directory and
// writes dossier.json there with the vendored make.fun dossier library.
//
// The output directory is /output inside the grader's container; anywhere else
// the MAKEFUN_OUTPUT_DIR environment variable stands in for it:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Copy the playable game and the screenshot set next to the dossier.
mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The caps below mirror the scorer's own gate (reference/gate.json): text size
// shapes the dossier bytes, the rest refuse anything the scorer would refuse —
// too many or too-large screenshots, too many game files, an oversized game
// tree, or an over-long path under game/.
const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(out, 'dossier.json'), dossier);
