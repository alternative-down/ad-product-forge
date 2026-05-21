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
              message:
                'Dynamic import() is not allowed. If required (CJS/ESM bridge, performance), add: // eslint-disable-next-line no-dynamic-imports — <reason>',
            });
          }
        },
      };
    },
  };
}

// Rule creator function: enforce kebab-case filenames
function makeKebabCaseFilenameRule() {
  return {
    meta: {
      type: 'layout',
      docs: { description: 'Enforce kebab-case for file and directory names' },
      schema: [],
    },
    create(context) {
      return {
        'Program:exit'(node) {
          const filename = context.filename;
          // Skip if no filename (e.g., stdin)
          if (!filename || filename === '<input>') return;
          // Get base filename without directory
          const parts = filename.replace(/\\/g, '/').split('/');
          const basename = parts[parts.length - 1];
          // Skip if no extension (likely index file handled differently) or in node_modules/dist
          if (basename.includes('node_modules') || basename.includes('dist')) return;
          // Allow .git/ and config files at root level
          if (basename.startsWith('.')) return;
          // Check if filename matches kebab-case pattern
          // Allow: index.tsx, route.tsx, *.test.ts, config files with alphanumeric names
          // Patterns allowed:
          // - index.ts, index.tsx
          // - route.ts, route.tsx
          // - *-section.tsx, *-dialog.tsx, etc.
          // - *.test.ts, *.test.tsx
          // - files starting with lowercase letter followed by alphanumeric/kebab
          const isKebab = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(\.tsx|\.ts|\.js|\.jsx)?$/.test(basename);
          const isIndex = /^index\.(tsx?|jsx?)$/.test(basename);
          const isRoute = /^route\.(tsx?|jsx?)$/.test(basename);
          const isTest = /\.(test|spec)\.(tsx?|jsx?)$/.test(basename);
          const isConfig = /^[a-z]+\.(config|types)\.(tsx?|jsx?)$/.test(basename);
          if (!isKebab && !isIndex && !isRoute && !isTest && !isConfig) {
            context.report({
              node,
              message: `Filename "${basename}" must be kebab-case (e.g., my-component.tsx, agent-log.test.ts). Allowed patterns: index.tsx, route.tsx, *.test.ts, kebab-case.tsx`,
            });
          }
        },
      };
    },
  };
}

// Rule creator function: prohibit unnecessary reexports
function makeNoUnnecessaryReexportsRule() {
  return {
    meta: {
      type: 'suggestion',
      docs: {
        description:
          'Disallow unnecessary re-export statements (bare or simple re-exports that do not add value)',
        url: 'https://github.com/alternative-down/ad-product-forge/issues/1627',
      },
      schema: [],
      messages: {
        unnecessaryReexport:
          'Unnecessary re-export: "{{source}}" re-exports {{count}} item(s) from "{{specifier}}" with no transformation or aggregation. Either remove the re-export, consolidate it, or add a meaningful comment explaining its purpose.',
        bareReexport:
          'Unnecessary bare re-export: this export simply re-exports everything from "{{specifier}}" without adding any value. Remove it or consolidate imports.',
      },
    },
    create(context) {
      function hasDisableComment(node) {
        const tokenBefore = context.sourceCode.getTokenBefore(node, { includeComments: true });
        return tokenBefore?.value?.includes('no-reexport-check');
      }

      function getSource(spec) {
        if (spec.type === 'ExportAllDeclaration') return spec.source?.value || '';
        if (spec.type === 'ExportNamedDeclaration' && spec.source) {
          return spec.source.value || '';
        }
        return '';
      }

      function countExports(spec, sourceValue) {
        if (spec.type === 'ExportAllDeclaration') return 'all';
        if (spec.type === 'ExportNamedDeclaration') {
          if (!spec.source) return null; // local export, ok
          if (spec.specifiers && spec.specifiers.length > 0) {
            return spec.specifiers.length;
          } else if (spec.specifiers?.length === 0 && spec.source) {
            return 'all';
          }
        }
        return null;
      }

      return {
        ExportAllDeclaration(node) {
          if (hasDisableComment(node)) return;
          context.report({
            node,
            messageId: 'bareReexport',
            data: { specifier: node.source?.value || '' },
          });
        },
        ExportNamedDeclaration(node) {
          if (!node.source) return; // local export, ok
          if (hasDisableComment(node)) return;
          // Type-only re-exports are always allowed — TypeScript best practice,
          // does not pollute the JavaScript runtime namespace
          if (node.specifiers && node.specifiers.every((s) => s.exportKind === 'type')) return;
          const source = node.source.value || '';
          const count = countExports(node, source);
          if (count === 'all') {
            context.report({
              node,
              messageId: 'bareReexport',
              data: { specifier: source },
            });
          } else if (count !== null && count > 0) {
            context.report({
              node,
              messageId: 'unnecessaryReexport',
              data: { source, count: count.toString(), specifier: source },
            });
          }
        },
      };
    },
  };
}

export default defineConfig([
  globalIgnores(['dist', 'node_modules', '.turbo']),

  // Ignore all compiled dist files regardless of location
  { ignores: ['**/dist/**/*.js', '**/dist/**/*.mjs'] },

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
      // Test files use mock typing patterns (as any, as unknown as) that are
      // legitimate and standard. Also, unused vars from shared describe blocks
      // are common noise. Disable all strict rules for test files.
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  // ── Source files ────────────────────────────────────────────────────────────
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: ['src/**/*.test.ts', 'src/**/*.test.tsx', '**/dist/**/*.js'],
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
          './packages/agent-runtime-core/tsconfig.json',
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
      'kebab-case-filename': {
        rules: {
          'kebab-case-filename': makeKebabCaseFilenameRule(),
        },
        meta: { name: 'kebab-case-filename', version: '1.0.0' },
      },
      'reexport-check': {
        rules: {
          'no-unnecessary-reexports': makeNoUnnecessaryReexportsRule(),
        },
        meta: { name: 'no-unnecessary-reexports', version: '1.0.0' },
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
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
      // #1629: enforce kebab-case filenames
      'kebab-case-filename/kebab-case-filename': 2,
      // #1627: prohibit unnecessary reexports
      'reexport-check/no-unnecessary-reexports': 2,
    },
  },
]);
