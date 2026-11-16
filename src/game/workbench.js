// Field workbench menu: snap scavenged parts onto weapons, brew Molotovs.
import { PART_NAMES } from './weapons.js';
import { audio } from '../core/audio.js';

export class WorkbenchUI {
  constructor(game, player) {
    this.game = game;
    this.p = player;
    this.sel = 0;
    this.el = document.createElement('div');
    this.el.className = 'workbench';
    player.hud.el.appendChild(this.el);
    this.render();
  }

  items() {
    const g = this.game, p = this.p, st = g.stash;
    const out = [];
    p.weapons.forEach((w) => {
      if (!w || w.def.melee) return;
      for (const part of w.def.attachments) {
        const on = w.att[part];
        out.push({
          label: `${w.def.name} — ${PART_NAMES[part]}`,
          state: on ? 'ATTACHED' : st[part] > 0 ? `ATTACH (${st[part]} in stash)` : 'NONE IN STASH',
          ok: on || st[part] > 0,
          on,
          act: () => {
            if (on) { w.att[part] = false; st[part]++; }
            else if (st[part] > 0) { w.att[part] = true; st[part]--; }
            else return false;
            w.clampMag();
            p.rebuildViewmodel();
            return true;
          },
        });
      }
    });
    out.push({
      label: 'Brew Molotov (motor-pool fuel)',
      state: `${st.fuel} fuel · carrying ${p.molotovs}/4`,
      ok: st.fuel > 0 && p.molotovs < 4,
      act: () => { if (st.fuel > 0 && p.molotovs < 4) { st.fuel--; p.molotovs++; return true; } return false; },
    });
    out.push({
      label: 'Rig flare rounds (signal kit)',
      state: `${st.flarekit} kits · carrying ${p.flares}/4`,
      ok: st.flarekit > 0 && p.flares < 4,
      act: () => { if (st.flarekit > 0 && p.flares < 4) { st.flarekit--; p.flares = Math.min(4, p.flares + 2); return true; } return false; },
    });
    out.push({ label: 'Close workbench', state: '', ok: true, act: () => { this.close(); return true; } });
    return out;
  }

  render() {
    const st = this.game.stash;
    const items = this.items();
    this.sel = Math.min(this.sel, items.length - 1);
    this.el.innerHTML = `
      <h3>FIELD WORKBENCH</h3>
      <div class="wb-stash">Stash: Optics <b>${st.optic}</b> · Drums <b>${st.drum}</b> · Suppressors <b>${st.suppressor}</b> · Fuel <b>${st.fuel}</b> · Flare kits <b>${st.flarekit}</b></div>
      <ul>${items.map((it, i) => `<li class="${i === this.sel ? 'sel' : ''} ${it.ok ? '' : 'dis'} ${it.on ? 'on' : ''}" data-i="${i}"><span>${it.label}</span><em>${it.state}</em></li>`).join('')}</ul>
      <div class="wb-help">W/S or D-pad to select · E / A to apply · C / B / Esc to close · or tap an item</div>`;
    this.el.querySelectorAll('li').forEach((li) => {
      li.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.sel = Number(li.dataset.i); this.apply(); });
    });
  }

  apply() {
    const it = this.items()[this.sel];
    if (it && it.act()) audio.play('pickup', null, 0.5); else audio.play('empty', null, 0.5);
    if (this.p.ui === this) this.render();
  }

  handle(intent) {
    const n = this.items().length;
    if (intent.menuUp) { this.sel = (this.sel - 1 + n) % n; this.render(); audio.play('click', null, 0.3); }
    if (intent.menuDown) { this.sel = (this.sel + 1) % n; this.render(); audio.play('click', null, 0.3); }
    if (intent.menuOk) this.apply();
    if (intent.menuBack) this.close();
  }

  close() {
    this.el.remove();
    this.p.ui = null;
    this.game.input0Relock?.();
  }
}
