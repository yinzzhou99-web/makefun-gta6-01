// main.js — Port Azura Heat, conducted.
//
// Wires the city, traffic, pedestrians, police, missions, HUD and audio
// into one game: Rook owes the Marlin Crew $5,000 by sunrise, and every
// system here is a way to earn it or a reason it is hard. Owns the game
// state (title / playing / busted / wasted), the cameras, the crime-and-
// heat bookkeeping, car theft, the chop shop, and the ?demo= staging the
// screenshots are taken with.

import * as THREE from 'three';
import { buildCity, chopShopLot } from './city.js';
import { Vehicle, resolveCarCollisions } from './cars.js';
import { TrafficSystem } from './traffic.js';
import { PedestrianSystem } from './pedestrians.js';
import { PoliceSystem } from './police.js';
import { PlayerController } from './player.js';
import { MissionSystem } from './missions.js';
import { AudioEngine } from './audio.js';
import { HUD } from './hud.js';
import { down, endFrame, initInput, input, lockPointer, tapped } from './input.js';
import { clamp, lerp } from './rng.js';

const DEBT_GOAL = 5000;

// ------------------------------------------------------------ setup

const params = new URLSearchParams(location.search);
const demo = params.get('demo'); // title | foot | drive | chase | null

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 2000);
camera.position.set(120, 60, 220);

const hemi = new THREE.HemisphereLight(0xbfe3ff, 0xffe0b3, 0.95);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffbe78, 2.3);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -95;
sun.shadow.camera.right = 95;
sun.shadow.camera.top = 95;
sun.shadow.camera.bottom = -95;
sun.shadow.camera.far = 420;
sun.shadow.bias = -0.0006;
scene.add(sun, sun.target);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const city = buildCity(scene);
const traffic = new TrafficSystem(scene, city.colliders);
const peds = new PedestrianSystem(scene, city.colliders);
const police = new PoliceSystem(scene, city.colliders);
const player = new PlayerController(scene);
const missions = new MissionSystem(scene);
const audio = new AudioEngine();
const hud = new HUD();
initInput(renderer.domElement);

// ------------------------------------------------------------ state

let mode = 'title'; // title | play | over
let driving = null; // the Vehicle Rook is in, or null on foot
const looseCars = []; // stolen cars Rook has left around the city
let cash = 0;
let earned = 0;
let deliveries = 0;
let playerHealth = 100;
let runTime = 0;
let debtCelebrated = false;
let crashHeatCooldown = 0;
let insideShopLot = false;
let camYaw = Math.PI;
let camPitch = 0.32;
let time = 0;
let realTime = 0;
let qualityDropped = false;
let frameTimeAvg = 0;

const bestHaul = Number(localStorage.getItem('azura_best_haul') ?? 0);
hud.showTitle(bestHaul);

function playerPos() {
  return driving ? driving.pos : player.pos;
}
function playerVel() {
  return driving ? driving.vel : { x: 0, z: 0 };
}
function playerSpeed() {
  return driving ? driving.speed : player.moving;
}
function allVehicles() {
  const list = [...traffic.allVehicles(), ...police.allVehicles(), ...looseCars];
  if (driving) list.push(driving);
  return list;
}

// ------------------------------------------------------------ crime & heat

/** A crime happens at (x, z): witnesses run, and heat lands if seen. */
function crime(amount, x, z, needsWitness = true) {
  const sawPed = peds.witnessCrime(x, z, 27);
  const sawCop = police.nearestCruiser(x, z).dist < 85;
  if (!needsWitness || sawPed || sawCop) police.addHeat(amount);
}

const watchedVehicles = new WeakSet();
/** Attach crash reporting to a vehicle the player might drive or meet. */
function watchVehicle(v) {
  if (watchedVehicles.has(v)) return;
  watchedVehicles.add(v);
  v.onCrash = (strength) => {
    const d = Math.hypot(v.pos.x - playerPos().x, v.pos.z - playerPos().z);
    if (d < 55) audio.crash(strength * clamp(1 - d / 60, 0.15, 1));
    if (v === driving && strength > 0.3 && crashHeatCooldown <= 0) {
      crime(7, v.pos.x, v.pos.z);
      crashHeatCooldown = 2.5;
    }
  };
}
for (const v of traffic.allVehicles()) watchVehicle(v);

// ------------------------------------------------------------ run lifecycle

function startRun() {
  hud.hideTitle();
  hud.hideEnd();
  mode = 'play';
  audio.start();
}

