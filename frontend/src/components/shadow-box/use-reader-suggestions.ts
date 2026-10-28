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

import { useMemo } from 'react';
import { useShadowBoxStore } from 'stores/shadow-box-store';

import { exemptNameFor } from './shadow-box-model';
import type { PrincipalSuggestion } from './shadow-box-settings-fields';

/** The users of the shadow links that read from this cluster, offered as exempt principals. */
export const useReaderSuggestions = () => {
  const readers = useShadowBoxStore((state) => state.topology?.readers);
  return useMemo<PrincipalSuggestion[]>(
    () =>
      (readers ?? []).flatMap((reader) => {
        const principal = exemptNameFor(reader);
        return principal === undefined ? [] : [{ principal, linkName: reader.linkName }];
      }),
    [readers]
  );
};
