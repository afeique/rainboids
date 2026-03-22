/**
 * AI QA Bot — Fun Analyzer
 *
 * Scores six dimensions of fun from finalized wave buckets:
 *   1. Engagement — is the player always actively deciding?
 *   2. Challenge Balance — is difficulty appropriate?
 *   3. Competence Growth — does the player feel increasingly effective?
 *   4. Choice Depth — do decisions matter? (cross-session only)
 *   5. Pacing — does intensity oscillate well?
 *   6. Excitement — are there dramatic close-call moments?
 *
 * Each dimension produces a 0-100 score.
 */

// Dimension weights for composite score
const WEIGHTS = {
    engagement: 0.25,
    challengeBalance: 0.20,
    excitement: 0.20,
    pacing: 0.15,
    competenceGrowth: 0.12,
    choiceDepth: 0.08,
};

export class FunAnalyzer {
    /**
     * @param {Map<number, import('./wave-bucket.js').WaveBucket>} waveBuckets
     */
    constructor(waveBuckets) {
        this.buckets = waveBuckets;
        this.waves = [...waveBuckets.values()]
            .filter(b => b.endTime !== null)
            .sort((a, b) => a.wave - b.wave);
    }

    /**
     * Run full analysis and return scored results.
     */
    analyze() {
        const engagement = this.scoreEngagement();
        const challengeBalance = this.scoreChallengeBalance();
        const competenceGrowth = this.scoreCompetenceGrowth();
        const pacing = this.scorePacing();
        const excitement = this.scoreExcitement();

        // Composite (choiceDepth excluded — requires cross-session data)
        const dimensionScores = { engagement, challengeBalance, competenceGrowth, pacing, excitement };
        const overall = Math.round(
            WEIGHTS.engagement * engagement.score +
            WEIGHTS.challengeBalance * challengeBalance.score +
            WEIGHTS.excitement * excitement.score +
            WEIGHTS.pacing * pacing.score +
            WEIGHTS.competenceGrowth * competenceGrowth.score +
            // Choice depth gets neutral 50 when not available
            WEIGHTS.choiceDepth * 50
        );

        // Per-wave scores
        const perWave = this.waves.map(w => ({
            wave: w.wave,
            actionDensity: w.actionDensity,
            damageRatio: w.damageRatio,
            healthFloor: w.healthFloor,
            nearMisses: w.nearMisses,
            kills: w.kills,
            deaths: w.deaths,
            idleRatio: w.idleRatio,
            durationS: w.durationS,
        }));

        // Identify hotspots (worst-scoring waves per dimension)
        const hotspots = this._findHotspots(dimensionScores);

        // Generate recommendations
        const recommendations = this._generateRecommendations(dimensionScores, hotspots);

        return {
            overall,
            rating: this._rating(overall),
            dimensions: {
                engagement: { score: engagement.score, issues: engagement.issues },
                challengeBalance: { score: challengeBalance.score, issues: challengeBalance.issues },
                competenceGrowth: { score: competenceGrowth.score, issues: competenceGrowth.issues },
                choiceDepth: { score: null, issues: ['Requires cross-session comparison'] },
                pacing: { score: pacing.score, issues: pacing.issues },
                excitement: { score: excitement.score, issues: excitement.issues },
            },
            perWave,
            hotspots,
            recommendations,
        };
    }

    // ── Dimension Scorers ───────────────────────────────────────

    scoreEngagement() {
        let score = 100;
        const issues = [];

        for (const w of this.waves) {
            // Low action density = boredom
            // Calibrated for 2-4 enemies per wave: 0.3 events/s is reasonable
            if (w.actionDensity < 0.3) {
                score -= 5 * (0.3 - w.actionDensity) / 0.3;
                issues.push(`Wave ${w.wave}: low action density (${w.actionDensity.toFixed(2)} events/s)`);
            }
            // Excessive action density = chaos
            if (w.actionDensity > 3.0) {
                score -= 2 * (w.actionDensity - 3.0);
                issues.push(`Wave ${w.wave}: chaotic action density (${w.actionDensity.toFixed(1)} events/s)`);
            }
            // High idle ratio (no enemies or bullets on screen)
            if (w.idleRatio > 0.30) {
                score -= 6 * (w.idleRatio - 0.30);
                issues.push(`Wave ${w.wave}: high idle ratio (${(w.idleRatio * 100).toFixed(0)}%)`);
            }
            // Low threat saturation
            if (w.threatSaturation < 0.001) {
                score -= 2;
            }
        }

        // Engagement dips: waves with essentially zero action
        const dips = this.waves.filter(w => w.actionDensity < 0.1);
        if (dips.length > 0) {
            score -= dips.length * 5;
            issues.push(`${dips.length} wave(s) with < 0.1 action density (engagement dips)`);
        }

        return { score: clamp(score), issues: dedup(issues, 5) };
    }

