// hud.js — everything drawn over the 3D world: cash, stars, the mission
// banner, the speedometer, prompts, toasts, the title and end screens,
// and the circular minimap in the corner.
//
// The minimap paints its streets once to an offscreen canvas (the city
// never changes shape), then each frame stamps that down and adds the
// moving parts: traffic as pale dots, cruisers as flashing blue, the
// mission beacon in gold or green, and Rook as a white arrow.

import { STREET_COORDS, WORLD, chopShopLot } from './city.js';

const MAP_RANGE = { minX: -232, maxX: 264, minZ: -232, maxZ: 232 };

export class HUD {
  constructor() {
    this.el = {};
    for (const id of [
      'cash', 'debtfill', 'debttext', 'stars', 'mission', 'mission-title', 'mission-sub',
      'timerfill', 'speedo', 'speed-val', 'healthfill', 'prompt', 'bustwrap', 'bustfill',
      'toast', 'title-screen', 'best-haul', 'end-screen', 'end-title', 'end-stats', 'debt-done',
    ]) {
      this.el[id] = document.getElementById(id);
    }
    this.map = document.getElementById('minimap');
    this.mapCtx = this.map.getContext('2d');
    this.staticMap = this.paintStaticMap();
    this.toastTimer = 0;
    this.lastStars = -1;
  }

  paintStaticMap() {
    const c = document.createElement('canvas');
    c.width = c.height = 184;
    const g = c.getContext('2d');
    const sx = (x) => ((x - MAP_RANGE.minX) / (MAP_RANGE.maxX - MAP_RANGE.minX)) * 184;
    const sz = (z) => ((z - MAP_RANGE.minZ) / (MAP_RANGE.maxZ - MAP_RANGE.minZ)) * 184;
    g.fillStyle = '#274b5c';
    g.fillRect(0, 0, 184, 184);
    g.fillStyle = '#3a4149';
    g.fillRect(0, 0, sx(WORLD.maxX), 184);
    g.fillStyle = '#c2a878';
    g.fillRect(sx(216), 0, sx(252) - sx(216), 184); // sand
    g.fillStyle = '#2e7f9e';
    g.fillRect(sx(252), 0, 184 - sx(252), 184); // the bay
    g.strokeStyle = '#585f68';
    g.lineWidth = 5;
    for (const s of STREET_COORDS) {
      g.beginPath();
      g.moveTo(sx(s), 0);
      g.lineTo(sx(s), 184);
      g.stroke();
      g.beginPath();
      g.moveTo(0, sz(s));
      g.lineTo(sx(WORLD.maxX), sz(s));
      g.stroke();
    }
    g.fillStyle = '#5d8a48'; // the park
    g.fillRect(sx(STREET_COORDS[4] + 8), sz(STREET_COORDS[1] + 8), sx(STREET_COORDS[4] + 56) - sx(STREET_COORDS[4] + 8), sz(STREET_COORDS[1] + 56) - sz(STREET_COORDS[1] + 8));
    const shop = chopShopLot(); // the chop shop, always worth knowing
    g.fillStyle = '#ff9f43';
    g.fillRect(sx(shop.x) - 3, sz(shop.z) - 3, 6, 6);
    return c;
  }

  setCash(cash, earned, goal) {
    this.el.cash.textContent = `$${cash.toLocaleString('en-US')}`;
    const frac = Math.min(1, earned / goal);
    this.el.debtfill.style.width = `${frac * 100}%`;
    this.el.debttext.textContent = earned >= goal ? 'DEBT CLEARED — PORT AZURA IS YOURS' : `DEBT $${earned.toLocaleString('en-US')} / $${goal.toLocaleString('en-US')}`;
    this.el['debt-done'].style.opacity = earned >= goal ? '1' : '0';
  }

  setStars(n) {
    if (n === this.lastStars) return;
    this.lastStars = n;
    this.el.stars.textContent = '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
    this.el.stars.style.opacity = n > 0 ? '1' : '0.25';
  }

