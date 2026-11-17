// cars.js — how a Port Azura car looks, and how it drives.
//
// One factory builds every car in the city from tinted boxes: a body, a
// glass cabin, four wheels, lights. Police cruisers get a light bar whose
// red and blue halves the police system flashes. The Vehicle class is the
// arcade physics all of them share — throttle and steering in, a velocity
// split into forward and lateral parts, the lateral part gripped away
// (less of it with the handbrake up, which is how you drift), and circle
// collision against the city's AABBs and the other cars.

import * as THREE from 'three';
import { collideCircle } from './city.js';
import { clamp } from './rng.js';

const glassMat = new THREE.MeshLambertMaterial({ color: 0x1d2a33 });
const tyreMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
const chromeMat = new THREE.MeshLambertMaterial({ color: 0xb9c2c9 });
const headlightMat = new THREE.MeshBasicMaterial({ color: 0xfff3c0 });
const taillightMat = new THREE.MeshBasicMaterial({ color: 0xff3b30 });

const bodyGeo = new THREE.BoxGeometry(2.0, 0.62, 4.3);
const cabinGeo = new THREE.BoxGeometry(1.78, 0.55, 2.1);
const wheelGeo = new THREE.CylinderGeometry(0.37, 0.37, 0.28, 10);
const lightBarGeo = new THREE.BoxGeometry(1.5, 0.16, 0.5);

/** Paint colours for civilian cars: sun-bleached and proud of it. */
export const CAR_COLORS = [0xff6b4a, 0xffd94a, 0x4ac8ff, 0x7fe7a0, 0xf7f3e8, 0xff8ac2, 0x9b8cff, 0x2ec4b6, 0xe0e0e0, 0x33414e];

/** Build a car's mesh. Police cars are white with a light bar. */
export function createCarMesh(color, police = false) {
  const car = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: police ? 0xf2f4f6 : color });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  car.add(body);

  const cabin = new THREE.Mesh(cabinGeo, police ? new THREE.MeshLambertMaterial({ color: 0x22282e }) : glassMat);
  cabin.position.set(0, 1.08, -0.25);
  cabin.castShadow = true;
  car.add(cabin);

  if (police) {
    // Black doors stripe and a light bar with two flashable halves.
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.3, 1.6), new THREE.MeshLambertMaterial({ color: 0x22282e }));
    stripe.position.set(0, 0.55, -0.2);
    car.add(stripe);
    const bar = new THREE.Mesh(lightBarGeo, chromeMat);
    bar.position.set(0, 1.44, -0.25);
    car.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.2, 0.44), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    red.position.set(-0.38, 1.58, -0.25);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.2, 0.44), new THREE.MeshBasicMaterial({ color: 0x2255ff }));
    blue.position.set(0.38, 1.58, -0.25);
    car.add(red, blue);
    car.userData.lightBar = { red, blue };
  }

  for (const [x, z] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const wheel = new THREE.Mesh(wheelGeo, tyreMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.37, z);
    car.add(wheel);
  }
  for (const x of [-0.62, 0.62]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.06), headlightMat);
    head.position.set(x, 0.62, 2.16);
    car.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.06), taillightMat);
    tail.position.set(x, 0.66, -2.16);
    car.add(tail);
  }
  car.userData.body = body;
  return car;
}

