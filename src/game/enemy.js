// Enemy soldiers: perception, alerting, combat movement.
import * as THREE from 'three';
import { Soldier, moveActor } from './actors.js';
import { PALETTE } from '../core/models.js';
import { rand, pick, dist2D, yawTo, chance } from '../core/util.js';
import { audio } from '../core/audio.js';

export const ENEMY_TYPES = {
  rifleman: { hp: 100, weapon: 'ak74', pref: [10, 22], acc: 0.42, look: { top: 0x55604a, pants: 0x3c4236, hat: 'helmet', vest: 0x2f3529 }, drop: 'ak74' },
  gunner: { hp: 140, weapon: 'rpk', pref: [14, 28], acc: 0.38, look: { top: 0x4d5544, pants: 0x363b30, hat: 'ushanka', hatColor: 0x5a4a35, vest: 0x2c3126 }, drop: 'rpk' },
  officer: { hp: 90, weapon: 'makarov', pref: [8, 16], acc: 0.45, look: { top: 0x4f5b45, pants: 0x3a4233, hat: 'cap', hatColor: 0x3b4a3a }, drop: 'makarov', speed: 4.6 },
  rocketeer: { hp: 100, weapon: 'rpg', pref: [20, 40], acc: 0.4, look: { top: 0x5a5a48, pants: 0x3c4236, hat: 'beanie', hatColor: 0x2f3329, vest: 0x2f3529 }, drop: 'rpg' },
  sniper: { hp: 90, weapon: 'svd', static: true, acc: 0.55, look: { top: 0xdfe3e0, pants: 0xc9cdc9, hat: 'ghillie' }, drop: 'ak74', part: 'optic', sight: 170 },
  mg: { hp: 160, weapon: 'pkm', static: true, acc: 0.34, look: { top: 0x4d5544, pants: 0x363b30, hat: 'helmet', vest: 0x2c3126 }, drop: 'rpk', sight: 110 },
};

const _v = new THREE.Vector3();

export class Enemy extends Soldier {
  constructor(game, type, pos, opts = {}) {
    const T = ENEMY_TYPES[type];
    super(game, 'enemy', { skin: pick(PALETTE.skinLight), ...T.look });
    this.type = type;
    this.T = T;
    this.hp = this.maxHp = T.hp * (game.diff.enemyHp || 1);
    this.pos.copy(pos);
    this.yaw = opts.yaw ?? rand(-Math.PI, Math.PI);
    this.setWeapon(T.weapon);
    this.state = opts.state || 'idle';
    this.static = !!(T.static || opts.static);
    this.accuracy = T.acc;
    this.speed = T.speed || 4.2;
    this.awareness = 0;
    this.percT = rand(0, 0.3);
    this.thinkT = 0;
    this.goal = null;
    this.lastKnown = null;
    this.lostT = 0;
    this.patrol = opts.patrol || null; this.patrolI = 0; this.patrolWait = 0;
    this.pref = T.pref ? rand(T.pref[0], T.pref[1]) : 20;
    this.sight = opts.sight || T.sight || 60;
    this.rocketT = rand(3, 6);
    this.laserT = 0; // sniper aim build-up
    this.crouch = !!opts.crouch;
    this.mount = opts.mount || null;
    this.mountOffset = opts.mountOffset || null;
    if (this.mount) this.accuracy *= 0.75; // shooting from a bouncing vehicle
    this.noDrop = !!opts.noDrop;
    this.flinch = 0;
    if (this.state === 'combat') this.reactT = rand(0.4, 0.8);
    if (type === 'sniper') this.laser = game.makeLaser();
  }

  alert(pos, src) {
    if (this.dead) return;
    if (this.state === 'idle') {
      this.state = 'alert';
      this.lastKnown = pos ? pos.clone() : null;
      this.awareness = 0.6;
      this.thinkT = rand(0.2, 0.8);
    } else if (this.state === 'alert' && pos) {
      this.lastKnown = pos.clone();
    }
    if (src && src.team === 'squad' && this.state !== 'combat' && src.alive) {
      const d = dist2D(this.pos, src.pos);
      if (d < 30) this.enterCombat(src);
    }
  }

  enterCombat(t) {
    if (this.dead) return;
    const wasCombat = this.state === 'combat';
    this.state = 'combat';
    this.target = t;
    this.lastKnown = t.pos.clone();
    if (!wasCombat) {
      this.reactT = rand(0.45, 0.9) * this.game.diff.react;
      this.game.onEnemyCombat(this);
    }
  }

