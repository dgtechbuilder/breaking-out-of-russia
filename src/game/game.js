// Game orchestrator: owns the world, entities, combat resolution and rendering.
import * as THREE from 'three';
import { World } from '../core/world.js';
import { FX } from '../core/fx.js';
import { audio } from '../core/audio.js';
import { settings } from '../core/input.js';
import { mat, makeGun } from '../core/models.js';
import { rand, pick, chance, spreadDir, dist2D, clamp } from '../core/util.js';
import { Player, PLAYER_LOOKS } from './player.js';
import { Ally } from './ally.js';
import { Enemy, ENEMY_TYPES } from './enemy.js';
import { Drone, TransportTruck, Rocket, Thrown } from './entities.js';
import { Weapon, WEAPONS, PART_NAMES } from './weapons.js';
import { Momentum } from './momentum.js';
import { HUD } from './hud.js';
import { WorkbenchUI } from './workbench.js';
import { glyph } from '../core/glyphs.js';

export const DIFFICULTY = {
  recruit: { label: 'Recruit', enemyAcc: 0.7, enemyHp: 0.85, react: 1.25, playerDmg: 0.7 },
  veteran: { label: 'Veteran', enemyAcc: 1.0, enemyHp: 1.0, react: 1.0, playerDmg: 1.0 },
  hardened: { label: 'Hardened', enemyAcc: 1.25, enemyHp: 1.15, react: 0.8, playerDmg: 1.3 },
};

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

export class Game {
  constructor({ renderer, hudRoot, stage, difficulty = 'veteran', inputs, onEnd, onPause }) {
    this.renderer = renderer;
    this.hudRoot = hudRoot;
    this.stage = stage;
    this.diff = DIFFICULTY[difficulty] || DIFFICULTY.veteran;
    this.diffId = difficulty;
    this.onEnd = onEnd;
    this.onPause = onPause;
    this.time = 0;
    this.frameNo = 0;
    this.paused = false;
    this.over = false;

    this.scene = new THREE.Scene();
    this.world = new World(this.scene);
    this.fx = new FX(this.scene);
    this.momentum = new Momentum(this);

    this.players = []; this.allies = []; this.squad = [];
    this.enemies = []; this.drones = []; this.vehicles = [];
    this.projectiles = []; this.fires = []; this.flares = []; this.strikes = [];
    this.pickups = []; this.interactables = []; this.worldMarkers = []; this.mapFeatures = [];
    this.stash = { optic: 0, drum: 0, suppressor: 0, fuel: 0, flarekit: 0 };
    this.objective = null;
    this.alarm = false;
    this.reinf = { active: false, timer: 0, interval: 45, spawn: null };
    this.jammed = 0;
    this.failT = 0;
    this.stats = { kills: 0, headshots: 0, revives: 0, downs: 0, callins: 0 };
    this.spawnPoints = [];
    this.truck = null;
    this.truckHpText = '';

    this.setupScene();
    stage.build(this);
    this.indoor = this.world.indoor;
    this.spawnSquad(inputs);
    this.setupGuide();
    if (this.world.nav) this.world.rebuildNav();
  }

