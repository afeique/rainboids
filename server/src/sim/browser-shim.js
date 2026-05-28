// Path A — minimal browser-global shim for running the real single-player
// entity code headless in Node.
//
// The SP classes assume a browser at RUNTIME (not import time — every sim module
// imports cleanly in bare Node). Their update() paths read a few browser globals
// (window.innerWidth, document, localStorage). Their draw() paths touch
// canvas/ctx — but the headless sim NEVER calls draw(), so we don't shim canvas.
// `navigator` is left as Node's built-in (read-only in Node ≥20); SP's uses of
// it (haptics, isMobile) are all `typeof`-guarded and degrade to desktop/no-op.
//
// Idempotent: only fills globals that don't already exist (so it's a no-op in a
// real browser and safe to call repeatedly).

export function installBrowserShim({ width = 1920, height = 1080 } = {}) {
  if (!globalThis.window) {
    globalThis.window = {
      innerWidth: width,
      innerHeight: height,
      devicePixelRatio: 1,
      addEventListener() {},
      removeEventListener() {},
      matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    };
  }
  if (!globalThis.document) {
    globalThis.document = {
      hidden: false,
      visibilityState: 'visible',
      addEventListener() {},
      removeEventListener() {},
      getElementById: () => null,
      // Some modules build offscreen sprite canvases at runtime; a null 2D
      // context is fine because the headless sim never renders.
      createElement: () => ({ getContext: () => null, style: {}, width: 0, height: 0 }),
    };
  }
  if (!globalThis.localStorage) {
    const store = new Map();
    globalThis.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear(),
      get length() { return store.size; },
      key: (i) => [...store.keys()][i] ?? null,
    };
  }
  if (typeof globalThis.requestAnimationFrame !== 'function') globalThis.requestAnimationFrame = () => 0;
  if (typeof globalThis.cancelAnimationFrame !== 'function') globalThis.cancelAnimationFrame = () => {};
  if (!globalThis.performance) globalThis.performance = { now: () => Date.now() };
}