function endRun(kind) {
  if (mode !== 'play') return;
  mode = 'over';
  document.exitPointerLock?.();
  const stats = `Earned $${earned.toLocaleString('en-US')} of the $${DEBT_GOAL.toLocaleString('en-US')} debt · ${deliveries} deliveries · ${Math.floor(runTime / 60)}:${String(Math.floor(runTime % 60)).padStart(2, '0')} on the run`;
  hud.showEnd(kind, stats);
  if (earned > bestHaul) localStorage.setItem('azura_best_haul', String(earned));
  audio.blip(kind === 'busted' ? 196 : 130, 0.5, 'sawtooth', 0.14, 65);
}

function resetRun() {
  if (driving) {
    looseCars.push(driving);
    driving = null;
  }
  player.setVisible(true);
  player.pos.set(196, 0, 176);
  player.heading = Math.PI;
  playerHealth = 100;
  cash = 0;
  earned = 0;
  deliveries = 0;
  runTime = 0;
  debtCelebrated = false;
  police.clearHeat();
  for (const c of [...police.cruisers]) c.dispose(scene);
  police.cruisers.length = 0;
  missions.chain = 0;
  missions.nextOffer(player.pos);
  hud.hideEnd();
  mode = 'play';
}

// ------------------------------------------------------------ missions wiring

missions.onPickup = () => {
  audio.blip(740, 0.09, 'triangle', 0.12);
  hud.toast('PACKAGE ON BOARD');
};
missions.onDeliver = (reward) => {
  cash += reward;
  earned += reward;
  deliveries += 1;
  audio.fanfare();
  audio.cash();
  hud.toast(`+$${reward} — DELIVERED${missions.chain > 1 ? ` · CHAIN ×${missions.chain}` : ''}`);
  if (earned >= DEBT_GOAL && !debtCelebrated) {
    debtCelebrated = true;
    setTimeout(() => hud.toast('DEBT CLEARED — PORT AZURA IS YOURS', 3600), 900);
  }
};
missions.onFail = () => {
  audio.blip(220, 0.2, 'sawtooth', 0.1, 130);
  hud.toast('TOO SLOW — THE CREW KEEPS THE FEE', 2200);
};

// ------------------------------------------------------------ theft & foot combat

function nearestStealable() {
  let best = null;
  let bestD = 3.6;
  for (const v of [...traffic.allVehicles(), ...looseCars]) {
    const d = Math.hypot(v.pos.x - player.pos.x, v.pos.z - player.pos.z);
    if (d < bestD) {
      bestD = d;
      best = v;
    }
  }
  return best;
}

function enterCar(v) {
  traffic.take(v);
  const li = looseCars.indexOf(v);
  if (li >= 0) looseCars.splice(li, 1);
  v.parked = false;
  watchVehicle(v);
  driving = v;
  player.setVisible(false);
  crime(25, v.pos.x, v.pos.z); // carjacking, if anyone saw
  audio.blip(340, 0.07, 'square', 0.1, 240);
}

function exitCar() {
  if (!driving) return;
  const v = driving;
  driving = null;
  v.parked = true;
  looseCars.push(v);
  const rx = Math.cos(v.heading);
  const rz = -Math.sin(v.heading);
  player.pos.set(v.pos.x + rx * 2.6, 0, v.pos.z + rz * 2.6);
  player.heading = v.heading;
  player.setVisible(true);
  audio.blip(280, 0.07, 'square', 0.09, 200);
}

function tryPunch() {
  player.punch();
  const fx = player.pos.x + Math.sin(player.heading) * 1.5;
  const fz = player.pos.z + Math.cos(player.heading) * 1.5;
  const ped = peds.nearest(fx, fz, 1.5);
  if (ped) {
    ped.knockDown();
    const take = 8 + Math.floor(Math.random() * 22);
    cash += take;
    earned += take;
    audio.punch();
    audio.cash();
    hud.toast(`MUGGED +$${take}`);
    crime(15, ped.pos.x, ped.pos.z);
  } else {
    audio.blip(300, 0.05, 'sine', 0.05, 160);
  }
}

// ------------------------------------------------------------ demo staging

const demoRoute = [
  { x: 64, z: 150 }, { x: -160, z: 192 }, { x: -192, z: -60 },
  { x: -60, z: -64 }, { x: 64, z: -160 },
];
let demoRouteIdx = 0;
let demoCar = null;

