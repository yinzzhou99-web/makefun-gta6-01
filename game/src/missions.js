// missions.js — the courier work that pays Rook's debt.
//
// The Marlin Crew does not care how the packages move, only that they
// move: a gold beacon marks a pickup, a green one the drop, and a
// countdown prices the run by distance. Chain deliveries back to back and
// the bonus grows; let the clock die and the chain resets. Between jobs,
// loose cash pickups glint on the sidewalks — twenty-five dollars a time,
// no questions asked, which is very Port Azura.

import * as THREE from 'three';
import { intersectionNear, randomStreetPoint } from './city.js';
import { rand, rng } from './rng.js';

const PICKUP_COLOR = 0xffd94a;
const DROP_COLOR = 0x3aff7a;

function makeBeacon(color) {
  const group = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(2.3, 2.3, 30, 20, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.26, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 15;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.3, 0.14, 8, 32),
    new THREE.MeshBasicMaterial({ color }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.25;
  group.add(beam, ring);
  group.userData = { beam, ring };
  return group;
}

function makeCashMesh() {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.5, 0.06),
    new THREE.MeshBasicMaterial({ color: 0x51ff7a }),
  );
  return mesh;
}

export class MissionSystem {
  constructor(scene) {
    this.scene = scene;
    this.state = 'offer'; // offer -> deliver -> offer ...
    this.chain = 0;
    this.timeLeft = 0;
    this.timeTotal = 0;
    this.reward = 0;
    this.pickup = randomStreetPoint();
    this.drop = null;
    this.beacon = makeBeacon(PICKUP_COLOR);
    this.beacon.position.set(this.pickup.x, 0, this.pickup.z);
    scene.add(this.beacon);
    // Loose cash scattered on the streets.
    this.cashPickups = [];
    for (let i = 0; i < 12; i++) {
      const p = randomStreetPoint();
      const mesh = makeCashMesh();
      mesh.position.set(p.x + rand(-4, 4), 1, p.z + rand(-4, 4));
      scene.add(mesh);
      this.cashPickups.push({ mesh, x: mesh.position.x, z: mesh.position.z });
    }
    this.time = 0;
    // Set by main.js: onPickup(), onDeliver(reward), onFail().
    this.onPickup = null;
    this.onDeliver = null;
    this.onFail = null;
  }

  /** The beacon's current target and what the HUD should say. */
  target() {
    return this.state === 'offer' ? this.pickup : this.drop;
  }

  /** Start the delivery leg from the pickup point to a fresh drop. */
  beginDelivery() {
    let drop = null;
    for (let tries = 0; tries < 10; tries++) {
      const cand = intersectionNear(this.pickup.x, this.pickup.z, 150, 330);
      const d = Math.hypot(cand.x - this.pickup.x, cand.z - this.pickup.z);
      if (d > 130) {
        drop = cand;
        break;
      }
      drop = cand;
    }
    this.drop = drop;
    const dist = Math.hypot(drop.x - this.pickup.x, drop.z - this.pickup.z);
    this.timeTotal = this.timeLeft = Math.min(95, Math.max(30, dist / 8.5 + 18));
    this.reward = Math.round(50 + dist * 0.55);
    this.state = 'deliver';
    this.beacon.userData.beam.material.color.setHex(DROP_COLOR);
    this.beacon.userData.ring.material.color.setHex(DROP_COLOR);
    this.beacon.position.set(drop.x, 0, drop.z);
  }

  /** Back to offering a pickup, near where the last run ended. */
  nextOffer(near) {
    this.state = 'offer';
    this.pickup = intersectionNear(near.x, near.z, 40, 190);
    this.beacon.userData.beam.material.color.setHex(PICKUP_COLOR);
    this.beacon.userData.ring.material.color.setHex(PICKUP_COLOR);
    this.beacon.position.set(this.pickup.x, 0, this.pickup.z);
  }

  /**
   * Advance missions and pickups. playerPos is wherever Rook is (on foot
   * or in a car). Returns the number of cash pickups collected this frame.
   */
  update(dt, playerPos) {
    this.time += dt;
    const u = this.beacon.userData;
    u.beam.material.opacity = 0.2 + 0.1 * Math.sin(this.time * 3);
    u.ring.scale.setScalar(1 + 0.08 * Math.sin(this.time * 3));

    const t = this.target();
    if (t && Math.hypot(playerPos.x - t.x, playerPos.z - t.z) < 3.4) {
      if (this.state === 'offer') {
        this.beginDelivery();
        if (this.onPickup) this.onPickup();
      } else {
        const reward = this.reward + Math.round(this.timeLeft * 2) + this.chain * 15;
        this.chain += 1;
        this.nextOffer(playerPos);
        if (this.onDeliver) this.onDeliver(reward);
      }
    }
    if (this.state === 'deliver') {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.chain = 0;
        this.nextOffer(playerPos);
        if (this.onFail) this.onFail();
      }
    }

    let collected = 0;
    for (const c of this.cashPickups) {
      c.mesh.rotation.y += dt * 2.4;
      c.mesh.position.y = 1 + Math.sin(this.time * 2.4 + c.x) * 0.18;
      if (Math.hypot(playerPos.x - c.x, playerPos.z - c.z) < 2.6) {
        collected += 1;
        const p = randomStreetPoint();
        c.x = p.x + rand(-4, 4);
        c.z = p.z + rand(-4, 4);
        c.mesh.position.set(c.x, 1, c.z);
      }
    }
    return collected;
  }
}
