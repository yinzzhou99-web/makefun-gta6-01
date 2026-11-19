// Azura PD: the wanted system and the cruisers that enforce it.
// Heat is a 0..500 meter; every full 100 is one star. Heat decays while no
// cruiser can see the player, faster inside the mission hideout. Cruisers
// spawn on roads near the player, chase, ram, and build a "bust meter" when
// they pin the player at low speed — fill it and the run is over.

import { ROAD_LINES } from './city.js';
import { makeCar, driveCar } from './cars.js';
import { clamp, makeRng } from './rng.js';

export class Police {
  constructor(scene) {
    this.scene = scene;
    this.rng = makeRng(99);
    this.heat = 0;
    this.cruisers = [];
    this.bustMeter = 0;
    this.decayBoost = 1; // missions raise this inside the hideout
    this.timeSinceCrime = 99;
  }

  get stars() {
    return this.heat <= 0 ? 0 : Math.min(5, Math.ceil(this.heat / 100));
  }

  addHeat(points) {
    this.heat = clamp(this.heat + points, 0, 500);
    if (points > 0) this.timeSinceCrime = 0;
  }

  setHeatAtLeast(points) {
    if (this.heat < points) this.heat = points;
    this.timeSinceCrime = 0;
  }

  spawnPos(focus) {
    const rng = this.rng;
    for (let tries = 0; tries < 12; tries++) {
      const vertical = rng.chance(0.5);
      const line = rng.pick(ROAD_LINES);
      const along = clamp((vertical ? focus.z : focus.x) + rng.range(-95, 95), -196, 196);
      const x = vertical ? line : along;
      const z = vertical ? along : line;
      const d = Math.hypot(x - focus.x, z - focus.z);
      if (d > 55 && d < 120) return { x, z };
    }
    return { x: clamp(focus.x + 80, -196, 196), z: clamp(focus.z, -196, 196) };
  }

  // hooks: { onBusted(), onRam(impact) }
  update(dt, focus, focusSpeed, hooks) {
    this.timeSinceCrime += dt;
    const stars = this.stars;

    // Decay: only while no cruiser is close enough to see the player.
    const nearest = this.nearestDist(focus);
    if (stars > 0 && nearest > 46 && this.timeSinceCrime > 2.5) {
      this.heat = Math.max(0, this.heat - 7.5 * this.decayBoost * dt);
    }

    // Spawn / despawn to match the star count.
    while (this.cruisers.length < stars) {
      const p = this.spawnPos(focus);
      const car = makeCar(this.scene, 0xffffff, p.x, p.z, 0, 'police');
      car.ai = { stuck: 0 };
      this.cruisers.push(car);
    }
    while (this.cruisers.length > stars) {
      const car = this.cruisers.pop();
      this.scene.remove(car.mesh);
    }

    // Chase.
    let pinning = false;
    for (const car of this.cruisers) {
      const dx = focus.x - car.pos.x, dz = focus.z - car.pos.z;
      const dist = Math.hypot(dx, dz);
      // Aim a little ahead of a moving target.
      const lead = clamp(dist / 22, 0, 1.1);
      const tx = focus.x + (focus.vx || 0) * lead;
      const tz = focus.z + (focus.vz || 0) * lead;
      const targetAngle = Math.atan2(tx - car.pos.x, tz - car.pos.z);
      let diff = targetAngle - car.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const steer = clamp(diff * 2.1, -1, 1);
      let throttle = 1;
      if (Math.abs(diff) > 2.4) throttle = -0.6; // badly turned around: reverse out
      driveCar(car, { throttle, steer }, dt);
      // Cruisers get a small top-end boost so a chase can actually close.
      if (dist > 26 && car.speed > 4) {
        car.pos.x += Math.sin(car.angle) * 5.5 * dt;
        car.pos.z += Math.cos(car.angle) * 5.5 * dt;
      }
      if (dist < 7.5 && focusSpeed < 3.2) pinning = true;
      // Unstick: if barely moving while throttling, shuffle the steering.
      if (Math.abs(car.speed) < 0.6 && throttle > 0) {
        car.ai.stuck += dt;
        if (car.ai.stuck > 1.1) { car.speed = -4; car.ai.stuck = 0; }
      } else car.ai.stuck = 0;
    }

    // Bust meter.
    if (pinning && stars > 0) {
      this.bustMeter += dt;
      if (this.bustMeter >= 2.1) {
        this.bustMeter = 0;
        hooks.onBusted();
      }
    } else {
      this.bustMeter = Math.max(0, this.bustMeter - dt * 1.6);
    }
    return nearest;
  }

  nearestDist(focus) {
    let best = Infinity;
    for (const car of this.cruisers) {
      const d = Math.hypot(car.pos.x - focus.x, car.pos.z - focus.z);
      if (d < best) best = d;
    }
    return best;
  }

  reset() {
    for (const car of this.cruisers) this.scene.remove(car.mesh);
    this.cruisers = [];
    this.heat = 0;
    this.bustMeter = 0;
    this.decayBoost = 1;
    this.timeSinceCrime = 99;
  }
}
