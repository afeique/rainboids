// Wave configuration data for enemy and asteroid spawning
import { GAME_CONFIG } from '../core/constants.js';
//
// ACT I   (waves   1–15)  — First Contact: solo enemy introductions
// ACT II  (waves  16–30)  — Escalation: themed duo encounters
// ACT III (waves  31–50)  — The Gauntlet: synergistic trios
// ACT IV  (waves  51–75)  — War Zone: quad+ combos, specialty waves
// ACT V   (waves 76–100)  — Endgame: full-spectrum chaos
// BEYOND  (waves 101+)    — Procedurally scaled from wave 100

export const WAVE_DATA = {

    // ═══════════════════════════════════════════════════════════════════════
    // ACT I — FIRST CONTACT  (waves 1–15)
    // Solo introductions. High asteroid count, few enemies. Learn each foe.
    // ═══════════════════════════════════════════════════════════════════════

    // Wave 1: First Contact — frenetic intro (bullet-hell pass)
    1:  { asteroids: 6, enemies: [{ type: 'HUNTER', count: 3 }] },

    // Wave 2: Scout Pack — pressure the player into the shop early
    2:  { asteroids: 8, enemies: [{ type: 'HUNTER', count: 4 }] },

    // Wave 3: Hunting Pack — learn to juggle threats
    3:  { asteroids: 8, enemies: [{ type: 'HUNTER', count: 5 }] },

    // Wave 4: Wall of Green — meet the tank
    4:  { asteroids: 8, enemies: [{ type: 'GUARDIAN', count: 3 }] },

    // Wave 5: Fortress — spread shot pressure
    5:  { asteroids: 9, enemies: [{ type: 'GUARDIAN', count: 4 }] },

    // Wave 6: Yellow Peril — fast and frantic
    6:  { asteroids: 9, enemies: [{ type: 'WASP', count: 4 }] },

    // Wave 7: Swarm — bullet hell intro
    7:  { asteroids: 9, enemies: [{ type: 'WASP', count: 5 }] },

    // Wave 8: Ambush — laser sniper
    8:  { asteroids: 10, enemies: [{ type: 'STALKER', count: 3 }] },

    // Wave 9: Crossfire — multiple laser angles
    9:  { asteroids: 10, enemies: [{ type: 'STALKER', count: 4 }] },

    // Wave 10: Lightning Storm — arc lightning intro
    10: { asteroids: 10, enemies: [{ type: 'DRIFTER', count: 3 }] },

    // Wave 11: Drift Zone — unpredictable movement
    11: { asteroids: 11, enemies: [{ type: 'DRIFTER', count: 4 }] },

    // Wave 12: Missile Lock — ranged missiles
    12: { asteroids: 10, enemies: [{ type: 'PROWLER', count: 3 }] },

    // Wave 13: Web Spinner — spiral laser patterns
    13: { asteroids: 11, enemies: [{ type: 'WEAVER', count: 3 }] },

    // Wave 14: Shield Wall — defensive enemies
    14: { asteroids: 11, enemies: [{ type: 'SENTINEL', count: 3 }] },

    // Wave 15: Minefield — mine layer intro
    15: { asteroids: 10, enemies: [{ type: 'TANGERINE', count: 3 }] },

    // ═══════════════════════════════════════════════════════════════════════
    // ACT II — ESCALATION  (waves 16–30)
    // Themed duo encounters. Enemy synergies begin.
    // ═══════════════════════════════════════════════════════════════════════

    // Wave 16: Iron Giant — first TITAN encounter (solo boss)
    16: { asteroids: 4, enemies: [{ type: 'TITAN', count: 1 }] },

    // Wave 17: Red & Green — agile hunters + tanky guardians
    17: { asteroids: 5, enemies: [{ type: 'HUNTER', count: 3 }, { type: 'GUARDIAN', count: 2 }] },

    // Wave 18: Sting & Snap — speed duo
    18: { asteroids: 6, enemies: [{ type: 'WASP', count: 3 }, { type: 'HUNTER', count: 2 }] },

    // Wave 19: Heavy Guard — double defense
    19: { asteroids: 4, enemies: [{ type: 'GUARDIAN', count: 2 }, { type: 'SENTINEL', count: 2 }] },

    // Wave 20: Sniper Alley — long range pressure
    20: { asteroids: 3, enemies: [{ type: 'STALKER', count: 3 }, { type: 'PROWLER', count: 2 }] },

    // Wave 21: Electric Slide — area denial combo
    21: { asteroids: 5, enemies: [{ type: 'DRIFTER', count: 2 }, { type: 'WEAVER', count: 2 }] },

    // Wave 22: Chaos Theory — unpredictable swarm
    22: { asteroids: 4, enemies: [{ type: 'WASP', count: 3 }, { type: 'DRIFTER', count: 2 }] },

    // Wave 23: Bomb Squad — mines + chasers
    23: { asteroids: 4, enemies: [{ type: 'TANGERINE', count: 2 }, { type: 'HUNTER', count: 3 }] },

    // Wave 24: Titan's Guard — boss with bodyguards
    24: { asteroids: 2, enemies: [{ type: 'TITAN', count: 1 }, { type: 'GUARDIAN', count: 3 }] },

    // Wave 25: Asteroid Storm — breather, asteroid-heavy
    25: { asteroids: 10, enemies: [{ type: 'HUNTER', count: 1 }, { type: 'WASP', count: 1 }] },

    // Wave 26: Pincer Attack — flanking lasers
    26: { asteroids: 3, enemies: [{ type: 'STALKER', count: 3 }, { type: 'DRIFTER', count: 2 }] },

    // Wave 27: Missile Storm — projectile rain
    27: { asteroids: 3, enemies: [{ type: 'PROWLER', count: 3 }, { type: 'HUNTER', count: 2 }] },

    // Wave 28: Hive Mind — swarm with shield support
    28: { asteroids: 4, enemies: [{ type: 'WASP', count: 4 }, { type: 'SENTINEL', count: 1 }] },

    // Wave 29: Scorched Earth — mines + lasers
    29: { asteroids: 3, enemies: [{ type: 'TANGERINE', count: 2 }, { type: 'STALKER', count: 2 }] },

    // Wave 30: Double Trouble — two bosses
    30: { asteroids: 2, enemies: [{ type: 'TITAN', count: 2 }] },

    // ═══════════════════════════════════════════════════════════════════════
    // ACT III — THE GAUNTLET  (waves 31–50)
    // Synergistic trios. Each wave is a coordinated tactical challenge.
    // ═══════════════════════════════════════════════════════════════════════

    // Wave 31: War Party — classic assault trio
    31: { asteroids: 3, enemies: [{ type: 'HUNTER', count: 2 }, { type: 'GUARDIAN', count: 2 }, { type: 'WASP', count: 2 }] },

    // Wave 32: Lightning Brigade — electric + laser assault
    32: { asteroids: 3, enemies: [{ type: 'DRIFTER', count: 2 }, { type: 'STALKER', count: 2 }, { type: 'HUNTER', count: 2 }] },

    // Wave 33: Fortress Siege — max defensive wall
    33: { asteroids: 2, enemies: [{ type: 'GUARDIAN', count: 2 }, { type: 'SENTINEL', count: 2 }, { type: 'PROWLER', count: 2 }] },

    // Wave 34: Speed Demons — all-fast enemies
    34: { asteroids: 4, enemies: [{ type: 'WASP', count: 3 }, { type: 'HUNTER', count: 2 }, { type: 'WEAVER', count: 2 }] },

    // Wave 35: Trap Master — zone control + ranged fire
    35: { asteroids: 2, enemies: [{ type: 'TANGERINE', count: 2 }, { type: 'PROWLER', count: 2 }, { type: 'STALKER', count: 2 }] },

    // Wave 36: Asteroid Gauntlet — dense field, must fight through
    36: { asteroids: 8, enemies: [{ type: 'HUNTER', count: 2 }, { type: 'WASP', count: 2 }] },

    // Wave 37: Iron Curtain — wall of defense + boss
    37: { asteroids: 2, enemies: [{ type: 'GUARDIAN', count: 2 }, { type: 'SENTINEL', count: 2 }, { type: 'TITAN', count: 1 }] },

    // Wave 38: Spider's Web — pattern maze
    38: { asteroids: 3, enemies: [{ type: 'WEAVER', count: 2 }, { type: 'PROWLER', count: 2 }, { type: 'DRIFTER', count: 2 }] },

    // Wave 39: Fire & Ice — mixed range engagements
    39: { asteroids: 3, enemies: [{ type: 'HUNTER', count: 2 }, { type: 'STALKER', count: 2 }, { type: 'TANGERINE', count: 2 }] },

    // Wave 40: Titan's Revenge — double boss, reinforced
    40: { asteroids: 1, enemies: [{ type: 'TITAN', count: 2 }, { type: 'GUARDIAN', count: 2 }] },

    // Wave 41: Wasp Nest — mega swarm, shielded
    41: { asteroids: 2, enemies: [{ type: 'WASP', count: 5 }, { type: 'SENTINEL', count: 2 }] },

    // Wave 42: Sniper Elite — pure precision threats
    42: { asteroids: 2, enemies: [{ type: 'STALKER', count: 3 }, { type: 'PROWLER', count: 2 }, { type: 'DRIFTER', count: 1 }] },

    // Wave 43: Clockwork — spinning death patterns
    43: { asteroids: 3, enemies: [{ type: 'WEAVER', count: 2 }, { type: 'SENTINEL', count: 2 }, { type: 'WASP', count: 2 }] },

    // Wave 44: Demolition — explosive chaos
    44: { asteroids: 2, enemies: [{ type: 'TANGERINE', count: 3 }, { type: 'HUNTER', count: 2 }, { type: 'DRIFTER', count: 2 }] },

    // Wave 45: The Colosseum — arena battle
    45: { asteroids: 1, enemies: [{ type: 'TITAN', count: 2 }, { type: 'STALKER', count: 2 }, { type: 'HUNTER', count: 2 }] },

    // Wave 46: Cosmic Storm — environmental chaos
    46: { asteroids: 7, enemies: [{ type: 'DRIFTER', count: 2 }, { type: 'WEAVER', count: 2 }] },

    // Wave 47: Shield Breakers — impenetrable defense
    47: { asteroids: 2, enemies: [{ type: 'SENTINEL', count: 2 }, { type: 'GUARDIAN', count: 2 }, { type: 'PROWLER', count: 2 }] },

    // Wave 48: Blitz — speed rush
    48: { asteroids: 3, enemies: [{ type: 'HUNTER', count: 3 }, { type: 'WASP', count: 3 }, { type: 'STALKER', count: 1 }] },

    // Wave 49: Minesweeper — zone lockdown
    49: { asteroids: 1, enemies: [{ type: 'TANGERINE', count: 3 }, { type: 'PROWLER', count: 2 }, { type: 'SENTINEL', count: 2 }] },

    // Wave 50: Half Century — boss milestone
    50: { asteroids: 2, enemies: [{ type: 'TITAN', count: 2 }, { type: 'TANGERINE', count: 2 }, { type: 'STALKER', count: 2 }] },

    // ═══════════════════════════════════════════════════════════════════════
    // ACT IV — WAR ZONE  (waves 51–75)
    // Quad+ combos. Specialty waves. Serious coordination required.
    // ═══════════════════════════════════════════════════════════════════════

    // Wave 51: All-Star — one of every basic type
    51: { asteroids: 3, enemies: [{ type: 'HUNTER', count: 1 }, { type: 'GUARDIAN', count: 1 }, { type: 'WASP', count: 1 }, { type: 'STALKER', count: 1 }, { type: 'DRIFTER', count: 1 }] },

    // Wave 52: Artillery Line — ranged wall of fire
    52: { asteroids: 2, enemies: [{ type: 'PROWLER', count: 3 }, { type: 'STALKER', count: 2 }, { type: 'DRIFTER', count: 2 }, { type: 'SENTINEL', count: 1 }] },

    // Wave 53: Swarm Lord — numbers overwhelm
    53: { asteroids: 2, enemies: [{ type: 'WASP', count: 4 }, { type: 'WEAVER', count: 2 }, { type: 'HUNTER', count: 2 }, { type: 'TANGERINE', count: 1 }] },

    // Wave 54: Twin Titans — boss fortress
    54: { asteroids: 1, enemies: [{ type: 'TITAN', count: 2 }, { type: 'SENTINEL', count: 2 }, { type: 'GUARDIAN', count: 2 }] },

    // Wave 55: Bullet Hell — pattern overload
    55: { asteroids: 2, enemies: [{ type: 'WEAVER', count: 2 }, { type: 'WASP', count: 2 }, { type: 'DRIFTER', count: 2 }, { type: 'HUNTER', count: 2 }] },

    // Wave 56: Asteroid Belt — dense field + snipers
    56: { asteroids: 8, enemies: [{ type: 'STALKER', count: 2 }, { type: 'PROWLER', count: 2 }] },

    // Wave 57: Dark Swarm — overwhelming assault wave
    57: { asteroids: 2, enemies: [{ type: 'HUNTER', count: 3 }, { type: 'WASP', count: 3 }, { type: 'TANGERINE', count: 2 }, { type: 'PROWLER', count: 1 }] },

    // Wave 58: Siege Engines — fortified positions
    58: { asteroids: 1, enemies: [{ type: 'GUARDIAN', count: 2 }, { type: 'PROWLER', count: 2 }, { type: 'SENTINEL', count: 2 }, { type: 'TANGERINE', count: 2 }] },

    // Wave 59: Electric Storm — all-energy assault
    59: { asteroids: 3, enemies: [{ type: 'DRIFTER', count: 3 }, { type: 'WEAVER', count: 2 }, { type: 'STALKER', count: 2 }, { type: 'WASP', count: 1 }] },

    // Wave 60: Titan Strike — triple boss
    60: { asteroids: 1, enemies: [{ type: 'TITAN', count: 3 }, { type: 'HUNTER', count: 2 }] },

    // Wave 61: Needle Rain — precision pattern assault
    61: { asteroids: 2, enemies: [{ type: 'STALKER', count: 2 }, { type: 'WEAVER', count: 2 }, { type: 'SENTINEL', count: 2 }, { type: 'WASP', count: 2 }] },

    // Wave 62: Frontline — full combined arms
    62: { asteroids: 3, enemies: [{ type: 'HUNTER', count: 2 }, { type: 'GUARDIAN', count: 2 }, { type: 'TANGERINE', count: 2 }, { type: 'PROWLER', count: 2 }] },

    // Wave 63: The Web — spiral nightmare
    63: { asteroids: 1, enemies: [{ type: 'WEAVER', count: 3 }, { type: 'DRIFTER', count: 2 }, { type: 'SENTINEL', count: 2 }, { type: 'TITAN', count: 1 }] },

    // Wave 64: Asteroid Rush — rock storm breather
    64: { asteroids: 10, enemies: [{ type: 'WASP', count: 2 }, { type: 'HUNTER', count: 2 }] },

    // Wave 65: Death Blossom — area denial supreme
    65: { asteroids: 2, enemies: [{ type: 'WEAVER', count: 2 }, { type: 'STALKER', count: 2 }, { type: 'TANGERINE', count: 2 }, { type: 'SENTINEL', count: 2 }] },

    // Wave 66: Wolfpack — coordinated hunt squad
    66: { asteroids: 2, enemies: [{ type: 'HUNTER', count: 4 }, { type: 'WASP', count: 2 }, { type: 'STALKER', count: 2 }, { type: 'DRIFTER', count: 1 }] },

    // Wave 67: Iron Maiden — impenetrable defense
    67: { asteroids: 1, enemies: [{ type: 'GUARDIAN', count: 2 }, { type: 'SENTINEL', count: 2 }, { type: 'PROWLER', count: 2 }, { type: 'TITAN', count: 2 }] },

    // Wave 68: Chaos Wave — maximum unpredictability
    68: { asteroids: 3, enemies: [{ type: 'DRIFTER', count: 2 }, { type: 'TANGERINE', count: 2 }, { type: 'WASP', count: 2 }, { type: 'WEAVER', count: 2 }] },

    // Wave 69: Sniper Nest — long range barrage
    69: { asteroids: 2, enemies: [{ type: 'STALKER', count: 3 }, { type: 'PROWLER', count: 3 }, { type: 'DRIFTER', count: 2 }] },

    // Wave 70: Apocalypse — everything thrown at once
    70: { asteroids: 2, enemies: [{ type: 'TITAN', count: 2 }, { type: 'TANGERINE', count: 2 }, { type: 'SENTINEL', count: 2 }, { type: 'HUNTER', count: 2 }] },

    // Wave 71: Drone Swarm — numbers overwhelm
    71: { asteroids: 3, enemies: [{ type: 'WASP', count: 5 }, { type: 'HUNTER', count: 3 }, { type: 'SENTINEL', count: 1 }] },

    // Wave 72: Ghost Fleet — elusive enemies
    72: { asteroids: 2, enemies: [{ type: 'DRIFTER', count: 2 }, { type: 'WEAVER', count: 2 }, { type: 'STALKER', count: 2 }, { type: 'PROWLER', count: 2 }] },

    // Wave 73: Scorched Earth — mine + lightning + spin
    73: { asteroids: 1, enemies: [{ type: 'TANGERINE', count: 3 }, { type: 'DRIFTER', count: 2 }, { type: 'WEAVER', count: 2 }, { type: 'STALKER', count: 2 }] },

    // Wave 74: Guardian Angels — max defense wall
    74: { asteroids: 2, enemies: [{ type: 'GUARDIAN', count: 3 }, { type: 'SENTINEL', count: 2 }, { type: 'PROWLER', count: 2 }, { type: 'TITAN', count: 1 }] },

    // Wave 75: Three Kings — triple boss fortified
    75: { asteroids: 1, enemies: [{ type: 'TITAN', count: 3 }, { type: 'GUARDIAN', count: 2 }, { type: 'SENTINEL', count: 2 }] },

    // ═══════════════════════════════════════════════════════════════════════
    // ACT V — ENDGAME  (waves 76–100)
    // Full-spectrum chaos. Every wave is a final exam.
    // ═══════════════════════════════════════════════════════════════════════

    // Wave 76: Bullet Storm — pattern mastery test
    76: { asteroids: 2, enemies: [{ type: 'WASP', count: 3 }, { type: 'WEAVER', count: 2 }, { type: 'HUNTER', count: 2 }, { type: 'STALKER', count: 2 }, { type: 'DRIFTER', count: 1 }] },

    // Wave 77: Minefield Marathon — zone control nightmare
    77: { asteroids: 1, enemies: [{ type: 'TANGERINE', count: 3 }, { type: 'PROWLER', count: 2 }, { type: 'SENTINEL', count: 2 }, { type: 'HUNTER', count: 2 }, { type: 'TITAN', count: 1 }] },

    // Wave 78: Asteroid Armada — dense field + bosses
    78: { asteroids: 8, enemies: [{ type: 'GUARDIAN', count: 2 }, { type: 'TITAN', count: 2 }] },

    // Wave 79: Full Spectrum — every enemy type at once
    79: { asteroids: 2, enemies: [
        { type: 'HUNTER', count: 1 }, { type: 'GUARDIAN', count: 1 }, { type: 'WASP', count: 1 },
        { type: 'STALKER', count: 1 }, { type: 'DRIFTER', count: 1 }, { type: 'PROWLER', count: 1 },
        { type: 'WEAVER', count: 1 }, { type: 'SENTINEL', count: 1 }, { type: 'TANGERINE', count: 1 },
        { type: 'TITAN', count: 1 }
    ] },

    // Wave 80: Quad Titan — four bosses
    80: { asteroids: 1, enemies: [{ type: 'TITAN', count: 4 }, { type: 'GUARDIAN', count: 2 }] },

    // Wave 81: Electric Avenue — all-energy chaos
    81: { asteroids: 2, enemies: [{ type: 'DRIFTER', count: 3 }, { type: 'WEAVER', count: 3 }, { type: 'STALKER', count: 2 }, { type: 'WASP', count: 2 }] },

    // Wave 82: Pincer Command — tactical multi-front assault
    82: { asteroids: 2, enemies: [{ type: 'HUNTER', count: 3 }, { type: 'STALKER', count: 2 }, { type: 'PROWLER', count: 2 }, { type: 'TANGERINE', count: 2 }, { type: 'SENTINEL', count: 1 }] },

    // Wave 83: Fortress Maximus — ultimate defensive formation
    83: { asteroids: 1, enemies: [{ type: 'GUARDIAN', count: 3 }, { type: 'SENTINEL', count: 3 }, { type: 'PROWLER', count: 2 }, { type: 'TITAN', count: 2 }] },

    // Wave 84: Speed Blitz — overwhelming velocity
    84: { asteroids: 3, enemies: [{ type: 'WASP', count: 4 }, { type: 'HUNTER', count: 3 }, { type: 'DRIFTER', count: 2 }, { type: 'WEAVER', count: 1 }] },

    // Wave 85: Apocalypse Now — total war
    85: { asteroids: 1, enemies: [{ type: 'TITAN', count: 2 }, { type: 'TANGERINE', count: 2 }, { type: 'STALKER', count: 2 }, { type: 'PROWLER', count: 2 }, { type: 'SENTINEL', count: 2 }] },

    // Wave 86: Asteroid Apocalypse — maximum rocks + hunters
    86: { asteroids: 12, enemies: [{ type: 'HUNTER', count: 2 }, { type: 'DRIFTER', count: 2 }] },

    // Wave 87: Combined Arms — every basic type doubled
    87: { asteroids: 2, enemies: [{ type: 'HUNTER', count: 2 }, { type: 'GUARDIAN', count: 2 }, { type: 'WASP', count: 2 }, { type: 'STALKER', count: 2 }, { type: 'DRIFTER', count: 2 }] },

    // Wave 88: Missile Crisis — projectile hell
    88: { asteroids: 1, enemies: [{ type: 'PROWLER', count: 4 }, { type: 'TANGERINE', count: 3 }, { type: 'SENTINEL', count: 2 }, { type: 'TITAN', count: 1 }] },

    // Wave 89: Lightning Gods — energy overload
    89: { asteroids: 2, enemies: [{ type: 'DRIFTER', count: 4 }, { type: 'STALKER', count: 3 }, { type: 'WEAVER', count: 2 }, { type: 'TITAN', count: 1 }] },

    // Wave 90: Final Exam — endurance test, all types
    90: { asteroids: 1, enemies: [
        { type: 'HUNTER', count: 1 }, { type: 'GUARDIAN', count: 1 }, { type: 'WASP', count: 2 },
        { type: 'STALKER', count: 1 }, { type: 'DRIFTER', count: 1 }, { type: 'PROWLER', count: 1 },
        { type: 'WEAVER', count: 1 }, { type: 'SENTINEL', count: 1 }, { type: 'TANGERINE', count: 1 },
        { type: 'TITAN', count: 2 }
    ] },

    // Wave 91: Swarm King — maximum swarm
    91: { asteroids: 2, enemies: [{ type: 'WASP', count: 6 }, { type: 'HUNTER', count: 3 }, { type: 'WEAVER', count: 2 }, { type: 'SENTINEL', count: 1 }] },

    // Wave 92: Siege of Ages — impenetrable fortress
    92: { asteroids: 1, enemies: [{ type: 'GUARDIAN', count: 3 }, { type: 'SENTINEL', count: 2 }, { type: 'PROWLER', count: 3 }, { type: 'TANGERINE', count: 2 }, { type: 'TITAN', count: 1 }] },

    // Wave 93: Dance of Death — pattern ballet
    93: { asteroids: 2, enemies: [{ type: 'WEAVER', count: 3 }, { type: 'DRIFTER', count: 3 }, { type: 'STALKER', count: 2 }, { type: 'WASP', count: 2 }] },

    // Wave 94: Titan's Wrath — boss rush
    94: { asteroids: 1, enemies: [{ type: 'TITAN', count: 4 }, { type: 'HUNTER', count: 3 }, { type: 'WASP', count: 2 }] },

    // Wave 95: No Man's Land — total zone denial
    95: { asteroids: 1, enemies: [{ type: 'TANGERINE', count: 3 }, { type: 'PROWLER', count: 3 }, { type: 'STALKER', count: 2 }, { type: 'SENTINEL', count: 2 }, { type: 'DRIFTER', count: 1 }] },

    // Wave 96: Ragnarok — total fortress war
    96: { asteroids: 2, enemies: [{ type: 'TITAN', count: 2 }, { type: 'GUARDIAN', count: 2 }, { type: 'SENTINEL', count: 2 }, { type: 'TANGERINE', count: 2 }, { type: 'PROWLER', count: 2 }] },

    // Wave 97: Final Wave Alpha — speed + precision
    97: { asteroids: 1, enemies: [{ type: 'HUNTER', count: 3 }, { type: 'WASP', count: 3 }, { type: 'STALKER', count: 3 }, { type: 'DRIFTER', count: 2 }, { type: 'TITAN', count: 1 }] },

    // Wave 98: Final Wave Beta — defense + area denial
    98: { asteroids: 1, enemies: [{ type: 'GUARDIAN', count: 3 }, { type: 'SENTINEL', count: 3 }, { type: 'PROWLER', count: 3 }, { type: 'WEAVER', count: 2 }, { type: 'TITAN', count: 1 }] },

    // Wave 99: Final Wave Omega — full arsenal, every type
    99: { asteroids: 2, enemies: [
        { type: 'HUNTER', count: 2 }, { type: 'GUARDIAN', count: 1 }, { type: 'WASP', count: 2 },
        { type: 'STALKER', count: 1 }, { type: 'DRIFTER', count: 1 }, { type: 'PROWLER', count: 1 },
        { type: 'WEAVER', count: 1 }, { type: 'SENTINEL', count: 1 }, { type: 'TANGERINE', count: 1 },
        { type: 'TITAN', count: 2 }
    ] },

    // Wave 100: THE LAST STAND — five titans with bodyguards
    100: { asteroids: 2, enemies: [{ type: 'TITAN', count: 5 }, { type: 'GUARDIAN', count: 3 }, { type: 'SENTINEL', count: 3 }] },
};

