// Port Azura Heat — game orchestration: scene, states (menu / playing /
// paused / over), combat, collisions, camera, crime wiring, restart.
// Restart correctness rule: resetWorld() rebuilds every dynamic system from
// scratch, so nothing (timers, Maps, entity lists) can leak across runs.

import * as THREE from 'three';
import { buildCity, collideCircle, isOnRoad, PITCH } from './city.js';
import { makeCar, driveCar, carCarCollide, CAR_COLORS } from './cars.js';
import { Traffic } from './traffic.js';
import { Pedestrians } from './pedestrians.js';
import { Police } from './police.js';
import { Player } from './player.js';
import { Missions } from './missions.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { SoundKit } from './audio.js';
import { clamp, makeRng } from './rng.js';

const params = new URLSearchParams(location.search);
const DEMO = params.has('demo');
const SHOT = params.get('shot');

// ---------- Renderer / scene ----------
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87c5e8);
scene.fog = new THREE.Fog(0xf2cf9e, 120, 420);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 900);
camera.position.set(0, 40, 60);

const sun = new THREE.DirectionalLight(0xffe3b3, 2.6);
sun.position.set(120, 180, 60);
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x8a7a5a, 1.1));

// ---------- World ----------
const city = buildCity(scene);
const traffic = new Traffic(scene);
const peds = new Pedestrians(scene);
const police = new Police(scene);
const player = new Player(scene);
const missions = new Missions(scene);
const hud = new HUD();
const input = new Input(canvas);
const sound = new SoundKit();
const rng = makeRng(31337);

let parkedCars = [];
function spawnParked() {
  for (const car of parkedCars) scene.remove(car.mesh);
  parkedCars = [];
  const spots = [...city.parkedSpots];
  for (let i = 0; i < 26 && spots.length; i++) {
    const idx = Math.floor(rng.next() * spots.length);
    const s = spots.splice(idx, 1)[0];
    const car = makeCar(scene, rng.pick(CAR_COLORS), s.x, s.z, s.angle + (rng.chance(0.5) ? 0 : Math.PI), 'parked');
    parkedCars.push(car);
  }
}
spawnParked();

// ---------- Run state ----------
let state = 'menu'; // menu | playing | paused | over
let cash = 0;
let crimeCooldown = 0;
let shotCooldown = 0;
let camYaw = Math.PI;
let prevFocus = { x: 0, z: 0 };
let focusVel = { x: 0, z: 0 };
let tracers = [];
let runTime = 0;

const best = (() => {
  try { return JSON.parse(localStorage.getItem('portAzuraBest') || '{}'); } catch { return {}; }
})();
function saveBest() {
  try { localStorage.setItem('portAzuraBest', JSON.stringify(best)); } catch { /* private mode */ }
}
const bestLine = document.getElementById('best-line');
if (best.cash) bestLine.textContent = `Best haul: $${best.cash}${best.time ? ` · chain in ${Math.round(best.time)}s` : ''}`;

function focusPos() {
  return player.driving ? player.car.pos : player.pos;
}

// A crime only draws full heat when the law is near enough to hear about it.
function commitCrime(points, pos) {
  const nearest = police.nearestDist(pos);
  const witnessed = nearest < 68 || police.stars > 0;
  police.addHeat(witnessed ? points : Math.round(points * 0.45));
}

const facade = {
  get playerPos() { return focusPos(); },
  addCash(n) { cash += n; },
  toast(msg) { hud.toast(msg); },
  setHeatAtLeast(n) { police.setHeatAtLeast(n); },
  setDecayBoost(x) { police.decayBoost = x; },
  stars() { return police.stars; },
  sound(name) { if (sound[name]) sound[name](); },
};

// ---------- Shooting ----------
const raycaster = new THREE.Raycaster();
const mouseNDC = new THREE.Vector2();
const aimPoint = new THREE.Vector3(0, 0, -10);
const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a8 });

