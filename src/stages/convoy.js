// Stage 2 — Convoy Hijack: hold the stolen Ural while technicals chase you down the highway.
// The world scrolls past the truck (the truck stays near the origin), which keeps physics simple.
import * as THREE from 'three';
import { M, sandbags } from './common.js';
import { mat, box, cyl, makeTruck, makeTree, mergeGroup } from '../core/models.js';
import { Weapon } from '../game/weapons.js';
import { Technical } from '../game/entities.js';
import { audio } from '../core/audio.js';
import { rand, pick, clamp, damp, chance } from '../core/util.js';

const V = (x, z, y = 0) => new THREE.Vector3(x, y, z);
const _cs = new THREE.Vector3();
const BED_Y = 1.22;
const GOAL = 3300;
const SLOTS = [[-0.7, 3.6], [0.7, 3.6], [-0.7, 1.5], [0.7, 1.5]];

export const convoy = {
  id: 'convoy',
  name: 'Convoy Hijack',
  subtitle: 'Highway M-03 · 40 km behind the line · Dusk',
  intro: [
    'You made it out of the camp in a stolen Ural. Every checkpoint between here and the front has your description.',
    'One of you drives. Everyone else hangs out of the back and keeps the pursuit off the truck.',
    'Technicals will come up behind you. Roadblocks will try to stop you. If the Ural dies, so do you.',
    'Press [E] at the front of the bed to take the wheel. Press [E] again to climb back out.',
  ],
  env: {
    sky: 0x9a8a88, fog: 0x9a8a88, fogNear: 50, fogFar: 300,
    skyLight: 0xffd2b0, groundLight: 0x4a4a55, hemi: 1.0,
    sunColor: 0xffb070, sun: 1.7, sunDir: [-0.45, 0.32, -0.85], ground: 0xd7dbe0, snow: true,
    skyTop: 0x4d5c84, sunGlow: 0xffa868, clouds: 24, cloudColor: 0xf2c4ac, cloudOpacity: 0.85, cloudWind: [0.6, 2], flashBoost: 0.15,
  },
  mapColor: 'rgba(200,205,210,0.6)',
  scrolling: true,
  spawnYaw: Math.PI,
  allyWeapon: (i) => (i === 3 ? 'rpk' : 'ak74'),
  snowDrift: 0,

  loadout(p) {
    p.weapons = [new Weapon('ak74', { reserve: 210 }), new Weapon('makarov'), new Weapon('rpg', { reserve: 3 })];
    p.cur = 0;
    p.molotovs = 2;
    p.flares = 1;
  },

  label(g) { return `${(this.dist / 1000).toFixed(2)} / ${(GOAL / 1000).toFixed(1)} KM`; },

  build(g) {
    const w = g.world;
    const S = g.scene;
    this._scene = S;
    this.dist = 0;
    this.scenery = [];
    this.blocks = [];
    this.obstacles = [];
    this.events = [
      { d: 80, fn: () => this.spawnTech(g, -1, false) },
      { d: 260, fn: () => this.spawnTech(g, 1, true) },
      { d: 480, fn: () => { g.spawnDrone(V(0, 30, 18)); this.spawnBlock(g, 'partial'); } },
      { d: 880, fn: () => { this.spawnTech(g, -1, false); this.spawnTech(g, 1, false); } },
      { d: 1150, fn: () => { this.spawnWreck(g, -2, -300); this.spawnWreck(g, 2.5, -360); } },
      { d: 1300, fn: () => { this.spawnBlock(g, 'full'); g.spawnDrone(V(-10, 20, 20)); } },
      { d: 1900, fn: () => { this.spawnTech(g, 1, true); this.spawnTech(g, -1, false); } },
      { d: 2200, fn: () => { this.spawnBlock(g, 'partial'); this.spawnTech(g, -1, true); } },
      { d: 2550, fn: () => { this.spawnTech(g, 1, false); this.spawnTech(g, -1, true); this.spawnTech(g, 1, false); g.spawnDrone(V(10, 20, 10)); } },
      { d: 2900, fn: () => { this.spawnWreck(g, 1.5, -320); this.spawnBlock(g, 'partial'); } },
    ];

    // Road (static — it is uniform along Z)
    w.addBox(0, -0.02, -600, 14, 0.04, 2000, M.asphalt(), { collide: false });
    const lineM = mat(0xe8e8e0, { rough: 0.8 });
    w.addBox(-6.6, 0.01, -600, 0.15, 0.02, 2000, lineM, { collide: false });
    w.addBox(6.6, 0.01, -600, 0.15, 0.02, 2000, lineM, { collide: false });
    w.addBox(-8.5, 0, -600, 2.5, 0.5, 2000, M.snow(), { collide: false });
    w.addBox(8.5, 0, -600, 2.5, 0.5, 2000, M.snow(), { collide: false });
    g.mapFeatures.push({ x: 0, z: -600, w: 14, d: 2000, color: 'rgba(50,52,56,0.95)' });
    // Scrolling dashes, poles, trees and roadside clutter. Repeating pieces are merged into
    // long strips so the whole roadside costs a few dozen draw calls.
    for (let k = 0; k < 5; k++) {
      const strip = new THREE.Group();
      for (let i = 0; i < 10; i++) box(0.18, 0.02, 3, lineM, 0, 0.015, -i * 12, strip);
      this.addScenery(mergeGroup(strip), 0, -k * 120 + 60, 600, false, 70 + 108);
    }
    for (let i = 0; i < 16; i++) {
      const pole = new THREE.Group();
      cyl(0.1, 0.12, 7, M.woodDark(), 6, 0, 3.5, 0, pole);
      box(1.6, 0.1, 0.1, M.woodDark(), 0, 6.6, 0, pole);
      this.addScenery(mergeGroup(pole), i % 2 ? 9.6 : -9.6, -i * 40 + 60, 640);
    }
    for (let k = 0; k < 6; k++) {
      const strip = new THREE.Group();
      for (let i = 0; i < 15; i++) {
        const side = i % 2 ? 1 : -1;
        const t = makeTree(rand(1.1, 2.2), true);
        t.rotation.y = rand(0, 6);
        t.position.set(side * rand(12, 70), 0, -i * 7);
        strip.add(t);
      }
      this.addScenery(mergeGroup(strip), 0, -k * 105 + 60, 630, true, 70 + 105);
    }
    this.chimneys = [];
    for (let i = 0; i < 6; i++) {
      const hut = new THREE.Group();
      box(6, 3, 5, i % 2 ? M.brick() : M.wood(), 0, 1.5, 0, hut);
      const roof = box(6.6, 0.3, 5.6, M.roof(), 0, 3.4, 0, hut); roof.rotation.z = 0.2;
      box(0.6, 1.6, 0.6, M.brick(), 1.6, 3.8, 1, hut); // chimney
      box(1.2, 1.4, 0.06, mat(0xffc870, { emissive: 0xffb050, ei: 1.2 }), -1.4, 1.6, -2.52, hut); // lit window
      box(1.0, 2.0, 0.06, M.woodDark(), 1.6, 1.0, -2.52, hut); // door
      const m = mergeGroup(hut);
      this.addScenery(m, (i % 2 ? 1 : -1) * rand(22, 40), -i * 105 + 20, 630, true);
      this.chimneys.push(m);
    }
    // Wrecks, barriers, billboards and a knocked-out tank on the verges.
    const verge = (i) => (i % 2 ? 1 : -1);
    for (let i = 0; i < 6; i++) {
      const w2 = new THREE.Group();
      const m = mat(pick([0x2a2624, 0x3a3530, 0x4a3a2e]), { rough: 0.9, edge: 0.6 });
      box(1.9, 0.8, 4.2, m, 0, 0.6, 0, w2);
      box(1.7, 0.6, 2.0, m, 0, 1.3, 0.2, w2);
      box(1.72, 0.42, 0.06, mat(0x141414), 0, 1.3, -0.82, w2);
      for (const [ox, oz] of [[-0.9, -1.3], [0.9, -1.3], [-0.9, 1.3], [0.9, 1.3]]) { const wh = cyl(0.35, 0.35, 0.25, mat(0x111111), 8, ox, 0.3, oz, w2); wh.rotation.z = Math.PI / 2; }
      w2.rotation.set(0, rand(-0.8, 0.8), verge(i) * rand(0.05, 0.25));
      this.addScenery(mergeGroup(w2), verge(i) * rand(10.5, 15), -i * 100 - 30, 600, true);
    }
    for (let i = 0; i < 10; i++) {
      const j = new THREE.Group();
      for (let k = 0; k < 3; k++) {
        box(1.46, 0.4, 0.78, M.concrete(), k * 1.5, 0.2, 0, j);
        box(1.46, 0.8, 0.42, M.concrete(), k * 1.5, 0.8, 0, j);
        box(1.46, 0.06, 0.44, mat(k % 2 ? 0xd8d4c8 : 0xb03a2a, { edge: 0.55 }), k * 1.5, 0.95, 0, j);
      }
      j.rotation.y = Math.PI / 2 + rand(-0.2, 0.2);
      this.addScenery(mergeGroup(j), verge(i + 1) * rand(9.2, 10.5), -i * 61 - 10, 610, true);
    }
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Group();
      box(0.25, 5, 0.25, M.woodDark(), -2.2, 2.5, 0, b);
      box(0.25, 5, 0.25, M.woodDark(), 2.2, 2.5, 0, b);
      box(5.6, 2.6, 0.15, mat(pick([0x2f5a8a, 0xb5642a, 0x8a3a2a, 0x3f6b45]), { edge: 0.8 }), 0, 4.6, 0, b);
      box(4.6, 0.5, 0.17, mat(0xe8e2d0, { edge: 0.6 }), 0, 4.9, 0, b);
      box(3.0, 0.3, 0.17, mat(0xe8e2d0, { edge: 0.6 }), -0.6, 4.1, 0, b);
      b.rotation.y = verge(i) * 0.35;
      this.addScenery(mergeGroup(b), verge(i) * rand(14, 18), -i * 150 - 80, 600, true);
    }
    for (let i = 0; i < 2; i++) {
      const tk = new THREE.Group();
      const tm = mat(0x3c4232, { rough: 0.8, edge: 0.7 }), soot = mat(0x1e1c1a, { edge: 0.6 });
      box(3.4, 1.1, 6.6, tm, 0, 0.95, 0, tk);
      box(3.6, 0.7, 6.8, soot, 0, 0.35, 0, tk); // tracks
      const tur = new THREE.Group(); tur.position.set(0, 1.75, 0.4); tur.rotation.set(0.1, rand(-1, 1), 0.15); tk.add(tur);
      box(2.3, 0.75, 2.6, tm, 0, 0, 0, tur);
      const gun = cyl(0.1, 0.12, 4.2, soot, 8, 0, 0, -3.2, tur); gun.rotation.x = Math.PI / 2 - 0.15;
      tk.rotation.set(0, rand(-0.6, 0.6), verge(i) * 0.08);
      this.addScenery(mergeGroup(tk), verge(i) * rand(16, 24), -i * 300 - 180, 600, true);
    }
    for (let i = 0; i < 12; i++) {
      const post = new THREE.Group();
      box(0.14, 1.1, 0.14, mat(0xe8e8e0, { edge: 0.6 }), 0, 0.55, 0, post);
      box(0.15, 0.2, 0.15, mat(0xb03a2a, { edge: 0.6 }), 0, 0.95, 0, post);
      this.addScenery(mergeGroup(post), verge(i) * 8.2, -i * 50 - 5, 600);
    }

    // ---------- Our truck ----------
    const model = makeTruck(0x56603e, false);
    S.add(model);
    const truck = {
      pos: V(1.6, 0), vel: V(0, 0), speed: 0, hp: 1000, maxHp: 1000, friendly: true, model, team: 'squad',
      damage: (n, src, explosive) => {
        if (truck.dead) return;
        const k = explosive ? 0.2 : src ? 0.15 : 1;
        truck.hp -= n * k;
        truck.hitT = 0.2;
        if (truck.hp <= 0 && !g.over && !truck.dead) {
          truck.hp = 0;
          truck.dead = true;
          g.explode(V(truck.pos.x, 0, -1, 1.5), { radius: 4, dmg: 50, owner: null, fx: 2.5 });
          g.fail('The Ural was destroyed.');
        }
      },
    };
    g.truck = truck;
    this.truck = truck;
    // Colliders relative to truck X (bx = offset)
    this.tc = [];
    const tcol = (x0, y0, z0, x1, y1, z1, opts) => {
      const c = w.addCollider(x0 + truck.pos.x, y0, z0, x1 + truck.pos.x, y1, z1, { nav: false, ...opts });
      c.bx0 = x0; c.bx1 = x1;
      if (opts && opts.vehicle !== false) c.vehicle = truck;
      this.tc.push(c);
      return c;
    };
    tcol(-1.3, 0.3, 0.2, 1.3, BED_Y, 4.6, { material: 'metal' }); // bed floor
    tcol(-1.25, 0.3, -3.45, 1.25, 2.75, 0.2, { material: 'metal' }); // cab + hood
    tcol(-1.34, BED_Y, 0.2, -1.22, 1.82, 4.6, { material: 'metal' });
    tcol(1.22, BED_Y, 0.2, 1.34, 1.82, 4.6, { material: 'metal' });
    tcol(-1.34, BED_Y, 4.52, 1.34, 1.82, 4.64, { material: 'metal' });
    tcol(-1.5, 1.82, 0.0, -1.34, 4.5, 4.8, { blocksShot: false, vehicle: false });
    tcol(1.34, 1.82, 0.0, 1.5, 4.5, 4.8, { blocksShot: false, vehicle: false });
    tcol(-1.5, 1.82, 4.64, 1.5, 4.5, 4.8, { blocksShot: false, vehicle: false });
    tcol(-1.5, 2.75, -0.1, 1.5, 4.5, 0.2, { blocksShot: false, vehicle: false });

    // Sandbag cover on the tailgate and rear sides: crouch to hide, stand to shoot over.
    {
      const bags = new THREE.Group();
      const sm = M.sandbag();
      for (let r = 0; r < 3; r++) {
        for (let i = 0; i < 5; i++) box(0.5, 0.2, 0.32, sm, -1.05 + i * 0.52 + (r % 2 ? 0.1 : 0), 1.92 + r * 0.2, 4.47, bags).rotation.y = rand(-0.08, 0.08);
        for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) box(0.26, 0.2, 0.52, sm, sx * 1.2, 1.92 + r * 0.2, 2.85 + i * 0.52 + (r % 2 ? 0.1 : 0), bags).rotation.y = rand(-0.08, 0.08);
      }
      model.add(mergeGroup(bags));
      tcol(-1.3, 1.82, 4.31, 1.3, 2.4, 4.64, { material: 'sand', vehicle: false });
      tcol(-1.34, 1.82, 2.6, -1.06, 2.4, 4.31, { material: 'sand', vehicle: false });
      tcol(1.06, 1.82, 2.6, 1.34, 2.4, 4.31, { material: 'sand', vehicle: false });
    }

    // Interactables in the bed
    this.driveI = g.addInteractable({
      pos: V(0, 0.6, BED_Y), radius: 1.6, key: 'drive', text: '{key} Take the wheel',
      enabled: () => !g.players.some((p) => p.driving),
      action: (p) => this.toggleDrive(p),
    });
    this.ammoI = g.addInteractable({
      pos: V(0, 4.1, BED_Y), radius: 1.5, key: 'resupply',
      text: (p) => ((p._resupT || 0) > g.time ? `Ammo crate restocking… ${Math.ceil(p._resupT - g.time)}s` : '{key} Resupply from the ammo crate'),
      action: (p) => {
        if ((p._resupT || 0) > g.time) return;
        p._resupT = g.time + 18;
        for (const wpn of p.weapons) if (wpn && !wpn.def.melee) wpn.addAmmo(wpn.def.slot === 2 ? 1 : Math.ceil(wpn.def.reserveMax * 0.5));
        audio.play('pickup', null, 0.6);
        g.popup('Resupplied', p, 'ammo');
      },
    });
    const crateMesh = box(1.1, 0.5, 0.6, M.ammoCrate(), 0, 0, 0);
    S.add(crateMesh);
    this.crateMesh = crateMesh;

    g.spawnPoints = SLOTS.map(([x, z]) => V(truck.pos.x + x, z, BED_Y + 0.05));
    g.alarm = true;
    g.droneLead = 0;
    g.setObjective({ text: 'Get the Ural to the border highway', sub: () => `${Math.max(0, (GOAL - this.dist) / 1000).toFixed(2)} km to go · keep the technicals off the truck`, marker: false });
    audio.startEngine();
  },

  afterSpawn(g) {
    const n = g.players.length;
    g.allies.forEach((a, i) => {
      if (i === 0 && n < 4) {
        a.driving = true; a.hidden = true;
        a.pos.set(this.truck.pos.x - 0.6, BED_Y, -1.1);
        a.model.visible = false;
        this.aiDriver = a;
      } else {
        const s = SLOTS[n + i - (n < 4 ? 1 : 0)] || SLOTS[3];
        a.station = { x: this.truck.pos.x + s[0], z: s[1] };
        a.pos.set(a.station.x, BED_Y + 0.05, a.station.z);
        a.yaw = Math.PI;
      }
    });
  },

  respawnPos(g, p) {
    const s = SLOTS[p.index] || SLOTS[0];
    return V(this.truck.pos.x + s[0], s[1], BED_Y + 0.1);
  },

  toggleDrive(p) {
    const t = this.truck;
    if (p.driving) {
      p.driving = false; p.hidden = false;
      p.pos.set(t.pos.x, BED_Y + 0.05, 1.0);
      p.yaw = Math.PI; p.pitch = 0;
      if (this.aiDriver) this.aiDriver.driving = true;
      return;
    }
    p.driving = true; p.hidden = true;
    p.yaw = 0; p.pitch = -0.05;
    p.ads = 0;
    audio.play('click', null, 0.5);
  },

  addScenery(obj, x, z, span, castShadow = false, wrapAt = 70) {
    obj.position.set(x, obj.position.y, z);
    obj.traverse((o) => { if (o.isMesh) { o.castShadow = castShadow; o.receiveShadow = true; } });
    this.truckScene().add(obj);
    this.scenery.push({ obj, span, wrapAt });
  },

  truckScene() { return this._scene; },

  spawnTech(g, side, rocket) {
    const t = new Technical(g, side * rand(3, 5), rand(80, 110), { homeX: side * rand(3.6, 4.8), homeZ: rand(13, 28), rocket, color: pick([0x6b6650, 0x5a5f62, 0x7a6a50, 0x3f4a3a]) });
    g.vehicles.push(t);
    g.popup('Technical closing in from behind!', null, 'warn');
  },

  spawnBlock(g, kind, z0 = -380) {
    const w = g.world;
    const group = new THREE.Group();
    g.scene.add(group);
    const gid = 'block' + Math.random();
    const b = { kind, z: z0, group, colliders: [], defenders: [], gid, gapSide: kind === 'partial' ? (chance(0.5) ? 1 : -1) : 0 };
    const segs = kind === 'full' ? [[-7, 7]] : b.gapSide > 0 ? [[-7, 1.2]] : [[-1.2, 7]];
    const barrierMeshes = [];
    for (const [x0, x1] of segs) {
      const n = Math.round((x1 - x0) / 1.8);
      for (let i = 0; i < n; i++) {
        const cx = x0 + (i + 0.5) * ((x1 - x0) / n);
        const m = box((x1 - x0) / n - 0.1, 1.3, 1.0, i % 2 ? M.concrete() : mat(0xb53a2a, { rough: 0.8 }), cx, 0.65, 0, group);
        m.castShadow = true;
        barrierMeshes.push(m);
        const c = w.addCollider(cx - (x1 - x0) / n / 2, 0, z0 - 0.5, cx + (x1 - x0) / n / 2, 1.3, z0 + 0.5, { hp: 380, group: gid, explosiveOnly: true, nav: false, material: 'concrete' });
        c.blockRef = b;
        c.groupMeshes = barrierMeshes;
        b.colliders.push(c);
      }
      // stripes
      for (let x = x0 + 0.5; x < x1; x += 1.4) barrierMeshes.push(box(0.5, 0.08, 1.02, mat(0xf2f2f2), x, 1.0, 0, group));
    }
    // Shoulder nests
    for (const side of [-1, 1]) {
      const nest = new THREE.Group();
      const bags = M.sandbag();
      for (let i = 0; i < 6; i++) box(0.62, 0.22, 0.42, bags, -1.6 + i * 0.62, 0.11, 0, nest);
      for (let i = 0; i < 6; i++) box(0.62, 0.22, 0.42, bags, -1.3 + i * 0.62 - 0.3, 0.33, 0, nest);
      for (let i = 0; i < 5; i++) box(0.62, 0.22, 0.42, bags, -1.3 + i * 0.62, 0.55, 0, nest);
      nest.position.set(side * 10, 0, 2);
      group.add(nest);
      const c = w.addCollider(side * 10 - 1.9, 0, z0 + 1.75, side * 10 + 1.9, 0.75, z0 + 2.25, { nav: false, material: 'sand' });
      b.colliders.push(c);
      for (let k = 0; k < 2; k++) {
        const type = k === 0 && chance(0.5) ? 'gunner' : pick(['rifleman', 'rifleman', 'rocketeer']);
        const e = g.spawnEnemy(type, V(side * 10 + (k ? 0.9 : -0.9), z0 + 1.0), { state: 'alert', yaw: Math.PI, static: true, crouch: true, sight: 110 });
        b.defenders.push(e);
      }
    }
    if (kind === 'full') {
      const e = g.spawnEnemy('mg', V(-3, z0 - 1.5), { state: 'alert', yaw: Math.PI, static: true, sight: 120 });
      b.defenders.push(e);
      // A guard post behind the barrier
      const post = new THREE.Group();
      box(2.5, 2.4, 2.5, M.concrete(), 0, 1.2, 0, post);
      box(2.8, 0.2, 2.8, M.roof(), 0, 2.5, 0, post);
      post.position.set(5, 0, -4);
      group.add(post);
      b.colliders.push(w.addCollider(3.75, 0, z0 - 5.25, 6.25, 2.6, z0 - 2.75, { nav: false }));
      const e2 = g.spawnEnemy('rifleman', V(5, z0 - 1.8), { state: 'alert', yaw: Math.PI, static: true, sight: 110 });
      b.defenders.push(e2);
      g.popup('Full roadblock ahead — clear the defenders or blast the barrier!', null, 'warn');
    } else {
      g.popup('Checkpoint ahead!', null, 'warn');
    }
    group.position.z = z0;
    this.blocks.push(b);
    g.worldMarkers.push(b.marker = { pos: V(0, z0), cls: 'obj', label: kind === 'full' ? 'ROADBLOCK' : 'CHECKPOINT', y: 3 });
    return b;
  },

  spawnWreck(g, x, z0) {
    const group = new THREE.Group();
    const m = mat(0x2a2624, { rough: 0.9 });
    box(1.9, 0.8, 4.2, m, 0, 0.6, 0, group);
    box(1.7, 0.6, 2.0, m, 0, 1.3, 0.2, group);
    group.position.set(x, 0, z0);
    group.rotation.y = rand(-0.3, 0.3);
    g.scene.add(group);
    const c = g.world.addCollider(x - 1.1, 0, z0 - 2.2, x + 1.1, 1.6, z0 + 2.2, { nav: false, material: 'metal' });
    this.obstacles.push({ x, z: z0, group, c, hit: false });
  },

  barrierIntact(b) { return b.colliders.some((c) => !c.dead && c.hp != null); },

  update(g, dt) {
    if (!this._scene) this._scene = g.scene;
    const t = this.truck;
    const human = g.players.find((p) => p.driving);

    // ------------ Speed & steering ------------
    let targetSpeed = 22, targetX = 1.8, accel = 4.5;
    let blockAhead = null;
    for (const b of this.blocks) {
      if (!this.barrierIntact(b)) continue;
      if (b.z < -3.4 && b.z > -140) { if (!blockAhead || b.z > blockAhead.z) blockAhead = b; }
    }
    if (human) {
      const it = human.intent;
      targetSpeed = it.moveZ > 0.1 ? 28 : it.moveZ < -0.1 ? 0 : t.speed;
      accel = it.moveZ < -0.1 ? 14 : 6;
      t.pos.x = clamp(t.pos.x + it.moveX * 6 * dt * Math.min(1, t.speed / 6 + 0.2), -4.6, 4.6);
    } else {
      if (blockAhead) {
        const gap = -3.4 - (blockAhead.z + 0.5);
        if (blockAhead.kind === 'partial') { targetX = blockAhead.gapSide * 4.0; targetSpeed = 14; }
        else {
          if (t.speed < 1) blockAhead.waitT = (blockAhead.waitT || 0) + dt;
          const cleared = blockAhead.defenders.every((e) => e.dead);
          if (blockAhead.waitT > 30 && !blockAhead.ramWarned) { blockAhead.ramWarned = true; g.popup(`${this.aiDriver ? this.aiDriver.name : 'Driver'}: "Hold on — I'm going through!"`, null, 'warn'); }
          if (cleared || blockAhead.waitT > 32) { targetSpeed = 9; targetX = 0; blockAhead.ram = cleared; }
          else { targetSpeed = clamp((gap - 20) * 0.7, 0, 22); accel = 9; }
        }
      }
      for (const o of this.obstacles) {
        if (o.z < -3.4 && o.z > -90 && Math.abs(o.x - targetX) < 2.8) targetX = o.x > 0 ? o.x - 3.4 : o.x + 3.4;
      }
      targetX = clamp(targetX, -4.4, 4.4);
      t.pos.x += clamp(targetX - t.pos.x, -2.6 * dt, 2.6 * dt);
    }
    const dv = targetSpeed - t.speed;
    t.speed = clamp(t.speed + clamp(dv, -accel * 2 * dt, accel * dt), 0, 28);
    audio.setEngine(t.speed / 28);
    g.droneLead = t.speed * 2.5;

    // ------------ Move truck colliders & riders laterally ------------
    const dx = t.pos.x - (this.lastX ?? t.pos.x);
    this.lastX = t.pos.x;
    for (const c of this.tc) { c.min.x = c.bx0 + t.pos.x; c.max.x = c.bx1 + t.pos.x; }
    if (dx !== 0) {
      for (const p of g.players) if (!p.driving && p.pos.y > 1) p.pos.x += dx;
      for (const a of g.allies) { if (a.station) a.station.x += dx; if (a.pos.y > 1) a.pos.x += dx; }
    }
    t.model.position.set(t.pos.x, Math.sin(g.time * 13) * 0.02 * Math.min(1, t.speed / 10), 0);
    t.model.rotation.y = human ? -human.intent.moveX * 0.05 : clamp((t.pos.x - (this.prevX2 ?? t.pos.x)) * -2, -0.08, 0.08);
    this.prevX2 = t.pos.x;
    for (const wh of t.model.userData.wheels) wh.rotation.x -= t.speed * dt * 1.8;
    this.driveI.pos.set(t.pos.x, BED_Y, 0.7);
    this.ammoI.pos.set(t.pos.x + 0.6, BED_Y, 4.0);
    this.crateMesh.position.set(t.pos.x + 0.6, BED_Y + 0.25, 4.05);
    if (this.aiDriver) this.aiDriver.pos.set(t.pos.x - 0.6, BED_Y, -1.1);

    // ------------ Scroll the world ------------
    const dz = t.speed * dt;
    this.dist += dz;
    for (const s of this.scenery) {
      s.obj.position.z += dz;
      if (s.obj.position.z > s.wrapAt) s.obj.position.z -= s.span;
    }
    g.shiftWorld(dz);
    g.sky.wind.y = 2 + t.speed * 0.85;
    for (const c of this.chimneys) {
      const p = c.position;
      if (p.z < 40 && p.z > -260 && Math.random() < dt * 4) g.fx.smoke(_cs.set(p.x + 1.6, 4.8, p.z + 1), [0.35, 0.33, 0.32], 1.4);
    }
    for (const b of this.blocks) {
      b.z += dz;
      b.group.position.z = b.z;
      b.marker.pos.z = b.z;
      for (const c of b.colliders) { c.min.z += dz; c.max.z += dz; }
      // Collision with the barrier
      if (this.barrierIntact(b)) {
        for (const c of b.colliders) {
          if (c.dead || c.hp == null) continue;
          if (c.max.z > -3.5 && c.min.z < 0 && c.max.x > t.pos.x - 1.3 && c.min.x < t.pos.x + 1.3) {
            const rammed = b.ram || t.speed < 10;
            t.damage(rammed ? 40 : 160);
            g.destroyCollider(c, null);
            t.speed *= rammed ? 0.8 : 0.35;
            audio.play('truckHit', null, 1);
            for (const p of g.players) p.shake = 1;
            g.popup(rammed ? 'Rammed through!' : 'CRASH! The Ural is taking damage', null, rammed ? 'good' : 'warn');
            break;
          }
        }
      }
    }
    for (const o of this.obstacles) {
      o.z += dz; o.group.position.z = o.z;
      o.c.min.z += dz; o.c.max.z += dz;
      if (!o.hit && o.c.max.z > -3.5 && o.c.min.z < 0 && o.c.max.x > t.pos.x - 1.3 && o.c.min.x < t.pos.x + 1.3) {
        o.hit = true;
        t.damage(70); t.speed *= 0.5;
        audio.play('truckHit', null, 1);
        for (const p of g.players) p.shake = 0.8;
        g.popup('Smashed a wreck!', null, 'warn');
        g.world.removeCollider(o.c);
      }
    }
    // Clean up blocks and wrecks that are far behind.
    this.blocks = this.blocks.filter((b) => {
      if (b.z < 60) return true;
      g.scene.remove(b.group);
      for (const c of b.colliders) if (!c.dead) g.world.removeCollider(c);
      for (const e of b.defenders) { e.dead = true; e.removeModel(); if (e.laser) g.scene.remove(e.laser); }
      g.enemies = g.enemies.filter((e) => !b.defenders.includes(e));
      g.worldMarkers.splice(g.worldMarkers.indexOf(b.marker), 1);
      return false;
    });
    this.obstacles = this.obstacles.filter((o) => {
      if (o.z < 60) return true;
      g.scene.remove(o.group);
      if (!o.c.dead) g.world.removeCollider(o.c);
      return false;
    });
    // Riders of technicals that retreated or were left behind
    g.enemies = g.enemies.filter((e) => !(e.mount && e.mount.removed));
    // Dead ground troops that have scrolled far behind
    for (const e of g.enemies) if (!e.mount && e.pos.z > 80) { e.dead = true; e.removeModel(); e.gone = true; }
    g.enemies = g.enemies.filter((e) => !e.gone);

    // ------------ Events ------------
    while (this.events.length && this.dist >= this.events[0].d) this.events.shift().fn();

    // HUD info
    const pct = Math.max(0, Math.round((t.hp / t.maxHp) * 100));
    g.truckHpText = `URAL ${pct}% · ${Math.round(t.speed * 3.6)} KM/H`;
    if (blockAhead && blockAhead.kind === 'full' && !blockAhead.defenders.every((e) => e.dead) && t.speed < 2) {
      g.truckHpText = `BLOCKED — clear the defenders or blast the barrier · URAL ${pct}%`;
    }

    if (this.dist >= GOAL) g.complete('The Ural coughs to a halt where the highway meets the front. From here, you go on foot.');
  },
};
