// Traffic AI: civilian cars that cruise the road grid on right-hand lanes,
// slow for the car ahead, and sometimes turn at intersections. Cars that
// drift too far from the player are recycled to roads nearer the action.

import { ROAD_LINES } from './city.js';
import { makeCar, driveCar, CAR_COLORS } from './cars.js';
import { clamp, makeRng } from './rng.js';

const LANE = 3.4;
const CRUISE = 11.5;

export class Traffic {
  constructor(scene, count = 13) {
    this.scene = scene;
    this.rng = makeRng(777);
    this.cars = [];
    for (let i = 0; i < count; i++) this.cars.push(this.spawn(null, true));
  }

  spawn(nearPos, anywhere = false) {
    const rng = this.rng;
    const axis = rng.chance(0.5) ? 'x' : 'z';
    const dir = rng.chance(0.5) ? 1 : -1;
    const line = rng.pick(ROAD_LINES);
    let along = rng.range(-190, 190);
    if (!anywhere && nearPos) {
      // Respawn ahead of the player, out of immediate sight.
      along = rng.range(90, 170) * (rng.chance(0.5) ? 1 : -1);
      along += axis === 'x' ? nearPos.x : nearPos.z;
      along = clamp(along, -195, 195);
    }
    let x, z;
    if (axis === 'z') { x = line - dir * LANE; z = along; }
    else { z = line + dir * LANE; x = along; }
    const car = makeCar(this.scene, rng.pick(CAR_COLORS), x, z, this.heading(axis, dir), 'traffic');
    car.ai = { axis, dir, line, turnCool: this.rng.range(1, 4), cruise: CRUISE * this.rng.range(0.8, 1.15) };
    return car;
  }

  heading(axis, dir) {
    if (axis === 'z') return dir > 0 ? 0 : Math.PI;
    return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  }

  update(dt, focusPos, allCars) {
    for (const car of this.cars) {
      if (car.dead) continue;
      const ai = car.ai;
      // Waypoint: a point ahead on the current lane.
      let wx, wz;
      if (ai.axis === 'z') { wx = ai.line - ai.dir * LANE; wz = car.pos.z + ai.dir * 22; }
      else { wz = ai.line + ai.dir * LANE; wx = car.pos.x + ai.dir * 22; }
      const targetAngle = Math.atan2(wx - car.pos.x, wz - car.pos.z);
      let diff = targetAngle - car.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const steer = clamp(diff * 1.8, -1, 1);

      // Slow down when something is close ahead.
      let throttle = car.speed < ai.cruise ? 0.75 : 0;
      for (const other of allCars) {
        if (other === car || other.dead) continue;
        const dx = other.pos.x - car.pos.x, dz = other.pos.z - car.pos.z;
        const ahead = dx * Math.sin(car.angle) + dz * Math.cos(car.angle);
        const side = Math.abs(dx * Math.cos(car.angle) - dz * Math.sin(car.angle));
        if (ahead > 0 && ahead < 10 && side < 2.4) { throttle = car.speed > 3 ? -0.7 : 0; break; }
      }

      driveCar(car, { throttle, steer }, dt);

      // Turning at intersections.
      ai.turnCool -= dt;
      const crossCoord = ai.axis === 'z' ? car.pos.z : car.pos.x;
      const nearLine = ROAD_LINES.find((l) => Math.abs(crossCoord - l) < 2.2);
      if (nearLine !== undefined && ai.turnCool <= 0 && this.rng.chance(0.45)) {
        ai.axis = ai.axis === 'z' ? 'x' : 'z';
        ai.dir = this.rng.chance(0.5) ? 1 : -1;
        ai.line = nearLine;
        ai.turnCool = 4;
      }
      // Fell off the world edge: loop back.
      if (Math.abs(car.pos.x) > 205 || Math.abs(car.pos.z) > 205) {
        ai.dir *= -1;
      }
      // Recycle far-away cars toward the player.
      const d = Math.hypot(car.pos.x - focusPos.x, car.pos.z - focusPos.z);
      if (d > 250) {
        const fresh = this.spawn(focusPos);
        this.scene.remove(car.mesh);
        car.mesh = fresh.mesh;
        car.pos.copy(fresh.pos);
        car.angle = fresh.angle; car.speed = 0; car.ai = fresh.ai;
        car.mesh.rotation.y = car.angle;
      }
    }
  }

  // Re-acquire a lane for a car the player just stepped out of on a road:
  // snap it to the nearest road line and send it on its way.
  adopt(car) {
    let line = ROAD_LINES[0], best = Infinity, vertical = true;
    for (const l of ROAD_LINES) {
      const dv = Math.abs(car.pos.x - l);
      if (dv < best) { best = dv; line = l; vertical = true; }
      const dh = Math.abs(car.pos.z - l);
      if (dh < best) { best = dh; line = l; vertical = false; }
    }
    const axis = vertical ? 'z' : 'x';
    const fx = Math.sin(car.angle), fz = Math.cos(car.angle);
    const dir = axis === 'z' ? (fz >= 0 ? 1 : -1) : (fx >= 0 ? 1 : -1);
    car.ai = { axis, dir, line, turnCool: 2.5, cruise: CRUISE };
    return car;
  }

  reset() {
    for (const car of this.cars) this.scene.remove(car.mesh);
    this.cars = [];
    const count = 13;
    for (let i = 0; i < count; i++) this.cars.push(this.spawn(null, true));
  }

  dispose() {
    for (const car of this.cars) this.scene.remove(car.mesh);
    this.cars = [];
  }
}
