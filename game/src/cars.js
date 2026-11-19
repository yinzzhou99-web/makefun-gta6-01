// Cars: mesh factory plus the shared arcade driving model used by the
// player, traffic and police alike, so every vehicle on the road feels the
// same and collides the same way.

import * as THREE from 'three';
import { clamp } from './rng.js';

export const CAR_COLORS = [0xd64545, 0x457ad6, 0xf2b134, 0x62c370, 0xe8e8ec, 0x8e6cc8, 0xff7f50, 0x39c2c9, 0x36454f];

const bodyGeo = new THREE.BoxGeometry(2.0, 0.62, 4.3);
const cabinGeo = new THREE.BoxGeometry(1.7, 0.55, 2.1);
const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10);
wheelGeo.rotateZ(Math.PI / 2);
const lightGeo = new THREE.BoxGeometry(1.5, 0.22, 0.3);

const wheelMat = new THREE.MeshLambertMaterial({ color: 0x17181c });
const glassMat = new THREE.MeshLambertMaterial({ color: 0x22384a });

export function makeCarMesh(color, police = false) {
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: police ? 0xf4f6f8 : color });
  const body = new THREE.Mesh(bodyGeo, paint);
  body.position.y = 0.62;
  g.add(body);
  const cabin = new THREE.Mesh(cabinGeo, police ? paint : glassMat);
  cabin.position.set(0, 1.18, -0.25);
  g.add(cabin);
  if (police) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.3, 4.34), new THREE.MeshLambertMaterial({ color: 0x2244aa }));
    stripe.position.y = 0.55;
    g.add(stripe);
    const bar = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ color: 0xff3344 }));
    bar.position.set(0, 1.58, -0.25);
    bar.name = 'lightbar';
    g.add(bar);
  }
  const wheels = [];
  for (const [x, z] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(x, 0.42, z);
    g.add(w);
    wheels.push(w);
  }
  g.userData.wheels = wheels;
  return g;
}

let nextCarId = 1;

export function makeCar(scene, color, x, z, angle, kind) {
  const police = kind === 'police';
  const mesh = makeCarMesh(color, police);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = angle;
  scene.add(mesh);
  return {
    id: nextCarId++,
    kind,
    mesh,
    angle,
    speed: 0,
    health: 100,
    radius: 2.3,
    steerVis: 0,
    dead: false,
    get pos() { return mesh.position; },
  };
}

const ACCEL = 15;
const BRAKE = 26;
const MAX_FWD = 30;
const MAX_REV = -9;

// Advance one car. input: { throttle: -1..1, steer: -1..1 }.
// Returns the distance travelled this step (for wheel spin / engine pitch).
export function driveCar(car, input, dt) {
  const t = clamp(input.throttle, -1, 1);
  if (t > 0) car.speed += ACCEL * t * dt * (1 - Math.max(0, car.speed) / (MAX_FWD * 1.6));
  else if (t < 0) {
    if (car.speed > 0.5) car.speed -= BRAKE * -t * dt;
    else car.speed += 9 * t * dt;
  } else {
    car.speed -= car.speed * 0.7 * dt; // engine drag
    if (Math.abs(car.speed) < 0.04) car.speed = 0;
  }
  car.speed = clamp(car.speed, MAX_REV, MAX_FWD);
  // Rolling resistance.
  car.speed -= car.speed * 0.25 * dt;

  const steer = clamp(input.steer, -1, 1);
  car.steerVis = steer;
  if (Math.abs(car.speed) > 0.05) {
    const turn = steer * 1.55 * dt * Math.sign(car.speed) * Math.min(1, Math.abs(car.speed) / 7);
    car.angle += turn;
  }
  const dx = Math.sin(car.angle) * car.speed * dt;
  const dz = Math.cos(car.angle) * car.speed * dt;
  car.pos.x += dx;
  car.pos.z += dz;
  car.mesh.rotation.y = car.angle;

  const spin = (car.speed * dt) / 0.42;
  for (const w of car.mesh.userData.wheels) w.rotation.x += spin;
  const bar = car.mesh.getObjectByName('lightbar');
  if (bar) bar.material.color.setHex(Math.floor(performance.now() / 220) % 2 ? 0xff3344 : 0x3388ff);
  return Math.abs(car.speed * dt);
}

// Circle collision between two cars: push apart, bleed speed, report impact.
export function carCarCollide(a, b) {
  const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
  const d = Math.hypot(dx, dz);
  const min = a.radius + b.radius - 0.7;
  if (d === 0 || d >= min) return 0;
  const push = (min - d) / 2;
  const nx = dx / d, nz = dz / d;
  a.pos.x -= nx * push; a.pos.z -= nz * push;
  b.pos.x += nx * push; b.pos.z += nz * push;
  const impact = Math.abs(a.speed - b.speed);
  a.speed *= 0.55; b.speed *= 0.55;
  return impact;
}
