# Build Variety & Anti-Coziness — Motivation Systems

> **Status: PROPOSED / deferred.** Captures the brainstorm of 2026-05-26 on the
> question: *how do we motivate players to keep trying new weapons & attunements
> instead of getting cozy with one build?* Written to be **consistent with** the
> [[Looter-Economy Pivot]] (`docs/LOOTER_ECONOMY_PIVOT.md`) — which already
> chooses **bounties** as the experimentation engine — so this doc *aligns with*
> bounties rather than reinventing them. Sibling: `Roguelike Mode — Design Plan –
> 2026-05-26.md`.

## 1. The problem — why players cozy up

Build inertia is **loss aversion + friction**:

- Mastery of a weapon's *feel* is hard-won; switching means relearning timing.
- An unfamiliar weapon might underperform → risk of a worse/failed run.
- If one build is clearly optimal, switching is irrational.
- **Economy friction (pre-pivot):** when each weapon cost account-gold and gold
  was scarce, the rational move was to buy one or two favorites and never churn.
  100% resell helped mechanically but not psychologically.

**How the looter pivot changes the framing:** unlock-gating is being *removed*
(everything free from the start), which **eliminates the economy-friction cause**
above. That's good — but it does **not** solve coziness. Players will still settle
into a comfortable build out of mastery/risk aversion. So the pivot makes the
*motivation* layer (bounties + the levers below) the load-bearing solution, since
gates are no longer doing any of that work.

## 2. The levers (ranked by fit) — and where each already lives

| Lever | What it does | Status in pivot |
|---|---|---|
| **Randomize the inputs** (Roguelike) | Can't be cozy if you don't choose | New mode (sibling doc) |
| **Bounties** (directed goals) | Reward using specific weapons/elements | **Already chosen** as the engine |
| **Weapon mastery tracks** | Reward *using everything* over time | Net-new, complements bounties |
| **Synergy surfacing** | Show the payoff of mixing | Net-new UI affordance |
| **Freshness/novelty nudge** | Bonus for un-recently-used weapons | Net-new — may be redundant w/ bounties |

The big realization: **two of the strongest levers are already on the roadmap** —
randomization (the Roguelike mode) and directed goals (bounties). The remaining
proposals should *complement* those, not duplicate them.

## 3. Bounties — the primary engine (align, don't reinvent)

The pivot's bounty board (`LOOTER_ECONOMY_PIVOT.md` §8) is exactly the
experimentation engine. Bounty types that drive variety:

- weapon kill counts ("100 kills with Rail Driver")
- element kill counts ("50 kills with a VOLT attunement")
- "win with a power weapon you've never equipped"
- "socket/combine a Matrix," "no-damage stage clear," "reach wave N on HARD+"

**Recommendation:** make *build-variety* a first-class bounty category and ensure
**Roguelike runs credit bounties** (they're an ideal generator — randomization
forces you into weapons you'd never pick, knocking out variety bounties
naturally). This is the cheapest, highest-leverage move because the system is
already being built.

## 4. Weapon mastery tracks (net-new, the long-horizon hook)

Bounties are short-term and rotating; mastery is the **persistent "use
everything" meta-goal** that bounties don't provide.

- Each weapon accrues kills/XP toward **mastery ranks**.
- Mastering a weapon grants a permanent perk (e.g. a free top-tier attunement, a
  small cosmetic, or a flat handling bonus *for that weapon only* — keep it from
  becoming a power-creep treadmill).
- Meta-goal: "Master all 13 primaries / 11 powers / N abilities."
- Synergizes with bounties (bounty kills also feed mastery) and with Roguelike
  (forced-variety runs rack up mastery across the whole arsenal fast).

Keep rewards mostly **cosmetic/QoL**, not raw power, so mastery is a *completion*
hook and doesn't fight the gear treadmill for the "power progression" role.

## 5. Synergy surfacing (cheap UX, high impact)

Players experiment when the game *shows them* the payoff. When a draft/shop offer
would combo with what the player already holds, **label it**:

- `SYNERGY: pairs with your PYRO attunement → DETONATOR chains`
- `SYNERGY: this passive doubles your KILLING_SPREE streak`

Low cost (a tag + a lookup table of known combos), and it directly teaches the
build space — the single best counter to "I don't try X because I don't know what
it does." Useful in **both** Normal (shop/BUILD) and Roguelike (draft).

## 6. Freshness / novelty nudge (optional — watch for redundancy)

Hades-style: a small bonus (account-gold %, or faster bounty/mastery progress)
for running a weapon you **haven't used recently**.

- Pro: gentle pull toward variety without punishing favorites.
- **Caveat:** in a bounty world this risks being *redundant* — a "use weapon X"
  bounty already pays you to do this, more legibly. Recommend **deferring** this
  unless playtests show bounties + mastery aren't enough; if added, make it a
  light flat nudge, never a punishment for using your main.

## 7. Roguelike as a variety engine (cross-ref)

The Roguelike mode (sibling doc) is the **structural** answer: you literally
can't cozy up because you don't choose. But it's **opt-in**, so it only helps
players who pick it — Normal-mode coziness needs §3–§5. The two reinforce each
other: Roguelike *forces* variety; bounties + mastery *reward* it and pull that
habit back into Normal.

> Earlier idea now dead under the pivot: *"Roguelike as a demo engine that funnels
> players to unlock weapons in Normal."* With everything unlocked from the start,
> there's nothing to funnel toward. Roguelike's value is forced variety + a
> clean-slate fair mode, not unlock conversion.

## 8. Recommendation — what to actually build

Answering the original question directly: **the Roguelike mode alone is *not*
enough** (it's opt-in). The real answer is a **trio**, mostly already on the
roadmap:

1. **Bounties** (already chosen) — add an explicit *build-variety* category; make
   **Roguelike credit bounties**. (Do this as part of the pivot.)
2. **Weapon mastery tracks** (net-new) — the persistent "use everything" hook
   bounties don't cover. Keep rewards cosmetic/QoL.
3. **Synergy surfacing** (net-new, cheap) — teach the build space at the point of
   choice, in both modes.

**Defer:** the freshness/novelty nudge (likely redundant with bounties; revisit
only if playtests show a gap).