  /** Mission banner: title, a sub-line, and a 0..1 timer fraction (or null). */
  setMission(title, sub, timerFrac) {
    if (!title) {
      this.el.mission.style.opacity = '0';
      return;
    }
    this.el.mission.style.opacity = '1';
    this.el['mission-title'].textContent = title;
    this.el['mission-sub'].textContent = sub;
    this.el.timerfill.style.width = timerFrac == null ? '0%' : `${Math.max(0, timerFrac) * 100}%`;
    this.el.timerfill.style.background = timerFrac != null && timerFrac < 0.25 ? '#ff5a4a' : '#ffd94a';
  }

  /** Speedometer block; pass null speed when on foot to hide it. */
  setSpeed(kmh, health) {
    if (kmh == null) {
      this.el.speedo.style.opacity = '0';
      return;
    }
    this.el.speedo.style.opacity = '1';
    this.el['speed-val'].textContent = String(kmh);
    this.el.healthfill.style.width = `${Math.max(0, health)}%`;
    this.el.healthfill.style.background = health < 30 ? '#ff5a4a' : '#7fe7a0';
  }

  setPrompt(text) {
    this.el.prompt.textContent = text ?? '';
    this.el.prompt.style.opacity = text ? '1' : '0';
  }

  setBust(frac) {
    this.el.bustwrap.style.opacity = frac > 0.01 ? '1' : '0';
    this.el.bustfill.style.width = `${frac * 100}%`;
  }

  toast(text, ms = 2400) {
    this.el.toast.textContent = text;
    this.el.toast.style.opacity = '1';
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.el.toast.style.opacity = '0';
    }, ms);
  }

  showTitle(bestHaul) {
    this.el['best-haul'].textContent = bestHaul > 0 ? `Best haul: $${bestHaul.toLocaleString('en-US')}` : 'No haul yet — the crew is waiting.';
    this.el['title-screen'].style.display = 'flex';
  }

  hideTitle() {
    this.el['title-screen'].style.display = 'none';
  }

  showEnd(kind, statsLine) {
    this.el['end-title'].textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
    this.el['end-title'].style.color = kind === 'busted' ? '#4ac8ff' : '#ff5a4a';
    this.el['end-stats'].textContent = statsLine;
    this.el['end-screen'].style.display = 'flex';
  }

  hideEnd() {
    this.el['end-screen'].style.display = 'none';
  }

  /**
   * One frame of the minimap. view = {player:{x,z,heading}, traffic:[{x,z}],
   * police:[{x,z}], target:{x,z,color}|null, time}.
   */
  drawMinimap(view) {
    const g = this.mapCtx;
    const S = 184;
    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath();
    g.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
    g.clip();
    g.drawImage(this.staticMap, 0, 0);
    const sx = (x) => ((x - MAP_RANGE.minX) / (MAP_RANGE.maxX - MAP_RANGE.minX)) * S;
    const sz = (z) => ((z - MAP_RANGE.minZ) / (MAP_RANGE.maxZ - MAP_RANGE.minZ)) * S;
    g.fillStyle = 'rgba(240,240,235,0.65)';
    for (const c of view.traffic) {
      g.fillRect(sx(c.x) - 1.5, sz(c.z) - 1.5, 3, 3);
    }
    const flash = Math.floor(view.time * 2.4) % 2 === 0;
    for (const c of view.police) {
      g.fillStyle = flash ? '#3a86ff' : '#ff3b30';
      g.fillRect(sx(c.x) - 2.5, sz(c.z) - 2.5, 5, 5);
    }
    if (view.target) {
      g.strokeStyle = view.target.color;
      g.lineWidth = 2;
      const pulse = 5 + Math.sin(view.time * 4) * 1.6;
      g.beginPath();
      g.arc(sx(view.target.x), sz(view.target.z), pulse, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = view.target.color;
      g.fillRect(sx(view.target.x) - 1.5, sz(view.target.z) - 1.5, 3, 3);
    }
    // Rook: a white arrow turned to his heading.
    g.translate(sx(view.player.x), sz(view.player.z));
    g.rotate(Math.PI - view.player.heading); // canvas y is flipped vs the world
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(0, -6);
    g.lineTo(4.4, 5);
    g.lineTo(0, 2.6);
    g.lineTo(-4.4, 5);
    g.closePath();
    g.fill();
    g.restore();
  }
}
