// Spawn paths — Galaxian-mode top-down trajectories.
//
// Each enemy is assigned a path on spawn. The path function is called per
// frame from `Enemy.updateMovement` (when `this.galaxianPath` is set) and
// writes the velocity needed to follow the trajectory toward the bottom
// edge. Paths always make southward progress; they exit off the bottom.
//
// Each path carries small per-enemy state on the enemy itself (`pathT`,
// `pathStartX`, `pathStartTime`, etc.) so the function is stateless.

const PATHS = {
    // Straight line south. Slight horizontal hold.
    straight(enemy) {
        enemy.vel.x *= 0.85;
        enemy.vel.y = enemy.galaxianPath.speed;
    },

    // Sine wave — drifts side to side as it descends.
    sine(enemy, now) {
        const elapsed = now - enemy.pathStartTime;
        const amp = enemy.galaxianPath.amp ?? 90;
        const freq = enemy.galaxianPath.freq ?? 0.0022;
        const dx = Math.cos(elapsed * freq) * amp * freq;
        enemy.vel.x = dx * 16; // tuned so x oscillates within ±amp
        enemy.vel.y = enemy.galaxianPath.speed;
    },

    // Diagonal — straight line angled left or right, exits opposite-side bottom.
    diagonal(enemy) {
        const dir = enemy.galaxianPath.dir ?? 1;
        enemy.vel.x = dir * enemy.galaxianPath.speed * 0.55;
        enemy.vel.y = enemy.galaxianPath.speed;
    },

    // Zigzag — sharp horizontal flips at fixed intervals.
    zigzag(enemy, now) {
        const elapsed = now - enemy.pathStartTime;
        const period = enemy.galaxianPath.period ?? 700;
        const phase = Math.floor(elapsed / period) % 2 === 0 ? 1 : -1;
        enemy.vel.x = phase * enemy.galaxianPath.speed * 0.7;
        enemy.vel.y = enemy.galaxianPath.speed;
    },

    // Swoop — enters from a top corner, arcs toward the opposite side.
    swoop(enemy, now, gameField) {
        const elapsed = now - enemy.pathStartTime;
        const T = enemy.galaxianPath.duration ?? 4500;
        const t = Math.min(1, elapsed / T);
        const dir = enemy.galaxianPath.dir ?? 1;
        // Curve x toward opposite edge over t, y always advances.
        const w = gameField ? gameField.width : 1280;
        const targetX = enemy.pathStartX + dir * w * 0.6;
        const desiredX = enemy.pathStartX + (targetX - enemy.pathStartX) * (t * t);
        const dx = desiredX - enemy.x;
        enemy.vel.x = enemy.vel.x * 0.6 + dx * 0.06;
        enemy.vel.y = enemy.galaxianPath.speed;
    },

    // Slow drift — heavier enemies (Guardian/Sentinel) descend slower.
    drift(enemy) {
        enemy.vel.x *= 0.92;
        enemy.vel.y = enemy.galaxianPath.speed * 0.7;
    },
};

const PATH_NAMES = Object.keys(PATHS);

// Pick a path appropriate for an enemy type.
export function pickPathForType(type) {
    switch (type) {
        case 'WASP':      return ['sine', 'zigzag', 'diagonal'][Math.floor(Math.random() * 3)];
        case 'HUNTER':    return ['straight', 'diagonal', 'swoop'][Math.floor(Math.random() * 3)];
        case 'GUARDIAN':  return ['drift', 'straight'][Math.floor(Math.random() * 2)];
        case 'SENTINEL':  return ['drift', 'straight'][Math.floor(Math.random() * 2)];
        case 'STALKER':   return ['straight', 'sine'][Math.floor(Math.random() * 2)];
        case 'DRIFTER':   return ['sine', 'swoop'][Math.floor(Math.random() * 2)];
        case 'WEAVER':    return ['zigzag', 'sine'][Math.floor(Math.random() * 2)];
        case 'PROWLER':   return ['drift', 'diagonal'][Math.floor(Math.random() * 2)];
        case 'TANGERINE': return ['swoop', 'zigzag'][Math.floor(Math.random() * 2)];
        case 'TITAN':     return 'drift';
        default:          return 'straight';
    }
}

// Build the path params blob attached to enemy.galaxianPath.
export function buildPathParams(pathName, opts = {}) {
    const speed = opts.speed ?? 2.2;
    switch (pathName) {
        case 'sine':     return { name: 'sine',     speed, amp: 60 + Math.random() * 70, freq: 0.0018 + Math.random() * 0.0014 };
        case 'zigzag':   return { name: 'zigzag',   speed, period: 600 + Math.random() * 500 };
        case 'diagonal': return { name: 'diagonal', speed, dir: opts.dir ?? (Math.random() < 0.5 ? -1 : 1) };
        case 'swoop':    return { name: 'swoop',    speed: speed * 0.85, dir: opts.dir ?? (Math.random() < 0.5 ? -1 : 1), duration: 4000 + Math.random() * 1500 };
        case 'drift':    return { name: 'drift',    speed };
        case 'straight':
        default:         return { name: 'straight', speed };
    }
}

// Apply the path step. Called from Enemy.updateMovement when galaxianPath set.
export function applyPath(enemy, now, gameField) {
    const fn = PATHS[enemy.galaxianPath?.name];
    if (fn) fn(enemy, now, gameField);
    else PATHS.straight(enemy);
}

export { PATH_NAMES };
