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

import type { ReactNode } from 'react';

import { splitControlChars } from './split-control-chars';
import { getControlCharacterName } from '../helpers';

function controlCharElements(code: number, position: number) {
  const label = (
    <span className="controlChar" key={`char-${position}`}>
      {getControlCharacterName(code)}
    </span>
  );
  const elements: ReactNode[] = code === 10 ? [label, <br key={`break-${position}`} />] : [label];
  return elements;
}

/** Renders text with its ASCII control characters spelled out, for example `LF` for a line feed. */
export function highlightControlChars(str: string, maxLength?: number) {
  return splitControlChars(str, maxLength).flatMap<ReactNode>((part, position) =>
    typeof part === 'string' ? [part] : controlCharElements(part, position)
  );
}