function setupDemo() {
  if (!demo || demo === 'title') return; // the title demo IS the title screen
  hud.hideTitle();
  mode = 'play';
  if (demo === 'foot') {
    player.pos.set(206, 0, 58);
    player.heading = Math.PI; // walk the boardwalk, city ahead
    const showCar = new Vehicle(scene, 0xff6b4a, {});
    showCar.place(203.5, 38, Math.PI);
    showCar.parked = true;
    looseCars.push(showCar);
    watchVehicle(showCar);
  }
  if (demo === 'drive' || demo === 'chase') {
    demoCar = new Vehicle(scene, demo === 'chase' ? 0xffd94a : 0x4ac8ff, { maxSpeed: 36, accel: 18 });
    demoCar.place(64, demo === 'chase' ? -40 : -150, 0);
    watchVehicle(demoCar);
    driving = demoCar;
    player.setVisible(false);
    missions.pickup = { x: 64, z: -30 };
    missions.beacon.position.set(64, 0, -30);
    if (demo === 'chase') police.addHeat(56); // three stars, sirens on
  }
}

/** Autopilot for the drive/chase demos: follow the route loop. */
function demoDriveControl(dt) {
  const target = demoRoute[demoRouteIdx];
  const dx = target.x - demoCar.pos.x;
  const dz = target.z - demoCar.pos.z;
  if (Math.hypot(dx, dz) < 14) demoRouteIdx = (demoRouteIdx + 1) % demoRoute.length;
  const desired = Math.atan2(dx, dz);
  const diff = Math.atan2(Math.sin(desired - demoCar.heading), Math.cos(desired - demoCar.heading));
  const topSpeed = demo === 'chase' ? 17 : 13.5;
  return {
    throttle: demoCar.speed < topSpeed ? 0.85 : 0,
    steer: clamp(diff * 1.8, -1, 1),
    handbrake: false,
  };
}

// ------------------------------------------------------------ per-frame

const clock = new THREE.Clock();

