// Static/dynamic box colliders, ray casting and a grid navigator for AI.
import * as THREE from 'three';
import { rayAABB, rayHit } from './util.js';

const boxGeoCache = new Map();
export function boxGeo(w, h, d) {
  const k = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}`;
  let g = boxGeoCache.get(k);
  if (!g) { g = new THREE.BoxGeometry(w, h, d); boxGeoCache.set(k, g); }
  return g;
}

/**
 * Merge [geometry, matrix] pairs into one indexed BufferGeometry (position/normal/uv).
 * Used to batch static props so a whole level costs a handful of draw calls.
 */
const _p = new THREE.Vector3(), _n = new THREE.Vector3(), _nm = new THREE.Matrix3();
export function bakeGeometry(list) {
  let nv = 0, ni = 0;
  for (const [g] of list) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
  const col = list.some((e) => e[2]) ? new Float32Array(nv * 3) : null;
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let vo = 0, io = 0;
  for (const [g, m4, color] of list) {
    _nm.getNormalMatrix(m4);
    if (col && color) for (let i = 0; i < g.attributes.position.count; i++) { const k = (vo + i) * 3; col[k] = color.r; col[k + 1] = color.g; col[k + 2] = color.b; }
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, I = g.index;
    for (let i = 0; i < P.count; i++) {
      _p.fromBufferAttribute(P, i).applyMatrix4(m4);
      const k = (vo + i) * 3;
      pos[k] = _p.x; pos[k + 1] = _p.y; pos[k + 2] = _p.z;
      if (N) { _n.fromBufferAttribute(N, i).applyMatrix3(_nm).normalize(); nor[k] = _n.x; nor[k + 1] = _n.y; nor[k + 2] = _n.z; } else nor[k + 1] = 1;
      if (U) { uv[(vo + i) * 2] = U.getX(i); uv[(vo + i) * 2 + 1] = U.getY(i); }
    }
    if (I) for (let i = 0; i < I.count; i++) idx[io + i] = I.getX(i) + vo;
    else for (let i = 0; i < P.count; i++) idx[io + i] = i + vo;
    vo += P.count; io += I ? I.count : P.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  return geo;
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.anims = []; // per-frame callbacks (dt, time) for cheap ambient motion
    this.batch = null; // while building, static meshes collect here and get merged by flushBatch()
    this.colliders = [];
    this.groundY = 0;
    this.nav = null;
    this.navDirty = false;
    this.shadows = true;
  }

  /** Box with its bottom at y. Returns the collider (or mesh when collide:false). */
  addBox(x, y, z, w, h, d, mat, opts = {}) {
    let mesh = null;
    if (mat) {
      mesh = new THREE.Mesh(boxGeo(w, h, d), mat);
      mesh.position.set(x, y + h / 2, z);
      if (opts.rotY) mesh.rotation.y = opts.rotY;
      if (this.shadows) { mesh.castShadow = opts.castShadow ?? (h > 0.3); mesh.receiveShadow = true; }
      if (opts.parent) opts.parent.add(mesh);
      else if (opts.hp == null && !opts.group && opts.batch !== false) this.addStatic(mesh);
      else this.scene.add(mesh);
    }
    if (opts.collide === false) return mesh;
    const c = this.addCollider(x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2, opts);
    c.mesh = mesh;
    return c;
  }

  /** Add a purely static visual (mesh or group). It is merged with others of the same material. */
  addStatic(obj) {
    (this.batch || this.scene).add(obj);
    return obj;
  }

  beginBatch() { this.batch = new THREE.Group(); }

  /** Merge everything added via addStatic into one mesh per material per 64 m cell. */
  flushBatch() {
    const src = this.batch;
    this.batch = null;
    if (!src) return;
    src.updateMatrixWorld(true);
    const buckets = new Map();
    const c = new THREE.Vector3();
    src.traverse((o) => {
      if (!o.isMesh || !o.visible || Array.isArray(o.material) || o.isInstancedMesh) return;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      c.copy(o.geometry.boundingSphere.center).applyMatrix4(o.matrixWorld);
      const key = `${o.material.uuid}|${o.castShadow ? 1 : 0}|${Math.floor(c.x / 64)}|${Math.floor(c.z / 64)}`;
      let b = buckets.get(key);
      if (!b) buckets.set(key, b = { material: o.material, cast: o.castShadow, list: [] });
      b.list.push([o.geometry, o.matrixWorld.clone()]);
    });
    for (const b of buckets.values()) {
      const mesh = new THREE.Mesh(bakeGeometry(b.list), b.material);
      mesh.castShadow = b.cast && this.shadows; mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      this.scene.add(mesh);
    }
  }

  addCollider(x0, y0, z0, x1, y1, z1, opts = {}) {
    const c = {
      min: { x: x0, y: y0, z: z0 }, max: { x: x1, y: y1, z: z1 },
      blocksMove: opts.blocksMove ?? true, blocksShot: opts.blocksShot ?? true,
      hp: opts.hp ?? null, explosiveOnly: opts.explosiveOnly ?? true,
      group: opts.group ?? null, tag: opts.tag ?? null, onDestroy: opts.onDestroy ?? null,
      material: opts.material ?? 'concrete', mesh: null, dead: false, nav: opts.nav ?? true,
    };
    this.colliders.push(c);
    if (c.blocksMove && c.nav) this.navDirty = true;
    return c;
  }

  removeCollider(c) {
    const i = this.colliders.indexOf(c);
    if (i >= 0) this.colliders.splice(i, 1);
    c.dead = true;
    if (c.mesh && c.mesh.parent) c.mesh.parent.remove(c.mesh);
    if (c.blocksMove && c.nav) this.navDirty = true;
  }

  /** Raycast against colliders and the ground. Returns {t, collider, normal, point} or null. */
  raycast(o, d, maxT = 300, ignoreGround = false, forMove = false) {
    let best = maxT, hit = null, axis = -1, sign = 0;
    const cs = this.colliders;
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      if (forMove ? !c.blocksMove : !c.blocksShot) continue;
      const t = rayAABB(o, d, c.min, c.max, best);
      if (t < best) { best = t; hit = c; axis = rayHit.axis; sign = rayHit.sign; }
    }
    if (!ignoreGround && d.y < -1e-6) {
      const t = (this.groundY - o.y) / d.y;
      if (t >= 0 && t < best) { best = t; hit = 'ground'; axis = 1; sign = 1; }
    }
    if (!hit) return null;
    const normal = new THREE.Vector3();
    if (axis === 0) normal.x = sign; else if (axis === 1) normal.y = sign; else if (axis === 2) normal.z = sign; else normal.set(-d.x, -d.y, -d.z);
    const point = new THREE.Vector3().copy(o).addScaledVector(d, best);
    return { t: best, collider: hit === 'ground' ? null : hit, normal, point };
  }

  /** Line-of-sight test between two points. */
  clear(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-4) return true;
    _d.set(dx / len, dy / len, dz / len);
    const cs = this.colliders;
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      if (!c.blocksShot) continue;
      if (rayAABB(a, _d, c.min, c.max, len - 0.05) < len - 0.05) return false;
    }
    return true;
  }

  overlapsBox(x0, y0, z0, x1, y1, z1) {
    for (const c of this.colliders) {
      if (!c.blocksMove) continue;
      if (x1 > c.min.x && x0 < c.max.x && y1 > c.min.y && y0 < c.max.y && z1 > c.min.z && z0 < c.max.z) return c;
    }
    return null;
  }

  // ---------- Navigation grid ----------
  buildNav(minX, maxX, minZ, maxZ, cell = 1) {
    const w = Math.ceil((maxX - minX) / cell), h = Math.ceil((maxZ - minZ) / cell);
    this.nav = { minX, minZ, cell, w, h, blocked: new Uint8Array(w * h) };
    this.rebuildNav();
  }

  rebuildNav() {
    const n = this.nav;
    if (!n) return;
    n.blocked.fill(0);
    const pad = 0.35;
    for (const c of this.colliders) {
      if (!c.blocksMove || !c.nav) continue;
      if (c.max.y < 0.45 || c.min.y > 1.7) continue;
      const x0 = Math.max(0, Math.floor((c.min.x - pad - n.minX) / n.cell));
      const x1 = Math.min(n.w - 1, Math.floor((c.max.x + pad - n.minX) / n.cell));
      const z0 = Math.max(0, Math.floor((c.min.z - pad - n.minZ) / n.cell));
      const z1 = Math.min(n.h - 1, Math.floor((c.max.z + pad - n.minZ) / n.cell));
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        // Only block when the collider covers a meaningful part of the cell centre.
        const cx = n.minX + (x + 0.5) * n.cell, cz = n.minZ + (z + 0.5) * n.cell;
        if (cx > c.min.x - pad - n.cell * 0.3 && cx < c.max.x + pad + n.cell * 0.3 && cz > c.min.z - pad - n.cell * 0.3 && cz < c.max.z + pad + n.cell * 0.3) {
          n.blocked[z * n.w + x] = 1;
        }
      }
    }
    this.navDirty = false;
  }

  cellOf(x, z) {
    const n = this.nav;
    return [Math.floor((x - n.minX) / n.cell), Math.floor((z - n.minZ) / n.cell)];
  }

  walkable(x, z) {
    const n = this.nav;
    if (!n) return true;
    const [cx, cz] = this.cellOf(x, z);
    if (cx < 0 || cz < 0 || cx >= n.w || cz >= n.h) return false;
    return !n.blocked[cz * n.w + cx];
  }

  nearestWalkable(cx, cz) {
    const n = this.nav;
    for (let r = 0; r < 6; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const x = cx + dx, z = cz + dz;
        if (x >= 0 && z >= 0 && x < n.w && z < n.h && !n.blocked[z * n.w + x]) return [x, z];
      }
    }
    return null;
  }

  /** A* over the nav grid. Returns array of {x,z} waypoints (world), or null. */
  findPath(from, to, maxIter = 4000) {
    const n = this.nav;
    if (!n) return [{ x: to.x, z: to.z }];
    if (this.navDirty) this.rebuildNav();
    let s = this.cellOf(from.x, from.z), g = this.cellOf(to.x, to.z);
    const clampC = (c) => [Math.max(0, Math.min(n.w - 1, c[0])), Math.max(0, Math.min(n.h - 1, c[1]))];
    s = clampC(s); g = clampC(g);
    if (n.blocked[s[1] * n.w + s[0]]) s = this.nearestWalkable(s[0], s[1]) || s;
    if (n.blocked[g[1] * n.w + g[0]]) { g = this.nearestWalkable(g[0], g[1]); if (!g) return null; }
    const W = n.w, start = s[1] * W + s[0], goal = g[1] * W + g[0];
    if (start === goal) return [{ x: to.x, z: to.z }];
    const gs = new Map([[start, 0]]), came = new Map();
    const open = new Heap();
    const hfn = (i) => { const x = i % W, z = (i / W) | 0; const dx = Math.abs(x - g[0]), dz = Math.abs(z - g[1]); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
    open.push(start, hfn(start));
    const closed = new Set();
    let iter = 0, found = false;
    while (open.size && iter++ < maxIter) {
      const cur = open.pop();
      if (cur === goal) { found = true; break; }
      if (closed.has(cur)) continue;
      closed.add(cur);
      const cx = cur % W, cz = (cur / W) | 0, cg = gs.get(cur);
      for (let k = 0; k < 8; k++) {
        const dx = DX[k], dz = DZ[k];
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= W || nz >= n.h) continue;
        const ni = nz * W + nx;
        if (n.blocked[ni] || closed.has(ni)) continue;
        if (dx && dz && (n.blocked[cz * W + nx] || n.blocked[nz * W + cx])) continue;
        const ng = cg + (dx && dz ? 1.414 : 1);
        if (ng < (gs.get(ni) ?? Infinity)) { gs.set(ni, ng); came.set(ni, cur); open.push(ni, ng + hfn(ni)); }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let c = goal; c !== start; c = came.get(c)) cells.push(c);
    cells.reverse();
    // Simplify: drop cells while straight-line walkable.
    const pts = cells.map((c) => ({ x: n.minX + ((c % W) + 0.5) * n.cell, z: n.minZ + (((c / W) | 0) + 0.5) * n.cell }));
    pts[pts.length - 1] = { x: to.x, z: to.z };
    const out = [];
    let anchor = { x: from.x, z: from.z };
    let i = 0;
    while (i < pts.length) {
      let j = Math.min(pts.length - 1, i + 6);
      while (j > i && !this.straightWalkable(anchor, pts[j])) j--;
      out.push(pts[j]);
      anchor = pts[j];
      i = j + 1;
    }
    return out;
  }

  straightWalkable(a, b) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    const steps = Math.ceil(len / (this.nav.cell * 0.5));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (!this.walkable(a.x + dx * t, a.z + dz * t)) return false;
    }
    return true;
  }
}

const _d = new THREE.Vector3();
const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DZ = [0, 0, 1, -1, 1, -1, 1, -1];

class Heap {
  constructor() { this.k = []; this.p = []; }
  get size() { return this.k.length; }
  push(key, pri) {
    const k = this.k, p = this.p;
    k.push(key); p.push(pri);
    let i = k.length - 1;
    while (i > 0) {
      const par = (i - 1) >> 1;
      if (p[par] <= p[i]) break;
      [k[par], k[i]] = [k[i], k[par]]; [p[par], p[i]] = [p[i], p[par]];
      i = par;
    }
  }
  pop() {
    const k = this.k, p = this.p;
    const top = k[0];
    const lk = k.pop(), lp = p.pop();
    if (k.length) {
      k[0] = lk; p[0] = lp;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < k.length && p[l] < p[m]) m = l;
        if (r < k.length && p[r] < p[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]]; [p[m], p[i]] = [p[i], p[m]];
        i = m;
      }
    }
    return top;
  }
}
