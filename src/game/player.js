// Human-controlled squad member (keyboard/mouse or gamepad).
import * as THREE from 'three';
import { Actor, moveActor } from './actors.js';
import { Weapon, WEAPONS } from './weapons.js';
import { makeViewmodel, sightHeight } from './viewmodel.js';
import { makeHumanoid, setHeldGun, animateHumanoid } from '../core/models.js';
import { blankIntent, settings } from '../core/input.js';
import { clamp, damp, lerp, dirFromYawPitch, rand, setLayer, dist2D } from '../core/util.js';
import { audio } from '../core/audio.js';

export const PLAYER_LOOKS = [
  { name: 'Emeka', from: 'Nigeria', skin: 0x4a2c1a, top: 0xc0302a, pants: 0x3a3a3c, hat: 'braids', band: 0xff5a36 },
  { name: 'Kofi', from: 'Ghana', skin: 0x3b2417, top: 0x5b2d8c, pants: 0x2f3d33, hat: 'beanie', hatColor: 0x1e5aa8, band: 0x35d07f },
  { name: 'Tendai', from: 'Zimbabwe', skin: 0x5a3620, top: 0x2a6e8c, pants: 0x4a4030, hat: 'cap', hatColor: 0xd6a21e, band: 0xffd23a },
  { name: 'Moussa', from: 'Senegal', skin: 0x2e1c12, top: 0x6b6f3a, pants: 0x30302c, hat: null, band: 0x3ac8ff },
];

const _v = new THREE.Vector3(), _d = new THREE.Vector3();

export class Player extends Actor {
  constructor(game, index, input, look) {
    super(game, 'squad');
    this.isHuman = true;
    this.index = index;
    this.input = input;
    this.intent = blankIntent();
    this.look = look;
    this.name = look.name;
    this.color = look.band;
    this.hp = this.maxHp = 100;

    this.camera = new THREE.PerspectiveCamera(settings.fov, 16 / 9, 0.05, 900);
    this.camera.rotation.order = 'YXZ';
    this.camera.layers.enable(0);
    for (let i = 0; i < 4; i++) if (i !== index) this.camera.layers.enable(10 + i);
    this.camera.layers.disable(10 + index);

    this.vmScene = new THREE.Scene();
    this.vmCam = new THREE.PerspectiveCamera(58, 16 / 9, 0.01, 10);
    this.vmAmb = new THREE.HemisphereLight(0xdde6ff, 0x3a3020, 1.4);
    this.vmSun = new THREE.DirectionalLight(0xfff0d8, 1.6);
    this.vmSun.position.set(0.5, 1, 0.3);
    this.vmScene.add(this.vmAmb, this.vmSun);
    this.vmHolder = new THREE.Group();
    this.vmScene.add(this.vmHolder);
    this.vm = null;

    this.body = makeHumanoid({ skin: look.skin, top: look.top, pants: look.pants, hat: look.hat, hatColor: look.hatColor, band: look.band, band2: look.band });
    setLayer(this.body, 10 + index);
    game.scene.add(this.body);

    this.weapons = [new Weapon('shovel'), null, null];
    this.cur = 0;
    this.molotovs = 1;
    this.flares = 0;

    this.ads = 0; this.recoilP = 0; this.recoilY = 0; this.bloom = 0;
    this.kick = 0; this.swayX = 0; this.swayY = 0; this.bobT = 0; this.sprintAmt = 0;
    this.switchT = 0; this.reloadT = 0; this.reloadTotal = 1; this.meleeT = 0; this.flashT = 0;
    this.gadget = null;
    this.slideDir = new THREE.Vector3(); this.slideSpeed = 0;
    this.camY = 1.62; this.shake = 0;
    this.sprinting = false; this.noSprintT = 0;
    this.hold = { key: null, t: 0 };
    this.prompt = null;
    this.ui = null; // workbench menu
    this.respawnT = 0;
    this.regenT = 0;
    this.hitmarker = 0; this.hitKill = false;
    this.dmgDirs = [];
    this.stats = { kills: 0, headshots: 0, revives: 0, downs: 0, shots: 0, hits: 0, bestChain: 0 };
    this.viewport = { x: 0, y: 0, w: 1, h: 1 };
    this.driving = false;
    this.surrendered = false;
    this.rebuildViewmodel();
  }