function updateAim() {
  mouseNDC.set((input.mouseX / window.innerWidth) * 2 - 1, -(input.mouseY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(mouseNDC, camera);
  const t = (0.3 - raycaster.ray.origin.y) / raycaster.ray.direction.y;
  if (t > 0 && t < 200) aimPoint.copy(raycaster.ray.origin).addScaledVector(raycaster.ray.direction, t);
}

function firePistol() {
  sound.shot();
  peds.scare(player.pos, 26);
  const from = player.pos;
  const dx = aimPoint.x - from.x, dz = aimPoint.z - from.z;
  const aimAngle = Math.atan2(dx, dz);
  let bestTarget = null, bestDist = 34;
  const consider = (x, z, obj, kind) => {
    const ddx = x - from.x, ddz = z - from.z;
    const d = Math.hypot(ddx, ddz);
    if (d > bestDist || d < 0.5) return;
    let diff = Math.atan2(ddx, ddz) - aimAngle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) < 0.14) { bestTarget = { obj, kind, x, z }; bestDist = d; }
  };
  for (const ped of peds.peds) if (!ped.dead) consider(ped.pos.x, ped.pos.z, ped, 'ped');
  for (const car of allCars()) consider(car.pos.x, car.pos.z, car, 'car');

  const end = bestTarget
    ? new THREE.Vector3(bestTarget.x, 1, bestTarget.z)
    : new THREE.Vector3(from.x + Math.sin(aimAngle) * 34, 1, from.z + Math.cos(aimAngle) * 34);
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(from.x, 1.35, from.z), end]);
  const line = new THREE.Line(geo, tracerMat);
  scene.add(line);
  tracers.push({ line, ttl: 0.07 });

  if (bestTarget && bestTarget.kind === 'ped') {
    if (peds.hurt(bestTarget.obj)) commitCrime(120, from);
  } else if (bestTarget && bestTarget.kind === 'car') {
    bestTarget.obj.health -= 22;
    commitCrime(30, from);
  } else {
    commitCrime(14, from);
  }
}

function allCars() {
  const list = [...traffic.cars, ...parkedCars, ...police.cruisers];
  if (player.car && !list.includes(player.car)) list.push(player.car);
  return list;
}

// ---------- Enter / exit ----------
function nearestStealable() {
  let bestCar = null, bestD = 3.8;
  for (const car of [...parkedCars, ...traffic.cars]) {
    if (car.dead) continue;
    const d = Math.hypot(car.pos.x - player.pos.x, car.pos.z - player.pos.z);
    if (d < bestD) { bestD = d; bestCar = car; }
  }
  return bestCar;
}

function enterCar(car) {
  const pi = parkedCars.indexOf(car);
  if (pi >= 0) parkedCars.splice(pi, 1);
  const ti = traffic.cars.indexOf(car);
  if (ti >= 0) traffic.cars.splice(ti, 1);
  car.kind = 'player';
  player.enterCar(car);
  commitCrime(55, car.pos);
  hud.toast('VEHICLE STOLEN');
  sound.pickup();
}

function exitCar() {
  const car = player.exitCar();
  if (!car) return;
  car.speed = 0;
  if (isOnRoad(car.pos.x, car.pos.z)) {
    car.kind = 'traffic';
    traffic.adopt(car);
    traffic.cars.push(car);
  } else {
    car.kind = 'parked';
    parkedCars.push(car);
  }
  collideCircle(city.colliders, player.pos, 0.55);
}

// ---------- Game over / restart ----------
const overScreen = document.getElementById('screen-over');
const startScreen = document.getElementById('screen-start');
const pauseScreen = document.getElementById('screen-pause');

function gameOver(kind) {
  if (state !== 'playing') return;
  state = 'over';
  sound.stopAll();
  sound.busted();
  document.getElementById('over-title').textContent = kind === 'busted' ? 'BUSTED' : 'WRECKED';
  document.getElementById('over-detail').textContent = kind === 'busted'
    ? 'Azura PD finally boxed Marlo in. The Crew will hear about this.'
    : 'The run ended in a twisted heap on the asphalt.';
  if (cash > (best.cash || 0)) { best.cash = cash; saveBest(); }
  document.getElementById('over-stats').textContent =
    `Cash earned: $${cash} · Best: $${best.cash || 0} · Time: ${Math.round(runTime)}s`;
  overScreen.classList.remove('hidden');
  hud.hide();
}

function resetWorld() {
  police.reset();
  traffic.reset();
  peds.reset();
  spawnParked();
  player.reset();
  missions.reset();
  for (const t of tracers) scene.remove(t.line);
  tracers = [];
  cash = 0;
  runTime = 0;
  crimeCooldown = 0;
  shotCooldown = 0;
  camYaw = player.angle;
  prevFocus = { x: player.pos.x, z: player.pos.z };
  focusVel = { x: 0, z: 0 };
  input.reset();
  sound.stopAll();
}

