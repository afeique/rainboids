// Wave configuration data for enemy and asteroid spawning
import { GAME_CONFIG } from './constants.js';
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

    // Wave 1: Asteroid Field — pure shooting tutorial, no enemies
    1:  { asteroids: 8, enemies: [] },

    // Wave 2: Scout — single hunter amid asteroids
    2:  { asteroids: 6, enemies: [{ type: 'HUNTER', count: 1 }] },

    // Wave 3: Hunting Pack — learn to juggle threats
    3:  { asteroids: 6, enemies: [{ type: 'HUNTER', count: 2 }] },

    // Wave 4: Wall of Green — meet the tank
    4:  { asteroids: 8, enemies: [{ type: 'GUARDIAN', count: 2 }] },

    // Wave 5: Fortress — spread shot pressure
    5:  { asteroids: 6, enemies: [{ type: 'GUARDIAN', count: 3 }] },

    // Wave 6: Yellow Peril — fast and frantic
    6:  { asteroids: 8, enemies: [{ type: 'WASP', count: 2 }] },

    // Wave 7: Swarm — bullet hell intro
    7:  { asteroids: 6, enemies: [{ type: 'WASP', count: 4 }] },

    // Wave 8: Ambush — laser sniper
    8:  { asteroids: 6, enemies: [{ type: 'STALKER', count: 2 }] },

    // Wave 9: Crossfire — multiple laser angles
    9:  { asteroids: 5, enemies: [{ type: 'STALKER', count: 3 }] },

    // Wave 10: Lightning Storm — arc lightning intro
    10: { asteroids: 6, enemies: [{ type: 'DRIFTER', count: 2 }] },

    // Wave 11: Drift Zone — unpredictable movement
    11: { asteroids: 5, enemies: [{ type: 'DRIFTER', count: 3 }] },

    // Wave 12: Missile Lock — ranged missiles
    12: { asteroids: 5, enemies: [{ type: 'PROWLER', count: 2 }] },

    // Wave 13: Web Spinner — spiral laser patterns
    13: { asteroids: 5, enemies: [{ type: 'WEAVER', count: 2 }] },

    // Wave 14: Shield Wall — defensive enemies
    14: { asteroids: 5, enemies: [{ type: 'SENTINEL', count: 2 }] },

    // Wave 15: Minefield — mine layer intro
    15: { asteroids: 4, enemies: [{ type: 'TANGERINE', count: 2 }] },

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

// Helper function to calculate enemy level based on wave
export function getEnemyLevel(waveNumber) {
    return Math.floor(waveNumber / 5) + 1; // Level increases every 5 waves — gentle curve
}

// Helper function to calculate asteroid level based on wave
export function getAsteroidLevel(waveNumber) {
    return Math.floor(waveNumber / 4) + 1; // Level increases every 4 waves
}

// Helper function to get level-scaled enemy stats
export function getLevelScaledEnemyStats(baseStats, level) {
    return {
        health: Math.floor(baseStats.health * (1 + (level - 1) * 0.2)), // 20% more HP per level
        speed: baseStats.speed * (1 + (level - 1) * 0.1), // 10% faster per level
        size: baseStats.size, // Size stays the same
        shootRate: baseStats.shootRate, // Shoot rate stays the same
        points: Math.floor(baseStats.points * (1 + (level - 1) * 0.2)) // 20% more points per level
    };
}

// Helper function to get level-scaled asteroid stats
export function getLevelScaledAsteroidStats(baseHealth, level) {
    return Math.floor(baseHealth * (1 + (level - 1) * 0.3)); // 30% more HP per level
}
