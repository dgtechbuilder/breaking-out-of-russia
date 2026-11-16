// On-screen touch controls for phones and tablets.
// Left thumb: floating joystick (push to the edge to sprint). Right thumb: drag anywhere to look;
// dragging from the FIRE button also aims, so you can shoot and steer in one motion.
import { settings } from './input.js';

const BTNS = [
  { id: 'fire', label: 'FIRE', cls: 'big' },
  { id: 'ads', label: 'AIM' },
  { id: 'jump', label: 'JUMP' },
  { id: 'crouch', label: 'CROUCH' },
  { id: 'roll', label: 'ROLL' },
  { id: 'reload', label: 'RELOAD', cls: 'small' },
  { id: 'swap', label: 'SWAP', cls: 'small' },
  { id: 'melee', label: 'MELEE', cls: 'small' },
  { id: 'molotov', label: 'MOLOTOV', cls: 'small gadget' },
  { id: 'flare', label: 'FLARE', cls: 'small gadget' },
  { id: 'use', label: 'USE', cls: 'use' },
  { id: 'pause', label: 'II', cls: 'pause' },
];

export class TouchInput {
  constructor() {
    this.kind = 'touch';
    this.enabled = settings.mode === 'mobile';
    this.lastActive = 0;
    this.visible = false;
    this.move = null; // {id, ox, oy, x, y}
    this.looks = new Map(); // touch id -> {x, y}
    this.btnTouches = new Map(); // touch id -> button id
    this.held = new Set();
    this.pressed = new Set();
    this.lookDX = 0; this.lookDY = 0;
    this.adsOn = false; this.crouchOn = false;
    this.mx = 0; this.mz = 0; this.sprint = false;

    const el = document.createElement('div');
    el.id = 'touchui';
    const RIGHT = ['fire', 'ads', 'jump', 'crouch', 'roll', 'reload', 'swap', 'melee', 'use'];
    const btn = (b) => `<button class="tb ${b.cls || ''}" data-btn="${b.id}" type="button">${b.label}</button>`;
    el.innerHTML = `<div class="stick"><div class="knob"></div></div>
      <div class="rc">${BTNS.filter((b) => RIGHT.includes(b.id)).map(btn).join('')}</div>
      <div class="lc">${BTNS.filter((b) => !RIGHT.includes(b.id)).map(btn).join('')}</div>`;
    const fit = () => el.style.setProperty('--ts', String(Math.max(0.62, Math.min(1, window.innerHeight / 440))));
    window.addEventListener('resize', fit); fit();
    document.body.appendChild(el);
    this.el = el;
    this.stick = el.querySelector('.stick');
    this.knob = el.querySelector('.knob');
    this.btnEls = Object.fromEntries([...el.querySelectorAll('[data-btn]')].map((b) => [b.dataset.btn, b]));

    // Pointer events: works with fingers, and with a mouse when Mobile mode is picked on a PC.
    const wrap = (e) => ({ changedTouches: [{ identifier: e.pointerId, clientX: e.clientX, clientY: e.clientY, target: e.target }], preventDefault: () => e.preventDefault() });
    el.addEventListener('pointerdown', (e) => {
      try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      this.onStart(wrap(e));
    });
    el.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'touch') this.onMove(wrap(e)); });
    el.addEventListener('pointerup', (e) => this.onEnd(wrap(e)));
    el.addEventListener('pointercancel', (e) => this.onEnd(wrap(e)));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    this.refresh();
  }

  setEnabled(v) { this.enabled = v; if (!v) this.reset(); this.refresh(); }
  setVisible(v) { this.visible = v; this.refresh(); if (!v) this.reset(); }
  refresh() {
    const on = this.enabled && this.visible;
    this.el.style.display = on ? 'block' : 'none';
    document.body.classList.toggle('touch', this.enabled);
  }

  reset() {
    this.move = null; this.looks.clear(); this.btnTouches.clear(); this.held.clear();
    this.mx = this.mz = 0; this.sprint = false;
    this.stick.style.display = 'none';
  }

  setPrompt(show) { this.btnEls.use.classList.toggle('show', !!show); }
  setAds(on) { this.btnEls.ads.classList.toggle('on', on); }

  onStart(e) {
    e.preventDefault();
    this.lastActive = performance.now();
    for (const t of e.changedTouches) {
      const b = t.target.closest?.('[data-btn]');
      if (b) {
        const id = b.dataset.btn;
        this.btnTouches.set(t.identifier, id);
        this.held.add(id);
        this.pressed.add(id);
        b.classList.add('down');
        // Every action button doubles as a look pad: press it and slide your thumb to turn.
        if (id !== 'pause') this.looks.set(t.identifier, { x: t.clientX, y: t.clientY });
        continue;
      }
      if (!this.move && t.clientX < window.innerWidth * 0.42) {
        this.move = { id: t.identifier, ox: t.clientX, oy: t.clientY };
        this.stick.style.display = 'block';
        this.stick.style.left = t.clientX + 'px';
        this.stick.style.top = t.clientY + 'px';
        this.knob.style.transform = 'translate(-50%, -50%)';
      } else {
        this.looks.set(t.identifier, { x: t.clientX, y: t.clientY });
      }
    }
  }

  onMove(e) {
    e.preventDefault();
    this.lastActive = performance.now();
    const R = 58;
    for (const t of e.changedTouches) {
      if (this.move && t.identifier === this.move.id) {
        let dx = t.clientX - this.move.ox, dy = t.clientY - this.move.oy;
        const d = Math.hypot(dx, dy);
        this.sprint = d > R * 1.35 && -dy > Math.abs(dx) * 0.6;
        if (d > R) {
          // Floating stick: drag the base along with the thumb.
          const over = d - R;
          this.move.ox += (dx / d) * over * (this.sprint ? 0.35 : 1);
          this.move.oy += (dy / d) * over * (this.sprint ? 0.35 : 1);
          dx = t.clientX - this.move.ox; dy = t.clientY - this.move.oy;
          this.stick.style.left = this.move.ox + 'px';
          this.stick.style.top = this.move.oy + 'px';
        }
        const k = Math.min(1, Math.hypot(dx, dy) / R);
        const L = Math.hypot(dx, dy) || 1;
        this.mx = (dx / L) * k; this.mz = (-dy / L) * k;
        const kx = Math.max(-R, Math.min(R, dx)), ky = Math.max(-R, Math.min(R, dy));
        this.knob.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;
        continue;
      }
      const l = this.looks.get(t.identifier);
      if (l) {
        this.lookDX += t.clientX - l.x; this.lookDY += t.clientY - l.y;
        l.x = t.clientX; l.y = t.clientY;
      }
    }
  }

  onEnd(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (this.move && t.identifier === this.move.id) {
        this.move = null; this.mx = this.mz = 0; this.sprint = false;
        this.stick.style.display = 'none';
      }
      this.looks.delete(t.identifier);
      const id = this.btnTouches.get(t.identifier);
      if (id) {
        this.btnTouches.delete(t.identifier);
        if (![...this.btnTouches.values()].includes(id)) { this.held.delete(id); this.btnEls[id]?.classList.remove('down'); }
      }
    }
  }

  poll(intent) {
    const h = (id) => this.pressed.has(id);
    const k = (id) => this.held.has(id);
    intent.moveX = this.mx; intent.moveZ = this.mz;
    intent.sprint = this.sprint;
    const sens = 0.0055 * settings.touchSensitivity;
    intent.lookX = this.lookDX * sens;
    intent.lookY = this.lookDY * sens * 0.85 * (settings.invertY ? -1 : 1);
    this.lookDX = this.lookDY = 0;
    intent.fire = k('fire'); intent.firePressed = h('fire');
    if (h('ads')) { this.adsOn = !this.adsOn; intent.adsPressed = this.adsOn; }
    intent.ads = this.adsOn;
    intent.jump = h('jump');
    if (h('crouch')) {
      if (this.sprint) { intent.crouchPressed = true; this.crouchOn = false; }
      else this.crouchOn = !this.crouchOn;
    }
    intent.crouch = this.crouchOn;
    intent.roll = h('roll');
    if (intent.roll || intent.jump) this.crouchOn = false;
    intent.reload = h('reload');
    intent.cycle = h('swap') ? 1 : 0;
    intent.melee = h('melee');
    intent.molotov = h('molotov');
    intent.flare = h('flare');
    intent.interact = k('use'); intent.interactPressed = h('use');
    intent.pause = h('pause');
    intent.menuOk = h('use'); intent.menuBack = h('pause');
    this.pressed.clear();
    this.btnEls.crouch.classList.toggle('on', this.crouchOn);
    this.setAds(this.adsOn);
    return intent;
  }
}
