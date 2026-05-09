//! Seeded PCG64 wrapper. Same algorithm on JS side via `seedrandom` PCG.

use rand::SeedableRng;
use rand_pcg::Pcg64;

pub fn from_seed(seed: u64) -> Pcg64 {
    Pcg64::seed_from_u64(seed)
}
