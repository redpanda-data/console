/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { loader } from '@monaco-editor/react';
// biome-ignore lint/performance/noNamespaceImport: Monaco's loader needs the complete runtime
import * as monaco from 'monaco-editor';

// Use `new Worker(new URL(...))` so rsbuild bundles each as its own chunk
// (needed for monaco-yaml's CJS/ESM interop).
window.MonacoEnvironment = {
  getWorker(_workerId, label) {
    switch (label) {
      case 'json':
        return new Worker(new URL('monaco-editor/esm/vs/language/json/json.worker', import.meta.url));
      case 'yaml':
        return new Worker(new URL('monaco-yaml/yaml.worker', import.meta.url));
      case 'typescript':
      case 'javascript':
        return new Worker(new URL('monaco-editor/esm/vs/language/typescript/ts.worker', import.meta.url));
      default:
        return new Worker(new URL('monaco-editor/esm/vs/editor/editor.worker', import.meta.url));
    }
  },
};

// Tell monaco editor where to load dependencies from
loader.config({ monaco });

// Override `vs` (the default theme `@monaco-editor/react` applies) so every
// editor without an explicit `theme` prop uses these colors.
const kowlThemeColors = {
  'editor.background': '#fcfcfc',
  'editorGutter.background': '#00000018',
  'editor.lineHighlightBackground': '#aaaaaa20',
  'editor.lineHighlightBorder': '#00000000',
  'editorLineNumber.foreground': '#8c98a8',
  'editorOverviewRuler.background': '#606060',
};
monaco.editor.defineTheme('vs', {
  base: 'vs',
  inherit: true,
  colors: kowlThemeColors,
  rules: [],
});
monaco.editor.defineTheme('kowl', {
  base: 'vs',
  inherit: false,
  colors: kowlThemeColors,
  rules: [],
});

// biome-ignore lint/performance/noBarrelFile: on-demand adapter configures the shared runtime before either editor mounts
export { DiffEditor, default } from '@monaco-editor/react';
