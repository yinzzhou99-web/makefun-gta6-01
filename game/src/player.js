// The player: Marlo Venn on foot (walk, run, aim, fire) or behind the wheel
// of whatever he has stolen. Movement is camera-relative; the camera itself
// lives in main.js. Combat is a simple hitscan pistol resolved here.

import * as THREE from 'three';
import { clamp } from './rng.js';

function makePlayerMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.38, 1.1, 8),
    new THREE.MeshLambertMaterial({ color: 0xff7847 }),
  );
  body.position.y = 0.95;
  g.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 9, 8),
    new THREE.MeshLambertMaterial({ color: 0xc98d64 }),
  );
  head.position.y = 1.78;
  g.add(head);
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.14, 0.5),
    new THREE.MeshLambertMaterial({ color: 0x22242a }),
  );
  gun.position.set(0.34, 1.25, 0.35);
  gun.name = 'gun';
  g.add(gun);
  return g;
}

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.mesh = makePlayerMesh();
    scene.add(this.mesh);
    this.pos = this.mesh.position;
    this.angle = 0;
    this.health = 100;
    this.car = null;          // car object while driving, else null
    this.fireCooldown = 0;
    this.walkPhase = 0;
    this.reset();
  }

  reset() {
    this.pos.set(10, 0.25, 26);
    this.angle = Math.PI;
    this.health = 100;
    this.car = null;
    this.fireCooldown = 0;
    this.mesh.visible = true;
    this.mesh.rotation.set(0, this.angle, 0);
  }

  get driving() { return this.car !== null; }

  enterCar(car) {
    this.car = car;
    this.mesh.visible = false;
  }

  exitCar() {
    if (!this.car) return null;
    const car = this.car;
    this.car = null;
    // Step out on the left side of the car.
    this.pos.set(
      car.pos.x + Math.cos(car.angle) * -2.2,
      0.25,
      car.pos.z - Math.sin(car.angle) * -2.2,
    );
    this.mesh.visible = true;
    return car;
  }

  // On-foot movement. camYaw: current camera heading. Returns speed.
  moveOnFoot(dt, input, camYaw) {
    let mx = 0, mz = 0;
    if (input.down('w', 'arrowup')) mz += 1;
    if (input.down('s', 'arrowdown')) mz -= 1;
    if (input.down('a', 'arrowleft')) mx -= 1;
    if (input.down('d', 'arrowright')) mx += 1;
    const running = input.down('shift');
    const speed = running ? 8.4 : 4.6;
    if (mx !== 0 || mz !== 0) {
      const len = Math.hypot(mx, mz);
      mx /= len; mz /= len;
      // Forward on the ground is (sin, cos) of the camera yaw — the same
      // convention as car facing and facePoint — and camera right is
      // (-cos, sin). W walks away from the camera, along forward.
      // Facing itself is left to the mouse aim (see facePoint).
      const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
      const wx = sin * mz - cos * mx;
      const wz = cos * mz + sin * mx;
      this.moveAngle = Math.atan2(wx, wz);
      this.pos.x += wx * speed * dt;
      this.pos.z += wz * speed * dt;
      this.walkPhase += dt * (running ? 11 : 8);
      this.mesh.position.y = 0.25 + Math.abs(Math.sin(this.walkPhase)) * 0.07;
      return speed;
    }
    this.mesh.position.y = 0.25;
    return 0;
  }

  // Aim the character (and gun) toward a world point on the ground plane.
  facePoint(p) {
    this.angle = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
  }

  updateVisual() {
    this.mesh.rotation.y = this.angle;
    if (this.driving) {
      this.pos.copy(this.car.pos);
    }
  }
}

export { clamp };
