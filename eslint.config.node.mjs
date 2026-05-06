import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Rule creator function
function makeNoDynamicImportsRule() {
  return {
    meta: {
      type: 'problem',
      docs: { description: 'Disallow dynamic import() without disable comment' },
      schema: [],
    },
    create(context) {
      const sourceCode = context.sourceCode;
      return {
        ImportExpression(node) {
          const tokenBefore = sourceCode.getTokenBefore(node, { includeComments: true });
          const hasDisable = tokenBefore?.value?.includes('no-dynamic-imports');
          if (!hasDisable) {
            context.report({
              node,
              message: 'Dynamic import() is not allowed. If required (CJS/ESM bridge, performance), add: // eslint-disable-next-line no-dynamic-imports — <reason>',
            });
          }
        },
      };
    },
  };
}

export default defineConfig([
  globalIgnores(['dist', 'node_modules', '.turbo']),

  // ── Test files ───────────────────────────────────────────────────────────────
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

  // ── Source files ────────────────────────────────────────────────────────────
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
        tsconfigRootDir: __dirname,
        project: [
          './apps/forge/tsconfig.json',
          './packages/forge-runtime-core/tsconfig.json',
        ],
        projectFolderIgnoreList: ['dist', 'node_modules', '.turbo', 'examples'],
      },
    },
    plugins: {
      'no-dynamic-imports': {
        rules: {
          'no-dynamic-imports': makeNoDynamicImportsRule(),
        },
        meta: { name: 'no-dynamic-imports', version: '1.0.0' },
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/strict-boolean-expressions': [
        'error',
        {
          allowString: true,
          allowNumber: true,
          allowNullableBoolean: false,
          allowNullableEnum: true,
          allowAny: false,
        },
      ],
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/return-await': ['error', 'always'],
      // #1591: block dynamic imports without disable comment
      'no-dynamic-imports/no-dynamic-imports': 2,
    },
  },
]);
