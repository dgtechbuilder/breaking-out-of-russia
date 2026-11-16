// Shared actor physics/hit-testing and the AI soldier base class.
import * as THREE from 'three';
import { rayAABB, raySphere, angleDiff, yawTo, rand, randInt, clamp, dist2D } from '../core/util.js';
import { makeHumanoid, setHeldGun, animateHumanoid } from '../core/models.js';
import { WEAPONS } from './weapons.js';
import { audio } from '../core/audio.js';

export const GRAVITY = 19;
const STEP = 0.45;
let ID = 0;

export class Actor {
  constructor(game, team) {
    this.game = game;
    this.team = team;
    this.id = ++ID;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.hp = 100; this.maxHp = 100;
    this.armor = 0; this.armorT = 0;
    this.radius = 0.32;
    this.onGround = true;
    this.downed = false; this.dead = false; this.bleed = 0;
    this.crouch = false; this.sliding = 0; this.blind = 0;
    this.isHuman = false;
    this.name = '';
    this.mount = null;
    this.hidden = false; // e.g. inside the truck cab
    this.hurtT = 0;
    this.reviveBy = null; this.reviveProgress = 0;
  }

  get alive() { return !this.dead; }
  get up() { return !this.dead && !this.downed; }
  get standH() { return this.downed ? 0.55 : (this.crouch || this.sliding > 0) ? 1.2 : 1.82; }
  get eyeH() { return this.downed ? 0.45 : (this.crouch || this.sliding > 0) ? 1.05 : 1.62; }

  chest(out = new THREE.Vector3()) { return out.set(this.pos.x, this.pos.y + (this.downed ? 0.3 : this.standH * 0.68), this.pos.z); }
  eye(out = new THREE.Vector3()) { return out.set(this.pos.x, this.pos.y + this.eyeH, this.pos.z); }

  hitTest(o, d, maxT) {
    if (this.dead || this.hidden) return Infinity;
    const h = this.standH, x = this.pos.x, y = this.pos.y, z = this.pos.z;
    let best = Infinity;
    this._head = false;
    if (!this.downed) {
      _c.set(x, y + h - 0.17, z);
      const th = raySphere(o, d, _c, 0.17, maxT);
      if (th < best) { best = th; this._head = true; }
      _mn.x = x - 0.27; _mn.y = y; _mn.z = z - 0.27;
      _mx.x = x + 0.27; _mx.y = y + h - 0.33; _mx.z = z + 0.27;
    } else {
      _mn.x = x - 0.5; _mn.y = y; _mn.z = z - 0.5;
      _mx.x = x + 0.5; _mx.y = y + 0.5; _mx.z = z + 0.5;
    }
    const tb = rayAABB(o, d, _mn, _mx, maxT);
    if (tb < best) { best = tb; this._head = false; }
    return best;
  }

  speed2D() { return Math.hypot(this.vel.x, this.vel.z); }
}
const _c = new THREE.Vector3();
const _mn = { x: 0, y: 0, z: 0 }, _mx = { x: 0, y: 0, z: 0 };

/** Integrate velocity and resolve collisions against world boxes. */
export function moveActor(world, a, dt) {
  const r = a.radius, h = a.standH;
  a.vel.y -= GRAVITY * dt;
  const wasGround = a.onGround;
  // X axis
  const dx = a.vel.x * dt;
  a.pos.x += dx;
  resolveAxis(world, a, 0, dx, r, h, wasGround);
  const dz = a.vel.z * dt;
  a.pos.z += dz;
  resolveAxis(world, a, 2, dz, r, h, wasGround);
  // Y axis
  const dy = a.vel.y * dt;
  a.pos.y += dy;
  a.onGround = false;
  for (const c of world.colliders) {
    if (!c.blocksMove) continue;
    if (a.pos.x + r > c.min.x && a.pos.x - r < c.max.x && a.pos.z + r > c.min.z && a.pos.z - r < c.max.z &&
        a.pos.y + h > c.min.y && a.pos.y < c.max.y) {
      if (dy <= 0) { a.pos.y = c.max.y; a.vel.y = 0; a.onGround = true; }
      else { a.pos.y = c.min.y - h - 0.001; a.vel.y = 0; }
    }
  }
  if (a.pos.y <= world.groundY) { a.pos.y = world.groundY; a.vel.y = 0; a.onGround = true; }
}

