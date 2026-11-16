// Drones, vehicles and projectiles.
import * as THREE from 'three';
import { makeDrone, makeTruck, makeTechnical, makeGun } from '../core/models.js';
import { rand, raySphere, dist2D, chance, clamp } from '../core/util.js';
import { audio } from '../core/audio.js';
import { Enemy } from './enemy.js';

const _v = new THREE.Vector3(), _d = new THREE.Vector3();

// --------------------------------------------------------------------------
export class Drone {
  constructor(game, pos) {
    this.game = game;
    this.pos = pos.clone();
    this.vel = new THREE.Vector3();
    this.hp = 35;
    this.dead = false;
    this.model = makeDrone();
    this.model.position.copy(pos);
    game.scene.add(this.model);
    this.ang = rand(0, Math.PI * 2);
    this.radius = rand(14, 22);
    this.height = rand(15, 20);
    this.spot = null; this.spotT = 0; this.callT = rand(5, 8);
    this.fallV = 0;
    this.team = 'enemy';
  }

  hitTest(o, d, maxT) { return this.dead ? Infinity : raySphere(o, d, this.pos, 0.55, maxT); }

  damage(n, src) {
    if (this.dead) return;
    this.hp -= n;
    if (this.hp <= 0) this.destroy(src);
  }

  destroy(src) {
    if (this.dead) return;
    this.dead = true;
    this.game.fx.electric(this.pos, 1);
    this.game.fx.explosion(this.pos, 0.35);
    audio.play('explosion', this.pos, 0.35);
    if (src && src.isHuman) { this.game.momentum.add(6, src); this.game.popup('Drone down', src, 'kill'); }
  }

  update(dt) {
    const g = this.game;
    if (this.dead) {
      this.fallV += 15 * dt;
      this.pos.y -= this.fallV * dt;
      this.model.position.copy(this.pos);
      this.model.rotation.x += dt * 4;
      if (this.pos.y < 0.2) { g.scene.remove(this.model); this.removed = true; }
      return;
    }
    const c = g.squadCentroid();
    this.ang += dt * 0.25;
    const tx = c.x + Math.cos(this.ang) * this.radius, tz = c.z + Math.sin(this.ang) * this.radius;
    this.vel.set((tx - this.pos.x) * 0.8, (this.height - this.pos.y) * 0.8, (tz - this.pos.z) * 0.8);
    this.pos.addScaledVector(this.vel, dt);
    this.model.position.copy(this.pos);
    this.model.rotation.y = this.ang;
    for (const r of this.model.userData.rotors) r.rotation.y += dt * 40;
    this.model.userData.eye.visible = Math.sin(performance.now() / 120) > 0;

    // Spotting
    this.spot = null;
    for (const s of g.squad) {
      if (s.dead || s.hidden || s.downed) continue;
      if (dist2D(s.pos, this.pos) < 50 && g.world.clear(this.pos, s.chest(_v))) { this.spot = s; break; }
    }
    if (this.spot) {
      this.callT -= dt;
      if (this.callT <= 0) {
        this.callT = rand(9, 14) / g.diff.enemyAcc;
        const p = this.spot.pos.clone();
        p.x += rand(-3, 3); p.z += rand(-3, 3) - (g.droneLead || 0);
        g.enemyMortar(p);
      }
    }
  }
}

// --------------------------------------------------------------------------
// Reinforcement truck: drives in along waypoints and unloads troops.
export class TransportTruck {
  constructor(game, route, troops, opts = {}) {
    this.game = game;
    this.route = route.map((p) => new THREE.Vector3(p.x, 0, p.z));
    this.pos = this.route[0].clone();
    this.vel = new THREE.Vector3();
    this.i = 1;
    this.troops = troops;
    this.state = 'drive';
    this.hp = 500;
    this.dead = false;
    this.model = makeTruck(0x55604a, true);
    game.scene.add(this.model);
    this.unloadT = 0;
    this.speed = opts.speed || 13;
    this.yaw = 0;
    this.collider = game.world.addCollider(0, 0, 0, 0, 0, 0, { nav: false, blocksMove: true });
    this.collider.vehicle = this;
    this.syncCollider();
    this.onUnload = opts.onUnload;
  }

  syncCollider() {
    const c = this.collider;
    const along = Math.abs(Math.sin(this.yaw)) > 0.7; // driving along x
    const hx = along ? 3.7 : 1.3, hz = along ? 1.3 : 3.7;
    c.min.x = this.pos.x - hx; c.max.x = this.pos.x + hx;
    c.min.z = this.pos.z - hz; c.max.z = this.pos.z + hz;
    c.min.y = 0.3; c.max.y = 3.2;
  }

  damage(n, src, explosive) {
    if (this.dead) return;
    this.hp -= explosive ? n : n * 0.1;
    if (this.hp <= 0) {
      this.dead = true;
      this.game.explode(this.pos.clone().setY(1.2), { radius: 7, dmg: 120, owner: src, fx: 1.6 });
      this.model.traverse((o) => { if (o.isMesh) o.material = o.material.clone(); });
      this.model.traverse((o) => { if (o.isMesh) o.material.color.multiplyScalar(0.25); });
      // Remaining troops die inside.
      this.troops = [];
      if (src && src.isHuman) this.game.momentum.add(12, src);
    }
  }

