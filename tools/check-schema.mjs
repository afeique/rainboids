#!/usr/bin/env node
// Name-level parity checker (Ring 2, v1).
//
// Asserts that every variant in `schema/protocol.toml` exists in:
//   - `server/src/protocol/mod.rs` (Rust enum variants)
//   - `js/sim/protocol.js`         (C2S/S2C/EVT tag tables and writeXxx switches)
//
// This catches "I added a Rust variant and forgot to update JS" without
// any byte-level checking. Byte-level alignment is the parity-runner's
// job (see `tools/parity-runner.mjs`).
//
// Run via: `node tools/check-schema.mjs`. Non-zero exit on mismatch.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA_PATH = resolve(ROOT, 'schema/protocol.toml');
// Both sides are now codegen'd from `schema/protocol.toml`. The Rust
// types live in `server/src/protocol/generated.rs` (5.85.0); the JS
// codecs live in `js/sim/protocol-generated.js` (5.87.0). This checker
// reads the generated files rather than the re-export shims (`mod.rs` /
// `protocol.js`) so it stays a useful safety net if the codegen is buggy
// or a generated file is committed out of sync.
const RUST_PROTOCOL_PATH = resolve(ROOT, 'server/src/protocol/generated.rs');
const JS_PROTOCOL_PATH = resolve(ROOT, 'js/sim/protocol-generated.js');

const issues = [];
const note = (s) => issues.push(s);

const schema = parseSchemaToml(readFileSync(SCHEMA_PATH, 'utf-8'));
const rustSrc = readFileSync(RUST_PROTOCOL_PATH, 'utf-8');
const jsSrc = readFileSync(JS_PROTOCOL_PATH, 'utf-8');

// Wire/sim version match.
const rustWire = parseRustU16(rustSrc, 'WIRE_VERSION');
const rustSim = parseRustU16(rustSrc, 'SIM_VERSION');
if (schema.wire_version !== rustWire) {
    note(`wire_version: schema=${schema.wire_version} ≠ rust=${rustWire}`);
}
if (schema.sim_version !== rustSim) {
    note(`sim_version: schema=${schema.sim_version} ≠ rust=${rustSim}`);
}
// JS WIRE_VERSION lives in version.js, not protocol.js — separate check.
const versionJsSrc = readFileSync(resolve(ROOT, 'js/sim/version.js'), 'utf-8');
const jsWire = (versionJsSrc.match(/WIRE_VERSION\s*=\s*(\d+)/) || [])[1];
const jsSim = (versionJsSrc.match(/SIM_VERSION\s*=\s*(\d+)/) || [])[1];
if (Number(jsWire) !== schema.wire_version) {
    note(`wire_version: schema=${schema.wire_version} ≠ js=${jsWire}`);
}
if (Number(jsSim) !== schema.sim_version) {
    note(`sim_version: schema=${schema.sim_version} ≠ js=${jsSim}`);
}

// Variant lists in the three places.
checkVariants('ClientMsg', schema.client_msgs, rustEnumVariants(rustSrc, 'ClientMsg'), jsTagKeys(jsSrc, 'C2S'));
checkVariants('ServerMsg', schema.server_msgs, rustEnumVariants(rustSrc, 'ServerMsg'), jsTagKeys(jsSrc, 'S2C'));
checkVariants('GameEvent', schema.events,    rustEnumVariants(rustSrc, 'GameEvent'), jsTagKeys(jsSrc, 'EVT'));

if (issues.length) {
    console.error('schema parity: FAIL');
    for (const i of issues) console.error('  -', i);
    process.exit(1);
}
console.log('schema parity: OK');
console.log(`  client msgs: ${schema.client_msgs.length}`);
console.log(`  server msgs: ${schema.server_msgs.length}`);
console.log(`  events:      ${schema.events.length}`);

/* ─── helpers ─────────────────────────────────────────────────────────── */

