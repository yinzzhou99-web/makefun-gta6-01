// The job chain Marlo works to pay the Marlin Crew, plus endless courier
// jobs in free roam. A beacon (a pillar of light) marks the current target;
// the missions object reports through the game facade: addCash, toast,
// setHeatAtLeast, setDecayBoost, playSound.

import * as THREE from 'three';
import { PITCH } from './city.js';
import { dist2d } from './rng.js';

const SPOTS = {
  pickup1: { x: PITCH, z: -2 * PITCH },
  parcel: { x: -2 * PITCH, z: PITCH },
  dropoff: { x: 2 * PITCH, z: 2 * PITCH },
  hideout: { x: -2 * PITCH, z: -3 * PITCH },
};
const JOB_SPOTS = [
  { x: 3 * PITCH, z: 0 }, { x: -3 * PITCH, z: PITCH }, { x: 0, z: 3 * PITCH },
  { x: PITCH, z: -3 * PITCH }, { x: -PITCH, z: -2 * PITCH }, { x: 2 * PITCH, z: -PITCH },
  { x: -2 * PITCH, z: 2 * PITCH }, { x: 3 * PITCH, z: 3 * PITCH },
];

export class Missions {
  constructor(scene) {
    this.scene = scene;
    // Beacon visuals: translucent pillar + ground ring.
    this.beacon = new THREE.Group();
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 2.2, 26, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd94d, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }),
    );
    pillar.position.y = 13;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.6, 3.4, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd94d, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.15;
    this.beacon.add(pillar, ring);
    this.beacon.visible = false;
    scene.add(this.beacon);
    this.reset();
  }

  reset() {
    this.step = 0;          // 0 pickup, 1 delivery, 2 lay low, 3 free-roam jobs
    this.phase = 'go';      // within delivery: 'fetch' then 'deliver'
    this.timer = -1;        // seconds left, -1 = no timer
    this.target = SPOTS.pickup1;
    this.jobIndex = 0;
    this.chainTime = 0;
    this.chainDone = false;
    this.insideHideout = false;
    this.setBeacon(this.target, 0xffd94d);
  }

  setBeacon(spot, color) {
    this.target = spot;
    this.beacon.position.set(spot.x, 0, spot.z);
    this.beacon.visible = true;
    for (const child of this.beacon.children) child.material.color.setHex(color);
  }

  currentObjective() {
    if (this.step === 0) return { title: 'JOB 1 · FIRST PICKUP', text: 'Reach the gold beacon and grab the package.' };
    if (this.step === 1 && this.phase === 'fetch') return { title: 'JOB 2 · HOT DELIVERY', text: 'Pick up the parcel across town.' };
    if (this.step === 1) return { title: 'JOB 2 · HOT DELIVERY', text: 'Deliver the parcel before the clock runs out — the heat is on!' };
    if (this.step === 2) return { title: 'JOB 3 · LAY LOW', text: this.insideHideout ? 'Stay in the hideout until your wanted level clears.' : 'Reach the hideout and shake the heat.' };
    return { title: 'COURIER JOB', text: 'Deliver to the beacon for quick cash.' };
  }

  // game: facade with playerPos, addCash, toast, setHeatAtLeast, setDecayBoost, sound(name), stars()
  update(dt, game) {
    const p = game.playerPos;
    const d = dist2d(p.x, p.z, this.target.x, this.target.z);
    if (this.step < 3 && !this.chainDone) this.chainTime += dt;

    if (this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = -1;
        if (this.step === 1 && this.phase === 'deliver') {
          game.toast('TOO SLOW — the deal went cold');
          game.sound('busted');
          this.phase = 'fetch';
          this.setBeacon(SPOTS.parcel, 0xffd94d);
        }
      }
    }

    if (this.step === 0) {
      if (d < 6.5) {
        game.addCash(150);
        game.toast('PACKAGE SECURED  +$150');
        game.sound('cash');
        this.step = 1; this.phase = 'fetch';
        this.setBeacon(SPOTS.parcel, 0xffd94d);
      }
    } else if (this.step === 1 && this.phase === 'fetch') {
      if (d < 6.5) {
        game.toast('PARCEL ON BOARD — MOVE!');
        game.sound('pickup');
        game.setHeatAtLeast(210); // two stars and change: the pickup was watched
        this.phase = 'deliver';
        this.timer = 80;
        this.setBeacon(SPOTS.dropoff, 0x7dff8a);
      }
    } else if (this.step === 1 && this.phase === 'deliver') {
      if (d < 7) {
        game.addCash(400);
        game.toast('DELIVERED  +$400');
        game.sound('cash');
        this.timer = -1;
        this.step = 2;
        this.setBeacon(SPOTS.hideout, 0x7dff8a);
      }
    } else if (this.step === 2) {
      this.insideHideout = d < 15;
      game.setDecayBoost(this.insideHideout ? 3.2 : 1);
      if (this.insideHideout && game.stars() === 0) {
        game.addCash(600);
        game.toast('DEBT PAID — PORT AZURA IS YOURS  +$600');
        game.sound('cash');
        game.setDecayBoost(1);
        this.step = 3;
        this.chainDone = true;
        this.nextJob(game);
      }
    } else if (this.step === 3) {
      if (d < 7) {
        game.addCash(120);
        game.toast('DELIVERED  +$120');
        game.sound('cash');
        this.nextJob(game);
      }
    }
    return this.timer;
  }

  nextJob(game) {
    this.jobIndex = (this.jobIndex + 1) % JOB_SPOTS.length;
    this.setBeacon(JOB_SPOTS[this.jobIndex], 0xffd94d);
  }
}
