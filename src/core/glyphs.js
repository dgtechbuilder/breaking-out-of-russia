// Button labels for the device a player is currently using.
const MAP = {
  interact: { kbm: 'E', xbox: 'X', ps: '□', switch: 'Y', touch: 'USE' },
  callin0: { kbm: 'Z', xbox: '◀', ps: '◀', switch: '◀', touch: 'TAP' },
  callin1: { kbm: 'X', xbox: '▲', ps: '▲', switch: '▲', touch: 'TAP' },
  callin2: { kbm: 'B', xbox: '▶', ps: '▶', switch: '▶', touch: 'TAP' },
  molotov: { kbm: 'Q', xbox: 'LB', ps: 'L1', switch: 'L', touch: '' },
  flare: { kbm: 'F', xbox: 'RB', ps: 'R1', switch: 'R', touch: '' },
  roll: { kbm: 'Alt', xbox: 'B', ps: '○', switch: 'A', touch: 'ROLL' },
  melee: { kbm: 'V', xbox: 'R3', ps: 'R3', switch: 'R3', touch: '' },
};

export function inputKind(p) {
  const i = p && p.input;
  if (!i) return 'kbm';
  return i.activeKind ? i.activeKind() : i.kind;
}

export function glyph(p, action) {
  const k = inputKind(p);
  const t = k === 'pad' ? (p.input.padType ? p.input.padType() : 'xbox') : k;
  const m = MAP[action];
  return m ? (m[t] ?? m.kbm) : '';
}
