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

import { cn } from 'components/redpanda-ui/lib/utils';
import type { Trace } from 'protogen/redpanda/api/dataplane/v1alpha3/tracing_pb';
import type { FC, ReactNode } from 'react';
import { useMemo } from 'react';

import { ContentPanel } from './content-panel';
import { formatDuration } from '../utils/trace-formatters';
import { calculateTraceStatistics, getConversationId } from '../utils/trace-statistics';

type Props = {
  trace: Trace | undefined;
};

type MetricCardProps = {
  label: string;
  value: ReactNode;
  variant?: 'default' | 'error';
};

const MetricCard: FC<MetricCardProps> = ({ label, value, variant = 'default' }) => {
  const isError = variant === 'error';
  return (
    <ContentPanel className={cn(isError ? 'border-destructive/20 bg-destructive/10' : undefined)}>
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={cn('font-mono font-semibold text-sm', isError && 'text-destructive')}>{value}</div>
    </ContentPanel>
  );
};

type SectionHeaderProps = {
  children: ReactNode;
};

const SectionHeader: FC<SectionHeaderProps> = ({ children }) => (
  <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">{children}</h4>
);

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
        <SectionHeader>Trace Summary</SectionHeader>
        <div className="grid grid-cols-2 gap-2">
          <MetricCard label="Total Spans" value={summary.spanCount} />
          <MetricCard label="Duration" value={formatDuration(Number(summary.durationMs))} />
        </div>
        {summary.errorCount > 0 && <MetricCard label="Error Count" value={summary.errorCount} variant="error" />}
      </div>

      {/* Token Usage Section */}
      {statistics.totalTokens > 0 && (
        <div className="space-y-2">
          <SectionHeader>Token Usage</SectionHeader>
          <ContentPanel padding="md" spacing>
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
          </ContentPanel>
        </div>
      )}

      {/* Operations Section */}
      {(statistics.llmCallCount > 0 || statistics.toolCallCount > 0) && (
        <div className="space-y-2">
          <SectionHeader>Operations</SectionHeader>
          <div className="grid grid-cols-2 gap-2">
            {statistics.llmCallCount > 0 && <MetricCard label="LLM Calls" value={statistics.llmCallCount} />}
            {statistics.toolCallCount > 0 && <MetricCard label="Tool Calls" value={statistics.toolCallCount} />}
          </div>
        </div>
      )}

      {/* Service Information */}
      {!!summary.serviceName && (
        <div className="space-y-2">
          <SectionHeader>Service</SectionHeader>
          <ContentPanel>
            <div className="break-all font-mono text-sm">{summary.serviceName}</div>
          </ContentPanel>
        </div>
      )}

      {/* Conversation ID */}
      {!!conversationId && (
        <div className="space-y-2">
          <SectionHeader>Conversation ID</SectionHeader>
          <ContentPanel>
            <div className="break-all font-mono text-xs">{conversationId}</div>
          </ContentPanel>
        </div>
      )}
    </div>
  );
};
