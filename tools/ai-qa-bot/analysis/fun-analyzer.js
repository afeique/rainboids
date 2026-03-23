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

        // Composite with weakest-link penalty
        const dimensionScores = { engagement, challengeBalance, competenceGrowth, pacing, excitement };
        const allScores = [
            engagement.score, challengeBalance.score, competenceGrowth.score,
            pacing.score, excitement.score,
        ];
        let overall = Math.round(
            WEIGHTS.engagement * engagement.score +
            WEIGHTS.challengeBalance * challengeBalance.score +
            WEIGHTS.excitement * excitement.score +
            WEIGHTS.pacing * pacing.score +
            WEIGHTS.competenceGrowth * competenceGrowth.score +
            // Choice depth gets neutral 50 when not available
            WEIGHTS.choiceDepth * 50
        );

        // Weakest-link: if any dimension < 35, apply multiplicative drag (floor at 0.3×)
        const minScore = Math.min(...allScores);
        if (minScore < 35) {
            overall = Math.round(overall * Math.max(0.3, minScore / 35));
        }

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
            tensionMean: w.tensionMean,
            tensionArcs: w.tensionArcs,
            restQuality: w.restQuality,
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
        let score = 60; // Start at mediocre — must earn points
        const issues = [];

        let lowActionWaves = 0;
        for (const w of this.waves) {
            // Good action density earns points
            if (w.actionDensity >= 0.5 && w.actionDensity <= 2.5) {
                score += 4;
            }
            // Low action density = boredom (harsh)
            if (w.actionDensity < 0.3) {
                score -= 8;
                lowActionWaves++;
                issues.push(`Wave ${w.wave}: low action density (${w.actionDensity.toFixed(2)} events/s)`);
            } else if (w.actionDensity < 0.5) {
                score -= 4;
                lowActionWaves++;
            }
            // Excessive action density = chaos
            if (w.actionDensity > 3.0) {
                score -= 3 * (w.actionDensity - 3.0);
                issues.push(`Wave ${w.wave}: chaotic action density (${w.actionDensity.toFixed(1)} events/s)`);
            }
            // Idle time with poor rest quality
            if (w.idleRatio > 0.30 && (w.restQuality || 0.5) < 0.4) {
                score -= 6;
                issues.push(`Wave ${w.wave}: unproductive idle time (${(w.idleRatio * 100).toFixed(0)}% idle)`);
            }
            // Low threat saturation
            if (w.threatSaturation < 0.001) {
                score -= 3;
            }
        }

        // Compounding penalty for multiple low-action waves
        if (lowActionWaves >= 3) {
            score -= (lowActionWaves - 2) * 5;
            issues.push(`${lowActionWaves} waves with low action density — persistent boredom`);
        }

        // Engagement dips: waves with essentially zero action
        const dips = this.waves.filter(w => w.actionDensity < 0.1);
        if (dips.length > 0) {
            score -= dips.length * 7;
            issues.push(`${dips.length} wave(s) with < 0.1 action density (engagement dips)`);
        }

        return { score: clamp(score), issues: dedup(issues, 5) };
    }

    scoreChallengeBalance() {
        let score = 65; // Start slightly above mediocre — earn points for balance
        const issues = [];

        let wellBalancedWaves = 0;
        for (const w of this.waves) {
            // Sweet spot: damage ratio 2:1 to 6:1
            if (w.damageRatio >= 2 && w.damageRatio <= 6 && w.kills > 0) {
                wellBalancedWaves++;
                score += 3;
            }

            // Deaths
            if (w.deaths > 1) {
                score -= 10 * (w.deaths - 1);
                issues.push(`Wave ${w.wave}: ${w.deaths} deaths (difficulty spike)`);
            } else if (w.deaths === 1) {
                score -= 3;
            }

            // Too easy (tightened from 12:1 to 8:1)
            if (w.damageRatio > 8 && w.kills > 0) {
                score -= 4;
                issues.push(`Wave ${w.wave}: damage ratio ${w.damageRatio.toFixed(1)}:1 (too easy)`);
            }
            // Too hard
            if (w.damageRatio < 1.5 && w.damageEventsTaken > 0) {
                score -= 6;
                issues.push(`Wave ${w.wave}: damage ratio ${w.damageRatio.toFixed(1)}:1 (too hard)`);
            }

            // Wave too fast (trivial)
            if (w.durationS < 8 && w.kills > 0) {
                score -= 4;
                issues.push(`Wave ${w.wave}: cleared in ${w.durationS.toFixed(1)}s (trivially fast)`);
            }
            // Wave too slow (grindy)
            if (w.durationS > 60) {
                score -= 5;
                issues.push(`Wave ${w.wave}: took ${w.durationS.toFixed(1)}s (too slow)`);
            }
        }

        // Difficulty spikes (damage-taken jumps between consecutive waves)
        for (let i = 1; i < this.waves.length; i++) {
            const prev = this.waves[i - 1].totalDamageTaken || 1;
            const cur = this.waves[i].totalDamageTaken || 0;
            if (cur > prev * 3 && cur > 5) {
                score -= 8;
                issues.push(`Difficulty spike at wave ${this.waves[i].wave}: damage taken jumped ${prev.toFixed(0)} → ${cur.toFixed(0)}`);
            }
        }

        return { score: clamp(score), issues: dedup(issues, 5) };
    }

    scoreCompetenceGrowth() {
        if (this.waves.length < 4) return { score: 50, issues: ['Not enough waves for trend analysis'] };

        let score = 50; // Neutral baseline
        const issues = [];

        // Combat effectiveness trend — gated by R² for statistical significance
        const effectiveness = this.waves.map(w => w.combatEffectiveness || w.healthFloor);
        const ceSlope = linearRegressionSlope(effectiveness);
        const ceR2 = linearRegressionR2(effectiveness);
        if (ceSlope > 0.005 && ceR2 > 0.15) score += Math.min(20, ceSlope * 2000 * ceR2);
        else if (ceSlope < -0.005) {
            score -= Math.min(20, -ceSlope * 2000);
            issues.push(`Combat effectiveness declining (slope: ${ceSlope.toFixed(4)}, R²: ${ceR2.toFixed(2)})`);
        }

        // Kill efficiency trend
        const efficiencies = this.waves.map(w => w.kills / Math.max(1, w.durationS));
        const effSlope = linearRegressionSlope(efficiencies);
        const effR2 = linearRegressionR2(efficiencies);
        if (effSlope > 0.005 && effR2 > 0.15) score += Math.min(15, effSlope * 1000 * effR2);
        else if (effSlope < -0.005) {
            score -= Math.min(15, -effSlope * 1500);
            issues.push(`Kill efficiency declining`);
        }

        // Damage ratio trend
        const dmgRatios = this.waves.map(w => w.damageRatio);
        const dmgSlope = linearRegressionSlope(dmgRatios);
        const dmgR2 = linearRegressionR2(dmgRatios);
        if (dmgSlope > 0 && dmgR2 > 0.15) score += Math.min(15, dmgSlope * 100 * dmgR2);
        else if (dmgSlope < -0.1) {
            score -= Math.min(15, -dmgSlope * 80);
            issues.push(`Damage ratio worsening over time`);
        }

        return { score: clamp(score), issues };
    }

    scorePacing() {
        if (this.waves.length < 3) return { score: 50, issues: ['Not enough waves for pacing analysis'] };

        let score = 50; // Neutral baseline — must earn points
        const issues = [];

        // 1. Tension arc quality: EARN points for arcs
        let wavesWithArcs = 0;
        for (const w of this.waves) {
            if ((w.tensionArcs || 0) > 0) wavesWithArcs++;
        }
        const arcCoverage = wavesWithArcs / this.waves.length;
        if (arcCoverage >= 0.6) {
            score += 20;
        } else if (arcCoverage >= 0.4) {
            score += 10;
        } else if (arcCoverage < 0.2) {
            score -= 15;
            issues.push(`Only ${(arcCoverage * 100).toFixed(0)}% of waves have tension arcs (target > 50%)`);
        }

        // 2. Tension variety: EARN points for varied intensity
        const tensionMeans = this.waves.map(w => w.tensionMean || 0);
        const tensionSpread = this._stddev(tensionMeans);
        if (tensionSpread > 0.08) {
            score += 12;
        } else if (tensionSpread > 0.04) {
            score += 5;
        } else {
            score -= 10;
            issues.push(`Low tension variety across waves (spread: ${tensionSpread.toFixed(3)})`);
        }

        // 3. Rest quality: good rests earn points, bad rests lose
        const avgRestQuality = this.waves.reduce((s, w) => s + (w.restQuality || 0.5), 0) / this.waves.length;
        if (avgRestQuality > 0.7) {
            score += 8;
        } else if (avgRestQuality < 0.3) {
            score -= 10;
            issues.push(`Poor rest quality (${(avgRestQuality * 100).toFixed(0)}%) — dead time without purpose`);
        }

        // 4. Intensity escalation
        const peakTensions = this.waves.map(w => {
            if (!w.tensionSamples || w.tensionSamples.length === 0) return 0;
            return Math.max(...w.tensionSamples);
        });
        const peakSlope = linearRegressionSlope(peakTensions);
        if (peakSlope > 0.01) {
            score += 8;
        } else if (peakSlope < -0.01 && this.waves.length > 5) {
            score -= 8;
            issues.push(`Peak tension declining over session (slope: ${peakSlope.toFixed(3)})`);
        }

        // 5. Monotony detection — harsher penalties
        let monotoneStreak = 0;
        for (let i = 1; i < tensionMeans.length; i++) {
            const change = Math.abs(tensionMeans[i] - tensionMeans[i - 1]) / Math.max(0.01, tensionMeans[i - 1]);
            if (change < 0.15) {
                monotoneStreak++;
                if (monotoneStreak >= 2) {
                    score -= 8;
                    issues.push(`Monotone tension: waves ${this.waves[i - monotoneStreak].wave}-${this.waves[i].wave}`);
                }
            } else {
                monotoneStreak = 0;
            }
        }

        // 6. Wave duration checks
        const durations = this.waves.map(w => w.durationS);
        const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
        if (avgDuration < 10) {
            score -= 8;
            issues.push(`Average wave duration too short (${avgDuration.toFixed(1)}s)`);
        }
        if (avgDuration > 50) {
            score -= 8;
            issues.push(`Average wave duration too long (${avgDuration.toFixed(1)}s)`);
        }

        return { score: clamp(score), issues: dedup(issues, 5) };
    }

    _stddev(arr) {
        if (arr.length < 2) return 0;
        const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
        const variance = arr.reduce((sum, v) => sum + (v - mean) ** 2, 0) / arr.length;
        return Math.sqrt(variance);
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

        // Health crises: some tension is good (capped lower)
        const hcPerWave = totalHealthCrises / waveCount;
        if (hcPerWave >= 1 && hcPerWave <= 15) {
            score += 5;
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

        // Survival recoveries: dramatic comebacks (capped lower)
        if (totalRecoveries > 0) {
            score += Math.min(6, totalRecoveries * 2);
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

        // Death penalty: deaths are frustrating, not exciting
        const totalDeaths = this.waves.reduce((sum, w) => sum + w.deaths, 0);
        const deathsPerWave = totalDeaths / waveCount;
        if (deathsPerWave > 0.5) {
            score -= Math.min(20, (deathsPerWave - 0.5) * 15);
            issues.push(`High death rate (${deathsPerWave.toFixed(1)}/wave) — frustrating, not exciting`);
        } else if (deathsPerWave > 0.2) {
            score -= Math.min(8, (deathsPerWave - 0.2) * 10);
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
        if (score >= 80) return 'Excellent';
        if (score >= 60) return 'Good';
        if (score >= 45) return 'Fair';
        if (score >= 30) return 'Poor';
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

export function linearRegressionR2(values) {
    const n = values.length;
    if (n < 3) return 0;
    const slope = linearRegressionSlope(values);
    const meanY = values.reduce((a, b) => a + b, 0) / n;
    let ssTot = 0, ssRes = 0;
    for (let i = 0; i < n; i++) {
        const predicted = meanY + slope * (i - (n - 1) / 2);
        ssTot += (values[i] - meanY) ** 2;
        ssRes += (values[i] - predicted) ** 2;
    }
    if (ssTot < 0.0001) return 0;
    return 1 - ssRes / ssTot;
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
