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
import { ChevronDown, ChevronRight, CornerDownRight, Wrench } from 'lucide-react';
import type { FC } from 'react';
import { useMemo, useState } from 'react';
import { prettyBytes } from 'utils/utils';

import { ContentPanel } from './content-panel';
import { getPreview } from '../utils/transcript-formatters';

const SMALL_PAYLOAD_THRESHOLD = 2 * 1024; // 2KB
const PREVIEW_LINES = 3;

export type ToolEventCardProps = {
  /** The tool content (JSON string of arguments or response) */
  content: string;
  /** The tool name */
  toolName: string;
  /** Type of tool event: 'call' for arguments, 'response' for results */
  type: 'call' | 'response';
  /** Unique call identifier for correlation between calls and responses */
  callId?: string;
  /** Whether to expand by default (overrides auto-expand based on size) */
  defaultExpanded?: boolean;
  /** Test ID for testing */
  testId?: string;
};

/**
 * Unified tool event card for displaying tool calls and responses.
 * Features:
 * - Two-row header: chevron + wrench icon + tool name, type label + callId + size
 * - CornerDownRight icon for responses (visual correlation)
 * - Auto-expand for payloads < 2KB
 * - 3-line preview with "Click to expand" for collapsed large payloads
 */
export const ToolEventCard: FC<ToolEventCardProps> = ({ content, toolName, type, callId, defaultExpanded, testId }) => {
  const payloadSize = useMemo(() => new Blob([content]).size, [content]);
  const shouldDefaultExpand = defaultExpanded ?? payloadSize < SMALL_PAYLOAD_THRESHOLD;
  const [isExpanded, setIsExpanded] = useState(shouldDefaultExpand);

  const preview = useMemo(() => getPreview(content, PREVIEW_LINES), [content]);
  const hasPreview = content.split('\n').length > PREVIEW_LINES || payloadSize > SMALL_PAYLOAD_THRESHOLD;

  const isCall = type === 'call';
  const typeLabel = isCall ? 'Tool Call' : 'Tool Response';

  // Generate stable IDs for ARIA relationships
  const contentId = useMemo(
    () => `tool-event-content-${toolName.toLowerCase().replace(/\s+/g, '-')}-${type}`,
    [toolName, type]
  );

  return (
    <ContentPanel className="p-0" data-testid={testId}>
      {/* Two-row header */}
      <button
        aria-controls={contentId}
        aria-expanded={isExpanded}
        className="flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors hover:bg-muted/20"
        data-testid={testId ? `${testId}-toggle` : undefined}
        onClick={() => setIsExpanded(!isExpanded)}
        type="button"
      >
        {/* Row 1: Chevron + Icon + Tool name */}
        <div className="flex min-w-0 items-center gap-1.5">
          {isExpanded ? (
            <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <Wrench aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Text className="min-w-0 truncate font-medium" variant="muted">
            {toolName}
          </Text>
        </div>
        {/* Row 2: Type + Call ID + Size */}
        <div className="flex items-center gap-1.5 pl-[18px] text-muted-foreground text-xs">
          <span>{typeLabel}</span>
          {callId ? (
            <>
              <span>•</span>
              <span className="flex items-center gap-0.5">
                {!isCall && <CornerDownRight aria-hidden="true" className="h-2.5 w-2.5 shrink-0" />}
                <span className="font-mono">{callId.slice(0, 8)}</span>
              </span>
            </>
          ) : null}
          <span>•</span>
          <span className="shrink-0 font-mono">{prettyBytes(payloadSize)}</span>
        </div>
      </button>

      {/* Preview when collapsed */}
      {!isExpanded && hasPreview ? (
        <Button
          aria-label={`Expand ${toolName} ${typeLabel.toLowerCase()}`}
          className="h-auto w-full justify-start rounded-none border-t px-3 py-2 text-left"
          data-testid={testId ? `${testId}-preview` : undefined}
          onClick={() => setIsExpanded(true)}
          variant="ghost"
        >
          <Text as="p" className="line-clamp-3 break-all font-mono text-sm leading-relaxed" variant="muted">
            {preview}
          </Text>
        </Button>
      ) : null}

      {/* Expanded content */}
      {isExpanded ? (
        <div className="border-t px-3 py-2" id={contentId}>
          <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-relaxed text-muted-foreground">
            {content}
          </pre>
        </div>
      ) : null}
    </ContentPanel>
  );
};
