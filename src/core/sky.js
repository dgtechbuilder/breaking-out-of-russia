// Cheap, purely visual sky: gradient dome, stars/moon or sun glow, drifting clouds (one
// instanced draw call) and distant artillery flashes on the horizon. Nothing here collides,
// casts shadows or touches the lighting rig except a brief ambient bump on big flashes.
import * as THREE from 'three';
import { rand } from './util.js';

const R = 700; // dome radius (inside the camera far plane)

function softTex(size, stops) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) g.addColorStop(o, col);
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function cloudTex() {
  const W = 256, H = 128;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  for (let i = 0; i < 22; i++) {
    const px = W * (0.18 + Math.random() * 0.64), py = H * (0.3 + Math.random() * 0.4);
    const r = H * (0.16 + Math.random() * 0.2);
    const v = Math.round(225 + Math.random() * 30);
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, `rgba(${v},${v},${v},0.55)`);
    g.addColorStop(0.6, `rgba(${v},${v},${v},0.3)`);
    g.addColorStop(1, `rgba(${v},${v},${v},0)`);
    x.fillStyle = g; x.fillRect(0, 0, W, H);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Sky {
  constructor(scene, env, { low = false } = {}) {
    this.scene = scene;
    this.env = env;
    this.group = new THREE.Group();
    scene.add(this.group);
    const horizon = new THREE.Color(env.fog ?? env.sky);
    const top = new THREE.Color(env.skyTop ?? new THREE.Color(env.sky).multiplyScalar(0.6).getHex());
    const sunDir = new THREE.Vector3(...env.sunDir).normalize();
    const glow = env.sunGlow != null ? new THREE.Color(env.sunGlow) : null;

    // ---- Gradient dome (vertex colours) ----
    // Upper cap only, drawn after all opaque geometry with depth test on: just the visible sky
    // pixels get shaded (cheaper than a full-screen background pass).
    const geo = new THREE.SphereGeometry(R, 32, 10, 0, Math.PI * 2, 0, Math.PI * 0.56);
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color(), d = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      d.fromBufferAttribute(pos, i).normalize();
      const h = Math.max(0, d.y);
      c.copy(horizon).lerp(top, Math.pow(h, 0.55));
      if (glow) c.lerp(glow, Math.pow(Math.max(0, d.dot(sunDir)), 6) * 0.65);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const dome = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    dome.renderOrder = 1000;
    dome.frustumCulled = false;
    this.group.add(dome);

    // ---- Stars & moon (night) ----
    if (env.stars) {
      const n = low ? 260 : 520;
      const sp = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        d.set(rand(-1, 1), rand(0.08, 1), rand(-1, 1)).normalize().multiplyScalar(R * 0.95);
        sp[i * 3] = d.x; sp[i * 3 + 1] = d.y; sp[i * 3 + 2] = d.z;
      }
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
      const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xcfd8ff, size: 1.6, sizeAttenuation: false, fog: false, depthWrite: false, transparent: true, opacity: 0.85 }));
      stars.renderOrder = -9;
      stars.frustumCulled = false;
      this.group.add(stars);
    }
    if (env.moon || glow) {
      const dir = env.moon ? new THREE.Vector3(...env.moon).normalize() : sunDir;
      const disc = new THREE.Sprite(new THREE.SpriteMaterial({
        map: softTex(64, [[0, '#ffffff'], [0.42, '#ffffff'], [0.5, 'rgba(255,255,255,0)']]),
        color: env.moon ? 0xe6ecff : 0xfff0d8, fog: false, depthWrite: false,
      }));
      disc.position.copy(dir).multiplyScalar(R * 0.9);
      disc.scale.setScalar(env.moon ? 26 : 34);
      disc.renderOrder = -8;
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: softTex(64, [[0, 'rgba(255,255,255,0.55)'], [0.3, 'rgba(255,255,255,0.18)'], [1, 'rgba(255,255,255,0)']]),
        color: env.moon ? 0x9fb4ff : (env.sunGlow ?? 0xffc080), fog: false, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      halo.position.copy(disc.position);
      halo.scale.setScalar(env.moon ? 150 : 260);
      halo.renderOrder = -8;
      this.group.add(disc, halo);
    }

    // ---- Clouds: one instanced mesh, drifting with the wind ----
    const n = Math.round((env.clouds ?? 22) * (low ? 0.45 : 1));
    this.cloudN = n;
    if (n > 0) {
      const pg = new THREE.PlaneGeometry(1, 1);
      pg.rotateX(Math.PI / 2); // horizontal, visible from below
      const shade = new Float32Array(n);
      this.cl = [];
      for (let i = 0; i < n; i++) {
        this.cl.push({ x: rand(-560, 560), z: rand(-560, 560), y: rand(150, 230), sx: rand(150, 320), sz: rand(80, 160), r: rand(-0.4, 0.4) });
        shade[i] = rand(0.82, 1.0);
      }
      pg.setAttribute('aShade', new THREE.InstancedBufferAttribute(shade, 1));
      const m = new THREE.ShaderMaterial({
        uniforms: {
          map: { value: cloudTex() },
          color: { value: new THREE.Color(env.cloudColor ?? 0xffffff) },
          opacity: { value: env.cloudOpacity ?? 0.85 },
        },
        vertexShader: /* glsl */`
          attribute float aShade;
          varying vec2 vUv; varying float vFade; varying float vShade;
          void main() {
            vUv = uv; vShade = aShade;
            vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
            vFade = 1.0 - smoothstep(360.0, 600.0, length(wp.xz - cameraPosition.xz));
            gl_Position = projectionMatrix * viewMatrix * wp;
          }`,
        fragmentShader: /* glsl */`
          uniform sampler2D map; uniform vec3 color; uniform float opacity;
          varying vec2 vUv; varying float vFade; varying float vShade;
          void main() {
            vec4 t = texture2D(map, vUv);
            gl_FragColor = vec4(color * t.rgb * vShade, t.a * opacity * vFade);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
        transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
      });
      this.clouds = new THREE.InstancedMesh(pg, m, n);
      this.clouds.frustumCulled = false;
      this.clouds.renderOrder = -5;
      this.clouds.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(this.clouds);
      this.wind = new THREE.Vector2(...(env.cloudWind || [2.5, -1.2]));
      this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3();
      this.updateClouds(0, new THREE.Vector3());
    }

    // ---- Distant artillery flashes ----
    this.flashT = rand(2, 5);
    this.flash = null;
    this.flashes = env.flashes !== false;
    if (this.flashes) {
      this.flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: softTex(64, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.45)'], [1, 'rgba(255,255,255,0)']]),
        color: 0xffb070, fog: false, depthWrite: false, blending: THREE.AdditiveBlending, transparent: true, opacity: 0,
      }));
      this.flashSprite.renderOrder = -4;
      this.flashSprite.visible = false;
      this.group.add(this.flashSprite);
    }
    this.pending = [];
  }

  updateClouds(dt, center) {
    const L = 1120;
    for (let i = 0; i < this.cl.length; i++) {
      const k = this.cl[i];
      k.x += this.wind.x * dt; k.z += this.wind.y * dt;
      // Wrap around the player so the sky is always populated.
      const rx = ((((k.x - center.x) + L / 2) % L) + L) % L - L / 2;
      const rz = ((((k.z - center.z) + L / 2) % L) + L) % L - L / 2;
      k.x = center.x + rx; k.z = center.z + rz;
      this._p.set(k.x, k.y, k.z);
      this._q.setFromAxisAngle(_up, k.r);
      this._s.set(k.sx, 1, k.sz);
      this._m.compose(this._p, this._q, this._s);
      this.clouds.setMatrixAt(i, this._m);
    }
    this.clouds.instanceMatrix.needsUpdate = true;
  }

  /** Returns an ambient boost (0..1) for the hemisphere light while a flash is lit. */
  update(dt, center, playSound) {
    if (this.clouds) this.updateClouds(dt, center);
    let boost = 0;
    if (!this.flashes) return 0;
    for (const p of this.pending) p.t -= dt;
    while (this.pending.length && this.pending[0].t <= 0) { const p = this.pending.shift(); playSound(p.vol); }
    this.flashT -= dt;
    if (this.flashT <= 0 && !this.flash) {
      this.flashT = rand(3.5, 9);
      const a = rand(-1.2, 1.2) + (Math.random() < 0.3 ? Math.PI : 0); // mostly toward the front (-Z)
      const dist = R * 0.82;
      const big = Math.random() < 0.35;
      this.flash = { t: 0, life: big ? 0.7 : 0.45, big, dir: new THREE.Vector3(Math.sin(a), rand(0.015, 0.05), -Math.cos(a)).normalize().multiplyScalar(dist) };
      this.flashSprite.position.copy(this.flash.dir);
      this.flashSprite.scale.set(big ? 240 : 150, big ? 110 : 70, 1);
      this.flashSprite.visible = true;
      this.pending.push({ t: rand(1.1, 2.4), vol: big ? 0.6 : 0.35 });
    }
    if (this.flash) {
      const f = this.flash;
      f.t += dt;
      const k = Math.max(0, 1 - f.t / f.life);
      const flick = 0.6 + 0.4 * Math.sin(f.t * 60);
      this.flashSprite.material.opacity = k * flick * (f.big ? 1 : 0.7);
      boost = f.big ? k * flick : k * flick * 0.4;
      if (f.t >= f.life) { this.flash = null; this.flashSprite.visible = false; }
    }
    return boost;
  }

  /** Keep the dome centred on whichever camera is rendering. */
  follow(p) { this.group.position.copy(p); }
}
const _up = new THREE.Vector3(0, 1, 0);
