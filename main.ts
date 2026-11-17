// Port Azura Heat — hand-in program.
//
// Copies the playable game (game/) and its screenshots (screenshots/) from
// this repository into the output directory, then seals the entry with the
// kit's own dossier library so dossier.json is byte for byte what the
// scorer rebuilds from those same files. Standard library only; the output
// depends only on the repository's files, so two runs write the same bytes.

import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The gate's caps for this bounty, passed whole so this program refuses
// exactly where the scorer would.
const GATE_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
} as const;

mkdirSync(outDir, { recursive: true });
for (const part of ['game', 'screenshots']) {
  const target = join(outDir, part);
  rmSync(target, { recursive: true, force: true });
  cpSync(join(repoRoot, part), target, { recursive: true });
}

const dossier = buildDossier(outDir, GATE_CAPS);
writeFileSync(join(outDir, 'dossier.json'), dossier);
