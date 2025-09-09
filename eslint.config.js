import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'samples/**',
      '.github/**'
    ]
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        window: 'readonly',
        document: 'readonly',
        chrome: 'readonly',
        localStorage: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        NodeFilter: 'readonly',
        MutationObserver: 'readonly',
        IntersectionObserver: 'readonly',
        CustomEvent: 'readonly',
        WeakMap: 'readonly',
        Map: 'readonly',
        Set: 'readonly',
        fetch: 'readonly',
        getComputedStyle: 'readonly',
        process: 'readonly',
        URL: 'readonly',
        Element: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'off'
    }
  }
];
