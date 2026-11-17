// random.js — a small seeded random number generator (mulberry32) plus the range and
// choice helpers the game uses everywhere. Seeded, so screenshot staging and any test
// can reproduce a scene exactly; Math.random is never used for gameplay.

export function makeRng(seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: (list) => list[Math.floor(next() * list.length)],
    sign: () => (next() < 0.5 ? -1 : 1),
  };
}

// The run-time generator: seeded from the clock so every run differs.
export function makeLiveRng() {
  return makeRng((Date.now() ^ 0x9e3779b9) >>> 0);
}
