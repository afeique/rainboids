// Player damage, death, respawn, and related effects
import { GAME_STATES } from '../constants.js';
import { random } from '../utils.js';

export function takeDamage(damageAmount = this.baseDamage) {
    if (this.player.invincible) return;

    const effectiveShield = this.player.getEffectiveShield();
    const reducedDamage = damageAmount * (1 - effectiveShield / 100);
    this.player.health = Math.max(0, this.player.health - reducedDamage);

    if (this.player.health <= 0) {
        if (this.shieldTanks > 0) {
            this.shieldTanks--;
            this.explodeTank(this.shieldTanks);
            this.player.health = this.player.getEffectiveMaxHealth();
            this.events.emit('audio:coin');
            this.player.makeInvincible(2000);
        } else {
            this.handlePlayerDeath();
            return;
        }
    }

    this.player.makeInvincible(3000);
    this.events.emit('audio:hit');
    this.particlePool.get(this.player.x, this.player.y, 'damageNumber', Math.round(reducedDamage));
    this.triggerScreenShake(15, 8);
}

export function handlePlayerDeath() {
    const dx = this.player.x;
    const dy = this.player.y;
    const playerAngle = this.player.angle || 0;

    this.deathLocation = { x: dx, y: dy };

    this.game.lives--;
    this.events.emit('ui:update-lives', { lives: this.game.lives });
    this.events.emit('audio:player-explosion');
    this.player.active = false;

    const isGameOver = this.game.lives <= 0;

    // ── Phase 0: Impact Freeze (immediate) ──────────────────────────
    this.triggerHitstop(15);
    this.triggerScreenFlash(0.28, 5);
    const kickAngle = playerAngle + Math.PI;
    this.triggerCameraKick(Math.cos(kickAngle), Math.sin(kickAngle), 25);

    // Death overlay
    this._deathOverlayTimer = isGameOver ? 90 : 50;
    this._deathOverlayDuration = this._deathOverlayTimer;
    this._deathOverlayHold = isGameOver;

    // ── Phase 1: Ship Fragmentation (immediate) ─────────────────────
    this.particlePool.get(dx, dy, 'explosionFlash', 55);
    this.particlePool.get(dx, dy, 'explosionRingColored', 70, '#00ccff');
    this.createPlayerShipDebris(dx, dy, playerAngle);
    for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + random(-0.3, 0.3);
        const spd = random(10, 18);
        const c = i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? '#00ccff' : '#78ebff';
        this.particlePool.get(dx, dy, 'explosionShrapnel', a, spd, c);
    }

    // ── Phase 2: Main Blast (100-300ms) ─────────────────────────────
    setTimeout(() => {
        this.triggerCameraKick(
            Math.cos(kickAngle + random(-0.5, 0.5)),
            Math.sin(kickAngle + random(-0.5, 0.5)), 18
        );
        this.triggerScreenFlash(0.18, 4);
        this.triggerScreenShake(60, 30, 80);

        const ringColors = ['#ffffff', '#78ebff', '#ff5ad2'];
        const ringRadii = [90, 130, 175];
        for (let r = 0; r < 3; r++) {
            setTimeout(() => {
                this.particlePool.get(dx, dy, 'explosionRingColored',
                    ringRadii[r], ringColors[r]);
            }, r * 60);
        }
    }, 100);

    // Secondary shrapnel wave
    setTimeout(() => {
        const palette = ['#00ccff', '#ff5ad2', '#be96ff', '#ffffff', '#ffff96'];
        for (let i = 0; i < 14; i++) {
            const a = (i / 14) * Math.PI * 2 + random(-0.4, 0.4);
            const spd = random(4, 11);
            this.particlePool.get(dx, dy, 'explosionShrapnel', a, spd,
                palette[i % palette.length]);
        }
    }, 160);

    // Embers
    setTimeout(() => {
        const emberColors = ['#78ebff', '#ffffff', '#ff5ad2', '#be96ff'];
        for (let i = 0; i < 10; i++) {
            this.particlePool.get(dx, dy, 'explosionEmber',
                emberColors[i % emberColors.length]);
        }
    }, 220);

    // ── Phase 3: Aftershock (400-1200ms) ────────────────────────────
    setTimeout(() => {
        this.triggerCameraKick(
            Math.cos(kickAngle + random(-1, 1)),
            Math.sin(kickAngle + random(-1, 1)), 10
        );
        this.triggerScreenFlash(0.08, 2);

        for (let i = 0; i < 6; i++) {
            const ox = dx + random(-35, 35);
            const oy = dy + random(-35, 35);
            this.particlePool.get(ox, oy, 'explosionEmber',
                i % 2 === 0 ? '#ff5ad2' : '#ffff96');
        }
    }, 400);

    // Final massive ring
    setTimeout(() => {
        this.particlePool.get(dx, dy, 'explosionRingColored', 220, '#be96ff');
    }, 650);

    // Delayed re-ignition pops
    for (let p = 0; p < 4; p++) {
        setTimeout(() => {
            const ox = dx + random(-45, 45);
            const oy = dy + random(-45, 45);
            this.particlePool.get(ox, oy, 'explosionFlash', random(15, 28));
            for (let s = 0; s < 3; s++) {
                const a = random(0, Math.PI * 2);
                this.particlePool.get(ox, oy, 'explosionShrapnel', a,
                    random(3, 7), s === 0 ? '#ffffff' : '#78ebff');
            }
        }, 650 + p * 120);
    }

    // ── Handle game state ───────────────────────────────────────────
    if (isGameOver) {
        this.game.state = GAME_STATES.GAME_OVER;
        this.checkSurvivalRecord();
        this.events.emit('ui:show-message', { title: 'GAME OVER', subtitle: 'Press Enter or click to restart' });
    } else {
        const respawnEpoch = this.stateMachine.epoch;
        setTimeout(() => {
            if (this.stateMachine.epoch !== respawnEpoch) return;
            this.respawnPlayerSafely();
        }, 1800);
    }
}