function startGame() {
  sound.ensure();
  resetWorld();
  state = 'playing';
  startScreen.classList.add('hidden');
  overScreen.classList.add('hidden');
  pauseScreen.classList.add('hidden');
  hud.show();
  hud.toast('JOB 1 — reach the gold beacon');
}

document.getElementById('btn-start').addEventListener('click', startGame);

// ---------- Per-frame update ----------
function update(dt) {
  runTime += dt;
  crimeCooldown = Math.max(0, crimeCooldown - dt);
  shotCooldown = Math.max(0, shotCooldown - dt);
  const focus = focusPos();
  focusVel = { x: (focus.x - prevFocus.x) / Math.max(dt, 0.001), z: (focus.z - prevFocus.z) / Math.max(dt, 0.001) };
  prevFocus = { x: focus.x, z: focus.z };

  updateAim();

  // --- Player ---
  if (player.driving) {
    const car = player.car;
    // With forward = (sin a, cos a), a positive steer raises the angle,
    // which swings the nose left — so A (left) maps to +1, D to -1.
    const driveInput = {
      throttle: (input.down('w', 'arrowup') ? 1 : 0) + (input.down('s', 'arrowdown') ? -1 : 0),
      steer: (input.down('a', 'arrowleft') ? 1 : 0) + (input.down('d', 'arrowright') ? -1 : 0),
    };
    driveCar(car, driveInput, dt);
    player.updateVisual();
    if (input.justPressed('e')) exitCar();
    sound.engine(true, Math.abs(car.speed) / 30);
  } else {
    sound.engine(false);
    const walkSpeed = player.moveOnFoot(dt, input, camYaw);
    // Aim with the mouse once it has moved; until then face the walk direction
    // (also what the automated demo relies on).
    if (input.mouseSeen) player.facePoint(aimPoint);
    else if (walkSpeed > 0 && player.moveAngle !== undefined) player.angle = player.moveAngle;
    player.updateVisual();
    collideCircle(city.colliders, player.pos, 0.55);
    const near = nearestStealable();
    hud.prompt(near ? 'Press E to steal the car' : '');
    if (near && input.justPressed('e')) enterCar(near);
    if (input.clicked && shotCooldown <= 0) {
      firePistol();
      shotCooldown = 0.24;
    }
  }
  if (player.driving) hud.prompt(Math.abs(player.car.speed) < 1.5 ? 'Press E to exit' : '');

  // --- World systems ---
  traffic.update(dt, focus, allCars());
  peds.update(dt, {});
  const timer = missions.update(dt, facade);
  const nearestCop = police.update(dt,
    { x: focus.x, z: focus.z, vx: focusVel.x, vz: focusVel.z },
    player.driving ? Math.abs(player.car.speed) : Math.hypot(focusVel.x, focusVel.z),
    { onBusted: () => gameOver('busted') });

  // --- Collisions ---
  const cars = allCars();
  for (const car of cars) {
    const wasSpeed = Math.abs(car.speed);
    if (collideCircle(city.colliders, car.pos, 1.7)) {
      if (wasSpeed > 9) {
        car.health -= (wasSpeed - 8) * 2.2;
        if (car === player.car) { player.health -= (wasSpeed - 8) * 1.1; sound.crash(); }
        car.speed = -car.speed * 0.28;
      } else if (wasSpeed > 0.5) {
        car.speed *= 0.3;
      }
    }
    if (car.health <= 0 && !car.dead) {
      car.dead = true;
      car.speed = 0;
      car.mesh.traverse((o) => { if (o.material && o.material.color) o.material = o.material.clone(); });
      if (car === player.car) { player.health = 0; }
    }
  }
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const impact = carCarCollide(cars[i], cars[j]);
      if (impact > 5.5) {
        const involvesPlayer = cars[i] === player.car || cars[j] === player.car;
        const involvesCop = cars[i].kind === 'police' || cars[j].kind === 'police';
        if (involvesPlayer) {
          player.health -= impact * 0.55;
          sound.crash();
          if (crimeCooldown <= 0) { commitCrime(involvesCop ? 45 : 26, focus); crimeCooldown = 0.9; }
        }
        cars[i].health -= impact * 0.8;
        cars[j].health -= impact * 0.8;
      }
    }
  }
  // Cars vs pedestrians, and cruisers vs the player on foot.
  for (const car of cars) {
    if (Math.abs(car.speed) < 2.5) continue;
    for (const ped of peds.peds) {
      if (ped.dead) continue;
      const d = Math.hypot(ped.pos.x - car.pos.x, ped.pos.z - car.pos.z);
      if (d < 2.3) {
        if (peds.hurt(ped)) {
          if (car === player.car) commitCrime(130, car.pos);
          car.speed *= 0.82;
        }
      }
    }
    if (!player.driving && car.kind === 'police') {
      const d = Math.hypot(player.pos.x - car.pos.x, player.pos.z - car.pos.z);
      if (d < 2.5 && Math.abs(car.speed) > 4) {
        player.health -= 16;
        sound.crash();
        car.speed *= 0.4;
      }
    }
  }

  // Tracers fade.
  for (let i = tracers.length - 1; i >= 0; i--) {
    tracers[i].ttl -= dt;
    if (tracers[i].ttl <= 0) { scene.remove(tracers[i].line); tracers.splice(i, 1); }
  }

  // Health / game over by damage.
  if (player.health <= 0) {
    player.health = 0;
    gameOver('wasted');
  }

  // --- Camera ---
  const target = player.driving ? player.car : null;
  const back = target ? 11.5 : 9.5;
  const height = target ? 5.4 : 5.0;
  const facing = target ? target.angle : player.angle;
  camYaw += (((facing - camYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 4);
  const cx = focus.x - Math.sin(camYaw) * back;
  const cz = focus.z - Math.cos(camYaw) * back;
  camera.position.x += (cx - camera.position.x) * Math.min(1, dt * 7);
  camera.position.z += (cz - camera.position.z) * Math.min(1, dt * 7);
  camera.position.y += (height - camera.position.y) * Math.min(1, dt * 7);
  camera.lookAt(focus.x, 1.6, focus.z);

  // Siren loudness follows the nearest cruiser.
  sound.siren(police.stars > 0, nearestCop === Infinity ? 0 : clamp(1 - nearestCop / 90, 0, 1), dt);

  // --- HUD ---
  hud.update({
    health: player.health,
    cash,
    stars: police.stars,
    objective: missions.currentObjective(),
    timer,
    driving: player.driving,
    speed: player.driving ? player.car.speed : 0,
    bustRatio: police.bustMeter / 2.1,
  });
  hud.drawMinimap({
    playerPos: focus,
    playerAngle: player.driving ? player.car.angle : player.angle,
    traffic: traffic.cars,
    police: police.cruisers,
    target: missions.target,
  });

  if (input.justPressed('m')) { sound.muted = !sound.muted; if (sound.muted) sound.stopAll(); }
}

// ---------- Main loop ----------
// Frame delta from performance.now() directly: it behaves the same on every
// three.js version (the vendored Timer class needs an explicit update() call
// before getDelta() advances, which silently froze the game at dt = 0).
let lastNow = performance.now();
let menuAngle = 0;

function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = Math.min((now - lastNow) / 1000, 0.05);
  lastNow = now;
  if (state === 'playing') {
    if (input.justPressed('p') || input.justPressed('escape')) {
      state = 'paused';
      pauseScreen.classList.remove('hidden');
      sound.stopAll();
    } else {
      update(dt);
    }
  } else if (state === 'paused') {
    if (input.justPressed('p') || input.justPressed('escape')) {
      state = 'playing';
      pauseScreen.classList.add('hidden');
    }
  } else if (state === 'over') {
    if (input.justPressed('r')) {
      overScreen.classList.add('hidden');
      resetWorld();
      state = 'playing';
      hud.show();
      hud.toast('JOB 1 — reach the gold beacon');
    }
  } else if (state === 'menu') {
    menuAngle += dt * 0.05;
    camera.position.set(Math.sin(menuAngle) * 120, 55, Math.cos(menuAngle) * 120);
    camera.lookAt(0, 0, 0);
    traffic.update(dt, { x: 0, z: 0 }, allCars());
    peds.update(dt, {});
  }
  if (SHOT) setupShotTick(dt);
  input.endFrame();
  renderer.render(scene, camera);
}

