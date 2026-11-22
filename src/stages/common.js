// Shared level-building helpers.
import * as THREE from 'three';
import { mat, box, cyl, makeTree, makeLamp } from '../core/models.js';
import { rand } from '../core/util.js';

export const M = {
  concrete: () => mat(0x8f8f88, { rough: 0.95, edge: 0.55 }),
  concreteDark: () => mat(0x6c6c66, { rough: 0.95, edge: 0.55 }),
  wood: () => mat(0x6b4f35, { rough: 0.9, edge: 0.55 }),
  woodDark: () => mat(0x4a3523, { rough: 0.9, edge: 0.55 }),
  plank: () => mat(0x7a5c3e, { rough: 0.9, edge: 0.55 }),
  metal: () => mat(0x50565a, { rough: 0.5, metal: 0.5, edge: 0.55 }),
  rust: () => mat(0x6e4a32, { rough: 0.8, metal: 0.3, edge: 0.55 }),
  roof: () => mat(0x3f4446, { rough: 0.7, metal: 0.3, edge: 0.55 }),
  sandbag: () => mat(0x9a8a62, { rough: 1, edge: 0.55 }),
  olive: () => mat(0x4e5a3a, { rough: 0.8, edge: 0.55 }),
  crate: () => mat(0x7a6a3a, { rough: 0.9, edge: 0.55 }),
  ammoCrate: () => mat(0x4b5a36, { rough: 0.8, edge: 0.55 }),
  barrel: () => mat(0x3d5a3a, { rough: 0.6, metal: 0.3 }),
  redBarrel: () => mat(0x8a2a22, { rough: 0.6, metal: 0.3 }),
  asphalt: () => mat(0x3a3d40, { rough: 1, edge: 0.55 }),
  snow: () => mat(0xdfe5ea, { rough: 1, edge: 0.55 }),
  bed: () => mat(0x5b6a5a, { rough: 1, edge: 0.55 }),
  mattress: () => mat(0x8a8470, { rough: 1, edge: 0.55 }),
  burnt: () => mat(0x2a2624, { rough: 0.9, edge: 0.55 }),
  brick: () => mat(0x8a5a44, { rough: 0.95, edge: 0.55 }),
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
  world.addStatic(g);
  world.addBox(x, 0, z, alongX ? len : 0.5, h, alongX ? 0.5 : len, null, { material: 'sand' });
  return g;
}

