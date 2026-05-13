/**
 * @jest-environment allure-jest/jsdom
 */

/**
 * tests/unit/ui/mobile-tutorial.test.js — unit tests for the mobile
 * first-run tutorial overlay (js/modules/ui/mobile-tutorial.js).
 *
 * The overlay is built entirely via DOM creation + an injected <style>
 * tag, so these tests run under jsdom (via the `allure-jest/jsdom`
 * environment) to exercise real createElement / appendChild /
 * getElementById behavior.
 *
 * `isMobile()` from `js/modules/platform/platform-detect.js` is not
 * stubbed via jest.mock — ESM exports are read-only under the
 * experimental VM modules loader. Instead, we use the URL-override
 * hook (`_resetUrlOverrideForTests`) to flip the mobile/desktop state.
 * This is the same pattern the mobile-auto-fire test suite uses.
 *
 * jsdom-provided localStorage is wiped between tests for isolation.
 */

import {
    mountMobileTutorial,
    resetTutorialSeen,
    forceMountTutorial,
    STORAGE_KEY,
    __TEST_ONLY__,
} from '../../../js/modules/ui/mobile-tutorial.js';
import { _resetUrlOverrideForTests } from '../../../js/modules/platform/platform-detect.js';

const { OVERLAY_ID, STYLE_ID, DISMISS_BUTTON_ID, TUTORIAL_ITEMS } = __TEST_ONLY__;

// Force mobile / desktop by flipping the `?mobile=` URL override that
// platform-detect.js caches at module load. `true` = always mobile,
// `false` = always desktop, `null` = re-read from window.location.
function setMobile(force) {
    _resetUrlOverrideForTests(force);
}

beforeEach(() => {
    // Clean DOM between tests so id-based lookups don't cross-pollinate.
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    window.localStorage.clear();
    setMobile(true); // default: pretend we're on a mobile device
});

afterAll(() => {
    setMobile(null);
});

describe('mountMobileTutorial — gating', () => {
    it('returns { mounted: false, reason: "not-mobile" } when isMobile is false', () => {
        setMobile(false);
        const result = mountMobileTutorial();
        expect(result).toEqual({ mounted: false, reason: 'not-mobile' });
        expect(document.getElementById(OVERLAY_ID)).toBeNull();
    });

    it('returns { mounted: false, reason: "already-seen" } when storage flag is set', () => {
        window.localStorage.setItem(STORAGE_KEY, '1');
        const result = mountMobileTutorial();
        expect(result).toEqual({ mounted: false, reason: 'already-seen' });
        expect(document.getElementById(OVERLAY_ID)).toBeNull();
    });

    it('returns { mounted: true } when mobile + no flag', () => {
        const result = mountMobileTutorial();
        expect(result).toEqual({ mounted: true });
    });
});

