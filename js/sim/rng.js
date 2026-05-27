// js/sim/rng.js — small deterministic PRNG for the shared sim.
//
// The authoritative server seeds one of these per room so a room's randomness
// is reproducible (useful for replays, bug reports, and tests). The client does
// NOT need to reproduce the server's stream — it interpolates server-authored
// entities — so this is purely a server-side determinism aid, not a
// cross-machine "parity" requirement.
//
// mulberry32: fast, tiny, good-enough statistical quality for gameplay RNG.

export function makeRng(seed = 1) {
  let a = seed >>> 0;
  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // Convenience helpers used across sim systems.
  next.range = (min, max) => min + next() * (max - min);
  next.int = (min, max) => Math.floor(next.range(min, max + 1));
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  return next;
}
