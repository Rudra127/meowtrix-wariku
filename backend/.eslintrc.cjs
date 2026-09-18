module.exports = {
    env: {
        browser: true,
        es2022: true,
        node: true, // Enable Node.js environment
    },
    extends: 'eslint:recommended',
    parserOptions: {
        // 2022+ is required for private class members (`#method()`), which the services use to keep
        // their internals genuinely private. ecmaVersion 12 (ES2021) fails to parse them.
        ecmaVersion: 2022,
        sourceType: 'module',
    },
    rules: {
        'no-undef': 'off', // Disable no-undef to ignore undefined variables like process
        'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }], // Warn for unused vars, ignore those starting with _
    },
    globals: {
        process: 'readonly', // Declare process as a global variable
    },

};
