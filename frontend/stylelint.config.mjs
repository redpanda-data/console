import noImportant from './lint-rules/stylelint/no-important.mjs';

export default {
  plugins: [noImportant],
  extends: ['stylelint-config-standard'],
  ignoreDisables: true,
  rules: {
    'alpha-value-notation': 'number',
    'custom-property-pattern': '^(?:[a-z][a-z0-9]*(?:-[a-z0-9]+)*|text-[a-z0-9-]+--line-height)$',
    'lightness-notation': 'number',
    'hue-degree-notation': 'number',
    'import-notation': 'string',
    'at-rule-no-unknown': [
      true,
      {
        ignoreAtRules: [
          'apply',
          'config',
          'custom-variant',
          'plugin',
          'reference',
          'source',
          'theme',
          'utility',
          'variant',
        ],
      },
    ],
    'at-rule-prelude-no-invalid': [true, { ignoreAtRules: ['apply'] }],
    'nesting-selector-no-missing-scoping-root': [true, { ignoreAtRules: ['utility'] }],
    'no-invalid-position-declaration': [true, { ignoreAtRules: ['utility'] }],
    'declaration-no-important': null,
    'console/no-important': true,
    'selector-max-id': 0,
    'property-disallowed-list': ['/^(?:(?:margin|padding|border)-(?:left|right)(?:-.+)?|left|right)$/'],
    'declaration-property-value-disallowed-list': {
      'text-align': ['left', 'right'],
      '/^(?:min-)?(?:width|inline-size)$/': ['/\\b100vw\\b/i'],
      '/^(?:(?:min|max)-)?(?:height|block-size)$/': ['/\\dvh\\b/i'],
      float: ['/^(?!none$)/'],
      '/^outline(?:-width|-style)?$/': ['/^(?:none|0(?:px)?)$/'],
    },
  },
  ignoreFiles: [
    '**/node_modules/**',
    'src/assets/fonts/**',
    'build/**',
    'src/components/redpanda-ui/**',
    'src/protogen/**',
    '**/*.{gen,generated}.css',
  ],
};
