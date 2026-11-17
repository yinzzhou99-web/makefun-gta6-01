// traffic.js — the city's civilian cars: parked metal and moving traffic.
//
// Traffic drives the street grid on the right-hand side, waypoint to
// waypoint: each car aims at a point on its lane past the next
// intersection, picks straight/left/right when it gets there, and brakes
// for anything in front of its nose. Parked cars sit at the kerb waiting
// to be stolen; they are full Vehicles with the handbrake on, so a thief
// can take one and a ram can shove one.

import * as THREE from 'three';
import { STREET_COORDS, WORLD } from './city.js';
import { CAR_COLORS, Vehicle } from './cars.js';
import { angleDelta, clamp, pick, rand, rng } from './rng.js';

const LANE = 3.4; // lane offset from a street's centre line
const CRUISE = 11.5;

/** Right-hand offset for a travel direction (dx, dz): right = dir x up. */
function laneOffset(dx, dz) {
  return { x: -dz * LANE, z: dx * LANE };
}

/** The next street coordinate strictly ahead of `at` going `dir` (+1/-1). */
function nextStreet(at, dir) {
  const sorted = [...STREET_COORDS].sort((a, b) => (a - b) * dir);
  for (const c of sorted) {
    if ((c - at) * dir > 4) return c;
  }
  return sorted[sorted.length - 1];
}

class TrafficCar {
  constructor(scene, colliders) {
    this.vehicle = new Vehicle(scene, pick(CAR_COLORS), { maxSpeed: 26, accel: 13 });
    this.colliders = colliders;
    this.dir = { x: 0, z: 1 };
    this.respawn({ x: 0, z: 0 }, true);
  }

  /** Put the car on a street some distance from the player, driving. */
  respawn(playerPos, anywhere = false) {
    for (let tries = 0; tries < 12; tries++) {
      const alongZ = rng() < 0.5;
      const street = pick(STREET_COORDS);
      const along = rand(WORLD.minX + 14, WORLD.maxX - 14);
      const x = alongZ ? street : along;
      const z = alongZ ? along : street;
      const d = Math.hypot(x - playerPos.x, z - playerPos.z);
      if (!anywhere && (d < 55 || d > 190)) continue;
      const s = rng() < 0.5 ? 1 : -1;
      this.dir = alongZ ? { x: 0, z: s } : { x: s, z: 0 };
      const off = laneOffset(this.dir.x, this.dir.z);
      this.vehicle.place(x + off.x, z + off.z, Math.atan2(this.dir.x, this.dir.z));
      this.planWaypoint();
      return;
    }
    this.vehicle.place(0, -100, 0);
    this.dir = { x: 0, z: 1 };
    this.planWaypoint();
  }

  /** Aim at a point on our lane, past the next intersection ahead. */
  planWaypoint() {
    const p = this.vehicle.pos;
    if (this.dir.z !== 0) {
      const nz = nextStreet(p.z, this.dir.z);
      this.waypoint = { x: p.x, z: nz + this.dir.z * 26 };
      this.intersection = { x: STREET_COORDS.reduce((a, c) => (Math.abs(c - p.x) < Math.abs(a - p.x) ? c : a), STREET_COORDS[0]), z: nz };
    } else {
      const nx = nextStreet(p.x, this.dir.x);
      this.waypoint = { x: nx + this.dir.x * 26, z: p.z };
      this.intersection = { x: nx, z: STREET_COORDS.reduce((a, c) => (Math.abs(c - p.z) < Math.abs(a - p.z) ? c : a), STREET_COORDS[0]) };
    }
  }

