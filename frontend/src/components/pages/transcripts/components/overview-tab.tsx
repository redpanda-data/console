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

import { durationMs } from '@bufbuild/protobuf/wkt';
import { CopyButton } from 'components/redpanda-ui/components/copy-button';
import { cn } from 'components/redpanda-ui/lib/utils';
import type { Trace } from 'protogen/redpanda/api/dataplane/v1alpha3/tracing_pb';
import type { FC, ReactNode } from 'react';
import { useMemo } from 'react';

import { ContentPanel } from './content-panel';
import { formatDuration } from '../utils/transcript-formatters';
import { calculateTranscriptStatistics, getConversationId } from '../utils/transcript-statistics';

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
      <div className="text-body-sm text-muted-foreground">{label}</div>
      <div className={cn('font-mono font-semibold text-body-sm', isError && 'text-destructive')}>{value}</div>
    </ContentPanel>
  );
};

type SectionHeaderProps = {
  children: ReactNode;
};

const SectionHeader: FC<SectionHeaderProps> = ({ children }) => (
  <div className="text-label uppercase tracking-wide">{children}</div>
);

export const OverviewTab: FC<Props> = ({ trace }) => {
  const statistics = useMemo(() => calculateTranscriptStatistics(trace), [trace]);
  const summary = trace?.summary;
  const conversationId = useMemo(() => getConversationId(trace), [trace]);

  if (!summary) {
    return (
      <div className="space-y-4 p-4">
        <div className="text-body-sm text-muted-foreground">No transcript summary available</div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-3">
      {/* Transcript Summary Section */}
      <div className="space-y-2">
        <SectionHeader>Transcript Summary</SectionHeader>
        <div className="grid grid-cols-2 gap-2">
          <MetricCard label="Total Spans" value={summary.spanCount} />
          <MetricCard label="Duration" value={formatDuration(summary.duration ? durationMs(summary.duration) : 0)} />
        </div>
        {summary.errorCount > 0 && <MetricCard label="Error Count" value={summary.errorCount} variant="error" />}
      </div>

      {/* Token Usage Section */}
      {statistics.totalTokens > 0 && (
        <div className="space-y-2">
          <SectionHeader>Token Usage</SectionHeader>
          <ContentPanel padding="sm" spacing>
            <div className="flex items-center justify-between">
              <div className="text-body-sm text-muted-foreground">Input tokens</div>
              <div className="font-medium font-mono text-body-sm">{statistics.totalInputTokens.toLocaleString()}</div>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-body-sm text-muted-foreground">Output tokens</div>
              <div className="font-medium font-mono text-body-sm">{statistics.totalOutputTokens.toLocaleString()}</div>
            </div>
            <div className="flex items-center justify-between border-t pt-2">
              <div className="font-medium text-body-sm">Total tokens</div>
              <div className="font-mono font-semibold text-body-sm">{statistics.totalTokens.toLocaleString()}</div>
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
      {!!summary.rootServiceName && (
        <div className="space-y-2">
          <SectionHeader>Service</SectionHeader>
          <ContentPanel>
            <div className="whitespace-pre-wrap break-words font-mono text-body text-muted-foreground leading-relaxed">
              {summary.rootServiceName}
            </div>
          </ContentPanel>
        </div>
      )}

      {/* Trace ID */}
      {!!trace?.traceId && (
        <div className="space-y-2">
          <SectionHeader>Trace ID</SectionHeader>
          <ContentPanel className="flex items-center justify-between">
            <div className="whitespace-pre-wrap break-words font-mono text-body text-muted-foreground leading-relaxed">
              {trace.traceId}
            </div>
            <CopyButton content={trace.traceId} size="sm" variant="ghost" />
          </ContentPanel>
        </div>
      )}

      {/* Conversation ID */}
      {!!conversationId && (
        <div className="space-y-2">
          <SectionHeader>Conversation ID</SectionHeader>
          <ContentPanel className="flex items-center justify-between">
            <div className="whitespace-pre-wrap break-words font-mono text-body text-muted-foreground leading-relaxed">
              {conversationId}
            </div>
            <CopyButton content={conversationId} size="sm" variant="ghost" />
          </ContentPanel>
        </div>
      )}
    </div>
  );
};