export function createPlayerShipDebris(x, y, angle) {
    const r = this.player.radius || 12;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const verts = [
        { x: 0,          y: -r },
        { x: r * 0.32,   y: -r * 0.18 },
        { x: r * 1.12,   y: r * 0.28 },
        { x: r * 1.42,   y: r * 0.08 },
        { x: r * 0.28,   y: r * 0.58 },
        { x: r * 0.42,   y: r * 0.78 },
        { x: 0,          y: r * 0.38 },
        { x: -r * 0.42,  y: r * 0.78 },
        { x: -r * 0.28,  y: r * 0.58 },
        { x: -r * 1.42,  y: r * 0.08 },
        { x: -r * 1.12,  y: r * 0.28 },
        { x: -r * 0.32,  y: -r * 0.18 },
    ];

    for (let i = 0; i < verts.length; i++) {
        const v1 = verts[i];
        const v2 = verts[(i + 1) % verts.length];
        const p1 = {
            x: v1.x * cos - v1.y * sin,
            y: v1.x * sin + v1.y * cos
        };
        const p2 = {
            x: v2.x * cos - v2.y * sin,
            y: v2.x * sin + v2.y * cos
        };
        const debris = this.lineDebrisPool.get(x, y, p1, p2, '#00ccff');
        if (debris) {
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;
            const outAngle = Math.atan2(midY, midX);
            const spd = random(4, 10);
            debris.vel.x = Math.cos(outAngle) * spd;
            debris.vel.y = Math.sin(outAngle) * spd;
            debris.rotVel = random(-0.2, 0.2);
        }
    }
}

export function respawnPlayer() {
    this.respawnPlayerSafely();
}

export function respawnPlayerSafely() {
    const safeLocation = this.findSafeRespawnLocation();

    this.player.x = safeLocation.x;
    this.player.y = safeLocation.y;
    this.player.vel.x = 0;
    this.player.vel.y = 0;
    this.player.angle = 0;
    this.player.active = true;

    this.player.health = this.player.getEffectiveMaxHealth();
    this.playerShields = this.player.health;
    this.displayShields = this.player.health;

    this.player.makeInvincible(5000);
    this.player.justRespawned = true;
    this.player.firingDisabled = false;
    this.player.chargePaused = false;

    this.clearAreaAroundPlayer(200);

    this.deathExplosionActive = false;
    this.game.respawning = false;
}

