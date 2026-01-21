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

import { Button } from 'components/redpanda-ui/components/button';
import { Text } from 'components/redpanda-ui/components/typography';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { FC } from 'react';
import { useMemo, useState } from 'react';
import { prettyBytes } from 'utils/utils';

import { ContentPanel } from './content-panel';
import { getPreview } from '../utils/transcript-formatters';

type Props = {
  title: string;
  content: string;
  defaultExpanded?: boolean;
};

const SMALL_PAYLOAD_THRESHOLD = 2 * 1024; // 2KB
const PREVIEW_LINES = 3;

export const CollapsibleCodeSection: FC<Props> = ({ title, content, defaultExpanded }) => {
  const payloadSize = useMemo(() => new Blob([content]).size, [content]);
  const shouldDefaultExpand = defaultExpanded ?? payloadSize < SMALL_PAYLOAD_THRESHOLD;
  const [isExpanded, setIsExpanded] = useState(shouldDefaultExpand);

  const preview = useMemo(() => getPreview(content, PREVIEW_LINES), [content]);

  const hasPreview = content.split('\n').length > PREVIEW_LINES || payloadSize > SMALL_PAYLOAD_THRESHOLD;

  // Generate a stable ID for ARIA relationships
  const sectionId = useMemo(() => `code-section-${title.toLowerCase().replace(/\s+/g, '-')}`, [title]);

  return (
    <div className="space-y-1.5">
      <Button
        aria-controls={sectionId}
        aria-expanded={isExpanded}
        className="flex h-auto w-full items-center justify-between px-0 py-0 text-left"
        data-testid={`collapsible-section-toggle-${title.toLowerCase().replace(/\s+/g, '-')}`}
        onClick={() => setIsExpanded(!isExpanded)}
        type="button"
        variant="ghost"
      >
        <div className="flex items-center gap-1.5">
          {isExpanded ? (
            <ChevronDown aria-hidden="true" className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronRight aria-hidden="true" className="h-3 w-3 text-muted-foreground" />
          )}
          <Text as="span" variant="label">
            {title}
          </Text>
        </div>
        <Text as="span" className="font-mono" variant="muted">
          {prettyBytes(payloadSize)}
        </Text>
      </Button>

      {!isExpanded && hasPreview ? (
        <button
          aria-label={`Expand ${title} section`}
          className="w-full text-left transition-opacity hover:opacity-80"
          onClick={() => setIsExpanded(true)}
          type="button"
        >
          <ContentPanel>
            <Text as="p" className="line-clamp-3 break-all font-mono leading-relaxed" variant="muted">
              {preview}
            </Text>
            <Text className="mt-2 flex items-center justify-center font-medium opacity-60" variant="muted">
              Click to expand
            </Text>
          </ContentPanel>
        </button>
      ) : null}

      {isExpanded ? (
        <ContentPanel padding="md">
          <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-relaxed" id={sectionId}>
            {content}
          </pre>
        </ContentPanel>
      ) : null}
    </div>
  );
};
