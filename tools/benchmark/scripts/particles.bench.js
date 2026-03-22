/**
 * particles.bench.js — compare TypedArrayParticleSystem vs traditional particle pool
 */
import { bench, group, run } from 'mitata';
import '../browser-mock.js';
import { TypedArrayParticleSystem } from '../../js/modules/performance/typed-array-particles.js';

// ─── Traditional particle pool simulation ───────────────────────────────────

class TraditionalParticle {
  constructor() { this.reset(0, 0, 'basic'); }

  reset(x, y, type, vx, vy, r, g, b, a, radius, life) {
    this.x = x; this.y = y;
    this.vx = vx || (Math.random() - 0.5) * 4;
    this.vy = vy || (Math.random() - 0.5) * 4;
    this.radius = radius || 2;
    this.life = life || 1;
    this.maxLife = this.life;
    this.alpha = a || 1;
    this.friction = 0.98;
    this.type = type;
    this.color = `hsl(${Math.random() * 360 | 0}, 100%, 70%)`;
    this.active = true;
  }

  update(dt) {
    if (!this.active) return;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vx *= this.friction;
    this.vy *= this.friction;
    this.life -= dt / 60;
    if (this.life < 0.2) this.alpha = this.life / 0.2;
    if (this.life <= 0) this.active = false;
  }
}

class TraditionalPool {
  constructor(max) {
    this.pool = [];
    this.max = max;
    for (let i = 0; i < max; i++) {
      this.pool.push(new TraditionalParticle());
      this.pool[i].active = false;
    }
  }

  emit(x, y, type, vx, vy, r, g, b, a, radius, life) {
    for (let i = 0; i < this.pool.length; i++) {
      if (!this.pool[i].active) {
        this.pool[i].reset(x, y, type, vx, vy, r, g, b, a, radius, life);
        return i;
      }
    }
    return -1;
  }

  update(dt) {
    for (let i = 0; i < this.pool.length; i++) {
      this.pool[i].update(dt);
    }
  }

  getActiveCount() {
    let c = 0;
    for (let i = 0; i < this.pool.length; i++) if (this.pool[i].active) c++;
    return c;
  }
}

// ─── Benchmarks ─────────────────────────────────────────────────────────────

const TYPED = new TypedArrayParticleSystem(10000);
const TRAD_30 = new TraditionalPool(30);
const TRAD_200 = new TraditionalPool(200);
const TRAD_1000 = new TraditionalPool(1000);

group('emit: single particle', () => {
  bench('TypedArray', () => {
    TYPED.emit(400, 300, 2, -1, 0.5, 255, 100, 0, 1, 1, 0);
  });

  bench('Traditional pool (30)', () => {
    TRAD_30.emit(400, 300, 'explosion', 2, -1, 255, 100, 0, 1, 1, 0);
  });
});

group('emit: explosion (25 particles)', () => {
  bench('TypedArray', () => {
    TYPED.emitExplosion(400, 300, 25, 5, { r: 255, g: 100, b: 0 });
  });

  bench('Traditional pool (200)', () => {
    for (let i = 0; i < 25; i++) {
      const angle = (i / 25) * Math.PI * 2 + Math.random() * 0.5;
      const vel = 5 * (0.5 + Math.random() * 0.5);
      TRAD_200.emit(400, 300, 'explosion',
        Math.cos(angle) * vel, Math.sin(angle) * vel,
        255, 100, 0, 1, 2 + Math.random() * 3, 0.5 + Math.random() * 0.5);
    }
  });
});

// Pre-fill particles for update benchmarks
function fillTyped(sys, count) {
  sys.clear();
  for (let i = 0; i < count; i++) {
    sys.emit(
      Math.random() * 800, Math.random() * 600,
      (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4,
      2, 1, 255, 100, 0, 1, 1, 0.98
    );
  }
}

function fillTraditional(pool, count) {
  // Reset all
  for (const p of pool.pool) p.active = false;
  for (let i = 0; i < Math.min(count, pool.max); i++) {
    pool.emit(
      Math.random() * 800, Math.random() * 600, 'explosion',
      (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4,
      255, 100, 0, 1, 2, 1
    );
  }
}

group('update: 30 active particles', () => {
  bench('TypedArray (10k pool, 30 active)', () => {
    fillTyped(TYPED, 30);
    TYPED.update(16.67);
  });

  bench('Traditional pool (30)', () => {
    fillTraditional(TRAD_30, 30);
    TRAD_30.update(1);
  });
});

group('update: 200 active particles', () => {
  bench('TypedArray (10k pool, 200 active)', () => {
    fillTyped(TYPED, 200);
    TYPED.update(16.67);
  });

  bench('Traditional pool (200)', () => {
    fillTraditional(TRAD_200, 200);
    TRAD_200.update(1);
  });
});

group('update: 1000 active particles', () => {
  bench('TypedArray (10k pool, 1000 active)', () => {
    fillTyped(TYPED, 1000);
    TYPED.update(16.67);
  });

  bench('Traditional pool (1000)', () => {
    fillTraditional(TRAD_1000, 1000);
    TRAD_1000.update(1);
  });
});

// ImageData rendering benchmark (typed array only — this is the expensive part)
group('renderToImageData: TypedArray pixel rendering', () => {
  // Simulate canvas ImageData
  const W = 800, H = 600;
  const imageData = { data: new Uint8ClampedArray(W * H * 4) };

  bench('30 particles → 800×600 ImageData', () => {
    fillTyped(TYPED, 30);
    TYPED.renderToImageData(imageData, W, H);
  });

  bench('200 particles → 800×600 ImageData', () => {
    fillTyped(TYPED, 200);
    TYPED.renderToImageData(imageData, W, H);
  });

  bench('1000 particles → 800×600 ImageData', () => {
    fillTyped(TYPED, 1000);
    TYPED.renderToImageData(imageData, W, H);
  });
});

// Full lifecycle: emit + update + "render" cost comparison
group('full frame: emit 5 explosions + update + render prep (125 particles)', () => {
  const W = 800, H = 600;
  const imageData = { data: new Uint8ClampedArray(W * H * 4) };

  bench('TypedArray: emit + update + renderToImageData', () => {
    TYPED.clear();
    for (let e = 0; e < 5; e++) {
      TYPED.emitExplosion(Math.random() * W, Math.random() * H, 25, 5, { r: 255, g: 100, b: 0 });
    }
    TYPED.update(16.67);
    TYPED.renderToImageData(imageData, W, H);
  });

  bench('Traditional: emit + update + color string gen', () => {
    for (const p of TRAD_200.pool) p.active = false;
    for (let e = 0; e < 5; e++) {
      const cx = Math.random() * W, cy = Math.random() * H;
      for (let i = 0; i < 25; i++) {
        const angle = (i / 25) * Math.PI * 2 + Math.random() * 0.5;
        const vel = 5 * (0.5 + Math.random() * 0.5);
        TRAD_200.emit(cx, cy, 'explosion',
          Math.cos(angle) * vel, Math.sin(angle) * vel,
          255, 100, 0, 1, 2 + Math.random() * 3, 0.5 + Math.random() * 0.5);
      }
    }
    TRAD_200.update(1);
    // Simulate color string generation (what the canvas draw path does)
    for (const p of TRAD_200.pool) {
      if (p.active) {
        // Traditional rendering generates a color string per particle
        const _color = `rgba(255, 100, 0, ${p.alpha})`;
      }
    }
  });
});

const isJson = process.env.MITATA_JSON === '1';
run({ format: isJson ? { json: { debug: false, samples: false } } : undefined });
