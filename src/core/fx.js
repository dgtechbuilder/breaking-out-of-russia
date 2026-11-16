// Particles, tracers, pooled lights and expanding rings.
import * as THREE from 'three';
import { rand } from './util.js';

const VERT = `
attribute float size;
attribute vec4 rgba;
uniform float uScale;
varying vec4 vC;
void main() {
  vC = rgba;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(size * uScale / max(0.1, -mv.z), 0.0, 512.0);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
varying vec4 vC;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float a = vC.a * smoothstep(0.5, 0.1, d);
  gl_FragColor = vec4(vC.rgb, a);
}`;

class ParticlePool {
  constructor(scene, cap, additive) {
    this.cap = cap;
    this.n = 0;
    this.pos = new Float32Array(cap * 3);
    this.vel = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 4);
    this.size = new Float32Array(cap);
    this.life = new Float32Array(cap);
    this.max = new Float32Array(cap);
    this.s0 = new Float32Array(cap);
    this.s1 = new Float32Array(cap);
    this.a0 = new Float32Array(cap);
    this.grav = new Float32Array(cap);
    this.drag = new Float32Array(cap);
    this.geo = new THREE.BufferGeometry();
    this.pAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.cAttr = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.sAttr = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.pAttr);
    this.geo.setAttribute('rgba', this.cAttr);
    this.geo.setAttribute('size', this.sAttr);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 500 } },
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 3 : 2;
    scene.add(this.points);
  }

  emit(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, grav = 0, drag = 0) {
    let i = this.n;
    if (i >= this.cap) i = Math.floor(Math.random() * this.cap);
    else this.n++;
    const i3 = i * 3, i4 = i * 4;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.col[i4] = r; this.col[i4 + 1] = g; this.col[i4 + 2] = b; this.col[i4 + 3] = a;
    this.life[i] = life; this.max[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a;
    this.grav[i] = grav; this.drag[i] = drag; this.size[i] = s0;
  }

  update(dt) {
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // swap-remove
        const j = --this.n;
        if (i !== j) {
          this.pos.copyWithin(i * 3, j * 3, j * 3 + 3);
          this.vel.copyWithin(i * 3, j * 3, j * 3 + 3);
          this.col.copyWithin(i * 4, j * 4, j * 4 + 4);
          this.life[i] = this.life[j]; this.max[i] = this.max[j]; this.s0[i] = this.s0[j];
          this.s1[i] = this.s1[j]; this.a0[i] = this.a0[j]; this.grav[i] = this.grav[j]; this.drag[i] = this.drag[j];
        }
        continue;
      }
      const i3 = i * 3;
      const k = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i3] *= k; this.vel[i3 + 2] *= k;
      this.vel[i3 + 1] = this.vel[i3 + 1] * k - this.grav[i] * dt;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      const t = 1 - this.life[i] / this.max[i];
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      this.col[i * 4 + 3] = this.a0[i] * (1 - t * t);
      i++;
    }
    this.geo.setDrawRange(0, this.n);
    this.pAttr.needsUpdate = true; this.cAttr.needsUpdate = true; this.sAttr.needsUpdate = true;
  }

  shift(dz) { for (let i = 0; i < this.n; i++) this.pos[i * 3 + 2] += dz; }
}

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.add = new ParticlePool(scene, 3000, true);
    this.norm = new ParticlePool(scene, 3000, false);
    // Tracers
    this.tracers = [];
    const tg = new THREE.BoxGeometry(0.035, 0.035, 1);
    tg.translate(0, 0, 0.5);
    for (let i = 0; i < 60; i++) {
      const m = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false; m.frustumCulled = false;
      scene.add(m);
      this.tracers.push({ mesh: m, life: 0, max: 0.06, from: new THREE.Vector3(), to: new THREE.Vector3(), len: 0 });
    }
    this.tracerIdx = 0;
    // Light pool
    this.lights = [];
    for (let i = 0; i < 6; i++) {
      const l = new THREE.PointLight(0xffaa55, 0, 10, 2);
      scene.add(l);
      this.lights.push({ light: l, life: 0, max: 1, base: 0, persistent: null });
    }
    // Rings
    this.rings = [];
  }

  setScale(viewportH, fovDeg) {
    const s = viewportH / (2 * Math.tan((fovDeg * Math.PI) / 360));
    this.add.mat.uniforms.uScale.value = s;
    this.norm.mat.uniforms.uScale.value = s;
  }

  update(dt) {
    this.add.update(dt);
    this.norm.update(dt);
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) { t.mesh.visible = false; continue; }
      const k = 1 - t.life / t.max;
      // Slide the streak from muzzle toward the impact.
      const head = Math.min(1, k * 1.6 + 0.25);
      const tail = Math.max(0, head - 0.45);
      const m = t.mesh;
      m.position.copy(t.from).lerp(t.to, tail);
      m.scale.z = Math.max(0.01, (head - tail) * t.len);
      m.material.opacity = 0.9 * (1 - k * 0.6);
    }
    for (const L of this.lights) {
      if (L.persistent) {
        const p = L.persistent;
        if (p.dead) { L.persistent = null; L.light.intensity = 0; continue; }
        L.light.position.copy(p.pos);
        L.light.intensity = p.intensity * (0.85 + Math.random() * 0.3);
        continue;
      }
      if (L.life > 0) {
        L.life -= dt;
        L.light.intensity = L.life > 0 ? L.base * (L.life / L.max) : 0;
      }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      const k = 1 - r.life / r.max;
      if (r.follow) r.mesh.position.set(r.follow.x, r.mesh.position.y, r.follow.z);
      if (r.expand) r.mesh.scale.setScalar(Math.max(0.01, r.r0 + (r.r1 - r.r0) * k));
      r.mesh.material.opacity = r.opacity * (r.pulse ? 0.55 + 0.45 * Math.sin(r.life * 12) : (1 - k));
      if (r.life <= 0 || r.dead) { this.scene.remove(r.mesh); r.mesh.geometry.dispose(); r.mesh.material.dispose(); this.rings.splice(i, 1); }
    }
  }

  shift(dz) {
    this.add.shift(dz); this.norm.shift(dz);
    for (const r of this.rings) if (!r.follow && r.ground) r.mesh.position.z += dz;
  }

  tracer(from, to, color = 0xffd27a) {
    const t = this.tracers[this.tracerIdx++ % this.tracers.length];
    t.from.copy(from); t.to.copy(to);
    t.len = from.distanceTo(to);
    if (t.len < 1) return;
    t.max = Math.min(0.12, 0.03 + t.len / 900);
    t.life = t.max;
    t.mesh.visible = true;
    t.mesh.material.color.setHex(color);
    t.mesh.position.copy(from);
    t.mesh.lookAt(to);
  }

  flash(pos, color = 0xffaa55, intensity = 3, distance = 10, dur = 0.06) {
    let L = null;
    for (const l of this.lights) if (!l.persistent && l.life <= 0) { L = l; break; }
    if (!L) { for (const l of this.lights) if (!l.persistent && (!L || l.life < L.life)) L = l; }
    if (!L) return;
    L.light.position.copy(pos);
    L.light.color.setHex(color);
    L.light.distance = distance;
    L.base = intensity; L.life = dur; L.max = dur;
    L.light.intensity = intensity;
  }

  // Attach a pooled light to an object exposing {pos, intensity, dead}.
  persistentLight(obj, color, distance) {
    const free = this.lights.filter((l) => !l.persistent);
    if (free.length <= 2) return; // keep a few for flashes
    const L = free[0];
    L.persistent = obj; L.life = 0;
    L.light.color.setHex(color); L.light.distance = distance;
  }

  ring(pos, { color = 0xffffff, r0 = 0.5, r1 = 10, life = 0.6, opacity = 0.8, width = 0.15, y = 0.06, pulse = false, expand = true, follow = null, ground = true } = {}) {
    const geo = new THREE.RingGeometry(1 - width, 1, 48);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos.x, (pos.y || 0) + y, pos.z);
    mesh.scale.setScalar(expand ? r0 : r1);
    mesh.renderOrder = 4;
    this.scene.add(mesh);
    const r = { mesh, life, max: life, r0, r1, opacity, pulse, expand, follow, ground, dead: false };
    this.rings.push(r);
    return r;
  }

  // ---- presets ----
  muzzle(p, dir, big = 1) {
    for (let i = 0; i < 4; i++) {
      const s = rand(0.5, 1.4);
      this.add.emit(p.x + dir.x * 0.1 * i, p.y + dir.y * 0.1 * i, p.z + dir.z * 0.1 * i, dir.x * s, dir.y * s, dir.z * s, 0.05, 0.25 * big, 0.12, 1, 0.75, 0.35, 1);
    }
    this.norm.emit(p.x, p.y, p.z, dir.x + rand(-0.3, 0.3), 0.5, dir.z + rand(-0.3, 0.3), 0.5, 0.15, 0.6, 0.6, 0.6, 0.6, 0.25, -0.3, 1);
  }

  sparks(p, n) {
    const nx = n ? n.x : 0, ny = n ? n.y : 1, nz = n ? n.z : 0;
    for (let i = 0; i < 5; i++) {
      this.add.emit(p.x, p.y, p.z, nx * 3 + rand(-3, 3), ny * 3 + rand(-1, 4), nz * 3 + rand(-3, 3), rand(0.1, 0.3), 0.07, 0.02, 1, 0.8, 0.4, 1, 12);
    }
    this.norm.emit(p.x, p.y, p.z, nx * 0.6, ny * 0.6 + 0.3, nz * 0.6, 0.6, 0.12, 0.5, 0.55, 0.52, 0.48, 0.5, 0, 2);
  }

  dust(p, n, color = [0.75, 0.72, 0.66]) {
    const nx = n ? n.x : 0, ny = n ? n.y : 1, nz = n ? n.z : 0;
    for (let i = 0; i < 4; i++) {
      this.norm.emit(p.x, p.y, p.z, nx * 2 + rand(-1, 1), ny * 2 + rand(0, 1.5), nz * 2 + rand(-1, 1), rand(0.3, 0.6), 0.1, 0.35, color[0], color[1], color[2], 0.7, 6, 2);
    }
  }

  blood(p, dir) {
    for (let i = 0; i < 6; i++) {
      this.norm.emit(p.x, p.y, p.z, (dir ? dir.x * 2 : 0) + rand(-1.5, 1.5), rand(-0.5, 2), (dir ? dir.z * 2 : 0) + rand(-1.5, 1.5), rand(0.25, 0.5), 0.12, 0.05, 0.45, 0.03, 0.03, 0.9, 9);
    }
    this.norm.emit(p.x, p.y, p.z, 0, 0.2, 0, 0.4, 0.15, 0.45, 0.4, 0.05, 0.05, 0.5, 0, 1);
  }

  explosion(p, scale = 1) {
    for (let i = 0; i < 26 * scale; i++) {
      const a = Math.random() * Math.PI * 2, s = rand(2, 9) * scale;
      this.add.emit(p.x, p.y + 0.3, p.z, Math.cos(a) * s, rand(1, 8) * scale, Math.sin(a) * s, rand(0.25, 0.6), 1.2 * scale, 0.3, 1, rand(0.45, 0.75), 0.15, 1, 4, 3);
    }
    for (let i = 0; i < 18 * scale; i++) {
      const a = Math.random() * Math.PI * 2, s = rand(0.5, 3) * scale;
      const g = rand(0.12, 0.25);
      this.norm.emit(p.x + rand(-1, 1), p.y + rand(0, 1.5), p.z + rand(-1, 1), Math.cos(a) * s, rand(1, 4), Math.sin(a) * s, rand(1.2, 2.6), 1.2 * scale, 4 * scale, g, g, g, 0.75, -0.6, 1.2);
    }
    for (let i = 0; i < 16 * scale; i++) {
      const a = Math.random() * Math.PI * 2, s = rand(4, 12);
      this.norm.emit(p.x, p.y + 0.3, p.z, Math.cos(a) * s, rand(4, 11), Math.sin(a) * s, rand(0.6, 1.2), 0.15, 0.1, 0.2, 0.18, 0.15, 1, 20);
    }
    this.flash(p, 0xffa040, 9 * scale, 22 * scale, 0.35);
  }

  fire(p, r = 2.5) {
    const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r;
    this.add.emit(p.x + Math.cos(a) * d, p.y + 0.1, p.z + Math.sin(a) * d, rand(-0.3, 0.3), rand(1.5, 3.5), rand(-0.3, 0.3), rand(0.35, 0.7), rand(0.5, 0.9), 0.1, 1, rand(0.35, 0.6), 0.1, 0.9, -1);
    if (Math.random() < 0.3) {
      this.norm.emit(p.x + Math.cos(a) * d, p.y + 1.2, p.z + Math.sin(a) * d, rand(-0.3, 0.3), rand(1, 2), rand(-0.3, 0.3), rand(1.5, 2.5), 0.5, 2, 0.1, 0.1, 0.1, 0.45, -0.3, 0.5);
    }
  }

  smoke(p, color = [0.3, 0.3, 0.3], size = 1) {
    this.norm.emit(p.x + rand(-0.3, 0.3), p.y, p.z + rand(-0.3, 0.3), rand(-0.3, 0.3), rand(0.4, 1.2), rand(-0.3, 0.3), rand(1.5, 3), 0.4 * size, 2.2 * size, color[0], color[1], color[2], 0.6, -0.2, 0.6);
  }

  trail(p) {
    this.norm.emit(p.x, p.y, p.z, rand(-0.2, 0.2), rand(-0.2, 0.3), rand(-0.2, 0.2), rand(0.8, 1.4), 0.25, 1.1, 0.75, 0.75, 0.75, 0.55, -0.2, 0.5);
    this.add.emit(p.x, p.y, p.z, 0, 0, 0, 0.06, 0.35, 0.1, 1, 0.7, 0.3, 1);
  }

  electric(p, r = 1) {
    for (let i = 0; i < 12; i++) {
      this.add.emit(p.x, p.y, p.z, rand(-4, 4) * r, rand(-2, 4) * r, rand(-4, 4) * r, rand(0.15, 0.4), 0.15, 0.05, 0.5, 0.8, 1, 1, 6);
    }
  }

  glow(p, color, size, life = 0.05) {
    this.add.emit(p.x, p.y, p.z, 0, 0, 0, life, size, size, color[0], color[1], color[2], 1);
  }
}
