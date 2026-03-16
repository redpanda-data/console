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

'use no memo';

import { getRouteApi, useNavigate } from '@tanstack/react-router';

const routeApi = getRouteApi('/agents/$id');

import { Tabs, TabsContent } from 'components/redpanda-ui/components/tabs';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { useGetAIAgentQuery } from 'react-query/api/ai-agent';
import { uiState } from 'state/ui-state';

import { AIAgentCardTab } from './ai-agent-card-tab';
import { AIAgentConfigurationTab } from './ai-agent-configuration-tab';
import { AIAgentDetailsHeader } from './ai-agent-details-header';
import { AIAgentDetailsTabs } from './ai-agent-details-tabs';
import { AIAgentInspectorTab } from './ai-agent-inspector-tab';
import { AIAgentTranscriptsTab } from './ai-agent-transcripts-tab';

export const updatePageTitle = (agentName?: string) => {
  uiState.pageTitle = agentName ? `AI Agent - ${agentName}` : 'AI Agent Details';
  uiState.pageBreadcrumbs = [
    { title: 'AI Agents', linkTo: '/agents' },
    { title: agentName || 'Details', linkTo: '', heading: agentName || 'AI Agent Details' },
  ];
};

export const AIAgentDetailsPage = () => {
  const { id } = routeApi.useParams();
  const navigate = useNavigate({ from: '/agents/$id' });
  // Use fine-grained selector to only re-render when tab changes
  const tab = routeApi.useSearch({ select: (s) => s.tab });
  const mockAgentTranscripts = routeApi.useSearch({ select: (s) => s.mockAgentTranscripts });

  const activeTab = tab || 'configuration';

  const { data: aiAgentData, isLoading, error } = useGetAIAgentQuery({ id: id || '' }, { enabled: !!id });

  useEffect(() => {
    if (aiAgentData?.aiAgent) {
      updatePageTitle(aiAgentData.aiAgent.displayName);
    }
  }, [aiAgentData]);

  const handleTabChange = (value: string) => {
    navigate({ search: { mockAgentTranscripts, tab: value } });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading AI agent details...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-2 text-red-600">
          <AlertCircle className="h-4 w-4" />
          Error loading AI agent: {error.message}
        </div>
      </div>
    );
  }

  if (!aiAgentData?.aiAgent) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4 pb-1">
      <AIAgentDetailsHeader />

      <Tabs className="min-h-0 flex-1" onValueChange={handleTabChange} value={activeTab}>
        <AIAgentDetailsTabs />

        <TabsContent value="configuration">
          <AIAgentConfigurationTab />
        </TabsContent>
        <TabsContent value="transcripts">
          <AIAgentTranscriptsTab />
        </TabsContent>
        <TabsContent value="agent-card">
          <AIAgentCardTab />
        </TabsContent>
        <TabsContent className="flex h-full flex-col" value="inspector">
          <AIAgentInspectorTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};