const _waveCache = new Map();

// Helper function to get wave configuration
export function getWaveConfig(waveNumber) {
    // For waves beyond 100, scale from wave 100 base
    if (waveNumber > 100) {
        if (_waveCache.has(waveNumber)) return _waveCache.get(waveNumber);
        const baseWave = WAVE_DATA[100];
        const scaleFactor = 1 + ((waveNumber - 100) * 0.1); // 10% increase per wave beyond 100

        const config = {
            // Hard cap: never exceed MAX_WAVE_ASTEROIDS regardless of scaling
            asteroids: Math.min(
                Math.floor(baseWave.asteroids * scaleFactor),
                GAME_CONFIG.MAX_WAVE_ASTEROIDS
            ),
            enemies: baseWave.enemies.map(enemy => ({
                type: enemy.type,
                count: Math.floor(enemy.count * scaleFactor)
            }))
        };
        _waveCache.set(waveNumber, config);
        return config;
    }

    return WAVE_DATA[waveNumber] || WAVE_DATA[1]; // Fallback to wave 1 if not found
}

// Helper function to calculate enemy level based on wave.
// Bumped to every 3 waves for the bullet-hell pacing — difficulty
// climbs faster so the player has to engage with the shop early.
export function getEnemyLevel(waveNumber) {
    return Math.floor(waveNumber / 3) + 1;
}

