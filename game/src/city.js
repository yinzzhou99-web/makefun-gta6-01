// city.js — Port Azura itself: the street grid, the towers, the bay.
//
// The city is a 7-by-7 grid of streets built from one seed. A single big
// canvas texture paints the ground plan (asphalt, crosswalks, sidewalks,
// boardwalk, sand) so the streets read clearly from the chase camera, and
// the buildings are tinted boxes with canvas facades in pastel Miami
// colours. The east edge of the map is the boardwalk, then sand, then the
// bay. Milo's Auto Works — the chop shop — sits on the west side.
//
// Everything solid registers an AABB collider here, and the movement code
// in the other files resolves circles against them with collideCircle().

import * as THREE from 'three';
import { clamp, pick, rand, rng } from './rng.js';

/** Street centre-lines, both axes: 7 streets each way, 64 units apart. */
export const STREET_COORDS = [-192, -128, -64, 0, 64, 128, 192];
export const PITCH = 64;
export const ROAD_HALF = 8;
/** Playable bounds; the bay's water starts at maxX. */
export const WORLD = { minX: -216, maxX: 248, minZ: -216, maxZ: 216 };
const BLOCK_MIN = 8; // block interior starts this far past a street centre
const BLOCK_SIZE = PITCH - ROAD_HALF * 2; // 48

/** True when a point sits on asphalt (used for spawns and AI choices). */
export function isOnRoad(x, z) {
  const near = (v) => STREET_COORDS.some((c) => Math.abs(v - c) <= ROAD_HALF + 1);
  return near(x) || near(z);
}

/** A random point on a random street, for traffic and pickup spawns. */
export function randomStreetPoint() {
  const axis = rng() < 0.5 ? 'x' : 'z';
  const fixed = pick(STREET_COORDS);
  const along = rand(WORLD.minX + 10, WORLD.maxX - 10);
  return axis === 'x' ? { x: along, z: fixed } : { x: fixed, z: along };
}

/** A street intersection at least minD and at most maxD from (x, z). */
export function intersectionNear(x, z, minD, maxD) {
  const options = [];
  for (const sx of STREET_COORDS) {
    for (const sz of STREET_COORDS) {
      const d = Math.hypot(sx - x, sz - z);
      if (d >= minD && d <= maxD) options.push({ x: sx, z: sz });
    }
  }
  if (!options.length) return { x: 0, z: 0 };
  return pick(options);
}

/**
 * Push a circle (pos.x/pos.z, radius) out of every AABB collider and out
 * of the world bounds. Mutates pos; returns the deepest penetration
 * resolved, so callers can tell a scrape from a real hit.
 */
export function collideCircle(pos, radius, colliders) {
  let deepest = 0;
  for (const c of colliders) {
    const nx = clamp(pos.x, c.minX, c.maxX);
    const nz = clamp(pos.z, c.minZ, c.maxZ);
    const dx = pos.x - nx;
    const dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 > radius * radius) continue;
    if (d2 > 1e-6) {
      const d = Math.sqrt(d2);
      pos.x = nx + (dx / d) * radius;
      pos.z = nz + (dz / d) * radius;
      deepest = Math.max(deepest, radius - d);
    } else {
      // Centre inside the box: leave by the shortest side.
      const left = pos.x - c.minX;
      const right = c.maxX - pos.x;
      const top = pos.z - c.minZ;
      const bottom = c.maxZ - pos.z;
      const m = Math.min(left, right, top, bottom);
      if (m === left) pos.x = c.minX - radius;
      else if (m === right) pos.x = c.maxX + radius;
      else if (m === top) pos.z = c.minZ - radius;
      else pos.z = c.maxZ + radius;
      deepest = Math.max(deepest, radius);
    }
  }
  pos.x = clamp(pos.x, WORLD.minX + radius, WORLD.maxX - radius);
  pos.z = clamp(pos.z, WORLD.minZ + radius, WORLD.maxZ - radius);
  return deepest;
}

// ---------------------------------------------------------------- textures

