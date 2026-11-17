// rng.js — a seeded random number generator and small numeric helpers.
//
// Port Azura is generated from one fixed seed, so every player gets the
// same city: the same towers on the same corners, the same palms leaning
// over the same boardwalk. mulberry32 is tiny, fast and good enough for
// picking paint colours and rooftop heights.

/** Create a generator from a 32-bit seed. Returns a function giving [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The one generator the whole city is built from. */
export const rng = mulberry32(0xA2026);

/** Random float in [min, max). */
export function rand(min, max) {
  return min + rng() * (max - min);
}

/** Random integer in [min, max], both ends included. */
export function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}

/** Pick one element of an array. */
export function pick(list) {
  return list[Math.floor(rng() * list.length)];
}

/** Clamp v into [min, max]. */
export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

/** Linear interpolation. */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Shortest signed turn from angle a to angle b, in radians. */
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Move an angle toward a target by at most step radians. */
export function turnToward(angle, target, step) {
  const d = angleDelta(angle, target);
  if (Math.abs(d) <= step) return target;
  return angle + Math.sign(d) * step;
}
