/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import type { Trace } from 'protogen/redpanda/api/dataplane/v1alpha3/tracing_pb';
import type { FC } from 'react';
import { useMemo } from 'react';

import { formatDuration } from '../utils/trace-formatters';
import { calculateTraceStatistics, getConversationId } from '../utils/trace-statistics';

interface Props {
  trace: Trace | undefined;
}

export const OverviewTab: FC<Props> = ({ trace }) => {
  const statistics = useMemo(() => calculateTraceStatistics(trace), [trace]);
  const summary = trace?.summary;
  const conversationId = useMemo(() => getConversationId(trace), [trace]);

  if (!summary) {
    return (
      <div className="space-y-4 p-4">
        <div className="text-muted-foreground text-sm">No trace summary available</div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-3">
      {/* Trace Summary Section */}
      <div className="space-y-2">
        <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Trace Summary</h4>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded border bg-muted/30 p-2">
            <div className="text-[10px] text-muted-foreground">Total Spans</div>
            <div className="font-mono font-semibold text-sm">{summary.spanCount}</div>
          </div>
          <div className="rounded border bg-muted/30 p-2">
            <div className="text-[10px] text-muted-foreground">Duration</div>
            <div className="font-mono font-semibold text-sm">{formatDuration(Number(summary.durationMs))}</div>
          </div>
        </div>
        {summary.errorCount > 0 && (
          <div className="rounded border bg-red-500/10 p-2">
            <div className="text-[10px] text-muted-foreground">Error Count</div>
            <div className="font-mono font-semibold text-red-600 text-sm">{summary.errorCount}</div>
          </div>
        )}
      </div>

      {/* Token Usage Section */}
      {statistics.totalTokens > 0 && (
        <div className="space-y-2">
          <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Token Usage</h4>
          <div className="space-y-2 rounded border bg-muted/30 p-3">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">Input tokens</span>
              <span className="font-medium font-mono text-xs">{statistics.totalInputTokens.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">Output tokens</span>
              <span className="font-medium font-mono text-xs">{statistics.totalOutputTokens.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between border-t pt-2">
              <span className="font-medium text-xs">Total tokens</span>
              <span className="font-mono font-semibold text-xs">{statistics.totalTokens.toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}

      {/* Operations Section */}
      {(statistics.llmCallCount > 0 || statistics.toolCallCount > 0) && (
        <div className="space-y-2">
          <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Operations</h4>
          <div className="grid grid-cols-2 gap-2">
            {statistics.llmCallCount > 0 && (
              <div className="rounded border bg-muted/30 p-2">
                <div className="text-[10px] text-muted-foreground">LLM Calls</div>
                <div className="font-mono font-semibold text-sm">{statistics.llmCallCount}</div>
              </div>
            )}
            {statistics.toolCallCount > 0 && (
              <div className="rounded border bg-muted/30 p-2">
                <div className="text-[10px] text-muted-foreground">Tool Calls</div>
                <div className="font-mono font-semibold text-sm">{statistics.toolCallCount}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Service Information */}
      {summary.serviceName && (
        <div className="space-y-2">
          <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Service</h4>
          <div className="rounded border bg-muted/30 p-2">
            <div className="font-mono text-sm">{summary.serviceName}</div>
          </div>
        </div>
      )}

      {/* Conversation ID */}
      {conversationId && (
        <div className="space-y-2">
          <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Conversation ID</h4>
          <div className="rounded border bg-muted/30 p-2">
            <div className="break-all font-mono text-xs">{conversationId}</div>
          </div>
        </div>
      )}
    </div>
  );
};