function makeGroundTexture() {
  const S = 2048;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const g = canvas.getContext('2d');
  const scale = S / 640;
  const px = (x) => (x + 288) * scale;
  const pz = (z) => (z + 320) * scale;
  const rect = (x, z, w, d, fill) => {
    g.fillStyle = fill;
    g.fillRect(px(x), pz(z), w * scale, d * scale);
  };

  rect(-288, -320, 640, 640, '#c9b299'); // sun-bleached base pavement
  // Block sidewalks, a lighter slab per block.
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      const x = STREET_COORDS[i] + BLOCK_MIN;
      const z = STREET_COORDS[j] + BLOCK_MIN;
      rect(x - 2, z - 2, BLOCK_SIZE + 4, BLOCK_SIZE + 4, '#d8c6ac');
    }
  }
  // The park block (4, 1) is grass, not pavement.
  rect(STREET_COORDS[4] + BLOCK_MIN, STREET_COORDS[1] + BLOCK_MIN, BLOCK_SIZE, BLOCK_SIZE, '#7fae5a');
  // Asphalt streets, then their dashed centre lines.
  for (const c of STREET_COORDS) {
    rect(c - ROAD_HALF, -216, ROAD_HALF * 2, 432, '#3c4046');
    rect(-216, c - ROAD_HALF, 432, ROAD_HALF * 2, '#3c4046');
  }
  g.fillStyle = '#e8c85a';
  for (const c of STREET_COORDS) {
    for (let t = -212; t < 212; t += 12) {
      g.fillRect(px(c) - 1, pz(t), 2, 6 * scale);
      g.fillRect(px(t), pz(c) - 1, 6 * scale, 2);
    }
  }
  // Crosswalks at every intersection.
  g.fillStyle = 'rgba(240,240,235,0.75)';
  for (const sx of STREET_COORDS) {
    for (const sz of STREET_COORDS) {
      for (let s = -6; s <= 6; s += 3) {
        g.fillRect(px(sx + s) - 1, pz(sz - ROAD_HALF) + 2, 2, 5);
        g.fillRect(px(sx + s) - 1, pz(sz + ROAD_HALF) - 7, 2, 5);
        g.fillRect(px(sx - ROAD_HALF) + 2, pz(sz + s) - 1, 5, 2);
        g.fillRect(px(sx + ROAD_HALF) - 7, pz(sz + s) - 1, 5, 2);
      }
    }
  }
  // Boardwalk planks, then sand down to the water.
  rect(202, -320, 16, 640, '#a9805a');
  g.fillStyle = 'rgba(0,0,0,0.18)';
  for (let z = -320; z < 320; z += 4) g.fillRect(px(202), pz(z), 16 * scale, 1.5);
  rect(218, -320, 134, 640, '#ecd9a0');
  // Chop-shop apron markings.
  const shop = chopShopLot();
  rect(shop.x - shop.w / 2, shop.z - shop.d / 2, shop.w, shop.d, '#8f8a80');
  g.strokeStyle = '#ffd94a';
  g.lineWidth = 3;
  g.strokeRect(px(shop.x - shop.w / 2 + 2), pz(shop.z - shop.d / 2 + 2), (shop.w - 4) * scale, (shop.d - 4) * scale);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** The chop shop's wash lot: the apron in front of Milo's Auto Works. */
export function chopShopLot() {
  return { x: STREET_COORDS[0] + 32, z: STREET_COORDS[2] + 32, w: 34, d: 26 };
}

