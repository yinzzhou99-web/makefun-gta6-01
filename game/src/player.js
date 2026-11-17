// player.js — Rook, on foot.
//
// A dockside courier in a teal shirt and a backwards cap, built from the
// same handful of boxes as the citizens but dressed to be picked out of a
// crowd. On foot he walks and sprints with camera-relative WASD, turns to
// face where he is going, and swings his legs as he moves. The driving
// half of his life lives in cars.js; main.js swaps him between the two.

import * as THREE from 'three';
import { collideCircle } from './city.js';
import { clamp, turnToward } from './rng.js';

export const WALK_SPEED = 5.4;
export const SPRINT_SPEED = 9.2;

export function createCharacterMesh() {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: 0x12b5a5 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc68863 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x27324a });
  const legGeo = new THREE.BoxGeometry(0.17, 0.78, 0.19);
  const hipL = new THREE.Group();
  hipL.position.set(-0.11, 0.78, 0);
  const legL = new THREE.Mesh(legGeo, pants);
  legL.position.y = -0.39;
  hipL.add(legL);
  const hipR = new THREE.Group();
  hipR.position.set(0.11, 0.78, 0);
  const legR = new THREE.Mesh(legGeo, pants);
  legR.position.y = -0.39;
  hipR.add(legR);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.72, 0.27), shirt);
  torso.position.y = 1.14;
  torso.castShadow = true;
  const armGeo = new THREE.BoxGeometry(0.13, 0.62, 0.15);
  const armL = new THREE.Mesh(armGeo, shirt);
  armL.position.set(-0.34, 1.16, 0);
  const armR = new THREE.Mesh(armGeo, shirt);
  armR.position.set(0.34, 1.16, 0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), skin);
  head.position.y = 1.72;
  head.castShadow = true;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.34), new THREE.MeshLambertMaterial({ color: 0xff5a5a }));
  cap.position.y = 1.9;
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.22), cap.material);
  brim.position.set(0, 1.86, -0.26); // backwards cap: brim at the back
  g.add(hipL, hipR, torso, armL, armR, head, cap, brim);
  g.userData = { hipL, hipR, armL, armR, torso };
  return g;
}

export class PlayerController {
  constructor(scene) {
    this.mesh = createCharacterMesh();
    scene.add(this.mesh);
    this.pos = this.mesh.position;
    this.pos.set(196, 0, 176); // the boardwalk, by the bay
    this.heading = Math.PI; // facing the city
    this.phase = 0;
    this.moving = 0; // smoothed speed for the walk cycle
    this.punchTimer = 0;
  }

  /**
   * Move under input. moveX/moveZ are a wish direction in world space
   * (main.js builds it from the camera and the keys); sprint scales it.
   * Returns the speed actually travelled.
   */
  update(dt, moveX, moveZ, sprint, colliders) {
    const wish = Math.hypot(moveX, moveZ);
    let speed = 0;
    if (wish > 0.01) {
      const top = sprint ? SPRINT_SPEED : WALK_SPEED;
      speed = top * Math.min(1, wish);
      const desired = Math.atan2(moveX, moveZ);
      this.heading = turnToward(this.heading, desired, 10 * dt);
      this.pos.x += (moveX / wish) * speed * dt;
      this.pos.z += (moveZ / wish) * speed * dt;
      collideCircle(this.pos, 0.5, colliders);
    }
    this.moving += (speed - this.moving) * Math.min(1, dt * 10);
    this.phase += dt * (2 + this.moving * 1.6);
    const swing = Math.sin(this.phase) * clamp(this.moving / WALK_SPEED, 0, 1.15) * 0.6;
    const u = this.mesh.userData;
    u.hipL.rotation.x = swing;
    u.hipR.rotation.x = -swing;
    // Punch animation: the right arm snaps forward while punchTimer runs.
    if (this.punchTimer > 0) {
      this.punchTimer -= dt;
      u.armR.rotation.x = -1.9 * Math.sin((this.punchTimer / 0.28) * Math.PI);
    } else {
      u.armR.rotation.x = -swing * 0.7;
    }
    u.armL.rotation.x = swing * 0.7;
    u.torso.position.y = 1.14 + Math.abs(Math.sin(this.phase)) * 0.04 * (this.moving > 0.2 ? 1 : 0);
    this.mesh.rotation.y = this.heading;
    return this.moving;
  }

  /** Start the punch animation (main.js decides whether it lands). */
  punch() {
    this.punchTimer = 0.28;
  }

  setVisible(visible) {
    this.mesh.visible = visible;
  }
}
