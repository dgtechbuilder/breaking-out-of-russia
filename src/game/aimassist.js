// Aim assist: slow-down near targets, gentle tracking while strafing,
// and bullet magnetism. Strength depends on the device the player is using.
import * as THREE from 'three';
import { settings } from '../core/input.js';
import { inputKind } from '../core/glyphs.js';
import { angleDiff, clamp } from '../core/util.js';

const _o = new THREE.Vector3(), _f = new THREE.Vector3(), _d = new THREE.Vector3(), _pt = new THREE.Vector3();

export function assistStrength(p) {
  const m = settings.aimAssist;
  if (m === 'off') return 0;
  if (m === 'light') return 0.45;
  if (m === 'strong') return 1;
  const k = inputKind(p);
  return k === 'touch' ? 1 : k === 'pad' ? 0.8 : 0.55;
}

export function autoFireOn(p) {
  if (settings.autoFire === 'on') return true;
  if (settings.autoFire === 'off') return false;
  return inputKind(p) === 'touch';
}

/**
 * Best enemy near the crosshair. Returns {target, point, angle, radius, dist} where
 * `angle` is the angle between view and target, and `radius` the target's angular half-width.
 */
export function findAssistTarget(game, p, cone) {
  const cam = p.camera;
  cam.getWorldPosition(_o);
  cam.getWorldDirection(_f);
  let best = null, bestScore = Infinity;
  const consider = (t, pt, halfWidth, isDrone) => {
    _d.subVectors(pt, _o);
    const dist = _d.length();
    if (dist < 0.5 || dist > 95) return;
    _d.multiplyScalar(1 / dist);
    const ang = Math.acos(clamp(_d.dot(_f), -1, 1));
    const radius = Math.atan(halfWidth / dist);
    const reach = cone + radius;
    if (ang > reach) return;
    const score = ang / reach + dist / 400;
    if (score >= bestScore) return;
    if (!game.world.clear(_o, pt)) return;
    bestScore = score;
    best = { target: t, point: pt.clone(), angle: ang, radius, dist, isDrone };
  };
  for (const e of game.enemies) {
    if (e.dead || e.hidden) continue;
    e.chest(_pt);
    // Aim at the visible part: chest, or head when the body is behind cover.
    if (!game.world.clear(_o, _pt) && !e.downed) _pt.y = e.pos.y + e.standH - 0.15;
    consider(e, _pt, 0.35, false);
  }
  for (const d of game.drones) if (!d.dead) consider(d, _pt.copy(d.pos), 0.5, true);
  return best;
}

/** Turn yaw/pitch toward a world point by fraction k (0..1). */
export function steerToward(p, point, k) {
  const c = p.camera.position;
  const dx = point.x - c.x, dy = point.y - c.y, dz = point.z - c.z;
  const yaw = Math.atan2(-dx, -dz);
  const pitch = Math.atan2(dy, Math.hypot(dx, dz));
  p.yaw += angleDiff(p.yaw, yaw) * k;
  p.pitch += (pitch - p.pitch - p.recoilP) * k;
}