describe('mountMobileTutorial — DOM construction', () => {
    it('mounts an overlay element into the document', () => {
        mountMobileTutorial();
        const overlay = document.getElementById(OVERLAY_ID);
        expect(overlay).not.toBeNull();
        expect(overlay.parentNode).toBe(document.body);
    });

    it('injects a <style> element into document.head', () => {
        mountMobileTutorial();
        const style = document.getElementById(STYLE_ID);
        expect(style).not.toBeNull();
        expect(style.tagName.toLowerCase()).toBe('style');
        expect(style.parentNode).toBe(document.head);
        // sanity: rule references the overlay id
        expect(style.textContent).toContain(`#${OVERLAY_ID}`);
    });

    it('renders exactly 4 instructional items', () => {
        mountMobileTutorial();
        const items = document.querySelectorAll(`#${OVERLAY_ID} .mt-item`);
        expect(items.length).toBe(4);
        // Exported list is the source of truth.
        expect(TUTORIAL_ITEMS).toHaveLength(4);
        for (let i = 0; i < TUTORIAL_ITEMS.length; i++) {
            const li = items[i];
            expect(li.textContent).toContain(TUTORIAL_ITEMS[i].icon);
            expect(li.textContent).toContain(TUTORIAL_ITEMS[i].text);
        }
    });

    it('renders a dismiss button with touch-target ≥ 44px height', () => {
        mountMobileTutorial();
        const button = document.getElementById(DISMISS_BUTTON_ID);
        expect(button).not.toBeNull();
        expect(button.tagName.toLowerCase()).toBe('button');
        expect(button.textContent).toBe('Got it!');
        // The CSS rule for `.mt-dismiss` sets min-height: 60px (well above
        // the 44px Apple HIG / Material accessibility floor). Verify by
        // scraping the injected stylesheet — jsdom does not compute
        // layout, so we assert the rule text instead of getBoundingClientRect.
        const css = document.getElementById(STYLE_ID).textContent;
        const match = css.match(/button\.mt-dismiss\s*\{[^}]*min-height:\s*(\d+)px/);
        expect(match).not.toBeNull();
        const minHeightPx = parseInt(match[1], 10);
        expect(minHeightPx).toBeGreaterThanOrEqual(44);
    });

    it('ships distinct portrait + landscape font-size rules for readable text', () => {
        mountMobileTutorial();
        const css = document.getElementById(STYLE_ID).textContent;
        // Portrait (default) .mt-item font-size = 18px (per spec).
        const portraitMatch = css.match(/#mobile-tutorial-overlay \.mt-item\s*\{[^}]*font-size:\s*(\d+)px/);
        expect(portraitMatch).not.toBeNull();
        const portraitPx = parseInt(portraitMatch[1], 10);
        expect(portraitPx).toBe(18);
        // Landscape override exists with a smaller font-size.
        expect(css).toMatch(/@media \(orientation: landscape\)/);
        const landscapeBlock = css.split('@media (orientation: landscape)')[1];
        expect(landscapeBlock).toBeDefined();
        const landscapeMatch = landscapeBlock.match(/\.mt-item\s*\{[^}]*font-size:\s*(\d+)px/);
        expect(landscapeMatch).not.toBeNull();
        const landscapePx = parseInt(landscapeMatch[1], 10);
        expect(landscapePx).toBeLessThan(portraitPx);
    });
});

describe('mountMobileTutorial — dismissal', () => {
    it('clicking the dismiss button removes the overlay and sets the storage flag', () => {
        mountMobileTutorial();
        const button = document.getElementById(DISMISS_BUTTON_ID);
        expect(document.getElementById(OVERLAY_ID)).not.toBeNull();
        button.click();
        expect(document.getElementById(OVERLAY_ID)).toBeNull();
        expect(window.localStorage.getItem(STORAGE_KEY)).toBe('1');
    });

    it('after dismissal, a subsequent mount call returns "already-seen"', () => {
        mountMobileTutorial();
        document.getElementById(DISMISS_BUTTON_ID).click();
        const second = mountMobileTutorial();
        expect(second).toEqual({ mounted: false, reason: 'already-seen' });
    });
});

describe('resetTutorialSeen', () => {
    it('clears the storage flag so the tutorial can be shown again', () => {
        window.localStorage.setItem(STORAGE_KEY, '1');
        expect(window.localStorage.getItem(STORAGE_KEY)).toBe('1');
        resetTutorialSeen();
        expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
        // Mount should now succeed again.
        const result = mountMobileTutorial();
        expect(result).toEqual({ mounted: true });
    });
});

describe('forceMountTutorial', () => {
    it('mounts even when the storage flag is set', () => {
        window.localStorage.setItem(STORAGE_KEY, '1');
        const result = forceMountTutorial();
        expect(result).toEqual({ mounted: true });
        expect(document.getElementById(OVERLAY_ID)).not.toBeNull();
    });

    it('two consecutive calls do not duplicate-mount (idempotent)', () => {
        const first = forceMountTutorial();
        expect(first).toEqual({ mounted: true });
        const second = forceMountTutorial();
        expect(second).toEqual({ mounted: false, reason: 'already-mounted' });
        // Exactly one overlay node, exactly one style node.
        expect(document.querySelectorAll(`#${OVERLAY_ID}`).length).toBe(1);
        expect(document.querySelectorAll(`#${STYLE_ID}`).length).toBe(1);
    });

    it('mounts even when isMobile is false (debug / replay path)', () => {
        setMobile(false);
        const result = forceMountTutorial();
        expect(result).toEqual({ mounted: true });
        expect(document.getElementById(OVERLAY_ID)).not.toBeNull();
    });
});