  update(dt) {
    if (this.dead) { if (chance(dt * 6)) this.game.fx.smoke(this.pos.clone().setY(2), [0.12, 0.12, 0.12], 1.5); return; }
    if (this.state === 'drive') {
      const t = this.route[this.i];
      _d.subVectors(t, this.pos); _d.y = 0;
      const L = _d.length();
      if (L < 0.5) {
        this.i++;
        if (this.i >= this.route.length) { this.state = 'unload'; this.unloadT = 0.6; this.vel.set(0, 0, 0); }
      } else {
        const sp = Math.min(this.speed, L * 1.5 + 2);
        _d.normalize();
        this.vel.copy(_d).multiplyScalar(sp);
        this.pos.addScaledVector(this.vel, Math.min(dt, L / sp));
        this.yaw = Math.atan2(-_d.x, -_d.z);
      }
    } else if (this.state === 'unload') {
      this.unloadT -= dt;
      if (this.unloadT <= 0 && this.troops.length) {
        this.unloadT = 0.45;
        const type = this.troops.shift();
        const back = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
        const side = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
        const p = this.pos.clone().addScaledVector(back, 4.6).addScaledVector(side, rand(-1, 1));
        const e = this.game.spawnEnemy(type, p, { state: 'alert', yaw: this.yaw + Math.PI });
        e.lastKnown = this.game.squadCentroid().clone();
        e.thinkT = 0;
        if (!this.troops.length) { this.state = 'parked'; this.onUnload?.(); }
      }
    }
    this.model.position.copy(this.pos);
    this.model.rotation.y = this.yaw;
    for (const w of this.model.userData.wheels) w.rotation.x -= this.vel.length() * dt * 1.8;
    this.syncCollider();
  }
}

// --------------------------------------------------------------------------
// Convoy pursuit vehicle (lives in truck frame; stage handles scrolling).
export class Technical {
  constructor(game, x, z, opts = {}) {
    this.game = game;
    this.pos = new THREE.Vector3(x, 0, z);
    this.vel = new THREE.Vector3();
    this.hp = 320 * (game.diff.enemyHp || 1);
    this.dead = false; this.wreck = false; this.retreat = false;
    this.model = makeTechnical(opts.color || 0x6b6650);
    game.scene.add(this.model);
    this.home = { x: opts.homeX ?? (x < 0 ? -4.4 : 4.4), z: opts.homeZ ?? rand(14, 26) };
    this.phase = rand(0, 6);
    this.collider = game.world.addCollider(0, 0, 0, 0, 0, 0, { nav: false, blocksMove: false });
    this.collider.vehicle = this;
    this.gunner = game.spawnEnemy('mg', this.pos, { mount: this, mountOffset: new THREE.Vector3(0, 1.15, 1.85), state: 'combat', yaw: 0, noDrop: true });
    this.gunner.model.userData.parts.gunPivot.visible = true;
    this.riders = [this.gunner];
    if (opts.rocket) {
      const r = game.spawnEnemy('rocketeer', this.pos, { mount: this, mountOffset: new THREE.Vector3(0.55, 1.15, 0.9), state: 'combat', noDrop: true });
      this.riders.push(r);
    }
    for (const r of this.riders) { r.target = game.players[0]; r.lastKnown = r.target.pos.clone(); }
    this.syncCollider();
  }

  cleanup() {
    this.game.scene.remove(this.model);
    for (const r of this.riders) { r.dead = true; r.removeModel(); }
    if (!this.collider.dead) this.game.world.removeCollider(this.collider);
  }

  syncCollider() {
    const c = this.collider;
    c.min.x = this.pos.x - 1.05; c.max.x = this.pos.x + 1.05;
    c.min.z = this.pos.z - 2.45; c.max.z = this.pos.z + 2.45;
    c.min.y = 0.4; c.max.y = 1.95;
  }

  damage(n, src, explosive) {
    if (this.dead) return;
    this.hp -= explosive ? n * 1.3 : n * 0.55;
    if (this.hp <= 0) this.destroy(src);
  }

