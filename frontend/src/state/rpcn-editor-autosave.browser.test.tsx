/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { expect, test } from '@rstest/core';

import { CREATE_AUTOSAVE_TARGET, rpcnEditorAutosave, useRpcnEditorAutosaveStore } from './rpcn-editor-autosave';

test('a full storage quota refuses a bigger draft and preserves the previous one', () => {
  const original = {
    targetKey: CREATE_AUTOSAVE_TARGET,
    name: 'work in progress',
    description: '',
    computeUnits: 1,
    tags: [],
    configYaml: 'input: {}',
  };
  expect(rpcnEditorAutosave.save(original)).toBe(true);
  localStorage.setItem('another-feature-cache', 'x'.repeat(5 * 1024 * 1024 - 1024));

  expect(rpcnEditorAutosave.save({ ...original, configYaml: `# ${'x'.repeat(2048)}` })).toBe(false);
  expect(rpcnEditorAutosave.get(CREATE_AUTOSAVE_TARGET)?.configYaml).toBe(original.configYaml);
  useRpcnEditorAutosaveStore.getState().refresh();
  expect(rpcnEditorAutosave.get(CREATE_AUTOSAVE_TARGET)?.configYaml).toBe(original.configYaml);
});
