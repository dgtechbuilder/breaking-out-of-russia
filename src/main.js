// Boot, menus, co-op lobby and the main loop.
import * as THREE from 'three';
import { KeyboardMouse, GamepadInput, HybridInput, settings, isTouchDevice } from './core/input.js';
import { TouchInput } from './core/touch.js';
import { audio } from './core/audio.js';
import { Game, DIFFICULTY } from './game/game.js';
import { STAGES, stageById } from './stages/index.js';
import { PLAYER_LOOKS } from './game/player.js';
import { fmtTime } from './core/util.js';
import { Weapon } from './game/weapons.js';

settings.load();
const canvas = document.getElementById('view');
const hudRoot = document.getElementById('hudroot');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
function applyQuality() {
  const low = settings.lowQuality;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, low ? 1.25 : 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.shadowMap.enabled = !low;
}
applyQuality();
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.autoClear = false;

const kbm = new KeyboardMouse(canvas);
const pads = []; // joined GamepadInput instances (P2..P4)
const touch = new TouchInput();
const freePads = () => [...(navigator.getGamepads?.() || [])].filter((g) => g && !pads.some((p) => p.index === g.index)).map((g) => g.index);
const p1Input = new HybridInput(kbm, freePads, touch);
const state = {
  screen: 'title', prev: 'title', game: null, stageId: 'camp', campaign: false,
  difficulty: 'veteran', progress: loadProgress(),
};
window.__bfr = state; // handy for debugging / automated tests
state.Weapon = Weapon;

function loadProgress() {
  try { return JSON.parse(localStorage.getItem('bfr_progress') || '{}'); } catch { return {}; }
}
function saveProgress() {
  try { localStorage.setItem('bfr_progress', JSON.stringify(state.progress)); } catch { /* ignore */ }
}
try { state.difficulty = localStorage.getItem('bfr_diff') || (isTouchDevice() ? 'recruit' : 'veteran'); } catch { /* ignore */ }

// ------------------------------------------------------------------ screens
const $ = (s) => document.querySelector(s);
function show(name) {
  if (name !== state.screen) state.prev = state.screen;
  state.screen = name;
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('show', s.id === 's-' + name));
  if (name === 'stages') renderStages();
  if (name === 'coop') renderSlots();
  if (name === 'settings') renderSettings();
  if (name !== 'play') document.exitPointerLock?.();
  $('#clickToPlay').style.display = 'none';
  touch.setVisible(name === 'play');
  document.body.classList.toggle('playing', name === 'play');
  document.querySelectorAll('.padfocus').forEach((e) => e.classList.remove('padfocus'));
  if (name !== 'play' && performance.now() - lastPadNav < 60000) setTimeout(() => navMove(0), 30);
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-go]');
  if (!b) return;
  audio.init();
  audio.play('click', null, 0.4);
  const go = b.dataset.go;
  if (go === 'campaign') { state.campaign = true; briefing(STAGES[0].id); }
  else if (go === 'back') show(state.game && !state.game.over ? 'pause' : state.prev === 'pause' ? 'pause' : 'title');
  else show(go);
});

function renderStages() {
  $('#stageCards').innerHTML = STAGES.map((s, i) => {
    const best = state.progress[s.id];
    return `<div class="card" tabindex="0" role="button" data-stage="${s.id}"><div class="num">STAGE ${i + 1}</div><h3>${s.name}</h3><p>${s.subtitle}</p>
      <p>${['Close-quarters shootout through the sleeping quarters, armory and main gate. Start with nothing but a shovel.',
        'One of you drives the stolen Ural; everyone else hangs out the back and fends off technicals and roadblocks.',
        'Waves of troops, snipers and fortified roadblocks across a cratered highway to the Ukrainian line.'][i]}</p>
      <div class="best">${best ? `Cleared · best ${fmtTime(best.time)} · ${best.kills} kills` : 'Not cleared yet'}</div></div>`;
  }).join('');
  document.querySelectorAll('[data-stage]').forEach((c) => c.addEventListener('click', () => {
    audio.init();
    state.campaign = false;
    briefing(c.dataset.stage);
  }));
}

function segment(el, opts, current, onPick) {
  el.innerHTML = opts.map(([v, l]) => `<button data-v="${v}" class="${String(v) === String(current) ? 'on' : ''}">${l}</button>`).join('');
  el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { onPick(b.dataset.v); segment(el, opts, b.dataset.v, onPick); }));
}

