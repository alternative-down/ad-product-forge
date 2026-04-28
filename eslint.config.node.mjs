import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig([
  globalIgnores(['dist', 'node_modules', '.turbo']),

  // ── Test files: non-type-checked rules only ─────────────────────────────
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.jest },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // ── Source files ─────────────────────────────────────────────────────────
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
      parser: tseslint.parser,
      parserOptions: {
        // tsconfigRootDir makes each package's own tsconfig discoverable.
        tsconfigRootDir: __dirname,
        project: [
          './apps/forge/tsconfig.json',
          './packages/forge-runtime-core/tsconfig.json',
        ],
        projectFolderIgnoreList: [
          'dist',
          'node_modules',
          '.turbo',
          'examples',
        ],
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Enforce explicit null checks over truthiness coercion.
      // Use ?? (nullish coalescing) for null/undefined fallbacks on
      // nullable fields; use || only when treating falsy values
      // (0, '', false) as missing is the intended behavior.
      '@typescript-eslint/strict-boolean-expressions': [
        'warn',
        {
          allowString: true,
          allowNumber: true,
          allowNullableBoolean: false,
          allowNullableEnum: true,
          allowAny: false,
        },
      ],
    },
  },
]);
