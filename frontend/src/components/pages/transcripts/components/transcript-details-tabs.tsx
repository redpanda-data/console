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
import type { Span } from 'protogen/redpanda/otel/v1/trace_pb';
import type { FC } from 'react';
import { useEffect, useMemo, useState } from 'react';

import { AgentTab } from './agent-tab';
import { AttributesTab } from './attributes-tab';
import { LLMIOTab } from './llm-io-tab';
import { OverviewTab } from './overview-tab';
import { RawJSONTab } from './raw-json-tab';
import { ToolCallTab } from './tool-call-tab';
import { isAgentSpan, isLLMSpan, isToolSpan } from '../utils/span-classifier';
import { isRootSpan } from '../utils/transcript-statistics';

type Props = {
  span: Span;
  trace?: Trace;
  value?: string; // Controlled mode: externally managed tab state
  onValueChange?: (value: string) => void; // Controlled mode: callback when tab changes
};

export const getDefaultTab = (
  showOverviewTab: boolean,
  showAgentTab: boolean,
  showLLMTab: boolean,
  showToolTab: boolean
): string => {
  if (showOverviewTab) {
    return 'overview';
  }
  if (showAgentTab) {
    return 'agent';
  }
  if (showLLMTab) {
    return 'llm-io';
  }
  if (showToolTab) {
    return 'tool-call';
  }
  return 'attributes';
};

export const TranscriptDetailsTabs: FC<Props> = ({ span, trace, value, onValueChange }) => {
  const { showToolTab, showLLMTab, showAgentTab, showOverviewTab } = useMemo(
    () => ({
      showToolTab: isToolSpan(span),
      showLLMTab: isLLMSpan(span),
      showAgentTab: isAgentSpan(span),
      showOverviewTab: isRootSpan(span),
    }),
    [span]
  );

  // Internal state for uncontrolled mode
  const [internalTab, setInternalTab] = useState(() =>
    getDefaultTab(showOverviewTab, showAgentTab, showLLMTab, showToolTab)
  );

  // Use controlled value if provided, otherwise use internal state
  const activeTab = value ?? internalTab;

  // Handle tab change: call callback if provided (controlled), otherwise update internal state
  const handleTabChange = (newTab: string) => {
    if (onValueChange) {
      onValueChange(newTab);
    } else {
      setInternalTab(newTab);
    }
  };

  // Reset to default tab when span changes (only in uncontrolled mode)
  useEffect(() => {
    if (value === undefined) {
      const defaultTab = getDefaultTab(showOverviewTab, showAgentTab, showLLMTab, showToolTab);
      setInternalTab(defaultTab);
    }
  }, [showOverviewTab, showAgentTab, showLLMTab, showToolTab, value]);

  // Build tabs array
  const tabs = [
    ...(showOverviewTab ? [{ id: 'overview', label: 'Overview' }] : []),
    ...(showAgentTab && !showOverviewTab ? [{ id: 'agent', label: 'Agent' }] : []),
    ...(showLLMTab && !showOverviewTab ? [{ id: 'llm-io', label: 'LLM I/O' }] : []),
    ...(showToolTab ? [{ id: 'tool-call', label: 'Tool Call' }] : []),
    { id: 'attributes', label: 'Attributes' },
    { id: 'raw', label: 'Raw' },
  ];

  return (
    <div className="flex flex-col">
      {/* Custom Tab Navigation */}
      <div className="shrink-0 border-b px-3">
        <div aria-label="Span details" className="flex gap-1" role="tablist">
          {tabs.map((tab) => (
            <button
              aria-controls={`tabpanel-${tab.id}`}
              aria-selected={activeTab === tab.id}
              className={cn(
                'relative px-3 py-2 font-medium text-xs transition-colors',
                activeTab === tab.id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
              data-testid={`transcript-details-tab-${tab.id}`}
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              role="tab"
              type="button"
            >
              {tab.label}
              {activeTab === tab.id && <div className="absolute right-0 bottom-0 left-0 h-0.5 bg-foreground" />}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div
        aria-labelledby={`trace-details-tab-${activeTab}`}
        className="flex-1"
        id={`tabpanel-${activeTab}`}
        role="tabpanel"
      >
        {activeTab === 'overview' && showOverviewTab && <OverviewTab trace={trace} />}
        {activeTab === 'agent' && showAgentTab && !showOverviewTab && <AgentTab span={span} />}
        {activeTab === 'llm-io' && showLLMTab && !showOverviewTab && <LLMIOTab span={span} />}
        {activeTab === 'tool-call' && showToolTab && <ToolCallTab span={span} />}
        {activeTab === 'attributes' && <AttributesTab span={span} />}
        {activeTab === 'raw' && <RawJSONTab span={span} />}
      </div>
    </div>
  );
};
