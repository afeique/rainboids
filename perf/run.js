#!/usr/bin/env node
/**
 * perf/run.js — run mitata benchmarks on one or more JS engines
 *
 * Usage:
 *   node perf/run.js                          # V8 only, all suites
 *   node perf/run.js --engine jsc             # JSC only
 *   node perf/run.js --engine v8,jsc          # both engines
 *   node perf/run.js --suite pool,collision   # filter suites
 *   node perf/run.js --save                   # save results JSON
 */
import { readdir, writeFile, mkdir } from 'fs/promises';
import { resolve, basename } from 'path';
import { execSync, spawnSync } from 'child_process';
import { detectEngines, INSTALL_INSTRUCTIONS } from './engines.js';

const args = process.argv.slice(2);
const getArg = (flag) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
};
const hasFlag = (flag) => args.includes(flag);

const enginesArg = getArg('--engine') || 'v8';
const requestedEngines = enginesArg.split(',').map(s => s.trim());
const suiteFilter = getArg('--suite') ? getArg('--suite').split(',').map(s => s.trim()) : null;
const save = hasFlag('--save') || hasFlag('--output');
const outputFile = getArg('--output');

const BENCH_DIR = new URL('./benchmarks/', import.meta.url).pathname;
const RESULTS_DIR = resolve(process.cwd(), 'perf', 'results');

async function main() {
  const available = detectEngines();

  // Find bench files
  const allFiles = (await readdir(BENCH_DIR)).filter(f => f.endsWith('.bench.js'));
  const benchFiles = suiteFilter
    ? allFiles.filter(f => suiteFilter.some(s => f.includes(s)))
    : allFiles;

  if (benchFiles.length === 0) {
    console.error('No benchmark files found in', BENCH_DIR);
    process.exit(1);
  }

  const results = {
    timestamp: new Date().toISOString(),
    git: getGitInfo(),
    engines: {},
  };

  for (const engineName of requestedEngines) {
    if (!available[engineName] && engineName !== 'v8') {
      console.warn(`\n  Engine "${engineName}" not found. ${INSTALL_INSTRUCTIONS[engineName] || ''}`);
      continue;
    }

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  Engine: ${engineName.toUpperCase()}  ${available[engineName]?.version || ''}`);
    console.log('═'.repeat(60));

    const engineResults = {};

    for (const file of benchFiles) {
      const suiteName = basename(file, '.bench.js');
      const filePath = resolve(BENCH_DIR, file);

      console.log(`\n  Running: ${suiteName}`);

      const result = spawnSync('node', [filePath], {
        encoding: 'utf8',
        timeout: 120000,
        env: { ...process.env },
      });

      if (result.status !== 0) {
        console.error(`  FAIL ${suiteName}:\n${result.stderr}`);
        engineResults[suiteName] = { error: result.stderr };
        continue;
      }

      process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
      engineResults[suiteName] = { raw: result.stdout };
    }

    results.engines[engineName] = engineResults;
  }

  if (save) {
    await mkdir(RESULTS_DIR, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const outPath = outputFile || resolve(RESULTS_DIR, `perf-${ts}.json`);
    await writeFile(outPath, JSON.stringify(results, null, 2));
    console.log(`\n  Results saved to ${outPath}`);

    await writeAllureResults(results, RESULTS_DIR);
  }

  return results;
}

function getGitInfo() {
  try {
    return {
      branch: execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim(),
      hash: execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim(),
    };
  } catch { return {}; }
}

async function writeAllureResults(results, dir) {
  const allureDir = resolve(dir, '../../allure-results/perf');
  await mkdir(allureDir, { recursive: true });

  for (const [engine, suites] of Object.entries(results.engines)) {
    for (const [suite, data] of Object.entries(suites)) {
      const testResult = {
        uuid: `perf-${engine}-${suite}-${Date.now()}`,
        historyId: `perf-${engine}-${suite}`,
        name: `[${engine.toUpperCase()}] ${suite}`,
        status: data.error ? 'failed' : 'passed',
        stage: 'finished',
        start: Date.now() - 10000,
        stop: Date.now(),
        labels: [
          { name: 'suite', value: 'Performance' },
          { name: 'subSuite', value: engine.toUpperCase() },
          { name: 'feature', value: suite },
        ],
        description: `Mitata benchmark suite: ${suite} on ${engine}`,
        attachments: [{
          name: 'benchmark-output',
          type: 'text/plain',
          source: `${engine}-${suite}.txt`,
        }],
      };
      await writeFile(
        resolve(allureDir, `${engine}-${suite}-result.json`),
        JSON.stringify(testResult, null, 2)
      );
      await writeFile(
        resolve(allureDir, `${engine}-${suite}.txt`),
        typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data)
      );
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
