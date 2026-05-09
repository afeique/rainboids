// Wire protocol — re-exports from the codegen'd module.
//
// The hand-mirror that used to live here was retired in 5.87.0; the
// authoritative encoder/decoder definitions are in `protocol-generated.js`,
// which is rewritten from `schema/protocol.toml` by
// `tools/codegen-protocol.mjs`. Touching this file by hand instead of the
// schema means the change won't survive the next codegen run.
//
// Adding/changing a wire variant:
//   1. Edit `schema/protocol.toml`.
//   2. Run `npm run codegen` from the project root.
//   3. Commit both the schema change and the regenerated outputs.
//
// `npm run codegen:check` is the CI gate that catches forgotten step 2.

export * from './protocol-generated.js';
