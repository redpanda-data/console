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

import { ChevronDownIcon, ChevronUpIcon } from 'components/icons';
import { Button } from 'components/redpanda-ui/components/button';
import { useState } from 'react';

export function ExpandableText(p: { children: string; maxChars: number }) {
  const [expanded, setExpanded] = useState(false);

  const showExpander = p.children.length > p.maxChars;

  const isTruncated = showExpander && !expanded;
  const text = isTruncated ? p.children.slice(0, p.maxChars) : p.children;

  // A span: valid in inline and <p> slots alike.
  return (
    <span>
      {text}

      {Boolean(isTruncated) && '...'}

      {Boolean(showExpander) && (
        <Button
          aria-expanded={expanded}
          className="h-auto px-2 align-baseline"
          onClick={() => setExpanded(!expanded)}
          variant="link"
        >
          {expanded ? (
            <span className="whitespace-nowrap">
              less <ChevronUpIcon className="inline size-4" />
            </span>
          ) : (
            <span className="whitespace-nowrap">
              more <ChevronDownIcon className="inline size-4" />
            </span>
          )}
        </Button>
      )}
    </span>
  );
}
