// js/mp/mp-input.js — keyboard + mouse capture for the MP client.
//
// Produces the same input frame shape the shared sim consumes:
//   { up, down, left, right, fire, aimX, aimY }
// aimX/aimY are in WORLD coordinates (arena space), mapped from the cursor via
// the canvas's on-screen scale so aiming is correct regardless of window size.

export class MpInput {
  constructor(canvas) {
    this.canvas = canvas;
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
      const sx = this.canvas.width / r.width;
      const sy = this.canvas.height / r.height;
      this.state.aimX = (clientX - r.left) * sx;
      this.state.aimY = (clientY - r.top) * sy;
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
