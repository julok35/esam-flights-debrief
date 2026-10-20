// Règles de qualité (npm run lint). La mise en forme relève de Prettier (npm run format), pas d'ESLint.
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['vendor/', 'node_modules/', 'test-results/', 'playwright-report/'] },
  js.configs.recommended,
  {
    rules: {
      // catch (e) {} volontaire : presse-papiers ou stockage local indisponibles ne doivent rien bloquer
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['error', { caughtErrors: 'none' }]
    }
  },
  { files: ['js/**/*.js'], languageOptions: { sourceType: 'module', globals: globals.browser } },
  { files: ['sw.js'], languageOptions: { sourceType: 'script', globals: globals.serviceworker } },
  {
    files: ['test/**/*.js', 'e2e/**/*.js', 'scripts/**/*.js', 'eslint.config.js', 'playwright.config.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } }
  }
];
