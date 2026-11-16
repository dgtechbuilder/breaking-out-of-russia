// Weapon definitions and per-instance state (ammo, attachments).

export const WEAPONS = {
  shovel: {
    name: 'Entrenching Tool', slot: 0, melee: true, dmg: 110, rpm: 90, range: 2.4,
    mag: 0, reserveStart: 0, reserveMax: 0, attachments: [], moveMult: 1.05, icon: 'shovel',
  },
  makarov: {
    name: 'Makarov PM', slot: 1, auto: false, rpm: 420, dmg: 36, mag: 8, reserveStart: 32, reserveMax: 64,
    reload: 1.3, spreadHip: 0.022, spreadAds: 0.005, recoil: 0.028, range: 45, adsZoom: 1.2, moveMult: 1.0,
    attachments: ['optic', 'suppressor'], sound: 'makarov', headMult: 2.2, icon: 'pistol',
    aiBurst: [1, 2], aiPause: [0.4, 0.8], aiDmg: 9,
  },
  ak74: {
    name: 'AK-74', slot: 0, auto: true, rpm: 660, dmg: 30, mag: 30, drumMag: 60, reserveStart: 90, reserveMax: 300,
    reload: 2.0, spreadHip: 0.038, spreadAds: 0.006, recoil: 0.017, range: 90, adsZoom: 1.35, moveMult: 0.96,
    attachments: ['optic', 'drum', 'suppressor'], sound: 'ak', headMult: 2.0, icon: 'rifle',
    aiBurst: [3, 6], aiPause: [0.5, 1.1], aiDmg: 8,
  },
  rpk: {
    name: 'RPK', slot: 0, auto: true, rpm: 600, dmg: 34, mag: 45, drumMag: 75, reserveStart: 135, reserveMax: 360,
    reload: 3.1, spreadHip: 0.055, spreadAds: 0.009, recoil: 0.013, range: 110, adsZoom: 1.4, moveMult: 0.88,
    attachments: ['optic', 'drum', 'suppressor'], sound: 'rpk', headMult: 2.0, icon: 'lmg',
    aiBurst: [5, 10], aiPause: [0.6, 1.2], aiDmg: 9,
  },
  rpg: {
    name: 'RPG-7', slot: 2, auto: false, rpm: 60, dmg: 240, splash: 6.5, mag: 1, reserveStart: 2, reserveMax: 5,
    reload: 2.5, spreadHip: 0.02, spreadAds: 0.004, recoil: 0.09, range: 160, adsZoom: 1.5, moveMult: 0.9,
    attachments: ['optic'], sound: 'rocket', projectile: 'rocket', icon: 'rpg',
  },
  // Enemy-only
  pkm: { name: 'PKM', aiBurst: [6, 12], aiPause: [0.7, 1.4], aiDmg: 9, rpm: 650, sound: 'mg', range: 120 },
  svd: { name: 'SVD', aiBurst: [1, 1], aiPause: [2.8, 3.6], aiDmg: 48, rpm: 60, sound: 'sniper', range: 220 },
};

export const PART_NAMES = { optic: 'Scavenged Optic', drum: 'Drum Magazine', suppressor: 'Suppressor' };

let nextId = 1;
export class Weapon {
  constructor(type, opts = {}) {
    this.id = nextId++;
    this.type = type;
    this.def = WEAPONS[type];
    this.att = { optic: false, drum: false, suppressor: false, ...(opts.att || {}) };
    this.mag = opts.mag ?? this.magSize;
    this.reserve = opts.reserve ?? this.def.reserveStart;
    this.cool = 0;
  }

  get magSize() { return this.att.drum && this.def.drumMag ? this.def.drumMag : this.def.mag; }
  get reloadTime() { return (this.def.reload || 0) * (this.att.drum ? 1.3 : 1); }
  get suppressed() { return this.att.suppressor; }
  get name() {
    const a = [];
    if (this.att.optic) a.push('Optic');
    if (this.att.drum) a.push('Drum');
    if (this.att.suppressor) a.push('Supp.');
    return this.def.name + (a.length ? ` [${a.join(' · ')}]` : '');
  }
  get dmg() { return this.def.dmg * (this.att.suppressor ? 0.92 : 1); }
  get adsZoom() { return (this.def.adsZoom || 1) * (this.att.optic ? 1.7 : 1); }
  get spreadAds() { return (this.def.spreadAds || 0) * (this.att.optic ? 0.5 : 1); }
  get spreadHip() { return this.def.spreadHip || 0; }

  canAttach(part) { return (this.def.attachments || []).includes(part); }

  addAmmo(n) {
    const before = this.reserve;
    this.reserve = Math.min(this.def.reserveMax, this.reserve + n);
    return this.reserve - before;
  }

  /** Called when the magazine size changes (drum attach/detach). */
  clampMag() {
    if (this.mag > this.magSize) { this.reserve += this.mag - this.magSize; this.mag = this.magSize; }
  }

  snapshot() { return { type: this.type, att: { ...this.att }, mag: this.mag, reserve: this.reserve }; }
}