  onDamaged(src) {
    this.flinch = 0.15;
    if (src && src.team === 'squad') this.enterCombat(src);
  }

  perceive() {
    const g = this.game;
    let best = null, bestScore = Infinity;
    const myEye = this.eye(_v.clone());
    for (const s of g.squad) {
      if (s.dead || s.hidden || s.downed || s.surrendered) continue;
      if (this.state !== 'combat' && s.holdPos) continue;
      const d = this.pos.distanceTo(s.pos);
      const range = this.state === 'combat' ? this.sight + 30 : this.sight * 0.6;
      if (d > range) continue;
      if (this.state !== 'combat' && d > 4) {
        const ang = Math.abs(((yawTo(this.pos, s.pos) - this.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (ang > 1.15) continue;
      }
      if (!this.visiblePoint(s, myEye)) continue;
      const score = d * (s.isHuman ? 0.85 : 1);
      if (score < bestScore) { bestScore = score; best = s; }
    }
    return best;
  }

  update(dt) {
    if (this.dead) { this.updateModel(dt); return; }
    const g = this.game;
    if (this.blind > 0) this.blind -= dt;
    if (this.flinch > 0) this.flinch -= dt;
    this.percT -= dt;
    if (this.percT <= 0) {
      this.percT = 0.22;
      const seen = this.blind > 0 ? null : this.perceive();
      if (seen) {
        if (this.state === 'combat') {
          if (!this.target || this.target === seen || !this.canSeeTarget || this.target.downed || this.target.dead) this.target = seen;
          this.canSeeTarget = this.target === seen || this.canSee(this.target);
          this.lastKnown = this.target.pos.clone();
          this.lostT = 0;
        } else {
          const d = this.pos.distanceTo(seen.pos);
          const rate = (d < 8 ? 3 : d < 18 ? 1.4 : 0.6) * (seen.crouch ? 0.5 : 1) * (this.state === 'alert' ? 2 : 1);
          this.awareness += rate * 0.22;
          if (this.awareness >= 1) this.enterCombat(seen);
        }
      } else {
        this.canSeeTarget = false;
        if (this.target && (this.target.dead || this.target.downed)) this.target = null;
      }
    }

    if (this.mount) {
      // Riding a vehicle: position slaved to mount.
      const m = this.mount;
      this.pos.set(m.pos.x + this.mountOffset.x, m.pos.y + this.mountOffset.y, m.pos.z + this.mountOffset.z);
      this.vel.set(m.vel ? m.vel.x : 0, 0, m.vel ? m.vel.z : 0);
    }

    if (this.state === 'idle') this.updateIdle(dt);
    else if (this.state === 'alert') this.updateAlert(dt);
    else this.updateCombat(dt);

    if (!this.mount) {
      this.separate(g.enemies, dt);
      moveActor(g.world, this, dt);
    }
    this.updateModel(dt);
    if (this.laser) this.updateLaser(dt);
  }

  updateIdle(dt) {
    if (this.patrol && !this.static) {
      if (this.patrolWait > 0) { this.patrolWait -= dt; this.vel.x = this.vel.z = 0; return; }
      const p = this.patrol[this.patrolI];
      if (this.moveTo(p, 1.6, dt, 0.7)) { this.patrolI = (this.patrolI + 1) % this.patrol.length; this.patrolWait = rand(1.5, 4); }
      else this.turnToward(Math.atan2(-this.vel.x, -this.vel.z), 4, dt);
    } else {
      this.vel.x = this.vel.z = 0;
      if (!this.static && chance(dt * 0.15)) this.idleYaw = this.yaw + rand(-1.5, 1.5);
      if (this.idleYaw != null) this.turnToward(this.idleYaw, 1.5, dt);
    }
  }

  updateAlert(dt) {
    if (this.static || !this.lastKnown) { this.vel.x = this.vel.z = 0; if (this.lastKnown) this.turnToward(yawTo(this.pos, this.lastKnown), 3, dt); return; }
    const arrived = this.moveTo(this.lastKnown, 3.2, dt, 2);
    if (!arrived) this.turnToward(Math.atan2(-this.vel.x, -this.vel.z), 5, dt);
    else { this.vel.x = this.vel.z = 0; this.turnToward(this.yaw + 0.8, 1, dt); }
  }

  updateCombat(dt) {
    const g = this.game;
    const t = this.target;
    if (t && !t.dead && !t.downed) {
      if (this.canSeeTarget || dist2D(this.pos, t.pos) < 25) this.lookAtTarget(t, dt, this.static ? 3 : 7);
    }
    if (!this.canSeeTarget) {
      this.lostT += dt;
      if (this.lostT > 25 && !this.static) { this.state = 'alert'; this.target = null; }
    }

    // Weapons
    if (this.type === 'rocketeer') this.rocketControl(dt, t);
    else if (this.type === 'sniper') this.sniperControl(dt, t);
    else this.fireControl(dt, t, this.canSeeTarget && t && !t.dead && !t.downed && this.flinch <= 0);

    if (this.static || this.mount) { this.vel.x = this.vel.z = 0; return; }

    // Movement decisions
    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      this.thinkT = rand(1.4, 2.8);
      this.goal = null;
      if (t && this.canSeeTarget) {
        const d = dist2D(this.pos, t.pos);
        const toT = new THREE.Vector3(t.pos.x - this.pos.x, 0, t.pos.z - this.pos.z).normalize();
        const side = new THREE.Vector3(-toT.z, 0, toT.x).multiplyScalar(chance(0.5) ? 1 : -1);
        let gx, gz;
        if (d > this.pref + 6) { gx = this.pos.x + toT.x * rand(4, 8) + side.x * rand(0, 3); gz = this.pos.z + toT.z * rand(4, 8) + side.z * rand(0, 3); }
        else if (d < this.pref - 7) { gx = this.pos.x - toT.x * rand(3, 6) + side.x * 2; gz = this.pos.z - toT.z * rand(3, 6) + side.z * 2; }
        else if (chance(0.55)) { gx = this.pos.x + side.x * rand(2.5, 6); gz = this.pos.z + side.z * rand(2.5, 6); }
        if (gx != null && g.world.walkable(gx, gz)) this.goal = { x: gx, z: gz };
        this.crouch = !this.goal && chance(0.35);
      } else if (this.lastKnown) {
        this.goal = { x: this.lastKnown.x + rand(-3, 3), z: this.lastKnown.z + rand(-3, 3) };
        this.crouch = false;
      }
    }
    if (this.goal) {
      const shooting = this.burst > 0;
      if (this.moveTo(this.goal, shooting ? 2.4 : this.speed, dt, 0.9)) this.goal = null;
      if (!this.canSeeTarget) this.turnToward(Math.atan2(-this.vel.x, -this.vel.z), 6, dt);
    } else { this.vel.x *= 0.8; this.vel.z *= 0.8; }
  }

  rocketControl(dt, t) {
    if (!t || !this.canSeeTarget || t.dead || t.downed || this.blind > 0) return;
    this.rocketT -= dt;
    if (this.rocketT <= 0 && this.facing(t, 0.3)) {
      this.rocketT = rand(6, 10) / this.game.diff.enemyAcc;
      const muz = this.muzzlePos(new THREE.Vector3());
      const aim = t.chest(new THREE.Vector3());
      // Lead the target slightly and add error
      aim.addScaledVector(t.vel, 0.4);
      aim.x += rand(-2.5, 2.5); aim.z += rand(-2.5, 2.5); aim.y += rand(-0.8, 0.8);
      this.game.spawnRocket(muz, aim.sub(muz).normalize(), this, 26);
    }
  }

  sniperControl(dt, t) {
    if (!t || !this.canSeeTarget || t.dead || t.downed || this.blind > 0) { this.laserT = Math.max(0, this.laserT - dt * 2); return; }
    this.laserT += dt;
    if (this.laserT > 2.4 * this.game.diff.react) {
      this.laserT = -rand(0.8, 1.6);
      this.shootAt(t, { aiDmg: 48, sound: 'sniper', rpm: 60 });
    }
  }

  updateLaser() {
    const L = this.laser;
    const t = this.target;
    const on = !this.dead && this.state === 'combat' && t && this.canSeeTarget && this.blind <= 0 && this.laserT > 0;
    L.visible = on;
    if (!on) return;
    const a = this.muzzlePos(new THREE.Vector3());
    const b = t.chest(new THREE.Vector3());
    L.position.copy(a);
    L.lookAt(b);
    L.scale.set(1, 1, a.distanceTo(b));
    L.material.opacity = 0.25 + Math.min(1, this.laserT / 2.4) * 0.6;
  }

  die() {
    this.dead = true;
    this.hp = 0;
    this.vel.set(0, 0, 0);
    if (this.laser) { this.laser.visible = false; this.game.scene.remove(this.laser); }
    audio.play('hurt', this.pos, 0.3);
  }
}