function frame() {
  requestAnimationFrame(frame);
  const rawDt = clock.getDelta();
  const dt = Math.min(rawDt, 0.05);
  time += dt;
  realTime += rawDt;
  crashHeatCooldown = Math.max(0, crashHeatCooldown - dt);

  // Adaptive quality, judged on real frame time: one downgrade (fewer
  // pixels, no shadow map) if the machine is struggling, title or not.
  frameTimeAvg = lerp(frameTimeAvg || rawDt, rawDt, 0.03);
  if (!qualityDropped && realTime > 3.5 && frameTimeAvg > 0.042) {
    qualityDropped = true;
    renderer.setPixelRatio(1);
    sun.castShadow = false;
  }

  const focus = playerPos();
  city.update(dt, time);
  sun.position.set(focus.x + 130, 95, focus.z - 55);
  sun.target.position.set(focus.x, 0, focus.z);

  if (mode === 'title') {
    // Slow orbit over the bay while the world lives behind the title.
    const t = time * 0.045;
    camera.position.set(Math.sin(t) * 165, 52, Math.cos(t) * 165);
    camera.lookAt(0, 8, 0);
    traffic.update(dt, focus, []);
    peds.update(dt, focus, 0);
    hud.drawMinimap({ player: { x: player.pos.x, z: player.pos.z, heading: player.heading }, traffic: [], police: [], target: null, time });
    renderer.render(scene, camera);
    endFrame();
    return;
  }

  if (mode === 'play') runTime += dt;

  // --- input → control
  let carControl = { throttle: 0, steer: 0, handbrake: false };
  let moveX = 0;
  let moveZ = 0;
  let sprint = false;

  if (demo === 'drive' || demo === 'chase') {
    carControl = demoDriveControl(dt);
  } else if (demo === 'foot') {
    moveZ = -1; // stroll north along the boardwalk
  } else if (mode === 'play') {
    if (driving) {
      if (down('KeyW') || down('ArrowUp')) carControl.throttle += 1;
      if (down('KeyS') || down('ArrowDown')) carControl.throttle -= 1;
      if (down('KeyA') || down('ArrowLeft')) carControl.steer += 1;
      if (down('KeyD') || down('ArrowRight')) carControl.steer -= 1;
      carControl.handbrake = down('Space');
      if (tapped('KeyE') && driving.speed < 3.2) exitCar();
    } else {
      const fwd = (down('KeyW') || down('ArrowUp') ? 1 : 0) - (down('KeyS') || down('ArrowDown') ? 1 : 0);
      const side = (down('KeyD') || down('ArrowRight') ? 1 : 0) - (down('KeyA') || down('ArrowLeft') ? 1 : 0);
      const sin = Math.sin(camYaw);
      const cos = Math.cos(camYaw);
      moveX = sin * fwd + cos * side;
      moveZ = cos * fwd - sin * side;
      sprint = down('ShiftLeft') || down('ShiftRight');
      if (tapped('KeyE')) {
        const v = nearestStealable();
        if (v) enterCar(v);
      }
      if (tapped('KeyF')) tryPunch();
    }
    if (input.locked) {
      camYaw -= input.mouseDX * 0.0026;
      camPitch = clamp(camPitch + input.mouseDY * 0.0022, -0.05, 1.05);
    }
    if (tapped('KeyM')) hud.toast(audio.toggleMute() ? 'SOUND OFF' : 'SOUND ON', 1200);
  }
  if (mode === 'over' && tapped('KeyR')) resetRun();

  // --- simulate
  if (driving) {
    driving.update(dt, carControl, city.colliders);
    player.pos.copy(driving.pos);
  } else if (mode === 'play') {
    player.update(dt, moveX, moveZ, sprint, city.colliders);
    // Cars are solid to a man on foot: he stops at the bumper.
    for (const v of allVehicles()) {
      const dx = player.pos.x - v.pos.x;
      const dz = player.pos.z - v.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.01 && d < 2.7) {
        player.pos.x = v.pos.x + (dx / d) * 2.7;
        player.pos.z = v.pos.z + (dz / d) * 2.7;
      }
    }
  }

  const obstacles = allVehicles().map((v) => v.pos);
  if (!driving) obstacles.push(player.pos);
  traffic.update(dt, focus, obstacles);
  // For the bust, what matters is intent: a driver being shoved around by
  // rams while off the throttle is held, not escaping.
  const tryingToMove = driving ? carControl.throttle > 0.1 : (moveX !== 0 || moveZ !== 0);
  police.update(dt, { pos: playerPos(), vel: playerVel(), speed: playerSpeed(), trying: tryingToMove }, () => endRun('busted'));
  for (const c of police.cruisers) watchVehicle(c);

  const hits = resolveCarCollisions(allVehicles());
  for (const [a, b, closing] of hits) {
    const d = Math.hypot(a.pos.x - focus.x, a.pos.z - focus.z);
    if (d < 55) audio.crash(clamp(closing / 20, 0.2, 1) * clamp(1 - d / 60, 0.15, 1));
    if ((a === driving || b === driving) && crashHeatCooldown <= 0) {
      crime(9, playerPos().x, playerPos().z);
      crashHeatCooldown = 2.5;
    }
  }

  // Cars versus people: only a real speed hurts, and it is always a crime
  // when it is Rook's car.
  for (const ped of peds.peds) {
    if (ped.state === 'down') continue;
    for (const v of allVehicles()) {
      if (v.speed < 3.5) continue;
      if (Math.hypot(ped.pos.x - v.pos.x, ped.pos.z - v.pos.z) < 1.8) {
        ped.knockDown();
        v.vel.x *= 0.72;
        v.vel.z *= 0.72;
        if (v === driving) {
          audio.crash(0.4);
          crime(30, ped.pos.x, ped.pos.z, false);
          hud.toast('HIT AND RUN', 1500);
        }
        break;
      }
    }
  }
  // Cruisers will run Rook down, too.
  if (!driving && mode === 'play') {
    for (const v of allVehicles()) {
      if (v.speed > 4.5 && Math.hypot(player.pos.x - v.pos.x, player.pos.z - v.pos.z) < 1.9) {
        playerHealth -= 26;
        audio.crash(0.5);
        hud.toast('RUN DOWN', 1200);
        player.pos.x += (player.pos.x - v.pos.x) * 0.4 + 2;
        player.pos.z += (player.pos.z - v.pos.z) * 0.4;
        if (playerHealth <= 0) endRun('wasted');
        break;
      }
    }
  }

  peds.update(dt, playerPos(), playerSpeed());

  const collected = missions.update(dt, playerPos());
  if (collected > 0 && mode === 'play') {
    cash += 25 * collected;
    earned += 25 * collected;
    audio.cash();
  }

  // --- the chop shop wash
  const lot = chopShopLot();
  const inLot = Math.abs(playerPos().x - lot.x) < lot.w / 2 && Math.abs(playerPos().z - lot.z) < lot.d / 2;
  if (inLot && police.stars > 0 && mode === 'play' && !demo) {
    const cost = 150 * police.stars;
    if (cash >= cost) {
      if (!insideShopLot) {
        cash -= cost;
        police.clearHeat();
        audio.fanfare();
        hud.toast(`HEAT WASHED — MILO SAYS HI (−$${cost})`, 2600);
      }
    }
  }
  insideShopLot = inLot;

  // --- HUD
  hud.setCash(cash, earned, DEBT_GOAL);
  hud.setStars(police.stars);
  const target = missions.target();
  if (target) {
    const dist = Math.round(Math.hypot(playerPos().x - target.x, playerPos().z - target.z));
    if (missions.state === 'offer') {
      hud.setMission('COURIER RUN', `Reach the gold beacon — ${dist}m`, null);
    } else {
      hud.setMission('DELIVER THE PACKAGE', `Drop it at the green beacon — ${dist}m · $${missions.reward}+`, missions.timeLeft / missions.timeTotal);
    }
  }
  hud.setSpeed(driving ? driving.speedKmh : null, driving ? driving.health : 100);
  hud.setBust(police.bust);
  let prompt = null;
  if (mode === 'play' && demo !== 'drive' && demo !== 'chase') {
    if (driving && driving.health <= 0) prompt = 'WRECKED — [E] GET OUT';
    else if (driving && driving.speed < 3.2) prompt = '[E] GET OUT';
    else if (!driving && nearestStealable()) prompt = '[E] STEAL CAR';
    else if (!driving && peds.nearest(player.pos.x, player.pos.z, 2.2)) prompt = '[F] MUG';
    else if (inLot && police.stars > 0) prompt = cash >= 150 * police.stars ? 'MILO IS WASHING YOUR PLATES…' : `WASH COSTS $${150 * police.stars} — CASH ONLY`;
  }
  hud.setPrompt(prompt);
  hud.drawMinimap({
    player: { x: playerPos().x, z: playerPos().z, heading: driving ? driving.heading : player.heading },
    traffic: traffic.allVehicles().map((v) => v.pos),
    police: police.cruisers.map((v) => v.pos),
    target: target ? { x: target.x, z: target.z, color: missions.state === 'offer' ? '#ffd94a' : '#3aff7a' } : null,
    time,
  });

  const { dist: sirenDist } = police.nearestCruiser(playerPos().x, playerPos().z);
  audio.update(dt, driving ? driving.speed / driving.maxSpeed : 0, police.stars > 0 ? sirenDist : Infinity);

  // --- camera
  if (driving) {
    const back = 10.5;
    const fx = Math.sin(driving.heading);
    const fz = Math.cos(driving.heading);
    const want = new THREE.Vector3(driving.pos.x - fx * back, 4.4, driving.pos.z - fz * back);
    camera.position.lerp(want, 1 - Math.exp(-5.5 * dt));
    camera.lookAt(driving.pos.x + fx * 9, 1.6, driving.pos.z + fz * 9);
    const fov = 62 + clamp(driving.speed / driving.maxSpeed, 0, 1) * 9;
    if (Math.abs(camera.fov - fov) > 0.1) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  } else {
    const dist = 8;
    const cx = player.pos.x - Math.sin(camYaw) * Math.cos(camPitch) * dist;
    const cz = player.pos.z - Math.cos(camYaw) * Math.cos(camPitch) * dist;
    const cy = 1.8 + Math.sin(camPitch) * dist;
    camera.position.lerp(new THREE.Vector3(cx, cy, cz), 1 - Math.exp(-14 * dt));
    camera.lookAt(player.pos.x, 1.7, player.pos.z);
    if (Math.abs(camera.fov - 62) > 0.1) {
      camera.fov = 62;
      camera.updateProjectionMatrix();
    }
  }

  renderer.render(scene, camera);
  endFrame();
}

// ------------------------------------------------------------ boot

renderer.domElement.addEventListener('click', () => {
  if (demo) return;
  if (mode === 'title') startRun();
  if (mode === 'play') lockPointer(renderer.domElement);
});

setupDemo();
frame();

// A handle for the automated playtest: read the game's vital signs.
window.__azura = {
  get mode() { return mode; },
  get stars() { return police.stars; },
  get cash() { return cash; },
  get earned() { return earned; },
  get driving() { return Boolean(driving); },
  get playerSpeed() { return playerSpeed(); },
  get playerPos() { return { x: playerPos().x, z: playerPos().z }; },
  get cruisers() { return police.cruisers.length; },
  get copDist() { return police.nearestCruiser(playerPos().x, playerPos().z).dist; },
  start: startRun,
  // Playtest-only helpers: put Rook somewhere, stir up the PD, list cars.
  warp(x, z) {
    if (driving) exitCar();
    player.pos.set(x, 0, z);
  },
  heat(n) {
    police.addHeat(n);
  },
  carSpots() {
    return traffic.allVehicles().map((v) => ({ x: Math.round(v.pos.x), z: Math.round(v.pos.z), parked: Boolean(v.parked) }));
  },
};
