// Port Azura's city: a seeded 7x7-street coastal grid. Builds the three.js
// geometry (roads, sidewalks, buildings, palms, lamps, the bay) and returns
// the data the gameplay systems need: building colliders, road lines for the
// traffic graph, parked-car spots and pedestrian sidewalk loops.

import * as THREE from 'three';
import { makeRng } from './rng.js';

export const PITCH = 58;              // distance between neighbouring streets
export const ROAD_HALF = 7;           // half the road width
export const GRID = 3;                // streets at -3..3 on both axes
export const EXTENT = GRID * PITCH + PITCH / 2; // playable half-extent (~203)
export const ROAD_LINES = [];
for (let i = -GRID; i <= GRID; i++) ROAD_LINES.push(i * PITCH);

const BUILDING_COLORS = [0xf2e3c6, 0xe8b4a0, 0xa8d8d8, 0xf7d774, 0xd9e6f2, 0xf2a65a, 0xcfe8c0, 0xe6ccf2, 0xffd1dc];

export function isOnRoad(x, z) {
  const near = (v) => ROAD_LINES.some((l) => Math.abs(v - l) <= ROAD_HALF + 0.6);
  return near(x) || near(z);
}

export function buildCity(scene) {
  const rng = makeRng();
  const colliders = [];
  const parkedSpots = [];
  const group = new THREE.Group();
  scene.add(group);

  const mat = {
    ground: new THREE.MeshLambertMaterial({ color: 0x9db38a }),
    road: new THREE.MeshLambertMaterial({ color: 0x3c4148 }),
    roadLine: new THREE.MeshBasicMaterial({ color: 0xf7d774 }),
    walk: new THREE.MeshLambertMaterial({ color: 0xcfc4ae }),
    sand: new THREE.MeshLambertMaterial({ color: 0xeed9a4 }),
    water: new THREE.MeshLambertMaterial({ color: 0x2e86ab }),
    trunk: new THREE.MeshLambertMaterial({ color: 0x8a6b46 }),
    frond: new THREE.MeshLambertMaterial({ color: 0x3f9e4d }),
    lamp: new THREE.MeshLambertMaterial({ color: 0x555c66 }),
    lampGlow: new THREE.MeshBasicMaterial({ color: 0xffe9a8 }),
  };

  // Ground, bay water (east edge) and beach strip.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(EXTENT * 2 + 260, EXTENT * 2 + 260), mat.ground);
  ground.rotation.x = -Math.PI / 2; ground.position.x = 60;
  group.add(ground);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(300, EXTENT * 2 + 260), mat.water);
  water.rotation.x = -Math.PI / 2; water.position.set(EXTENT + 168, -0.25, 0);
  group.add(water);
  const beach = new THREE.Mesh(new THREE.PlaneGeometry(36, EXTENT * 2 + 40), mat.sand);
  beach.rotation.x = -Math.PI / 2; beach.position.set(EXTENT + 16, 0.02, 0);
  group.add(beach);

  // Roads: long asphalt strips plus dashed centre lines.
  const roadGeoH = new THREE.PlaneGeometry(EXTENT * 2 + 30, ROAD_HALF * 2);
  const roadGeoV = new THREE.PlaneGeometry(ROAD_HALF * 2, EXTENT * 2 + 30);
  for (const l of ROAD_LINES) {
    const rh = new THREE.Mesh(roadGeoH, mat.road);
    rh.rotation.x = -Math.PI / 2; rh.position.set(0, 0.04, l);
    group.add(rh);
    const rv = new THREE.Mesh(roadGeoV, mat.road);
    rv.rotation.x = -Math.PI / 2; rv.position.set(l, 0.04, 0);
    group.add(rv);
    for (let d = -EXTENT + 6; d < EXTENT - 4; d += 9) {
      const dashH = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 0.5), mat.roadLine);
      dashH.rotation.x = -Math.PI / 2; dashH.position.set(d, 0.06, l);
      group.add(dashH);
      const dashV = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 4.4), mat.roadLine);
      dashV.rotation.x = -Math.PI / 2; dashV.position.set(l, 0.06, d);
      group.add(dashV);
    }
  }

  // Sidewalk slabs on every block face.
  const walkGeo = new THREE.BoxGeometry(PITCH - ROAD_HALF * 2 + 3, 0.24, PITCH - ROAD_HALF * 2 + 3);
  for (let i = -GRID; i < GRID; i++) {
    for (let j = -GRID; j < GRID; j++) {
      const cx = (i + 0.5) * PITCH, cz = (j + 0.5) * PITCH;
      const slab = new THREE.Mesh(walkGeo, mat.walk);
      slab.position.set(cx, 0.12, cz);
      group.add(slab);
    }
  }

  // Buildings: one or two per block, a few blocks left as palm plazas.
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x9c8d7a });
  for (let i = -GRID; i < GRID; i++) {
    for (let j = -GRID; j < GRID; j++) {
      const cx = (i + 0.5) * PITCH, cz = (j + 0.5) * PITCH;
      if (rng.chance(0.16)) continue; // plaza block
      const two = rng.chance(0.35);
      const spots = two ? [[-11, -11], [11, 11]] : [[0, 0]];
      for (const [ox, oz] of spots) {
        const w = rng.range(15, two ? 19 : 30), d = rng.range(15, two ? 19 : 30);
        const h = rng.range(9, 42);
        const color = rng.pick(BUILDING_COLORS);
        const b = new THREE.Mesh(
          new THREE.BoxGeometry(w, h, d),
          new THREE.MeshLambertMaterial({ color }),
        );
        b.position.set(cx + ox, h / 2 + 0.2, cz + oz);
        group.add(b);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.7, 0.7, d + 0.7), roofMat);
        roof.position.set(cx + ox, h + 0.55, cz + oz);
        group.add(roof);
        colliders.push({ minX: cx + ox - w / 2, maxX: cx + ox + w / 2, minZ: cz + oz - d / 2, maxZ: cz + oz + d / 2 });
      }
    }
  }

  // Palms: instanced trunks + crowns along sidewalks and on the beach.
  const palmPos = [];
  for (const l of ROAD_LINES) {
    for (let d = -EXTENT + 12; d < EXTENT - 6; d += 17) {
      if (rng.chance(0.75)) palmPos.push([l + ROAD_HALF + 2.6, d + rng.range(-2, 2)]);
      if (rng.chance(0.75)) palmPos.push([d + rng.range(-2, 2), l - ROAD_HALF - 2.6]);
    }
  }
  for (let z = -EXTENT + 10; z < EXTENT; z += 15) palmPos.push([EXTENT + 12 + rng.range(-3, 3), z]);
  const trunkGeo = new THREE.CylinderGeometry(0.28, 0.42, 6.4, 6);
  trunkGeo.translate(0, 3.2, 0);
  const crownGeo = new THREE.ConeGeometry(3.1, 1.6, 7);
  crownGeo.translate(0, 6.9, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, mat.trunk, palmPos.length);
  const crowns = new THREE.InstancedMesh(crownGeo, mat.frond, palmPos.length);
  const m4 = new THREE.Matrix4();
  palmPos.forEach(([x, z], idx) => {
    m4.makeRotationY(rng.range(0, Math.PI * 2));
    m4.setPosition(x, 0, z);
    trunks.setMatrixAt(idx, m4);
    crowns.setMatrixAt(idx, m4);
  });
  group.add(trunks, crowns);

  // Street lamps at intersections.
  const lampGeo = new THREE.CylinderGeometry(0.14, 0.14, 5.4, 5);
  lampGeo.translate(0, 2.7, 0);
  const lampHeadGeo = new THREE.SphereGeometry(0.42, 6, 5);
  lampHeadGeo.translate(0, 5.5, 0);
  const lampPts = [];
  for (const x of ROAD_LINES) for (const z of ROAD_LINES) lampPts.push([x + ROAD_HALF + 1.6, z + ROAD_HALF + 1.6]);
  const lampPosts = new THREE.InstancedMesh(lampGeo, mat.lamp, lampPts.length);
  const lampHeads = new THREE.InstancedMesh(lampHeadGeo, mat.lampGlow, lampPts.length);
  lampPts.forEach(([x, z], idx) => {
    m4.identity(); m4.setPosition(x, 0, z);
    lampPosts.setMatrixAt(idx, m4);
    lampHeads.setMatrixAt(idx, m4);
  });
  group.add(lampPosts, lampHeads);

  // Parked-car spots: along road edges, clear of intersections.
  for (const l of ROAD_LINES) {
    for (let d = -EXTENT + 20; d < EXTENT - 14; d += 13) {
      const nearCross = ROAD_LINES.some((o) => Math.abs(d - o) < 13);
      if (nearCross) continue;
      if (rng.chance(0.55)) parkedSpots.push({ x: l - ROAD_HALF + 1.7, z: d, angle: 0 });
      if (rng.chance(0.55)) parkedSpots.push({ x: d, z: l + ROAD_HALF - 1.7, angle: Math.PI / 2 });
    }
  }

  return { group, colliders, parkedSpots };
}

// Push a circle (x, z, radius) out of every building AABB it overlaps.
// Returns true when a push happened (used for collision damage).
export function collideCircle(colliders, pos, radius) {
  let hit = false;
  for (const c of colliders) {
    const nx = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - nx, dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      hit = true;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * radius;
        pos.z = nz + (dz / d) * radius;
      } else {
        // Centre inside the box: push out along the smallest penetration.
        const left = pos.x - c.minX, right = c.maxX - pos.x;
        const top = pos.z - c.minZ, bot = c.maxZ - pos.z;
        const m = Math.min(left, right, top, bot);
        if (m === left) pos.x = c.minX - radius;
        else if (m === right) pos.x = c.maxX + radius;
        else if (m === top) pos.z = c.minZ - radius;
        else pos.z = c.maxZ + radius;
      }
    }
  }
  // World bounds (bay side is open sand, but keep everyone in the city).
  const lim = EXTENT + 26;
  pos.x = Math.max(-lim, Math.min(lim, pos.x));
  pos.z = Math.max(-lim, Math.min(lim, pos.z));
  return hit;
}
