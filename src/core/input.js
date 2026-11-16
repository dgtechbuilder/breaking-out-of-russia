// Input sources produce a uniform "intent" each frame so humans on keyboard/mouse,
// gamepads and touch screens drive the same Player code.

export function blankIntent() {
  return {
    moveX: 0, moveZ: 0, lookX: 0, lookY: 0,
    fire: false, firePressed: false, ads: false, adsPressed: false,
    jump: false, crouch: false, crouchPressed: false, sprint: false, roll: false,
    reload: false, interact: false, interactPressed: false,
    slot: -1, cycle: 0, molotov: false, flare: false, melee: false,
    callin: -1, pause: false, surrender: false,
    menuUp: false, menuDown: false, menuOk: false, menuBack: false,
  };
}

export const isTouchDevice = () => {
  try { return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1; } catch { return false; }
};

const DEFAULTS = {
  sensitivity: 1.0, padSensitivity: 1.0, touchSensitivity: 1.0, invertY: false, volume: 0.8, fov: 80,
  aimAssist: 'auto', // auto | off | light | strong
  autoFire: 'auto', // auto (on for touch) | on | off
  rumble: true,
  quality: 'auto', // auto | high | low
  playMode: 'auto', // auto (detect) | pc | mobile — chosen on the briefing screen
};

export const settings = {
  ...DEFAULTS,
  load() {
    try {
      const s = JSON.parse(localStorage.getItem('bfr_settings') || '{}');
      for (const k of Object.keys(DEFAULTS)) if (s[k] !== undefined) this[k] = s[k];
    } catch { /* storage unavailable */ }
  },
  save() {
    try {
      const o = {};
      for (const k of Object.keys(DEFAULTS)) o[k] = this[k];
      localStorage.setItem('bfr_settings', JSON.stringify(o));
    } catch { /* storage unavailable */ }
  },
  /** 'pc' or 'mobile'. Auto picks mobile on touch-first devices. */
  get mode() { return this.playMode === 'pc' || this.playMode === 'mobile' ? this.playMode : (isTouchDevice() ? 'mobile' : 'pc'); },
  get lowQuality() { return this.quality === 'low' || (this.quality === 'auto' && this.mode === 'mobile'); },
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
    this.lastActive = 0;
    this.lastTap = {};
    this.rollQueued = false;

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow') || e.code.startsWith('Alt')) e.preventDefault();
      this.lastActive = performance.now();
      if (!e.repeat && !this.down.has(e.code)) {
        this.pressed.add(e.code);
        // Double-tap a movement key to roll that way.
        if (['KeyA', 'KeyD', 'KeyS', 'KeyW'].includes(e.code)) {
          const now = performance.now();
          if (now - (this.lastTap[e.code] || 0) < 260) this.rollQueued = true;
          this.lastTap[e.code] = now;
        }
      }
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => { if (e.code.startsWith('Alt')) e.preventDefault(); this.down.delete(e.code); });
    window.addEventListener('blur', () => { this.down.clear(); this.mouse = [false, false, false]; });
    window.addEventListener('mousemove', (e) => {
      if (this.locked || this.dragLook) {
        this.mdx += e.movementX || 0; this.mdy += e.movementY || 0;
        // Browsers send synthetic zero-movement events; only real movement counts as activity.
        if (Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0) > 1) this.lastActive = performance.now();
      }
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button < 3) { this.mouse[e.button] = true; this.mousePressed[e.button] = true; this.lastActive = performance.now(); }
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
    intent.adsPressed = this.mousePressed[2];
    intent.jump = h('Space');
    intent.crouch = k('KeyC');
    intent.crouchPressed = h('KeyC');
    intent.sprint = k('ShiftLeft') || k('ShiftRight');
    intent.roll = h('AltLeft') || h('AltRight') || this.rollQueued;
    this.rollQueued = false;
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

const DZ = 0.16;
const dz = (v) => (Math.abs(v) < DZ ? 0 : (v - Math.sign(v) * DZ) / (1 - DZ));

export function padTypeOf(id = '') {
  const s = id.toLowerCase();
  if (s.includes('054c') || s.includes('playstation') || s.includes('dualshock') || s.includes('dualsense') || s.includes('wireless controller')) return 'ps';
  if (s.includes('057e') || s.includes('nintendo') || s.includes('pro controller')) return 'switch';
  return 'xbox';
}

/**
 * Gamepad (standard mapping). Layout:
 * LS move · RS look · RT fire · LT aim · A jump · B roll (moving) / slide (sprinting) / crouch (hold)
 * X reload, hold to interact · Y swap · LB Molotov · RB flare · L3 sprint · R3 melee
 * D-pad: left/up/right call-ins, down RPG · Start pause
 */
export class GamepadInput {
  constructor(index) {
    this.kind = 'pad';
    this.index = index;
    this.label = `Gamepad ${index + 1}`;
    this.prev = [];
    this.sprintToggle = false;
    this.bHeld = 0;
    this.lastActive = 0;
    this.lookVel = 0;
  }

  get gp() { return navigator.getGamepads?.()[this.index] || null; }
  connected() { return !!this.gp; }
  padType() { return padTypeOf(this.gp?.id); }
  activeKind() { return 'pad'; }

