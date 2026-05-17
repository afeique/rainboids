//! Golden byte vectors for the v1 wire protocol.
//!
//! These tests pin down the *exact* bytes the server emits for representative
//! `ClientMsg` / `ServerMsg` shapes. The JS client codec (`js/net/codec.js`)
//! has matching round-trip tests; both sides must agree on every byte or
//! the handshake fails.
//!
//! See `docs/Multiplayer Wire Format – 2026-05-09.md` for the human-readable
//! spec these vectors implement.

use rainboids_server::protocol::{
    codec, ClientMsg, ErrCode, ServerMsg, SIM_VERSION, WIRE_VERSION,
};
use uuid::Uuid;

fn hex(bytes: &[u8]) -> String {
    bytes
        .iter()
        .map(|b| format!("{:02x}", b))
        .collect::<Vec<_>>()
        .join(" ")
}

#[test]
fn hello_no_session_golden() {
    let msg = ClientMsg::Hello {
        wire_version: WIRE_VERSION,
        sim_version: SIM_VERSION,
        client_version: "5.81.1".into(),
        display_name: "Pilot".into(),
        session: None,
    };

    // Layout (36 bytes):
    //   tag                  : 00 00 00 00          (Hello = variant 0)
    //   wire_version u16 LE  : 01 00
    //   sim_version  u16 LE  : 01 00
    //   client_version len   : 06 00 00 00 00 00 00 00
    //   "5.81.1"             : 35 2e 38 31 2e 31
    //   display_name len     : 05 00 00 00 00 00 00 00
    //   "Pilot"              : 50 69 6c 6f 74
    //   session = None       : 00
    let want: &[u8] = &[
        0x00, 0x00, 0x00, 0x00, // tag
        0x01, 0x00, // wire_version
        0x01, 0x00, // sim_version
        0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // client_version len = 6
        0x35, 0x2e, 0x38, 0x31, 0x2e, 0x31, // "5.81.1"
        0x05, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // display_name len = 5
        0x50, 0x69, 0x6c, 0x6f, 0x74, // "Pilot"
        0x00, // session None
    ];

    let got = codec::encode(&msg).unwrap();
    assert_eq!(
        got,
        want,
        "Hello golden mismatch.\n  got:  {}\n  want: {}",
        hex(&got),
        hex(want)
    );
    assert_eq!(got.len(), 36);
}

#[test]
fn hello_with_session_golden() {
    let session = Uuid::from_bytes([
        0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f,
        0x10,
    ]);
    let msg = ClientMsg::Hello {
        wire_version: WIRE_VERSION,
        sim_version: SIM_VERSION,
        client_version: "5.81.1".into(),
        display_name: "Pilot".into(),
        session: Some(session),
    };

    // Same as no-session up to the session field, then:
    //   session = Some : 01
    //   uuid len u64   : 10 00 00 00 00 00 00 00
    //   uuid bytes     : 01 02 ... 0f 10
    let mut want = vec![
        0x00, 0x00, 0x00, 0x00, // tag
        0x01, 0x00, 0x01, 0x00, // wire/sim version
        0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // client_version len
        0x35, 0x2e, 0x38, 0x31, 0x2e, 0x31, // "5.81.1"
        0x05, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // display_name len
        0x50, 0x69, 0x6c, 0x6f, 0x74, // "Pilot"
        0x01, // session Some
        0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // uuid byte-length 16
    ];
    want.extend_from_slice(&[
        0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f,
        0x10,
    ]);

    let got = codec::encode(&msg).unwrap();
    assert_eq!(
        got, want,
        "Hello-with-session golden mismatch.\n  got:  {}\n  want: {}",
        hex(&got), hex(&want)
    );
    assert_eq!(got.len(), 35 + 1 + 8 + 16);
}

