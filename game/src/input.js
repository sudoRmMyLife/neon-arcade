// input.js — raw keyboard and mouse state for the game. It records what is held and
// what was pressed this step; main.js turns that into the intent the world reads.
// Nothing here knows the game's rules.

const held = new Set();
const pressed = new Set(); // keys that went down since the last consumePresses()
let mouseClientX = 0;
let mouseClientY = 0;
let mouseDown = false;
let mousePressed = false;
let rightDown = false;
let rightPressed = false;

export function attachInput(canvas) {
  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    held.add(event.code);
    pressed.add(event.code);
    if (event.code === 'Space' || event.code.startsWith('Arrow')) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => held.delete(event.code));
  window.addEventListener('blur', () => {
    held.clear();
    mouseDown = false;
    rightDown = false;
  });
  canvas.addEventListener('mousemove', (event) => {
    mouseClientX = event.clientX;
    mouseClientY = event.clientY;
  });
  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) {
      mouseDown = true;
      mousePressed = true;
    }
    if (event.button === 2) {
      rightDown = true;
      rightPressed = true;
    }
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) mouseDown = false;
    if (event.button === 2) rightDown = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
}

export function isHeld(code) {
  return held.has(code);
}

export function consumePresses() {
  const out = new Set(pressed);
  pressed.clear();
  const mouse = { clicked: mousePressed, rightClicked: rightPressed };
  mousePressed = false;
  rightPressed = false;
  return { keys: out, ...mouse };
}

// Movement intent as a unit vector from the held keys (WASD and arrows both work).
export function moveVector() {
  let x = 0;
  let y = 0;
  if (isHeld('KeyA') || isHeld('ArrowLeft')) x -= 1;
  if (isHeld('KeyD') || isHeld('ArrowRight')) x += 1;
  if (isHeld('KeyW') || isHeld('ArrowUp')) y -= 1;
  if (isHeld('KeyS') || isHeld('ArrowDown')) y += 1;
  if (x !== 0 && y !== 0) {
    const inv = Math.SQRT1_2;
    x *= inv;
    y *= inv;
  }
  return { x, y };
}

export function pointerState(view) {
  return {
    x: (mouseClientX - view.offsetX) / view.scale,
    y: (mouseClientY - view.offsetY) / view.scale,
    down: mouseDown,
    rightDown,
  };
}
