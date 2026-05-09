#!/usr/bin/env node
//
// Wire-protocol codegen — Rust + JS.
//
// Reads `schema/protocol.toml` (the cross-language single source of truth)
// and emits two parallel modules:
//
//   - `server/src/protocol/generated.rs`     (Rust types, derives,
//                                              tagged-union enums)
//   - `js/sim/protocol-generated.js`         (encoders, decoders, tag
//                                              tables; uses Reader/Writer
//                                              from `./codec.js`)
//
// Both `server/src/protocol/mod.rs` and `js/sim/protocol.js` then
// re-export from their respective generated modules; the schema is the
// only place a new variant needs to land. Adding one becomes a single
// edit to `protocol.toml` followed by `npm run codegen` — name and
// discriminant drift between the schema, Rust, and JS is no longer
// possible.
//
// Usage:
//   node tools/codegen-protocol.mjs            # rewrite both outputs
//   node tools/codegen-protocol.mjs --check    # exit non-zero if either
//                                                output would change
//
// `--check` is the CI gate: the generated files are committed, and CI
// verifies that re-running the codegen produces no diff.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import TOML from '@iarna/toml';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA_PATH = resolve(ROOT, 'schema/protocol.toml');
const RUST_OUT = resolve(ROOT, 'server/src/protocol/generated.rs');
const JS_OUT = resolve(ROOT, 'js/sim/protocol-generated.js');

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

// ─── JS-side codegen ─────────────────────────────────────────────────────────

