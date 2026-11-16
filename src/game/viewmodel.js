// First-person weapon + arms.
import * as THREE from 'three';
import { makeGun, mat, box } from '../core/models.js';

const Z = new THREE.Vector3(0, 0, 1);

function limb(parent, from, to, t, material) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  const m = new THREE.Mesh(new THREE.BoxGeometry(t, t, len), material);
  m.position.copy(from).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(Z, dir.normalize());
  parent.add(m);
  return m;
}

const HANDS = {
  ak74: { r: [0, -0.1, 0.13], l: [0, -0.035, -0.31] },
  rpk: { r: [0, -0.1, 0.13], l: [0, -0.035, -0.31] },
  makarov: { r: [0, -0.075, 0.05], l: [-0.02, -0.085, 0.07] },
  rpg: { r: [0, -0.1, 0.02], l: [0, -0.1, -0.13] },
  shovel: { r: [0, -0.01, 0.12], l: [0, -0.01, -0.12] },
  flaregun: { r: [0, -0.075, 0.05], l: null },
  molotov: { r: [0, -0.03, 0.02], l: null },
};

// Sight height above the bore for ADS alignment.
export function sightHeight(type, att) {
  if (type === 'ak74' || type === 'rpk') return att.optic ? 0.115 : 0.083;
  if (type === 'makarov') return att.optic ? 0.055 : 0.037;
  if (type === 'rpg') return att.optic ? 0.085 : 0.07;
  return 0.05;
}

export function makeViewmodel(type, att, sleeve, skin) {
  const root = new THREE.Group();
  const gun = makeGun(type, att || {});
  root.add(gun);
  const hands = HANDS[type] || HANDS.ak74;
  const sleeveM = mat(sleeve, { rough: 0.9 });
  const skinM = mat(skin, { rough: 0.7 });
  const cuffM = mat(0x222222);
  const mk = (h, elbowOff, shoulderOff) => {
    const hand = new THREE.Vector3(...h);
    const wrist = hand.clone().add(new THREE.Vector3(elbowOff[0] * 0.25, elbowOff[1] * 0.25, elbowOff[2] * 0.25));
    const elbow = hand.clone().add(new THREE.Vector3(...elbowOff));
    const shoulder = elbow.clone().add(new THREE.Vector3(...shoulderOff));
    box(0.075, 0.085, 0.1, skinM, hand.x, hand.y, hand.z, root);
    limb(root, hand, wrist, 0.07, skinM);
    limb(root, wrist, elbow, 0.1, sleeveM);
    limb(root, wrist.clone().lerp(elbow, 0.02), wrist.clone().lerp(elbow, 0.12), 0.105, cuffM);
    limb(root, elbow, shoulder, 0.12, sleeveM);
  };
  mk(hands.r, [0.06, -0.22, 0.17], [0.08, -0.22, 0.18]);
  if (hands.l) mk(hands.l, [-0.12, -0.22, 0.22], [-0.04, -0.22, 0.22]);
  root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  // Muzzle flash
  const fm = new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const flash = new THREE.Group();
  const p1 = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), fm);
  const p2 = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.3), fm); p2.rotation.y = Math.PI / 2; p2.position.z = -0.1;
  const p3 = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.07), fm); p3.rotation.x = Math.PI / 2; p3.position.z = -0.1;
  flash.add(p1, p2, p3);
  flash.position.copy(gun.muzzle.position);
  flash.visible = false;
  root.add(flash);
  root.userData = { gun, flash, type };
  return root;
}
