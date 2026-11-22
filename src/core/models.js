// Procedural low-poly models built from primitives.
import * as THREE from 'three';
import { boxGeo, bakeGeometry } from './world.js';

const matCache = new Map();
/**
 * Cached MeshStandardMaterial. opts.edge (0..1) adds crisp, screen-space block outlines plus a
 * soft bevel highlight to box faces in the fragment shader — no extra geometry or draw calls.
 */
export function mat(color, opts = {}) {
  const key = `${color}|${opts.emissive || ''}|${opts.ei || ''}|${opts.rough || ''}|${opts.metal || ''}|${opts.transparent || ''}|${opts.edge || ''}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color, roughness: opts.rough ?? 0.85, metalness: opts.metal ?? 0.05,
      emissive: opts.emissive ?? 0x000000, emissiveIntensity: opts.ei ?? 1,
      transparent: !!opts.transparent, opacity: opts.opacity ?? 1,
    });
    if (opts.edge) addEdges(m, opts.edge);
    matCache.set(key, m);
  }
  return m;
}

function edgeShader(shader) {
  shader.uniforms.uEdge = this.userData.edgeU;
  shader.vertexShader = 'varying vec2 vEdgeUv;\n' + shader.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n  vEdgeUv = uv;');
  shader.fragmentShader = 'varying vec2 vEdgeUv;\nuniform float uEdge;\n' + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  {
    vec2 eD = min(vEdgeUv, 1.0 - vEdgeUv);
    vec2 ePx = eD / max(fwidth(vEdgeUv), vec2(1e-4));
    float eP = min(ePx.x, ePx.y), eU = min(eD.x, eD.y);
    float eLine = (1.0 - smoothstep(0.7, 1.9, eP)) * (1.0 - smoothstep(0.07, 0.14, eU));
    float eBev = (1.0 - smoothstep(1.9, 6.0, eP)) * (1.0 - eLine) * (1.0 - smoothstep(0.12, 0.25, eU));
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.16, eLine * uEdge);
    diffuseColor.rgb *= 1.0 + eBev * 0.3 * uEdge;
  }`);
}
export function addEdges(m, strength = 1) {
  m.userData.edgeU = { value: strength };
  m.onBeforeCompile = edgeShader;
  return m;
}

/**
 * Bake a group of static meshes into one mesh per material (a big draw-call saver for props
 * built from many boxes). Returns a new Group positioned like the source.
 */
export function mergeGroup(src, { castShadow = true, receiveShadow = true } = {}) {
  src.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(src.matrixWorld).invert();
  const byMat = new Map();
  src.traverse((o) => {
    if (!o.isMesh || Array.isArray(o.material)) return;
    const m4 = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    (byMat.get(o.material) || byMat.set(o.material, []).get(o.material)).push([o.geometry, m4]);
  });
  const out = new THREE.Group();
  out.position.copy(src.position); out.rotation.copy(src.rotation); out.scale.copy(src.scale);
  for (const [material, list] of byMat) {
    const mesh = new THREE.Mesh(bakeGeometry(list), material);
    mesh.castShadow = castShadow; mesh.receiveShadow = receiveShadow;
    out.add(mesh);
  }
  return out;
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

// Hip height of the blocky character (legs below, torso above).
export const HIP = 0.76;

const faceCache = {};
/** Painted face decal (shared texture): 'smile' for the squad, 'stern' for soldiers. */
function faceMat(kind) {
  if (faceCache[kind]) return faceCache[kind];
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  x.lineCap = 'round'; x.lineJoin = 'round';
  // Cartoon eyes: white with a dark outline and pupil, so they read on every skin tone.
  for (const ex of [21, 43]) {
    x.fillStyle = '#f4f1ea'; x.strokeStyle = '#111'; x.lineWidth = 2.2;
    x.beginPath(); x.ellipse(ex, 26, 6, 7.5, 0, 0, Math.PI * 2); x.fill(); x.stroke();
    x.fillStyle = '#111';
    x.beginPath(); x.ellipse(ex + (kind === 'smile' ? 0.5 : 0), 27.5, 3, 4.2, 0, 0, Math.PI * 2); x.fill();
  }
  x.strokeStyle = '#111';
  if (kind === 'smile') {
    // Toothy grin
    x.fillStyle = '#f4f1ea'; x.lineWidth = 2.4;
    x.beginPath(); x.moveTo(20, 40); x.quadraticCurveTo(32, 56, 44, 40); x.closePath(); x.fill(); x.stroke();
  } else {
    // Angled brows and a hard, flat mouth.
    x.lineWidth = 4;
    x.beginPath(); x.moveTo(13, 14); x.lineTo(28, 19); x.moveTo(51, 14); x.lineTo(36, 19); x.stroke();
    x.fillStyle = '#f4f1ea'; x.lineWidth = 2.4;
    x.beginPath(); x.rect(23, 43, 18, 5); x.fill(); x.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const m = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.35, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 });
  faceCache[kind] = m;
  return m;
}
let faceGeo = null;