function renderSettings() {
  const bind = (id, key, fmt) => {
    const el = $('#' + id), v = $('#' + id + 'V');
    el.value = settings[key];
    v.textContent = fmt(settings[key]);
    el.oninput = () => { settings[key] = Number(el.value); v.textContent = fmt(settings[key]); settings.save(); if (key === 'volume') audio.setVolume(settings.volume); };
  };
  bind('sens', 'sensitivity', (x) => x.toFixed(2));
  bind('padSens', 'padSensitivity', (x) => x.toFixed(2));
  bind('touchSens', 'touchSensitivity', (x) => x.toFixed(2));
  const seg = (id, key, opts) => segment($('#' + id), opts, settings[key], (v) => { settings[key] = v === 'true' ? true : v === 'false' ? false : v; settings.save(); if (key === 'quality') applyQuality(); if (key === 'touchControls') { touch.enabled = v === 'on' || (v === 'auto' && isTouchDevice()); touch.refresh(); } });
  seg('aaSeg', 'aimAssist', [['auto', 'Auto'], ['off', 'Off'], ['light', 'Light'], ['strong', 'Strong']]);
  seg('afSeg', 'autoFire', [['auto', 'Touch only'], ['on', 'On'], ['off', 'Off']]);
  seg('rumbleSeg', 'rumble', [[true, 'On'], [false, 'Off']]);
  seg('touchSeg', 'touchControls', [['auto', 'Auto'], ['on', 'On'], ['off', 'Off']]);
  seg('qualSeg', 'quality', [['auto', 'Auto'], ['high', 'High'], ['low', 'Low (mobile)']]);
  bind('fov', 'fov', (x) => `${x}°`);
  bind('vol', 'volume', (x) => `${Math.round(x * 100)}%`);
  segment($('#invSeg'), [[0, 'Off'], [1, 'On']], settings.invertY ? 1 : 0, (v) => { settings.invertY = v === '1'; settings.save(); });
  renderDiff($('#diffSeg2'));
}

function renderDiff(el) {
  segment(el, Object.entries(DIFFICULTY).map(([k, d]) => [k, d.label]), state.difficulty, (v) => {
    state.difficulty = v;
    try { localStorage.setItem('bfr_diff', v); } catch { /* ignore */ }
  });
}

function renderSlots() {
  const slots = [{ label: 'Keyboard, mouse, touch or controller', on: true }, ...[0, 1, 2].map((i) => (pads[i] ? { label: `${pads[i].label} · ${pads[i].padType() === 'ps' ? 'PlayStation' : pads[i].padType() === 'switch' ? 'Switch' : 'Xbox'} layout`, on: true } : { label: 'Press A or Start on another controller', on: false }))];
  $('#slots').innerHTML = slots.map((s, i) => {
    const look = PLAYER_LOOKS[i];
    const c = '#' + look.band.toString(16).padStart(6, '0');
    return `<div class="slot ${s.on ? 'on' : ''}" style="--c:${c}"><small>PLAYER ${i + 1}</small><b>${s.on ? look.name : 'AI · ' + look.name}</b><small>${s.on ? s.label : s.label}</small><br><small>${look.from}</small></div>`;
  }).join('');
  renderDiff($('#diffSeg'));
}

// ------------------------------------------------------------------ controllers in menus
// Any controller navigates menus (D-pad/stick, A select, B back). In the co-op lobby, another
// controller pressing A or Start joins as the next player; B or Start leaves.
const padPrev = {};
let menuPad = null;
let lastPadNav = -1e9;

function focusables() {
  const scr = document.querySelector('.screen.show');
  if (!scr) return [];
  return [...scr.querySelectorAll('button, .card, input[type=range]')].filter((e) => e.offsetParent !== null);
}

function navMove(dir) {
  const list = focusables();
  if (!list.length) return;
  let i = list.indexOf(document.activeElement);
  i = i < 0 ? (dir < 0 ? list.length - 1 : 0) : (i + dir + list.length) % list.length;
  const el = list[i];
  document.querySelectorAll('.padfocus').forEach((e) => e.classList.remove('padfocus'));
  el.classList.add('padfocus');
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: 'nearest' });
}

function navActivate() {
  const el = document.activeElement;
  if (!el || !focusables().includes(el)) { navMove(0); return; }
  if (el.matches('input[type=range]')) return;
  audio.init();
  el.click();
}