let smokeTexture = null;
function getSmokeTexture() {
  if (smokeTexture) return smokeTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(70,70,70,0.55)');
  grad.addColorStop(1, 'rgba(70,70,70,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  smokeTexture = new THREE.CanvasTexture(canvas);
  return smokeTexture;
}

/**
 * A car and its arcade physics. Position lives in mesh.position (y is
 * always 0); heading 0 faces +z and the forward vector is
 * (sin(heading), cos(heading)). Control is {throttle: -1..1, steer: -1..1,
 * handbrake: bool}. onCrash(strength) fires on hard impacts.
 */
export class Vehicle {
  constructor(scene, color, { police = false, maxSpeed = 34, accel = 17 } = {}) {
    this.mesh = createCarMesh(color, police);
    this.mesh.position.set(0, 0, 0);
    scene.add(this.mesh);
    this.police = police;
    this.heading = 0;
    this.vel = { x: 0, z: 0 };
    this.maxSpeed = maxSpeed;
    this.accel = accel;
    this.health = 100;
    this.radius = 2.25;
    this.onCrash = null;
    this.dead = false;
    // Damage smoke, shown when the car is beaten up.
    this.smoke = new THREE.Sprite(new THREE.SpriteMaterial({ map: getSmokeTexture(), transparent: true, opacity: 0 }));
    this.smoke.scale.set(2.4, 1.6, 1);
    this.smoke.position.set(0, 1.5, 1.4);
    this.mesh.add(this.smoke);
    this.smokePhase = Math.random() * 10;
  }

  get pos() {
    return this.mesh.position;
  }

  /** Forward speed along the nose, signed. */
  get forwardSpeed() {
    return this.vel.x * Math.sin(this.heading) + this.vel.z * Math.cos(this.heading);
  }

  /** Total speed in world units per second. */
  get speed() {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  get speedKmh() {
    return Math.round(this.speed * 3.2);
  }

  /** Place the car, at rest, facing a heading. */
  place(x, z, heading) {
    this.mesh.position.set(x, 0, z);
    this.heading = heading;
    this.vel.x = 0;
    this.vel.z = 0;
    this.syncMesh(0);
  }

  /** Advance the physics one step under a control input. */
  update(dt, control, colliders) {
    const fwdX = Math.sin(this.heading);
    const fwdZ = Math.cos(this.heading);
    let f = this.vel.x * fwdX + this.vel.z * fwdZ;

    // Engine and brakes. Damaged cars lose their top end.
    const healthScale = this.health <= 0 ? 0 : 0.45 + 0.55 * (this.health / 100);
    const topSpeed = this.maxSpeed * healthScale;
    if (control.throttle > 0) {
      f += this.accel * control.throttle * dt * (f < 0 ? 2.2 : 1); // brake hard when rolling back
      if (f > topSpeed) f = Math.max(topSpeed, f - 20 * dt);
    } else if (control.throttle < 0) {
      if (f > 0.5) f -= 26 * dt; // brakes
      else f = Math.max(f + this.accel * 0.55 * control.throttle * dt, -10); // reverse
    }
    // Rolling drag and air drag.
    f -= f * 0.35 * dt;
    if (!control.throttle) f -= Math.sign(f) * Math.min(Math.abs(f), 2.4 * dt);

    // Steering: less at speed, and it only bites while moving.
    const steerAuthority = clamp(f / 3.2, -1.5, 1.5) / (1 + Math.abs(f) * 0.028);
    this.heading += control.steer * steerAuthority * 1.55 * dt;

    // Rebuild velocity: forward part kept, lateral part gripped away.
    const nFwdX = Math.sin(this.heading);
    const nFwdZ = Math.cos(this.heading);
    const latX = this.vel.x - f * nFwdX;
    const latZ = this.vel.z - f * nFwdZ;
    const grip = control.handbrake ? 1.5 : 8.5;
    const keep = Math.exp(-grip * dt);
    this.vel.x = f * nFwdX + latX * keep;
    this.vel.z = f * nFwdZ + latZ * keep;

    const beforeX = this.pos.x;
    const beforeZ = this.pos.z;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;

    const hit = collideCircle(this.pos, this.radius, colliders);
    if (hit > 0.02) {
      // Speed lost to the push-out is the impact; hard ones cost health.
      const lost = Math.hypot(this.pos.x - beforeX - this.vel.x * dt, this.pos.z - beforeZ - this.vel.z * dt) / Math.max(dt, 1e-4);
      const impact = Math.min(lost, this.speed);
      if (impact > 5) {
        this.damage(impact * 0.9);
        if (this.onCrash) this.onCrash(Math.min(1, impact / 22));
      }
      this.vel.x *= 0.55;
      this.vel.z *= 0.55;
    }
    this.syncMesh(dt);
  }

  /** Body roll and pitch cosmetics, smoke when hurt. */
  syncMesh(dt) {
    this.mesh.rotation.y = this.heading;
    const body = this.mesh.userData.body;
    if (body) {
      const f = this.forwardSpeed;
      body.rotation.z = clamp(-(this.vel.x * Math.cos(this.heading) - this.vel.z * Math.sin(this.heading)) * 0.006, -0.05, 0.05);
      body.rotation.x = clamp(f * 0.0012, -0.03, 0.03);
    }
    if (this.smoke) {
      const hurt = this.health < 40;
      this.smoke.material.opacity = hurt ? 0.35 + 0.2 * Math.sin(performance.now() / 90 + this.smokePhase) : 0;
    }
    if (dt) this.mesh.position.y = 0;
  }

  damage(amount) {
    this.health = Math.max(0, this.health - amount);
    if (this.health <= 0) this.dead = true;
  }

  /** Flash a cruiser's light bar (the police system calls this). */
  flashLights(t) {
    const bar = this.mesh.userData.lightBar;
    if (!bar) return;
    const phase = Math.floor(t * 2.4) % 2 === 0;
    bar.red.visible = phase;
    bar.blue.visible = !phase;
  }

  dispose(scene) {
    scene.remove(this.mesh);
  }
}

/**
 * Circle-versus-circle between every pair of cars: push them apart and
 * trade a little velocity. Returns the pairs that hit hard, as
 * [a, b, closingSpeed], so the game can score rams and play the crash.
 */
export function resolveCarCollisions(vehicles) {
  const hits = [];
  for (let i = 0; i < vehicles.length; i++) {
    for (let j = i + 1; j < vehicles.length; j++) {
      const a = vehicles[i];
      const b = vehicles[j];
      const dx = b.pos.x - a.pos.x;
      const dz = b.pos.z - a.pos.z;
      const min = a.radius + b.radius - 0.4;
      const d2 = dx * dx + dz * dz;
      if (d2 > min * min || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const nz = dz / d;
      // A parked car does not budge; the moving one takes the whole push.
      const wa = a.parked ? 0 : 1;
      const wb = b.parked ? 0 : 1;
      if (wa + wb === 0) continue;
      const push = min - d;
      a.pos.x -= nx * push * (wa / (wa + wb));
      a.pos.z -= nz * push * (wa / (wa + wb));
      b.pos.x += nx * push * (wb / (wa + wb));
      b.pos.z += nz * push * (wb / (wa + wb));
      const rel = (b.vel.x - a.vel.x) * nx + (b.vel.z - a.vel.z) * nz;
      if (rel < 0) {
        const impulse = -rel * 0.62;
        a.vel.x -= nx * impulse * wa;
        a.vel.z -= nz * impulse * wa;
        b.vel.x += nx * impulse * wb;
        b.vel.z += nz * impulse * wb;
        if (-rel > 6) {
          a.damage(-rel * 0.55);
          b.damage(-rel * 0.55);
          hits.push([a, b, -rel]);
        }
      }
    }
  }
  return hits;
}
