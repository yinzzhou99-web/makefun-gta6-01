// HUD: health bar, cash, wanted stars, objective banner, prompts, toasts and
// the circular canvas minimap (streets, beacon, police, traffic, player).

import { ROAD_LINES, EXTENT } from './city.js';

export class HUD {
  constructor() {
    this.root = document.getElementById('hud');
    this.healthBar = document.getElementById('health-bar');
    this.cashEl = document.getElementById('cash');
    this.starsEl = document.getElementById('stars');
    this.objTitle = document.getElementById('objective-title');
    this.objText = document.getElementById('objective-text');
    this.objTimer = document.getElementById('objective-timer');
    this.speedEl = document.getElementById('speed');
    this.toastEl = document.getElementById('toast');
    this.promptEl = document.getElementById('prompt');
    this.map = document.getElementById('minimap').getContext('2d');
    this.toastTimeout = null;
    this.lastStars = -1;
  }

  show() { this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }

  toast(msg, ms = 2400) {
    this.toastEl.textContent = msg;
    this.toastEl.style.opacity = '1';
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => { this.toastEl.style.opacity = '0'; }, ms);
  }

  prompt(msg) {
    this.promptEl.textContent = msg || '';
    this.promptEl.style.opacity = msg ? '1' : '0';
  }

  update(state) {
    this.healthBar.style.width = `${Math.max(0, state.health)}%`;
    this.healthBar.style.background = state.health < 30
      ? '#ff4040' : 'linear-gradient(90deg, #ff5f6d, #ffc371)';
    this.cashEl.textContent = `$${state.cash}`;
    if (state.stars !== this.lastStars) {
      this.lastStars = state.stars;
      let html = '';
      for (let i = 0; i < 5; i++) html += i < state.stars ? '★' : '<span class="off">★</span>';
      this.starsEl.innerHTML = html;
    }
    const obj = state.objective;
    if (obj) {
      this.objTitle.textContent = obj.title;
      this.objText.textContent = obj.text;
    }
    this.objTimer.textContent = state.timer > 0 ? `${Math.ceil(state.timer)}s` : '';
    this.speedEl.textContent = state.driving ? `${Math.round(Math.abs(state.speed) * 3.2)} km/h` : '';
    if (state.bustRatio > 0.02) {
      this.objTimer.textContent = `BUSTED IN ${Math.max(0, (1 - state.bustRatio)).toFixed(1)}…`;
    }
  }

  drawMinimap(state) {
    const ctx = this.map;
    const S = 168, C = S / 2;
    const scale = S / ((EXTENT + 30) * 2);
    const toMap = (x, z) => [C + x * scale, C + z * scale];
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath(); ctx.arc(C, C, C - 2, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#131c2e';
    ctx.fillRect(0, 0, S, S);
    // Streets.
    ctx.strokeStyle = '#4a5a75';
    ctx.lineWidth = Math.max(2, 14 * scale);
    for (const l of ROAD_LINES) {
      const [x] = toMap(l, 0);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, S); ctx.stroke();
      const [, y] = toMap(0, l);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y); ctx.stroke();
    }
    // Objective beacon.
    if (state.target) {
      const [bx, by] = toMap(state.target.x, state.target.z);
      ctx.fillStyle = '#ffd94d';
      ctx.beginPath(); ctx.arc(bx, by, 4.5, 0, Math.PI * 2); ctx.fill();
    }
    // Traffic.
    ctx.fillStyle = '#9aa7bd';
    for (const car of state.traffic) {
      const [x, y] = toMap(car.pos.x, car.pos.z);
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    // Police (blink red/blue).
    const policeColor = Math.floor(performance.now() / 300) % 2 ? '#ff4455' : '#4488ff';
    ctx.fillStyle = policeColor;
    for (const car of state.police) {
      const [x, y] = toMap(car.pos.x, car.pos.z);
      ctx.beginPath(); ctx.arc(x, y, 3.4, 0, Math.PI * 2); ctx.fill();
    }
    // Player arrow.
    const [px, py] = toMap(state.playerPos.x, state.playerPos.z);
    ctx.translate(px, py);
    ctx.rotate(Math.PI - state.playerAngle);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -6); ctx.lineTo(4, 5); ctx.lineTo(0, 2.4); ctx.lineTo(-4, 5);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}
