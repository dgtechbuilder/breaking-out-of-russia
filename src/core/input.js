// Input sources produce a uniform "intent" each frame so humans on keyboard/mouse
// and gamepads drive the same Player code.

export function blankIntent() {
  return {
    moveX: 0, moveZ: 0, lookX: 0, lookY: 0,
    fire: false, firePressed: false, ads: false,
    jump: false, crouch: false, crouchPressed: false, sprint: false,
    reload: false, interact: false, interactPressed: false,
    slot: -1, cycle: 0, molotov: false, flare: false, melee: false,
    callin: -1, pause: false, surrender: false,
    menuUp: false, menuDown: false, menuOk: false, menuBack: false,
  };
}

export const settings = {
  sensitivity: 1.0,
  invertY: false,
  volume: 0.8,
  fov: 80,
  load() {
    try {
      const s = JSON.parse(localStorage.getItem('bfr_settings') || '{}');
      Object.assign(this, { sensitivity: s.sensitivity ?? 1, invertY: !!s.invertY, volume: s.volume ?? 0.8, fov: s.fov ?? 80 });
    } catch { /* storage unavailable */ }
  },
  save() {
    try {
      localStorage.setItem('bfr_settings', JSON.stringify({ sensitivity: this.sensitivity, invertY: this.invertY, volume: this.volume, fov: this.fov }));
    } catch { /* storage unavailable */ }
  },
};

export class KeyboardMouse {
  constructor(canvas) {
    this.kind = 'kbm';
    this.label = 'Keyboard + Mouse';
    this.canvas = canvas;
    this.down = new Set();
    this.pressed = new Set();
    this.mdx = 0; this.mdy = 0;
    this.mouse = [false, false, false];
    this.mousePressed = [false, false, false];
    this.wheel = 0;
    this.locked = false;
    this.dragLook = false;

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => { this.down.clear(); this.mouse = [false, false, false]; });
    window.addEventListener('mousemove', (e) => {
      if (this.locked || (this.dragLook && (this.mouse[0] || this.mouse[2]))) {
        this.mdx += e.movementX || 0; this.mdy += e.movementY || 0;
      }
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button < 3) { this.mouse[e.button] = true; this.mousePressed[e.button] = true; }
    });
    window.addEventListener('mouseup', (e) => { if (e.button < 3) this.mouse[e.button] = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockerror', () => { this.dragLook = true; });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
  }

  requestLock() {
    try {
      const p = this.canvas.requestPointerLock?.();
      if (p && p.catch) p.catch(() => { this.dragLook = true; });
    } catch { this.dragLook = true; }
  }

  key(c) { return this.down.has(c); }
  hit(c) { return this.pressed.has(c); }

  poll(intent) {
    const k = (c) => this.down.has(c);
    const h = (c) => this.pressed.has(c);
    intent.moveZ = (k('KeyW') ? 1 : 0) - (k('KeyS') ? 1 : 0);
    intent.moveX = (k('KeyD') ? 1 : 0) - (k('KeyA') ? 1 : 0);
    const sens = 0.0022 * settings.sensitivity;
    intent.lookX = this.mdx * sens;
    intent.lookY = this.mdy * sens * (settings.invertY ? -1 : 1);
    this.mdx = 0; this.mdy = 0;
    intent.fire = this.mouse[0];
    intent.firePressed = this.mousePressed[0];
    intent.ads = this.mouse[2];
    intent.jump = h('Space');
    intent.crouch = k('KeyC');
    intent.crouchPressed = h('KeyC');
    intent.sprint = k('ShiftLeft') || k('ShiftRight');
    intent.reload = h('KeyR');
    intent.interact = k('KeyE');
    intent.interactPressed = h('KeyE');
    intent.slot = h('Digit1') ? 0 : h('Digit2') ? 1 : h('Digit3') ? 2 : -1;
    intent.cycle = this.wheel; this.wheel = 0;
    intent.molotov = h('KeyQ');
    intent.flare = h('KeyF');
    intent.melee = h('KeyV');
    intent.callin = h('KeyZ') || h('Digit4') ? 0 : h('KeyX') || h('Digit5') ? 1 : h('KeyB') || h('Digit6') ? 2 : -1;
    intent.pause = h('Escape') || h('KeyP');
    intent.surrender = k('KeyH');
    intent.menuUp = h('KeyW') || h('ArrowUp');
    intent.menuDown = h('KeyS') || h('ArrowDown');
    intent.menuOk = h('KeyE') || h('Enter') || h('Space');
    intent.menuBack = h('Escape') || h('Backspace') || h('KeyC');
    this.pressed.clear();
    this.mousePressed = [false, false, false];
    return intent;
  }
}

const DZ = 0.18;
const dz = (v) => (Math.abs(v) < DZ ? 0 : (v - Math.sign(v) * DZ) / (1 - DZ));

export class GamepadInput {
  constructor(index) {
    this.kind = 'pad';
    this.index = index;
    this.label = `Gamepad ${index + 1}`;
    this.prev = [];
    this.sprintToggle = false;
  }

  connected() { return !!navigator.getGamepads?.()[this.index]; }

  poll(intent, dt = 1 / 60) {
    const gp = navigator.getGamepads?.()[this.index];
    if (!gp) return intent;
    const b = gp.buttons.map((x) => (typeof x === 'object' ? x.pressed || x.value > 0.5 : x > 0.5));
    const p = (i) => b[i] && !this.prev[i];
    const ax = gp.axes;
    intent.moveX = dz(ax[0] || 0);
    intent.moveZ = -dz(ax[1] || 0);
    const lx = dz(ax[2] || 0), ly = dz(ax[3] || 0);
    const speed = 3.4 * settings.sensitivity * (b[6] ? 0.55 : 1);
    intent.lookX = Math.sign(lx) * lx * lx * speed * dt;
    intent.lookY = Math.sign(ly) * ly * ly * speed * 0.8 * dt * (settings.invertY ? -1 : 1);
    intent.fire = b[7];
    intent.firePressed = p(7);
    intent.ads = b[6];
    intent.jump = p(0);
    intent.crouch = b[1];
    intent.crouchPressed = p(1);
    if (p(10)) this.sprintToggle = !this.sprintToggle;
    if (Math.hypot(intent.moveX, intent.moveZ) < 0.3) this.sprintToggle = false;
    intent.sprint = this.sprintToggle;
    intent.interact = b[2];
    intent.interactPressed = p(2);
    intent.reload = p(2); // tap X reloads; holding X also interacts (player resolves priority)
    intent.cycle = p(3) ? 1 : 0;
    intent.slot = p(13) ? 2 : -1;
    intent.molotov = p(4);
    intent.flare = p(5);
    intent.melee = p(11);
    intent.callin = p(14) ? 0 : p(12) ? 1 : p(15) ? 2 : -1;
    intent.pause = p(9);
    intent.surrender = b[8];
    intent.menuUp = p(12) || (ax[1] < -0.6 && !(this.prevAx1 < -0.6));
    intent.menuDown = p(13) || (ax[1] > 0.6 && !(this.prevAx1 > 0.6));
    intent.menuOk = p(0);
    intent.menuBack = p(1);
    this.prevAx1 = ax[1];
    this.prev = b;
    return intent;
  }
}
