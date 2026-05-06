export const meta = {
  type: 'problem',
  docs: {
    description: 'Disallow dynamic import() expressions without explicit disable comment',
    recommended: false,
  },
  schema: [],
};

export function create(context) {
  const sourceCode = context.sourceCode;

  return {
    ImportExpression(node) {
      const tokenBefore = sourceCode.getTokenBefore(node, { includeComments: true });
      const hasDisable = tokenBefore?.value?.includes('no-dynamic-imports');

      if (!hasDisable) {
        context.report({
          node,
          message:
            'Dynamic import() is not allowed. ' +
            'If required (CJS/ESM bridge, performance), add: ' +
            '// eslint-disable-next-line no-dynamic-imports — <reason>',
        });
      }
    },
  };
}
