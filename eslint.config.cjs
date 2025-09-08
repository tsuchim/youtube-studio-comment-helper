module.exports = [
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        chrome: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        clearTimeout: 'readonly',
        setTimeout: 'readonly',
        document: 'readonly',
        window: 'readonly',
        Element: 'readonly',
        MutationObserver: 'readonly',
        IntersectionObserver: 'readonly',
        CustomEvent: 'readonly',
        WeakMap: 'readonly',
        Set: 'readonly',
        Map: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-console': 'off',
      'prefer-const': 'error',
      'no-var': 'error'
    }
  },
  {
    files: ['scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        process: 'readonly',
        Buffer: 'readonly',
        require: 'readonly',
        module: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly'
      }
    }
  }
];
