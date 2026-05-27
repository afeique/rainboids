// js/mp/render-bridge.js — render seam between mp-main and the drawing backend.
//
// `present(state)` takes the exact state object mp-main builds each frame. The
// bridge OWNS context acquisition (a later OffscreenCanvas render-worker feature
// needs `transferControlToOffscreen()`, which throws if the canvas already has a
// 2D context — so mp-main no longer calls getContext itself). Today it draws
// directly on the main thread.

import { render } from './mp-renderer.js';

export class RenderBridge {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  present(state) {
    render(this.ctx, this.canvas, state);
  }
}
