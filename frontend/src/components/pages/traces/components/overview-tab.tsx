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
import { Text } from 'components/redpanda-ui/components/typography';
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
      <Text className="text-[10px]" variant="muted">
        {label}
      </Text>
      <Text className={cn('font-mono font-semibold', isError && 'text-destructive')} variant="small">
        {value}
      </Text>
    </ContentPanel>
  );
};

type SectionHeaderProps = {
  children: ReactNode;
};

const SectionHeader: FC<SectionHeaderProps> = ({ children }) => (
  <Text as="div" className="uppercase tracking-wide" variant="label">
    {children}
  </Text>
);

export const OverviewTab: FC<Props> = ({ trace }) => {
  const statistics = useMemo(() => calculateTraceStatistics(trace), [trace]);
  const summary = trace?.summary;
  const conversationId = useMemo(() => getConversationId(trace), [trace]);

  if (!summary) {
    return (
      <div className="space-y-4 p-4">
        <Text className="text-muted-foreground" variant="small">
          No trace summary available
        </Text>
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
          <MetricCard label="Duration" value={formatDuration(summary.duration ? durationMs(summary.duration) : 0)} />
        </div>
        {summary.errorCount > 0 && <MetricCard label="Error Count" value={summary.errorCount} variant="error" />}
      </div>

      {/* Token Usage Section */}
      {statistics.totalTokens > 0 && (
        <div className="space-y-2">
          <SectionHeader>Token Usage</SectionHeader>
          <ContentPanel padding="md" spacing>
            <div className="flex items-center justify-between">
              <Text className="text-xs" variant="muted">
                Input tokens
              </Text>
              <Text className="font-medium font-mono" variant="small">
                {statistics.totalInputTokens.toLocaleString()}
              </Text>
            </div>
            <div className="flex items-center justify-between">
              <Text className="text-xs" variant="muted">
                Output tokens
              </Text>
              <Text className="font-medium font-mono" variant="small">
                {statistics.totalOutputTokens.toLocaleString()}
              </Text>
            </div>
            <div className="flex items-center justify-between border-t pt-2">
              <Text className="font-medium" variant="small">
                Total tokens
              </Text>
              <Text className="font-mono font-semibold" variant="small">
                {statistics.totalTokens.toLocaleString()}
              </Text>
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
            <Text className="break-all font-mono" variant="small">
              {summary.rootServiceName}
            </Text>
          </ContentPanel>
        </div>
      )}

      {/* Conversation ID */}
      {!!conversationId && (
        <div className="space-y-2">
          <SectionHeader>Conversation ID</SectionHeader>
          <ContentPanel>
            <Text className="break-all font-mono" variant="muted">
              {conversationId}
            </Text>
          </ContentPanel>
        </div>
      )}
    </div>
  );
};