// Helper function to calculate asteroid level based on wave
export function getAsteroidLevel(waveNumber) {
    return Math.floor(waveNumber / 4) + 1; // Level increases every 4 waves
}

// ── Wave Subtitles ──────────────────────────────────────────────────────
// Pithy one-liners displayed during wave transitions.
export const WAVE_SUBTITLES = {
    1:  "Don't worry, they die easy.",
    2:  "Okay maybe worry a little.",
    3:  "They brought friends.",
    4:  "These ones are chonky.",
    5:  "The green means GO AWAY.",
    6:  "Fast and angry. Like bees. Space bees.",
    7:  "Bzz bzz bzz bzz.",
    8:  "They have LASERS now?!",
    9:  "Laser tag, but unfair.",
    10: "Shocking, really.",
    11: "They float weird and it's unsettling.",
    12: "Missile lock! ...that's bad, right?",
    13: "Webs. In space. Sure, why not.",
    14: "Shields up! ...theirs, not yours.",
    15: "Watch your step. Or your float.",
    16: "He's a big boy.",
    17: "Red vs Green. You vs both.",
    18: "Speed and spite in equal measure.",
    19: "Double the shields, double the pain.",
    20: "Stay out of the crosshairs.",
    21: "Invisible AND angry. Great.",
    22: "Dodge THIS.",
    23: "They learned teamwork. Rude.",
    24: "More mines than a Minecraft server.",
    25: "Halfway to glory. Or doom.",
    26: "They're evolving. You're sweating.",
    27: "The welcoming committee got bigger.",
    28: "Not a great time to sneeze.",
    29: "They're just showing off now.",
    30: "Boss rush, baby!",
    31: "Welcome to the gauntlet.",
    32: "Three flavors of pain.",
    33: "This is fine. Everything is fine.",
    34: "Your shield called in sick today.",
    35: "Asteroids are the LEAST of your problems.",
    36: "Skill issue incoming.",
    37: "The difficulty curve just went vertical.",
    38: "Brought a ship to a knife fight.",
    39: "It's not a party without explosions.",
    40: "Round number! Celebrate by not dying.",
    41: "Past the point of no return.",
    42: "The answer to everything is MORE BULLETS.",
    43: "They're not even trying to be fair.",
    44: "Duck, weave, and pray.",
    45: "The math is not in your favor.",
    46: "Panic is an acceptable strategy.",
    47: "Survival is a strong word.",
    48: "Almost to the war zone!",
    49: "One more and it gets REALLY bad.",
    50: "Welcome to the war zone.",
};

