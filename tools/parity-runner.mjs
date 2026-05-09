#!/usr/bin/env node
// Parity runner — Ring 1 of the cross-language parity strategy.
//
// Reads a fixture JSON from `schema/snapshots/` (path provided on argv),
// runs the JS sim deterministically over the recorded inputs, and emits
// a canonical-JSON snapshot of the prediction-relevant subset.
//
// The Rust harness in `server/tests/integration_parity.rs` (when it
// exists) does the same on the Rust side and diffs the two.
//
// Fixture JSON shape:
//   {
//     "kind": "rng" | "fxp" | "trig" | "ship",
//     "seed": <u64 string>,                    // only for rng/ship
//     "inputs": [...]                          // only for ship
//     "ops": [...]                             // only for fxp/trig
//     "iters": <number>                        // only for rng
//   }
//
// Output JSON (stdout):
//   { "values": [...] }    // RNG sequence, fxp results, trig results
//   or
//   { "ship": {...} }      // canonicalized ship state

import { readFileSync } from 'node:fs';
import { Pcg64 } from '../js/sim/rng.js';
import {
    Fxp,
    fxpMulRaw,
    FXP_DT_RAW,
    FXP_ONE_RAW,
} from '../js/sim/fxp.js';
import { fxpSin, fxpCos, fxpAtan2 } from '../js/sim/trig.js';

const fixturePath = process.argv[2];
if (!fixturePath) {
    console.error('usage: node tools/parity-runner.mjs <fixture.json>');
    process.exit(2);
}

const fix = JSON.parse(readFileSync(fixturePath, 'utf-8'));

let result;
switch (fix.kind) {
    case 'rng':
        result = runRng(fix);
        break;
    case 'fxp':
        result = runFxp(fix);
        break;
    case 'trig':
        result = runTrig(fix);
        break;
    default:
        console.error(`parity-runner: unknown fixture kind ${fix.kind}`);
        process.exit(2);
}

// Canonical JSON: stable field order, BigInts as decimal strings.
process.stdout.write(canonicalize(result));

function runRng(fix) {
    const seed = BigInt(fix.seed);
    const rng = new Pcg64(seed);
    const out = [];
    for (let i = 0; i < fix.iters; i++) {
        out.push(rng.nextU64().toString());
    }
    return { values: out };
}

function runFxp(fix) {
    const out = [];
    for (const op of fix.ops) {
        switch (op.op) {
            case 'mul': {
                out.push(fxpMulRaw(op.a, op.b));
                break;
            }
            case 'add': {
                out.push((op.a + op.b) | 0);
                break;
            }
            case 'sub': {
                out.push((op.a - op.b) | 0);
                break;
            }
            case 'from_float': {
                out.push(Fxp.fromFloat(op.f).raw);
                break;
            }
            default:
                throw new Error(`fxp op ${op.op}`);
        }
    }
    return { values: out };
}

function runTrig(fix) {
    const out = [];
    for (const op of fix.ops) {
        switch (op.op) {
            case 'sin':
                out.push(fxpSin(op.x).raw);
                break;
            case 'cos':
                out.push(fxpCos(op.x).raw);
                break;
            case 'atan2':
                out.push(fxpAtan2(op.y, op.x).raw);
                break;
            default:
                throw new Error(`trig op ${op.op}`);
        }
    }
    return { values: out };
}

function canonicalize(obj) {
    return (
        JSON.stringify(obj, (k, v) => (typeof v === 'bigint' ? v.toString() : v)) +
        '\n'
    );
}