function resolveAxis(world, a, axis, delta, r, h, wasGround) {
  for (const c of world.colliders) {
    if (!c.blocksMove) continue;
    if (!(a.pos.x + r > c.min.x && a.pos.x - r < c.max.x && a.pos.z + r > c.min.z && a.pos.z - r < c.max.z &&
          a.pos.y + h > c.min.y && a.pos.y < c.max.y)) continue;
    const rise = c.max.y - a.pos.y;
    if (rise > 0 && rise <= STEP && wasGround && !world.overlapsBox(a.pos.x - r, c.max.y + 0.01, a.pos.z - r, a.pos.x + r, c.max.y + h, a.pos.z + r)) {
      a.pos.y = c.max.y; // step up
      continue;
    }
    if (axis === 0) {
      if (delta > 0) a.pos.x = c.min.x - r - 0.001;
      else if (delta < 0) a.pos.x = c.max.x + r + 0.001;
      else a.pos.x = a.pos.x < (c.min.x + c.max.x) / 2 ? c.min.x - r - 0.001 : c.max.x + r + 0.001;
      a.vel.x = 0;
    } else {
      if (delta > 0) a.pos.z = c.min.z - r - 0.001;
      else if (delta < 0) a.pos.z = c.max.z + r + 0.001;
      else a.pos.z = a.pos.z < (c.min.z + c.max.z) / 2 ? c.min.z - r - 0.001 : c.max.z + r + 0.001;
      a.vel.z = 0;
    }
  }
}

// --------------------------------------------------------------------------
// AI soldier base (enemies + AI squadmates)
// --------------------------------------------------------------------------
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _dir = new THREE.Vector3();

export class Soldier extends Actor {
  constructor(game, team, look) {
    super(game, team);
    this.model = makeHumanoid(look);
    game.scene.add(this.model);
    this.weaponType = null;
    this.att = {};
    this.animT = Math.random() * 10;
    this.path = null; this.pathI = 0; this.pathGoal = null; this.repathT = 0;
    this.target = null;
    this.reactT = 0; this.burst = 0; this.pauseT = rand(0.3, 1); this.fireT = 0;
    this.seeT = 0; this.canSeeTarget = false;
    this.aimPitch = 0;
    this.deadT = 0;
    this.speed = 4.2;
    this.static = false;
    this.accuracy = 0.5;
    this.damageMult = 1;
    this.stuck = 0;
  }

  setWeapon(type, att) {
    this.weaponType = type;
    this.att = att || {};
    setHeldGun(this.model, type, this.att);
  }

  muzzlePos(out = new THREE.Vector3()) {
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const y = this.pos.y + (this.crouch ? 1.0 : 1.36);
    return out.set(this.pos.x + fx * 0.75 + rx * 0.08, y, this.pos.z + fz * 0.75 + rz * 0.08);
  }

  /** Path-follow toward goal. Returns true when arrived. */
  moveTo(goal, speed, dt, arriveDist = 0.8) {
    const world = this.game.world;
    if (!goal) { this.vel.x = 0; this.vel.z = 0; return true; }
    const d = dist2D(this.pos, goal);
    if (d < arriveDist) { this.vel.x *= 0.5; this.vel.z *= 0.5; return true; }
    this.repathT -= dt;
    if (!this.path || this.repathT <= 0 || !this.pathGoal || dist2D(this.pathGoal, goal) > 2) {
      this.path = world.findPath(this.pos, goal) || [{ x: goal.x, z: goal.z }];
      this.pathI = 0;
      this.pathGoal = { x: goal.x, z: goal.z };
      this.repathT = rand(1.2, 2.2);
    }
    let wp = this.path[this.pathI];
    while (wp && dist2D(this.pos, wp) < 0.6 && this.pathI < this.path.length - 1) wp = this.path[++this.pathI];
    if (!wp) return true;
    const dx = wp.x - this.pos.x, dz = wp.z - this.pos.z;
    const L = Math.hypot(dx, dz) || 1;
    this.vel.x = (dx / L) * speed;
    this.vel.z = (dz / L) * speed;
    // Stuck detection: if barely moving, repath soon.
    return false;
  }

  separate(list, dt) {
    for (const o of list) {
      if (o === this || o.dead || o.mount) continue;
      const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z;
      const d2 = dx * dx + dz * dz;
      const R = o.isHuman ? 1.25 : 0.8;
      if (d2 < R * R && d2 > 1e-6) {
        const d = Math.sqrt(d2), push = (R - d) * 3;
        this.vel.x += (dx / d) * push; this.vel.z += (dz / d) * push;
      }
    }
  }

  turnToward(yaw, rate, dt) {
    const d = angleDiff(this.yaw, yaw);
    const step = rate * dt;
    this.yaw += Math.abs(d) < step ? d : Math.sign(d) * step;
  }

  lookAtTarget(t, dt, rate = 7) {
    if (!t) return;
    this.turnToward(yawTo(this.pos, t.pos), rate, dt);
    const muz = this.muzzlePos(_v);
    const c = t.chest(_v2);
    const hd = dist2D(muz, c);
    this.aimPitch = clamp(Math.atan2(c.y - muz.y, hd), -0.8, 0.8);
  }

  facing(t, tol = 0.35) {
    return Math.abs(angleDiff(this.yaw, yawTo(this.pos, t.pos))) < tol;
  }

  /** A point on the target visible from `from` (chest first, then head), or null. */
  visiblePoint(t, from) {
    const c = t.chest(new THREE.Vector3());
    if (this.game.world.clear(from, c)) return c;
    if (!t.downed) {
      c.y = t.pos.y + t.standH - 0.15;
      if (this.game.world.clear(from, c)) return c;
    }
    return null;
  }

