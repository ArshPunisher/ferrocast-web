// @ts-check
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.astro/**',
      'apps/video/out/**',
      'apps/site/public/**',
      'brand/png/**',
      '**/test-results/**',
      '**/playwright-report/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['**/*.tsx', 'apps/dashboard/src/**/*.ts', 'packages/ui/src/**/*.ts'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    // Overlays render viewer text: forbid the HTML sinks outright (R-37).
    files: ['apps/overlays/src/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          property: 'innerHTML',
          message: 'Viewer text is untrusted: build nodes with textContent (R-37).',
        },
        { property: 'outerHTML', message: 'Viewer text is untrusted (R-37).' },
        { property: 'insertAdjacentHTML', message: 'Viewer text is untrusted (R-37).' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='write'][callee.object.name='document']",
          message: 'No document.write.',
        },
      ],
    },
  },
  {
    files: ['**/scripts/**', 'brand/**', 'tools/**', '**/*.config.*'],
    rules: { 'no-console': 'off' },
  },
)
