# Port Azura Heat

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/yinzzhou99-web/makefun-gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/yinzzhou99-web/makefun-gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Port Azura Heat** is an original open-world crime game that runs entirely in
the browser, offline, from its own files. You are Marlo Venn, a wheelman who
owes the Marlin Crew money by sunrise, loose in Port Azura — a sun-soaked
coastal grid city of palm-lined avenues, a boardwalk and a bay. Steal parked
cars, weave through live traffic, run a chain of courier jobs between glowing
beacons, and manage a five-star wanted level: Azura PD cruisers spawn, chase
and ram to box you in, and if they pin you — or you wreck — the run ends.
Everything is generated in code: the city from one seed, the engine hum,
sirens and gunshots from WebAudio, with a full HUD and a live minimap.

## Run it

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts
# then serve out/ statically and open out/game/index.html
```

Or serve this directory directly and open `game/index.html` — no build step,
no network requests; three.js is vendored under `game/vendor/`.

## Controls

- **W A S D** — walk / drive · **Shift** — run
- **E** — enter / exit a car (walk up to one and steal it)
- **Mouse** — aim on foot · **Click** — fire the pistol
- **P** or **Esc** — pause · **R** — restart after a bust or a wreck
- **M** — mute

## What's inside

- A seeded 7×7-street coastal city with buildings, palms, lamps and props
- On-foot and driving play, stealable parked cars, AI traffic and pedestrians
- A wanted system (0–5 stars) with chasing, ramming police cruisers
- A three-job story chain (pickup → hot delivery → lay low) plus free roam
- HUD with health, cash, wanted stars, objective text and a canvas minimap
- Best cash / fastest chain time saved in `localStorage`

MIT licensed — see [LICENSE](LICENSE).
