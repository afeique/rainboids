//! Bincode encode/decode helpers for ClientMsg / ServerMsg.
//!
//! Bincode 1.x default config is little-endian, varint-free, fixed integer
//! encoding — fine for the v1 wire. The JS decoder mirrors this layout.

use bincode::Options as _;
use serde::{de::DeserializeOwned, Serialize};

use super::{ClientMsg, ServerMsg};

fn opts() -> impl bincode::Options {
    bincode::DefaultOptions::new()
        .with_fixint_encoding()
        .with_little_endian()
}

pub fn encode<T: Serialize>(msg: &T) -> Result<Vec<u8>, bincode::Error> {
    opts().serialize(msg)
}

pub fn encode_into<T: Serialize>(buf: &mut Vec<u8>, msg: &T) -> Result<(), bincode::Error> {
    let bytes = opts().serialize(msg)?;
    buf.clear();
    buf.extend_from_slice(&bytes);
    Ok(())
}

pub fn decode<T: DeserializeOwned>(bytes: &[u8]) -> Result<T, bincode::Error> {
    opts().deserialize(bytes)
}

pub fn encode_server(msg: &ServerMsg) -> Result<Vec<u8>, bincode::Error> {
    encode(msg)
}

pub fn decode_client(bytes: &[u8]) -> Result<ClientMsg, bincode::Error> {
    decode(bytes)
}