  get weapon() { return this.weapons[this.cur]; }

  rebuildViewmodel() {
    if (this.vm) this.vmHolder.remove(this.vm);
    const w = this.gadget ? { type: this.gadget.type, att: {} } : this.weapon;
    this.vm = makeViewmodel(w.type, w.att, this.look.top, this.look.skin);
    this.vm.scale.setScalar(0.9);
    this.vmHolder.add(this.vm);
    this.vmType = w.type;
    const tw = this.weapon;
    setHeldGun(this.body, tw.type === 'shovel' ? null : tw.type, tw.att);
    setLayer(this.body, 10 + this.index);
  }

  giveWeapon(w) {
    const slot = w.def.slot;
    const old = this.weapons[slot];
    this.weapons[slot] = w;
    this.switchTo(slot, true);
    if (old && old.type === 'shovel') return null;
    return old;
  }

  switchTo(slot, force = false) {
    if (!this.weapons[slot] || (slot === this.cur && !force)) return;
    this.cur = slot;
    this.switchT = 0.35;
    this.reloadT = 0;
    this.rebuildViewmodel();
  }

  cycle(dir) {
    for (let i = 1; i <= 3; i++) {
      const s = (this.cur + dir * i + 6) % 3;
      if (this.weapons[s]) { this.switchTo(s); return; }
    }
  }

  setDowned(v) {
    if (v) {
      if (this.weapons[1] && this.cur !== 1) this.switchTo(1);
      this.ads = 0;
      this.sliding = 0;
      this.reloadT = 0;
      this.ui = null;
    }
  }

