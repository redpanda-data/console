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
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';

import type { ConnectComponentSpec } from '../types/schema';
import { deprecationMessage, findDeprecatedUsages } from '../utils/deprecation';

const MARKER_OWNER = 'rpcn-deprecation';

type MountedEditor = { instance: editor.IStandaloneCodeEditor; monaco: Monaco };

/** The deprecated components `yaml` uses, marked as warnings in the editor `attach` is given. */
export function useDeprecationMarkers(yaml: string, components: readonly ConnectComponentSpec[] | undefined) {
  const [mounted, setMounted] = useState<MountedEditor | null>(null);
  const deferredYaml = useDeferredValue(yaml);
  const usages = useMemo(
    () => (components ? findDeprecatedUsages(deferredYaml, components) : []),
    [deferredYaml, components]
  );

  useEffect(() => {
    const model = mounted?.instance.getModel();
    if (!(mounted && model)) {
      return;
    }
    const { monaco } = mounted;
    const markers = usages.map(({ notice, range }) => ({
      ...range,
      severity: monaco.MarkerSeverity.Warning,
      message: deprecationMessage(notice),
    }));
    monaco.editor.setModelMarkers(model, MARKER_OWNER, markers);
    return () => monaco.editor.setModelMarkers(model, MARKER_OWNER, []);
  }, [mounted, usages]);

  const attach = useCallback(
    (instance: editor.IStandaloneCodeEditor, monaco: Monaco) => setMounted({ instance, monaco }),
    []
  );
  return { usages, attach };
}
