// Per-player DOM HUD: minimap, vitals, ammo, squad, call-ins, markers, prompts.
import * as THREE from 'three';
import { CALLINS } from './momentum.js';
import { fmtTime, clamp } from '../core/util.js';
import { glyph, inputKind } from '../core/glyphs.js';

const GUN_SVG = {
  rifle: 'M2 15 L21 12.5 L23 10.5 L58 10 L60 8 L64 8 L64 10 L97 10.2 L97 12 L66 12.6 L64 13.6 L55 13.6 L56 15 L53 24 L47 23 L50 15 L37 15.4 L34 22 L29 21 L31 15.6 L23 16.5 L4 21 Z',
  lmg: 'M2 15 L21 12.5 L23 10.5 L58 10 L60 8 L64 8 L64 10 L99 10.2 L99 12 L66 12.6 L64 13.6 L55 13.6 L56 15 L54 27 L46 26 L50 15 L37 15.4 L34 22 L29 21 L31 15.6 L23 16.5 L4 21 Z M70 13 L76 22 L78 22 L72 13 Z',
  pistol: 'M30 9 L72 9 L72 15 L50 15 L48 26 L38 26 L40 15 L30 15 Z',
  rpg: 'M4 11 L70 11 L84 7 L98 12.5 L84 18 L70 14 L4 14 Z M30 14 L32 22 L37 22 L35 14 Z M48 14 L50 22 L55 22 L53 14 Z',
  shovel: 'M10 12.5 L62 11.5 L62 13.5 L10 14.5 Z M62 6 L88 8 L92 12.5 L88 17 L62 19 Z',
};

const ICONS = {
  jammer: '<svg viewBox="0 0 24 24"><path d="M12 13a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm-4.2 2.8a6 6 0 010-8.5l1.1 1.1a4.4 4.4 0 000 6.3zm8.4 0l-1.1-1.1a4.4 4.4 0 000-6.3l1.1-1.1a6 6 0 010 8.5zM5 18.6a10 10 0 010-14.1l1.1 1.1a8.4 8.4 0 000 11.9zm14 0l-1.1-1.1a8.4 8.4 0 000-11.9L19 4.5a10 10 0 010 14.1z" fill="currentColor"/><path d="M3 21L21 3" stroke="currentColor" stroke-width="2"/></svg>',
  rally: '<svg viewBox="0 0 24 24"><circle cx="12" cy="6" r="2.6" fill="currentColor"/><circle cx="5" cy="8" r="2.1" fill="currentColor"/><circle cx="19" cy="8" r="2.1" fill="currentColor"/><path d="M7.5 18c0-3 2-5 4.5-5s4.5 2 4.5 5zM1 18c0-2.5 1.6-4.2 4-4.2 1 0 1.8.3 2.4.8A7 7 0 006 18zm22 0c0-2.5-1.6-4.2-4-4.2-1 0-1.8.3-2.4.8A7 7 0 0118 18z" fill="currentColor"/></svg>',
  mortar: '<svg viewBox="0 0 24 24"><path d="M12 2c2 2 3 4.5 3 7v7H9V9c0-2.5 1-5 3-7z" fill="currentColor"/><path d="M8 17h8l1 4H7z" fill="currentColor"/></svg>',
  molotov: '<svg viewBox="0 0 24 24"><path d="M10 7h4v2l2 3v9H8v-9l2-3z" fill="currentColor"/><path d="M11 2h2v5h-2z" fill="currentColor"/><path d="M12 0c1 1 2 2 1 3.5-.5-1-1.5-1-1-3.5z" fill="#ff8a2a"/></svg>',
  flare: '<svg viewBox="0 0 24 24"><path d="M3 10h13v5H9v5H5v-5H3z" fill="currentColor"/><circle cx="20" cy="12" r="2.5" fill="#ff5a4a"/></svg>',
  health: '<svg viewBox="0 0 24 24"><path d="M12 21s-8-5.2-8-11a4.6 4.6 0 018-3 4.6 4.6 0 018 3c0 5.8-8 11-8 11z" fill="currentColor"/></svg>',
  armor: '<svg viewBox="0 0 24 24"><path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" fill="currentColor"/></svg>',
};