// snake_case → camelCase. Used for JS object field names (the schema uses
// snake_case to match Rust convention).
function snakeToCamel(s) {
    return s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

// PascalCase → SCREAMING_SNAKE. Used for the C2S/S2C/EVT/ENTITY_REF tag
// tables. e.g. `JoinRoomByCode` → `JOIN_ROOM_BY_CODE`.
function pascalToScreaming(s) {
    return s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
}

// Map a schema type name to (a) the JS reader expression for `r` and (b)
// the JS writer call template for `(w, value)`. Both are returned as
// strings; callers interpolate. The third element is a "needs context"
// flag — true means the writer/reader requires a callback (Option/Vec).
//
// Returns `null` if the type isn't a primitive or known schema type.
function jsCodecFor(type, lookup) {
    type = type.trim();

    // Newtypes: emit the underlying scalar.
    if (lookup.newtypeMap.has(type)) {
        return jsCodecFor(lookup.newtypeMap.get(type), lookup);
    }
    // Plain enums: encoded as `u32` variant tag.
    if (lookup.enumNames.has(type)) {
        return { read: 'r.u32()', write: 'w.u32(##)' };
    }
    // Tagged enum (currently only EntityRef).
    if (lookup.taggedEnumNames.has(type)) {
        return { read: `read${type}(r)`, write: `write${type}(w, ##)` };
    }
    // Struct types.
    if (lookup.structNames.has(type)) {
        return { read: `read${type}(r)`, write: `write${type}(w, ##)` };
    }
    // Tagged-union message types (ClientMsg/ServerMsg/GameEvent).
    if (lookup.messageEnumNames.has(type)) {
        return { read: `read${type}(r)`, write: `write${type}(w, ##)` };
    }
    // Primitive scalars.
    const scalar = SCALAR_JS[type];
    if (scalar) return scalar;

    // Generic: Option<T> / Vec<T>.
    let inner;
    if (type.startsWith('Option<') && type.endsWith('>')) {
        inner = jsCodecFor(type.slice(7, -1), lookup);
        return {
            read: `r.option((rr) => ${inner.read.replace(/\br\./g, 'rr.').replace(/\(r\)/g, '(rr)').replace(/\br\b/g, 'rr')})`,
            write: `w.option(##, (ww, v) => ${inner.write.replace(/##/g, 'v').replace(/\bw\./g, 'ww.').replace(/\(w,/g, '(ww,').replace(/\bw\b/g, 'ww')})`,
        };
    }
    if (type.startsWith('Vec<') && type.endsWith('>')) {
        inner = jsCodecFor(type.slice(4, -1), lookup);
        // Vec<T> uses the helper-form when T is a struct (passes the
        // function reference) or the inline-form for primitives.
        if (inner.read.startsWith('read')) {
            const helper = inner.read.replace(/\(r\)$/, '');
            return {
                read: `r.vec(${helper})`,
                write: `w.vec(##, write${type.slice(4, -1)})`,
            };
        }
        return {
            read: `r.vec((rr) => ${inner.read.replace(/\br\./g, 'rr.').replace(/\br\b/g, 'rr')})`,
            write: `w.vec(##, (ww, v) => ${inner.write.replace(/##/g, 'v').replace(/\bw\./g, 'ww.').replace(/\bw\b/g, 'ww')})`,
        };
    }

    throw new Error(`jsCodecFor: unknown type ${JSON.stringify(type)}`);
}

const SCALAR_JS = {
    bool:   { read: 'r.bool()', write: 'w.bool(##)' },
    u8:     { read: 'r.u8()',   write: 'w.u8(##)'   },
    u16:    { read: 'r.u16()',  write: 'w.u16(##)'  },
    u32:    { read: 'r.u32()',  write: 'w.u32(##)'  },
    u64:    { read: 'r.u64()',  write: 'w.u64(##)'  },
    i8:     { read: 'r.i8()',   write: 'w.i8(##)'   },
    i16:    { read: 'r.i16()',  write: 'w.i16(##)'  },
    i32:    { read: 'r.i32()',  write: 'w.i32(##)'  },
    i64:    { read: 'r.i64()',  write: 'w.i64(##)'  },
    f32:    { read: 'r.f32()',  write: 'w.f32(##)'  },
    f64:    { read: 'r.f64()',  write: 'w.f64(##)'  },
    String: { read: 'r.str()',  write: 'w.str(##)'  },
    Uuid:   { read: 'r.uuid()', write: 'w.uuid(##)' },
};

function buildLookup(schema) {
    const newtypeMap = new Map();
    for (const nt of schema.newtype) newtypeMap.set(nt.name, nt.underlying);

    const enumNames = new Set();
    const taggedEnumNames = new Set();
    for (const en of schema.enum) {
        if (en.tagged) taggedEnumNames.add(en.name);
        else enumNames.add(en.name);
    }
    const structNames = new Set(schema.struct.map((s) => s.name));
    // Tagged-union message enums (ClientMsg, ServerMsg, GameEvent) — these
    // can appear as field types (e.g. `ServerMsg::Event { event: GameEvent }`)
    // and resolve to `write<Name>` / `read<Name>` helpers.
    const messageEnumNames = new Set(['ClientMsg', 'ServerMsg', 'GameEvent']);
    return { newtypeMap, enumNames, taggedEnumNames, structNames, messageEnumNames };
}

function emitJsHeader(e, schema) {
    e.line('// Auto-generated wire protocol — DO NOT EDIT.');
    e.line('//');
    e.line('// Source: `schema/protocol.toml`. To regenerate, run');
    e.line('//   `npm run codegen`         (rewrite both Rust + JS outputs)');
    e.line('//   `npm run codegen:check`   (CI gate — exits non-zero on drift)');
    e.line('//');
    e.line(`// Schema: wire_version=${schema.wire_version}, sim_version=${schema.sim_version}`);
    e.line(`// Codec:  ${schema.codec}`);
    e.line('');
    e.line(`import { Reader, Writer } from './codec.js';`);
    e.line('');
    e.line(`export const WIRE_VERSION = ${schema.wire_version};`);
    e.line(`export const SIM_VERSION = ${schema.sim_version};`);
    e.line('');
}

function emitJsPlainEnum(e, en) {
    e.line(`export const ${en.name} = Object.freeze({`);
    en.variants.forEach((v, i) => {
        e.line(`    ${v}: ${i},`);
    });
    e.line('});');
    e.line('');
}

function emitJsTaggedEnumTable(e, en) {
    // EntityRef → ENTITY_REF table, variant names → SCREAMING_SNAKE.
    const tableName = pascalToScreaming(en.name);
    e.line(`export const ${tableName} = Object.freeze({`);
    en.variants.forEach((v, i) => {
        e.line(`    ${pascalToScreaming(v.name)}: ${i},`);
    });
    e.line('});');
    e.line('');
}

function emitJsTaggedEnumCodec(e, en, lookup) {
    // For EntityRef: tagged enum, every variant has a single id payload.
    // We emit a `kind` + payload-spread codec to keep the API similar to
    // the hand-mirror.
    e.line(`export function write${en.name}(w, e) {`);
    e.line('    w.variant(e.kind);');
    // All variants must have a single tuple field of an id type. Find one to
    // emit the right writer call (they're all u64 newtypes today).
    const sample = en.variants.find((v) => v.fields && v.fields.length > 0);
    if (sample) {
        const codec = jsCodecFor(sample.fields[0].type, lookup);
        e.line(`    ${codec.write.replace(/##/g, 'e.id')};`);
    }
    e.line('}');
    e.line(`export function read${en.name}(r) {`);
    e.line('    const kind = r.variant();');
    if (sample) {
        const codec = jsCodecFor(sample.fields[0].type, lookup);
        e.line(`    const id = ${codec.read};`);
    }
    e.line('    return { kind, id };');
    e.line('}');
    e.line('');
}

function emitJsTagTable(e, name, variants) {
    e.line(`export const ${name} = Object.freeze({`);
    variants.forEach((v, i) => {
        e.line(`    ${pascalToScreaming(v.name)}: ${i},`);
    });
    e.line('});');
    e.line('');
}

function emitJsStructCodec(e, st, lookup) {
    e.line(`export function write${st.name}(w, s) {`);
    for (const f of st.fields) {
        const codec = jsCodecFor(f.type, lookup);
        const jsName = snakeToCamel(f.name);
        e.line(`    ${codec.write.replace(/##/g, `s.${jsName}`)};`);
    }
    e.line('}');
    e.line(`export function read${st.name}(r) {`);
    e.line('    return {');
    for (const f of st.fields) {
        const codec = jsCodecFor(f.type, lookup);
        const jsName = snakeToCamel(f.name);
        e.line(`        ${jsName}: ${codec.read},`);
    }
    e.line('    };');
    e.line('}');
    e.line('');
}

function emitJsMessageCodec(e, name, tagTableName, variants, lookup) {
    e.line(`export function write${name}(w, msg) {`);
    e.line('    switch (msg.type) {');
    for (const v of variants) {
        const tag = `${tagTableName}.${pascalToScreaming(v.name)}`;
        e.line(`        case ${tag}:`);
        e.line(`            w.variant(${tag});`);
        for (const f of v.fields ?? []) {
            const codec = jsCodecFor(f.type, lookup);
            const jsName = snakeToCamel(f.name);
            e.line(`            ${codec.write.replace(/##/g, `msg.${jsName}`)};`);
        }
        e.line('            return;');
    }
    e.line(`        default:`);
    e.line(`            throw new TypeError('write${name}: unknown variant ' + msg.type);`);
    e.line('    }');
    e.line('}');
    e.line('');
    e.line(`export function read${name}(r) {`);
    e.line('    const tag = r.variant();');
    e.line('    switch (tag) {');
    for (const v of variants) {
        const tag = `${tagTableName}.${pascalToScreaming(v.name)}`;
        e.line(`        case ${tag}:`);
        if ((v.fields ?? []).length === 0) {
            e.line(`            return { type: tag };`);
        } else {
            e.line(`            return {`);
            e.line(`                type: tag,`);
            for (const f of v.fields) {
                const codec = jsCodecFor(f.type, lookup);
                const jsName = snakeToCamel(f.name);
                e.line(`                ${jsName}: ${codec.read},`);
            }
            e.line(`            };`);
        }
    }
    e.line(`        default:`);
    e.line(`            throw new TypeError('read${name}: unknown tag ' + tag);`);
    e.line('    }');
    e.line('}');
    e.line('');
}

function emitJsHelpers(e) {
    e.line('// ─── Top-level convenience encoders/decoders ────────────────────');
    e.line('');
    for (const [name, tagTable] of [['ClientMsg', 'C2S'], ['ServerMsg', 'S2C']]) {
        e.line(`export function encode${name}(msg) {`);
        e.line('    const w = new Writer(256);');
        e.line(`    write${name}(w, msg);`);
        e.line('    return w.bytes();');
        e.line('}');
        e.line('');
        e.line(`export function decode${name}(buf) {`);
        e.line('    const view = bufToView(buf);');
        e.line('    const r = new Reader(view);');
        e.line(`    return read${name}(r);`);
        e.line('}');
        e.line('');
        // Suppress unused-tag-table warning; tagTable referenced via switch above.
        void tagTable;
    }
    e.line('function bufToView(buf) {');
    e.line('    if (buf instanceof DataView) return buf;');
    e.line('    if (buf instanceof ArrayBuffer) return new DataView(buf);');
    e.line('    if (ArrayBuffer.isView(buf)) {');
    e.line('        return new DataView(buf.buffer, buf.byteOffset, buf.byteLength);');
    e.line('    }');
    e.line(`    throw new TypeError('decodeXxx: expected ArrayBuffer or TypedArray');`);
    e.line('}');
}

function generateJs(schema) {
    const lookup = buildLookup(schema);
    const e = new Emit();
    emitJsHeader(e, schema);

    e.line('// ─── Plain enums ────────────────────────────────────────────────');
    e.line('');
    for (const en of schema.enum) {
        if (!en.tagged) emitJsPlainEnum(e, en);
    }

    e.line('// ─── Tagged-enum tables (SCREAMING_SNAKE keys) ──────────────────');
    e.line('');
    for (const en of schema.enum) {
        if (en.tagged) emitJsTaggedEnumTable(e, en);
    }
    emitJsTagTable(e, 'C2S', schema.message.client);
    emitJsTagTable(e, 'S2C', schema.message.server);
    emitJsTagTable(e, 'EVT', schema.message.event);

    e.line('// ─── Struct codecs ──────────────────────────────────────────────');
    e.line('');
    for (const st of schema.struct) emitJsStructCodec(e, st, lookup);

    for (const en of schema.enum) {
        if (en.tagged) emitJsTaggedEnumCodec(e, en, lookup);
    }

    e.line('// ─── Message codecs ─────────────────────────────────────────────');
    e.line('');
    emitJsMessageCodec(e, 'GameEvent', 'EVT', schema.message.event, lookup);
    emitJsMessageCodec(e, 'ClientMsg', 'C2S', schema.message.client, lookup);
    emitJsMessageCodec(e, 'ServerMsg', 'S2C', schema.message.server, lookup);

    emitJsHelpers(e);

    return e.text();
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

// Read a file, returning '' if it doesn't exist (so first-run codegen
// can compare against an empty baseline). Trailing whitespace is
// normalized to a single newline so reformatters don't trigger false
// drifts.
function readOrEmpty(path) {
    try {
        return readFileSync(path, 'utf-8').replace(/\s+$/, '') + '\n';
    } catch (e) {
        if (e?.code === 'ENOENT') return '';
        throw e;
    }
}

function main() {
    const schema = TOML.parse(readFileSync(SCHEMA_PATH, 'utf-8'));

    const rustOut = rustfmt(generate(schema));
    const jsOut = generateJs(schema);

    const rustBefore = readOrEmpty(RUST_OUT);
    const jsBefore = readOrEmpty(JS_OUT);
    const rustChanged = rustOut !== rustBefore;
    const jsChanged = jsOut !== jsBefore;

    if (CHECK_ONLY) {
        if (!rustChanged && !jsChanged) {
            console.log('codegen-protocol: up to date');
            return 0;
        }
        console.error('codegen-protocol: DIFFERENCES DETECTED');
        if (rustChanged) console.error(`  ${RUST_OUT}`);
        if (jsChanged) console.error(`  ${JS_OUT}`);
        console.error('Run `node tools/codegen-protocol.mjs` and commit the result.');
        return 1;
    }

    if (rustChanged) {
        writeFileSync(RUST_OUT, rustOut);
        console.log(`codegen-protocol: wrote ${RUST_OUT}`);
    }
    if (jsChanged) {
        writeFileSync(JS_OUT, jsOut);
        console.log(`codegen-protocol: wrote ${JS_OUT}`);
    }
    if (!rustChanged && !jsChanged) {
        console.log('codegen-protocol: up to date');
    }
    return 0;
}

process.exit(main());