// ---------- Demo + screenshot hooks (used by automated tests) ----------
let demoT = 0, demoPhase = 0;
function key(k, down) {
  window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { key: k }));
}
function demoTick(dt) {
  demoT += dt;
  const beacon = missions.target;
  if (demoPhase === 0) { // walk toward the beacon, firing a few shots
    player.facePoint(beacon);
    camYaw = player.angle;
    if (demoT > 0.3) { key('w', true); key('shift', true); }
    if (demoT > 1.6 && demoT < 1.75) canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
    if (demoT > 3.2) { key('w', false); key('shift', false); demoPhase = 1; demoT = 0; }
  } else if (demoPhase === 1) { // walk to the nearest parked car and steal it
    let car = null, bestD = Infinity;
    for (const c of parkedCars) {
      const d = Math.hypot(c.pos.x - player.pos.x, c.pos.z - player.pos.z);
      if (d < bestD) { bestD = d; car = c; }
    }
    if (car) {
      player.facePoint(car.pos);
      camYaw = player.angle;
      if (bestD > 3.4) { key('w', true); key('shift', true); }
      else {
        key('w', false); key('shift', false);
        key('e', true); key('e', false);
        demoPhase = 2; demoT = 0;
      }
    }
    if (demoT > 30) { window.__demoDone = true; demoPhase = 3; } // never hang the test
  } else if (demoPhase === 2) { // drive toward the beacon for a while
    if (player.driving) {
      const car = player.car;
      const want = Math.atan2(beacon.x - car.pos.x, beacon.z - car.pos.z);
      let diff = want - car.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      key('w', true);
      key('a', diff > 0.25);
      key('d', diff < -0.25);
    }
    if (demoT > 9) {
      key('w', false); key('a', false); key('d', false);
      window.__demoDone = true;
      demoPhase = 3;
    }
  }
}