export class HUD {
  constructor(game, player, root) {
    this.game = game;
    this.p = player;
    const el = document.createElement('div');
    el.className = 'hud';
    el.innerHTML = `
      <div class="vignette"></div><div class="downed-ov"></div><div class="blind-ov"></div>
      <div class="markers"></div>
      <div class="minimap"><canvas width="220" height="220"></canvas><div class="mm-ring"></div></div>
      <div class="objective"><div class="obj-title"></div><div class="obj-sub"></div></div>
      <div class="reinf"></div>
      <div class="squad"></div>
      <div class="momentum"><div class="mom-label">SQUAD MOMENTUM</div><div class="mom-bar"><div class="mom-fill"></div><i style="left:25%"></i><i style="left:50%"></i><i style="left:75%"></i></div></div>
      <div class="callins">${CALLINS.map((c) => `<div class="callin" data-id="${c.id}"><div class="ci-icon">${ICONS[c.id]}</div><div class="ci-key">${c.key}</div><div class="ci-cost">${c.cost}</div><div class="ci-name">${c.name}</div></div>`).join('')}</div>
      <div class="vitals">
        <div class="vlabel"></div>
        <div class="vrow hp"><span class="slash"></span><span class="vicon">${ICONS.health}</span><b class="hpv">100</b><small>/ 100</small><div class="vbar"><div></div></div></div>
        <div class="vrow ar"><span class="slash"></span><span class="vicon">${ICONS.armor}</span><b class="arv">0</b><small>/ 100</small></div>
        <div class="vtime"></div>
      </div>
      <div class="ammo">
        <div class="wname"></div>
        <div class="arow"><svg class="gunsvg" viewBox="0 0 100 30"><path d=""/></svg><span class="pips"></span><b class="mag">0</b><small class="res">0</small></div>
        <div class="gadgets"><span class="g-mol">${ICONS.molotov}<b>0</b><em>Q</em></span><span class="g-fl">${ICONS.flare}<b>0</b><em>F</em></span></div>
      </div>
      <div class="cross"><i class="t"></i><i class="b"></i><i class="l"></i><i class="r"></i><i class="dot"></i></div>
      <div class="reticle"></div>
      <div class="hitmark"><i></i><i></i><i></i><i></i></div>
      <div class="prompt"><div class="ptext"></div><div class="pbar"><div></div></div></div>
      <div class="popups"></div>
      <div class="feed"></div>
      <div class="dmgdirs"></div>
      <div class="center-msg"></div>
      <div class="pname"></div>
    `;
    root.appendChild(el);
    this.el = el;
    const q = (s) => el.querySelector(s);
    this.q = {
      mm: q('.minimap canvas'), objT: q('.obj-title'), objS: q('.obj-sub'), reinf: q('.reinf'), squad: q('.squad'),
      momFill: q('.mom-fill'), mom: q('.momentum'), callins: [...el.querySelectorAll('.callin')],
      hpv: q('.hpv'), hpbar: q('.vbar div'), arv: q('.arv'), arRow: q('.vrow.ar'), vtime: q('.vtime'), vlabel: q('.vlabel'),
      wname: q('.wname'), gun: q('.gunsvg path'), mag: q('.mag'), res: q('.res'), pips: q('.pips'),
      mol: q('.g-mol b'), fl: q('.g-fl b'), gMol: q('.g-mol'), gFl: q('.g-fl'),
      cross: q('.cross'), reticle: q('.reticle'), hit: q('.hitmark'), prompt: q('.prompt'), ptext: q('.ptext'), pbar: q('.pbar div'),
      popups: q('.popups'), vig: q('.vignette'), down: q('.downed-ov'), blind: q('.blind-ov'), markers: q('.markers'),
      dmg: q('.dmgdirs'), center: q('.center-msg'), pname: q('.pname'), feed: q('.feed'),
    };
    this.ctx = this.q.mm.getContext('2d');
    this.cache = {};
    this.markerEls = [];
    this.mmT = 0;
    this.q.callins.forEach((el, i) => el.addEventListener('pointerdown', (e) => { e.stopPropagation(); player.queuedCallin = i; }));
    this.q.ciKeys = [...el.querySelectorAll('.ci-key')];
    this.q.gKeys = [...el.querySelectorAll('.gadgets em')];
    this.q.pname.textContent = `P${player.index + 1} · ${player.name}`;
    this.q.pname.style.color = '#' + player.color.toString(16).padStart(6, '0');
  }

