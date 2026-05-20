# Native Port — Language & Engine Comparison — 2026-05-19

The decision record behind porting the **JavaScript single-player game** to a
**native desktop app**. Captures the full language/engine/graphics/performance
analysis and the resulting choice (**Rust + Bevy**). The implementation plan lives
in a separate doc: `Rust + Bevy Port Plan – 2026-05-20.md`.

> **Scope.** Ports **only the JS solo game** (`js/main.js`, `js/modules/*`,
> `css/`, `index.html`). The Rust `sim/` crate and all multiplayer are out of
> scope and not reused.

> **Priorities.** **(1) Best graphics** — the sole justification for a native port
> over the existing Electron wrapper (`electron/` v0.4.1), which already ships the
> web build unchanged. **(2) Easiest to port** — a secondary tiebreaker. A
> previously-considered "native-C/C++ audio+graphics layers" requirement was
> **dropped.**

> Per `CLAUDE.md`, this is a planning document — no `VERSION`/`CHANGELOG`/README
> change.

---

## 1. What we're porting (ground truth)

~55k lines of **plain JavaScript** (0 TypeScript), built on **ES6 classes** (42
modules use classes/inheritance):

| Subsystem | LOC | Web tech | Native need |
|---|---:|---|---|
| `enemy/` | 8,753 | JS classes | logic |
| `combat/` | 6,692 | JS classes | logic |
| `player/` | 5,910 | JS classes | logic |
| `hud/` | 5,758 | DOM + Canvas2D | UI rewrite |
| `ui/` | 5,405 | HTML/CSS/DOM | UI rewrite |
| `world/` | 4,830 | JS + Canvas2D | logic + render |
| `performance/` | 3,108 | WebGL2 | shader port |
| `audio/` | 2,626 | Web Audio | audio rewrite |
| `wave/` | 2,207 | JS | logic |
| `core/` | 2,002 | JS (pools/events/storage) | logic |
| `shop/` | 1,299 | DOM | UI rewrite |
| `render/` | 1,353 | Canvas2D vector paths | render rewrite |

Three load-bearing facts:

1. **GC'd, OOP JavaScript** — 42 class files, free shared-mutable references.
2. **Vector-silhouette identity** — `render/shapes.js` makes **446 Canvas2D
   vector-path calls**; ships/enemies/asteroids are stroked/filled shapes **with
   glow**. Glow *is* the aesthetic.
3. **Not language-bound** — 2D bullet hell with pooling (`core/pool-manager.js`)
   already in place.

---

## 2. Decision criteria & weights

| Criterion | Weight | Why |
|---|---|---|
| Graphics-quality ceiling | 🔴 highest | The only reason to port instead of shipping Electron |
| Port ergonomics (JS → target) | 🟠 high | ~55k lines / 42 GC'd OOP classes |
| Cross-platform desktop | 🟠 high | mac/win/linux; macOS wants **Metal**, not deprecated GL |
| Turnkey engine vs custom renderer | 🟡 medium | Best graphics pushes toward a custom modern-GPU renderer |
| Distribution | 🟡 medium | Polish, not feasibility |
| Raw CPU performance | 🟢 low | Not language-bound (§5) |
| Team familiarity | 🟡 medium | Team knows JS + Rust |

---

## 3. Language comparison (porting GC'd OOP JS)

| Language | JS-port ergonomics | GC | Modern-GPU ceiling | Net |
|---|---|---|---|---|
| **Kotlin** | ★★★★★ classes, coroutines≈async, null-safety | yes | via wgpu4k / LWJGL-Vulkan (build renderer) | easiest port |
| **C#** | ★★★★★ async, properties, LINQ | yes | via **Veldrid / Silk.NET** (build renderer) | easy port + modern GPU |
| **Java** | ★★★★ OOP but verbose; no coroutines/null-safety | yes | via LWJGL-Vulkan | Kotlin strictly better |
| **Rust** | ★★☆☆ no GC; shared-mutable JS → **ECS/ownership re-architecture** | no | **native (wgpu, vello, Bevy)** | hardest port, **top ceiling** |
| **C++** | ★★☆☆ manual memory, UB risk | no | native (Vulkan/Metal) | hard port, no edge over Rust here |