    scoreChallengeBalance() {
        let score = 100;
        const issues = [];

        for (const w of this.waves) {
            // Multiple deaths in one wave = spike
            if (w.deaths > 1) {
                score -= 8 * (w.deaths - 1);
                issues.push(`Wave ${w.wave}: ${w.deaths} deaths (difficulty spike)`);
            }

            // Extreme damage ratios
            if (w.damageRatio > 12 && w.kills > 0) {
                score -= 2;
                issues.push(`Wave ${w.wave}: damage ratio ${w.damageRatio.toFixed(1)}:1 (too easy)`);
            }
            if (w.damageRatio < 1.5 && w.damageEventsTaken > 0) {
                score -= 4;
                issues.push(`Wave ${w.wave}: damage ratio ${w.damageRatio.toFixed(1)}:1 (too hard)`);
            }

            // Wave too fast (trivial)
            if (w.durationS < 8 && w.kills > 0) {
                score -= 3;
                issues.push(`Wave ${w.wave}: cleared in ${w.durationS.toFixed(1)}s (trivially fast)`);
            }
            // Wave too slow (grindy)
            if (w.durationS > 60) {
                score -= 4;
                issues.push(`Wave ${w.wave}: took ${w.durationS.toFixed(1)}s (too slow)`);
            }
        }

        // Difficulty spikes (damage-taken jumps between consecutive waves)
        for (let i = 1; i < this.waves.length; i++) {
            const prev = this.waves[i - 1].totalDamageTaken || 1;
            const cur = this.waves[i].totalDamageTaken || 0;
            if (cur > prev * 3 && cur > 5) {
                score -= 6;
                issues.push(`Difficulty spike at wave ${this.waves[i].wave}: damage taken jumped ${prev.toFixed(0)} → ${cur.toFixed(0)}`);
            }
        }

        return { score: clamp(score), issues: dedup(issues, 5) };
    }

    scoreCompetenceGrowth() {
        if (this.waves.length < 4) return { score: 50, issues: ['Not enough waves for trend analysis'] };

        let score = 50; // Neutral baseline
        const issues = [];

        // Accuracy trend
        const accuracies = this.waves.map(w => w.accuracy);
        const accSlope = linearRegressionSlope(accuracies);
        if (accSlope > 0.005) score += Math.min(20, accSlope * 2000);
        else if (accSlope < -0.005) {
            score -= Math.min(15, -accSlope * 1500);
            issues.push(`Accuracy declining (slope: ${accSlope.toFixed(4)})`);
        }

        // Kill efficiency trend (kills per action-density-second)
        const efficiencies = this.waves.map(w => w.kills / Math.max(1, w.durationS));
        const effSlope = linearRegressionSlope(efficiencies);
        if (effSlope > 0.005) score += Math.min(15, effSlope * 1000);
        else if (effSlope < -0.005) {
            score -= Math.min(10, -effSlope * 1000);
            issues.push(`Kill efficiency declining`);
        }

        // Damage ratio trend (should stay stable or improve)
        const dmgRatios = this.waves.map(w => w.damageRatio);
        const dmgSlope = linearRegressionSlope(dmgRatios);
        if (dmgSlope > 0) score += Math.min(15, dmgSlope * 100);
        else if (dmgSlope < -0.1) {
            score -= Math.min(10, -dmgSlope * 50);
            issues.push(`Damage ratio worsening over time`);
        }

        return { score: clamp(score), issues };
    }