  update(dt) {
    const g = this.game;
    const it = this.intent;
    if (this.input) this.input.poll(it, dt);
    this.hitmarker = Math.max(0, this.hitmarker - dt);
    this.shake = Math.max(0, this.shake - dt * 2.5);
    if (this.hurtT > 0) this.hurtT -= dt;
    if (this.blind > 0) this.blind -= dt;

    if (this.dead) { this.updateDead(dt); return; }

    if (this.ui) {
      this.ui.handle(it);
      it.moveX = it.moveZ = 0; it.fire = it.firePressed = it.ads = false; it.jump = false;
      it.lookX = it.lookY = 0; it.interactPressed = false; it.interact = false;
      it.reload = false; it.molotov = it.flare = it.melee = false; it.callin = -1; it.slot = -1; it.cycle = 0;
    }

    if (this.driving) { this.updateDriving(dt); return; }

    // ---------------- Look ----------------
    const w = this.weapon;
    const zoom = lerp(1, w.adsZoom || 1, this.ads);
    this.yaw -= it.lookX / zoom;
    this.pitch = clamp(this.pitch - it.lookY / zoom, -1.45, 1.45);

    // ---------------- Health ----------------
    if (!this.downed) {
      this.regenT -= dt;
      if (this.regenT <= 0 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + 22 * dt);
    }
    if (this.armorT > 0) { this.armorT -= dt; if (this.armorT <= 0) this.armor = 0; }

    // ---------------- Movement ----------------
    const fwdX = -Math.sin(this.yaw), fwdZ = -Math.cos(this.yaw);
    const rX = Math.cos(this.yaw), rZ = -Math.sin(this.yaw);
    let mx = it.moveX, mz = it.moveZ;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    const wishX = fwdX * mz + rX * mx, wishZ = fwdZ * mz + rZ * mx;

    this.noSprintT = Math.max(0, this.noSprintT - dt);
    this.sprinting = it.sprint && mz > 0.3 && !this.downed && this.ads < 0.3 && this.noSprintT <= 0 && !this.crouch;
    if (this.sprinting && this.reloadT > 0 && w.def.slot !== 1) this.sprinting = it.sprint && mz > 0.3;
    let speed = this.sprinting ? 8.3 : 5.4;
    if (this.crouch) speed = 2.9;
    speed *= lerp(1, 0.55, this.ads) * (w.def.moveMult || 1);
    if (this.downed) speed = 0.9;

    // Slide
    if (it.crouchPressed && this.sprinting && this.onGround && this.sliding <= 0) {
      this.sliding = 0.8;
      const hv = Math.hypot(this.vel.x, this.vel.z) || 1;
      this.slideDir.set(this.vel.x / hv, 0, this.vel.z / hv);
      this.slideSpeed = 11.5;
      audio.play('melee', this.pos, 0.35);
    }
    if (this.sliding > 0) {
      this.sliding -= dt;
      this.slideSpeed = Math.max(4, this.slideSpeed - 9 * dt);
      this.vel.x = this.slideDir.x * this.slideSpeed;
      this.vel.z = this.slideDir.z * this.slideSpeed;
      if (it.jump && this.onGround) { this.sliding = 0; this.vel.y = 5.8; }
      if (this.sliding <= 0) this.crouch = it.crouch;
    } else {
      if (!it.crouchPressed || !this.sprinting) this.crouch = !this.downed && it.crouch;
      const accel = this.onGround ? 14 : 3;
      this.vel.x = damp(this.vel.x, wishX * speed, accel, dt);
      this.vel.z = damp(this.vel.z, wishZ * speed, accel, dt);
      if (it.jump && this.onGround && !this.downed) { this.vel.y = 5.8; this.crouch = false; }
    }
    if (this.mountedBounds) {
      const b = this.mountedBounds;
      this.pos.x = clamp(this.pos.x, b.x0, b.x1); this.pos.z = clamp(this.pos.z, b.z0, b.z1);
    }
    moveActor(g.world, this, dt);
    if (this.onGround && Math.hypot(this.vel.x, this.vel.z) > 1) this.bobT += dt * Math.hypot(this.vel.x, this.vel.z) * 1.15;

    // ---------------- Interact ----------------
    this.prompt = g.findInteractable(this);
    const pr = this.prompt;
    if (pr) {
      if (pr.hold) {
        if (it.interact) {
          if (this.hold.key !== pr.key) { this.hold.key = pr.key; this.hold.t = 0; }
          this.hold.t += dt;
          if (pr.onHold) pr.onHold(this, dt);
          if (this.hold.t >= pr.hold) { this.hold.t = 0; this.hold.key = null; pr.action(this); }
        } else { this.hold.t = 0; this.hold.key = null; }
      } else if (it.interactPressed) {
        pr.action(this);
      }
    } else { this.hold.t = 0; this.hold.key = null; }
    const padReloadBlocked = this.input && this.input.kind === 'pad' && pr;

    // ---------------- Weapons ----------------
    if (!this.downed || this.cur === 1) {
      if (it.slot >= 0 && !this.downed) this.switchTo(it.slot);
      if (it.cycle && !this.downed) this.cycle(it.cycle > 0 ? 1 : -1);
    }
    this.switchT = Math.max(0, this.switchT - dt);
    this.meleeT = Math.max(0, this.meleeT - dt);
    w.cool = Math.max(0, w.cool - dt);
    if (this.gadget) { this.gadget.t -= dt; if (this.gadget.t <= 0) { this.gadget = null; this.rebuildViewmodel(); } }

    const canUse = !this.downed || this.cur === 1;
    const wantAds = it.ads && canUse && !w.def.melee && this.switchT <= 0 && !this.gadget && (!this.sprinting);
    this.ads = damp(this.ads, wantAds ? 1 : 0, 16, dt);

    // Reload
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        const need = w.magSize - w.mag;
        const take = Math.min(need, w.reserve);
        w.mag += take; w.reserve -= take;
      }
    } else if (!w.def.melee && it.reload && !padReloadBlocked && w.mag < w.magSize && w.reserve > 0 && canUse) {
      this.startReload();
    }

    // Fire
    if (canUse && !w.def.melee && this.switchT <= 0 && this.reloadT <= 0 && !this.gadget && !this.ui) {
      const trig = w.def.auto ? it.fire : it.firePressed;
      if (trig && w.cool <= 0) {
        if (w.mag <= 0) {
          if (w.reserve > 0) this.startReload();
          else if (it.firePressed) audio.play('empty', null, 0.6);
        } else {
          w.mag--;
          w.cool = 60 / w.def.rpm;
          this.fire(w);
        }
      }
    } else if (canUse && w.def.melee && (it.firePressed) && this.meleeT <= 0 && !this.ui) {
      this.doMelee();
    }
    if (it.melee && this.meleeT <= 0 && !this.downed && !this.ui) this.doMelee();
    this.bloom = Math.max(0, this.bloom - dt * 0.12);
    this.recoilP = damp(this.recoilP, 0, 7, dt);
    this.recoilY = damp(this.recoilY, 0, 9, dt);
    this.kick = damp(this.kick, 0, 18, dt);

    // Equipment
    if (it.molotov && this.molotovs > 0 && !this.downed && !this.gadget) {
      this.molotovs--;
      this.gadget = { type: 'molotov', t: 0.45 };
      this.rebuildViewmodel();
      g.throwMolotov(this);
    }
    if (it.flare && this.flares > 0 && !this.downed && !this.gadget) {
      this.flares--;
      this.gadget = { type: 'flaregun', t: 0.55 };
      this.rebuildViewmodel();
      g.fireFlare(this);
    }
    if (it.callin >= 0 && !this.downed) g.momentum.activate(it.callin, this);
    if (it.pause) g.requestPause();

    this.updateCamera(dt);
    this.updateBody(dt);
  }

  startReload() {
    const w = this.weapon;
    this.reloadTotal = w.reloadTime;
    this.reloadT = this.reloadTotal;
    audio.play('reload', null, 0.6);
  }

  fire(w) {
    const g = this.game;
    this.stats.shots++;
    const moving = Math.hypot(this.vel.x, this.vel.z) > 1 ? 0.018 : 0;
    let spread = lerp(w.spreadHip + moving + this.bloom, w.spreadAds + this.bloom * 0.35, this.ads);
    if (!this.onGround) spread += 0.03;
    if (this.sliding > 0) spread += 0.01;
    if (this.downed) spread += 0.02;
    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    const dir = this.camera.getWorldDirection(new THREE.Vector3());
    g.playerFire(this, w, origin, dir, spread);
    const rk = w.def.recoil * (this.ads > 0.5 ? 0.65 : 1) * (this.crouch ? 0.8 : 1);
    this.recoilP += rk;
    this.recoilY += rand(-rk, rk) * 0.6;
    this.bloom = Math.min(0.06, this.bloom + (w.def.auto ? 0.006 : 0.012));
    this.kick = 1;
    this.flashT = w.suppressed ? 0 : 0.045;
    this.noSprintT = 0.35;
    if (w.def.projectile) this.shake = Math.max(this.shake, 0.35);
  }

  doMelee() {
    this.meleeT = 0.55;
    this.game.playerMelee(this);
  }

  updateDead(dt) {
    this.respawnT -= dt;
    // Spectate a living squadmate.
    const s = this.game.squad.find((m) => !m.dead && !m.downed && m !== this) || this.game.squad.find((m) => !m.dead && m !== this);
    if (s) {
      const back = dirFromYawPitch(s.yaw, -0.3, _d);
      this.camera.position.set(s.pos.x - back.x * 3.2, s.pos.y + 2.6, s.pos.z - back.z * 3.2);
      this.camera.lookAt(s.pos.x, s.pos.y + 1.2, s.pos.z);
    }
    this.body.visible = true;
    if (this.respawnT <= 0 && s && !s.downed) this.game.respawnPlayer(this, s);
  }

  updateDriving(dt) {
    const it = this.intent;
    this.yaw -= it.lookX; this.pitch = clamp(this.pitch - it.lookY, -0.6, 0.5);
    this.yaw = clamp(this.yaw, -1.6, 1.6);
    if (it.interactPressed) this.game.stage.toggleDrive?.(this);
    if (it.callin >= 0) this.game.momentum.activate(it.callin, this);
    if (it.pause) this.game.requestPause();
    const t = this.game.truck;
    if (t) {
      this.camera.position.set(t.pos.x - 0.6, 2.75, -1.1);
      this.camera.rotation.set(this.pitch, this.yaw, 0);
    }
    this.camera.fov = settings.fov;
    this.camera.updateProjectionMatrix();
    this.prompt = { text: 'Drive: [W/S] speed · [A/D] steer · [E] back to the truck bed' };
    this.vmHolder.visible = false;
    this.body.visible = false;
  }

  updateCamera(dt) {
    const w = this.weapon;
    this.camY = damp(this.camY, this.eyeH, 14, dt);
    const bobA = this.onGround ? Math.min(1, Math.hypot(this.vel.x, this.vel.z) / 6) * (1 - this.ads * 0.85) : 0;
    const by = Math.sin(this.bobT * 2) * 0.035 * bobA;
    const bx = Math.cos(this.bobT) * 0.025 * bobA;
    const c = this.camera;
    c.position.set(this.pos.x + Math.cos(this.yaw) * bx, this.pos.y + this.camY + by, this.pos.z - Math.sin(this.yaw) * bx);
    const sh = this.shake * this.shake;
    c.rotation.set(
      this.pitch + this.recoilP + (Math.random() - 0.5) * sh * 0.08,
      this.yaw + this.recoilY + (Math.random() - 0.5) * sh * 0.08,
      this.sliding > 0 ? 0.06 : (this.downed ? 0.25 : 0),
    );
    const fov = settings.fov / lerp(1, w.adsZoom || 1, this.ads);
    if (Math.abs(c.fov - fov) > 0.01) { c.fov = fov; c.updateProjectionMatrix(); }
    this.vmCam.fov = lerp(58, 46, this.ads);
    this.vmCam.updateProjectionMatrix();

    // Viewmodel pose
    const vm = this.vm;
    if (!vm) return;
    this.vmHolder.visible = true;
    const it = this.intent;
    this.swayX = damp(this.swayX, clamp(-it.lookX * 1.5, -0.06, 0.06), 10, dt);
    this.swayY = damp(this.swayY, clamp(it.lookY * 1.5, -0.06, 0.06), 10, dt);
    this.sprintAmt = damp(this.sprintAmt, this.sprinting && this.reloadT <= 0 ? 1 : 0, 10, dt);
    const type = this.vmType;
    const sh2 = sightHeight(type, (this.gadget ? {} : w.att));
    const ads = this.gadget ? 0 : this.ads;
    const hip = type === 'makarov' || type === 'flaregun' ? [0.17, -0.17, -0.38] : type === 'rpg' ? [0.2, -0.13, -0.3] : type === 'shovel' ? [0.25, -0.25, -0.35] : type === 'molotov' ? [0.2, -0.2, -0.35] : [0.2, -0.215, -0.42];
    const adsP = [0, -sh2, type === 'makarov' ? -0.32 : type === 'rpg' ? -0.2 : -0.24];
    let x = lerp(hip[0], adsP[0], ads), y = lerp(hip[1], adsP[1], ads), z = lerp(hip[2], adsP[2], ads);
    let rx = 0, ry = 0, rz = 0;
    // bob + sway
    x += Math.cos(this.bobT) * 0.012 * bobA + this.swayX * (1 - ads * 0.7);
    y += Math.abs(Math.sin(this.bobT)) * 0.012 * bobA + this.swayY * (1 - ads * 0.7);
    // sprint
    rx += -0.25 * this.sprintAmt; ry += 0.7 * this.sprintAmt; x -= 0.04 * this.sprintAmt; y -= 0.05 * this.sprintAmt;
    // recoil
    z += this.kick * (type === 'rpg' ? 0.12 : 0.045); rx += this.kick * (type === 'makarov' ? 0.18 : 0.05);
    // reload dip
    if (this.reloadT > 0) {
      const k = 1 - this.reloadT / this.reloadTotal;
      const dip = Math.sin(Math.min(1, k * 1.1) * Math.PI);
      rx -= 0.5 * dip; rz += 0.45 * dip; y -= 0.13 * dip;
    }
    if (this.switchT > 0) y -= (this.switchT / 0.35) * 0.3;
    if (this.meleeT > 0) {
      const k = this.meleeT / 0.55;
      const s = Math.sin(k * Math.PI);
      z -= 0.22 * s; rx -= 0.4 * s; ry += 0.6 * s; x -= 0.1 * s;
    }
    if (this.gadget) {
      const k = this.gadget.t;
      if (this.gadget.type === 'molotov') { z -= Math.max(0, 0.45 - k) * 0.9; y += Math.max(0, 0.45 - k) * 0.5; rx -= 0.6; }
      else { x = 0.12; y = -0.12; z = -0.34; rx += Math.max(0, 0.55 - k) * 1.2; }
    }
    if (this.downed) { y -= 0.06; rz += 0.3; }
    vm.position.set(x, y, z);
    vm.rotation.set(rx, ry, rz);
    vm.userData.flash.visible = this.flashT > 0;
    if (this.flashT > 0) { this.flashT -= dt; vm.userData.flash.rotation.z = Math.random() * Math.PI; vm.userData.flash.scale.setScalar(rand(0.8, 1.3)); }
    this.vmCam.position.set(0, 0, 0);
  }

  updateBody(dt) {
    const b = this.body;
    b.visible = !this.hidden;
    b.position.copy(this.pos);
    b.rotation.y = this.yaw;
    this._animT = (this._animT || 0) + dt * Math.min(1.6, Math.hypot(this.vel.x, this.vel.z) / 4 + 0.3);
    animateHumanoid(b, {
      move: this.downed ? 0 : Math.min(1, Math.hypot(this.vel.x, this.vel.z) / 4),
      t: this._animT, aiming: this.weapon.type !== 'shovel', aimPitch: this.pitch * 0.6,
      crouch: this.crouch || this.sliding > 0, downed: this.downed, dead: this.dead, deadT: 1,
      reviving: this.hold.key && this.hold.key.startsWith('revive') && this.intent.interact,
      surrender: this.surrendered,
    });
  }

  // Where tracers start (approximate gun muzzle in world space).
  muzzleWorld(out = new THREE.Vector3()) {
    const c = this.camera;
    const f = c.getWorldDirection(_v);
    const right = _d.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const k = 1 - this.ads;
    return out.copy(c.position).addScaledVector(f, 0.7).addScaledVector(right, 0.16 * k).add(new THREE.Vector3(0, -0.14 * k - 0.04, 0));
  }

  respawnAt(pos) {
    this.dead = false; this.downed = false;
    this.hp = this.maxHp; this.bleed = 0;
    this.pos.copy(pos); this.vel.set(0, 0, 0);
    this.body.visible = true;
    this.reviveProgress = 0;
  }

  distTo(o) { return dist2D(this.pos, o); }
}