  set(key, el, prop, val) {
    if (this.cache[key] === val) return;
    this.cache[key] = val;
    if (prop === 'text') el.textContent = val;
    else if (prop === 'html') el.innerHTML = val;
    else if (prop === 'width') el.style.width = val;
    else if (prop === 'opacity') el.style.opacity = val;
    else if (prop === 'display') el.style.display = val;
    else if (prop === 'class') el.className = val;
  }

  layout(vp, totalH) {
    const s = this.el.style;
    s.left = vp.x + 'px'; s.top = vp.y + 'px'; s.width = vp.w + 'px'; s.height = vp.h + 'px';
    s.setProperty('--s', String(clamp(Math.min(vp.h / 900, vp.w / 1500), 0.45, 1.25)));
    this.el.classList.toggle('split', vp.h < totalH * 0.9 || vp.w < 1100);
  }

  popup(text, kind = 'info') {
    const d = document.createElement('div');
    d.className = `pop ${kind}`;
    d.textContent = text;
    this.q.popups.appendChild(d);
    while (this.q.popups.children.length > 4) this.q.popups.firstChild.remove();
    setTimeout(() => d.remove(), kind === 'chain' ? 1600 : 2600);
  }

  feed(text, color) {
    const d = document.createElement('div');
    d.textContent = text;
    if (color) d.style.borderLeftColor = color;
    this.q.feed.appendChild(d);
    while (this.q.feed.children.length > 5) this.q.feed.firstChild.remove();
    setTimeout(() => d.remove(), 5000);
  }

