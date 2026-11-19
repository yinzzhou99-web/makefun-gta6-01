// police.js — the Azura PD: heat, stars, and the cruisers that hunt you.
//
// Crimes feed heat (0..100); every 20 heat is a star, up to five. The PD
// keeps as many cruisers on you as you have stars. Cruisers spawn at
// intersections a few streets away and work the grid like traffic —
// turning at each intersection toward you — until they are close, when
// they switch to a direct intercept, steering for where you are about to
// be and ramming when they arrive. Stand still near one and the bust
// meter fills — 2.4 seconds of it and you are BUSTED. Heat cools only
// while nobody in uniform can see you, and when it reaches zero the hunt
// is called off.

import { STREET_COORDS, intersectionNear } from './city.js';
import { Vehicle } from './cars.js';
import { angleDelta, clamp } from './rng.js';

const CRUISERS_BY_STARS = [0, 1, 2, 3, 4, 5];
const LANE = 3.4;

export class PoliceSystem {
  constructor(scene, colliders) {
    this.scene = scene;
    this.colliders = colliders;
    this.cruisers = [];
    this.heat = 0;
    this.bust = 0;
    this.lastSeenAt = -99;
    this.lastCrimeAt = -99;
    this.spawnTimer = 0;
    this.time = 0;
    // Per-cruiser hunt state: 'road' (work the grid) or 'direct' (the
    // intercept), the intersection it is driving to, and a stuck clock.
    this.state = new Map();
  }

  get stars() {
    return this.heat <= 0.5 ? 0 : Math.min(5, Math.ceil(this.heat / 20));
  }

  /** Register a crime: heat lands, and the cooling clock restarts. */
  addHeat(amount) {
    this.heat = clamp(this.heat + amount, 0, 100);
    this.lastCrimeAt = this.time;
  }

  /** Wipe the slate (the chop shop's wash, or a fresh start). */
  clearHeat() {
    this.heat = 0;
    this.bust = 0;
  }