let charMat = null;
const _bc = new THREE.Color();
const partCache = new Map();
function bakePart(part, skip, key) {
  const meshes = part.children.filter((o) => o.isMesh && o !== skip);
  if (meshes.length === 0) return;
  charMat ||= addEdges(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.05 }), 1);
  for (const m of meshes) part.remove(m);
  const cached = partCache.get(key);
  if (cached) { part.add(new THREE.Mesh(cached, charMat)); return; }
  const list = meshes.map((m) => {
    m.updateMatrix();
    const c = _bc.copy(m.material.color);
    if (m.material.emissiveIntensity && m.material.emissive.getHex()) c.multiplyScalar(1.35);
    return [m.geometry, m.matrix.clone(), c.clone()];
  });
  const geo = bakeGeometry(list);
  geo.parameters = { shared: true }; // keep Game.dispose() from freeing a shared geometry
  partCache.set(key, geo);
  part.add(new THREE.Mesh(geo, charMat));
}

/**
 * Build a blocky, outlined character (classic block-avatar proportions: square head, 2:2:1
 * torso, straight block limbs). Faces -Z. Feet at y=0. Parts exposed for animation.
 * opts: {skin, top, pants, hat:'helmet'|'ushanka'|'cap'|'beanie'|'braids'|'ghillie'|null, hatColor, band, vest, face}
 */