#[test]
fn welcome_golden() {
    use rainboids_server::util::id::PlayerId;
    let player_id = PlayerId(42);
    let session = Uuid::from_bytes([
        0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f,
        0x10,
    ]);
    let msg = ServerMsg::Welcome {
        player_id,
        session,
        server_t_ms: 0x0102030405060708,
    };

    // Layout (44 bytes):
    //   tag                : 00 00 00 00
    //   player_id u64 LE   : 2a 00 00 00 00 00 00 00
    //   uuid byte-length   : 10 00 00 00 00 00 00 00
    //   uuid bytes         : 01..10
    //   server_t_ms u64 LE : 08 07 06 05 04 03 02 01
    let want: &[u8] = &[
        0x00, 0x00, 0x00, 0x00, // tag = Welcome
        0x2a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // player_id = 42
        0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // uuid len = 16
        0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, // uuid hi
        0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10, // uuid lo
        0x08, 0x07, 0x06, 0x05, 0x04, 0x03, 0x02, 0x01, // server_t_ms LE
    ];

    let got = codec::encode(&msg).unwrap();
    assert_eq!(
        got, want,
        "Welcome golden mismatch.\n  got:  {}\n  want: {}",
        hex(&got), hex(want)
    );
    assert_eq!(got.len(), 44);

    let back: ServerMsg = codec::decode(&got).unwrap();
    match back {
        ServerMsg::Welcome { player_id: pid, session: s, server_t_ms } => {
            assert_eq!(pid, player_id);
            assert_eq!(s, session);
            assert_eq!(server_t_ms, 0x0102030405060708);
        }
        other => panic!("expected Welcome, got {:?}", other),
    }
}

#[test]
fn version_error_golden() {
    let msg = ServerMsg::Error {
        code: ErrCode::Version,
        msg: "server v1/1".into(),
    };

    // Layout (27 bytes):
    //   tag = Error  : 01 00 00 00
    //   ErrCode = 0  : 00 00 00 00
    //   msg len      : 0b 00 00 00 00 00 00 00
    //   "server v1/1": 73 65 72 76 65 72 20 76 31 2f 31
    let want: &[u8] = &[
        0x01, 0x00, 0x00, 0x00, // tag
        0x00, 0x00, 0x00, 0x00, // ErrCode::Version
        0x0b, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // msg len = 11
        b's', b'e', b'r', b'v', b'e', b'r', b' ', b'v', b'1', b'/', b'1',
    ];

    let got = codec::encode(&msg).unwrap();
    assert_eq!(
        got, want,
        "Error golden mismatch.\n  got:  {}\n  want: {}",
        hex(&got), hex(want)
    );
}

#[test]
fn quick_match_unit_variant_golden() {
    let msg = ClientMsg::QuickMatch;
    // Unit variant: just the 4-byte enum tag.
    let want: &[u8] = &[0x01, 0x00, 0x00, 0x00];
    let got = codec::encode(&msg).unwrap();
    assert_eq!(got, want);
    assert_eq!(got.len(), 4);
}

#[test]
fn input_packed_golden() {
    use rainboids_server::protocol::PackedInput;
    let msg = ClientMsg::Input {
        tick: 0x12345678,
        packed: PackedInput {
            move_x: 100,
            move_y: -50,
            aim_x: 16384,
            aim_y: -16384,
            buttons: 0b0000_0011, // shoot + dash
        },
    };
    // Layout (15 bytes):
    //   tag = Input (variant 7) : 07 00 00 00
    //   tick u32 LE             : 78 56 34 12
    //   move_x i8               : 64
    //   move_y i8               : ce  (256 - 50 = 206 = 0xce, two's complement)
    //   aim_x i16 LE            : 00 40
    //   aim_y i16 LE            : 00 c0  (-16384 = 0xc000)
    //   buttons u8              : 03
    let want: &[u8] = &[
        0x07, 0x00, 0x00, 0x00, //
        0x78, 0x56, 0x34, 0x12, //
        0x64, 0xce, //
        0x00, 0x40, //
        0x00, 0xc0, //
        0x03,
    ];
    let got = codec::encode(&msg).unwrap();
    assert_eq!(
        got, want,
        "Input golden mismatch.\n  got:  {}\n  want: {}",
        hex(&got), hex(want)
    );
}
