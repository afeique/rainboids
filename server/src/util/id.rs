//! Strongly-typed entity ids. All wrap `u64` (or smaller) and are `Copy`.
//!
//! Newtypes prevent confusing a BulletId with an EnemyId at the type level —
//! a class of bug that's tedious to spot in JS.

use std::sync::atomic::{AtomicU64, Ordering};

use serde::{Deserialize, Serialize};

macro_rules! id_type {
    ($name:ident) => {
        #[derive(
            Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord,
        )]
        pub struct $name(pub u64);

        impl $name {
            pub fn new() -> Self {
                static COUNTER: AtomicU64 = AtomicU64::new(1);
                Self(COUNTER.fetch_add(1, Ordering::Relaxed))
            }
        }

        impl Default for $name {
            fn default() -> Self {
                Self::new()
            }
        }

        impl std::fmt::Display for $name {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                write!(f, "{}({})", stringify!($name), self.0)
            }
        }
    };
}

id_type!(PlayerId);
id_type!(RoomId);
id_type!(BulletId);
id_type!(EnemyId);
id_type!(AsteroidId);
id_type!(DropId);
