//! Fixed-point math, 16 fractional bits over i32. ~15µm precision over a
//! 32k-meter playfield.
//!
//! Stub for now: ship physics still uses f32 in this scaffold. Replaced when
//! we port `simulateTick` from JS and need cross-language bit-determinism
//! for the prediction-relevant subset (see weeks 7–9 in the plan doc).

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Fxp(pub i32);

const FRAC_BITS: u32 = 16;
const ONE: i32 = 1 << FRAC_BITS;

impl Fxp {
    pub const ZERO: Fxp = Fxp(0);
    pub const ONE: Fxp = Fxp(ONE);

    pub fn from_f32(v: f32) -> Self {
        Fxp((v * ONE as f32) as i32)
    }
    pub fn to_f32(self) -> f32 {
        self.0 as f32 / ONE as f32
    }
}

impl std::ops::Add for Fxp {
    type Output = Self;
    fn add(self, rhs: Self) -> Self {
        Fxp(self.0 + rhs.0)
    }
}
impl std::ops::Sub for Fxp {
    type Output = Self;
    fn sub(self, rhs: Self) -> Self {
        Fxp(self.0 - rhs.0)
    }
}
impl std::ops::Mul for Fxp {
    type Output = Self;
    fn mul(self, rhs: Self) -> Self {
        Fxp(((self.0 as i64 * rhs.0 as i64) >> FRAC_BITS) as i32)
    }
}
