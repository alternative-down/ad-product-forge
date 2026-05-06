/**
 * Rule: no-useless-reexports
 *
 * Flags export patterns that simply pass through from another module
 * without any transformation. Covers:
 *   export * from './foo'
 *   export { x } from './foo'       (x is not renamed)
 *   export { x as y } from './foo'  (x != y)
 *   export { default } from './foo' (bare default)
 *   export { default as X } from './foo'
 */
export function meta() {
  return {
    meta: {
      type: 'problem',
      docs: {
        description: 'Disallow unnecessary re-exports that just pass through from another module',
        recommended: true,
      },
      messages: {
        noReExportStar: 'Avoid "export * from" — creates barrel files. Export named items directly.',
        noUselessNamedExport: 'Re-export "{{ exported }}" directly from its source module instead of passing through here.',
        noUselessDefaultReexport: 'Re-export "default" directly from its source module instead of passing through here.',
      },
    },
    create(context) {
      return {
        ExportAllDeclaration(node) {
          if (node.source?.type === 'Literal') {
            context.report({ node, messageId: 'noReExportStar' });
          }
        },
        ExportNamedDeclaration(node) {
          if (!node.source || node.source.type !== 'Literal') return;

          for (const spec of (node.specifiers ?? [])) {
            if (spec.type !== 'ExportSpecifier') continue;

            // Handle rename case: export { x as y } — allowed
            const exported = spec.exported?.type === 'Identifier' ? spec.exported.name : null;
            const local = spec.local?.type === 'Identifier' ? spec.local.name : null;
            if (!exported) continue;

            // export { x as y } from './foo' — local != exported, that's a real rename
            if (local && local !== exported) continue;

            // export { default } from './foo' or export { default as X } from './foo'
            if (exported === 'default') {
              context.report({ node: spec, messageId: 'noUselessDefaultReexport' });
            } else {
              // export { x } from './foo' where x == x (not renamed)
              context.report({
                node: spec,
                messageId: 'noUselessNamedExport',
                data: { exported },
              });
            }
          }
        },
      };
    },
  };
}
