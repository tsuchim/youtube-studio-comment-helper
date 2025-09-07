// @ts-check
// ESLint Flat Config for MV3 extension
import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    name: 'project-rules',
    files: ['src/**/*.js', 'background.js', 'scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-constant-condition': ['warn', { checkLoops: false }]
    }
  }
];
