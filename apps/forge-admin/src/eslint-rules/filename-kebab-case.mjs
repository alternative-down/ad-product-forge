/**
 * Rule: filename-kebab-case
 *
 * Enforces that filenames (not just export names) follow kebab-case.
 * Reports on the Program node at file level.
 *
 * Exemptions (built-in):
 *   - index.ts(x) — directory entry points
 *   - route.ts(x) — TanStack Router convention
 *   - *.test.ts(x) — test files
 *   - .*  — hidden files
 *   - eslint.config.* — ESLint config files
 *   - routeTree.gen.ts — TanStack Router generated
 *   - __root.tsx — TanStack Router generated
 *   - node_modules paths
 */
export function meta() {
  return {
    meta: {
      type: 'suggestion',
      docs: {
        description: 'Enforce kebab-case filenames',
        recommended: false,
      },
      messages: {
        badFilename:
          'Filename "{{ filename }}" is not kebab-case. Use lowercase with hyphens (e.g., "{{ suggestion }}").',
      },
    },
    create(context) {
      return {
        'Program:exit'(node) {
          const filename = context.filename;
          if (!filename || filename === '<input>') return;
          if (filename.includes('node_modules') || filename.includes('dist')) return;

          const basename = filename.replace(/\\/g, '/').split('/').pop() ?? '';

          if (basename.startsWith('.')) return;
          if (/^index\.(tsx?|jsx?)$/.test(basename)) return;
          if (/^route\.(tsx?|jsx?)$/.test(basename)) return;
          if (/\.(test|spec)\.(tsx?|jsx?)$/.test(basename)) return;
          if (basename === 'routeTree.gen.ts') return;
          if (basename === '__root.tsx') return;
          // Framework/tooling config files
          if (basename === 'vitest.config.ts') return;
          if (basename === 'vitest.setup.ts') return;

          if (/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*\.(tsx?|ts|jsx?|js)$/.test(basename)) return;

          const suggestion = basename
            .replace(/([a-z])([A-Z])/g, '$1-$2')
            .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
            .toLowerCase()
            .replace(/[^a-z0-9-.]/g, '-')
            .replace(/--+/g, '-');

          context.report({
            loc: { line: 1, column: 0, endLine: 1, endColumn: 0 },
            messageId: 'badFilename',
            data: { filename: basename, suggestion },
          });
        },
      };
    },
  };
}
