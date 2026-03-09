/**
 * engines.js — detect and run benchmarks on V8 / JSC / SpiderMonkey
 */
import { spawnSync } from 'child_process';
import { existsSync } from 'fs';

// Known engine binary locations (override via env vars)
const ENGINE_PATHS = {
  v8: process.env.ENGINE_V8 || 'node',
  jsc: process.env.ENGINE_JSC || (() => {
    const candidates = [
      '/System/Library/Frameworks/JavaScriptCore.framework/Helpers/jsc',
      '/usr/bin/jsc',
      'jsc',
    ];
    return candidates.find(p => {
      try { return p === 'jsc' || existsSync(p); } catch { return false; }
    }) || 'jsc';
  })(),
  spidermonkey: process.env.ENGINE_SM || 'js',  // SpiderMonkey binary
};

const ENGINE_ARGS = {
  v8:           ['--experimental-vm-modules'],
  jsc:          ['--module'],
  spidermonkey: ['--module'],
};

export function detectEngines() {
  const available = {};
  for (const [name, binary] of Object.entries(ENGINE_PATHS)) {
    const result = spawnSync(binary, ['--version'], { encoding: 'utf8', timeout: 3000 });
    if (result.status === 0 || result.error?.code !== 'ENOENT') {
      available[name] = { binary, version: (result.stdout || result.stderr || '').split('\n')[0].trim() };
    }
  }
  return available;
}

export function runOnEngine(engine, benchFile, extraArgs = []) {
  const binary = ENGINE_PATHS[engine] || engine;
  const args = [...(ENGINE_ARGS[engine] || []), ...extraArgs, benchFile];
  return spawnSync(binary, args, { encoding: 'utf8', timeout: 60000, stdio: ['pipe', 'pipe', 'pipe'] });
}

export const INSTALL_INSTRUCTIONS = {
  jsc: 'Install JavaScriptCore: brew install webkit2gtk (Linux) or use Xcode on macOS. Set ENGINE_JSC env var to path.',
  spidermonkey: 'Install SpiderMonkey: brew install spidermonkey (or download from https://spidermonkey.dev/). Set ENGINE_SM env var.',
};
