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

import { ChevronDown, ChevronRight } from 'lucide-react';
import type { FC } from 'react';
import { useMemo, useState } from 'react';

import { ContentPanel } from './content-panel';

type Props = {
  title: string;
  content: string;
  defaultExpanded?: boolean;
};

const SMALL_PAYLOAD_THRESHOLD = 2 * 1024; // 2KB
const PREVIEW_LINES = 3;

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) {
    return `${bytes}B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)}KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
};

const getPreview = (content: string, lines: number): string => {
  const contentLines = content.split('\n');
  if (contentLines.length <= lines) {
    return content;
  }
  return contentLines.slice(0, lines).join('\n');
};

export const CollapsibleCodeSection: FC<Props> = ({ title, content, defaultExpanded }) => {
  const payloadSize = useMemo(() => new Blob([content]).size, [content]);
  const shouldDefaultExpand = defaultExpanded ?? payloadSize < SMALL_PAYLOAD_THRESHOLD;
  const [isExpanded, setIsExpanded] = useState(shouldDefaultExpand);

  const preview = useMemo(() => getPreview(content, PREVIEW_LINES), [content]);

  const hasPreview = content.split('\n').length > PREVIEW_LINES || payloadSize > SMALL_PAYLOAD_THRESHOLD;

  return (
    <div className="space-y-1.5">
      <button
        className="flex w-full items-center justify-between text-left hover:opacity-70"
        onClick={() => setIsExpanded(!isExpanded)}
        type="button"
      >
        <div className="flex items-center gap-1.5">
          {isExpanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          )}
          <h5 className="font-medium text-[10px] text-muted-foreground uppercase tracking-wide">{title}</h5>
        </div>
        <span className="font-mono text-[9px] text-muted-foreground">{formatBytes(payloadSize)}</span>
      </button>

      {!isExpanded && hasPreview ? (
        <button
          className="w-full text-left transition-opacity hover:opacity-80"
          onClick={() => setIsExpanded(true)}
          type="button"
        >
          <ContentPanel>
            <p className="font-mono text-[9px] text-muted-foreground leading-relaxed break-all line-clamp-3">
              {preview}
            </p>
            <div className="mt-2 flex items-center justify-center text-[9px] text-muted-foreground/60 font-medium">
              Click to expand
            </div>
          </ContentPanel>
        </button>
      ) : null}

      {isExpanded ? (
        <ContentPanel padding="md">
          <pre className="whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed">{content}</pre>
        </ContentPanel>
      ) : null}
    </div>
  );
};
