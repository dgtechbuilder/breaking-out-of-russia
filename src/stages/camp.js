// Stage 1 — Camp Lockdown: close-quarters breakout through barracks, armory and gate.
import * as THREE from 'three';
import { M, wall, building, crate, crateStack, sandbags, barrel, bunk, workbench, lamp, pointLight, tree, parkedTruck, jersey, hesco, container, shed, lowWall, fireBarrel, waveFlag } from './common.js';
import { mat, box, makeTruck, makeFlag } from '../core/models.js';
import { Weapon } from '../game/weapons.js';
import { audio } from '../core/audio.js';
import { rand } from '../core/util.js';

const V = (x, z, y = 0) => new THREE.Vector3(x, y, z);

export const camp = {
  id: 'camp',
  name: 'Camp Lockdown',
  subtitle: 'Staging Camp "Rassvet" · Occupied Ukraine · 02:40',
  intro: [
    'They promised a factory job in Kazakhstan. Good wages, a dormitory, papers in two weeks.',
    'Instead the bus kept driving west. Your passport went into an officer\'s drawer. You were handed a uniform and told you would ship to the front at dawn.',
    'Tonight the guards are drunk and the armory door is open. Emeka, Kofi, Tendai, Moussa — four strangers who have become brothers.',
    'Take the guards quietly if you can. Arm up. Open the main gate. Do not leave anyone behind.',
  ],
  env: {
    sky: 0x0d1424, fog: 0x0d1424, fogNear: 18, fogFar: 140,
    skyLight: 0x6c80b0, groundLight: 0x262628, hemi: 0.75,
    sunColor: 0xa8bcff, sun: 0.75, sunDir: [0.35, 1, 0.45], ground: 0x7d838a, snow: true,
    skyTop: 0x03060f, stars: true, moon: [-0.45, 0.5, -0.75],
    clouds: 18, cloudColor: 0x343e58, cloudOpacity: 0.8, cloudWind: [2.2, -0.8], flashBoost: 0.4,
  },
  mapColor: 'rgba(60,66,74,0.88)',
  spawnYaw: 0,
  snowWind: 0.4,

  loadout(p) {
    // Nothing but camp gear.
    p.molotovs = 0;
    p.flares = 0;
  },

  afterSpawn(g) {
    // Brothers stay low in their bunks until you make a move.
    for (const a of g.allies) a.holdPos = true;
  },

  label(g) { return g.alarm ? 'ALARM — MOVE!' : 'STAY QUIET'; },

  build(g) {
    const w = g.world;
    const S = g.scene;
    // ---------- Perimeter ----------
    const fenceM = M.concreteDark();
    wall(w, -32, 14, 32, 14, 3.6, 0.5, fenceM);
    wall(w, -32, -64, -32, 14, 3.6, 0.5, fenceM);
    wall(w, 32, -64, 32, 14, 3.6, 0.5, fenceM, { gaps: [{ at: -47, w: 7 }] });
    wall(w, -32, -64, 32, -64, 3.6, 0.5, fenceM, { gaps: [{ at: 0, w: 8 }] });
    // Road beyond the gate, channelled by walls
    wall(w, -9, -80, -9, -64, 3, 0.5, fenceM);
    wall(w, 9, -80, 9, -64, 3, 0.5, fenceM);
    w.addCollider(-9, 0, -82, 9, 4, -81);
    // Outside motor-pool entrance lane
    wall(w, 32, -51, 64, -51, 3, 0.5, fenceM);
    wall(w, 32, -43, 64, -43, 3, 0.5, fenceM);
    w.addCollider(64, 0, -51, 65, 4, -43);
    // Barbed wire tops (visual)
    const wireM = mat(0x555a5e, { metal: 0.6 });
    for (const [x0, z0, x1, z1] of [[-32, 14, 32, 14], [-32, -64, -32, 14], [32, -64, 32, 14], [-32, -64, 32, -64]]) {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const m = box(x1 === x0 ? 0.06 : len, 0.06, x1 === x0 ? len : 0.06, wireM, (x0 + x1) / 2, 3.9, (z0 + z1) / 2);
      S.add(m);
    }
    g.mapFeatures.push({ x: 0, z: -72, w: 18, d: 18, color: 'rgba(40,42,45,0.9)' });
    g.mapFeatures.push({ x: 48, z: -47, w: 32, d: 8, color: 'rgba(40,42,45,0.9)' });

    // ---------- Barracks (start) ----------
    building(w, -9, -5, 9, 9, 3.2, M.wood(), M.roof(), [{ side: 'n', at: 0, w: 2 }, { side: 'w', at: 0, w: 1.8 }], { floor: M.plank() });
    for (const z of [7.2, 4.4, 1.6, -1.2]) { bunk(w, -7.8, z); bunk(w, 7.8, z); }
    w.addBox(0, 0, 3, 1.6, 0.8, 3.0, M.plank(), { material: 'wood' }); // table
    w.addBox(-3.2, 0, -4.4, 2.6, 2.0, 0.6, M.metal(), { material: 'metal' }); // lockers
    w.addBox(3.2, 0, -4.4, 2.6, 2.0, 0.6, M.metal(), { material: 'metal' });
    pointLight(S, 0, 2.8, 2, 0xffcf8a, 6, 16);
    S.add(box(0.5, 0.08, 0.5, mat(0xffe6b0, { emissive: 0xffd080, ei: 2 }), 0, 3.15, 2));
    // A Makarov hidden in a locker gap
    g.spawnPickup('weapon', V(-5.6, -3.6), new Weapon('makarov', { mag: 8, reserve: 16 }), { permanent: true });

    // ---------- Yard ----------
    crateStack(w, -6, -12); crateStack(w, 5, -16);
    crate(w, -14, -20); crate(w, -14, -21.3); crate(w, 14, -10, 1.4);
    sandbags(w, -2, -24, 5); sandbags(w, 10, -27, 4); sandbags(w, -16, -28, 4, false);
    barrel(w, 12, -12); barrel(w, 12.7, -12.6); barrel(w, -20, -14);
    parkedTruck(w, makeTruck(0x4e5a3a, true), 20, -12, Math.PI / 2);
    lamp(w, -10, -10); lamp(w, 10, -22, 5, Math.PI); lamp(w, -6, -30);
    pointLight(S, 0, 6, -18, 0xffd8a0, 7, 26);
    makeTower(g, 24, -26);
    const flag = makeFlag([0xffffff, 0x1c3faa, 0xd52b1e]);
    flag.position.set(-1, 0, -30); S.add(flag);
    waveFlag(w, flag);
    w.addCollider(-1.1, 0, -30.1, -0.9, 6, -29.9);

    // ---------- Armory ----------
    building(w, -27, -45, -13, -32, 3.4, M.concrete(), M.roof(), [{ side: 'e', at: -38, w: 2.2 }], { floor: mat(0x55524c) });
    pointLight(S, -20, 3, -38.5, 0xffe0b0, 6, 16);
    S.add(box(0.5, 0.08, 0.5, mat(0xffe6b0, { emissive: 0xffd080, ei: 2 }), -20, 3.35, -38.5));
    // Weapon racks along the west wall
    w.addBox(-26.3, 0, -38.5, 0.6, 1.9, 8, M.woodDark(), { material: 'wood' });
    const rack = [['ak74', -41.8], ['ak74', -40.6], ['ak74', -39.4], ['rpk', -38.2], ['ak74', -37], ['makarov', -35.8]];
    for (const [t, z] of rack) g.spawnPickup('weapon', V(-25.2, z), new Weapon(t), { permanent: true });
    g.spawnPickup('weapon', V(-17, -44), new Weapon('rpg', { reserve: 2 }), { permanent: true });
    g.spawnPickup('ammo', V(-15, -44), null, { permanent: true });
    g.spawnPickup('part', V(-21, -44), 'optic', { permanent: true });
    g.spawnPickup('part', V(-19.6, -44), 'suppressor', { permanent: true });
    crate(w, -14.5, -33.2, 1.1, 0, M.ammoCrate()); crate(w, -16, -33.2, 1.1, 0, M.ammoCrate());
    workbench(g, -21, -33.4, 0);

    // ---------- Motor pool ----------
    parkedTruck(w, makeTruck(0x4e5a3a, false), 12, -40, 0);
    parkedTruck(w, makeTruck(0x56603e, true), 18, -40, 0);
    parkedTruck(w, makeTruck(0x4e5a3a, false), 24, -55, Math.PI / 2);
    for (const [x, z] of [[27, -38], [27.7, -38.6], [27, -39.4], [9, -54], [9.7, -54.5]]) barrel(w, x, z, true);
    g.spawnPickup('fuel', V(26, -42), null, { permanent: true });
    g.spawnPickup('fuel', V(25, -42.8), null, { permanent: true });
    g.spawnPickup('fuel', V(9, -52.5), null, { permanent: true });
    g.spawnPickup('flarekit', V(14.5, -47), null, { permanent: true });
    g.spawnPickup('part', V(22, -47), 'drum', { permanent: true });
    workbench(g, 28.6, -46, Math.PI / 2);
    lamp(w, 16, -50); lamp(w, 28, -60);
    pointLight(S, 18, 6, -47, 0xffd8a0, 6, 24);
    g.mapFeatures.push({ x: 18, z: -47, w: 22, d: 18, color: 'rgba(55,58,60,0.9)' });

    // ---------- Gate area ----------
    sandbags(w, -6, -56, 4); sandbags(w, -9.5, -57.5, 3, false);
    sandbags(w, 4, -52, 4);
    crateStack(w, -16, -54); crate(w, 14, -56, 1.3);
    building(w, 6, -63.5, 11, -58, 3, M.concrete(), M.roof(), [{ side: 'w', at: -60.5, w: 1.6 }], { lintel: 2.2 });
    pointLight(S, 0, 6, -58, 0xffd8a0, 6, 22);
    lamp(w, -4.6, -61); lamp(w, 4.6, -61, 5, Math.PI);
    // The gate itself — sliding steel. Destructible by explosives.
    const gateMesh = new THREE.Group();
    const gm = mat(0x3c4247, { metal: 0.6, rough: 0.5 });
    box(8, 3.2, 0.25, gm, 0, 1.6, 0, gateMesh);
    for (let i = 0; i < 6; i++) box(0.12, 3.0, 0.4, mat(0x2a2f33, { metal: 0.6 }), -3.5 + i * 1.4, 1.6, 0, gateMesh);
    const star = box(0.9, 0.9, 0.05, mat(0xb02020, { emissive: 0x500000 }), 0, 2.1, 0.16, gateMesh);
    star.rotation.z = Math.PI / 4;
    gateMesh.position.set(0, 0, -64);
    S.add(gateMesh);
    this.gateMesh = gateMesh;
    this.gate = w.addCollider(-4, 0, -64.3, 4, 3.2, -63.7, { hp: 350, explosiveOnly: true, material: 'metal', onDestroy: (game) => this.openGate(game, true) });
    this.gateOpen = false;
    this.gateSlide = 0;
    g.addInteractable({
      pos: V(8.5, -60.6), radius: 2.2, hold: 2.6, key: 'gatectl',
      text: '{key} Hold — open the main gate',
      enabled: () => !this.gateOpen,
      action: (p) => this.openGate(g, false, p),
    });

    // ---------- Extra cover: containers, barriers, sheds ----------
    const CC = container.colors;
    container(w, -25.5, -3, false, CC[0]);
    container(w, -25.5, -3, false, CC[1], 2.6);
    container(w, -25.5, 4, false, CC[2]);
    container(w, 25.5, 3, false, CC[3]);
    container(w, 27, -19, false, CC[4]);
    container(w, 4, -44, false, CC[1]);
    jersey(w, 0, -14, 3); jersey(w, -12, -15, 3, false);
    jersey(w, 6, -34, 3); jersey(w, -6, -40, 3);
    jersey(w, 16, -58, 3); jersey(w, -20, -47.6, 3); jersey(w, -21, -60.5, 3);
    hesco(w, -22, -26, 3, false); hesco(w, -4, -48, 2);
    lowWall(w, -3.5, -33, 2.5); lowWall(w, 4, -20, 2.5);
    shed(w, -30.6, -24, -26.6, -19.5, 'e', M.wood());
    shed(w, 13, -4, 17, 0, 'w', M.brick());
    shed(w, -30.6, -61, -26.6, -56.5, 'e', M.concrete());
    crate(w, 11, -6); crate(w, 11, -7.3); crate(w, 11, -6.6, 1.1, 1.2);
    crateStack(w, -29, -30);
    fireBarrel(w, -11, -27); fireBarrel(w, 19, -30); fireBarrel(w, 2, -57.5); fireBarrel(w, -27, -8.5);
    // Sweeping searchlights (visual cones)
    searchlight(g, 24, 7.3, -26, -Math.PI / 2, 1.0);
    searchlight(g, 8.5, 3.6, -60.8, -0.3, 0.7);

    // Trees outside the walls for silhouette
    for (let i = 0; i < 24; i++) {
      const side = i % 2 ? 1 : -1;
      const x = side * rand(36, 60), z = rand(-90, 20);
      tree(w, x, z, rand(1.2, 2.0));
    }

    // ---------- Enemies ----------
    g.spawnEnemy('rifleman', V(-3, 0.5), { patrol: [V(-3, 0.5), V(-3, -2.5), V(3, -2.5), V(3, 0.5)], yaw: 0 });
    g.spawnEnemy('officer', V(2.5, -3.2), { yaw: 0 });
    g.spawnEnemy('rifleman', V(-1.5, -7.5), { yaw: 0 });
    g.spawnEnemy('rifleman', V(1.8, -8), { yaw: 0.4 });
    g.spawnEnemy('rifleman', V(-8, -18), { patrol: [V(-8, -18), V(8, -18), V(8, -26), V(-8, -26)] });
    g.spawnEnemy('gunner', V(-2, -25.2), { yaw: Math.PI, crouch: true });
    g.spawnEnemy('rifleman', V(10, -28.2), { yaw: Math.PI });
    g.spawnEnemy('officer', V(-12, -24));
    g.spawnEnemy('sniper', V(24, -26, 5.2), { yaw: Math.PI * 0.8 });
    g.spawnEnemy('rifleman', V(-19, -37), { yaw: -Math.PI / 2 });
    g.spawnEnemy('rifleman', V(-16, -42), { yaw: -Math.PI / 2 });
    g.spawnEnemy('rifleman', V(15, -45), { patrol: [V(15, -45), V(24, -50), V(15, -55)] });
    g.spawnEnemy('gunner', V(21, -36), { yaw: 0.5 });
    g.spawnEnemy('rifleman', V(10, -50));
    g.spawnEnemy('mg', V(-6, -55.2), { yaw: Math.PI, crouch: false });
    g.spawnEnemy('rifleman', V(4, -50.8), { yaw: Math.PI });
    g.spawnEnemy('officer', V(8.5, -61.5), { yaw: Math.PI / 2 });
    g.spawnEnemy('rifleman', V(-14, -58), { patrol: [V(-14, -58), V(-24, -50), V(-14, -50)] });

    // ---------- Spawns, nav, objectives ----------
    g.spawnPoints = [V(-1.4, 7.6), V(1.4, 7.6), V(-4.4, 6), V(4.4, 6)];
    w.buildNav(-34, 66, -84, 16, 1);
    this.phase = 0;
    g.setObjective({ text: 'Break out of the barracks', sub: 'Sneak up behind the guards and hit them with the shovel for a silent takedown', pos: V(0, -5.5), markerLabel: 'EXIT' });
    g.reinf.interval = 48;
    g.reinf.spawn = (game) => {
      const troops = ['rifleman', 'rifleman', 'gunner', 'officer'];
      if (game.time > 240) troops.push('rifleman');
      game.spawnTransport([V(62, -47), V(22, -47)], troops);
    };
  },

  onAlarm(g) {
    g.reinf.active = true;
    g.reinf.timer = 40;
  },

  openGate(g, blown, by) {
    if (this.gateOpen) return;
    this.gateOpen = true;
    if (!blown && this.gate && !this.gate.dead) g.world.removeCollider(this.gate);
    if (blown) { this.gateMesh.visible = false; g.fx.explosion(V(0, -64, 1), 1.5); }
    g.world.rebuildNav();
    audio.play('alarm', null, 0.5);
    g.popup(blown ? 'Gate blown open!' : 'Gate opening — GO!', null, 'good');
    if (!g.alarm) { g.alarm = true; this.onAlarm(g); }
    g.reinf.timer = Math.min(g.reinf.timer || 99, 8);
    if (by && by.isHuman) g.momentum.add(15, by);
    // Gate defenders rush in from outside.
    for (let i = 0; i < 3; i++) {
      const e = g.spawnEnemy(i === 2 ? 'gunner' : 'rifleman', V(rand(-6, 6), -78), { state: 'alert' });
      e.lastKnown = V(0, -58);
    }
  },

  update(g, dt) {
    if ((g.alarm || this.phase >= 1) && g.allies.some((a) => a.holdPos)) {
      for (const a of g.allies) a.holdPos = false;
      g.popup('Your brothers are moving with you', null, 'info');
    }
    const front = Math.min(...g.players.filter((p) => !p.dead).map((p) => p.pos.z), 99);
    if (this.gateOpen && this.gateMesh.visible) {
      this.gateSlide = Math.min(8.2, this.gateSlide + dt * 3);
      this.gateMesh.position.x = this.gateSlide;
    }
    if (this.phase === 0 && front < -5.3) {
      this.phase = 1;
      g.setObjective({ text: 'Raid the armory', sub: 'West building — your brothers will grab weapons from the racks', pos: V(-12.5, -38), markerLabel: 'ARMORY' });
    }
    const inArmory = g.players.some((p) => p.pos.x < -13 && p.pos.x > -27 && p.pos.z < -32 && p.pos.z > -45);
    if (this.phase === 1 && inArmory) {
      this.phase = 2;
      g.setObjective({ text: 'Open the main gate', sub: 'Gate control is in the guard hut (north). Optional: fuel & parts in the motor pool (east)', pos: V(8.5, -60.6), markerLabel: 'GATE CONTROL' });
      g.momentum.add(10, g.players[0]);
    }
    if (this.phase === 1 && this.gateOpen) this.phase = 2;
    if (this.phase === 2 && this.gateOpen) {
      this.phase = 3;
      g.setObjective({ text: 'Escape the camp', sub: 'Get through the gate — the trucks are coming', pos: V(0, -74), markerLabel: 'ESCAPE' });
    }
    if (this.phase === 3 && g.players.some((p) => !p.dead && p.pos.z < -72)) {
      this.phase = 4;
      g.complete('The camp alarms fade behind you. Ahead: a convoy route to the front.');
    }
  },
};