function navBack() {
  if (state.screen === 'pause') { resume(); return; }
  const scr = document.querySelector('.screen.show');
  const b = scr && (scr.querySelector('[data-go=back]') || scr.querySelector('[data-go=title]'));
  if (b && b.offsetParent !== null) b.click();
}

function navAdjust(dir) {
  const el = document.activeElement;
  if (el && el.matches('input[type=range]') && focusables().includes(el)) {
    el.value = String(Number(el.value) + dir * Number(el.step || 1));
    el.dispatchEvent(new Event('input'));
    return true;
  }
  return false;
}

function pollPads() {
  const gps = [...(navigator.getGamepads?.() || [])].filter(Boolean);
  let changed = false;
  for (const gp of gps) {
    const prev = padPrev[gp.index] || { b: [], ax: [] };
    const pr = (i) => gp.buttons[i]?.pressed && !prev.b[i];
    const edge = (a, d) => (d < 0 ? gp.axes[a] < -0.6 && !(prev.ax[a] < -0.6) : gp.axes[a] > 0.6 && !(prev.ax[a] > 0.6));
    const joined = pads.find((p) => p.index === gp.index);
    let used = false;
    if (state.screen === 'coop') {
      if (!joined && pads.length < 3 && (pr(9) || (pr(0) && gp.index !== menuPad))) {
        pads.push(new GamepadInput(gp.index)); changed = true; used = true;
        if (menuPad === gp.index) menuPad = null;
        audio.init(); audio.play('pickup', null, 0.5);
      } else if (joined && (pr(1) || pr(9))) { pads.splice(pads.indexOf(joined), 1); changed = true; used = true; }
    }
    if (state.screen !== 'play' && !used && !(state.screen === 'coop' && joined)) {
      const up = pr(12) || edge(1, -1), down = pr(13) || edge(1, 1);
      const left = pr(14) || edge(0, -1), right = pr(15) || edge(0, 1);
      if (up || down || left || right) {
        menuPad = gp.index; lastPadNav = performance.now();
        if ((left || right) && navAdjust(left ? -1 : 1)) { /* slider */ }
        else navMove(up || left ? -1 : 1);
      }
      if (pr(0)) { menuPad = gp.index; lastPadNav = performance.now(); navActivate(); }
      if (pr(1)) navBack();
      if (pr(9) && state.screen === 'pause') resume();
    }
    padPrev[gp.index] = { b: gp.buttons.map((x) => x.pressed), ax: [...gp.axes] };
  }
  if (changed) renderSlots();
}
window.addEventListener('gamepaddisconnected', (e) => {
  const i = pads.findIndex((p) => p.index === e.gamepad.index);
  if (i >= 0) pads.splice(i, 1);
  if (state.screen === 'coop') renderSlots();
});

// ------------------------------------------------------------------ flow
function briefing(id) {
  const s = stageById(id);
  state.stageId = id;
  $('#briefSub').textContent = `Stage ${STAGES.indexOf(s) + 1} · ${s.subtitle}`;
  $('#briefTitle').textContent = s.name;
  $('#briefText').innerHTML = s.intro.map((l, i) => `<p style="animation-delay:${i * 0.35}s">${l}</p>`).join('');
  show('brief');
  setTimeout(() => $('#briefGo').focus(), 50);
}

$('#briefGo').addEventListener('click', () => { audio.init(); startStage(state.stageId); });

function startStage(id) {
  if (state.game) { state.game.dispose(); state.game = null; }
  hudRoot.innerHTML = '';
  const stage = stageById(id);
  state.game = new Game({
    renderer, hudRoot, stage, difficulty: state.difficulty,
    inputs: [p1Input, ...pads],
    onEnd: (r) => endStage(r),
    onPause: () => pause(),
  });
  state.game.input0Relock = () => { if (state.screen === 'play') kbm.requestLock(); };
  show('play');
  if (touch.enabled) {
    // Phones: go full screen in landscape where the browser allows it.
    document.documentElement.requestFullscreen?.().then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
  } else {
    kbm.requestLock();
    $('#clickToPlay').style.display = kbm.locked ? 'none' : 'block';
  }
}

