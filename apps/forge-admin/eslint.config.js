import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';
import { meta as noUselessReexports } from './src/eslint-rules/no-useless-reexports.mjs';
import { meta as filenameKebabCase } from './src/eslint-rules/filename-kebab-case.mjs';

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    plugins: {
      'no-useless-reexports': { rules: { 'no-useless-reexports': noUselessReexports() } },
      'filename-kebab-case': { rules: { 'filename-kebab-case': filenameKebabCase() } },
    },
    rules: {
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true, allowExportNames: ['Route'], extraHOCs: ['Route'] },
      ],
      'no-useless-reexports/no-useless-reexports': 'error',
      'filename-kebab-case/filename-kebab-case': 'warn',
    },
  },
  {
    files: ['src/routes/**/*.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
      'no-useless-reexports/no-useless-reexports': 'off',
    },
  },
  {
    files: ['src/components/ui/**/*.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
      'no-useless-reexports/no-useless-reexports': 'off',
    },
  },
  {
    files: ['src/lib/**/*.ts', 'src/lib/**/*.tsx', 'src/components/admin/index.ts'],
    rules: {
      'no-useless-reexports/no-useless-reexports': 'off',
    },
  },
]);
