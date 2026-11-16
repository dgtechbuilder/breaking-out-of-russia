import * as THREE from 'three';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const chance = (p) => Math.random() < p;

export function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function yawTo(from, to) {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z));
}

/** yaw 0 looks down -Z; positive yaw turns left (three.js convention). */
export function dirFromYawPitch(yaw, pitch, out = new THREE.Vector3()) {
  const cp = Math.cos(pitch);
  return out.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
}

const _t1 = new THREE.Vector3();
const _t2 = new THREE.Vector3();
/** Randomly perturb a unit direction inside a cone of half-angle `spread` (radians). */
export function spreadDir(dir, spread, out = new THREE.Vector3()) {
  if (spread <= 0) return out.copy(dir);
  const up = Math.abs(dir.y) > 0.95 ? _t1.set(1, 0, 0) : _t1.set(0, 1, 0);
  const right = _t2.crossVectors(dir, up).normalize();
  const realUp = up.crossVectors(right, dir).normalize();
  const r = spread * Math.sqrt(Math.random());
  const a = Math.random() * Math.PI * 2;
  out.copy(dir).addScaledVector(right, Math.cos(a) * r).addScaledVector(realUp, Math.sin(a) * r);
  return out.normalize();
}

// Ray vs AABB. Returns entry distance or Infinity. Hit face stored in rayHit.
export const rayHit = { axis: -1, sign: 0 };
export function rayAABB(o, d, mn, mx, maxT = Infinity) {
  let tmin = 0, tmax = maxT, axis = -1, sign = 0;
  // X
  if (Math.abs(d.x) < 1e-9) { if (o.x < mn.x || o.x > mx.x) return Infinity; }
  else {
    const inv = 1 / d.x; let t1 = (mn.x - o.x) * inv, t2 = (mx.x - o.x) * inv, s = -1;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; s = 1; }
    if (t1 > tmin) { tmin = t1; axis = 0; sign = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  // Y
  if (Math.abs(d.y) < 1e-9) { if (o.y < mn.y || o.y > mx.y) return Infinity; }
  else {
    const inv = 1 / d.y; let t1 = (mn.y - o.y) * inv, t2 = (mx.y - o.y) * inv, s = -1;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; s = 1; }
    if (t1 > tmin) { tmin = t1; axis = 1; sign = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  // Z
  if (Math.abs(d.z) < 1e-9) { if (o.z < mn.z || o.z > mx.z) return Infinity; }
  else {
    const inv = 1 / d.z; let t1 = (mn.z - o.z) * inv, t2 = (mx.z - o.z) * inv, s = -1;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; s = 1; }
    if (t1 > tmin) { tmin = t1; axis = 2; sign = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  rayHit.axis = axis; rayHit.sign = sign;
  return tmin;
}

export function raySphere(o, d, c, r, maxT = Infinity) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return Infinity;
  const s = Math.sqrt(disc);
  let t = -b - s;
  if (t < 0) t = -b + s;
  if (t < 0 || t > maxT) return Infinity;
  return t;
}

export function fmtTime(s) {
  s = Math.max(0, Math.ceil(s));
  const m = Math.floor(s / 60), r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

export function setLayer(obj, layer) {
  obj.traverse((o) => { o.layers.set(layer); });
}

export function dist2D(a, b) {
  const dx = a.x - b.x, dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}
