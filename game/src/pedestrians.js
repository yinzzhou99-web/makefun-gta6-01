// pedestrians.js — the people of Port Azura.
//
// Twenty-four citizens stroll the sidewalks in holiday clothes. They walk
// corner to corner, they run when a car mounts the kerb or a crime goes
// off beside them, and they go down when a car or a fist finds them —
// dropping a little cash and, if anyone is watching, raising the heat.
// Each one is a handful of boxes with swinging legs; cheap to draw, easy
// to read at chase-camera distance.

import * as THREE from 'three';
import { STREET_COORDS, collideCircle } from './city.js';
import { angleDelta, clamp, pick, rand, rng, turnToward } from './rng.js';

const SHIRTS = [0xff5a5a, 0xffd94a, 0x4ac8ff, 0x7fe7a0, 0xff8ac2, 0xf7f3e8, 0xff9f43, 0x54a0ff];
const SKINS = [0xf2c79b, 0xc68863, 0x8d5524, 0xffdbac, 0x6b4423];
const PANTS = [0x2e4057, 0xf7f3e8, 0x596275, 0x30336b];

function createPedMesh() {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: pick(SHIRTS) });
  const skin = new THREE.MeshLambertMaterial({ color: pick(SKINS) });
  const pants = new THREE.MeshLambertMaterial({ color: pick(PANTS) });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.78, 0.18), pants);
  legL.position.set(-0.11, 0.39, 0);
  const legR = legL.clone();
  legR.position.x = 0.11;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.26), shirt);
  torso.position.y = 1.14;
  torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), skin);
  head.position.y = 1.72;
  head.castShadow = true;
  // Legs pivot at the hip: wrap each in a group at hip height.
  const hipL = new THREE.Group();
  hipL.position.set(-0.11, 0.78, 0);
  legL.position.set(0, -0.39, 0);
  hipL.add(legL);
  const hipR = new THREE.Group();
  hipR.position.set(0.11, 0.78, 0);
  legR.position.set(0, -0.39, 0);
  hipR.add(legR);
  g.add(hipL, hipR, torso, head);
  g.userData = { hipL, hipR, torso };
  return g;
}

/** A random point on a sidewalk line beside a random street. */
function sidewalkPoint() {
  const c = pick(STREET_COORDS) + (rng() < 0.5 ? -10.6 : 10.6);
  const along = rand(-208, 208);
  return rng() < 0.5 ? { x: c, z: along } : { x: along, z: c };
}

class Ped {
  constructor(scene, colliders) {
    this.mesh = createPedMesh();
    scene.add(this.mesh);
    this.colliders = colliders;
    this.pos = this.mesh.position;
    const p = sidewalkPoint();
    this.pos.set(p.x, 0, p.z);
    this.heading = rand(0, Math.PI * 2);
    this.state = 'stroll';
    this.target = sidewalkPoint();
    this.phase = rand(0, 6);
    this.timer = 0;
    this.fleeFrom = null;
  }

  /** Knocked down (by a car) or floored (by a punch). */
  knockDown() {
    if (this.state === 'down') return;
    this.state = 'down';
    this.timer = rand(4, 7);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = 0.25;
  }

  /** Start running from a point of danger. */
  flee(x, z, seconds = 3.5) {
    if (this.state === 'down') return;
    this.state = 'flee';
    this.fleeFrom = { x, z };
    this.timer = seconds;
  }

  update(dt) {
    if (this.state === 'down') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.mesh.rotation.x = 0;
        this.mesh.position.y = 0;
        this.state = 'flee';
        this.fleeFrom = { x: this.pos.x + rand(-1, 1), z: this.pos.z + rand(-1, 1) };
        this.timer = 1.6;
      }
      return;
    }
    let speed = 1.6;
    let tx;
    let tz;
    if (this.state === 'flee') {
      this.timer -= dt;
      const fx = this.fleeFrom ? this.pos.x - this.fleeFrom.x : 0;
      const fz = this.fleeFrom ? this.pos.z - this.fleeFrom.z : 0;
      const len = Math.hypot(fx, fz) || 1;
      tx = this.pos.x + (fx / len) * 14;
      tz = this.pos.z + (fz / len) * 14;
      speed = 4.6;
      if (this.timer <= 0) {
        this.state = 'stroll';
        this.target = sidewalkPoint();
      }
    } else {
      tx = this.target.x;
      tz = this.target.z;
      if (Math.hypot(tx - this.pos.x, tz - this.pos.z) < 1.6) this.target = sidewalkPoint();
    }
    const desired = Math.atan2(tx - this.pos.x, tz - this.pos.z);
    this.heading = turnToward(this.heading, desired, 3.4 * dt);
    this.pos.x += Math.sin(this.heading) * speed * dt;
    this.pos.z += Math.cos(this.heading) * speed * dt;
    collideCircle(this.pos, 0.45, this.colliders);
    // Walk cycle: legs swing, body bobs.
    this.phase += dt * speed * 3.4;
    const swing = Math.sin(this.phase) * 0.55;
    this.mesh.userData.hipL.rotation.x = swing;
    this.mesh.userData.hipR.rotation.x = -swing;
    this.mesh.userData.torso.position.y = 1.14 + Math.abs(Math.sin(this.phase)) * 0.045;
    this.mesh.rotation.y = this.heading;
  }
}

export class PedestrianSystem {
  constructor(scene, colliders) {
    this.peds = [];
    for (let i = 0; i < 24; i++) this.peds.push(new Ped(scene, colliders));
  }

  /** The nearest standing pedestrian to a point, or null. */
  nearest(x, z, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const ped of this.peds) {
      if (ped.state === 'down') continue;
      const d = Math.hypot(ped.pos.x - x, ped.pos.z - z);
      if (d < bestD) {
        bestD = d;
        best = ped;
      }
    }
    return best;
  }

  /** Everyone within radius of a crime scene sees it and runs. */
  witnessCrime(x, z, radius) {
    let saw = false;
    for (const ped of this.peds) {
      if (ped.state === 'down') continue;
      if (Math.hypot(ped.pos.x - x, ped.pos.z - z) < radius) {
        ped.flee(x, z);
        saw = true;
      }
    }
    return saw;
  }

  update(dt, playerPos, playerSpeed) {
    for (const ped of this.peds) {
      // A fast car close by is reason enough to run, crime or not.
      if (ped.state === 'stroll' && playerSpeed > 8) {
        if (Math.hypot(ped.pos.x - playerPos.x, ped.pos.z - playerPos.z) < 8) {
          ped.flee(playerPos.x, playerPos.z, 2.5);
        }
      }
      ped.update(dt);
    }
  }
}