  destroy(src) {
    this.dead = true; this.wreck = true;
    const g = this.game;
    g.explode(this.pos.clone().setY(1), { radius: 5, dmg: 80, owner: src, fx: 1.4 });
    for (const r of this.riders) if (!r.dead) g.killEnemy(r, src, { explosive: true });
    this.model.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.multiplyScalar(0.22); } });
    this.model.rotation.z = rand(-0.4, 0.4);
    if (src && src.isHuman) { g.momentum.add(14, src); g.popup('Technical destroyed', src, 'kill'); }
    g.world.removeCollider(this.collider);
  }

  update(dt) {
    const g = this.game;
    if (this.wreck) {
      if (chance(dt * 8)) g.fx.smoke(this.pos.clone().setY(1.5), [0.1, 0.1, 0.1], 1.4);
      this.model.position.copy(this.pos);
      if (this.pos.z > 160) this.removed = true;
      return;
    }
    if (!this.retreat && this.riders.every((r) => r.dead)) this.retreat = true;
    this.phase += dt;
    const truck = g.truck;
    let tx, tz;
    if (this.retreat) { tx = this.home.x * 1.5; tz = this.pos.z + 30; }
    else {
      tx = truck.pos.x + this.home.x + Math.sin(this.phase * 0.7) * 1.2;
      tz = this.home.z + Math.sin(this.phase * 0.43) * 4;
    }
    tx = clamp(tx, -5.2, 5.2);
    // Avoid ramming the player's truck.
    if (Math.abs(this.pos.z) < 8 && Math.abs(this.pos.x - truck.pos.x) < 3.4) tx = truck.pos.x + Math.sign(this.pos.x - truck.pos.x || 1) * 3.6;
    this.vel.x = clamp((tx - this.pos.x) * 1.4, -4, 4);
    this.vel.z = clamp((tz - this.pos.z) * 0.9, -9, 12);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.model.position.copy(this.pos);
    this.model.rotation.y = -this.vel.x * 0.04;
    this.model.position.y = Math.sin(this.phase * 9) * 0.03;
    const mg = this.model.userData.mg;
    if (this.gunner && !this.gunner.dead) {
      mg.visible = true;
      this.gunner.model.userData.parts.gunPivot.visible = false;
      mg.rotation.y = this.gunner.yaw - this.model.rotation.y;
      mg.rotation.x = this.gunner.aimPitch;
    } else mg.rotation.x = -0.4;
    if (this.pos.z > 140) this.removed = true;
    this.syncCollider();
  }
}

// --------------------------------------------------------------------------
// Projectiles
export class Rocket {
  constructor(game, pos, dir, owner, speed = 55) {
    this.game = game;
    this.pos = pos.clone();
    this.vel = dir.clone().multiplyScalar(speed);
    this.owner = owner;
    this.life = 4;
    const m = new THREE.Group();
    const mt = new THREE.MeshStandardMaterial({ color: 0x4b5233, roughness: 0.7 });
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 10), mt);
    head.rotation.x = Math.PI / 2; head.position.z = 0.25;
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8), mt);
    tail.rotation.x = Math.PI / 2; tail.position.z = -0.1;
    m.add(head, tail);
    this.mesh = m;
    game.scene.add(m);
    this.inherit = !!owner?.mount || (owner?.isHuman && game.stage?.scrolling);
    audio.play('rocket', pos, 0.9);
  }

  update(dt) {
    const g = this.game;
    this.life -= dt;
    const step = this.vel.length() * dt;
    _d.copy(this.vel).normalize();
    const hit = g.sweep(this.pos, _d, step, this.owner);
    if (hit || this.life <= 0) {
      const p = hit ? this.pos.clone().addScaledVector(_d, Math.max(0, hit.t - 0.1)) : this.pos;
      g.explode(p, { radius: 6.5, dmg: 240, owner: this.owner, fort: 400, fx: 1.2 });
      if (hit && hit.vehicle) hit.vehicle.damage(240, this.owner, true);
      this.dead = true;
      g.scene.remove(this.mesh);
      return;
    }
    this.vel.y -= 1.5 * dt;
    this.pos.addScaledVector(this.vel, dt);
    this.mesh.position.copy(this.pos);
    this.mesh.lookAt(_v.copy(this.pos).add(this.vel));
    g.fx.trail(this.pos);
  }
}

export class Thrown {
  constructor(game, kind, pos, vel, owner) {
    this.game = game;
    this.kind = kind; // 'molotov' | 'flare'
    this.pos = pos.clone();
    this.vel = vel.clone();
    this.owner = owner;
    this.t = 0;
    this.mesh = makeGun(kind === 'molotov' ? 'molotov' : 'flaregun');
    if (kind === 'flare') {
      this.mesh = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff4040 }));
    }
    game.scene.add(this.mesh);
  }

  update(dt) {
    const g = this.game;
    this.t += dt;
    this.vel.y -= (this.kind === 'flare' ? 4 : 16) * dt;
    const sp = this.vel.length();
    _d.copy(this.vel).normalize();
    const hit = g.sweep(this.pos, _d, sp * dt, this.owner, true);
    if (this.kind === 'flare') g.fx.glow(this.pos, [1, 0.3, 0.25], 0.6, 0.1);
    if (hit || (this.kind === 'flare' && this.t > 0.9) || this.t > 6) {
      const p = hit ? this.pos.clone().addScaledVector(_d, Math.max(0, hit.t - 0.15)) : this.pos.clone();
      if (this.kind === 'molotov') g.spawnFire(p, this.owner);
      else g.spawnFlare(p, this.owner);
      this.dead = true;
      g.scene.remove(this.mesh);
      return;
    }
    this.pos.addScaledVector(this.vel, dt);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.x += dt * 10;
  }
}