Crux: **GC/OOP languages (Kotlin, C#) make the port near-mechanical**
(class→class); **Rust/C++ make it a re-architecture** — JS aliases mutable state
everywhere, which Rust expresses via ownership + ECS/arena patterns.

Other languages surveyed and rejected (each discards either the modern-GPU ceiling
or the easy port): **Zig** (pre-1.0, smaller ecosystem), **Go** (GC + weak gamedev
graphics), **Odin** (tiny ecosystem), **Nim** (niche), **Swift** (Apple-centric),
**Lua/LÖVE** (dynamic but GL-era), **Jai** (not public).

---

## 4. Engine / GPU-library comparison

The **Modern GPU?** column is decisive for the best-graphics goal.

### Rust
| Engine/lib | Modern GPU? | 2D | Notes |
|---|---|---|---|
| **Bevy** | ✅ wgpu + **built-in HDR bloom**, compute, custom materials | ★★★★☆ | ECS; most batteries for best-graphics 2D |
| custom **wgpu** | ✅ full control | ★★★★★ | most work |
| **ggez** | ✅ wgpu | ★★★★☆ | fewer built-in post-fx |
| **macroquad** | ⚠️ GL-era (miniquad) | ★★★★★ | simplest, lower ceiling |
| **vello** | ✅ best-in-class GPU vector | (vector layer) | pairs with any wgpu host |

### C / C++
| Engine/lib | Modern GPU? | 2D | Notes |
|---|---|---|---|
| **SDL3** (GPU API) | ✅ Vulkan/Metal/D3D12 | ★★★☆ | low-level |
| raw Vulkan/Metal | ✅ | — | max boilerplate; no macOS-portable single API |
| **raylib** / **SFML** | ⚠️ GL-era | ★★★★ | batteries, GL ceiling |
| **Godot** (C++ core) | ✅ Vulkan | ★★★★★ | full editor; scene/node redesign |

### JVM (Kotlin/Java)
| Engine/lib | Modern GPU? | 2D | Notes |
|---|---|---|---|
| **libGDX (+KTX)** | ⚠️ GL-era; **no compute on macOS** | ★★★★★ | mature batteries; SDF + FBO bloom yes, GL-capped |
| **Korge** | ⚠️ GL-era; **native vector API** | ★★★★★ | Canvas2D-equivalent vectors; smaller ecosystem |
| **wgpu4k / LWJGL-Vulkan** | ✅ | (build renderer) | modern ceiling from Kotlin; younger bindings |

### C#
| Engine/lib | Modern GPU? | 2D | Notes |
|---|---|---|---|
| **Veldrid** | ✅ Vulkan/Metal/D3D/GL | (build renderer) | a "wgpu for C#" |
| **Silk.NET** | ✅ Vulkan/Metal + wgpu-native | (build renderer) | comprehensive bindings |
| **MonoGame/FNA** | ⚠️ modern-ish backend, **XNA-era API**, limited compute | ★★★★★ | most-shipped 2D; Native AOT single binary; GL-class ceiling |

---

## 5. Performance analysis — does raw language speed matter? (No.)

From this game's measured budget (`docs/Performance Bottlenecks – 2026-05-06`,
`docs/WebGL Migration Analysis – 2026-05-04`):

**Where the frame goes (late-wave web build):** ~55–75% **rendering** (Canvas2D
draw-call overhead at modest counts: ≤600 particles, 10–20 enemies, ~150 bullets,
~10 asteroids); ~15–25% logic (~235 µs collision, hundreds of µs particles). The
*felt* problem is **jank** — the report blames **GC pauses (major 15–40 ms)**, a
JS-runtime artifact.

**Three separable gains:**
1. **Web → native (any engine): ~80–90% of the headroom.** Canvas2D re-rasterizes
   vector paths on the CPU every frame; any native engine tessellates once → GPU
   instanced draw → near-free. **Architecture win, not a language win** —
   Kotlin/C#/Rust all get it.
2. **GC → no-GC (Rust/C++): zero GC pauses.** Maps onto the felt problem, but
   mitigated (JVM/.NET collectors ≫ V8; the game already pools, ~64 KB/s).
