#!/usr/bin/env node
//
// Wire-protocol codegen.
//
// Reads `schema/protocol.toml` (the cross-language single source of truth)
// and emits `server/src/protocol/generated.rs`, a Rust module that defines
// every wire-format newtype, enum, struct, and tagged-union message.
//
// `server/src/protocol/mod.rs` then `pub use`s from the generated module
// instead of hand-mirroring the schema. This kills name and discriminant
// drift between the schema and the Rust side: adding a variant means
// editing the schema, running this codegen, and committing the diff.
//
// JS-side codegen (`js/sim/protocol-generated.js`) is a follow-up; this
// pass keeps scope tight to the Rust side.
//
// Usage:
//   node tools/codegen-protocol.mjs            # rewrite generated.rs
//   node tools/codegen-protocol.mjs --check    # exit non-zero if rewrite would diff
//
// The `--check` mode is for CI: we commit the generated file, and CI
// verifies that re-running the codegen produces no change.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import TOML from '@iarna/toml';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA_PATH = resolve(ROOT, 'schema/protocol.toml');
const RUST_OUT = resolve(ROOT, 'server/src/protocol/generated.rs');

const args = new Set(process.argv.slice(2));
const CHECK_ONLY = args.has('--check');

// ─── Type translation ────────────────────────────────────────────────────────
//
// Map schema type names → Rust type names. Newtypes are aliased to the
// Rust types defined in `crate::util::id::*` (u64 wrappers) plus the
// PowerupId newtype defined in this module.

const SCALAR_RUST = {
    bool: 'bool',
    u8: 'u8', u16: 'u16', u32: 'u32', u64: 'u64',
    i8: 'i8', i16: 'i16', i32: 'i32', i64: 'i64',
    f32: 'f32', f64: 'f64',
    String: 'String',
    Uuid: 'Uuid',
};

// Newtypes that already exist in `crate::util::id`. We re-export rather
// than re-define them.
const ID_TYPES_FROM_UTIL = new Set([
    'PlayerId', 'RoomId', 'BulletId', 'EnemyId', 'AsteroidId', 'DropId',
]);

function translateType(t) {
    // Strip whitespace.
    t = t.trim();
    if (SCALAR_RUST[t]) return SCALAR_RUST[t];
    if (t.startsWith('Option<') && t.endsWith('>')) {
        return `Option<${translateType(t.slice(7, -1))}>`;
    }
    if (t.startsWith('Vec<') && t.endsWith('>')) {
        return `Vec<${translateType(t.slice(4, -1))}>`;
    }
    // Otherwise it's a schema-declared type name (newtype, enum, struct).
    // Render it bare; the generated module brings them all into scope.
    return t;
}

// ─── Code emission ───────────────────────────────────────────────────────────

class Emit {
    constructor() { this.lines = []; }
    line(s = '') { this.lines.push(s); }
    block(open, close, body) {
        this.line(open);
        body();
        this.line(close);
    }
    text() { return this.lines.join('\n') + '\n'; }
}

function emitHeader(e, schema) {
    e.line('//! Auto-generated wire protocol — DO NOT EDIT.');
    e.line('//!');
    e.line('//! Source: `schema/protocol.toml`. To regenerate, run');
    e.line('//! `node tools/codegen-protocol.mjs` from the project root.');
    e.line('//! `node tools/codegen-protocol.mjs --check` is the CI gate.');
    e.line('//!');
    e.line(`//! Schema: wire_version=${schema.wire_version}, sim_version=${schema.sim_version}`);
    e.line(`//! Codec:  ${schema.codec}`);
    e.line('');
    e.line('#![allow(clippy::enum_variant_names)]');
    e.line('');
    e.line('use serde::{Deserialize, Serialize};');
    e.line('use uuid::Uuid;');
    e.line('');
    e.line('pub use crate::util::id::{');
    e.line('    AsteroidId, BulletId, DropId, EnemyId, PlayerId, RoomId,');
    e.line('};');
    e.line('');
    e.line(`pub const WIRE_VERSION: u16 = ${schema.wire_version};`);
    e.line(`pub const SIM_VERSION: u16 = ${schema.sim_version};`);
    e.line('');
    e.line('pub fn is_compatible(wire: u16, sim: u16) -> bool {');
    e.line('    wire == WIRE_VERSION && sim == SIM_VERSION');
    e.line('}');
    e.line('');
}

function emitNewtype(e, nt) {
    if (ID_TYPES_FROM_UTIL.has(nt.name)) return; // re-exported above
    const ru = translateType(nt.underlying);
    e.line(`#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq, Hash)]`);
    e.line(`pub struct ${nt.name}(pub ${ru});`);
    e.line('');
}

function emitPlainEnum(e, en) {
    e.line('#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]');
    e.block(`pub enum ${en.name} {`, '}', () => {
        for (const v of en.variants) {
            e.line(`    ${v},`);
        }
    });
    e.line('');
}

