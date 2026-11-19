// Pedestrians: little low-poly walkers looping the sidewalks block by block.
// They flee gunfire and nearby violence, and if one is hit or shot the game
// reports it through the hooks so the wanted system can react.

import * as THREE from 'three';
import { PITCH, ROAD_HALF } from './city.js';
import { makeRng, clamp } from './rng.js';

const SKIN = [0xf2c89b, 0xc98d64, 0x8a5a3b, 0x6e4530];
const SHIRT = [0xff6b6b, 0x4ecdc4, 0xffe66d, 0x95e06c, 0xf783ac, 0x748ffc, 0xffffff];

function makePedMesh(rng) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26, 0.34, 1.05, 7),
    new THREE.MeshLambertMaterial({ color: rng.pick(SHIRT) }),
  );
  body.position.y = 0.95;
  g.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 8, 7),
    new THREE.MeshLambertMaterial({ color: rng.pick(SKIN) }),
  );
  head.position.y = 1.72;
  g.add(head);
  return g;
}

export class Pedestrians {
  constructor(scene, count = 18) {
    this.scene = scene;
    this.rng = makeRng(4242);
    this.peds = [];
    for (let i = 0; i < count; i++) this.peds.push(this.spawn());
  }

  spawn() {
    const rng = this.rng;
    // Walk the sidewalk ring of a random block.
    const bi = rng.int(-3, 2), bj = rng.int(-3, 2);
    const cx = (bi + 0.5) * PITCH, cz = (bj + 0.5) * PITCH;
    const ring = PITCH / 2 - ROAD_HALF - 2.4;
    const side = rng.int(0, 3);
    const t = rng.next();
    const mesh = makePedMesh(rng);
    this.scene.add(mesh);
    const ped = {
      mesh, cx, cz, ring, side, t,
      speed: rng.range(1.1, 1.9),
      flee: 0, fleeFrom: null,
      dead: false, deadTime: 0,
      radius: 0.55,
      get pos() { return mesh.position; },
    };
    this.place(ped);
    return ped;
  }

  place(ped) {
    const { cx, cz, ring, side, t } = ped;
    let x, z, angle;
    const a = -ring + t * ring * 2;
    if (side === 0) { x = cx + a; z = cz - ring; angle = Math.PI / 2; }
    else if (side === 1) { x = cx + ring; z = cz + a; angle = Math.PI; }
    else if (side === 2) { x = cx - a; z = cz + ring; angle = -Math.PI / 2; }
    else { x = cx - ring; z = cz - a; angle = 0; }
    ped.mesh.position.set(x, 0.25, z);
    ped.mesh.rotation.y = angle;
    ped.angle = angle;
  }

  scare(fromPos, radius = 26) {
    for (const ped of this.peds) {
      if (ped.dead) continue;
      const d = Math.hypot(ped.pos.x - fromPos.x, ped.pos.z - fromPos.z);
      if (d < radius) { ped.flee = 3; ped.fleeFrom = fromPos; }
    }
  }

  // Returns 'died' when this hit kills the pedestrian.
  hurt(ped) {
    if (ped.dead) return false;
    ped.dead = true;
    ped.deadTime = 0;
    ped.mesh.rotation.x = Math.PI / 2;
    ped.mesh.position.y = 0.3;
    return true;
  }

  update(dt, hooks) {
    for (const ped of this.peds) {
      if (ped.dead) {
        ped.deadTime += dt;
        continue;
      }
      if (ped.flee > 0 && ped.fleeFrom) {
        ped.flee -= dt;
        const away = Math.atan2(ped.pos.x - ped.fleeFrom.x, ped.pos.z - ped.fleeFrom.z);
        ped.mesh.position.x += Math.sin(away) * 4.6 * dt;
        ped.mesh.position.z += Math.cos(away) * 4.6 * dt;
        ped.mesh.position.x = clamp(ped.mesh.position.x, -200, 200);
        ped.mesh.position.z = clamp(ped.mesh.position.z, -200, 200);
        ped.mesh.rotation.y = away;
        ped.mesh.position.y = 0.25 + Math.abs(Math.sin(performance.now() / 90)) * 0.08;
        continue;
      }
      // Advance along the ring.
      const perim = ped.ring * 2;
      ped.t += (ped.speed * dt) / perim;
      if (ped.t >= 1) { ped.t = 0; ped.side = (ped.side + 1) % 4; }
      this.place(ped);
      ped.mesh.position.y = 0.25 + Math.abs(Math.sin(performance.now() / 130)) * 0.05;
    }
    // Long-dead pedestrians get replaced by fresh walkers elsewhere.
    for (let i = this.peds.length - 1; i >= 0; i--) {
      const ped = this.peds[i];
      if (ped.dead && ped.deadTime > 25) {
        this.scene.remove(ped.mesh);
        this.peds[i] = this.spawn();
      }
    }
  }

  reset() {
    for (const ped of this.peds) this.scene.remove(ped.mesh);
    this.peds = [];
    for (let i = 0; i < 18; i++) this.peds.push(this.spawn());
  }

  dispose() {
    for (const ped of this.peds) this.scene.remove(ped.mesh);
    this.peds = [];
  }
}