  damageFrom(dir) {
    const p = this.p;
    const ang = Math.atan2(-dir.x, -dir.z) - p.yaw; // direction the shot travelled
    const el = document.createElement('i');
    el.style.transform = `rotate(${(-ang + Math.PI) * 180 / Math.PI}deg)`;
    this.q.dmg.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  update(dt) {
    const g = this.game, p = this.p, Q = this.q;
    const w = p.weapon;
    // Vitals
    const hp = Math.max(0, Math.ceil(p.hp));
    this.set('hp', Q.hpv, 'text', String(hp));
    this.set('hpw', Q.hpbar, 'width', `${(hp / p.maxHp) * 100}%`);
    this.set('ar', Q.arv, 'text', String(Math.ceil(p.armor)));
    this.set('arop', Q.arRow, 'opacity', p.armor > 0 ? '1' : '0.45');
    this.set('vlabel', Q.vlabel, 'text', g.stage.label ? g.stage.label(g) : g.stage.name.toUpperCase());
    this.set('vtime', Q.vtime, 'text', fmtTime(g.time));

    // Ammo
    const icon = w.def.icon || 'rifle';
    this.set('gun', Q.gun, 'attr', icon);
    if (this.cache.gunIcon !== icon) { this.cache.gunIcon = icon; Q.gun.setAttribute('d', GUN_SVG[icon] || GUN_SVG.rifle); }
    this.set('wname', Q.wname, 'text', w.name);
    if (w.def.melee) { this.set('mag', Q.mag, 'text', '—'); this.set('res', Q.res, 'text', ''); }
    else {
      this.set('mag', Q.mag, 'text', p.reloadT > 0 ? '··' : String(w.mag));
      this.set('res', Q.res, 'text', String(w.reserve));
    }
    this.set('lowammo', Q.mag, 'class', !w.def.melee && w.mag <= Math.ceil(w.magSize * 0.25) ? 'mag low' : 'mag');
    this.set('mol', Q.mol, 'text', String(p.molotovs));
    this.set('fl', Q.fl, 'text', String(p.flares));
    this.set('molop', Q.gMol, 'opacity', p.molotovs ? '1' : '0.35');
    this.set('flop', Q.gFl, 'opacity', p.flares ? '1' : '0.35');

    // Device-specific button labels
    const kind = inputKind(p) + (p.input?.padType ? p.input.padType() : '');
    if (this.cache.kind !== kind) {
      this.cache.kind = kind;
      Q.ciKeys.forEach((k, i) => { k.textContent = glyph(p, 'callin' + i); });
      Q.gKeys[0].textContent = glyph(p, 'molotov');
      Q.gKeys[1].textContent = glyph(p, 'flare');
      this.el.classList.toggle('kind-touch', inputKind(p) === 'touch');
    }
    if (p.input?.touch) p.input.touch.setPrompt(p.prompt && !p.dead);

    // Momentum + call-ins
    const m = g.momentum;
    this.set('mom', Q.momFill, 'width', `${m.value}%`);
    Q.mom.classList.toggle('flash', m.flash > 0);
    CALLINS.forEach((c, i) => {
      const ok = m.value >= c.cost;
      Q.callins[i].classList.toggle('ready', ok);
    });

    // Objective
    const obj = g.objective;
    this.set('objT', Q.objT, 'text', obj ? obj.text : '');
    let sub = obj && obj.sub ? (typeof obj.sub === 'function' ? obj.sub(g, p) : obj.sub) : '';
    if (obj && obj.pos && !sub) sub = `${Math.round(p.pos.distanceTo(obj.pos))} m`;
    this.set('objS', Q.objS, 'text', sub);

    // Reinforcements
    const r = g.reinf;
    const rtxt = r && r.active && r.timer > 0 ? `REINFORCEMENTS IN ${fmtTime(r.timer)}` : (g.truckHpText || '');
    this.set('reinf', Q.reinf, 'text', rtxt);
    Q.reinf.classList.toggle('urgent', !!(r && r.active && r.timer < 10));

    // Squad list
    const sq = g.squad.map((s) => {
      const col = '#' + s.color.toString(16).padStart(6, '0');
      const st = s.dead ? 'KIA' : s.downed ? `DOWN ${Math.ceil(s.bleed)}s` : '';
      const pct = s.dead ? 0 : (s.downed ? 0 : (s.hp / s.maxHp) * 100);
      return `<div class="sq ${s.downed ? 'down' : ''} ${s.dead ? 'dead' : ''}"><span style="color:${col}">${s.isHuman ? 'P' + (s.index + 1) + ' ' : ''}${s.name}</span><em>${st}</em><div class="sqbar"><div style="width:${pct.toFixed(0)}%;background:${col}"></div></div></div>`;
    }).join('');
    this.set('squad', Q.squad, 'html', sq);

    // Crosshair
    const spread = (p.bloom + (Math.hypot(p.vel.x, p.vel.z) > 1 ? 0.018 : 0) + (w.spreadHip || 0.03)) * (1 - p.ads);
    const gap = 6 + spread * 600;
    Q.cross.style.setProperty('--gap', `${gap.toFixed(1)}px`);
    const optic = w.att && w.att.optic && p.ads > 0.7 && !p.gadget;
    Q.cross.classList.toggle('on-target', !!(p.assist && p.assist.angle < p.assist.radius + 0.02));
    this.set('crossop', Q.cross, 'opacity', p.ads > 0.6 || p.sprinting || p.dead || p.driving ? '0' : '1');
    this.set('ret', Q.reticle, 'display', optic ? 'block' : 'none');
    Q.hit.style.opacity = p.hitmarker > 0 ? String(Math.min(1, p.hitmarker * 6)) : '0';
    Q.hit.classList.toggle('kill', p.hitKill);

    // Prompt
    const pr = p.prompt;
    if (pr && !p.dead) {
      this.set('ptext', Q.ptext, 'html', pr.text);
      this.set('pshow', Q.prompt, 'display', 'block');
      const hold = pr.hold && p.hold.key === pr.key ? p.hold.t / pr.hold : 0;
      Q.pbar.style.width = `${clamp(hold, 0, 1) * 100}%`;
      Q.pbar.parentElement.style.display = pr.hold ? 'block' : 'none';
    } else this.set('pshow', Q.prompt, 'display', 'none');

    // Overlays
    const hurt = 1 - p.hp / p.maxHp;
    Q.vig.style.opacity = String(clamp(hurt * 0.9 + (p.hurtT > 0 ? 0.35 : 0), 0, 1));
    this.set('down', Q.down, 'display', p.downed || p.dead ? 'block' : 'none');
    Q.blind.style.opacity = p.blind > 0 ? String(Math.min(1, p.blind)) : '0';
    let cm = '';
    if (p.dead) cm = `<b>YOU BLED OUT</b><br>Rejoining your brothers in ${Math.max(0, Math.ceil(p.respawnT))}s`;
    else if (p.downed) cm = `<b>YOU ARE DOWN</b><br>Hold on, brother — bleeding out in ${Math.ceil(p.bleed)}s${p.reviveProgress > 0 ? `<div class="rv"><div style="width:${(p.reviveProgress * 100).toFixed(0)}%"></div></div>` : ''}`;
    this.set('cm', Q.center, 'html', cm);

    this.updateMarkers();
    this.mmT -= dt;
    if (this.mmT <= 0) { this.mmT = 1 / 20; this.drawMinimap(); }
  }

  updateMarkers() {
    const g = this.game, p = this.p, cam = p.camera;
    const vp = p.viewport;
    const list = [];
    if (g.objective && g.objective.pos && g.objective.marker !== false) list.push({ pos: g.objective.pos, cls: 'obj', label: g.objective.markerLabel || '', y: 2.5 });
    for (const s of g.squad) {
      if (s === p || s.dead) continue;
      list.push({ pos: s.pos, cls: s.downed ? 'down' : 'mate', label: s.downed ? `${s.name} ✚` : s.name, y: s.downed ? 1.0 : 2.25, color: s.color, dist: s.downed });
    }
    for (const m of g.worldMarkers) list.push(m);
    while (this.markerEls.length < list.length) {
      const d = document.createElement('div');
      d.className = 'wm';
      d.innerHTML = '<div class="wm-i"></div><div class="wm-l"></div>';
      this.q.markers.appendChild(d);
      this.markerEls.push(d);
    }
    const v = new THREE.Vector3();
    for (let i = 0; i < this.markerEls.length; i++) {
      const el = this.markerEls[i];
      const m = list[i];
      if (!m) { el.style.display = 'none'; continue; }
      v.set(m.pos.x, (m.pos.y || 0) + m.y, m.pos.z);
      const d = p.pos.distanceTo(v);
      if ((m.cls === 'bench' && d > 22) || (m.cls === 'warn' && d > 90)) { el.style.display = 'none'; continue; }
      v.project(cam);
      let x = (v.x * 0.5 + 0.5) * vp.w, y = (-v.y * 0.5 + 0.5) * vp.h;
      const behind = v.z > 1;
      const offscreen = behind || x < 0 || x > vp.w || y < 0 || y > vp.h;
      if (offscreen && (m.cls === 'mate')) { el.style.display = 'none'; continue; }
      if (offscreen) {
        // Clamp to screen edge.
        let dx = x - vp.w / 2, dy = y - vp.h / 2;
        if (behind) { dx = -dx; dy = -dy; }
        const k = Math.min((vp.w / 2 - 70) / Math.abs(dx || 1), (vp.h / 2 - 120) / Math.abs(dy || 1));
        x = vp.w / 2 + dx * k; y = vp.h / 2 + dy * k;
      }
      el.style.display = 'block';
      el.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`;
      const cls = `wm ${m.cls}${offscreen ? ' off' : ''}`;
      if (el.className !== cls) el.className = cls;
      const label = m.cls === 'mate' ? m.label : `${m.label}${m.label ? ' · ' : ''}${Math.round(d)}m`;
      const l = el.lastChild;
      if (l.textContent !== label) l.textContent = label;
      if (m.color != null) el.style.setProperty('--c', '#' + m.color.toString(16).padStart(6, '0'));
    }
  }

  drawMinimap() {
    const g = this.game, p = this.p, ctx = this.ctx;
    const W = 220, R = 110, scale = 2.2; // px per metre
    ctx.clearRect(0, 0, W, W);
    ctx.save();
    ctx.beginPath(); ctx.arc(R, R, R - 2, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = g.stage.mapColor || 'rgba(70,78,82,0.85)';
    ctx.fillRect(0, 0, W, W);
    ctx.translate(R, R);
    ctx.rotate(p.yaw);
    ctx.scale(scale, scale);
    ctx.translate(-p.pos.x, -p.pos.z);
    const range = R / scale + 4;
    // roads / ground features
    for (const f of g.mapFeatures) {
      if (Math.abs(f.x - p.pos.x) > range + f.w && Math.abs(f.z - p.pos.z) > range + f.d) continue;
      ctx.fillStyle = f.color;
      ctx.fillRect(f.x - f.w / 2, f.z - f.d / 2, f.w, f.d);
    }
    ctx.fillStyle = 'rgba(200,205,210,0.75)';
    for (const c of g.world.colliders) {
      if (!c.blocksShot || c.max.y < 0.8 || c.vehicle) continue;
      if (c.max.x < p.pos.x - range || c.min.x > p.pos.x + range || c.max.z < p.pos.z - range || c.min.z > p.pos.z + range) continue;
      ctx.fillRect(c.min.x, c.min.z, c.max.x - c.min.x, c.max.z - c.min.z);
    }
    // vehicles
    for (const v of g.vehicles) {
      if (v.dead && !v.wreck) continue;
      ctx.fillStyle = v.dead ? 'rgba(40,40,40,0.9)' : '#d24a3a';
      ctx.fillRect(v.pos.x - 1.2, v.pos.z - 2.5, 2.4, 5);
    }
    // enemies (only those engaged)
    for (const e of g.enemies) {
      if (e.dead) continue;
      if (e.state !== 'combat' && !(g.momentum && g.jammed > 0)) continue;
      ctx.fillStyle = '#ff3b30';
      ctx.beginPath(); ctx.arc(e.pos.x, e.pos.z, 1.3, 0, Math.PI * 2); ctx.fill();
    }
    for (const d of g.drones) {
      if (d.dead) continue;
      ctx.strokeStyle = '#ff7a30'; ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.arc(d.pos.x, d.pos.z, 2, 0, Math.PI * 2); ctx.stroke();
    }
    // objective
    if (g.objective && g.objective.pos) {
      ctx.fillStyle = '#ff4a3a';
      ctx.beginPath(); ctx.arc(g.objective.pos.x, g.objective.pos.z, 2.4, 0, Math.PI * 2); ctx.fill();
    }
    // squad
    for (const s of g.squad) {
      if (s.dead) continue;
      ctx.save();
      ctx.translate(s.pos.x, s.pos.z);
      ctx.rotate(-s.yaw);
      ctx.fillStyle = s.downed ? '#ff3030' : '#' + s.color.toString(16).padStart(6, '0');
      ctx.beginPath(); ctx.moveTo(0, -2.2); ctx.lineTo(1.5, 1.6); ctx.lineTo(-1.5, 1.6); ctx.closePath(); ctx.fill();
      if (s === p) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.4; ctx.stroke(); }
      ctx.restore();
    }
    ctx.restore();
    // Objective direction pip on rim if off-map
    if (g.objective && g.objective.pos) {
      const dx = g.objective.pos.x - p.pos.x, dz = g.objective.pos.z - p.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist * scale > R - 8) {
        const a = Math.atan2(dz, dx) + p.yaw;
        ctx.fillStyle = '#ff4a3a';
        ctx.beginPath(); ctx.arc(R + Math.cos(a) * (R - 8), R + Math.sin(a) * (R - 8), 5, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  destroy() { this.el.remove(); }
}
