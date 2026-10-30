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

import type { Monaco } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { useCallback, useEffect, useState } from 'react';

import type { ConnectComponentSpec } from '../types/schema';
import { deprecationMessage, findDeprecatedUsages } from '../utils/deprecation';

const MARKER_OWNER = 'rpcn-deprecation';
const REFRESH_DELAY_MS = 300;

type MountedEditor = { instance: editor.IStandaloneCodeEditor; monaco: Monaco };

/**
 * Warning markers on deprecated component keys, recomputed from the editor's own text so
 * uncontrolled editors stay in sync. Returns the mount callback that attaches them.
 */
export function useDeprecationMarkers(components: readonly ConnectComponentSpec[] | undefined) {
  const [mounted, setMounted] = useState<MountedEditor | null>(null);

  useEffect(() => {
    if (!(mounted && components)) {
      return;
    }
    const { instance, monaco } = mounted;
    const apply = () => {
      const model = instance.getModel();
      if (!model) {
        return;
      }
      try {
        const markers = findDeprecatedUsages(model.getValue(), components).map(({ notice, range }) => ({
          ...range,
          severity: monaco.MarkerSeverity.Warning,
          message: deprecationMessage(notice),
        }));
        monaco.editor.setModelMarkers(model, MARKER_OWNER, markers);
      } catch (error) {
        globalThis.reportError(error);
      }
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    apply();
    const contentSubscription = instance.onDidChangeModelContent(() => {
      clearTimeout(timer);
      timer = setTimeout(apply, REFRESH_DELAY_MS);
    });
    const modelSubscription = instance.onDidChangeModel(apply);
    return () => {
      clearTimeout(timer);
      contentSubscription.dispose();
      modelSubscription.dispose();
      const model = instance.getModel();
      if (model) {
        monaco.editor.setModelMarkers(model, MARKER_OWNER, []);
      }
    };
  }, [mounted, components]);

  return useCallback((instance: editor.IStandaloneCodeEditor, monaco: Monaco) => setMounted({ instance, monaco }), []);
}