export function makeHumanoid(opts) {
  const root = new THREE.Group();
  const body = new THREE.Group(); // tilts when downed
  root.add(body);
  const E = { edge: 1 };
  const skin = mat(opts.skin, E);
  const top = mat(opts.top, E);
  const pants = mat(opts.pants, E);
  const boots = mat(0x1d1b19, E);
  const parts = {};

  const hips = new THREE.Group(); hips.position.y = HIP; body.add(hips);
  const legL = new THREE.Group(); legL.position.set(-0.152, 0, 0); hips.add(legL);
  const legR = new THREE.Group(); legR.position.set(0.152, 0, 0); hips.add(legR);
  for (const leg of [legL, legR]) {
    box(0.29, 0.62, 0.3, pants, 0, -0.31, 0, leg);
    box(0.3, 0.15, 0.33, boots, 0, -0.685, -0.015, leg);
  }

  const torso = new THREE.Group(); torso.position.y = HIP; body.add(torso);
  box(0.62, 0.68, 0.31, top, 0, 0.34, 0, torso);
  box(0.635, 0.07, 0.325, mat(0x2a221c, E), 0, 0.05, 0, torso); // belt
  if (opts.vest) {
    box(0.645, 0.42, 0.35, mat(opts.vest, E), 0, 0.4, 0, torso);
    box(0.16, 0.12, 0.06, mat(opts.vest, E), -0.15, 0.27, -0.2, torso); // mag pouches
    box(0.16, 0.12, 0.06, mat(opts.vest, E), 0.15, 0.27, -0.2, torso);
  }
  if (opts.hood) box(0.42, 0.14, 0.16, top, 0, 0.7, 0.13, torso);
  const headG = new THREE.Group(); headG.position.y = 0.69; torso.add(headG);
  box(0.38, 0.37, 0.36, skin, 0, 0.185, 0, headG);
  if (!faceGeo) faceGeo = new THREE.PlaneGeometry(0.3, 0.3);
  const face = new THREE.Mesh(faceGeo, faceMat(opts.face || 'stern'));
  face.position.set(0, 0.185, -0.1815); face.rotation.y = Math.PI;
  headG.add(face);
  const hc = (d) => mat(opts.hatColor ?? d, E);
  if (opts.hat === 'helmet') {
    box(0.44, 0.17, 0.43, hc(0x4b5340), 0, 0.42, 0.005, headG);
    box(0.48, 0.05, 0.47, hc(0x4b5340), 0, 0.345, 0.005, headG);
    box(0.24, 0.035, 0.02, mat(0x2b2f25, E), 0, 0.44, -0.222, headG); // strap band
  } else if (opts.hat === 'ushanka') {
    box(0.44, 0.19, 0.42, hc(0x5a5040), 0, 0.44, 0.01, headG);
    box(0.07, 0.22, 0.28, hc(0x5a5040), -0.215, 0.25, 0.03, headG);
    box(0.07, 0.22, 0.28, hc(0x5a5040), 0.215, 0.25, 0.03, headG);
    box(0.4, 0.07, 0.05, hc(0x5a5040), 0, 0.37, -0.205, headG); // front fold
  } else if (opts.hat === 'cap') {
    box(0.41, 0.11, 0.39, hc(0x333333), 0, 0.42, 0.01, headG);
    box(0.34, 0.03, 0.17, hc(0x333333), 0, 0.38, -0.26, headG);
  } else if (opts.hat === 'beanie') {
    box(0.41, 0.16, 0.39, hc(0x222222), 0, 0.43, 0.01, headG);
    box(0.42, 0.06, 0.4, hc(0x222222), 0, 0.37, 0.01, headG);
  } else if (opts.hat === 'braids') {
    const hair = mat(0x15100c, E);
    box(0.4, 0.09, 0.38, hair, 0, 0.41, 0.01, headG);
    box(0.4, 0.3, 0.08, hair, 0, 0.26, 0.205, headG);
    for (let i = 0; i < 5; i++) box(0.055, 0.26, 0.055, hair, -0.15 + i * 0.075, 0.08, 0.235, headG);
  } else if (opts.hat === 'ghillie') {
    box(0.5, 0.25, 0.48, mat(0xdfe3e0, E), 0, 0.39, 0.03, headG);
    box(0.44, 0.1, 0.05, mat(0xc9cdc9, E), 0, 0.33, -0.235, headG);
  } else {
    box(0.39, 0.05, 0.37, mat(0x15100c, E), 0, 0.395, 0.005, headG); // close-cropped hair
  }
  if (opts.band) {
    box(0.66, 0.09, 0.345, mat(opts.band, { emissive: opts.band, ei: 0.25, edge: 1 }), 0, 0.63, 0, torso); // scarf/collar
  }

  const armL = new THREE.Group(); armL.position.set(-0.455, 0.62, 0); torso.add(armL);
  const armR = new THREE.Group(); armR.position.set(0.455, 0.62, 0); torso.add(armR);
  box(0.28, 0.36, 0.29, top, 0, -0.12, 0, armL);
  box(0.28, 0.36, 0.29, top, 0, -0.12, 0, armR);
  const foreL = new THREE.Group(); foreL.position.y = -0.3; armL.add(foreL);
  const foreR = new THREE.Group(); foreR.position.y = -0.3; armR.add(foreR);
  box(0.27, 0.24, 0.28, top, 0, -0.12, 0, foreL);
  box(0.27, 0.24, 0.28, top, 0, -0.12, 0, foreR);
  box(0.25, 0.13, 0.26, skin, 0, -0.3, 0, foreL);
  box(0.25, 0.13, 0.26, skin, 0, -0.3, 0, foreR);
  if (opts.band2) box(0.3, 0.075, 0.31, mat(opts.band2, { emissive: opts.band2, ei: 0.4, edge: 1 }), 0, -0.14, 0, armL);

  // Gun pivot at chest, held forward.
  const gunPivot = new THREE.Group(); gunPivot.position.set(0.1, 0.48, -0.3); torso.add(gunPivot);

  // Collapse each limb's boxes into one vertex-coloured mesh: ~9 draw calls per character.
  const lookKey = [opts.skin, opts.top, opts.pants, opts.hat, opts.hatColor, opts.band, opts.band2, opts.vest, opts.hood].join('|');
  ['legL', 'legR', 'torso', 'headG', 'armL', 'armR', 'foreL', 'foreR'].forEach((n, i) => bakePart([legL, legR, torso, headG, armL, armR, foreL, foreR][i], face, lookKey + n));

  Object.assign(parts, { root, body, hips, legL, legR, torso, headG, armL, armR, foreL, foreR, gunPivot });
  root.userData.parts = parts;
  root.traverse((o) => { if (o.isMesh) { o.castShadow = o !== face; o.receiveShadow = false; } });
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
  p.hips.position.y = HIP - crouch * 0.28;
  p.torso.position.y = HIP - crouch * 0.28;
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
    p.hips.position.y = 0.4; p.torso.position.y = 0.4; p.torso.rotation.x = -0.6;
    p.legL.rotation.x = -1.6; p.legR.rotation.x = -0.4;
  }
  if (s.roll) {
    // Tuck and tumble forward.
    p.body.position.y = 0.5;
    p.body.rotation.x = -s.roll * Math.PI * 2;
    p.legL.rotation.x = -1.6; p.legR.rotation.x = -1.4;
    p.armL.rotation.set(-1.2, 0, -0.3); p.armR.rotation.set(-1.2, 0, 0.3);
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
const treeCache = {};
/** Low-poly fir. Geometry is merged once per variant and shared; scale is applied on the group. */
export function makeTree(scale = 1, snowy = true) {
  const k = snowy ? 'snow' : 'green';
  if (!treeCache[k]) {
    const src = new THREE.Group();
    cyl(0.15, 0.22, 2, mat(0x3d2b1f), 6, 0, 1, 0, src);
    const leaf = mat(snowy ? 0x2f4a38 : 0x2f5a2c, { rough: 0.95 });
    const snow = mat(0xe8eef2, { rough: 0.9 });
    for (let i = 0; i < 3; i++) {
      const h = 2.2 - i * 0.4, r = 1.6 - i * 0.4;
      const c = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), leaf);
      c.position.y = 1.8 + i * 1.1; src.add(c);
      if (snowy) {
        const s = new THREE.Mesh(new THREE.ConeGeometry(r * 0.6, h * 0.35, 7), snow);
        s.position.y = 1.8 + i * 1.1 + h * 0.33; src.add(s);
      }
    }
    treeCache[k] = mergeGroup(src).children.map((m) => [m.geometry, m.material]);
  }
  const g = new THREE.Group();
  for (const [geo, m] of treeCache[k]) {
    const mesh = new THREE.Mesh(geo, m);
    mesh.castShadow = m.color.getHex() !== 0xe8eef2; mesh.receiveShadow = false;
    g.add(mesh);
  }
  g.scale.setScalar(scale);
  return g;
}

export function makeFlag(colors) {
  const g = new THREE.Group();
  cyl(0.04, 0.04, 6, mat(0x777777, { metal: 0.6 }), 6, 0, 3, 0, g);
  const h = 0.7 / colors.length;
  const cloth = new THREE.Group();
  g.add(cloth);
  colors.forEach((c, i) => box(1.4, h, 0.02, mat(c, { emissive: c, ei: 0.15 }), 0.72, 5.6 - i * h, 0, cloth));
  g.userData.cloth = cloth;
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
