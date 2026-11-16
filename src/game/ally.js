// AI squadmates: follow the humans, fight, scavenge weapons and revive the downed.
import * as THREE from 'three';
import { Soldier, moveActor } from './actors.js';
import { rand, dist2D, yawTo } from '../core/util.js';
import { audio } from '../core/audio.js';

const _v = new THREE.Vector3();
const FORMATION = [[-2.2, 2.2], [2.2, 2.4], [0, 3.6]];

export class Ally extends Soldier {
  constructor(game, name, look, slot) {
    super(game, 'squad', look);
    this.name = name;
    this.color = look.band;
    this.hp = this.maxHp = 150;
    this.accuracy = 0.55;
    this.slot = slot;
    this.percT = rand(0, 0.25);
    this.reviveTarget = null;
    this.isReviving = false;
    this.fetch = null;
    this.station = null; // fixed position (convoy truck bed)
    this.driving = false;
    this.reloadT = 0;
    this.speed = 5.2;
  }

  perceive() {
    const g = this.game;
    let best = null, bestD = Infinity;
    const eye = this.eye(_v.clone());
    for (const e of g.enemies) {
      if (e.dead) continue;
      const d = this.pos.distanceTo(e.pos);
      if (d > 75) continue;
      // Hold fire on unaware guards unless the alarm is up or they are close.
      if (!g.alarm && e.state === 'idle' && d > 6) continue;
      if (!this.visiblePoint(e, eye)) continue;
      let score = d;
      if (e.target && e.target.isHuman) score *= 0.7;
      if (score < bestD) { bestD = score; best = e; }
    }
    return best;
  }

  leader() {
    const g = this.game;
    let best = null, bd = Infinity;
    for (const p of g.players) {
      if (p.dead) continue;
      const d = dist2D(p.pos, this.pos);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  update(dt) {
    const g = this.game;
    if (this.dead) { this.updateModel(dt); return; }
    if (this.blind > 0) this.blind -= dt;
    this.isReviving = false;
    if (this.downed) {
      this.vel.x = this.vel.z = 0;
      moveActor(g.world, this, dt);
      this.updateModel(dt);
      return;
    }
    if (this.driving) { this.updateModel(dt); return; }

    this.percT -= dt;
    if (this.percT <= 0) {
      this.percT = 0.25;
      const e = this.perceive();
      this.target = e;
      this.canSeeTarget = !!e;
      if (e && !this.wasEngaged) this.reactT = rand(0.25, 0.5);
      this.wasEngaged = !!e;
    }

    // Holding position (e.g. hiding in the bunks before the breakout).
    if (this.holdPos) {
      this.vel.x = this.vel.z = 0;
      this.crouch = true;
      if (this.target && this.weaponType) { this.lookAtTarget(this.target, dt, 8); this.fireControl(dt, this.target, this.canSeeTarget); }
      this.finishMove(dt);
      return;
    }

    // 1) Revive downed squad members.
    let rt = null, rd = this.station ? 5 : 28;
    for (const s of g.squad) {
      if (s === this || !s.downed || s.dead) continue;
      if (s.reviveBy && s.reviveBy !== this) continue;
      const d = dist2D(s.pos, this.pos) - (s.isHuman ? 6 : 0);
      if (d < rd) { rd = d; rt = s; }
    }
    if (rt) {
      if (dist2D(rt.pos, this.pos) < 1.4) {
        this.vel.x = this.vel.z = 0;
        this.isReviving = true;
        this.turnToward(yawTo(this.pos, rt.pos), 8, dt);
        rt.reviveBy = this;
        rt.reviveProgress += dt / g.reviveTime(this);
        if (rt.reviveProgress >= 1) g.revive(rt, this);
      } else {
        this.moveTo(rt.pos, 6.2, dt, 1.1);
        this.turnToward(Math.atan2(-this.vel.x, -this.vel.z), 9, dt);
        if (this.target && this.canSeeTarget && dist2D(this.target.pos, this.pos) < 12) this.fireControl(dt, this.target, true);
      }
      this.finishMove(dt);
      return;
    }

    // Station mode: hold a fixed spot (e.g. truck bed) and shoot.
    if (this.station) {
      const dx = this.station.x - this.pos.x, dz = this.station.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.15) { this.vel.x = (dx / d) * Math.min(3, d * 6); this.vel.z = (dz / d) * Math.min(3, d * 6); }
      else { this.vel.x = this.vel.z = 0; }
      if (this.target) this.lookAtTarget(this.target, dt, 8);
      this.fireControl(dt, this.target, this.canSeeTarget);
      moveActor(g.world, this, dt);
      this.updateModel(dt);
      return;
    }

    // 2) Unarmed: grab the nearest dropped weapon.
    if (!this.weaponType) {
      let best = null, bd = 35;
      for (const p of g.pickups) {
        if (p.kind !== 'weapon' || p.dead || p.data.type === 'rpg') continue;
        const d = dist2D(p.pos, this.pos);
        if (d < bd) { bd = d; best = p; }
      }
      if (best) {
        if (bd < 1.3) {
          this.setWeapon(best.data.type, {});
          g.removePickup(best);
          g.popup(`${this.name} grabbed a ${best.data.def.name}`, null, 'info');
          audio.play('pickup', this.pos, 0.4);
        } else {
          this.moveTo(best.pos, 5.6, dt, 1.0);
          this.turnToward(Math.atan2(-this.vel.x, -this.vel.z), 9, dt);
          this.finishMove(dt);
          return;
        }
      }
    }

    // 3) Follow leader in formation and fight.
    const L = this.leader();
    let goal = null;
    if (L) {
      const f = FORMATION[this.slot % FORMATION.length];
      const ly = L.yaw;
      const fx = -Math.sin(ly), fz = -Math.cos(ly), rx = Math.cos(ly), rz = -Math.sin(ly);
      goal = { x: L.pos.x + rx * f[0] - fx * f[1], z: L.pos.z + rz * f[0] - fz * f[1] };
      if (!g.world.walkable(goal.x, goal.z)) goal = { x: L.pos.x - fx * 1.5, z: L.pos.z - fz * 1.5 };
    }
    const dl = L ? dist2D(L.pos, this.pos) : 0;
    const engaged = this.target && this.canSeeTarget && this.weaponType;
    if (goal && (dl > (engaged ? 9 : 3.2))) {
      const sp = dl > 12 ? 7.2 : engaged ? 3.4 : 5.4;
      this.moveTo(goal, sp, dt, 1.2);
    } else { this.vel.x *= 0.7; this.vel.z *= 0.7; }
    this.crouch = engaged && this.speed2D() < 1 && L && L.crouch;

    if (engaged) {
      this.lookAtTarget(this.target, dt, 8);
      this.fireControl(dt, this.target, true);
    } else if (this.speed2D() > 0.5) {
      this.turnToward(Math.atan2(-this.vel.x, -this.vel.z), 7, dt);
      this.aimPitch = 0;
    } else if (L) {
      this.turnToward(L.yaw, 3, dt);
    }
    this.finishMove(dt);
  }

  finishMove(dt) {
    this.separate(this.game.squad, dt);
    moveActor(this.game.world, this, dt);
    this.updateModel(dt);
  }
}