  rumble(strong = 0.5, weak = 0.5, ms = 120) {
    if (!settings.rumble) return;
    const a = this.gp?.vibrationActuator;
    try { a?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }); } catch { /* unsupported */ }
  }

  poll(intent, dt = 1 / 60) {
    const gp = this.gp;
    if (!gp) return intent;
    const b = gp.buttons.map((x) => (typeof x === 'object' ? x.pressed || x.value > 0.5 : x > 0.5));
    const p = (i) => b[i] && !this.prev[i];
    const ax = gp.axes;
    intent.moveX = dz(ax[0] || 0);
    intent.moveZ = -dz(ax[1] || 0);
    const lx = dz(ax[2] || 0), ly = dz(ax[3] || 0);
    // Response curve + a little acceleration when the stick is held at full tilt.
    const mag = Math.hypot(lx, ly);
    this.lookVel = mag > 0.95 ? Math.min(1, this.lookVel + dt * 1.6) : Math.max(0, this.lookVel - dt * 4);
    const speed = 3.0 * settings.padSensitivity * (b[6] ? 0.7 : 1) * (1 + this.lookVel * 0.6);
    intent.lookX = Math.sign(lx) * Math.pow(Math.abs(lx), 1.8) * speed * dt;
    intent.lookY = Math.sign(ly) * Math.pow(Math.abs(ly), 1.8) * speed * 0.75 * dt * (settings.invertY ? -1 : 1);
    const moving = Math.hypot(intent.moveX, intent.moveZ) > 0.35;
    intent.fire = b[7];
    intent.firePressed = p(7);
    intent.ads = b[6];
    intent.adsPressed = p(6);
    intent.jump = p(0);
    if (p(10)) this.sprintToggle = !this.sprintToggle;
    if (Math.hypot(intent.moveX, intent.moveZ) < 0.3) this.sprintToggle = false;
    intent.sprint = this.sprintToggle;
    // B: slide while sprinting, roll while moving, crouch when held/standing still.
    this.bHeld = b[1] ? this.bHeld + dt : 0;
    intent.crouchPressed = p(1) && this.sprintToggle;
    intent.roll = p(1) && moving && !this.sprintToggle;
    intent.crouch = b[1] && (!moving || this.bHeld > 0.3);
    if (intent.roll || intent.crouchPressed) this.sprintToggle = false;
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
    if (b.some(Boolean) || mag > 0 || Math.hypot(intent.moveX, intent.moveZ) > 0) this.lastActive = performance.now();
    this.prevAx1 = ax[1];
    this.prev = b;
    return intent;
  }
}

/** Merge src into dst: analog values add, booleans OR, discrete picks take the first set. */
function mergeIntent(dst, src) {
  dst.moveX = Math.max(-1, Math.min(1, dst.moveX + src.moveX));
  dst.moveZ = Math.max(-1, Math.min(1, dst.moveZ + src.moveZ));
  dst.lookX += src.lookX; dst.lookY += src.lookY;
  for (const k of ['fire', 'firePressed', 'ads', 'adsPressed', 'jump', 'crouch', 'crouchPressed', 'sprint', 'roll', 'reload', 'interact', 'interactPressed', 'molotov', 'flare', 'melee', 'pause', 'surrender', 'menuUp', 'menuDown', 'menuOk', 'menuBack']) dst[k] = dst[k] || src[k];
  if (dst.slot < 0) dst.slot = src.slot;
  dst.cycle += src.cycle;
  if (dst.callin < 0) dst.callin = src.callin;
}

/**
 * Player 1's input: keyboard/mouse, any controller not claimed by another player,
 * and the touch overlay all work at once. The most recently used one decides
 * button prompts and aim-assist strength.
 */
export class HybridInput {
  constructor(kbm, freePads, touch) {
    this.kbm = kbm;
    this.freePads = freePads; // () => array of gamepad indices not used by P2-P4
    this.touch = touch;
    this.pads = new Map();
    this.kind = 'hybrid';
    this.label = 'Keyboard, mouse, controller or touch';
    this._tmp = blankIntent();
    this.lastPad = null;
  }

  poll(intent, dt) {
    this.kbm.poll(intent, dt);
    for (const i of this.freePads()) {
      let p = this.pads.get(i);
      if (!p) { p = new GamepadInput(i); this.pads.set(i, p); }
      const t = Object.assign(this._tmp, blankIntent());
      p.poll(t, dt);
      if (p.lastActive > (this.lastPad?.lastActive || 0)) this.lastPad = p;
      mergeIntent(intent, t);
    }
    if (this.touch && this.touch.enabled) {
      const t = Object.assign(this._tmp, blankIntent());
      this.touch.poll(t, dt);
      mergeIntent(intent, t);
    }
    return intent;
  }

  activeKind() {
    const k = this.kbm.lastActive, p = this.lastPad?.lastActive || 0, t = this.touch?.enabled ? this.touch.lastActive : 0;
    if (t >= k && t >= p && t > 0) return 'touch';
    if (p > k) return 'pad';
    return 'kbm';
  }

  padType() { return this.lastPad ? this.lastPad.padType() : 'xbox'; }
  rumble(s, w, ms) { if (this.activeKind() === 'pad') this.lastPad?.rumble(s, w, ms); }
}
