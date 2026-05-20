module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Allow 'config' as an additional valid commit type alongside the
    // conventional-changelog standard types (feat, fix, docs, etc.).
    'type-enum': [
      2,
      'always',
      [
        'build',
        'chore',
        'ci',
        'config',
        'docs',
        'feat',
        'fix',
        'perf',
        'refactor',
        'revert',
        'style',
        'test',
      ],
    ],
  },
};
