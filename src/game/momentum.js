// Shared Squad Momentum meter, multi-kill chains and call-ins.
import { audio } from '../core/audio.js';

export const CALLINS = [
  { id: 'jammer', name: 'Jammer Pulse', cost: 25, key: 'Z', pad: 'D-Left', desc: 'Fries every scout drone and jams enemy radios, delaying reinforcements.' },
  { id: 'rally', name: 'Brotherhood Rally', cost: 50, key: 'X', pad: 'D-Up', desc: 'Revives downed brothers and grants the squad heavy armor.' },
  { id: 'mortar', name: 'Stolen Mortar', cost: 75, key: 'B', pad: 'D-Right', desc: 'Shells the point you aim at. Flattens fortified roadblocks.' },
];

const CHAIN_NAMES = ['', '', 'DOUBLE KILL', 'TRIPLE KILL', 'MULTI KILL', 'RAMPAGE', 'UNSTOPPABLE'];

export class Momentum {
  constructor(game) {
    this.game = game;
    this.value = 0;
    this.max = 100;
    this.flash = 0;
  }

  add(n, by) {
    const before = this.value;
    this.value = Math.min(this.max, this.value + n);
    for (const c of CALLINS) {
      if (before < c.cost && this.value >= c.cost) {
        this.game.popup(`${c.name} ready  [${c.key}]`, null, 'callin');
        audio.play('click', null, 0.5);
      }
    }
    this.flash = 0.4;
  }

  onKill(by, head) {
    if (!by) return;
    if (!by.isHuman) { this.add(3, by); return; }
    const now = this.game.time;
    by.chain = by.chain && now - by.chainT < 2.6 ? by.chain + 1 : 1;
    by.chainT = now;
    by.stats.bestChain = Math.max(by.stats.bestChain, by.chain);
    let gain = 7 + (head ? 3 : 0);
    if (by.chain >= 2) {
      gain += by.chain * 5;
      this.game.popup(CHAIN_NAMES[Math.min(6, by.chain)], by, 'chain');
    }
    this.add(gain, by);
  }

  canUse(i) { return this.value >= CALLINS[i].cost; }

  activate(i, player) {
    const c = CALLINS[i];
    if (!c) return false;
    if (this.value < c.cost) {
      this.game.popup(`${c.name} needs ${c.cost} momentum`, player, 'warn');
      audio.play('empty', null, 0.5);
      return false;
    }
    if (!this.game.callIn(c.id, player)) return false;
    this.value -= c.cost;
    return true;
  }

  update(dt) { this.flash = Math.max(0, this.flash - dt); }
}