let shotFrames = 0;
function setupShotTick(dt) {
  if (state === 'playing' && !SHOT_READY_DONE) {
    if (SHOT === 'drive' || SHOT === 'chase') demoDriveHold();
    shotFrames++;
    // The chase is captured early, while the cruisers are still rolling in
    // behind the player instead of after they have boxed the car in.
    const need = SHOT === 'chase' ? 22 : 45;
    if (shotFrames > need && !window.__shotReady) window.__shotReady = true;
  }
}
let SHOT_READY_DONE = false;
function demoDriveHold() {
  // Keep the shot car rolling slowly so the frame feels alive.
  if (player.driving && Math.abs(player.car.speed) < 6) {
    driveCar(player.car, { throttle: 0.5, steer: 0 }, 0.016);
  }
}

function initShot(name) {
  startGame();
  if (name === 'cover') {
    // On the beacon's own street, facing the gold pillar down the avenue.
    player.pos.set(PITCH, 0.25, -60);
    player.angle = Math.PI;
    camYaw = player.angle;
  } else if (name === 'drive') {
    const car = parkedCars[0];
    if (car) {
      car.pos.set(0, 0, -40); car.angle = 0; car.speed = 7;
      enterCar(car);
      police.heat = 0;
    }
  } else if (name === 'chase') {
    const car = parkedCars[0];
    if (car) {
      car.pos.set(0, 0, -20); car.angle = 0; car.speed = 11;
      enterCar(car);
      missions.step = 1; missions.phase = 'deliver'; missions.timer = 63;
      missions.setBeacon({ x: 2 * PITCH, z: 2 * PITCH }, 0x7dff8a);
      police.setHeatAtLeast(320);
      // Stage the pursuit: one cruiser swinging in ahead of the player, the
      // rest closing from behind — all inside the chase camera's view.
      setTimeout(() => {
        police.cruisers.forEach((c, i) => {
          if (i === 0) { c.pos.set(4.5, 0, -2); c.angle = Math.PI * 0.82; c.speed = 7; }
          else { c.pos.set(-3.5 + (i - 1) * 7, 0, -40 - i * 8); c.angle = 0; c.speed = 10; }
        });
      }, 350);
    }
  } else if (name === 'mission') {
    // A few steps short of the pickup beacon (outside its 6.5 arrival radius).
    player.pos.set(PITCH, 0.25, -2 * PITCH + 7.5);
    player.angle = Math.atan2(missions.target.x - player.pos.x, missions.target.z - player.pos.z);
    camYaw = player.angle;
    cash = 150;
  }
  SHOT_READY_DONE = false;
}

if (SHOT) initShot(SHOT);
if (DEMO) {
  startGame();
  const demoTimer = setInterval(() => { if (state === 'playing') demoTick(0.12); if (window.__demoDone) clearInterval(demoTimer); }, 120);
}

// Hooks for the automated restart test.
window.__game = {
  start: startGame,
  gameOver,
  restart() { overScreen.classList.add('hidden'); resetWorld(); state = 'playing'; hud.show(); },
  state: () => state,
  player, police, missions, camera,
  cash: () => cash,
};

frame();
