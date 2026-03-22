/**
 * Minimal browser-environment shim for running game modules in Node.js.
 * Import this BEFORE any game source modules.
 */

if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    innerWidth:  1920,
    innerHeight: 1080,
    matchMedia:  () => ({ matches: false }),
    addEventListener:    () => {},
    removeEventListener: () => {},
  };
}

if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElement: (tag) => {
      if (tag === 'canvas') {
        const ctx = {
          save:              () => {},
          restore:           () => {},
          translate:         () => {},
          scale:             () => {},
          rotate:            () => {},
          beginPath:         () => {},
          closePath:         () => {},
          fill:              () => {},
          stroke:            () => {},
          fillRect:          () => {},
          strokeRect:        () => {},
          clearRect:         () => {},
          arc:               () => {},
          moveTo:            () => {},
          lineTo:            () => {},
          bezierCurveTo:     () => {},
          drawImage:         () => {},
          fillText:          () => {},
          measureText:       () => ({ width: 0 }),
          createLinearGradient: () => ({ addColorStop: () => {} }),
          createRadialGradient: () => ({ addColorStop: () => {} }),
          getImageData:      () => ({ data: new Uint8ClampedArray(4) }),
          putImageData:      () => {},
          setTransform:      () => {},
          resetTransform:    () => {},
          shadowBlur:        0,
          shadowColor:       '',
          globalAlpha:       1,
          globalCompositeOperation: 'source-over',
          fillStyle:         '#000',
          strokeStyle:       '#000',
          lineWidth:         1,
          lineCap:           'butt',
          lineJoin:          'miter',
          font:              '10px sans-serif',
          textAlign:         'left',
          textBaseline:      'alphabetic',
        };
        return { getContext: () => ctx, width: 1920, height: 1080 };
      }
      return { style: {}, addEventListener: () => {}, classList: { add: () => {}, remove: () => {} } };
    },
    getElementById:      () => ({ style: {}, addEventListener: () => {}, classList: { add: () => {}, remove: () => {} }, innerHTML: '' }),
    querySelectorAll:    () => [],
    querySelector:       () => null,
    addEventListener:    () => {},
    removeEventListener: () => {},
    body:                { appendChild: () => {}, removeChild: () => {} },
  };
}

if (typeof globalThis.navigator === 'undefined') {
  globalThis.navigator = { vibrate: undefined };
}

if (typeof globalThis.Image === 'undefined') {
  globalThis.Image = class Image {
    constructor() { this.src = ''; this.onload = null; }
  };
}

if (typeof globalThis.Path2D === 'undefined') {
  globalThis.Path2D = class Path2D {
    constructor(_d) {}
  };
}

if (typeof globalThis.requestAnimationFrame === 'undefined') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 16);
}
