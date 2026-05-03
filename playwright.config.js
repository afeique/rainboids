// @ts-check
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests',

    // Global timeout per test
    timeout: 60_000,

    // Expect timeout for assertions
    expect: { timeout: 10_000 },

    // Fail fast on first failure in CI
    forbidOnly: !!process.env.CI,

    // Retry flaky tests once
    retries: process.env.CI ? 1 : 0,

    // Run tests in parallel (but not perf tests — they need exclusive CPU)
    workers: process.env.PERF ? 1 : undefined,

    reporter: [
        ['list'],
        ['html', { outputFolder: 'tests/report', open: 'never' }],
        ['allure-playwright', { resultsDir: 'allure-results/e2e' }],
    ],

    use: {
        // Base URL for all tests
        baseURL: 'http://localhost:8090',

        // Capture screenshots on failure
        screenshot: 'only-on-failure',

        // Trace on retry
        trace: 'on-first-retry',

        // Viewport that fits the game well
        viewport: { width: 1280, height: 720 },
    },

    projects: [
        {
            // e2e — comprehensive end-to-end tests: AI playtester, enemy-specific,
            // HUD, powerups, waves, survival. Headless, no parallelism.
            name: 'e2e',
            testDir: './tests/e2e',
            timeout: 180_000,
            workers: 1,
            use: {
                headless: true,
                viewport: { width: 1280, height: 720 },
                launchOptions: {
                    args: [
                        '--autoplay-policy=no-user-gesture-required',
                        '--disable-web-security',
                    ],
                },
            },
        },
        {
            name: 'qa',
            testDir: './tests/qa',
            use: {
                ...devices['Desktop Chrome'],
                headless: true,
                // Suppress audio errors in headless
                launchOptions: {
                    args: [
                        '--autoplay-policy=no-user-gesture-required',
                        '--disable-web-security',
                    ],
                },
            },
        },
        {
            // performance — headless, consistent timing, runs in CI
            name: 'performance',
            testDir: './tests/performance',
            timeout: 120_000,
            workers: 1,
            use: {
                // Headless is the default for automated perf tests:
                //   • Consistent, reproducible timing across machines
                //   • Chrome's old headless uses CPU Canvas2D (Skia / SwiftShader)
                //     → ~7–10 fps on macOS. Thresholds reflect this.
                //
                // NOTE: --use-gl=egl was removed intentionally.  It is a Linux EGL
                // hint that causes macOS Chromium to fall back to SwiftShader
                // (software rasterizer), producing worse FPS than headless itself.
                headless: true,
                viewport: { width: 1280, height: 720 },
                launchOptions: {
                    args: [
                        '--autoplay-policy=no-user-gesture-required',
                        '--disable-web-security',
                    ],
                },
            },
        },
        {
            // screenshots — captures stills for the blog article. Not part
            // of the regular test suite; invoke explicitly:
            //   npx playwright test --project screenshots
            // Stills are written to /screenshots/ at project root.
            name: 'screenshots',
            testDir: './tests/screenshots',
            timeout: 120_000,
            workers: 1,
            use: {
                headless: true,
                viewport: { width: 1280, height: 720 },
                launchOptions: {
                    args: [
                        '--autoplay-policy=no-user-gesture-required',
                        '--disable-web-security',
                    ],
                },
            },
        },
        {
            // performance-gpu — headed, real GPU rendering, for local dev benchmarks.
            // Run with: npx playwright test --project=performance-gpu
            //           npm run benchmark:gpu
            //
            // On macOS:   uses Metal via Chromium's GPU compositing → 30–60 fps
            // On Linux:   uses OpenGL/Vulkan → 30–60 fps with a real GPU
            // On CI:      falls back to --headless automatically via HEADFUL env
            //
            // The window is minimized so it doesn't interfere with other work.
            name: 'performance-gpu',
            testDir: './tests/performance',
            timeout: 120_000,
            workers: 1,
            use: {
                headless: false,
                viewport: { width: 1280, height: 720 },
                launchOptions: {
                    args: [
                        '--autoplay-policy=no-user-gesture-required',
                        '--disable-web-security',
                        // Keep the window off-screen so it doesn't steal focus
                        '--start-minimized',
                        '--window-position=0,10000',
                        // Let Chrome choose the best GL backend for the platform
                        // (Metal on macOS, EGL on Linux with Vulkan, Desktop OpenGL otherwise)
                        // DO NOT add --use-gl=egl here — it breaks macOS GPU acceleration
                    ],
                },
            },
        },
    ],

    // Start the Vite dev server before tests, reuse if already running
    webServer: {
        command: 'npm run dev',
        port: 8090,
        reuseExistingServer: true,
        timeout: 30_000,
    },
});