  /** At an intersection: pick a new direction (never a U-turn). */
  chooseTurn() {
    const roll = rng();
    let nd = this.dir;
    if (roll > 0.55) {
      // Turn left or right relative to travel.
      const side = roll > 0.78 ? 1 : -1;
      nd = { x: this.dir.z * side, z: this.dir.x * side };
    }
    // Keep the turn inside the city: if the new heading leaves the grid
    // from an edge street, go straight instead.
    const edge = 192;
    if ((nd.x > 0 && this.intersection.x >= edge) || (nd.x < 0 && this.intersection.x <= -edge)) nd = this.dir;
    if ((nd.z > 0 && this.intersection.z >= edge) || (nd.z < 0 && this.intersection.z <= -edge)) nd = this.dir;
    this.dir = nd;
    // Aim across the intersection onto the new lane.
    const off = laneOffset(nd.x, nd.z);
    this.waypoint = {
      x: this.intersection.x + off.x + nd.x * 26,
      z: this.intersection.z + off.z + nd.z * 26,
    };
    this.turning = true;
  }

  update(dt, obstacles) {
    const v = this.vehicle;
    const p = v.pos;
    const toI = Math.hypot(this.intersection.x - p.x, this.intersection.z - p.z);
    if (!this.turning && toI < 13) this.chooseTurn();
    if (this.turning && Math.hypot(this.waypoint.x - p.x, this.waypoint.z - p.z) < 9) {
      this.turning = false;
      this.planWaypoint();
    }

    const desired = Math.atan2(this.waypoint.x - p.x, this.waypoint.z - p.z);
    const steer = clamp(angleDelta(v.heading, desired) * 1.7, -1, 1);

    // Brake for anything ahead: other cars, the player, a body in the road.
    let throttle = 0.55;
    const fwdX = Math.sin(v.heading);
    const fwdZ = Math.cos(v.heading);
    for (const o of obstacles) {
      const dx = o.x - p.x;
      const dz = o.z - p.z;
      const ahead = dx * fwdX + dz * fwdZ;
      if (ahead < 0.5 || ahead > 11) continue;
      const side = Math.abs(dx * fwdZ - dz * fwdX);
      if (side > 2.8) continue;
      throttle = ahead < 5.5 ? -0.7 : 0.05;
      break;
    }
    if (Math.abs(angleDelta(v.heading, desired)) > 0.55 && v.speed > 6.5) throttle = Math.min(throttle, 0);
    if (v.health <= 0) throttle = -0.4; // a wreck coasts to a stop
    v.update(dt, { throttle, steer, handbrake: false }, this.colliders);
  }
}

export class TrafficSystem {
  constructor(scene, colliders) {
    this.scene = scene;
    this.colliders = colliders;
    this.cars = [];
    for (let i = 0; i < 14; i++) this.cars.push(new TrafficCar(scene, colliders));
    // Parked cars at kerbs, ready to steal.
    this.parked = [];
    for (let i = 0; i < 16; i++) {
      const car = new Vehicle(scene, pick(CAR_COLORS), { maxSpeed: 34, accel: 17 });
      car.parked = true;
      const alongZ = rng() < 0.5;
      const street = pick(STREET_COORDS);
      const along = rand(WORLD.minX + 16, 200);
      const side = rng() < 0.5 ? -6.4 : 6.4;
      if (alongZ) car.place(street + side, along, side < 0 ? Math.PI : 0);
      else car.place(along, street + side, side < 0 ? -Math.PI / 2 : Math.PI / 2);
      this.parked.push(car);
    }
  }

  /** Every civilian vehicle, moving or parked (for collisions and theft). */
  allVehicles() {
    return [...this.cars.map((c) => c.vehicle), ...this.parked];
  }

  /** Remove a car from the world entirely (it was stolen or wrecked). */
  take(vehicle) {
    const ti = this.cars.findIndex((c) => c.vehicle === vehicle);
    if (ti >= 0) {
      this.cars.splice(ti, 1);
      return;
    }
    const pi = this.parked.indexOf(vehicle);
    if (pi >= 0) this.parked.splice(pi, 1);
  }

  update(dt, playerPos, obstacles) {
    for (const car of this.cars) {
      const d = Math.hypot(car.vehicle.pos.x - playerPos.x, car.vehicle.pos.z - playerPos.z);
      if (d > 250) car.respawn(playerPos);
      car.update(dt, obstacles);
    }
  }
}