export function findSafeRespawnLocation() {
    const gameField = this.gameField;
    const margin = 100;
    const minSafeDistance = 250;
    const maxAttempts = 50;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const x = margin + Math.random() * (gameField.width - 2 * margin);
        const y = margin + Math.random() * (gameField.height - 2 * margin);

        let isSafe = true;

        for (const enemy of this.enemyPool.activeObjects) {
            const dx = x - enemy.x;
            const dy = y - enemy.y;
            if (Math.hypot(dx, dy) < minSafeDistance) {
                isSafe = false;
                break;
            }
        }

        if (!isSafe) continue;

        for (const asteroid of this.asteroidPool.activeObjects) {
            const dx = x - asteroid.x;
            const dy = y - asteroid.y;
            if (Math.hypot(dx, dy) < minSafeDistance) {
                isSafe = false;
                break;
            }
        }

        if (!isSafe) continue;

        for (const bullet of this.enemyBulletPool.activeObjects) {
            const dx = x - bullet.x;
            const dy = y - bullet.y;
            if (Math.hypot(dx, dy) < minSafeDistance * 0.6) {
                isSafe = false;
                break;
            }
        }

        if (isSafe) {
            return { x, y };
        }
    }

    return {
        x: gameField.width / 2,
        y: gameField.height / 2
    };
}

export function updateRespawnAnimation(input) {
    const now = Date.now();
    const elapsed = now - this.game.respawnStartTime;
    const progress = Math.min(1, elapsed / this.game.respawnDuration);

    this.particlePool.updateActive();
    this.lineDebrisPool.updateActive();
    this.backgroundStarPool.activeObjects.forEach(s => s.update({ x: 0, y: 0 }, this.gameField));

    if (Math.random() < 0.8) {
        const angle = Math.random() * Math.PI * 2;
        const distance = 100 + Math.random() * 200;
        const startX = this.player.x + Math.cos(angle) * distance;
        const startY = this.player.y + Math.sin(angle) * distance;

        const particle = this.particlePool.get(startX, startY, 'spawnParticle', this.player.x, this.player.y, this.player);
        if (particle) {
            particle.color = `hsl(210, 100%, ${70 + Math.random() * 30}%)`;
            particle.radius = 2 + Math.random() * 2;
        }
    }

    if (progress >= 1) {
        this.player.active = true;
        this.player.makeInvincible(this.game.respawnDuration);
        this.player.firingDisabled = true;

        this.game.respawning = false;
    }
}

export function clearAreaAroundPlayer(radius) {
    this.enemyPool.activeObjects.forEach(enemy => {
        const dx = enemy.x - this.player.x;
        const dy = enemy.y - this.player.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < radius) {
            enemy.active = false;
            for (let i = 0; i < 5; i++) {
                this.particlePool.get(enemy.x, enemy.y, 'explosion');
            }
        }
    });

    this.enemyBulletPool.activeObjects.forEach(bullet => {
        const dx = bullet.x - this.player.x;
        const dy = bullet.y - this.player.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < radius) {
            bullet.active = false;
        }
    });
}

export function explodeTank(tankIndex) {
    const tanks = document.querySelectorAll('.shield-tank');
    if (tanks[tankIndex]) {
        const tank = tanks[tankIndex];
        const rect = tank.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        for (let i = 0; i < 12; i++) {
            const particle = document.createElement('div');
            particle.style.position = 'fixed';
            particle.style.left = centerX + 'px';
            particle.style.top = centerY + 'px';
            particle.style.width = '4px';
            particle.style.height = '4px';
            particle.style.background = '#00ff00';
            particle.style.borderRadius = '50%';
            particle.style.zIndex = '1000';
            particle.style.pointerEvents = 'none';
            document.body.appendChild(particle);

            const angle = (i / 12) * Math.PI * 2;
            const speed = 50 + Math.random() * 50;
            const duration = 500 + Math.random() * 500;

            particle.animate([
                { transform: 'translate(0, 0) scale(1)', opacity: 1 },
                { transform: `translate(${Math.cos(angle) * speed}px, ${Math.sin(angle) * speed}px) scale(0)`, opacity: 0 }
            ], {
                duration: duration,
                easing: 'ease-out'
            }).onfinish = () => particle.remove();
        }

        tank.animate([
            { opacity: 1, transform: 'scale(1)' },
            { opacity: 1, transform: 'scale(1.5)' },
            { opacity: 0, transform: 'scale(0)' }
        ], {
            duration: 300,
            easing: 'ease-out'
        });
    }
}