    scorePacing() {
        if (this.waves.length < 3) return { score: 50, issues: ['Not enough waves for pacing analysis'] };

        let score = 100;
        const issues = [];
        const densities = this.waves.map(w => w.actionDensity);

        // Monotony: 3+ consecutive waves with < 15% density change
        let monotoneStreak = 0;
        for (let i = 1; i < densities.length; i++) {
            const change = Math.abs(densities[i] - densities[i - 1]) / Math.max(0.1, densities[i - 1]);
            if (change < 0.15) {
                monotoneStreak++;
                if (monotoneStreak >= 2) {
                    score -= 6;
                    issues.push(`Monotone stretch: waves ${this.waves[i - monotoneStreak].wave}-${this.waves[i].wave} (< 15% intensity variation)`);
                }
            } else {
                monotoneStreak = 0;
            }
        }

        // Oscillation: density should alternate up/down
        let oscillations = 0;
        for (let i = 2; i < densities.length; i++) {
            const d1 = densities[i - 1] - densities[i - 2];
            const d2 = densities[i] - densities[i - 1];
            if ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) oscillations++;
        }
        const oscillationRatio = oscillations / Math.max(1, densities.length - 2);
        if (oscillationRatio < 0.25) {
            score -= 10;
            issues.push(`Low pacing oscillation (${(oscillationRatio * 100).toFixed(0)}% — target > 30%)`);
        }

        // Overall density trend should generally escalate
        const slope = linearRegressionSlope(densities);
        if (slope < 0 && densities.length > 5) {
            score -= 8;
            issues.push(`Action density trending downward (slope: ${slope.toFixed(3)})`);
        }

        // Wave durations: penalize very long or very short transitions
        const durations = this.waves.map(w => w.durationS);
        const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
        if (avgDuration < 10) {
            score -= 5;
            issues.push(`Average wave duration too short (${avgDuration.toFixed(1)}s)`);
        }
        if (avgDuration > 50) {
            score -= 5;
            issues.push(`Average wave duration too long (${avgDuration.toFixed(1)}s)`);
        }