function emitTaggedEnum(e, en) {
    e.line('#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]');
    e.block(`pub enum ${en.name} {`, '}', () => {
        for (const v of en.variants) {
            // Tuple variant if the field name is a numeric index ("0", "1");
            // otherwise struct variant.
            const tuple = v.fields && v.fields.length > 0 && v.fields.every(f => /^\d+$/.test(f.name));
            if (tuple) {
                const types = v.fields.map(f => translateType(f.type)).join(', ');
                e.line(`    ${v.name}(${types}),`);
            } else if (v.fields && v.fields.length > 0) {
                e.line(`    ${v.name} {`);
                for (const f of v.fields) {
                    e.line(`        ${f.name}: ${translateType(f.type)},`);
                }
                e.line('    },');
            } else {
                e.line(`    ${v.name},`);
            }
        }
    });
    e.line('');
}

function structIsCopy(struct) {
    // Heuristic: Copy if every field is a scalar/copyable type.
    // Vec<T> and String are not Copy; everything else in the schema is.
    return struct.fields.every(f =>
        !f.type.startsWith('Vec<') &&
        !f.type.includes('String') &&
        !f.type.includes('Uuid') // Uuid is Copy actually, but the macro is conservative
    );
}

function emitStruct(e, st) {
    const copy = structIsCopy(st);
    const derives = copy
        ? '#[derive(Serialize, Deserialize, Debug, Clone, Copy)]'
        : '#[derive(Serialize, Deserialize, Debug, Clone)]';
    e.line(derives);
    e.block(`pub struct ${st.name} {`, '}', () => {
        for (const f of st.fields) {
            e.line(`    pub ${f.name}: ${translateType(f.type)},`);
        }
    });
    e.line('');
}

function emitMessageEnum(e, name, variants) {
    e.line('#[derive(Serialize, Deserialize, Debug, Clone)]');
    e.block(`pub enum ${name} {`, '}', () => {
        for (const v of variants) {
            const fields = v.fields ?? [];
            if (fields.length === 0) {
                e.line(`    ${v.name},`);
            } else {
                e.line(`    ${v.name} {`);
                for (const f of fields) {
                    e.line(`        ${f.name}: ${translateType(f.type)},`);
                }
                e.line('    },');
            }
        }
    });
    e.line('');
}

// ─── Driver ──────────────────────────────────────────────────────────────────

function generate(schema) {
    const e = new Emit();
    emitHeader(e, schema);

    // 1. Newtypes (PowerupId only — the rest re-export from util::id).
    e.line('// ─── Newtypes ───────────────────────────────────────────────────');
    e.line('');
    for (const nt of schema.newtype) emitNewtype(e, nt);

    // 2. Plain enums + tagged enum (EntityRef).
    e.line('// ─── Enums ──────────────────────────────────────────────────────');
    e.line('');
    for (const en of schema.enum) {
        if (en.tagged) emitTaggedEnum(e, en);
        else emitPlainEnum(e, en);
    }

    // 3. Structs.
    e.line('// ─── Structs ────────────────────────────────────────────────────');
    e.line('');
    for (const st of schema.struct) emitStruct(e, st);

    // 4. Message enums (ClientMsg, ServerMsg, GameEvent).
    e.line('// ─── Tagged-union messages ──────────────────────────────────────');
    e.line('');
    emitMessageEnum(e, 'ClientMsg', schema.message.client);
    emitMessageEnum(e, 'ServerMsg', schema.message.server);
    emitMessageEnum(e, 'GameEvent', schema.message.event);

    return e.text();
}

function rustfmt(src) {
    // Use rustfmt if available; otherwise leave as-is. The hand-mirror was
    // already idiomatically formatted, and our emitter aims for that style.
    try {
        return execSync('rustfmt --edition 2021 --emit stdout', {
            input: src,
            stdio: ['pipe', 'pipe', 'pipe'],
        }).toString();
    } catch {
        return src;
    }
}

function main() {
    const schema = TOML.parse(readFileSync(SCHEMA_PATH, 'utf-8'));
    let out = generate(schema);
    out = rustfmt(out);

    const before = readFileSync(RUST_OUT, 'utf-8').replace(/\s+$/, '') + '\n';
    if (out === before) {
        if (CHECK_ONLY) console.log('codegen-protocol: up to date');
        return 0;
    }

    if (CHECK_ONLY) {
        console.error('codegen-protocol: DIFFERENCES DETECTED');
        console.error(`  ${RUST_OUT}`);
        console.error('Run `node tools/codegen-protocol.mjs` and commit the result.');
        return 1;
    }

    writeFileSync(RUST_OUT, out);
    console.log(`codegen-protocol: wrote ${RUST_OUT}`);
    return 0;
}

// `before = readFileSync(...)` will throw if the file doesn't exist; on the
// initial run we want to write it.
function safeMain() {
    try {
        process.exit(main());
    } catch (e) {
        if (e?.code === 'ENOENT' && !CHECK_ONLY) {
            // File doesn't exist yet; just write it.
            const schema = TOML.parse(readFileSync(SCHEMA_PATH, 'utf-8'));
            const out = rustfmt(generate(schema));
            writeFileSync(RUST_OUT, out);
            console.log(`codegen-protocol: created ${RUST_OUT}`);
            process.exit(0);
        }
        throw e;
    }
}

safeMain();
