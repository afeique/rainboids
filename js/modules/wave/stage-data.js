// Stage scripts — Galaxian-mode continuous-flow definitions.
//
// Stages run for `duration` ms with continuous formation refill, periodic
// dives, and a steady asteroid stream from the top. Hand-authored timeline
// events (banner, scripted spawns) are still allowed via `events` but
// most stages lean on the continuous parameters.
//
// Schema:
//   duration        — total stage time (ms)
//   formation       — slot grid name
//   pool            — enemy types to spawn (round-robin)
//   refillEvery     — [minMs, maxMs] between continuous spawns into formation
//   diveEvery       — [minMs, maxMs] between dive waves
//   diveCount       — enemies launched per dive
//   asteroidEvery   — [minMs, maxMs] between asteroid spawns
//   asteroidCount   — asteroids per spawn
//   events          — optional one-shot timeline events (banner, etc.)

export const STAGE_DATA = {
    1: {
        name: 'First Contact',
        duration: 60000,
        formation: 'grid_4x2',
        pool: ['HUNTER', 'WASP'],
        refillEvery:  [1800, 3000],
        diveEvery:    [5000, 7500],
        diveCount: 1,
        asteroidEvery:[3000, 4500],
        asteroidCount: 1,
        events: [
            { at: 0, kind: 'banner', title: 'STAGE 1', subtitle: 'FIRST CONTACT', duration: 1500 },
        ],
    },

    2: {
        name: 'Crossfire',
        duration: 65000,
        formation: 'grid_5x2',
        pool: ['HUNTER', 'GUARDIAN', 'STALKER'],
        refillEvery:  [1700, 2800],
        diveEvery:    [4500, 6500],
        diveCount: 1,
        asteroidEvery:[2800, 4200],
        asteroidCount: 1,
        events: [
            { at: 0, kind: 'banner', title: 'STAGE 2', subtitle: 'CROSSFIRE', duration: 1500 },
        ],
    },

    3: {
        name: 'Swarm Protocol',
        duration: 70000,
        formation: 'grid_6x3',
        pool: ['WASP', 'HUNTER', 'DRIFTER'],
        refillEvery:  [1400, 2400],
        diveEvery:    [4000, 5500],
        diveCount: 2,
        asteroidEvery:[2500, 3800],
        asteroidCount: 1,
        events: [
            { at: 0, kind: 'banner', title: 'STAGE 3', subtitle: 'SWARM PROTOCOL', duration: 1500 },
        ],
    },

    4: {
        name: 'Iron Wall',
        duration: 70000,
        formation: 'grid_5x2',
        pool: ['GUARDIAN', 'SENTINEL', 'PROWLER'],
        refillEvery:  [2000, 3200],
        diveEvery:    [5000, 7000],
        diveCount: 1,
        asteroidEvery:[2400, 3500],
        asteroidCount: 2,
        events: [
            { at: 0, kind: 'banner', title: 'STAGE 4', subtitle: 'IRON WALL', duration: 1500 },
        ],
    },

    5: {
        name: 'Spider Web',
        duration: 70000,
        formation: 'chevron_7',
        pool: ['WEAVER', 'STALKER', 'TANGERINE'],
        refillEvery:  [1700, 2700],
        diveEvery:    [4500, 6500],
        diveCount: 2,
        asteroidEvery:[2200, 3200],
        asteroidCount: 1,
        events: [
            { at: 0, kind: 'banner', title: 'STAGE 5', subtitle: 'SPIDER WEB', duration: 1500 },
        ],
    },

    6: {
        name: 'Iron Giant',
        duration: 90000,
        formation: 'chevron_5',
        pool: ['GUARDIAN', 'SENTINEL'],
        refillEvery:  [2200, 3500],
        diveEvery:    [4500, 6000],
        diveCount: 2,
        asteroidEvery:[2000, 3000],
        asteroidCount: 2,
        events: [
            { at: 0,    kind: 'banner', title: 'STAGE 6', subtitle: 'IRON GIANT — BOSS', duration: 1800 },
            { at: 600,  kind: 'spawn',  type: 'TITAN',    count: 1 },
        ],
    },
};

// Procedurally fabricate a stage for stage > 6.
// Loops through the existing 6 with +difficulty (faster cadence, more dives).
export function getProceduralStage(stageNum) {
    const base = STAGE_DATA[((stageNum - 1) % 6) + 1];
    const loop = Math.floor((stageNum - 1) / 6);
    const speed = Math.max(0.55, 1 - loop * 0.10);
    const scaleRange = (range) => [Math.round(range[0] * speed), Math.round(range[1] * speed)];
    return {
        ...base,
        name: `${base.name} +${loop}`,
        refillEvery:  scaleRange(base.refillEvery),
        diveEvery:    scaleRange(base.diveEvery),
        asteroidEvery:scaleRange(base.asteroidEvery),
        diveCount:    base.diveCount + Math.min(loop, 2),
        asteroidCount: base.asteroidCount + Math.min(Math.floor(loop / 2), 2),
        difficulty: 1 + loop * 0.25,
    };
}

export function getStage(stageNum) {
    if (STAGE_DATA[stageNum]) return STAGE_DATA[stageNum];
    return getProceduralStage(stageNum);
}