        return { score: clamp(score), issues: dedup(issues, 5) };
    }

    scoreExcitement() {
        let score = 50; // Neutral baseline
        const issues = [];

        if (this.waves.length === 0) return { score, issues: ['No wave data'] };

        const waveCount = this.waves.length;
        let totalNearMisses = 0;
        let totalHealthCrises = 0;
        let totalClutchKills = 0;
        let totalMultiKills = 0;
        let totalRecoveries = 0;
        let totalVelocityVar = 0;

        for (const w of this.waves) {
            totalNearMisses += w.nearMisses;
            totalHealthCrises += w.healthCrises;
            totalClutchKills += w.clutchKills;
            totalMultiKills += w.multiKillBursts;
            totalRecoveries += w.survivalRecoveries;
            totalVelocityVar += w.velocityVariance;
        }

        // Near-misses per wave: target 2-10
        const nmPerWave = totalNearMisses / waveCount;
        if (nmPerWave >= 2 && nmPerWave <= 10) {
            score += 15;
        } else if (nmPerWave < 1) {
            score -= 10;
            issues.push(`Very few near-misses (${nmPerWave.toFixed(1)}/wave) — combat feels too safe`);
        } else if (nmPerWave > 20) {
            score -= 5;
            issues.push(`Excessive near-misses (${nmPerWave.toFixed(1)}/wave) — too chaotic`);
        } else {
            score += 8; // Outside ideal but acceptable
        }

        // Health crises: some tension is good
        const hcPerWave = totalHealthCrises / waveCount;
        if (hcPerWave >= 1 && hcPerWave <= 15) {
            score += 8;
        } else if (hcPerWave === 0) {
            score -= 5;
            issues.push('No health crises — no tension');
        } else if (hcPerWave > 30) {
            score -= 8;
            issues.push(`Excessive health crises (${hcPerWave.toFixed(0)} ticks/wave below 25% health)`);
        }

        // Clutch kills: heroic moments
        if (totalClutchKills > 0) {
            score += Math.min(12, totalClutchKills * 2);
        }

        // Multi-kill bursts: satisfying
        if (totalMultiKills > 0) {
            score += Math.min(8, totalMultiKills * 2);
        }

        // Survival recoveries: dramatic comebacks
        if (totalRecoveries > 0) {
            score += Math.min(10, totalRecoveries * 4);
        } else if (waveCount > 5) {
            issues.push('No survival recoveries — missing dramatic comeback moments');
        }

        // Movement dynamism
        const avgVelocityVar = totalVelocityVar / waveCount;
        if (avgVelocityVar > 1.5) score += 5;
        else if (avgVelocityVar < 0.5) {
            score -= 3;
            issues.push('Low movement dynamism — player barely dodging');
        }

        return { score: clamp(score), issues: dedup(issues, 5) };
    }

    // ── Cross-Session Choice Depth (static method) ─────────────

    /**
     * Score choice depth across multiple sessions.
     * @param {Array} sessions - Array of session JSON objects with funMetrics
     * @returns {{ score: number, issues: string[] }}
     */
    static scoreChoiceDepth(sessions) {
        if (sessions.length < 3) return { score: 50, issues: ['Need 3+ sessions for choice depth analysis'] };

        let score = 70; // Start optimistic
        const issues = [];

        // Build archetype performance comparison
        const byArchetype = {};
        for (const s of sessions) {
            const arch = s.meta?.config?.buildArchetype || 'unknown';
            if (!byArchetype[arch]) byArchetype[arch] = [];
            byArchetype[arch].push(s.summary?.wavesReached || 0);
        }

        // Dominant strategy check
        const avgByArch = {};
        for (const [arch, waves] of Object.entries(byArchetype)) {
            avgByArch[arch] = waves.reduce((a, b) => a + b, 0) / waves.length;
        }
        const archAvgs = Object.values(avgByArch);
        if (archAvgs.length >= 2) {
            const overallAvg = archAvgs.reduce((a, b) => a + b, 0) / archAvgs.length;
            const maxAvg = Math.max(...archAvgs);
            const dominanceRatio = maxAvg / Math.max(1, overallAvg);
            if (dominanceRatio > 1.4) {
                score -= 15;
                const dominant = Object.entries(avgByArch).find(([, v]) => v === maxAvg)?.[0];
                issues.push(`${dominant} build dominates (${dominanceRatio.toFixed(2)}x average waves)`);
            }
        }

        // Upgrade diversity (Shannon entropy)
        const upgradeCounts = {};
        for (const s of sessions) {
            for (const u of s.summary?.upgradesPurchased || []) {
                upgradeCounts[u] = (upgradeCounts[u] || 0) + 1;
            }
        }
        const totalUpgrades = Object.values(upgradeCounts).reduce((a, b) => a + b, 0);
        if (totalUpgrades > 0) {
            const entropy = shannonEntropy(Object.values(upgradeCounts));
            const maxEntropy = Math.log2(Object.keys(upgradeCounts).length || 1);
            const normalizedEntropy = maxEntropy > 0 ? entropy / maxEntropy : 0;
            if (normalizedEntropy < 0.5) {
                score -= 10;
                issues.push(`Low upgrade diversity (entropy: ${normalizedEntropy.toFixed(2)} — some upgrades are never bought)`);
            } else if (normalizedEntropy > 0.8) {
                score += 10;
            }
        }

        return { score: clamp(score), issues };
    }

    // ── Helpers ───────────────────────────────────────────────

    _findHotspots() {
        const hotspots = [];

        for (const w of this.waves) {
            // Low engagement
            if (w.actionDensity < 0.8) {
                hotspots.push({
                    wave: w.wave, dimension: 'engagement',
                    score: Math.round(Math.max(0, 100 - (1.0 - w.actionDensity) * 100)),
                    diagnosis: `Low action density (${w.actionDensity.toFixed(2)} events/s), idle ratio ${(w.idleRatio * 100).toFixed(0)}%`,
                });
            }
            // Challenge spike
            if (w.deaths > 1) {
                hotspots.push({
                    wave: w.wave, dimension: 'challengeBalance',
                    score: Math.round(Math.max(0, 100 - w.deaths * 30)),
                    diagnosis: `${w.deaths} deaths in one wave`,
                });
            }
            // Too easy
            if (w.damageRatio > 15 && w.kills > 2) {
                hotspots.push({
                    wave: w.wave, dimension: 'challengeBalance',
                    score: Math.round(Math.max(0, 100 - (w.damageRatio - 10) * 3)),
                    diagnosis: `Damage ratio ${w.damageRatio.toFixed(1)}:1 — enemies pose no threat`,
                });
            }
        }

        return hotspots.sort((a, b) => a.score - b.score).slice(0, 10);
    }

    _generateRecommendations(dimensions) {
        const recs = [];
        let priority = 1;

        // Engagement recommendations
        if (dimensions.engagement.score < 70) {
            const lowDensityWaves = this.waves.filter(w => w.actionDensity < 1.0);
            if (lowDensityWaves.length > 0) {
                recs.push({
                    priority: priority++,
                    dimension: 'engagement',
                    suggestion: `Increase enemy fire rate or count in waves ${lowDensityWaves.map(w => w.wave).join(', ')}`,
                    expectedImpact: 'high',
                });
            }
            const highIdleWaves = this.waves.filter(w => w.idleRatio > 0.20);
            if (highIdleWaves.length > 0) {
                recs.push({
                    priority: priority++,
                    dimension: 'engagement',
                    suggestion: 'Reduce enemy spawn delay or add environmental hazards during idle periods',
                    expectedImpact: 'medium',
                });
            }
        }

        // Challenge recommendations
        if (dimensions.challengeBalance.score < 70) {
            const spikeWaves = this.waves.filter(w => w.deaths > 1);
            if (spikeWaves.length > 0) {
                recs.push({
                    priority: priority++,
                    dimension: 'challengeBalance',
                    suggestion: `Reduce difficulty at waves ${spikeWaves.map(w => w.wave).join(', ')} — multiple deaths indicate spikes`,
                    expectedImpact: 'high',
                });
            }
            const easyWaves = this.waves.filter(w => w.damageRatio > 12 && w.kills > 2);
            if (easyWaves.length > 0) {
                recs.push({
                    priority: priority++,
                    dimension: 'challengeBalance',
                    suggestion: `Increase enemy health/aggression at waves ${easyWaves.map(w => w.wave).join(', ')}`,
                    expectedImpact: 'medium',
                });
            }
        }

        // Pacing recommendations
        if (dimensions.pacing.score < 70) {
            recs.push({
                priority: priority++,
                dimension: 'pacing',
                suggestion: 'Vary wave intensity more — alternate between high-pressure and breather waves',
                expectedImpact: 'medium',
            });
        }

        // Excitement recommendations
        if (dimensions.excitement.score < 60) {
            recs.push({
                priority: priority++,
                dimension: 'excitement',
                suggestion: 'Add more close-range encounters or enemy behaviors that create near-miss moments',
                expectedImpact: 'medium',
            });
        }

        return recs;
    }

    _rating(score) {
        if (score >= 85) return 'Excellent';
        if (score >= 70) return 'Good';
        if (score >= 55) return 'Fair';
        if (score >= 40) return 'Poor';
        return 'Critical';
    }
}

// ── Math Utilities ─────────────────────────────────────────────

function clamp(score) {
    return Math.max(0, Math.min(100, Math.round(score)));
}

function dedup(arr, max) {
    return [...new Set(arr)].slice(0, max);
}

export function linearRegressionSlope(values) {
    const n = values.length;
    if (n < 2) return 0;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
        sumX += i;
        sumY += values[i];
        sumXY += i * values[i];
        sumX2 += i * i;
    }
    const denom = n * sumX2 - sumX * sumX;
    if (denom === 0) return 0;
    return (n * sumXY - sumX * sumY) / denom;
}

export function shannonEntropy(counts) {
    const total = counts.reduce((a, b) => a + b, 0);
    if (total === 0) return 0;
    let entropy = 0;
    for (const c of counts) {
        if (c > 0) {
            const p = c / total;
            entropy -= p * Math.log2(p);
        }
    }
    return entropy;
}