// Generic subtitles for waves beyond 50
export const WAVE_SUBTITLES_GENERIC = [
    "Good luck. You'll need it.",
    "Still alive? Impressive.",
    "They keep coming!",
    "This is getting ridiculous.",
    "You're built different.",
    "No one said this would be easy.",
    "Just another day at the office.",
    "More enemies, more problems.",
    "Are you even blinking?",
    "Legend says no one survives this.",
    "Your keyboard is begging for mercy.",
    "Error 404: Easy mode not found.",
    "Respawn? Never heard of it.",
    "They're REALLY mad now.",
    "Insert coin to continue. Oh wait.",
];

// Helper function to get level-scaled enemy stats.
// Steeper bullet-hell ramp: 25% HP and 15% speed per level so the
// player can't coast on raw weapon stats — they have to invest in
// upgrades to keep up.
export function getLevelScaledEnemyStats(baseStats, level) {
    return {
        health: Math.floor(baseStats.health * (1 + (level - 1) * 0.25)),
        speed: baseStats.speed * (1 + (level - 1) * 0.15),
        size: baseStats.size,
        shootRate: baseStats.shootRate,
        points: Math.floor(baseStats.points * (1 + (level - 1) * 0.2)),
    };
}

// Helper function to get level-scaled asteroid stats
export function getLevelScaledAsteroidStats(baseHealth, level) {
    return Math.floor(baseHealth * (1 + (level - 1) * 0.3)); // 30% more HP per level
}
