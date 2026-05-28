// js/mp/mp-input.js — keyboard + mouse capture for the MP client.
//
// Produces the same input frame shape the shared sim consumes:
//   { up, down, left, right, fire, aimX, aimY }
// aimX/aimY are in WORLD coordinates (arena space), mapped from the cursor via
// the canvas's on-screen scale so aiming is correct regardless of window size.

export class MpInput {
  constructor(canvas, camera = null) {
    this.canvas = canvas;
    // Camera ref (owned by mp-main). When present, the cursor is mapped through
    // the inverse of the renderer's zoom-around-center + camera-translate
    // transform so aim stays correct under a following, zoomed camera.
    this.camera = camera;
    this.state = { up: false, down: false, left: false, right: false, fire: false, aimX: null, aimY: null };
    this._bind();
  }

  _bind() {
    const setKey = (code, down) => {
      switch (code) {
        case 'KeyW': case 'ArrowUp': this.state.up = down; break;
        case 'KeyS': case 'ArrowDown': this.state.down = down; break;
        case 'KeyA': case 'ArrowLeft': this.state.left = down; break;
        case 'KeyD': case 'ArrowRight': this.state.right = down; break;
        case 'Space': this.state.fire = down; break;
        default: break;
      }
    };
    window.addEventListener('keydown', (e) => {
      setKey(e.code, true);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => setKey(e.code, false));

    const updateAim = (clientX, clientY) => {
      const r = this.canvas.getBoundingClientRect();
      const cw = this.canvas.width, ch = this.canvas.height;
      // CSS-displayed size → canvas pixels.
      const px = (clientX - r.left) * (cw / r.width);
      const py = (clientY - r.top) * (ch / r.height);
      const cam = this.camera;
      if (cam) {
        // Inverse of: zoom-around-center, then translate(-cam).
        //   world = (screen - center) / zoom + center + cam
        const zoom = cam.zoom || 1;
        this.state.aimX = (px - cw / 2) / zoom + cw / 2 + cam.x;
        this.state.aimY = (py - ch / 2) / zoom + ch / 2 + cam.y;
      } else {
        this.state.aimX = px;
        this.state.aimY = py;
      }
    };
    this.canvas.addEventListener('mousemove', (e) => updateAim(e.clientX, e.clientY));
    this.canvas.addEventListener('mousedown', (e) => { updateAim(e.clientX, e.clientY); this.state.fire = true; });
    window.addEventListener('mouseup', () => { this.state.fire = false; });
  }

  /** A plain copy of the current input frame (safe to buffer for prediction). */
  snapshot() {
    return {
      up: this.state.up, down: this.state.down, left: this.state.left, right: this.state.right,
      fire: this.state.fire, aimX: this.state.aimX, aimY: this.state.aimY,
    };
  }
}