  canSee(t, fromEye = true) {
    const a = fromEye ? this.eye(_v) : this.muzzlePos(_v);
    return this.game.world.clear(a, t.chest(_v2));
  }

  /** Burst-fire controller. Call every frame while engaging. */
  fireControl(dt, t, visible) {
    if (!this.weaponType || !t || this.blind > 0) { this.burst = 0; return; }
    const def = WEAPONS[this.weaponType];
    if (!visible) { this.reactT = Math.max(this.reactT, 0.25); this.burst = 0; return; }
    if (this.reactT > 0) { this.reactT -= dt; return; }
    if (!this.facing(t, 0.3)) return;
    if (this.burst <= 0) {
      this.pauseT -= dt;
      if (this.pauseT <= 0) {
        this.burst = randInt(def.aiBurst[0], def.aiBurst[1]);
        this.pauseT = rand(def.aiPause[0], def.aiPause[1]);
        this.fireT = 0;
      }
      return;
    }
    this.fireT -= dt;
    while (this.fireT <= 0 && this.burst > 0) {
      this.fireT += 60 / def.rpm;
      this.burst--;
      this.shootAt(t, def);
    }
  }

  hitChance(t, dist) {
    const g = this.game;
    let p = this.accuracy;
    p *= clamp(1.15 - dist / (this.weaponType === 'svd' ? 260 : 75), 0.15, 1.1);
    if (t.sliding > 0) p *= 0.4;
    else if (t.speed2D && t.speed2D() > 6.5) p *= 0.65;
    else if (t.speed2D && t.speed2D() > 2) p *= 0.85;
    if (t.crouch) p *= 0.8;
    if (this.team === 'enemy') {
      p *= g.diff.enemyAcc;
      if (g.spottedBy(t)) p *= 1.35;
    }
    if (this.blind > 0) p *= 0.08;
    return clamp(p, 0.02, 0.95);
  }

  shootAt(t, def) {
    const g = this.game;
    const muz = this.muzzlePos(new THREE.Vector3());
    const aim = this.visiblePoint(t, muz) || t.chest(new THREE.Vector3());
    const dist = muz.distanceTo(aim);
    const hit = Math.random() < this.hitChance(t, dist);
    if (!hit) {
      // Miss: scatter around target.
      aim.x += rand(-1.6, 1.6); aim.y += rand(-0.9, 1.2); aim.z += rand(-1.6, 1.6);
    }
    _dir.subVectors(aim, muz).normalize();
    const res = g.world.raycast(muz, _dir, dist + (hit ? 0 : 30));
    let end;
    if (hit && (!res || res.t >= dist - 0.4)) {
      end = aim;
      let dmg = (def.aiDmg || 8) * this.damageMult;
      let head = false;
      if (this.team === 'squad') {
        head = Math.random() < 0.18;
        dmg = (WEAPONS[this.weaponType].dmg || 30) * (head ? 2 : 1) * 0.9;
      }
      g.damageActor(t, dmg, this, { head, dir: _dir.clone() });
    } else if (res) {
      end = res.point;
      g.impactFX(res.point, res.normal, res.collider);
      if (res.collider && res.collider.vehicle) res.collider.vehicle.damage(def.aiDmg || 8, this);
    } else {
      end = muz.clone().addScaledVector(_dir, dist + 30);
    }
    // Near-miss whiz for humans.
    if (!hit && t.isHuman && dist > 4) audio.play('whiz', t.pos, 0.6);
    if (Math.random() < 0.6) g.fx.tracer(muz, end, this.team === 'enemy' ? 0xff9a5a : 0xffe08a);
    g.fx.muzzle(muz, _dir, 0.8);
    if (Math.random() < 0.3) g.fx.flash(muz, 0xffaa55, 2, 7, 0.05);
    const supp = this.att && this.att.suppressor;
    audio.play(supp ? 'suppressed' : (def.sound || 'ak'), muz, this.team === 'enemy' ? 0.55 : 0.4);
    if (!supp) g.noise(muz, 45, this);
  }

  updateModel(dt) {
    this.animT += dt * (0.4 + Math.min(1.2, this.speed2D() / 4));
    if (this.dead) this.deadT += dt;
    const m = this.model;
    m.position.copy(this.pos);
    m.rotation.y = this.yaw;
    animateHumanoid(m, {
      move: this.dead || this.downed ? 0 : Math.min(1, this.speed2D() / 4),
      t: this.animT,
      aiming: !!this.weaponType,
      aimPitch: this.aimPitch,
      crouch: this.crouch,
      downed: this.downed,
      dead: this.dead,
      deadT: this.deadT,
      reviving: this.isReviving,
      surrender: this.surrender,
    });
  }

  removeModel() {
    if (this.model.parent) this.model.parent.remove(this.model);
  }
}
