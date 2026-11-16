// Procedural low-poly models built from primitives.
import * as THREE from 'three';
import { boxGeo } from './world.js';

const matCache = new Map();
export function mat(color, opts = {}) {
  const key = `${color}|${opts.emissive || ''}|${opts.ei || ''}|${opts.rough || ''}|${opts.metal || ''}|${opts.transparent || ''}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color, roughness: opts.rough ?? 0.85, metalness: opts.metal ?? 0.05,
      emissive: opts.emissive ?? 0x000000, emissiveIntensity: opts.ei ?? 1,
      transparent: !!opts.transparent, opacity: opts.opacity ?? 1,
    });
    matCache.set(key, m);
  }
  return m;
}

export function box(w, h, d, material, x = 0, y = 0, z = 0, parent = null) {
  const m = new THREE.Mesh(boxGeo(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}

const cylCache = new Map();
export function cyl(rt, rb, h, material, seg = 10, x = 0, y = 0, z = 0, parent = null) {
  const k = `${rt}|${rb}|${h}|${seg}`;
  let g = cylCache.get(k);
  if (!g) { g = new THREE.CylinderGeometry(rt, rb, h, seg); cylCache.set(k, g); }
  const m = new THREE.Mesh(g, material);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}

// ---------------- Guns ----------------
const C = {
  metal: () => mat(0x2b2d30, { rough: 0.45, metal: 0.6 }),
  metalLight: () => mat(0x4a4d52, { rough: 0.4, metal: 0.6 }),
  wood: () => mat(0x8a4a22, { rough: 0.6 }),
  woodDark: () => mat(0x5e3216, { rough: 0.65 }),
  olive: () => mat(0x4b5233, { rough: 0.8 }),
  glass: () => mat(0x88aacc, { rough: 0.1, metal: 0.3, emissive: 0x223344 }),
  red: () => mat(0xff2a2a, { emissive: 0xff0000, ei: 2 }),
};

/** Gun model pointing down -Z. Returns group with .muzzle (Object3D) and .length. */
export function makeGun(type, att = {}) {
  const g = new THREE.Group();
  const muzzle = new THREE.Object3D();
  let len = 0.7;
  if (type === 'ak74' || type === 'rpk') {
    const rpk = type === 'rpk';
    const bl = rpk ? 0.62 : 0.42;
    box(0.06, 0.085, 0.42, C.metal(), 0, 0, -0.02, g); // receiver
    box(0.064, 0.03, 0.4, C.metalLight(), 0, 0.055, -0.02, g); // dust cover
    box(0.075, 0.075, 0.2, C.wood(), 0, -0.005, -0.32, g); // handguard
    box(0.05, 0.03, 0.18, C.wood(), 0, 0.05, -0.31, g); // upper handguard
    const barrel = cyl(0.013, 0.013, bl, C.metal(), 8, 0, 0.012, -0.22 - bl / 2, g);
    barrel.rotation.x = Math.PI / 2;
    cyl(0.02, 0.02, 0.06, C.metal(), 8, 0, 0.012, -0.22 - bl + 0.03, g).rotation.x = Math.PI / 2; // muzzle brake
    box(0.012, 0.045, 0.012, C.metal(), 0, 0.055, -0.2 - bl + 0.06, g); // front sight
    box(0.02, 0.025, 0.04, C.metal(), 0, 0.075, 0.08, g); // rear sight
    // stock
    const stock = box(0.05, 0.09, 0.26, rpk ? C.woodDark() : C.wood(), 0, -0.035, 0.31, g);
    stock.rotation.x = 0.12;
    // grip
    const grip = box(0.045, 0.11, 0.05, C.woodDark(), 0, -0.09, 0.13, g); grip.rotation.x = -0.35;
    // magazine / drum
    if (att.drum) {
      const d = cyl(0.085, 0.085, 0.07, C.metal(), 16, 0, -0.14, -0.06, g); d.rotation.z = Math.PI / 2;
      box(0.04, 0.08, 0.05, C.metal(), 0, -0.07, -0.08, g);
    } else {
      const m1 = box(0.045, 0.12, 0.07, mat(0xa0522d, { rough: 0.6 }), 0, -0.1, -0.08, g); m1.rotation.x = 0.25;
      const m2 = box(0.045, rpk ? 0.14 : 0.1, 0.07, mat(0xa0522d, { rough: 0.6 }), 0, rpk ? -0.2 : -0.18, -0.05, g); m2.rotation.x = 0.55;
    }
    if (rpk) {
      // bipod folded
      box(0.012, 0.012, 0.3, C.metal(), 0.025, -0.02, -0.55, g);
      box(0.012, 0.012, 0.3, C.metal(), -0.025, -0.02, -0.55, g);
    }
    if (att.suppressor) {
      const s = cyl(0.026, 0.026, 0.22, C.metal(), 10, 0, 0.012, -0.22 - bl - 0.1, g); s.rotation.x = Math.PI / 2;
      len = 0.22 + bl + 0.21;
    } else len = 0.22 + bl;
    if (att.optic) addOptic(g, 0.1, -0.02);
  } else if (type === 'makarov') {
    box(0.035, 0.05, 0.17, C.metal(), 0, 0, -0.02, g);
    box(0.033, 0.11, 0.05, mat(0x3a2a20, { rough: 0.7 }), 0, -0.07, 0.04, g).rotation.x = -0.25;
    box(0.01, 0.015, 0.01, C.metal(), 0, 0.03, -0.09, g);
    len = 0.11;
    if (att.suppressor) { const s = cyl(0.02, 0.02, 0.16, C.metal(), 10, 0, 0.005, -0.18, g); s.rotation.x = Math.PI / 2; len = 0.27; }
    if (att.optic) addOptic(g, 0.04, -0.03, 0.6);
  } else if (type === 'rpg') {
    const t = cyl(0.04, 0.04, 0.95, C.olive(), 12, 0, 0, 0.05, g); t.rotation.x = Math.PI / 2;
    const wh = cyl(0.0, 0.07, 0.22, C.olive(), 12, 0, 0, -0.52, g); wh.rotation.x = -Math.PI / 2;
    const wb = cyl(0.07, 0.03, 0.12, mat(0x3d4428), 12, 0, 0, -0.36, g); wb.rotation.x = -Math.PI / 2;
    box(0.06, 0.07, 0.24, C.wood(), 0, -0.01, -0.05, g);
    box(0.035, 0.1, 0.04, C.metal(), 0, -0.08, 0.02, g).rotation.x = -0.3;
    box(0.035, 0.1, 0.04, C.metal(), 0, -0.08, -0.12, g).rotation.x = -0.3;
    const bell = cyl(0.07, 0.045, 0.12, C.metal(), 12, 0, 0, 0.55, g); bell.rotation.x = Math.PI / 2;
    len = 0.6;
    if (att.optic) addOptic(g, 0.07, -0.05, 1, 0.045);
  } else if (type === 'shovel') {
    const h = cyl(0.016, 0.016, 0.55, mat(0x6b4426), 8, 0, 0, -0.1, g); h.rotation.x = Math.PI / 2;
    box(0.15, 0.012, 0.18, mat(0x3f4532, { metal: 0.5, rough: 0.5 }), 0, 0, -0.45, g);
    len = 0.5;
  } else if (type === 'flaregun') {
    box(0.05, 0.06, 0.12, mat(0xd8641c, { rough: 0.5 }), 0, 0, 0, g);
    const b = cyl(0.03, 0.03, 0.16, mat(0xd8641c, { rough: 0.5 }), 10, 0, 0.01, -0.12, g); b.rotation.x = Math.PI / 2;
    box(0.04, 0.1, 0.045, mat(0xb05010), 0, -0.07, 0.04, g).rotation.x = -0.3;
    len = 0.2;
  } else if (type === 'molotov') {
    cyl(0.04, 0.045, 0.16, mat(0x6b8f4a, { rough: 0.15, metal: 0.2, transparent: true, opacity: 0.85 }), 10, 0, 0, 0, g);
    cyl(0.015, 0.02, 0.07, mat(0x6b8f4a, { rough: 0.15 }), 8, 0, 0.11, 0, g);
    box(0.03, 0.08, 0.02, mat(0xe8dcc0), 0, 0.17, 0, g);
    len = 0;
  } else if (type === 'pkm') {
    box(0.07, 0.1, 0.5, C.metal(), 0, 0, 0, g);
    const b = cyl(0.016, 0.016, 0.6, C.metal(), 8, 0, 0.01, -0.55, g); b.rotation.x = Math.PI / 2;
    box(0.05, 0.08, 0.25, C.woodDark(), 0, -0.02, 0.35, g);
    box(0.09, 0.1, 0.1, mat(0x4b5233), 0.06, -0.06, -0.05, g);
    len = 0.85;
  } else if (type === 'svd') {
    box(0.055, 0.08, 0.45, C.metal(), 0, 0, 0, g);
    const b = cyl(0.012, 0.012, 0.6, C.metal(), 8, 0, 0.01, -0.5, g); b.rotation.x = Math.PI / 2;
    box(0.05, 0.12, 0.3, C.wood(), 0, -0.03, 0.33, g);
    addOptic(g, 0.09, 0.0, 1.2);
    len = 0.8;
  }
  muzzle.position.set(0, type === 'rpg' ? 0 : 0.012, -len);
  g.add(muzzle);
  g.muzzle = muzzle;
  g.length = len;
  return g;
}

function addOptic(g, y, z, s = 1, r = 0.021) {
  const o = new THREE.Group();
  box(0.03, 0.03, 0.06, C.metal(), 0, -0.02, 0, o); // mount
  const tube = cyl(r, r, 0.11 * s, C.metal(), 12, 0, 0.015, 0, o); tube.rotation.x = Math.PI / 2;
  const lens = cyl(r * 0.85, r * 0.85, 0.005, C.glass(), 12, 0, 0.015, -0.056 * s, o); lens.rotation.x = Math.PI / 2;
  const dot = box(0.006, 0.006, 0.002, C.red(), 0, 0.015, 0.03 * s, o);
  dot.castShadow = false;
  o.position.set(0, y, z);
  g.add(o);
  g.optic = o;
}

// ---------------- Humanoid ----------------
export const PALETTE = {
  skinDark: [0x3b2417, 0x4a2c1a, 0x2e1c12, 0x5a3620],
  skinLight: [0xd9b49a, 0xc9a184, 0xe0bfa3, 0xb88e70],
};

/**
 * Build a blocky soldier. Faces -Z. Feet at y=0. Parts exposed for animation.
 * opts: {skin, top, pants, hat:'helmet'|'ushanka'|'cap'|'beanie'|'hood'|null, hatColor, band, vest}
 */
export function makeHumanoid(opts) {
  const root = new THREE.Group();
  const body = new THREE.Group(); // tilts when downed
  root.add(body);
  const skin = mat(opts.skin);
  const top = mat(opts.top);
  const pants = mat(opts.pants);
  const boots = mat(0x1d1b19);
  const parts = {};

  const hips = new THREE.Group(); hips.position.y = 0.92; body.add(hips);
  const legL = new THREE.Group(); legL.position.set(-0.11, 0, 0); hips.add(legL);
  const legR = new THREE.Group(); legR.position.set(0.11, 0, 0); hips.add(legR);
  box(0.17, 0.8, 0.19, pants, 0, -0.42, 0, legL);
  box(0.17, 0.8, 0.19, pants, 0, -0.42, 0, legR);
  box(0.18, 0.12, 0.27, boots, 0, -0.86, -0.04, legL);
  box(0.18, 0.12, 0.27, boots, 0, -0.86, -0.04, legR);

  const torso = new THREE.Group(); torso.position.y = 0.92; body.add(torso);
  box(0.46, 0.6, 0.26, top, 0, 0.32, 0, torso);
  if (opts.vest) box(0.48, 0.38, 0.3, mat(opts.vest), 0, 0.36, 0, torso);
  if (opts.hood) box(0.36, 0.14, 0.14, top, 0, 0.6, 0.12, torso);
  const headG = new THREE.Group(); headG.position.y = 0.66; torso.add(headG);
  box(0.24, 0.27, 0.25, skin, 0, 0.14, 0, headG);
  box(0.25, 0.04, 0.02, mat(0x111111), 0, 0.17, -0.126, headG); // eyes strip shadow
  if (opts.hat === 'helmet') {
    box(0.3, 0.13, 0.31, mat(opts.hatColor ?? 0x4b5340, { rough: 0.6 }), 0, 0.3, 0, headG);
    box(0.32, 0.03, 0.33, mat(opts.hatColor ?? 0x4b5340, { rough: 0.6 }), 0, 0.24, 0, headG);
  } else if (opts.hat === 'ushanka') {
    box(0.31, 0.14, 0.31, mat(opts.hatColor ?? 0x5a5040), 0, 0.31, 0, headG);
    box(0.06, 0.16, 0.2, mat(opts.hatColor ?? 0x5a5040), -0.15, 0.17, 0.02, headG);
    box(0.06, 0.16, 0.2, mat(opts.hatColor ?? 0x5a5040), 0.15, 0.17, 0.02, headG);
  } else if (opts.hat === 'cap') {
    box(0.27, 0.08, 0.27, mat(opts.hatColor ?? 0x333333), 0, 0.3, 0, headG);
    box(0.24, 0.02, 0.12, mat(opts.hatColor ?? 0x333333), 0, 0.27, -0.17, headG);
  } else if (opts.hat === 'beanie') {
    box(0.27, 0.12, 0.27, mat(opts.hatColor ?? 0x222222), 0, 0.31, 0, headG);
  } else if (opts.hat === 'braids') {
    for (let i = 0; i < 7; i++) {
      const a = (i / 6) * Math.PI - Math.PI / 2;
      box(0.04, 0.22, 0.04, mat(0x15100c), Math.sin(a) * 0.12, 0.12, Math.cos(a) * 0.1 + 0.03, headG);
    }
    box(0.26, 0.06, 0.26, mat(0x15100c), 0, 0.29, 0, headG);
  } else if (opts.hat === 'ghillie') {
    box(0.36, 0.2, 0.36, mat(0xdfe3e0), 0, 0.27, 0.02, headG);
  }
  if (opts.band) {
    box(0.48, 0.07, 0.28, mat(opts.band, { emissive: opts.band, ei: 0.25 }), 0, 0.56, 0, torso); // scarf/collar
  }

  const armL = new THREE.Group(); armL.position.set(-0.3, 0.56, 0); torso.add(armL);
  const armR = new THREE.Group(); armR.position.set(0.3, 0.56, 0); torso.add(armR);
  box(0.13, 0.36, 0.14, top, 0, -0.17, 0, armL);
  box(0.13, 0.36, 0.14, top, 0, -0.17, 0, armR);
  const foreL = new THREE.Group(); foreL.position.y = -0.34; armL.add(foreL);
  const foreR = new THREE.Group(); foreR.position.y = -0.34; armR.add(foreR);
  box(0.12, 0.3, 0.13, top, 0, -0.14, 0, foreL);
  box(0.12, 0.3, 0.13, top, 0, -0.14, 0, foreR);
  box(0.1, 0.09, 0.1, skin, 0, -0.32, 0, foreL);
  box(0.1, 0.09, 0.1, skin, 0, -0.32, 0, foreR);
  if (opts.band2) box(0.14, 0.06, 0.15, mat(opts.band2, { emissive: opts.band2, ei: 0.4 }), 0, -0.1, 0, armL);

  // Gun pivot at chest, held forward.
  const gunPivot = new THREE.Group(); gunPivot.position.set(0.08, 0.42, -0.28); torso.add(gunPivot);

  Object.assign(parts, { root, body, hips, legL, legR, torso, headG, armL, armR, foreL, foreR, gunPivot });
  root.userData.parts = parts;
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  return root;
}

export function setHeldGun(model, type, att) {
  const p = model.userData.parts;
  if (p.gun) { p.gunPivot.remove(p.gun); p.gun = null; }
  if (!type) return;
  const g = makeGun(type, att || {});
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  p.gunPivot.add(g);
  p.gun = g;
}

/** Pose a humanoid. state: {move (0..1), t, aiming, crouch, downed, dead, deadT} */
export function animateHumanoid(model, s) {
  const p = model.userData.parts;
  const sw = Math.sin(s.t * 9) * 0.7 * s.move;
  p.legL.rotation.x = sw; p.legR.rotation.x = -sw;
  p.body.rotation.set(0, 0, 0);
  p.body.position.set(0, 0, 0);
  const crouch = s.crouch ? 1 : 0;
  p.hips.position.y = 0.92 - crouch * 0.35;
  p.torso.position.y = 0.92 - crouch * 0.35;
  if (crouch) { p.legL.rotation.x = -1.1 + sw * 0.3; p.legR.rotation.x = 0.2 - sw * 0.3; p.torso.rotation.x = -0.15; }
  else p.torso.rotation.x = 0;
  p.torso.rotation.y = 0;
  if (p.gun || s.aiming) {
    // Two-hand rifle hold.
    p.armR.rotation.set(-1.25 + (s.aimPitch || 0) * 0.8, 0, 0.1);
    p.foreR.rotation.set(-0.35, 0, 0);
    p.armL.rotation.set(-1.4 + (s.aimPitch || 0) * 0.8, 0, -0.55);
    p.foreL.rotation.set(-0.2, 0, 0);
    p.gunPivot.rotation.x = s.aimPitch || 0;
  } else {
    p.armL.rotation.set(-sw * 0.8, 0, 0); p.armR.rotation.set(sw * 0.8, 0, 0);
    p.foreL.rotation.set(-0.3, 0, 0); p.foreR.rotation.set(-0.3, 0, 0);
  }
  if (s.surrender) {
    p.armL.rotation.set(-2.9, 0, -0.25); p.armR.rotation.set(-2.9, 0, 0.25);
    p.foreL.rotation.set(-0.2, 0, 0); p.foreR.rotation.set(-0.2, 0, 0);
  }
  if (s.reviving) {
    p.hips.position.y = 0.45; p.torso.position.y = 0.45; p.torso.rotation.x = -0.6;
    p.legL.rotation.x = -1.6; p.legR.rotation.x = -0.4;
  }
  if (s.downed || s.dead) {
    const k = s.dead ? Math.min(1, (s.deadT || 0) * 3) : 1;
    p.body.rotation.x = (s.dead ? -1 : 1) * Math.PI / 2 * k * 0.97;
    p.body.position.y = 0.18 * k;
    p.body.position.z = (s.dead ? 0.1 : -0.1) * k;
    p.legL.rotation.x = 0.1; p.legR.rotation.x = -0.15;
    if (s.downed) {
      p.armL.rotation.set(-0.4 + Math.sin(s.t * 3) * 0.3, 0, -0.4);
      p.armR.rotation.set(-1.0, 0, 0.3);
    }
  }
}

// ---------------- Vehicles ----------------
export function makeTruck(color = 0x4e5a3a, canvas = false) {
  const g = new THREE.Group();
  const body = mat(color, { rough: 0.7 });
  const dark = mat(0x1c1c1c);
  // Cab (front at -Z)
  box(2.4, 1.1, 2.0, body, 0, 1.15, -2.3, g); // hood/engine
  box(2.5, 1.5, 1.7, body, 0, 1.95, -1.0, g); // cab
  box(2.3, 0.6, 0.05, mat(0x8fb3c9, { rough: 0.1, metal: 0.4, emissive: 0x1a2a33 }), 0, 2.25, -1.86, g); // windshield
  box(2.6, 0.25, 0.3, dark, 0, 0.75, -3.35, g); // bumper
  const lightM = mat(0xfff3c0, { emissive: 0xfff0b0, ei: 1.5 });
  box(0.3, 0.2, 0.06, lightM, -0.9, 1.35, -3.32, g);
  box(0.3, 0.2, 0.06, lightM, 0.9, 1.35, -3.32, g);
  // Chassis + bed
  box(2.2, 0.35, 7.6, dark, 0, 0.75, 0.3, g);
  box(2.6, 0.15, 4.4, mat(0x5b4a35), 0, 1.15, 2.4, g); // bed floor top at ~1.22
  box(0.08, 0.6, 4.4, body, -1.28, 1.52, 2.4, g);
  box(0.08, 0.6, 4.4, body, 1.28, 1.52, 2.4, g);
  box(2.6, 0.6, 0.08, body, 0, 1.52, 4.58, g);
  box(2.6, 0.9, 0.08, body, 0, 1.67, 0.22, g);
  if (canvas) {
    box(2.7, 1.6, 4.4, mat(0x4a5236, { rough: 0.95 }), 0, 2.6, 2.4, g);
  }
  // Wheels
  const wheels = [];
  const wm = mat(0x151515, { rough: 0.9 });
  for (const [x, z] of [[-1.2, -2.4], [1.2, -2.4], [-1.2, 1.4], [1.2, 1.4], [-1.2, 3.1], [1.2, 3.1]]) {
    const w = cyl(0.55, 0.55, 0.4, wm, 14, x, 0.55, z, g);
    w.rotation.z = Math.PI / 2;
    wheels.push(w);
  }
  g.userData.wheels = wheels;
  return g;
}

export function makeTechnical(color = 0x6b6650) {
  const g = new THREE.Group();
  const body = mat(color, { rough: 0.6, metal: 0.2 });
  const dark = mat(0x1a1a1a);
  box(2.0, 0.7, 4.8, body, 0, 0.85, 0, g);
  box(1.9, 0.75, 1.6, body, 0, 1.55, -0.3, g);
  box(1.8, 0.5, 0.05, mat(0x8fb3c9, { rough: 0.1, emissive: 0x1a2a33 }), 0, 1.6, -1.12, g);
  box(0.06, 0.4, 2.0, body, -0.97, 1.4, 1.4, g);
  box(0.06, 0.4, 2.0, body, 0.97, 1.4, 1.4, g);
  box(2.0, 0.4, 0.06, body, 0, 1.4, 2.4, g);
  // MG mount
  cyl(0.05, 0.05, 0.9, dark, 8, 0, 1.6, 1.2, g);
  const lightM = mat(0xfff3c0, { emissive: 0xfff0b0, ei: 1.5 });
  box(0.3, 0.15, 0.05, lightM, -0.7, 1.0, -2.42, g);
  box(0.3, 0.15, 0.05, lightM, 0.7, 1.0, -2.42, g);
  const wm = mat(0x151515, { rough: 0.9 });
  for (const [x, z] of [[-0.95, -1.5], [0.95, -1.5], [-0.95, 1.5], [0.95, 1.5]]) {
    const w = cyl(0.42, 0.42, 0.3, wm, 12, x, 0.42, z, g); w.rotation.z = Math.PI / 2;
  }
  const mg = makeGun('pkm');
  mg.position.set(0, 2.1, 1.2);
  g.add(mg);
  g.userData.mg = mg;
  return g;
}

export function makeDrone() {
  const g = new THREE.Group();
  const dark = mat(0x2a2c2e, { metal: 0.4, rough: 0.5 });
  box(0.35, 0.12, 0.35, dark, 0, 0, 0, g);
  const rotors = [];
  for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) {
    const arm = box(0.32, 0.03, 0.04, dark, x / 2, 0, z / 2, g);
    arm.rotation.y = Math.atan2(z, x);
    const r = box(0.34, 0.01, 0.04, mat(0x777777), x, 0.06, z, g);
    rotors.push(r);
  }
  const eye = box(0.08, 0.08, 0.08, mat(0xff3030, { emissive: 0xff2020, ei: 3 }), 0, -0.08, -0.15, g);
  eye.castShadow = false;
  g.userData.rotors = rotors;
  g.userData.eye = eye;
  return g;
}

// ---------------- Props ----------------
export function makeTree(scale = 1, snowy = true) {
  const g = new THREE.Group();
  cyl(0.15 * scale, 0.22 * scale, 2 * scale, mat(0x3d2b1f), 6, 0, scale, 0, g);
  const leaf = mat(snowy ? 0x2f4a38 : 0x2f5a2c, { rough: 0.95 });
  const snow = mat(0xe8eef2, { rough: 0.9 });
  for (let i = 0; i < 3; i++) {
    const h = (2.2 - i * 0.4) * scale, r = (1.6 - i * 0.4) * scale;
    const c = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), leaf);
    c.position.y = (1.8 + i * 1.1) * scale; c.castShadow = true;
    g.add(c);
    if (snowy) {
      const s = new THREE.Mesh(new THREE.ConeGeometry(r * 0.6, h * 0.35, 7), snow);
      s.position.y = (1.8 + i * 1.1 + h * 0.33) * scale;
      g.add(s);
    }
  }
  return g;
}

export function makeFlag(colors) {
  const g = new THREE.Group();
  cyl(0.04, 0.04, 6, mat(0x777777, { metal: 0.6 }), 6, 0, 3, 0, g);
  const h = 0.7 / colors.length;
  colors.forEach((c, i) => box(1.4, h, 0.02, mat(c, { emissive: c, ei: 0.15 }), 0.72, 5.6 - i * h, 0, g));
  return g;
}

export function makeLamp(height = 5) {
  const g = new THREE.Group();
  cyl(0.06, 0.08, height, mat(0x333333, { metal: 0.5 }), 6, 0, height / 2, 0, g);
  box(0.7, 0.06, 0.06, mat(0x333333), 0.3, height, 0, g);
  const bulb = box(0.3, 0.12, 0.25, mat(0xfff0c0, { emissive: 0xffe0a0, ei: 2.5 }), 0.6, height - 0.08, 0, g);
  bulb.castShadow = false;
  return g;
}
