// @ts-check
// Analyse statique : règles recommandées d'ESLint, de typescript-eslint et d'Angular, plus les règles
// SonarJS (celles de SonarQube pour JavaScript et TypeScript).
const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');
const sonarjs = require('eslint-plugin-sonarjs');

module.exports = defineConfig([
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
      sonarjs.configs.recommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'app',
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'app',
          style: 'kebab-case',
        },
      ],
      // Complexité cognitive : seuil par défaut de SonarQube
      'sonarjs/cognitive-complexity': ['error', 15],
      // Une propriété peut être écartée d'un objet par décomposition ({ retiree: _, ...reste })
      '@typescript-eslint/no-unused-vars': [
        'error',
        { ignoreRestSiblings: true, argsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['**/*.spec.ts'],
    rules: {
      // Les tests construisent des données factices, jetons compris
      'sonarjs/no-hardcoded-passwords': 'off',
      'sonarjs/no-hardcoded-secrets': 'off',
    },
  },
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {},
  },
]);
