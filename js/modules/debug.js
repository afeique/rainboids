// Debug utility for conditional console logging

/**
 * Runtime debug mode flag - can be toggled during gameplay
 */
let DEBUG_MODE = false;

/**
 * Custom debug console that only logs when DEBUG_MODE is true
 */
export const debugConsole = {
    /**
     * Log a message to console (only if DEBUG_MODE is true)
     * @param {...any} args - Arguments to pass to console.log
     */
    log: (...args) => {
        if (DEBUG_MODE) {
            console.log(...args);
        }
    },

    /**
     * Log a warning to console (only if DEBUG_MODE is true)
     * @param {...any} args - Arguments to pass to console.warn
     */
    warn: (...args) => {
        if (DEBUG_MODE) {
            console.warn(...args);
        }
    },

    /**
     * Log an error to console (only if DEBUG_MODE is true)
     * @param {...any} args - Arguments to pass to console.error
     */
    error: (...args) => {
        if (DEBUG_MODE) {
            console.error(...args);
        }
    },

    /**
     * Log an info message to console (only if DEBUG_MODE is true)
     * @param {...any} args - Arguments to pass to console.info
     */
    info: (...args) => {
        if (DEBUG_MODE) {
            console.info(...args);
        }
    },

    /**
     * Log a debug message with timestamp (only if DEBUG_MODE is true)
     * @param {string} category - Category/module name
     * @param {...any} args - Arguments to log
     */
    debug: (category, ...args) => {
        if (DEBUG_MODE) {
            const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
            console.log(`[${timestamp}] [${category}]`, ...args);
        }
    },

    /**
     * Group console logs (only if DEBUG_MODE is true)
     * @param {string} label - Group label
     */
    group: (label) => {
        if (DEBUG_MODE) {
            console.group(label);
        }
    },

    /**
     * End console group (only if DEBUG_MODE is true)
     */
    groupEnd: () => {
        if (DEBUG_MODE) {
            console.groupEnd();
        }
    },

    /**
     * Log a table to console (only if DEBUG_MODE is true)
     * @param {any} data - Data to display as table
     */
    table: (data) => {
        if (DEBUG_MODE) {
            console.table(data);
        }
    },

    /**
     * Start a timer (only if DEBUG_MODE is true)
     * @param {string} label - Timer label
     */
    time: (label) => {
        if (DEBUG_MODE) {
            console.time(label);
        }
    },

    /**
     * End a timer (only if DEBUG_MODE is true)
     * @param {string} label - Timer label
     */
    timeEnd: (label) => {
        if (DEBUG_MODE) {
            console.timeEnd(label);
        }
    }
};

/**
 * Shorthand debug function for quick logging
 * @param {...any} args - Arguments to log
 */
export const debug = (...args) => debugConsole.log(...args);

/**
 * Toggle debug mode at runtime
 * @returns {boolean} New DEBUG_MODE state
 */
export const toggleDebugMode = () => {
    DEBUG_MODE = !DEBUG_MODE;
    const status = DEBUG_MODE ? 'ENABLED' : 'DISABLED';
    console.log(`🐛 DEBUG MODE ${status}`);
    return DEBUG_MODE;
};

/**
 * Set debug mode to a specific state
 * @param {boolean} enabled - Whether to enable debug mode
 * @returns {boolean} New DEBUG_MODE state
 */
export const setDebugMode = (enabled) => {
    DEBUG_MODE = !!enabled;
    const status = DEBUG_MODE ? 'ENABLED' : 'DISABLED';
    console.log(`🐛 DEBUG MODE ${status}`);
    return DEBUG_MODE;
};

/**
 * Get current debug mode state
 * @returns {boolean} Current DEBUG_MODE state
 */
export const getDebugMode = () => DEBUG_MODE;
