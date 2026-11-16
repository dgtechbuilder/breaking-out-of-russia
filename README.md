# Breakout from Russia

A fast, co-op arcade first-person shooter that runs in the browser (Three.js, no build step).

You are Emeka, a Nigerian recruit lured to Kazakhstan with the promise of a factory job and
forced into a Russian staging camp in occupied Ukraine. With Kofi, Tendai and Moussa — fellow
trapped African conscripts — you blast your way through the camp, a convoy route and a cratered
border highway toward the Ukrainian line, to surrender.

> A work of fiction, inspired by reports of foreign workers coerced into military service.

## Play

```bash
npm start
```

Then open <http://localhost:8080>. Click the game to capture the mouse. (Any static file server
works — ES modules just need to be served over HTTP, not opened as `file://`.)

## Features

- **Snappy gunplay** — hitscan rifles with recoil, bloom and headshots; enemies drop in 3–4 rifle hits.
- **Fluid movement** — sprint, slide (`C` while sprinting), slide-jump, crouch.
- **Squad of four** — AI brothers follow you, flank, fight, scavenge weapons off the dead and
  **revive downed squadmates**. Get downed yourself and you can still fight with your pistol
  while you bleed out.
- **Local co-op, 1–4 players** — split-screen. Player 1 uses keyboard + mouse; plug in up to three
  gamepads and press **A / Start** in *Squad & Co-op* to join. Each human replaces an AI squadmate.
- **Looted loadouts** — start with nothing but an entrenching tool. Strip AK-74s, RPKs, Makarovs
  and RPG-7s from fallen guards. Scavenged **optics, drum magazines and suppressors** go into the
  squad stash; snap them on at **field workbenches**.
- **Improvised gear** — Molotovs brewed from motor-pool fuel (`Q`), rigged flare guns that blind
  enemies and **snipers** (`F`).
- **Squad Momentum** — kills fill a shared meter; chained multi-kills fill it much faster.
  Spend it on call-ins:
  - **Jammer Pulse** (25, `Z`) — fries every scout drone, jams radios and delays reinforcements.
  - **Brotherhood Rally** (50, `X`) — revives the downed and gives the whole squad heavy armor.
  - **Stolen Mortar** (75, `B`) — shells the point you aim at; flattens fortified roadblocks.
- **Pressure** — scout drones spot you and call in mortar fire; reinforcement trucks roll in on a
  visible countdown.

## Stages

1. **Camp Lockdown** — night. Sneak out of the sleeping quarters with shovel takedowns, raid the
   armory, scavenge the motor pool and open (or blow) the main gate.
2. **Convoy Hijack** — dusk. One player drives the stolen Ural (`E` at the front of the bed) while
   the rest hang out of the back fighting technicals; smash or clear roadblocks.
3. **The Border Dash** — waves of troops, MG bunkers, sniper nests and a final barricade that only
   explosives will open. Reach the Ukrainian trenches and lower your weapon.

Stages are replayable from *Select Stage*; best times are saved locally. Three difficulties:
Recruit, Veteran and Hardened.

## Controls

| Action | Keyboard / Mouse | Gamepad |
| --- | --- | --- |
| Move / Look | WASD / Mouse | Left / Right stick |
| Fire / Aim | LMB / RMB | RT / LT |
| Sprint | Shift | L3 (toggle) |
| Slide / Crouch | C (tap while sprinting / hold) | B |
| Jump | Space | A |
| Reload | R | X (tap) |
| Interact / Revive | E (hold to revive) | X (hold) |
| Weapons | 1 2 3 / wheel | Y, D-down for RPG |
| Melee / takedown | V | R3 |
| Molotov / Flare | Q / F | LB / RB |
| Call-ins | Z / X / B | D-left / D-up / D-right |
| Pause | Esc / P | Start |

## Code layout

```
index.html            menus, HUD styles, import map
src/main.js           boot, menus, co-op lobby, main loop
src/core/             input, procedural audio, particles/FX, collision + A* nav, procedural models
src/game/             game orchestrator, player, AI allies/enemies, drones/vehicles/projectiles,
                      weapons, momentum + call-ins, HUD, workbench
src/stages/           camp.js, convoy.js, border.js (+ shared builders in common.js)
vendor/               three.js r170 (MIT)
```

All art and sound are generated in code — no external assets. Online (networked) co-op is not
implemented; co-op is local split-screen.
