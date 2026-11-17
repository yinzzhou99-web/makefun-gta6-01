// input.js — keyboard and mouse state for the game.
//
// One shared state object: keys currently held (by code, so layout does not
// matter), keys pressed this frame (for one-shot actions like stealing a
// car or punching), and the mouse movement gathered since the last frame
// while the pointer is locked. The game polls it; nothing here knows about
// the game itself.

export const input = {
  keys: new Set(),
  pressed: new Set(),
  mouseDX: 0,
  mouseDY: 0,
  locked: false,
};

/** True while a key (KeyboardEvent.code) is held down. */
export function down(code) {
  return input.keys.has(code);
}

/** True only on the frame a key went down. Cleared by endFrame(). */
export function tapped(code) {
  return input.pressed.has(code);
}

/** Call once per frame after the game has read the one-shot state. */
export function endFrame() {
  input.pressed.clear();
  input.mouseDX = 0;
  input.mouseDY = 0;
}

/** Attach the listeners to a DOM element (the game canvas). */
export function initInput(target) {
  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    input.keys.add(e.code);
    input.pressed.add(e.code);
    if (e.code === 'Space') e.preventDefault();
  });
  addEventListener('keyup', (e) => input.keys.delete(e.code));
  addEventListener('blur', () => input.keys.clear());
  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === target;
  });
  addEventListener('mousemove', (e) => {
    if (!input.locked) return;
    input.mouseDX += e.movementX;
    input.mouseDY += e.movementY;
  });
}

/** Ask the browser to lock the pointer to the canvas (needs a click). */
export function lockPointer(target) {
  if (!input.locked) target.requestPointerLock();
}
