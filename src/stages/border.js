// Stage 3 — The Border Dash: push down a cratered highway through waves, snipers and
// fortified roadblocks to reach the Ukrainian line and surrender.
import * as THREE from 'three';
import { M, wall, crate, sandbags, barrel, tree, wreckCar, crater, tankTrap, concreteBlock, building } from './common.js';
import { mat, box, makeTruck, makeFlag, makeHumanoid, animateHumanoid } from '../core/models.js';
import { Weapon } from '../game/weapons.js';
import { audio } from '../core/audio.js';
import { rand, pick, clamp } from '../core/util.js';

const V = (x, z, y = 0) => new THREE.Vector3(x, y, z);

export const border = {
  id: 'border',
  name: 'The Border Dash',
  subtitle: 'Highway to the contact line · Grey morning',
  intro: [
    'The Ural is dead in a ditch. Four kilometres of cratered highway separate you from the Ukrainian trenches.',
    'Between here and there: dug-in infantry, snipers in the ruins, drones overhead and two fortified roadblocks.',
    'Keep moving. Flank the guns. Blind the snipers with flares. Chain kills to call in the stolen mortar.',
    'When you reach the Ukrainian line, lower your weapon. You are not here to fight them. You are here to go home.',
  ],
  env: {
    sky: 0xaeb6bd, fog: 0xaeb6bd, fogNear: 40, fogFar: 260,
    skyLight: 0xe4ecf4, groundLight: 0x6a6e72, hemi: 1.15,
    sunColor: 0xfff2e0, sun: 1.25, sunDir: [0.5, 0.75, 0.35], ground: 0xc9cfd4, snow: true,
  },
  mapColor: 'rgba(170,176,182,0.85)',
  spawnYaw: 0,
  allyWeapon: (i) => (i === 2 ? 'rpk' : 'ak74'),
  lootBias: 1.6,
  snowWind: 1.2,

  loadout(p) {
    p.weapons = [new Weapon('ak74', { reserve: 180, att: { optic: true } }), new Weapon('makarov'), new Weapon('rpg', { reserve: 2 })];
    p.cur = 0;
    p.molotovs = 2;
    p.flares = 2;
  },

  label(g) {
    const front = this.front ?? 0;
    return `${Math.max(0, Math.round(-front))} / 415 M`;
  },

  build(g) {
    const w = g.world;
    const S = g.scene;
    this.front = 0;
    this.phase = 0;
    this.waves = [];
    // Road
    w.addBox(0, -0.02, -210, 14, 0.04, 470, M.asphalt(), { collide: false });
    for (let z = 10; z > -420; z -= 12) w.addBox(0, 0.0, z, 0.18, 0.02, 3, mat(0xd8d8d0), { collide: false });
    g.mapFeatures.push({ x: 0, z: -210, w: 14, d: 470, color: 'rgba(60,62,66,0.95)' });
    // Bounds
    w.addCollider(-44, 0, -440, -42, 6, 20);
    w.addCollider(42, 0, -440, 44, 6, 20);
    w.addCollider(-44, 0, 18, 44, 6, 20);
    w.addCollider(-44, 0, -442, 44, 6, -440);
    // Tree lines
    for (let z = 15; z > -435; z -= rand(4, 8)) {
      tree(w, -rand(33, 41), z, rand(1.2, 2.0));
      tree(w, rand(33, 41), z, rand(1.2, 2.0));
    }
    // The crashed Ural at the start
    const ural = makeTruck(0x56603e, false);
    ural.position.set(5, 0, 12); ural.rotation.set(0, 0.6, 0.12);
    ural.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.multiplyScalar(0.5); } });
    S.add(ural);
    w.addCollider(2.5, 0, 8, 7.5, 2.6, 16);
    this.smokeSrc = [V(5, 10, 2)];

    // ---------- Section A: cover field ----------
    const cover = [
      () => wreckCar(w, -4, -28, 0.3), () => crater(w, 6, -36, 3.5), () => concreteBlock(w, -10, -44, 3),
      () => crater(w, -6, -58, 4), () => wreckCar(w, 7, -66, -0.4, 0x3a3530), () => sandbags(w, -14, -72, 5),
      () => concreteBlock(w, 12, -82, 3), () => crater(w, 0, -90, 3), () => wreckCar(w, -9, -100, 1.6),
      () => tankTrap(w, 4, -108), () => tankTrap(w, -3, -112), () => sandbags(w, 15, -118, 4),
      () => crater(w, -16, -125, 3.5), () => concreteBlock(w, 6, -128, 2.5, false),
    ];
    cover.forEach((f) => f());
    for (let i = 0; i < 10; i++) { const x = rand(-28, 28), z = rand(-20, -135); if (Math.abs(x) > 8) crater(w, x, z, rand(2, 3.5)); }
    // Dug-in first line
    sandbags(w, -6, -84, 6); sandbags(w, 8, -88, 5); sandbags(w, -18, -92, 4);
    this.spawnGroup(g, [['rifleman', -6, -86], ['rifleman', -4, -86.5], ['gunner', 8, -90], ['rifleman', -18, -94], ['officer', 2, -98], ['rocketeer', 12, -100]], 'idle');
    g.spawnDrone(V(0, -60, 18));
    g.spawnPickup('ammo', V(-10, -45.5), null, { permanent: true });
    g.spawnPickup('flarekit', V(13, -84), null);

    // ---------- Fortified roadblock 1 (z = -150) ----------
    for (const [x0, x1] of [[-24, -9], [-7, -2.6], [2.6, 7], [9, 24]]) wall(w, x0, -150, x1, -150, 2.2, 0.8, M.concrete());
    this.buildBunker(g, 0, -150, 'bunker1');
    sandbags(w, -15, -156, 4); sandbags(w, 15, -156, 4);
    this.ruin(g, -29, -172, 'sniperA');
    this.spawnGroup(g, [['rifleman', -12, -153], ['rifleman', 12, -153], ['gunner', -16, -158], ['rifleman', 16, -158], ['officer', -4, -160], ['rocketeer', 6, -160]], 'idle');
    g.spawnPickup('fuel', V(-19, -148), null, { permanent: true });

    // ---------- Section B ----------
    const coverB = [
      () => wreckCar(w, 5, -182, 0.2), () => crater(w, -6, -190, 4), () => concreteBlock(w, 10, -198, 3),
      () => sandbags(w, -10, -206, 5), () => wreckCar(w, -3, -220, -1.4, 0x3a3530), () => crater(w, 8, -228, 3.5),
      () => tankTrap(w, -12, -236), () => concreteBlock(w, 2, -244, 3), () => crater(w, -8, -256, 3),
      () => wreckCar(w, 9, -262, 1.2), () => sandbags(w, -2, -272, 5), () => concreteBlock(w, -14, -280, 2.5, false),
      () => crater(w, 12, -286, 4), () => tankTrap(w, 3, -292),
    ];
    coverB.forEach((f) => f());
    for (let i = 0; i < 12; i++) { const x = rand(-28, 28), z = rand(-170, -300); if (Math.abs(x) > 8) crater(w, x, z, rand(2, 3.5)); }
    this.ruin(g, 29, -240, 'sniperB');
    this.ruin(g, -27, -292, 'sniperC');
    // Supply cache before the final barricade
    w.addBox(6, 0, -301, 2.4, 0.9, 1.2, M.ammoCrate(), { material: 'wood' });
    g.addInteractable({
      pos: V(6, -300), radius: 2.4, key: 'rpgcache',
      text: (p) => ((p._cacheT || 0) > g.time ? `Cache restocking… ${Math.ceil(p._cacheT - g.time)}s` : '{key} Take RPG rockets + ammo from the cache'),
      action: (p) => {
        if ((p._cacheT || 0) > g.time) return;
        p._cacheT = g.time + 25;
        if (!p.weapons[2]) p.giveWeapon(new Weapon('rpg', { reserve: 2 }));
        else p.weapons[2].addAmmo(2);
        for (const wp of p.weapons) if (wp && !wp.def.melee && wp.def.slot !== 2) wp.addAmmo(Math.ceil(wp.def.reserveMax * 0.4));
        audio.play('pickup', null, 0.6);
        g.popup('+2 RPG rockets, ammo topped up', p, 'ammo');
      },
    });
    g.worldMarkers.push({ pos: V(6, -301), cls: 'bench', label: 'RPG CACHE', y: 2 });
    g.spawnPickup('flarekit', V(4, -298), null, { permanent: true });

    // ---------- Final barricade (z = -320) ----------
    wall(w, -42, -320, -8, -320, 2.8, 1.0, M.concrete());
    wall(w, 8, -320, 42, -320, 2.8, 1.0, M.concrete());
    const gateMeshes = [];
    for (let i = 0; i < 4; i++) {
      const x = -6 + i * 4;
      const c = w.addBox(x, 0, -320, 4, 2.8, 1.2, i % 2 ? M.concreteDark() : mat(0xa83a2a, { rough: 0.8 }), { hp: 650, group: 'gate2', explosiveOnly: true, onDestroy: (game) => this.onBarricade(game) });
      gateMeshes.push(c.mesh);
    }
    for (let x = -36; x <= 36; x += 6) if (Math.abs(x) > 9) tankTrap(w, x, -314);
    sandbags(w, -12, -308, 6); sandbags(w, 12, -308, 6); sandbags(w, 0, -306, 4);
    this.watchPlatform(g, -24, -323); this.watchPlatform(g, 24, -323);
    this.finalDefenders = this.spawnGroup(g, [
      ['rifleman', -12, -310], ['rifleman', -10, -310], ['gunner', 12, -310], ['rifleman', 14, -310],
      ['rocketeer', 0, -308], ['officer', -4, -312],
    ], 'idle');
    this.finalDefenders.push(g.spawnEnemy('mg', V(-24, -323, 3.3), { yaw: Math.PI, static: true, sight: 110 }));
    this.finalDefenders.push(g.spawnEnemy('sniper', V(24, -323, 3.3), { yaw: Math.PI }));

    // ---------- No-man's land & the Ukrainian line ----------
    for (let i = 0; i < 14; i++) crater(w, rand(-30, 30), rand(-330, -395), rand(2, 4.5));
    for (let i = 0; i < 6; i++) tankTrap(w, rand(-25, 25), rand(-340, -390));
    for (const [x0, x1] of [[-36, -3], [3, 36]]) sandbags(w, (x0 + x1) / 2, -415, x1 - x0, true, 1.3);
    wall(w, -36, -422, 36, -422, 1.4, 0.6, M.woodDark());
    const flagU = makeFlag([0x0057b7, 0xffd700]);
    flagU.position.set(-5, 0, -417); S.add(flagU);
    const flagW = makeFlag([0xffffff, 0xffffff]);
    flagW.position.set(5, 0, -417); S.add(flagW);
    this.friendlies = [];
    for (const x of [-10, -6, 7, 12]) {
      const m = makeHumanoid({ skin: pick([0xe0bfa3, 0xc9a184, 0xd9b49a]), top: 0x56613d, pants: 0x4a5236, hat: 'helmet', hatColor: 0x56613d, vest: 0x3f4a2e });
      m.position.set(x, 0, -417.5);
      S.add(m);
      this.friendlies.push(m);
    }
    this.surrenderZ = -398;
    g.addInteractable({
      pos: V(0, -404), radius: 12, hold: 2.5, key: 'surrender',
      text: '{key} Hold — lower your weapon and surrender',
      enabled: () => this.phase >= 2,
      action: (p) => this.surrender(g, p),
    });

    // Spawns & nav
    g.spawnPoints = [V(-1.5, 2), V(1.5, 2), V(-3.5, 4), V(3.5, 4)];
    w.buildNav(-43, 43, -441, 19, 1);
    g.setObjective({ text: 'Push up the highway', sub: 'Break the dug-in line. Flank wide — you are outnumbered.', pos: V(0, -150), markerLabel: 'ROADBLOCK' });
    g.alarm = true;
    g.reinf.active = true;
    g.reinf.interval = 36;
    g.reinf.timer = 30;
    g.reinf.spawn = (game) => this.reinforce(game);
  },

  spawnGroup(g, list, state) {
    return list.map(([t, x, z]) => g.spawnEnemy(t, V(x, z), { state, yaw: Math.PI + rand(-0.5, 0.5), crouch: t === 'gunner' }));
  },

  buildBunker(g, x, z, gid) {
    const w = g.world;
    const m = M.concreteDark();
    const opts = { hp: 900, group: gid, explosiveOnly: true, onDestroy: (game) => { if (this.bunkerMG && !this.bunkerMG.dead) game.killEnemy(this.bunkerMG, null, { explosive: true }); } };
    w.addBox(x, 0, z + 1.6, 5.2, 1.15, 0.5, m, opts); // front low wall (slit above)
    w.addBox(x, 1.65, z, 5.6, 0.45, 3.8, m, opts); // roof
    w.addBox(x - 2.55, 0, z, 0.5, 1.65, 3.2, m, opts);
    w.addBox(x + 2.55, 0, z, 0.5, 1.65, 3.2, m, opts);
    w.addBox(x - 1.6, 0, z - 1.6, 2.0, 1.65, 0.5, m, opts);
    w.addBox(x + 1.6, 0, z - 1.6, 2.0, 1.65, 0.5, m, opts);
    this.bunkerMG = g.spawnEnemy('mg', V(x, z + 0.6), { yaw: Math.PI, static: true, sight: 110 });
    g.worldMarkers.push({ pos: V(x, z), cls: 'warn', label: 'MG BUNKER', y: 3 });
  },

  ruin(g, x, z, id) {
    const w = g.world;
    const m = M.brick();
    // Two-storey shell with a sniper perch at y=3.3
    wall(w, x - 4, z - 4, x + 4, z - 4, 6, 0.4, m, { gaps: [{ at: x + 1, w: 1.6 }], lintel: 2.4 });
    wall(w, x - 4, z + 4, x + 4, z + 4, 3.3, 0.4, m, { gaps: [{ at: x - 1, w: 1.8 }], lintel: 2.4 });
    wall(w, x - 4, z - 4, x - 4, z + 4, 5, 0.4, m);
    wall(w, x + 4, z - 4, x + 4, z + 4, 4.2, 0.4, m, { gaps: [{ at: z, w: 1.8 }], lintel: 2.4 });
    w.addBox(x, 3.1, z, 8, 0.25, 8, M.concreteDark(), { blocksMove: true, nav: false });
    // parapet on the open side
    w.addBox(x, 3.35, z + 3.9, 8, 0.9, 0.3, m);
    // Face back down the highway (+Z), angled toward the road.
    const e = g.spawnEnemy('sniper', V(x + rand(-2, 2), z + 2.8, 3.36), { yaw: Math.PI + (x < 0 ? 0.38 : -0.38), static: true });
    g.worldMarkers.push({ pos: V(x, z, 3.3), cls: 'warn', label: 'SNIPER NEST', y: 3, hideWhen: () => e.dead, enemy: e });
    return e;
  },

  watchPlatform(g, x, z) {
    const w = g.world;
    for (const [ox, oz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) w.addBox(x + ox, 0, z + oz, 0.25, 3.3, 0.25, M.woodDark(), { material: 'wood' });
    w.addBox(x, 3.1, z, 3.4, 0.2, 3.4, M.plank(), { material: 'wood', nav: false });
    w.addBox(x, 3.3, z + 1.6, 3.4, 0.9, 0.15, M.plank(), { material: 'wood', nav: false });
  },

  reinforce(g) {
    if (this.phase >= 2) return;
    const front = this.front;
    const stopZ = clamp(front - rand(55, 70), -300, -60);
    const x = pick([-4, 4]);
    const troops = ['rifleman', 'rifleman', pick(['gunner', 'rocketeer']), pick(['rifleman', 'officer'])];
    if (g.time > 200) troops.push('rifleman');
    // Trucks never start beyond the barricade wall.
    const startZ = Math.max(-312, stopZ - 120);
    g.spawnTransport([V(x, startZ), V(x, stopZ)], troops);
    if (g.drones.filter((d) => !d.dead).length < 2 && front < -150) g.spawnDrone(V(rand(-20, 20), front - 40, 18));
  },

  onBarricade(g) {
    if (this.phase >= 2) return;
    this.phase = 2;
    g.reinf.active = false;
    g.momentum.add(20, g.players[0]);
    g.popup('BARRICADE DOWN — RUN FOR THE LINE!', null, 'good');
    g.setObjective({ text: 'Reach the Ukrainian line', sub: 'Lower your weapon at the trenches — surrender, do not fight', pos: V(0, -404), markerLabel: 'SURRENDER HERE' });
    // A last chase squad pours out from behind.
    for (let i = 0; i < 5; i++) {
      const e = g.spawnEnemy(i === 0 ? 'gunner' : 'rifleman', V(rand(-20, 20), -250 + rand(-10, 10)), { state: 'alert' });
      e.lastKnown = V(0, -320);
    }
  },

  surrender(g, p) {
    if (this.done) return;
    this.done = true;
    for (const s of g.squad) { s.surrendered = true; s.surrender = true; }
    for (const e of g.enemies) if (!e.dead) { e.state = 'alert'; e.target = null; e.lastKnown = null; e.blind = 99; }
    audio.play('rally', null, 0.7);
    g.popup('Weapons down. Hands up. "Don\'t shoot — we surrender!"', null, 'good');
    g.complete('The Ukrainian soldiers lower their rifles. Someone throws you a blanket. You are prisoners of war now — and for the first time in months, you are safe.');
  },

  update(g, dt) {
    const alive = g.players.filter((p) => !p.dead);
    this.front = Math.min(...alive.map((p) => p.pos.z), 0);
    if (Math.random() < dt * 3) g.fx.smoke(this.smokeSrc[0], [0.15, 0.15, 0.15], 1.6);
    for (const m of g.worldMarkers) if (m.hideWhen && m.hideWhen() && !m.gone) { m.gone = true; g.worldMarkers.splice(g.worldMarkers.indexOf(m), 1); }
    // Friendlies idle animation
    for (const m of this.friendlies) animateHumanoid(m, { move: 0, t: g.time, aiming: false });

    if (this.phase === 0 && this.front < -140) {
      this.phase = 1;
      g.setObjective({ text: 'Break through to the final barricade', sub: 'Blind snipers with the flare gun. Grab RPG rockets at the cache. Blow the barricade with RPG or Stolen Mortar.', pos: V(0, -318), markerLabel: 'BARRICADE' });
      // Second-line waves
      this.spawnGroup(g, [['rifleman', -8, -205], ['rifleman', 10, -200], ['gunner', -2, -274], ['rifleman', 8, -262], ['rocketeer', -12, -238], ['officer', 4, -246]], 'alert');
      g.spawnDrone(V(10, -200, 20));
    }
    if (this.phase === 1 && this.front < -260 && !this.warned) {
      this.warned = true;
      g.popup('The barricade will only fall to explosives — RPG or Stolen Mortar', null, 'info');
    }
    // Squad passing through the hole in the barricade without blowing it (should not happen) — safety.
    if (this.phase < 2 && this.front < -322) this.onBarricade(g);
    if (this.phase >= 2) {
      // Once at the line, the trench is safe-ish: enemies far behind lose interest.
      for (const e of g.enemies) if (!e.dead && e.pos.z < -330 && e.state === 'combat') e.blind = 1;
    }
  },
};
