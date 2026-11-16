// Shared level-building helpers.
import * as THREE from 'three';
import { mat, box, cyl, makeTree, makeLamp } from '../core/models.js';
import { rand } from '../core/util.js';

export const M = {
  concrete: () => mat(0x8f8f88, { rough: 0.95 }),
  concreteDark: () => mat(0x6c6c66, { rough: 0.95 }),
  wood: () => mat(0x6b4f35, { rough: 0.9 }),
  woodDark: () => mat(0x4a3523, { rough: 0.9 }),
  plank: () => mat(0x7a5c3e, { rough: 0.9 }),
  metal: () => mat(0x50565a, { rough: 0.5, metal: 0.5 }),
  rust: () => mat(0x6e4a32, { rough: 0.8, metal: 0.3 }),
  roof: () => mat(0x3f4446, { rough: 0.7, metal: 0.3 }),
  sandbag: () => mat(0x9a8a62, { rough: 1 }),
  olive: () => mat(0x4e5a3a, { rough: 0.8 }),
  crate: () => mat(0x7a6a3a, { rough: 0.9 }),
  ammoCrate: () => mat(0x4b5a36, { rough: 0.8 }),
  barrel: () => mat(0x3d5a3a, { rough: 0.6, metal: 0.3 }),
  redBarrel: () => mat(0x8a2a22, { rough: 0.6, metal: 0.3 }),
  asphalt: () => mat(0x3a3d40, { rough: 1 }),
  snow: () => mat(0xdfe5ea, { rough: 1 }),
  bed: () => mat(0x5b6a5a, { rough: 1 }),
  mattress: () => mat(0x8a8470, { rough: 1 }),
  burnt: () => mat(0x2a2624, { rough: 0.9 }),
  brick: () => mat(0x8a5a44, { rough: 0.95 }),
};

/** Axis-aligned wall from (x0,z0) to (x1,z1) with optional door gaps [{at, w}] measured along the wall. */
export function wall(world, x0, z0, x1, z1, h, t, material, opts = {}) {
  const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
  const a0 = alongX ? Math.min(x0, x1) : Math.min(z0, z1);
  const a1 = alongX ? Math.max(x0, x1) : Math.max(z0, z1);
  const gaps = (opts.gaps || []).map((g) => [g.at - g.w / 2, g.at + g.w / 2]).sort((a, b) => a[0] - b[0]);
  const segs = [];
  let s = a0;
  for (const [g0, g1] of gaps) { if (g0 > s) segs.push([s, g0]); s = g1; }
  if (s < a1) segs.push([s, a1]);
  const out = [];
  for (const [p0, p1] of segs) {
    const len = p1 - p0, mid = (p0 + p1) / 2;
    if (len < 0.05) continue;
    const c = alongX
      ? world.addBox(mid, opts.y || 0, z0, len, h, t, material, opts)
      : world.addBox(x0, opts.y || 0, mid, t, h, len, material, opts);
    out.push(c);
  }
  // Lintels above gaps
  if (opts.lintel) {
    for (const [g0, g1] of gaps) {
      const len = g1 - g0, mid = (g0 + g1) / 2, y = opts.lintel;
      if (alongX) world.addBox(mid, y, z0, len, h - y, t, material);
      else world.addBox(x0, y, mid, t, h - y, len, material);
    }
  }
  return out;
}

/** Rectangular building shell with doors. doors: {side:'n'|'s'|'e'|'w', at, w} */
export function building(world, x0, z0, x1, z1, h, material, roofMat, doors = [], opts = {}) {
  const t = 0.3;
  const d = (side) => doors.filter((g) => g.side === side).map((g) => ({ at: g.at, w: g.w || 2 }));
  const wo = { gaps: [], lintel: opts.lintel ?? 2.4, ...opts };
  wall(world, x0, z0, x1, z0, h, t, material, { ...wo, gaps: d('n') });
  wall(world, x0, z1, x1, z1, h, t, material, { ...wo, gaps: d('s') });
  wall(world, x0, z0, x0, z1, h, t, material, { ...wo, gaps: d('w') });
  wall(world, x1, z0, x1, z1, h, t, material, { ...wo, gaps: d('e') });
  if (roofMat) {
    world.addBox((x0 + x1) / 2, h, (z0 + z1) / 2, x1 - x0 + 0.6, 0.25, z1 - z0 + 0.6, roofMat, { blocksMove: true, nav: false });
    (world.indoor || (world.indoor = [])).push([x0 - 0.3, z0 - 0.3, x1 + 0.3, z1 + 0.3, h + 0.3]);
  }
  // Floor
  world.addBox((x0 + x1) / 2, 0, (z0 + z1) / 2, x1 - x0, 0.02, z1 - z0, opts.floor || mat(0x5a5048, { rough: 1 }), { collide: false });
}

