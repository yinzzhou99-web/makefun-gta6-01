// Keyboard and mouse state. Everything is polled by the game loop; discrete
// presses are exposed through a queue so one-shot actions (enter car, pause,
// restart) never get missed between frames.

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseDown = false;
    this.clicked = false;
    this.mouseSeen = false;

    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
      if ([' ', 'arrowup', 'arrowdown'].includes(k)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouseDown = false; });
    window.addEventListener('mousemove', (e) => { this.mouseX = e.clientX; this.mouseY = e.clientY; this.mouseSeen = true; });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) { this.mouseDown = true; this.clicked = true; }
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouseDown = false; });
  }

  down(...names) { return names.some((n) => this.keys.has(n)); }
  justPressed(name) { return this.pressed.has(name); }

  // Called once at the end of each frame.
  endFrame() { this.pressed.clear(); this.clicked = false; }

  reset() {
    this.keys.clear();
    this.pressed.clear();
    this.mouseDown = false;
    this.clicked = false;
  }
}
