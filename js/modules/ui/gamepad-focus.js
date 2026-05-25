// Reusable DOM focus traversal for gamepad-driven overlays.
// Consumers provide a root element; the controller finds focusable children
// and moves a visible `is-gamepad-focused` marker through them.

const FOCUSABLE_SELECTOR = [
    'button:not([disabled])',
    '[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    '[data-gamepad-focus]',
].join(',');

export class GamepadFocusController {
    constructor(root, opts = {}) {
        this.root = root || null;
        this.wrap = opts.wrap !== false;
        this.onBack = opts.onBack || null;
        this.onTab = opts.onTab || null;
        this.index = -1;
    }

    setRoot(root) {
        this.clear();
        this.root = root || null;
        this.index = -1;
    }

    items() {
        if (!this.root) return [];
        return Array.from(this.root.querySelectorAll(FOCUSABLE_SELECTOR))
            .filter((el) => !!(el.offsetParent || el === document.activeElement));
    }

    focusFirst() {
        const items = this.items();
        if (!items.length) return false;
        return this.focusIndex(0);
    }

    focusIndex(index) {
        const items = this.items();
        if (!items.length) return false;
        let next = index | 0;
        if (this.wrap) next = (next + items.length) % items.length;
        else next = Math.max(0, Math.min(items.length - 1, next));
        this.clear();
        this.index = next;
        const el = items[next];
        el.classList.add('is-gamepad-focused');
        if (typeof el.focus === 'function') el.focus({ preventScroll: false });
        return true;
    }

    move(delta) {
        const items = this.items();
        if (!items.length) return false;
        const cur = this.index >= 0 ? this.index : Math.max(0, items.indexOf(document.activeElement));
        return this.focusIndex(cur + delta);
    }

    activate() {
        const items = this.items();
        const el = items[this.index] || document.activeElement;
        if (!el || !this.root?.contains(el)) return false;
        if (typeof el.click === 'function') el.click();
        return true;
    }

    clear() {
        if (!this.root) return;
        for (const el of this.root.querySelectorAll('.is-gamepad-focused')) {
            el.classList.remove('is-gamepad-focused');
        }
    }

    handleAction(action) {
        if (action === 'up' || action === 'left') return this.move(-1);
        if (action === 'down' || action === 'right') return this.move(1);
        if (action === 'confirm') return this.activate();
        if (action === 'back' && this.onBack) return !!this.onBack();
        if ((action === 'prevTab' || action === 'nextTab') && this.onTab) {
            return !!this.onTab(action === 'nextTab' ? 1 : -1);
        }
        return false;
    }
}