export function crate(world, x, z, s = 1.2, y = 0, material = M.crate()) {
  return world.addBox(x, y, z, s, s, s, material, { material: 'wood' });
}

export function crateStack(world, x, z) {
  crate(world, x, z, 1.2);
  crate(world, x + 1.25, z, 1.2);
  crate(world, x + 0.6, z, 1.1, 1.2);
}

export function sandbags(world, x, z, len, alongX = true, h = 1.1) {
  const g = new THREE.Group();
  const n = Math.max(1, Math.round(len / 0.6));
  const rows = Math.round(h / 0.22);
  const m = M.sandbag();
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < n; i++) {
      const o = -len / 2 + (i + 0.5 + (r % 2 ? 0.25 : 0)) * (len / n);
      if (o > len / 2) continue;
      const b = box(alongX ? 0.62 : 0.42, 0.22, alongX ? 0.42 : 0.62, m, alongX ? o : 0, r * 0.22 + 0.11, alongX ? 0 : o, g);
      b.rotation.y = rand(-0.08, 0.08);
    }
  }
  g.position.set(x, 0, z);
  world.scene.add(g);
  world.addBox(x, 0, z, alongX ? len : 0.5, h, alongX ? 0.5 : len, null, { material: 'sand' });
  return g;
}

export function barrel(world, x, z, red = false) {
  const m = cyl(0.32, 0.32, 0.95, red ? M.redBarrel() : M.barrel(), 12, x, 0.475, z);
  world.scene.add(m);
  world.addCollider(x - 0.3, 0, z - 0.3, x + 0.3, 0.95, z + 0.3, { material: 'metal' });
  return m;
}

export function bunk(world, x, z, rot = false) {
  const w = rot ? 2.0 : 0.95, d = rot ? 0.95 : 2.0;
  const g = new THREE.Group();
  const frame = M.metal(), mattress = M.mattress();
  for (const [ox, oz] of [[-w / 2 + 0.04, -d / 2 + 0.04], [w / 2 - 0.04, -d / 2 + 0.04], [-w / 2 + 0.04, d / 2 - 0.04], [w / 2 - 0.04, d / 2 - 0.04]]) box(0.05, 1.8, 0.05, frame, ox, 0.9, oz, g);
  box(w, 0.15, d, mattress, 0, 0.45, 0, g);
  box(w, 0.15, d, mattress, 0, 1.35, 0, g);
  box(w * 0.4, 0.1, d * 0.3, mat(0xb8b0a0), 0, 1.47, rot ? 0 : -d * 0.3, g);
  g.position.set(x, 0, z);
  world.scene.add(g);
  world.addCollider(x - w / 2, 0, z - d / 2, x + w / 2, 1.5, z + d / 2, { material: 'metal' });
}

export function workbench(game, x, z, rotY = 0) {
  const world = game.world;
  const g = new THREE.Group();
  box(2.2, 0.1, 0.9, M.plank(), 0, 0.95, 0, g);
  for (const [ox, oz] of [[-1, -0.38], [1, -0.38], [-1, 0.38], [1, 0.38]]) box(0.08, 0.95, 0.08, M.woodDark(), ox, 0.47, oz, g);
  box(0.25, 0.2, 0.18, M.metal(), -0.7, 1.1, 0, g); // vise
  box(0.6, 0.06, 0.3, mat(0x2b2d30, { metal: 0.6 }), 0.3, 1.03, 0.1, g); // parts
  box(1.8, 1.1, 0.06, M.woodDark(), 0, 1.5, 0.45, g); // pegboard
  for (let i = 0; i < 5; i++) box(0.05, 0.3, 0.05, M.metal(), -0.7 + i * 0.35, 1.6, 0.4, g);
  const lamp = box(0.2, 0.1, 0.2, mat(0xfff0c0, { emissive: 0xffd080, ei: 2 }), 0.8, 2.1, 0.2, g);
  lamp.castShadow = false;
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  world.scene.add(g);
  const hw = Math.abs(Math.cos(rotY)) > 0.5 ? 1.15 : 0.5, hd = Math.abs(Math.cos(rotY)) > 0.5 ? 0.5 : 1.15;
  world.addCollider(x - hw, 0, z - hd, x + hw, 1.0, z + hd, { material: 'wood' });
  game.addInteractable({ pos: new THREE.Vector3(x, 0, z), radius: 2.4, key: `wb${x}${z}`, text: '{key} Use field workbench', action: (p) => game.openWorkbench(p) });
  game.worldMarkers.push({ pos: new THREE.Vector3(x, 0, z), cls: 'bench', label: 'Workbench', y: 2.4 });
  game.mapFeatures.push({ x, z, w: 2.4, d: 2.4, color: '#3ac8ff' });
}