  /** The closest cruiser to a point, and how far it is. */
  nearestCruiser(x, z) {
    let best = null;
    let bestD = Infinity;
    for (const c of this.cruisers) {
      const d = Math.hypot(c.pos.x - x, c.pos.z - z);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return { cruiser: best, dist: bestD };
  }

  spawnCruiser(playerPos) {
    const spot = intersectionNear(playerPos.x, playerPos.z, 68, 118);
    const cruiser = new Vehicle(this.scene, 0xffffff, { police: true, maxSpeed: 38, accel: 19 });
    const heading = Math.atan2(playerPos.x - spot.x, playerPos.z - spot.z);
    cruiser.place(spot.x, spot.z, heading);
    this.cruisers.push(cruiser);
    this.state.set(cruiser, {
      mode: 'road',
      wp: this.nextWaypoint(spot, playerPos),
      stuckFor: 0,
    });
    return cruiser;
  }

  /** The neighbouring intersection of `at` that closes on the target. */
  nextWaypoint(at, target) {
    let best = null;
    let bestScore = Infinity;
    for (const axis of ['x', 'z']) {
      for (const dir of [-64, 64]) {
        const cand = { x: at.x, z: at.z };
        cand[axis] += dir;
        if (!STREET_COORDS.includes(cand.x) || !STREET_COORDS.includes(cand.z)) continue;
        const score = Math.hypot(cand.x - target.x, cand.z - target.z) + Math.random() * 18;
        if (score < bestScore) {
          bestScore = score;
          best = cand;
        }
      }
    }
    return best ?? { x: at.x, z: at.z };
  }

  /**
   * One frame of the hunt. player is {pos, vel, speed, trying}; onBusted fires
   * when the meter fills. Returns nothing; read stars/bust off the system.
   */
  update(dt, player, onBusted) {
    this.time += dt;
    const stars = this.stars;

    // Drop hunt state for cruisers disposed of from outside (a restart).
    if (this.state.size > this.cruisers.length) {
      for (const car of [...this.state.keys()]) {
        if (!this.cruisers.includes(car)) this.state.delete(car);
      }
    }

    // Sight: a cruiser within 75 units can see you (through the heat haze,
    // if not through walls — Port Azura is flat and open, so distance is
    // an honest proxy here).
    const { dist: nearestDist } = this.nearestCruiser(player.pos.x, player.pos.z);
    const seen = nearestDist < 75;
    if (seen) this.lastSeenAt = this.time;

    // Heat cools while unseen, once the last crime is a few seconds old.
    if (!seen && this.time - this.lastCrimeAt > 3 && this.time - this.lastSeenAt > 2) {
      this.heat = Math.max(0, this.heat - 2.1 * dt);
    }

    // Keep the pack at the size the stars demand.
    this.spawnTimer -= dt;
    const wanted = CRUISERS_BY_STARS[stars];
    if (this.cruisers.length < wanted && this.spawnTimer <= 0) {
      this.spawnCruiser(player.pos);
      this.spawnTimer = 1.4;
    }

    // Bust meter: held by the pack — a cruiser on top of you while you
    // are not driving away (being ram-shoved off the throttle counts).
    if (stars > 0 && !player.trying && player.speed < 6 && nearestDist < 10) {
      this.bust = Math.min(1, this.bust + dt / 2.4);
      if (this.bust >= 1 && onBusted) onBusted();
    } else {
      this.bust = Math.max(0, this.bust - dt * 0.45);
    }

    // Drive the pack.
    for (let i = this.cruisers.length - 1; i >= 0; i--) {
      const c = this.cruisers[i];
      const dx = player.pos.x - c.pos.x;
      const dz = player.pos.z - c.pos.z;
      const dist = Math.hypot(dx, dz);
      if (stars === 0 && dist > 55) {
        c.dispose(this.scene);
        this.cruisers.splice(i, 1);
        this.state.delete(c);
        continue;
      }
      if (dist > 190) {
        // Too far behind to matter: quietly re-stage it near the action.
        const spot = intersectionNear(player.pos.x, player.pos.z, 68, 118);
        c.place(spot.x, spot.z, Math.atan2(player.pos.x - spot.x, player.pos.z - spot.z));
        this.state.set(c, { mode: 'road', wp: this.nextWaypoint(spot, player.pos), stuckFor: 0 });
      }
      let st = this.state.get(c);
      if (!st) {
        st = { mode: 'road', wp: this.nextWaypoint({ x: c.pos.x, z: c.pos.z }, player.pos), stuckFor: 0 };
        this.state.set(c, st);
      }
      if (st.mode === 'road' && dist < 34) st.mode = 'direct';
      if (st.mode === 'direct' && dist > 58) {
        st.mode = 'road';
        st.wp = this.nextWaypoint(
          { x: nearestStreet(c.pos.x), z: nearestStreet(c.pos.z) }, player.pos);
      }

      const control = st.mode === 'road'
        ? this.roadControl(c, st, player.pos)
        : this.directControl(c, player, dist);
      if (c.health <= 0) control.throttle = 0;
      c.update(dt, control, this.colliders);
      c.flashLights(this.time);

      // Wedged against a wall? Dispatch quietly re-stages the unit at a
      // nearby intersection — the chase never dies on geometry.
      if (Math.abs(c.speed) < 1.5 && dist > 14) {
        st.stuckFor += dt;
        if (st.stuckFor > 2.5) {
          const spot = intersectionNear(player.pos.x, player.pos.z, 52, 84);
          c.place(spot.x, spot.z, Math.atan2(player.pos.x - spot.x, player.pos.z - spot.z));
          st.mode = 'road';
          st.wp = this.nextWaypoint(spot, player.pos);
          st.stuckFor = 0;
        }
      } else {
        st.stuckFor = 0;
      }
    }
  }

  /** Grid driving: hold the right-hand lane toward the waypoint. */
  roadControl(c, st, playerPos) {
    const dx = st.wp.x - c.pos.x;
    const dz = st.wp.z - c.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 9) st.wp = this.nextWaypoint(st.wp, playerPos);
    const nx = dx / (dist || 1);
    const nz = dz / (dist || 1);
    // Aim at a point ahead in our lane: forward, plus the lane offset.
    const aimX = c.pos.x + nx * 12 - nz * LANE;
    const aimZ = c.pos.z + nz * 12 + nx * LANE;
    const desired = Math.atan2(aimX - c.pos.x, aimZ - c.pos.z);
    const steer = clamp(angleDelta(c.heading, desired) * 1.8, -1, 1);
    let throttle = c.speed < 29 ? 0.9 : 0.3;
    if (Math.abs(steer) > 0.7 && c.speed > 15) throttle = 0.1; // ease into the turn
    return { throttle, steer, handbrake: false };
  }

  /** The intercept: steer at where the player will be, ram to stop him. */
  directControl(c, player, dist) {
    const lead = clamp(dist / 30, 0, 1.1);
    const tx = player.pos.x + (player.vel?.x ?? 0) * lead;
    const tz = player.pos.z + (player.vel?.z ?? 0) * lead;
    const desired = Math.atan2(tx - c.pos.x, tz - c.pos.z);
    const steer = clamp(angleDelta(c.heading, desired) * 1.9, -1, 1);
    let throttle = 1;
    if (dist < 7 && Math.abs(angleDelta(c.heading, desired)) > 2.2) throttle = -1; // overshot: back up
    else if (dist < 5) throttle = 0.45; // stay on them, keep the ring closed
    return { throttle, steer, handbrake: false };
  }

  /** Every cruiser (for collisions, minimap and siren distance). */
  allVehicles() {
    return this.cruisers;
  }
}

function nearestStreet(v) {
  let best = STREET_COORDS[0];
  for (const s of STREET_COORDS) if (Math.abs(s - v) < Math.abs(best - v)) best = s;
  return best;
}
