module.exports = {
    env: {
        browser: true,
        es2021: true,
        node: true, // Enable Node.js environment
    },
    extends: 'eslint:recommended',
    parserOptions: {
        ecmaVersion: 12,
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