3. **Raw throughput (Rust/C++): smallest.** The logic slice is hundreds of µs; a
   5× speedup is invisible at 60 fps, marginal at 144 Hz.

**Verdict:** raw language speed does **not** justify Rust/C++. Every candidate
clears ≥144 fps at this game's entity counts. So the Rust pick (§7) is
**graphics-driven, not performance-driven**; Rust's zero-GC consistency is a
*feel* bonus at high refresh, not throughput. (All of Kotlin/Java/C# compile too;
Rust merely has the slowest compile times — friction *against* it.)

---

## 6. What "best graphics" requires, and the trilemma

The dominant visual upgrades for a vector + glow bullet hell are **shader/pipeline
techniques**, not engine features:

- **SDF silhouettes** — resolution-independent crisp AA + near-free glow.
- **True HDR bloom** — float (RGBA16F) framebuffer + threshold + blur + additive +
  tonemap (vs the web's per-canvas `shadowBlur` fakery).
- **Linear-space additive blending**; **GPU-compute particles** (10k–100k vs the
  Canvas2D-imposed 600 cap); **vello** for ultimate vector fidelity.

**The catch:** the easy-to-port turnkey engines (**libGDX, Korge, MonoGame**) are
**OpenGL-era** — they do SDF + bloom + instanced particles (a big jump over the
web build) but **cap below** the modern ceiling (little/no compute, none on macOS
where GL is frozen at 4.1; deprecated GL on macOS; no vello). The best graphics
require a **modern GPU API (wgpu/Vulkan/Metal/Veldrid)** where **you build the 2D
renderer yourself.**

**The trilemma — pick two of three:**

| | Best graphics | Easy JS port | Engine batteries |
|---|---|---|---|
| **Rust + Bevy** | ✅ wgpu, built-in HDR bloom, compute, Metal-native | ❌ ECS re-architecture | ✅ |
| **C# + Veldrid / Silk.NET** | ✅ Vulkan/Metal/D3D, compute | ✅ C# ≈ Kotlin | ❌ build renderer |
| **Kotlin + wgpu4k / LWJGL-Vulkan** | ✅ | ✅ closest to JS | ❌ build renderer, young |
| **Kotlin + libGDX (+SDF/bloom)** | ⚠️ ~80% (GL-capped) | ✅ | ✅ |

---

## 7. Decision — **Rust + Bevy**

Given best-graphics is the #1 priority:

- **Top graphics ceiling with the least renderer-building.** Bevy is a wgpu engine
  (Vulkan / **Metal-native** / DX12) with **HDR + bloom built in**, custom shader
  materials (SDF), a render graph for post-processing, **GPU compute** for
  10k–100k particles (`bevy_hanabi`), vello available.
- **No GC** → buttery 120/144/240 Hz frame times (eliminates the V8-GC jank).
- **ECS suits bullet hells** — thousands of homogeneous entities is exactly what
  ECS does best; the port re-architects *toward* a fitting model.
- **Cost:** the hardest port — OOP/GC JS → ECS components+systems is a redesign,
  not a 1:1 translation; Rust has the slowest compile times. This is the price of
  the top of the ceiling, which is the port's reason to exist.

**Fallbacks (in order):**
- **C# + Veldrid** — keeps the modern-GPU ceiling with a far easier GC/OOP port;
  you build the 2D renderer. The switch if the JS→ECS re-architecture proves too
  costly (gated at the Phase-1 vertical slice in the port plan).
- **Kotlin + libGDX + SDF/bloom** — ~80% of the ceiling, easiest path, GL-capped.

**This decision is graphics-driven.** Performance (§5) does not favor Rust; the
graphics ceiling (§6) and zero-GC smoothness do.

---

## 8. Summary

Port the JS solo game; the justification is **best graphics**, which lives on a
modern GPU pipeline the turnkey GL-era engines can't fully reach — forcing a
custom renderer regardless of language, hence a trilemma. **Choose Rust + Bevy**
(top ceiling + batteries; ECS fits a bullet hell) at the cost of the hardest port;
fall back to **C# + Veldrid** if the ECS re-architecture is too costly, or
**Kotlin + libGDX + SDF/bloom** for ~80% of the ceiling at the easiest path.
Implementation: see `Rust + Bevy Port Plan – 2026-05-20.md`.