  // ------------------------------------------------------------------ setup
  setupScene() {
    const st = this.stage;
    const env = st.env;
    this.scene.background = new THREE.Color(env.sky);
    this.scene.fog = new THREE.Fog(env.fog ?? env.sky, env.fogNear ?? 30, env.fogFar ?? 220);
    this.hemi = new THREE.HemisphereLight(env.skyLight, env.groundLight, env.hemi ?? 1.2);
    this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(env.sunColor, env.sun ?? 1.8);
    sun.position.set(env.sunDir[0] * 60, env.sunDir[1] * 60, env.sunDir[2] * 60);
    sun.castShadow = !settings.lowQuality;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 200;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.03;
    this.scene.add(sun, sun.target);
    this.sun = sun;
    this.sunOffset = sun.position.clone();
    // Ground
    const gm = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), mat(env.ground, { rough: 1 }));
    gm.rotation.x = -Math.PI / 2;
    gm.receiveShadow = true;
    this.scene.add(gm);
    this.groundMesh = gm;
    // Snow
    if (env.snow) {
      const n = settings.lowQuality ? 600 : 1800;
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { pos[i * 3] = rand(-40, 40); pos[i * 3 + 1] = rand(0, 25); pos[i * 3 + 2] = rand(-40, 40); }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const c = document.createElement('canvas'); c.width = c.height = 32;
      const cx = c.getContext('2d');
      const grd = cx.createRadialGradient(16, 16, 0, 16, 16, 16);
      grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.6)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      cx.fillStyle = grd; cx.fillRect(0, 0, 32, 32);
      const tex = new THREE.CanvasTexture(c);
      this.snow = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.07, map: tex, transparent: true, opacity: 0.9, depthWrite: false }));
      this.snow.frustumCulled = false;
      this.scene.add(this.snow);
    }
    // Sniper laser template
    this.laserGeo = new THREE.BoxGeometry(0.012, 0.012, 1);
    this.laserGeo.translate(0, 0, 0.5);
  }

  makeLaser() {
    const m = new THREE.Mesh(this.laserGeo, new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.visible = false;
    m.frustumCulled = false;
    this.scene.add(m);
    return m;
  }

  spawnSquad(inputs) {
    const n = inputs.length;
    for (let i = 0; i < 4; i++) {
      const sp = this.spawnPoints[i] || this.spawnPoints[0] || { x: 0, z: 0 };
      if (i < n) {
        const p = new Player(this, i, inputs[i], PLAYER_LOOKS[i]);
        p.pos.set(sp.x, sp.y || 0, sp.z);
        p.yaw = this.stage.spawnYaw ?? 0;
        this.stage.loadout?.(p, this);
        p.rebuildViewmodel();
        p.hud = new HUD(this, p, this.hudRoot);
        this.players.push(p);
        this.squad.push(p);
      } else {
        const look = PLAYER_LOOKS[i];
        const a = new Ally(this, look.name, { skin: look.skin, top: look.top, pants: look.pants, hat: look.hat, hatColor: look.hatColor, band: look.band, band2: look.band }, i - n);
        a.pos.set(sp.x, sp.y || 0, sp.z);
        a.yaw = this.stage.spawnYaw ?? 0;
        if (this.stage.allyWeapon) a.setWeapon(typeof this.stage.allyWeapon === 'function' ? this.stage.allyWeapon(i) : this.stage.allyWeapon);
        this.allies.push(a);
        this.squad.push(a);
      }
    }
    this.layoutViewports();
    this.stage.afterSpawn?.(this);
  }

  layoutViewports() {
    const W = window.innerWidth, H = window.innerHeight;
    const n = this.players.length;
    const rects = n === 1 ? [[0, 0, W, H]]
      : n === 2 ? [[0, 0, W / 2, H], [W / 2, 0, W / 2, H]]
      : [[0, 0, W / 2, H / 2], [W / 2, 0, W / 2, H / 2], [0, H / 2, W / 2, H / 2], [W / 2, H / 2, W / 2, H / 2]];
    this.players.forEach((p, i) => {
      const [x, y, w, h] = rects[i];
      p.viewport = { x: Math.floor(x), y: Math.floor(y), w: Math.floor(w), h: Math.floor(h) };
      p.camera.aspect = w / h; p.camera.updateProjectionMatrix();
      p.vmCam.aspect = w / h; p.vmCam.updateProjectionMatrix();
      p.hud.layout(p.viewport, H);
    });
  }

  setupGuide() {
    const n = 48;
    const geo = new THREE.PlaneGeometry(0.16, 0.36);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.MeshBasicMaterial({ color: 0xff3b2a, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false });
    this.guide = new THREE.InstancedMesh(geo, m, n);
    this.guide.count = 0;
    this.guide.frustumCulled = false;
    this.guide.renderOrder = 1;
    this.scene.add(this.guide);
    this.guideT = 0;
  }

  updateGuide(dt) {
    this.guideT -= dt;
    if (this.guideT > 0) return;
    this.guideT = 0.5;
    const p = this.players.find((x) => !x.dead) || this.players[0];
    const obj = this.objective;
    if (!obj || !obj.pos || !this.world.nav || obj.guide === false || !p) { this.guide.count = 0; return; }
    const path = this.world.findPath(p.pos, obj.pos, 6000);
    if (!path) { this.guide.count = 0; return; }
    const pts = [{ x: p.pos.x, z: p.pos.z }, ...path];
    const dummy = new THREE.Object3D();
    let count = 0, carry = 3.2, travelled = 0;
    for (let i = 0; i < pts.length - 1 && count < this.guide.instanceMatrix.count; i++) {
      const a = pts[i], b = pts[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz);
      let s = carry;
      while (s < L && count < this.guide.instanceMatrix.count && travelled + s < 60) {
        dummy.position.set(a.x + (dx / L) * s, 0.05, a.z + (dz / L) * s);
        dummy.rotation.set(0, Math.atan2(-dx, -dz), 0);
        dummy.updateMatrix();
        this.guide.setMatrixAt(count++, dummy.matrix);
        s += 1.3;
      }
      carry = s - L;
      travelled += L;
    }
    this.guide.count = count;
    this.guide.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------------ helpers
  squadCentroid() {
    const c = this._centroid || (this._centroid = new THREE.Vector3());
    c.set(0, 0, 0);
    let n = 0;
    for (const s of this.squad) if (!s.dead) { c.add(s.pos); n++; }
    if (n) c.multiplyScalar(1 / n);
    return c;
  }

  spottedBy(t) { return this.drones.some((d) => !d.dead && d.spot === t); }

  setObjective(o) {
    const changed = !this.objective || this.objective.text !== o?.text;
    this.objective = o;
    this.guideT = 0;
    if (o && changed && this.time > 0.5) {
      audio.play('objective', null, 0.5);
      this.popup(o.text, null, 'objective');
    }
  }

  popup(text, player = null, kind = 'info') {
    for (const p of this.players) if (!player || player === p) p.hud.popup(text, kind);
  }

  feed(text, color) { for (const p of this.players) p.hud.feed(text, color); }

  addInteractable(o) { this.interactables.push(o); return o; }

  findInteractable(p) {
    if (p.downed || p.ui) return null;
    let best = null, bd = Infinity;
    // Revive
    for (const s of this.squad) {
      if (s === p || !s.downed || s.dead) continue;
      const d = dist2D(s.pos, p.pos);
      if (d < 2.2 && d < bd) {
        bd = d;
        const rt = this.reviveTime(p);
        best = {
          key: 'revive' + s.id, hold: rt, text: `Hold <kbd>${glyph(p, 'interact')}</kbd> Revive <b>${s.name}</b>`,
          onHold: (pl, dt) => { s.reviveProgress = Math.min(1, s.reviveProgress + dt / rt); s.reviveFrame = this.frameNo; s.reviveBy = pl; },
          action: (pl) => this.revive(s, pl),
        };
      }
    }
    if (best) return best;
    const key = glyph(p, 'interact');
    for (const o of this.interactables) {
      if (o.dead || (o.enabled && !o.enabled(p))) continue;
      const d = dist2D(o.pos, p.pos);
      if (d > (o.radius || 2.2) || d >= bd || Math.abs((o.pos.y || 0) - p.pos.y) > 2.5) continue;
      bd = d;
      const text = typeof o.text === 'function' ? o.text(p) : o.text;
      best = { key: o.key || ('i' + this.interactables.indexOf(o)), hold: o.hold, text: text.replace('{key}', `<kbd>${key}</kbd>`), action: o.action, onHold: o.onHold };
    }
    if (best) return best;
    // Weapon pickups (swap)
    for (const k of this.pickups) {
      if (k.kind !== 'weapon' || k.dead) continue;
      const d = dist2D(k.pos, p.pos);
      if (d > 2.0 || d >= bd) continue;
      const w = k.data;
      const have = p.weapons[w.def.slot];
      if (have && have.type === w.type) continue;
      bd = d;
      best = {
        key: 'pick' + k.id,
        text: `<kbd>${key}</kbd> ${have && have.type !== 'shovel' ? `Swap ${have.def.name} for` : 'Take'} <b>${w.name}</b>`,
        action: (pl) => this.takeWeapon(pl, k),
      };
    }
    return best;
  }

  reviveTime() { return 2.2; }

  openWorkbench(p) {
    if (p.ui) return;
    p.ui = new WorkbenchUI(this, p);
    audio.play('click', null, 0.5);
  }

  requestPause() {
    const busy = this.players.find((p) => p.ui);
    if (busy) { busy.ui.close(); return; }
    this.onPause?.();
  }

  // ------------------------------------------------------------------ spawning
  spawnEnemy(type, pos, opts = {}) {
    const e = new Enemy(this, type, new THREE.Vector3(pos.x, pos.y || 0, pos.z), opts);
    this.enemies.push(e);
    return e;
  }

  spawnDrone(pos) {
    const d = new Drone(this, new THREE.Vector3(pos.x, pos.y ?? 18, pos.z));
    this.drones.push(d);
    return d;
  }

  spawnTransport(route, troops, opts) {
    const t = new TransportTruck(this, route, troops, opts);
    this.vehicles.push(t);
    audio.play('truckHit', t.pos, 0.3);
    return t;
  }

  spawnPickup(kind, pos, data, opts = {}) {
    let mesh;
    if (kind === 'weapon') {
      mesh = makeGun(data.type, data.att);
      mesh.rotation.set(0, rand(0, Math.PI * 2), Math.PI / 2);
      mesh.scale.setScalar(1.15);
    } else {
      mesh = new THREE.Group();
      const colors = { part: 0x3ac8ff, fuel: 0xd23a2a, flarekit: 0xff7a1a, ammo: 0x7a8a3a, molotov: 0x6b8f4a };
      const c = colors[kind] || 0xffffff;
      const b = new THREE.Mesh(new THREE.BoxGeometry(kind === 'fuel' ? 0.35 : 0.4, kind === 'fuel' ? 0.45 : 0.25, 0.28), mat(c, { emissive: c, ei: 0.35 }));
      b.castShadow = true;
      mesh.add(b);
    }
    mesh.position.set(pos.x, (pos.y || 0) + 0.35, pos.z);
    this.scene.add(mesh);
    // glow ring for readability
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.55, 20), new THREE.MeshBasicMaterial({ color: kind === 'weapon' ? 0xffd27a : 0x3ac8ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, (pos.y || 0) + 0.04, pos.z);
    this.scene.add(ring);
    const k = { id: Math.random().toString(36).slice(2), kind, pos: new THREE.Vector3(pos.x, pos.y || 0, pos.z), data, mesh, ring, ttl: opts.ttl ?? (opts.permanent ? Infinity : 75), t: rand(0, 6), dead: false };
    this.pickups.push(k);
    return k;
  }

  removePickup(k) {
    k.dead = true;
    this.scene.remove(k.mesh);
    this.scene.remove(k.ring);
  }

  takeWeapon(p, k) {
    const w = k.data;
    const old = p.giveWeapon(w);
    this.removePickup(k);
    if (old) this.spawnPickup('weapon', p.pos, old);
    audio.play('pickup', null, 0.6);
    this.popup(`Picked up ${w.name}`, p, 'info');
  }

  updatePickups(dt) {
    for (const k of this.pickups) {
      if (k.dead) continue;
      k.t += dt;
      k.ttl -= dt;
      if (k.ttl <= 0) { this.removePickup(k); continue; }
      k.mesh.position.y = k.pos.y + 0.35 + Math.sin(k.t * 2.5) * 0.06;
      k.mesh.rotation.y += dt * 0.8;
      for (const p of this.players) {
        if (p.dead || p.downed || dist2D(k.pos, p.pos) > 1.5 || Math.abs(k.pos.y - p.pos.y) > 1.5) continue;
        if (k.kind === 'weapon') {
          const have = p.weapons.find((w) => w && w.type === k.data.type);
          if (have && have.reserve < have.def.reserveMax) {
            const got = have.addAmmo(k.data.mag + k.data.reserve);
            if (got > 0) {
              this.popup(`+${got} ${have.def.name} ammo`, p, 'ammo');
              audio.play('pickup', null, 0.35);
              this.removePickup(k);
              break;
            }
          }
        } else {
          this.collect(p, k);
          break;
        }
      }
    }
    if (this.frameNo % 120 === 0) this.pickups = this.pickups.filter((k) => !k.dead);
  }

  collect(p, k) {
    const st = this.stash;
    let msg = '';
    if (k.kind === 'part') { st[k.data]++; msg = `${PART_NAMES[k.data]} → squad stash (use a workbench)`; }
    else if (k.kind === 'fuel') {
      if (p.molotovs < 4) { p.molotovs++; msg = 'Brewed a Molotov from motor-pool fuel'; }
      else { st.fuel++; msg = 'Fuel → squad stash'; }
    } else if (k.kind === 'flarekit') {
      if (p.flares < 4) { p.flares = Math.min(4, p.flares + 2); msg = '+2 rigged flare rounds'; }
      else { st.flarekit++; msg = 'Flare kit → squad stash'; }
    } else if (k.kind === 'ammo') {
      for (const w of p.weapons) if (w && !w.def.melee) w.addAmmo(Math.ceil(w.def.reserveMax * 0.5));
      msg = 'Ammo crate: reserves refilled';
    }
    this.removePickup(k);
    audio.play('pickup', null, 0.55);
    this.popup(msg, p, 'ammo');
  }

  // ------------------------------------------------------------------ combat
  hitscan(o, d, maxT, shooter) {
    const res = this.world.raycast(o, d, maxT);
    let best = res ? res.t : maxT;
    let actor = null, head = false, drone = null;
    const foes = shooter.team === 'squad' ? this.enemies : this.squad;
    for (const a of foes) {
      if (a.dead) continue;
      const t = a.hitTest(o, d, best);
      if (t < best) { best = t; actor = a; head = a._head; drone = null; }
    }
    if (shooter.team === 'squad') {
      for (const dr of this.drones) {
        const t = dr.hitTest(o, d, best);
        if (t < best) { best = t; drone = dr; actor = null; }
      }
    }
    const point = new THREE.Vector3().copy(o).addScaledVector(d, best);
    return {
      t: best, point, actor, head, drone,
      collider: !actor && !drone && res && Math.abs(res.t - best) < 1e-4 ? res.collider : null,
      normal: res ? res.normal : new THREE.Vector3(0, 1, 0),
      world: !actor && !drone && !!res && Math.abs(res.t - best) < 1e-4,
    };
  }

  /** Swept test for projectiles. */
  sweep(pos, dir, len, owner, worldOnly = false) {
    const res = this.world.raycast(pos, dir, len);
    let best = res ? res.t : Infinity;
    let vehicle = res && res.collider ? res.collider.vehicle : null;
    if (!worldOnly) {
      const foes = owner && owner.team === 'enemy' ? this.squad : this.enemies;
      for (const a of foes) {
        if (a.dead || a === owner) continue;
        const t = a.hitTest(pos, dir, Math.min(best, len));
        if (t < best) { best = t; vehicle = null; }
      }
      if (!owner || owner.team === 'squad') for (const dr of this.drones) {
        const t = dr.hitTest(pos, dir, Math.min(best, len));
        if (t < best) { best = t; vehicle = null; }
      }
    }
    return best <= len ? { t: best, vehicle } : null;
  }

  playerFire(p, w, origin, dir, spread) {
    const def = w.def;
    const muzzle = p.muzzleWorld(new THREE.Vector3());
    if (def.projectile === 'rocket') {
      const d = spreadDir(dir, spread, new THREE.Vector3());
      const r = new Rocket(this, origin.clone().addScaledVector(d, 0.9), d, p, 62);
      this.projectiles.push(r);
      this.noise(origin, 80, p);
      this.fx.smoke(origin.clone().addScaledVector(d, -1.2), [0.7, 0.7, 0.7], 1.5);
      return;
    }
    const d = spreadDir(dir, spread, new THREE.Vector3());
    const h = this.hitscan(origin, d, def.range * 2.5, p);
    const falloff = h.t > def.range ? 0.7 : 1;
    if (h.actor) {
      const dmg = w.dmg * falloff * (h.head ? def.headMult || 2 : 1);
      p.stats.hits++;
      this.damageActor(h.actor, dmg, p, { head: h.head, dir: d, weapon: w.type });
    } else if (h.drone) {
      h.drone.damage(w.dmg, p);
      p.hitmarker = 0.15; p.hitKill = h.drone.dead;
      audio.play('hit', null, 0.4);
    } else if (h.world) {
      this.impactFX(h.point, h.normal, h.collider);
      if (h.collider) {
        if (h.collider.vehicle && !h.collider.vehicle.friendly) { h.collider.vehicle.damage(w.dmg, p, false); p.hitmarker = 0.1; p.hitKill = false; }
        else if (h.collider.hp != null && !h.collider.explosiveOnly) this.damageCollider(h.collider, w.dmg, p);
      }
    }
    if (!w.suppressed || chance(0.3)) this.fx.tracer(muzzle, h.point, w.suppressed ? 0xbfd8ff : 0xffd27a);
    if (!w.suppressed) this.fx.flash(muzzle, 0xffb060, 2.5, 8, 0.05);
    audio.play(w.suppressed ? 'suppressed' : def.sound, null, 0.75);
    this.noise(origin, w.suppressed ? 9 : 70, p);
  }

  playerMelee(p) {
    audio.play('melee', p.pos, 0.6);
    const o = p.eye(new THREE.Vector3());
    const fwd = p.camera.getWorldDirection(new THREE.Vector3());
    let best = null, bd = 2.6;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const to = _v.subVectors(e.chest(_v2), o);
      const d = to.length();
      if (d > bd) continue;
      if (to.normalize().dot(fwd) < 0.6) continue;
      best = e; bd = d;
    }
    if (best) {
      // Takedowns: unaware or hit from behind = instant kill.
      const behind = Math.cos(best.yaw - p.yaw) > 0.3;
      const dmg = best.state !== 'combat' || behind ? 999 : 75;
      this.fx.blood(best.chest(new THREE.Vector3()), fwd);
      this.damageActor(best, dmg, p, { melee: true, dir: fwd });
      p.shake = 0.3;
      if (best.dead && dmg === 999) this.popup('SILENT TAKEDOWN', p, 'chain');
    } else {
      const h = this.world.raycast(o, fwd, 2.2);
      if (h) this.impactFX(h.point, h.normal, h.collider);
    }
  }

  impactFX(p, n, collider) {
    if (collider && collider.material === 'metal') this.fx.sparks(p, n);
    else if (collider && collider.material === 'wood') this.fx.dust(p, n, [0.45, 0.33, 0.2]);
    else if (!collider) this.fx.dust(p, n, this.stage.env.snow ? [0.9, 0.92, 0.95] : [0.55, 0.5, 0.45]);
    else this.fx.dust(p, n);
    if (chance(0.3)) this.fx.sparks(p, n);
  }

  damageActor(t, amount, src, info = {}) {
    if (t.dead) return;
    if (t.team === 'enemy') {
      if (t.hidden) return;
      t.hp -= amount;
      t.onDamaged(src);
      if (!info.fire) this.fx.blood(t.chest(_v), info.dir);
      if (src && src.isHuman) {
        src.hitmarker = 0.18; src.hitKill = false;
        audio.play(info.head ? 'headshot' : 'hit', null, 0.45);
      }
      if (t.hp <= 0) {
        this.killEnemy(t, src, info);
        if (src && src.isHuman) { src.hitKill = true; audio.play('kill', null, 0.4); }
      }
      return;
    }
    // Squad member
    if (t.downed || t.surrendered || t.hidden) return;
    if (t.dodging && !info.explosive && !info.fire) return; // rolled out of the line of fire
    if (t.isHuman) amount *= this.diff.playerDmg; else amount *= 0.75;
    if (t.armor > 0) { const a = Math.min(t.armor, amount * 0.75); t.armor -= a; amount -= a; }
    t.hp -= amount;
    t.hurtT = 0.25;
    t.regenT = 4.5;
    if (t.isHuman) {
      if (info.dir) t.hud.damageFrom(info.dir);
      if (!t._hurtSnd || this.time - t._hurtSnd > 0.25) { audio.play('hurt', null, 0.5); t._hurtSnd = this.time; }
      t.shake = Math.max(t.shake, 0.15);
      t.rumble?.(0.6, 0.3, 140);
    }
    if (t.hp <= 0) this.downActor(t);
  }

  killEnemy(e, src, info = {}) {
    if (e.dead) return;
    e.die();
    this.stats.kills++;
    if (info.head) this.stats.headshots++;
    if (src && src.isHuman) { src.stats.kills++; if (info.head) src.stats.headshots++; }
    this.momentum.onKill(src, info.head);
    const who = src ? src.name : 'Squad';
    this.feed(`${who} ${info.head ? '⌖ ' : ''}✕ ${ENEMY_TYPES[e.type] ? e.type : 'guard'}`, src && src.color != null ? '#' + src.color.toString(16).padStart(6, '0') : null);
    if (!e.noDrop && !e.mount) this.dropLoot(e);
    this.stage.onKill?.(this, e, src);
    // Corpse cleanup
    const deadList = this.enemies.filter((x) => x.dead);
    if (deadList.length > 28) { const old = deadList[0]; old.removeModel(); this.enemies.splice(this.enemies.indexOf(old), 1); }
  }

  dropLoot(e) {
    const T = e.T;
    const pos = e.pos.clone();
    if (T.drop && (T.drop !== 'rpg' || chance(0.85))) {
      const def = WEAPONS[T.drop];
      const w = new Weapon(T.drop, { mag: def.mag, reserve: Math.ceil(def.mag * (def.slot === 2 ? 1 : 0.8)) });
      if (chance(0.06) && w.canAttach('optic')) w.att.optic = true;
      this.spawnPickup('weapon', pos, w);
    }
    if (chance(0.25)) this.spawnPickup('weapon', pos.clone().add(new THREE.Vector3(rand(-0.6, 0.6), 0, rand(-0.6, 0.6))), new Weapon('makarov', { mag: 8, reserve: 8 }));
    const lootBias = this.stage.lootBias || 1;
    const off = () => pos.clone().add(new THREE.Vector3(rand(-0.8, 0.8), 0, rand(-0.8, 0.8)));
    if (T.part) this.spawnPickup('part', off(), T.part);
    else if (chance(0.13 * lootBias)) this.spawnPickup('part', off(), pick(['optic', 'drum', 'suppressor']));
    if (chance(0.05 * lootBias)) this.spawnPickup('flarekit', off());
    if (chance(0.04 * lootBias)) this.spawnPickup('fuel', off());
  }

  downActor(t) {
    t.downed = true;
    t.hp = 0; t.armor = 0;
    t.bleed = t.isHuman ? 32 : 40;
    t.reviveProgress = 0;
    t.vel.set(0, t.vel.y, 0);
    t.sliding = 0; t.crouch = false;
    t.setDowned?.(true);
    this.stats.downs++;
    if (t.isHuman) t.stats.downs++;
    this.popup(`${t.name} is down!`, null, 'warn');
    audio.play('down', null, 0.5);
  }

  revive(t, by) {
    if (!t.downed || t.dead) return;
    t.downed = false;
    t.hp = t.maxHp * 0.5;
    t.bleed = 0; t.reviveProgress = 0; t.regenT = 2;
    t.setDowned?.(false);
    this.stats.revives++;
    if (by && by.isHuman) { by.stats.revives++; this.momentum.add(10, by); }
    this.popup(`${by ? by.name : 'Squad'} revived ${t.name}`, null, 'good');
    audio.play('revive', null, 0.5);
  }

  respawnPlayer(p, near) {
    const sp = this.stage.respawnPos?.(this, p);
    if (sp) { p.respawnAt(sp); this.popup(`${p.name} rejoined the squad`, null, 'good'); return; }
    const pos = near.pos.clone();
    for (let i = 0; i < 8; i++) {
      const a = rand(0, Math.PI * 2);
      const x = near.pos.x + Math.cos(a) * 1.8, z = near.pos.z + Math.sin(a) * 1.8;
      if (this.world.walkable(x, z)) { pos.x = x; pos.z = z; break; }
    }
    p.respawnAt(pos);
    this.popup(`${p.name} rejoined the squad`, null, 'good');
  }

  noise(pos, radius, src) {
    for (const e of this.enemies) {
      if (e.dead || e.state === 'combat') continue;
      if (e.pos.distanceTo(pos) < radius) e.alert(pos, src);
    }
  }

  onEnemyCombat(e) {
    if (!this.alarm) {
      this.alarm = true;
      audio.play('alarm', null, 0.35);
      this.popup('ALARM RAISED', null, 'warn');
      this.stage.onAlarm?.(this);
    }
    // Shout to nearby comrades.
    setTimeout(() => {
      if (e.dead || this.over) return;
      for (const o of this.enemies) {
        if (o === e || o.dead || o.state === 'combat') continue;
        if (o.pos.distanceTo(e.pos) < 28) { o.alert(e.target ? e.target.pos : e.pos, null); if (e.target && o.pos.distanceTo(e.pos) < 18) o.enterCombat(e.target); }
      }
    }, 900);
  }

  spawnRocket(pos, dir, owner, speed) {
    const r = new Rocket(this, pos, dir, owner, speed);
    this.projectiles.push(r);
    return r;
  }

  throwMolotov(p) {
    const o = p.eye(new THREE.Vector3());
    const d = p.camera.getWorldDirection(new THREE.Vector3());
    const v = d.multiplyScalar(17).add(new THREE.Vector3(0, 3.5, 0));
    this.projectiles.push(new Thrown(this, 'molotov', o, v, p));
    audio.play('throw', null, 0.5);
  }

  fireFlare(p) {
    const o = p.eye(new THREE.Vector3());
    const d = p.camera.getWorldDirection(new THREE.Vector3());
    this.projectiles.push(new Thrown(this, 'flare', o.addScaledVector(d, 0.6), d.multiplyScalar(48), p));
    audio.play('flare', null, 0.7);
  }

  spawnFire(pos, owner) {
    const f = { pos: pos.clone().setY(Math.max(this.world.groundY, pos.y - 0.2)), r: 3.3, life: 8, owner, intensity: 4, dead: false };
    this.fires.push(f);
    this.fx.persistentLight(f, 0xff7a2a, 12);
    this.fx.explosion(f.pos, 0.35);
    audio.play('glass', pos, 0.9);
    this.noise(pos, 30, owner);
  }

  spawnFlare(pos, owner) {
    const f = { pos: pos.clone(), life: 11, owner, intensity: 6, dead: false, vy: -0.5 };
    if (f.pos.y < 2) f.pos.y = 2;
    this.flares.push(f);
    this.fx.persistentLight(f, 0xff5040, 30);
    audio.play('flare', pos, 0.8);
    this.fx.electric(pos, 0.6);
  }

  explode(pos, { radius = 6, dmg = 200, owner = null, fort = 0, fx = 1 } = {}) {
    this.fx.explosion(pos, fx);
    audio.play('explosion', pos, 1);
    const enemyOwned = owner && owner.team === 'enemy' || owner === null;
    for (const p of this.players) {
      const d = p.pos.distanceTo(pos);
      if (d < radius * 4) { const k = clamp(1.2 - d / (radius * 4), 0, 1); p.shake = Math.max(p.shake, k); p.rumble(k, k * 0.6, 300); }
    }
    const from = pos.clone(); from.y += 0.4;
    const hitList = [...this.enemies, ...this.squad];
    for (const a of hitList) {
      if (a.dead || a.hidden) continue;
      const c = a.chest(_v);
      const d = c.distanceTo(pos);
      if (d > radius) continue;
      if (!this.world.clear(from, c) && d > 1.5) continue;
      const f = 1 - d / radius;
      let n = dmg * (0.35 + 0.65 * f);
      if (a.team === 'squad') {
        if (!enemyOwned) n *= 0.2;
        else n *= 0.42;
      }
      this.damageActor(a, n, owner, { explosive: true, dir: _v2.subVectors(c, pos).normalize().clone() });
    }
    for (const dr of this.drones) if (!dr.dead && dr.pos.distanceTo(pos) < radius + 2) dr.destroy(owner);
    for (const v of this.vehicles) {
      if (v.dead || v.collider?.dead) continue;
      const d = v.pos.distanceTo(pos);
      if (d < radius + 3) v.damage(dmg * (1 - d / (radius + 3)), owner, true);
    }
    if (this.truck && enemyOwned) {
      const d = dist2D(this.truck.pos, pos);
      if (d < radius + 2) this.truck.damage?.(dmg * 0.25 * (1 - d / (radius + 2)));
    }
    const fd = fort || dmg;
    for (const c of [...this.world.colliders]) {
      if (c.hp == null || c.dead) continue;
      const dx = Math.max(c.min.x - pos.x, 0, pos.x - c.max.x);
      const dy = Math.max(c.min.y - pos.y, 0, pos.y - c.max.y);
      const dz = Math.max(c.min.z - pos.z, 0, pos.z - c.max.z);
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < radius) this.damageCollider(c, fd * (1 - d / radius * 0.6), owner);
    }
    this.noise(pos, 90, owner && owner.team === 'squad' ? owner : null);
  }

  damageCollider(c, n, src) {
    if (c.dead || c.hp == null) return;
    c.hp -= n;
    if (c.hp <= 0) this.destroyCollider(c, src);
  }

  destroyCollider(c, src) {
    const group = c.group ? this.world.colliders.filter((o) => o.group === c.group) : [c];
    for (const o of group) {
      const p = new THREE.Vector3((o.min.x + o.max.x) / 2, (o.min.y + o.max.y) / 2, (o.min.z + o.max.z) / 2);
      this.fx.dust(p, null, [0.6, 0.6, 0.6]);
      this.fx.smoke(p, [0.5, 0.5, 0.5], 2);
      this.world.removeCollider(o);
    }
    for (const o of group) o.onDestroy?.(this, src);
    if (c.groupMeshes) for (const m of c.groupMeshes) m.parent?.remove(m);
    this.world.rebuildNav();
  }

  enemyMortar(pos) {
    const ring = this.fx.ring(pos, { color: 0xff2a2a, r1: 5, life: 2.6, pulse: true, expand: false, opacity: 0.9 });
    audio.play('mortarWhistle', pos, 0.8);
    this.strikes.push({ pos: pos.clone(), t: 2.5, opts: { radius: 5, dmg: 85, owner: null, fx: 1 }, ring, ground: true });
  }

  // ------------------------------------------------------------------ call-ins
  callIn(id, p) {
    this.stats.callins++;
    if (id === 'jammer') {
      let n = 0;
      for (const d of this.drones) if (!d.dead) { d.destroy(p); n++; }
      this.jammed = 12;
      if (this.reinf.active) this.reinf.timer += 20;
      this.fx.ring(p.pos, { color: 0x5ad0ff, r0: 1, r1: 60, life: 1.0, opacity: 0.9, width: 0.06 });
      this.fx.electric(p.eye(new THREE.Vector3()), 2);
      audio.play('jammer', null, 0.8);
      this.popup(`JAMMER PULSE — ${n} drone${n === 1 ? '' : 's'} fried, radios jammed`, null, 'callin');
      return true;
    }
    if (id === 'rally') {
      for (const s of this.squad) {
        if (s.dead) continue;
        if (s.downed) this.revive(s, p);
        s.hp = s.maxHp;
        s.armor = 100; s.armorT = 25;
        this.fx.ring(s.pos, { color: 0xffc83a, r0: 0.3, r1: 3, life: 0.9, opacity: 0.9 });
      }
      audio.play('rally', null, 0.8);
      this.popup('BROTHERHOOD RALLY — squad armored up', null, 'callin');
      return true;
    }
    if (id === 'mortar') {
      const o = p.camera.getWorldPosition(new THREE.Vector3());
      const d = p.camera.getWorldDirection(new THREE.Vector3());
      const h = this.world.raycast(o, d, 200);
      let target = h ? h.point.clone() : o.clone().addScaledVector(d, 120);
      if (target.distanceTo(p.pos) < 12) {
        this.popup('Too close for the mortar — aim further out', p, 'warn');
        return false;
      }
      target.y = Math.max(this.world.groundY, Math.min(target.y, 8));
      const ring = this.fx.ring(target, { color: 0xff3a2a, r1: 7, life: 4.5, pulse: true, expand: false });
      for (let i = 0; i < 8; i++) {
        const s = target.clone();
        if (i > 0) { const a = rand(0, Math.PI * 2), r = rand(0.5, 6); s.x += Math.cos(a) * r; s.z += Math.sin(a) * r; }
        this.strikes.push({ pos: s, t: 1.8 + i * 0.32, opts: { radius: 6.5, dmg: 280, owner: p, fort: 900, fx: 1.3 }, ring: i === 7 ? ring : null, ground: true });
      }
      this.markerSmoke = { pos: target.clone(), t: 4.5 };
      audio.play('callin', null, 0.7);
      this.popup('STOLEN MORTAR — rounds inbound', null, 'callin');
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ world shift (convoy)
  shiftWorld(dz) {
    const sh = (o) => { o.pos.z += dz; };
    for (const e of this.enemies) if (!e.mount) { e.pos.z += dz; if (e.lastKnown) e.lastKnown.z += dz; if (e.dead) e.model.position.z = e.pos.z; }
    for (const k of this.pickups) { if (k.dead) continue; sh(k); k.mesh.position.z += dz; k.ring.position.z += dz; }
    for (const f of this.fires) sh(f);
    for (const f of this.flares) sh(f);
    for (const s of this.strikes) if (s.ground) { s.pos.z += dz; if (s.ring) s.ring.mesh.position.z += dz; }
    for (const v of this.vehicles) if (v.wreck) v.pos.z += dz;
    if (this.markerSmoke) this.markerSmoke.pos.z += dz;
    this.fx.shift(dz);
  }

  // ------------------------------------------------------------------ main update
  frame(dt) {
    if (!this.paused && !this.over) this.update(dt);
    this.render();
  }

  update(dt) {
    this.time += dt;
    this.frameNo++;
    const soloUI = this.players.length === 1 && this.players[0].ui;

    for (const p of this.players) p.update(dt);
    if (soloUI) {
      for (const p of this.players) p.hud.update(dt);
      return;
    }
    for (const a of this.allies) a.update(dt);
    for (const e of this.enemies) e.update(dt);
    for (const d of this.drones) d.update(dt);
    this.drones = this.drones.filter((d) => !d.removed);
    for (const v of this.vehicles) v.update(dt);
    this.vehicles = this.vehicles.filter((v) => { if (v.removed) { v.cleanup?.(); return false; } return true; });
    for (const pr of this.projectiles) pr.update(dt);
    this.projectiles = this.projectiles.filter((p) => !p.dead);
    this.updateFires(dt);
    this.updatePickups(dt);
    this.updateStrikes(dt);
    this.updateSquadState(dt);
    this.momentum.update(dt);
    if (this.jammed > 0) this.jammed -= dt;

    if (this.reinf.active && this.reinf.spawn) {
      this.reinf.timer -= dt;
      if (this.reinf.timer <= 0) { this.reinf.timer = this.reinf.interval; this.reinf.spawn(this); this.popup('Enemy reinforcements arriving!', null, 'warn'); }
    }
    this.stage.update?.(this, dt);
    this.fx.update(dt);
    this.updateGuide(dt);
    this.updateSnow(dt);
    // Shadow camera follows player 1.
    const lead = this.players[0];
    this.sun.position.copy(lead.pos).add(this.sunOffset);
    this.sun.target.position.copy(lead.pos);
    audio.setListener(lead.camera.position, lead.yaw);
    for (const p of this.players) p.hud.update(dt);
    if (this.world.navDirty) this.world.rebuildNav();
  }

  updateFires(dt) {
    for (const f of this.fires) {
      f.life -= dt;
      if (f.life <= 0) { f.dead = true; continue; }
      const n = f.life > 1 ? 3 : 1;
      for (let i = 0; i < n; i++) this.fx.fire(f.pos, f.r);
      f.intensity = Math.min(4, f.life) * 1.2;
      for (const e of this.enemies) {
        if (e.dead || dist2D(e.pos, f.pos) > f.r || Math.abs(e.pos.y - f.pos.y) > 2) continue;
        this.damageActor(e, 55 * dt, f.owner, { fire: true });
        if (!e.dead && !e.static && !e.mount) { e.goal = { x: e.pos.x + (e.pos.x - f.pos.x) * 2, z: e.pos.z + (e.pos.z - f.pos.z) * 2 }; e.thinkT = 1; }
      }
      for (const s of this.squad) {
        if (s.dead || s.downed || dist2D(s.pos, f.pos) > f.r - 0.5 || Math.abs(s.pos.y - f.pos.y) > 2) continue;
        this.damageActor(s, 14 * dt, null, { fire: true });
      }
    }
    this.fires = this.fires.filter((f) => !f.dead);
    for (const f of this.flares) {
      f.life -= dt;
      if (f.life <= 0) { f.dead = true; continue; }
      f.pos.y = Math.max(1.2, f.pos.y + f.vy * dt);
      this.fx.glow(f.pos, [1, 0.45, 0.35], 1.4 + Math.random() * 0.6, 0.05);
      if (chance(0.5)) this.fx.add.emit(f.pos.x, f.pos.y, f.pos.z, rand(-1, 1), rand(-2, 0), rand(-1, 1), 0.4, 0.12, 0.02, 1, 0.6, 0.4, 1, 3);
      if (chance(0.25)) this.fx.smoke(f.pos, [0.75, 0.55, 0.55], 1);
      f.intensity = 7 * Math.min(1, f.life / 2);
      for (const e of this.enemies) {
        if (e.dead) continue;
        const r = e.type === 'sniper' ? 30 : 17;
        if (e.pos.distanceTo(f.pos) < r) {
          if (e.blind <= 0 && e.type === 'sniper' && f.owner?.isHuman) this.popup('Sniper blinded!', f.owner, 'good');
          e.blind = Math.max(e.blind, 2.5);
        }
      }
    }
    this.flares = this.flares.filter((f) => !f.dead);
    if (this.markerSmoke) {
      this.markerSmoke.t -= dt;
      if (chance(0.6)) this.fx.smoke(this.markerSmoke.pos, [0.85, 0.15, 0.1], 1.2);
      if (this.markerSmoke.t <= 0) this.markerSmoke = null;
    }
  }

  updateStrikes(dt) {
    for (const s of this.strikes) {
      s.t -= dt;
      if (s.t <= 0 && !s.done) {
        s.done = true;
        this.explode(s.pos, s.opts);
        if (s.ring) s.ring.dead = true;
      }
    }
    this.strikes = this.strikes.filter((s) => !s.done);
  }

  updateSquadState(dt) {
    let allDown = true;
    for (const s of this.squad) {
      if (!s.dead && !s.downed) allDown = false;
      if (s.downed && !s.dead) {
        if (s.reviveFrame !== this.frameNo && !(s.reviveBy && s.reviveBy.isReviving)) s.reviveProgress = Math.max(0, s.reviveProgress - dt * 0.5);
        s.reviveBy = null;
        s.bleed -= dt * (s.reviveProgress > 0 ? 0.3 : 1);
        if (s.bleed <= 0) {
          s.dead = true; s.downed = false;
          if (s.isHuman) { s.respawnT = 15; this.popup(`${s.name} bled out`, null, 'warn'); }
          else this.popup(`${s.name} has fallen`, null, 'warn');
        }
      }
    }
    if (allDown && !this.over) {
      this.failT += dt;
      if (this.failT > 2.5) this.fail('Your squad was overrun.');
    } else this.failT = 0;
  }

  updateSnow(dt) {
    if (!this.snow) return;
    const c = this.players[0].pos;
    const a = this.snow.geometry.attributes.position;
    const arr = a.array;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i + 1] -= dt * 2.2;
      arr[i] += Math.sin(this.time + i) * dt * 0.3 + (this.stage.snowWind || 0) * dt;
      arr[i + 2] += (this.stage.snowDrift || 0) * dt;
      if (arr[i + 1] < 0) arr[i + 1] += 25;
      if (this.indoor) for (const z of this.indoor) {
        if (arr[i] > z[0] && arr[i] < z[2] && arr[i + 2] > z[1] && arr[i + 2] < z[3] && arr[i + 1] < z[4]) { arr[i + 1] = 25; break; }
      }
      if (arr[i] - c.x > 40) arr[i] -= 80; else if (arr[i] - c.x < -40) arr[i] += 80;
      if (arr[i + 2] - c.z > 40) arr[i + 2] -= 80; else if (arr[i + 2] - c.z < -40) arr[i + 2] += 80;
    }
    a.needsUpdate = true;
  }

  complete(text) {
    if (this.over) return;
    this.over = true;
    audio.stopEngine();
    setTimeout(() => this.onEnd?.({ win: true, text, stats: this.collectStats() }), 600);
  }

  fail(reason) {
    if (this.over) return;
    this.over = true;
    audio.stopEngine();
    this.onEnd?.({ win: false, text: reason, stats: this.collectStats() });
  }

  collectStats() {
    return {
      time: this.time,
      kills: this.stats.kills,
      headshots: this.stats.headshots,
      revives: this.stats.revives,
      downs: this.stats.downs,
      callins: this.stats.callins,
      players: this.players.map((p) => ({ name: p.name, ...p.stats })),
    };
  }

  // ------------------------------------------------------------------ render
  render() {
    const r = this.renderer;
    const H = window.innerHeight;
    r.setScissorTest(false);
    r.setClearColor(this.scene.background, 1);
    r.clear();
    r.setScissorTest(true);
    for (const p of this.players) {
      const v = p.viewport;
      r.setViewport(v.x, H - v.y - v.h, v.w, v.h);
      r.setScissor(v.x, H - v.y - v.h, v.w, v.h);
      this.fx.setScale(v.h, p.camera.fov);
      r.render(this.scene, p.camera);
      if (!p.dead && !p.driving) {
        r.clearDepth();
        r.render(p.vmScene, p.vmCam);
      }
    }
  }

  dispose() {
    audio.stopEngine();
    for (const p of this.players) { p.hud.destroy(); }
    this.scene.traverse((o) => {
      if (o.geometry && !o.geometry.parameters) o.geometry.dispose?.();
    });
    this.renderer.renderLists.dispose();
  }
}