function makeFacadeTexture(base, trim) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  g.fillStyle = trim;
  g.fillRect(0, 0, 128, 10);
  g.fillRect(0, 246, 128, 10);
  for (let y = 22; y < 236; y += 24) {
    for (let x = 12; x < 116; x += 24) {
      const lit = rng() < 0.28;
      g.fillStyle = lit ? '#ffe9a8' : 'rgba(38,52,66,0.85)';
      g.fillRect(x, y, 14, 16);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(x, y, 14, 4);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSignTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const g = canvas.getContext('2d');
  g.fillStyle = '#20303a';
  g.fillRect(0, 0, 512, 96);
  g.fillStyle = '#ffd94a';
  g.font = 'bold 44px system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillText("MILO'S AUTO WORKS", 256, 46);
  g.fillStyle = '#7fe7d2';
  g.font = 'bold 24px system-ui, sans-serif';
  g.fillText('PAINT · WASH · NO QUESTIONS', 256, 80);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeWaterTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = '#2e7f9e';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.lineWidth = 2;
  for (let i = 0; i < 7; i++) {
    g.beginPath();
    const y = 10 + i * 18;
    g.moveTo(0, y);
    g.bezierCurveTo(32, y - 5, 64, y + 5, 128, y);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 40);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ------------------------------------------------------------------- build

const PASTELS = ['#ffb59e', '#ffd9a0', '#9fe2bf', '#a8d8f0', '#f7f3e8', '#f2a7c3', '#c3e6a8'];

export function buildCity(scene) {
  const colliders = [];
  const group = new THREE.Group();
  scene.add(group);

  // Sky: a warm gradient dome, golden-hour peach at the horizon.
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 4;
  skyCanvas.height = 256;
  const sg = skyCanvas.getContext('2d');
  const grad = sg.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#2d5a8f');
  grad.addColorStop(0.45, '#7fb2d9');
  grad.addColorStop(0.75, '#f7c98b');
  grad.addColorStop(1, '#ffb37a');
  sg.fillStyle = grad;
  sg.fillRect(0, 0, 4, 256);
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 16, 12),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }),
  );
  group.add(sky);
  scene.fog = new THREE.Fog(0xf2c184, 150, 620);

  // Ground.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(640, 640),
    new THREE.MeshLambertMaterial({ map: makeGroundTexture() }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(32, 0, 0);
  ground.receiveShadow = true;
  group.add(ground);

  // The bay: animated water east of the sand.
  const waterTex = makeWaterTexture();
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(110, 640),
    new THREE.MeshLambertMaterial({ map: waterTex, transparent: true, opacity: 0.92 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(303, 0.12, 0);
  group.add(water);

  // Buildings, block by block.
  const facades = PASTELS.map((c) => makeFacadeTexture(c, 'rgba(255,255,255,0.55)'));
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x6b5a4a });
  const shopLot = chopShopLot();
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      const bx = STREET_COORDS[i] + BLOCK_MIN;
      const bz = STREET_COORDS[j] + BLOCK_MIN;
      const cx = bx + BLOCK_SIZE / 2;
      const cz = bz + BLOCK_SIZE / 2;
      if (cx === shopLot.x && cz === shopLot.z) continue; // the chop shop's block
      if (i === 4 && j === 1) continue; // the park
      const pattern = rng();
      const spots = [];
      if (pattern < 0.34) {
        spots.push({ x: cx, z: cz, w: 30, d: 30, h: rand(30, 68) });
      } else if (pattern < 0.67) {
        for (const ox of [-12, 12]) {
          for (const oz of [-12, 12]) spots.push({ x: cx + ox, z: cz + oz, w: 19, d: 19, h: rand(9, 30) });
        }
      } else {
        spots.push({ x: cx, z: cz - 12, w: 40, d: 19, h: rand(12, 34) });
        spots.push({ x: cx, z: cz + 12, w: 40, d: 19, h: rand(12, 34) });
      }
      for (const s of spots) {
        const tex = pick(facades);
        const side = new THREE.MeshLambertMaterial({ map: tex });
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(s.w, s.h, s.d), [side, side, roofMat, roofMat, side, side]);
        mesh.position.set(s.x, s.h / 2, s.z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        colliders.push({ minX: s.x - s.w / 2, maxX: s.x + s.w / 2, minZ: s.z - s.d / 2, maxZ: s.z + s.d / 2 });
        // A water tank or plant box on some roofs, for silhouette.
        if (rng() < 0.4) {
          const cap = new THREE.Mesh(new THREE.BoxGeometry(s.w * 0.3, 2.2, s.d * 0.3), roofMat);
          cap.position.set(s.x + rand(-6, 6), s.h + 1.1, s.z + rand(-6, 6));
          group.add(cap);
        }
      }
    }
  }

  // The chop shop: a low wide garage with its sign, behind the wash lot.
  const shopMat = new THREE.MeshLambertMaterial({ color: 0x51707e });
  const shop = new THREE.Mesh(new THREE.BoxGeometry(40, 11, 20), shopMat);
  shop.position.set(shopLot.x, 5.5, shopLot.z + 14);
  shop.castShadow = true;
  group.add(shop);
  colliders.push({ minX: shopLot.x - 20, maxX: shopLot.x + 20, minZ: shopLot.z + 4, maxZ: shopLot.z + 24 });
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(34, 6.4),
    new THREE.MeshBasicMaterial({ map: makeSignTexture() }),
  );
  sign.rotation.y = Math.PI; // face the lot, not the wall
  sign.position.set(shopLot.x, 9.6, shopLot.z + 3.8);
  group.add(sign);
  const awning = new THREE.Mesh(new THREE.BoxGeometry(40, 0.5, 6), new THREE.MeshLambertMaterial({ color: 0xffd94a }));
  awning.position.set(shopLot.x, 7.6, shopLot.z + 2);
  group.add(awning);

  // Palms along the boardwalk and in the park.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a48 });
  const crownMat = new THREE.MeshLambertMaterial({ color: 0x3f8f4f });
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.3, 5, 6);
  const crownGeo = new THREE.IcosahedronGeometry(2.4, 0);
  const addPalm = (x, z) => {
    const palm = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 2.5;
    trunk.rotation.z = rand(-0.09, 0.09);
    trunk.castShadow = true;
    const crown = new THREE.Mesh(crownGeo, crownMat);
    crown.scale.set(1.25, 0.38, 1.25);
    crown.position.y = 5.1;
    crown.castShadow = true;
    palm.add(trunk, crown);
    palm.position.set(x, 0, z);
    palm.rotation.y = rand(0, Math.PI * 2);
    group.add(palm);
  };
  for (let z = -205; z <= 205; z += 17) addPalm(209, z + rand(-3, 3));
  for (let n = 0; n < 14; n++) {
    addPalm(STREET_COORDS[4] + BLOCK_MIN + rand(5, 43), STREET_COORDS[1] + BLOCK_MIN + rand(5, 43));
  }
  for (let n = 0; n < 10; n++) addPalm(rand(-205, 195), pick(STREET_COORDS) + rand(11, 13) * (rng() < 0.5 ? -1 : 1));

  // Streetlights at every other intersection.
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x37424a });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe2a0 });
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 5.6, 6);
  const lampGeo = new THREE.BoxGeometry(0.7, 0.22, 0.7);
  for (let i = 0; i < STREET_COORDS.length; i += 1) {
    for (let j = 0; j < STREET_COORDS.length; j += 1) {
      if ((i + j) % 2) continue;
      const light = new THREE.Group();
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.y = 2.8;
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.y = 5.65;
      light.add(pole, lamp);
      light.position.set(STREET_COORDS[i] + 10.5, 0, STREET_COORDS[j] + 10.5);
      group.add(light);
    }
  }

  // Beach umbrellas, for colour on the sand.
  const umbrellaMats = [0xff5a5a, 0xffd94a, 0x4ac8ff].map((c) => new THREE.MeshLambertMaterial({ color: c }));
  for (let n = 0; n < 9; n++) {
    const um = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 5), poleMat);
    pole.position.y = 1.2;
    const top = new THREE.Mesh(new THREE.ConeGeometry(1.9, 0.7, 8), pick(umbrellaMats));
    top.position.y = 2.5;
    um.add(pole, top);
    um.position.set(rand(224, 244), 0, rand(-200, 200));
    group.add(um);
  }

  return {
    colliders,
    chopShop: shopLot,
    update(dt, t) {
      waterTex.offset.y = (t * 0.012) % 1;
      waterTex.offset.x = Math.sin(t * 0.1) * 0.02;
      sky.position.set(0, 0, 0);
    },
  };
}