const beamTex = (() => {
  const c = document.createElement('canvas'); c.width = 4; c.height = 64;
  const x = c.getContext('2d');
  const gr = x.createLinearGradient(0, 0, 0, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 4, 64);
  return new THREE.CanvasTexture(c);
})();

/** A soft additive light cone that slowly sweeps the yard. Purely visual — no light source. */
function searchlight(g, x, y, z, yaw0, speed) {
  const len = 34;
  const geo = new THREE.ConeGeometry(4.2, len, 16, 1, true);
  geo.translate(0, -len / 2, 0);
  geo.rotateX(-Math.PI / 2 + 0.32); // point along +Z, tilted down
  const m = new THREE.MeshBasicMaterial({ color: 0xfff2cc, map: beamTex, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const beam = new THREE.Mesh(geo, m);
  beam.position.set(x, y, z);
  g.scene.add(beam);
  const head = box(0.5, 0.4, 0.6, mat(0xfff6d0, { emissive: 0xfff0c0, ei: 3 }), x, y, z);
  g.scene.add(head);
  g.world.anims.push((dt, t) => {
    const yaw = yaw0 + Math.sin(t * 0.32 * speed) * 0.9;
    beam.rotation.y = yaw; head.rotation.y = yaw;
    m.opacity = g.alarm ? 0.22 : 0.15;
  });
}

function makeTower(g, x, z) {
  const w = g.world;
  const legM = M.woodDark();
  for (const [ox, oz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) w.addBox(x + ox, 0, z + oz, 0.25, 5, 0.25, legM, { material: 'wood' });
  w.addBox(x, 4.9, z, 4, 0.3, 4, M.plank(), { material: 'wood' });
  // parapet
  w.addBox(x, 5.2, z - 1.9, 4, 1.0, 0.15, M.plank(), { material: 'wood' });
  w.addBox(x, 5.2, z + 1.9, 4, 1.0, 0.15, M.plank(), { material: 'wood' });
  w.addBox(x - 1.9, 5.2, z, 0.15, 1.0, 4, M.plank(), { material: 'wood' });
  w.addBox(x + 1.9, 5.2, z, 0.15, 1.0, 4, M.plank(), { material: 'wood' });
  w.addBox(x, 7.6, z, 4.4, 0.2, 4.4, M.roof(), { collide: false });
  for (const [ox, oz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) w.addBox(x + ox, 6.2, z + oz, 0.12, 1.4, 0.12, legM, { collide: false });
  const spot = pointLight(g.scene, x - 2, 6.5, z, 0xfff2cc, 5, 20);
  return spot;
}
