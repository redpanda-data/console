/**
 * Copyright 2023 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

const esModules = [
    'es-cookie',
    'react-markdown',
    'vfile-message',
    'markdown-table',
    'unist-.*',
    'unified',
    'bail',
    'is-plain-obj',
    'trough',
    'remark-.*',
    'rehype-.*',
    'html-void-elements',
    'hast-util-.*',
    'zwitch',
    'hast-to-hyperscript',
    'hastscript',
    'web-namespaces',
    'mdast-util-.*',
    'escape-string-regexp',
    'micromark.*',
    'decode-named-character-reference',
    'character-entities',
    'property-information',
    'hast-util-whitespace',
    'space-separated-tokens',
    'comma-separated-tokens',
    'pretty-bytes',
    'ccount',
    'mdast-util-gfm',
    'gemoji',
    /** react-markdown 8.0.3 */
    'trim-lines',
    'jest-runtime',
    'vfile',
    /** react-markdown 7.2.1 */
    'longest-streak',
    /** misc */
    'emoticon',
    'ip-regex',
    'cidr-tools',
    'cidr-regex',
    'ip-bigint',
  ].join('|');
  
module.exports = {
    roots: ['<rootDir>/src'],
    collectCoverageFrom: ['src/**/*.{js,jsx,ts,tsx}', '!src/**/*.d.ts'],
    setupFiles: ['./jest.polyfills.js', 'react-app-polyfill/jsdom'],
    setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
    testMatch: [
      '<rootDir>/src/**/__tests__/**/*.{js,jsx,ts,tsx}',
      '<rootDir>/src/**/*.{spec,test}.{js,jsx,ts,tsx}',
    ],
    testEnvironment: 'jsdom',
    transform: {
      '^.+\\.tsx?$': '@swc/jest',
      '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$':
        '<rootDir>/config/jest/fileTransformer.js',
    },
    transformIgnorePatterns: [
        `[/\\\\]node_modules[/\\\\](?!${esModules}).+\\.(js|jsx|mjs|cjs|ts|tsx)$`,
    ],
    modulePaths: ['src'],
    moduleNameMapper: {
      '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$':
        '<rootDir>/config/jest/fileMock.js',
      '\\.(css|scss|less)$': '<rootDir>/config/jest/styleMock.js',
      '@fontsource/inter': '<rootDir>/config/jest/styleMock.js',
      'remark-emoji': '<rootDir>/config/jest/styleMock.js',
      'remark-gfm': '<rootDir>/config/jest/styleMock.js',
      'react-markdown': '<rootDir>/node_modules/react-markdown/react-markdown.min.js',
      'array-move': '<rootDir>/config/jest/fileMock.js',
    },
    moduleFileExtensions: [
      'web.js',
      'js',
      'web.ts',
      'ts',
      'web.tsx',
      'tsx',
      'json',
      'web.jsx',
      'jsx',
      'node',
    ],
    watchPlugins: [
      'jest-watch-typeahead/filename',
      'jest-watch-typeahead/testname',
    ],
    resetMocks: true,
    coveragePathIgnorePatterns: [
      '<rootDir>/proto',
      '<rootDir>/assets/',
      '<rootDir>/build/',
      '<rootDir>/public/',
      '<rootDir>/i18n/',
      '<rootDir>/test-utils/',
      '<rootDir>/mocks/',
    ],
    coverageReporters: ['text', 'html'],
    // TODO: Uncomment once there are actual tests, now there are almost none
    // coverageThreshold: {
    //   global: {
    //     branches: 50,
    //     functions: 65,
    //     lines: 65,
    //     statements: 65,
    //   },
    // },
};