function parseSchemaToml(toml) {
    // Lightweight, hand-rolled TOML parser scoped to what protocol.toml
    // actually uses: top-level scalars and `[[message.client]]` /
    // `[[message.server]]` / `[[message.event]]` array-of-tables that
    // each have a `name = "Foo"` field.
    const out = {
        wire_version: 0,
        sim_version: 0,
        client_msgs: [],
        server_msgs: [],
        events: [],
    };
    const lines = toml.split('\n');
    let section = null;
    let current = null;
    for (const raw of lines) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        const aoTable = line.match(/^\[\[(.+)\]\]\s*$/);
        if (aoTable) {
            current = { _section: aoTable[1] };
            section = aoTable[1];
            if (section === 'message.client') out.client_msgs.push(current);
            else if (section === 'message.server') out.server_msgs.push(current);
            else if (section === 'message.event') out.events.push(current);
            continue;
        }
        const table = line.match(/^\[(.+)\]\s*$/);
        if (table) {
            section = table[1];
            current = null;
            continue;
        }
        const kv = line.match(/^([a-zA-Z_]+)\s*=\s*(.+)$/);
        if (!kv) continue;
        const [, k, v] = kv;
        if (current) {
            current[k] = stripQuotes(v);
        } else if (section === null) {
            // top-level scalars
            if (k === 'wire_version') out.wire_version = Number(v);
            else if (k === 'sim_version') out.sim_version = Number(v);
        }
    }
    return out;
}

function stripQuotes(s) {
    s = s.trim();
    if (s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1);
    return s;
}

function rustEnumVariants(src, enumName) {
    // Find `pub enum <name> { … }` and return the variant identifiers.
    const re = new RegExp(`pub\\s+enum\\s+${enumName}\\s*\\{([\\s\\S]*?)\\n\\}`);
    const m = src.match(re);
    if (!m) return [];
    const body = m[1];
    const out = [];
    // Match `Identifier` at the start of a logical line (allowing
    // for `Identifier {` struct-style or `Identifier(…)` tuple-style or
    // bare `Identifier,`).
    const variantRe = /^\s*([A-Z][A-Za-z0-9_]*)\s*(?:\{|\(|,)/gm;
    for (const vm of body.matchAll(variantRe)) out.push(vm[1]);
    return out;
}

function parseRustU16(src, name) {
    const m = src.match(new RegExp(`${name}\\s*:\\s*u16\\s*=\\s*(\\d+)`));
    return m ? Number(m[1]) : null;
}

function parseJsConst(src, name) {
    const m = src.match(new RegExp(`${name}\\s*=\\s*(\\d+)`));
    return m ? Number(m[1]) : null;
}

function jsTagKeys(src, tableName) {
    // Parse `export const <name> = Object.freeze({ KEY: N, ... });`
    const re = new RegExp(`export const ${tableName} = Object\\.freeze\\(\\{([\\s\\S]*?)\\}\\);`);
    const m = src.match(re);
    if (!m) return [];
    const body = m[1];
    const out = [];
    for (const km of body.matchAll(/\b([A-Z][A-Z0-9_]*)\s*:/g)) out.push(km[1]);
    return out;
}

function checkVariants(label, schemaList, rustList, jsList) {
    const schemaNames = schemaList.map((m) => m.name);
    const jsNamesNormalized = new Set(jsList.map(snakeUpperToCamel));

    for (const name of schemaNames) {
        if (!rustList.includes(name)) {
            note(`${label}: variant ${name} present in schema, missing in Rust`);
        }
        if (!jsNamesNormalized.has(name)) {
            note(`${label}: variant ${name} present in schema, missing in JS (${snakeFor(name)})`);
        }
    }
    for (const name of rustList) {
        if (!schemaNames.includes(name)) {
            note(`${label}: variant ${name} present in Rust, missing in schema`);
        }
    }
    for (const upper of jsList) {
        const camel = snakeUpperToCamel(upper);
        if (!schemaNames.includes(camel)) {
            note(`${label}: JS tag ${upper} (=${camel}) missing in schema`);
        }
    }
}

function snakeUpperToCamel(s) {
    return s
        .toLowerCase()
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join('');
}

function snakeFor(camel) {
    return camel.replace(/([A-Z])/g, (m, c, i) => (i === 0 ? c : '_' + c)).toUpperCase();
}