function pause() {
  const g = state.game;
  if (!g || g.over || state.screen !== 'play') return;
  g.paused = true;
  const st = g.stash;
  $('#pauseStash').innerHTML = `${g.stage.name} · ${DIFFICULTY[state.difficulty].label} · ${fmtTime(g.time)}<br>Squad stash — optics ${st.optic}, drums ${st.drum}, suppressors ${st.suppressor}, fuel ${st.fuel}, flare kits ${st.flarekit}`;
  show('pause');
}

function resume() {
  const g = state.game;
  if (!g) return;
  g.paused = false;
  show('play');
  if (!touch.enabled && performance.now() - lastPadNav > 3000) kbm.requestLock();
}
$('#resume').addEventListener('click', resume);
$('#restart').addEventListener('click', () => startStage(state.stageId));
$('#quit').addEventListener('click', () => { if (state.game) { state.game.dispose(); state.game = null; } hudRoot.innerHTML = ''; show('title'); });

function endStage(r) {
  const g = state.game;
  const s = g.stage;
  const idx = STAGES.indexOf(s);
  document.exitPointerLock?.();
  if (r.win) {
    const prev = state.progress[s.id];
    if (!prev || r.stats.time < prev.time) state.progress[s.id] = { time: r.stats.time, kills: r.stats.kills };
    saveProgress();
  }
  const last = idx === STAGES.length - 1;
  $('#resSub').textContent = `Stage ${idx + 1} · ${s.name}`;
  $('#resTitle').textContent = r.win ? (last ? 'You made it.' : 'Stage cleared') : 'Breakout failed';
  let text = r.text;
  if (r.win && last) text += ' This story is fiction, but the recruitment scheme it depicts has been widely reported. Many never made it home.';
  $('#resText').textContent = text;
  const st = r.stats;
  const best = Math.max(0, ...st.players.map((p) => p.bestChain));
  const acc = st.players.reduce((a, p) => a + p.hits, 0) / Math.max(1, st.players.reduce((a, p) => a + p.shots, 0));
  $('#resStats').innerHTML = [
    ['Time', fmtTime(st.time)], ['Kills', st.kills], ['Headshots', st.headshots], ['Best streak', best ? `x${best}` : '—'],
    ['Revives', st.revives], ['Times downed', st.downs], ['Call-ins', st.callins], ['Accuracy', `${Math.round(acc * 100)}%`],
  ].map(([k, v]) => `<div class="stat"><b>${v}</b><span>${k}</span></div>`).join('');
  const btns = [];
  if (r.win && !last) btns.push(`<button class="b primary" id="rNext">Next: ${STAGES[idx + 1].name}</button>`);
  if (!r.win) btns.push('<button class="b primary" id="rRetry">Retry</button>');
  else btns.push('<button class="b" id="rRetry">Replay stage</button>');
  btns.push('<button class="b" id="rMenu">Menu</button>');
  $('#resBtns').innerHTML = btns.join('');
  $('#rNext')?.addEventListener('click', () => briefing(STAGES[idx + 1].id));
  $('#rRetry').addEventListener('click', () => startStage(s.id));
  $('#rMenu').addEventListener('click', () => { g.dispose(); state.game = null; hudRoot.innerHTML = ''; show('title'); });
  show('result');
}

// Pointer lock handling
canvas.addEventListener('click', () => {
  audio.init();
  if (state.screen === 'play' && !kbm.locked && performance.now() - touch.lastActive > 1500) kbm.requestLock();
});
window.addEventListener('touchstart', () => audio.init(), { passive: true });
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  $('#clickToPlay').style.display = state.screen === 'play' && !locked && !kbm.dragLook && !touch.enabled ? 'block' : 'none';
  if (!locked && state.screen === 'play' && state.game && !state.game.over && !state.game.players.some((p) => p.ui)) pause();
});

window.addEventListener('resize', () => {
  applyQuality();
  state.game?.layoutViewports();
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && state.screen === 'pause') { e.preventDefault(); resume(); }
});

// ------------------------------------------------------------------ loop
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  pollPads();
  const g = state.game;
  if (g) {
    if (state.screen === 'play' || state.screen === 'pause' || state.screen === 'result' || state.screen === 'settings' || state.screen === 'controls') {
      if (state.screen !== 'play' && !g.paused && !g.over) g.paused = true;
      g.frame(dt);
    }
  } else {
    renderer.setScissorTest(false);
    renderer.setClearColor(0x07080a, 1);
    renderer.clear();
  }
}
requestAnimationFrame(loop);
document.getElementById('loading').remove();
show('title');