export function barrel(world, x, z, red = false) {
  const m = cyl(0.32, 0.32, 0.95, red ? M.redBarrel() : M.barrel(), 12, x, 0.475, z);
  cyl(0.335, 0.335, 0.06, M.metal(), 12, 0, 0.2, 0, m);
  cyl(0.335, 0.335, 0.06, M.metal(), 12, 0, -0.2, 0, m);
  world.addStatic(m);
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
  world.addStatic(g);
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
  world.addStatic(g);
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
  world.addStatic(l);
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
  world.addStatic(t);
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
  const m = mat(color, { rough: 0.9, edge: 0.6 });
  box(1.9, 0.8, 4.2, m, 0, 0.6, 0, g);
  box(1.7, 0.6, 2.0, m, 0, 1.3, 0.2, g);
  box(1.6, 0.05, 1.8, mat(0x111111), 0, 1.62, 0.2, g);
  box(1.72, 0.42, 0.06, mat(0x141414, { edge: 0.6 }), 0, 1.3, -0.82, g); // empty windscreen
  box(1.96, 0.18, 0.3, mat(0x1c1a18, { edge: 0.6 }), 0, 0.35, -2.15, g); // bumper
  box(0.5, 0.06, 0.9, mat(0x3a2418, { edge: 0.6 }), -0.4, 1.01, -1.3, g).rotation.z = 0.5; // sprung bonnet
  for (const [ox, oz] of [[-0.9, -1.3], [0.9, -1.3], [-0.9, 1.3], [0.9, 1.3]]) {
    const w = cyl(0.35, 0.35, 0.25, mat(0x111111), 8, ox, 0.3, oz, g); w.rotation.z = Math.PI / 2;
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  g.rotation.z = rand(-0.06, 0.06);
  world.addStatic(g);
  const along = Math.abs(Math.sin(rotY)) > 0.7;
  const hx = along ? 2.1 : 0.95, hz = along ? 0.95 : 2.1;
  world.addCollider(x - hx, 0, z - hz, x + hx, 1.55, z + hz, { material: 'metal' });
  return g;
}

let circleGeo = null;
export function crater(world, x, z, r = 3) {
  circleGeo ||= new THREE.CircleGeometry(1, 18);
  const m = new THREE.Mesh(circleGeo, mat(0x3b3631, { rough: 1 }));
  m.rotation.x = -Math.PI / 2;
  m.scale.set(r, r, 1);
  m.position.set(x, 0.02, z);
  m.receiveShadow = true;
  world.addStatic(m);
  // Rubble lip pieces
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rand(-0.3, 0.3);
    const b = box(rand(0.6, 1.1), rand(0.25, 0.5), rand(0.5, 0.9), mat(0x5a544c, { edge: 0.55 }), x + Math.cos(a) * r, 0.15, z + Math.sin(a) * r);
    b.rotation.y = rand(0, 3);
    world.addStatic(b);
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
  world.addStatic(g);
  world.addCollider(x - 0.7, 0, z - 0.7, x + 0.7, 1.2, z + 0.7, { material: 'metal' });
}

export function concreteBlock(world, x, z, len = 2.5, alongX = true, h = 1.1) {
  return world.addBox(x, 0, z, alongX ? len : 0.8, h, alongX ? 0.8 : len, M.concrete(), { material: 'concrete' });
}

// ---------------------------------------------------------------------------------------------
// Extra cover & set dressing. Every prop is static and batched, so a busier level costs almost
// nothing at draw time. Placement helpers skip (with a console warning) if a spot is occupied.

/** True when the footprint [x0..x1]×[z0..z1] is free of move-blocking colliders. */
export function free(world, x0, z0, x1, z1, y0 = 0.05, y1 = 2) {
  return !world.overlapsBox(Math.min(x0, x1), y0, Math.min(z0, z1), Math.max(x0, x1), y1, Math.max(z0, z1));
}
function claim(world, what, x, z, hx, hz, y = 0) {
  if (y > 0 || free(world, x - hx, z - hz, x + hx, z + hz)) return true;
  console.debug(`[layout] skipped ${what} at ${x.toFixed(1)},${z.toFixed(1)}`);
  return false;
}

/** Concrete jersey barrier — 1.2 m tall: crouch fully behind it, stand to shoot over. */
export function jersey(world, x, z, len = 3, alongX = true) {
  if (!claim(world, 'jersey', x, z, alongX ? len / 2 : 0.4, alongX ? 0.4 : len / 2)) return null;
  const g = new THREE.Group();
  const m = M.concrete();
  const n = Math.max(1, Math.round(len / 1.5)), seg = len / n;
  for (let i = 0; i < n; i++) {
    const o = -len / 2 + (i + 0.5) * seg;
    box(seg - 0.04, 0.4, 0.78, m, o, 0.2, 0, g);
    box(seg - 0.04, 0.8, 0.42, m, o, 0.8, 0, g);
    box(seg - 0.04, 0.06, 0.44, mat(i % 2 ? 0xd8d4c8 : 0xb03a2a, { edge: 0.55 }), o, 0.95, 0, g); // painted band
  }
  g.position.set(x, 0, z);
  if (!alongX) g.rotation.y = Math.PI / 2;
  world.addStatic(g);
  return world.addCollider(x - (alongX ? len / 2 : 0.4), 0, z - (alongX ? 0.4 : len / 2), x + (alongX ? len / 2 : 0.4), 1.2, z + (alongX ? 0.4 : len / 2), { material: 'concrete' });
}

/** Wire-mesh sand baskets (HESCO style), 1.35 m tall. n baskets in a row. */
export function hesco(world, x, z, n = 3, alongX = true) {
  const len = n * 1.1;
  if (!claim(world, 'hesco', x, z, alongX ? len / 2 : 0.55, alongX ? 0.55 : len / 2)) return null;
  const g = new THREE.Group();
  const cage = mat(0xa09276, { rough: 1, edge: 1 });
  const sand = mat(0x8a7a58, { rough: 1, edge: 0.4 });
  for (let i = 0; i < n; i++) {
    const o = -len / 2 + (i + 0.5) * 1.1;
    box(1.06, 1.3, 1.06, cage, o, 0.65, 0, g);
    box(0.96, 0.08, 0.96, sand, o, 1.32, 0, g);
  }
  g.position.set(x, 0, z);
  if (!alongX) g.rotation.y = Math.PI / 2;
  world.addStatic(g);
  return world.addCollider(x - (alongX ? len / 2 : 0.55), 0, z - (alongX ? 0.55 : len / 2), x + (alongX ? len / 2 : 0.55), 1.35, z + (alongX ? 0.55 : len / 2), { material: 'sand' });
}

const CONTAINER_COLORS = [0x8a3a2a, 0x2f5a8a, 0x3f6b45, 0xb5642a, 0x6a6e72];
/** Corrugated shipping container (6.1 × 2.6 × 2.44). y lets you stack one on another. */
export function container(world, x, z, alongX = true, color = CONTAINER_COLORS[0], y = 0) {
  const L = 6.1, H = 2.6, W = 2.44;
  const hx = alongX ? L / 2 : W / 2, hz = alongX ? W / 2 : L / 2;
  if (!claim(world, 'container', x, z, hx, hz, y)) return null;
  const g = new THREE.Group();
  const m = mat(color, { rough: 0.75, metal: 0.25, edge: 0.6 });
  const dark = mat(new THREE.Color(color).multiplyScalar(0.55).getHex(), { rough: 0.7, metal: 0.3, edge: 0.6 });
  box(L, H - 0.1, W, m, 0, H / 2, 0, g);
  for (let i = 0; i < 11; i++) box(0.12, H - 0.36, W + 0.06, m, -L / 2 + 0.55 + i * 0.5, H / 2, 0, g); // ribs
  for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(0.18, H, 0.18, dark, ox * (L / 2 - 0.07), H / 2, oz * (W / 2 - 0.07), g);
  box(L, 0.12, W + 0.04, dark, 0, H - 0.06, 0, g);
  box(L, 0.14, W + 0.04, dark, 0, 0.07, 0, g);
  for (const oz of [-0.6, -0.2, 0.2, 0.6]) box(0.06, H - 0.4, 0.05, dark, L / 2 + 0.02, H / 2, oz, g); // door bars
  g.position.set(x, y, z);
  if (!alongX) g.rotation.y = Math.PI / 2;
  world.addStatic(g);
  return world.addCollider(x - hx, y, z - hz, x + hx, y + H, z + hz, { material: 'metal' });
}
container.colors = CONTAINER_COLORS;

/** Small hut with a door you can duck into. side: 'n'|'s'|'e'|'w'. */
export function shed(world, x0, z0, x1, z1, side = 'e', material = M.wood(), h = 2.8) {
  if (!claim(world, 'shed', (x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) / 2 + 0.3, (z1 - z0) / 2 + 0.3)) return;
  // Door centred on a 1 m nav cell so the AI can path through it too.
  const at = Math.floor(side === 'n' || side === 's' ? (x0 + x1) / 2 : (z0 + z1) / 2) + 0.5;
  building(world, x0, z0, x1, z1, h, material, M.roof(), [{ side, at, w: 2.1 }], { lintel: 2.1, floor: M.plank() });
  // Window slit opposite the door for a peek-shot.
  const sx = side === 'e' ? x0 : side === 'w' ? x1 : (x0 + x1) / 2, sz = side === 'n' ? z1 : side === 's' ? z0 : (z0 + z1) / 2;
  world.addBox(sx, 1.5, sz, side === 'e' || side === 'w' ? 0.34 : 1.2, 0.32, side === 'e' || side === 'w' ? 1.2 : 0.34, mat(0x1a1c1e), { collide: false });
}

/** Roofless ruined house: broken walls of mixed height, doorways and rubble. */
export function ruinHouse(world, x, z, w = 7, d = 6, material = M.brick()) {
  if (!claim(world, 'ruin', x, z, w / 2 + 0.3, d / 2 + 0.3)) return;
  const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
  wall(world, x0, z0, x1, z0, 2.9, 0.35, material, { gaps: [{ at: x - w * 0.18, w: 1.8 }, { at: x + w * 0.3, w: 1.0 }] });
  wall(world, x0, z1, x0 + w * 0.55, z1, 1.3, 0.35, material);
  wall(world, x0 + w * 0.55 + 1.6, z1, x1, z1, 2.2, 0.35, material);
  wall(world, x0, z0, x0, z1, 2.4, 0.35, material, { gaps: [{ at: z + d * 0.15, w: 1.1 }] });
  wall(world, x1, z0, x1, z1, 1.25, 0.35, material);
  world.addBox(x, 0, z, w, 0.03, d, mat(0x4a4038, { rough: 1 }), { collide: false });
  // A broken gable and rubble heaps
  world.addBox(x0 + 1.2, 2.9, z0, 2.4, 0.9, 0.35, material, { collide: false });
  const g = new THREE.Group();
  const rub = mat(0x6a5c50, { edge: 0.55 });
  for (let i = 0; i < 7; i++) {
    const b = box(rand(0.4, 0.9), rand(0.2, 0.45), rand(0.4, 0.8), i % 2 ? rub : material, rand(-w / 2 + 0.8, w / 2 - 0.8), 0.15, rand(-d / 2 + 0.8, d / 2 - 0.8), g);
    b.rotation.set(rand(-0.3, 0.3), rand(0, 3), rand(-0.3, 0.3));
  }
  g.position.set(x, 0, z);
  world.addStatic(g);
}

/** Low wall / garden fence. */
export function lowWall(world, x, z, len = 3, alongX = true, h = 1.2, material = M.brick()) {
  if (!claim(world, 'lowWall', x, z, alongX ? len / 2 : 0.2, alongX ? 0.2 : len / 2)) return null;
  return world.addBox(x, 0, z, alongX ? len : 0.4, h, alongX ? 0.4 : len, material, { material: 'concrete' });
}

/** Oil drum with a flickering fire in it (no light source — emissive only, so it is free). */
const flameMats = [];
export function fireBarrel(world, x, z) {
  if (!claim(world, 'fireBarrel', x, z, 0.35, 0.35)) return;
  barrel(world, x, z);
  if (!flameMats.length) {
    flameMats.push(new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    flameMats.push(new THREE.MeshBasicMaterial({ color: 0xff5a1a, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
  }
  const f = new THREE.Group();
  const a = box(0.34, 0.5, 0.34, flameMats[0], 0, 0.25, 0, f);
  const b = box(0.24, 0.7, 0.24, flameMats[1], 0, 0.35, 0, f);
  a.castShadow = b.castShadow = false;
  f.position.set(x, 0.95, z);
  world.scene.add(f);
  const ph = rand(0, 10);
  world.anims.push((dt, t) => {
    const k = Math.sin(t * 17 + ph) * 0.5 + Math.sin(t * 29 + ph * 2) * 0.5;
    a.scale.set(1 + k * 0.12, 1 + k * 0.3, 1 - k * 0.1);
    b.scale.set(1 - k * 0.1, 1 - k * 0.25 + Math.sin(t * 7 + ph) * 0.15, 1 + k * 0.1);
    b.rotation.y = t * 3 + ph; a.rotation.y = -t * 2;
  });
  return f;
}

/** Waving flag cloth. */
export function waveFlag(world, flag) {
  const cloth = flag.userData.cloth;
  if (!cloth) return;
  const ph = rand(0, 6);
  world.anims.push((dt, t) => {
    cloth.rotation.y = Math.sin(t * 1.7 + ph) * 0.28 + Math.sin(t * 4.3 + ph) * 0.07;
    cloth.children.forEach((c, i) => { c.rotation.y = Math.sin(t * 5 + i * 0.8 + ph) * 0.12; });
  });
}

/** Power line along Z at x: poles every `step` metres with sagging wires (visual + thin pole colliders). */
export function powerLine(world, x, z0, z1, step = 34) {
  const g = new THREE.Group();
  const wood = M.woodDark();
  const wire = mat(0x1a1a1a);
  const zs = [];
  for (let z = z0; z > z1; z -= step) if (free(world, x - 0.4, z - 0.4, x + 0.4, z + 0.4)) zs.push(z);
  zs.forEach((z, i) => {
    cyl(0.12, 0.15, 7.5, wood, 6, x, 3.75, z, g);
    box(1.8, 0.12, 0.12, wood, x, 7.1, z, g);
    world.addCollider(x - 0.14, 0, z - 0.14, x + 0.14, 7.5, z + 0.14, { material: 'wood' });
    if (i === 0) return;
    const zp = zs[i - 1];
    for (const ox of [-0.75, 0.75]) {
      // Three segments approximate the sag.
      const pts = [0, 0.33, 0.66, 1].map((t) => [zp + (z - zp) * t, 7.15 - Math.sin(t * Math.PI) * 0.9]);
      for (let k = 0; k < 3; k++) {
        const [za, ya] = pts[k], [zb, yb] = pts[k + 1];
        const len = Math.hypot(zb - za, yb - ya);
        const w = box(0.03, 0.03, len, wire, x + ox, (ya + yb) / 2, (za + zb) / 2, g);
        w.rotation.x = Math.atan2(-(yb - ya), zb - za);
        w.castShadow = false;
      }
    }
  });
  world.addStatic(g);
}

/** Burnt-out bus — big, long hard cover. */
export function busWreck(world, x, z, alongX = false) {
  const L = 9, W = 2.5, H = 2.7;
  const hx = alongX ? L / 2 : W / 2, hz = alongX ? W / 2 : L / 2;
  if (!claim(world, 'bus', x, z, hx, hz)) return;
  const g = new THREE.Group();
  const body = mat(0x5a4a3a, { rough: 0.95, edge: 0.6 });
  const soot = mat(0x241f1c, { rough: 1, edge: 0.6 });
  box(W, 1.2, L, body, 0, 0.95, 0, g);
  box(W, 0.9, L, soot, 0, 2.0, 0, g); // window band, burnt out
  for (let i = 0; i < 7; i++) box(W + 0.04, 0.9, 0.14, body, 0, 2.0, -L / 2 + 0.6 + i * 1.3, g); // pillars
  box(W, 0.2, L, body, 0, 2.55, 0, g);
  for (const oz of [-L / 2 + 1.4, L / 2 - 1.6]) for (const ox of [-1, 1]) { const wh = cyl(0.5, 0.5, 0.3, mat(0x111111), 8, ox * (W / 2 - 0.1), 0.35, oz, g); wh.rotation.z = Math.PI / 2; }
  g.position.set(x, 0, z);
  if (alongX) g.rotation.y = Math.PI / 2;
  g.rotation.z = rand(-0.04, 0.04);
  world.addStatic(g);
  world.addCollider(x - hx, 0, z - hz, x + hx, H, z + hz, { material: 'metal' });
}