export function lamp(world, x, z, h = 5, rotY = 0) {
  const l = makeLamp(h);
  l.position.set(x, 0, z);
  l.rotation.y = rotY;
  world.scene.add(l);
  world.addCollider(x - 0.1, 0, z - 0.1, x + 0.1, h, z + 0.1, { material: 'metal', nav: true });
  return l;
}

export function pointLight(scene, x, y, z, color = 0xffd8a0, intensity = 8, dist = 18) {
  const l = new THREE.PointLight(color, intensity * 7, dist, 1.6);
  l.position.set(x, y, z);
  scene.add(l);
  return l;
}

export function tree(world, x, z, s = 1, snowy = true) {
  const t = makeTree(s, snowy);
  t.position.set(x, 0, z);
  t.rotation.y = rand(0, 6);
  world.scene.add(t);
  world.addCollider(x - 0.2 * s, 0, z - 0.2 * s, x + 0.2 * s, 3 * s, z + 0.2 * s, { material: 'wood' });
  return t;
}

export function parkedTruck(world, model, x, z, rotY = 0) {
  model.position.set(x, 0, z);
  model.rotation.y = rotY;
  world.scene.add(model);
  const along = Math.abs(Math.sin(rotY)) > 0.7;
  const hx = along ? 3.6 : 1.3, hz = along ? 1.3 : 3.6;
  world.addCollider(x - hx, 0, z - hz, x + hx, 2.8, z + hz, { material: 'metal' });
  return model;
}

export function wreckCar(world, x, z, rotY = 0, color = 0x2a2624) {
  const g = new THREE.Group();
  const m = mat(color, { rough: 0.9 });
  box(1.9, 0.8, 4.2, m, 0, 0.6, 0, g);
  box(1.7, 0.6, 2.0, m, 0, 1.3, 0.2, g);
  box(1.6, 0.05, 1.8, mat(0x111111), 0, 1.62, 0.2, g);
  for (const [ox, oz] of [[-0.9, -1.3], [0.9, -1.3], [-0.9, 1.3], [0.9, 1.3]]) {
    const w = cyl(0.35, 0.35, 0.25, mat(0x111111), 8, ox, 0.3, oz, g); w.rotation.z = Math.PI / 2;
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  g.rotation.z = rand(-0.06, 0.06);
  world.scene.add(g);
  const along = Math.abs(Math.sin(rotY)) > 0.7;
  const hx = along ? 2.1 : 0.95, hz = along ? 0.95 : 2.1;
  world.addCollider(x - hx, 0, z - hz, x + hx, 1.55, z + hz, { material: 'metal' });
  return g;
}

export function crater(world, x, z, r = 3) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 18), mat(0x3b3631, { rough: 1 }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.02, z);
  m.receiveShadow = true;
  world.scene.add(m);
  // Rubble lip pieces
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rand(-0.3, 0.3);
    const b = box(rand(0.6, 1.1), rand(0.25, 0.5), rand(0.5, 0.9), mat(0x5a544c), x + Math.cos(a) * r, 0.15, z + Math.sin(a) * r);
    b.rotation.y = rand(0, 3);
    world.scene.add(b);
  }
}

export function tankTrap(world, x, z) {
  const g = new THREE.Group();
  const m = M.rust();
  const a = box(0.18, 0.18, 1.8, m, 0, 0.6, 0, g); a.rotation.set(0.6, 0, 0);
  const b = box(0.18, 0.18, 1.8, m, 0, 0.6, 0, g); b.rotation.set(-0.6, 0, 0);
  const c = box(1.8, 0.18, 0.18, m, 0, 0.6, 0, g); c.rotation.set(0, 0, 0.6);
  g.position.set(x, 0, z);
  g.rotation.y = rand(0, 1);
  world.scene.add(g);
  world.addCollider(x - 0.7, 0, z - 0.7, x + 0.7, 1.2, z + 0.7, { material: 'metal' });
}

export function concreteBlock(world, x, z, len = 2.5, alongX = true, h = 1.1) {
  return world.addBox(x, 0, z, alongX ? len : 0.8, h, alongX ? 0.8 : len, M.concrete(), { material: 'concrete' });
}
