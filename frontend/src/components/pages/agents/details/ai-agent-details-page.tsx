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

import { getRouteApi, useNavigate } from '@tanstack/react-router';

const routeApi = getRouteApi('/agents/$id');

import { Tabs, TabsContent, TabsList, TabsTrigger } from 'components/redpanda-ui/components/tabs';
import { isFeatureFlagEnabled } from 'config';
import { AlertCircle, Loader2, Network, Search, Settings } from 'lucide-react';
import { runInAction } from 'mobx';
import { useEffect, useState } from 'react';
import { useGetAIAgentQuery } from 'react-query/api/ai-agent';
import { uiState } from 'state/ui-state';

import { AIAgentCardTab } from './ai-agent-card-tab';
import { AIAgentConfigurationTab } from './ai-agent-configuration-tab';
import { AIAgentDetailsHeader } from './ai-agent-details-header';
import { AIAgentInspectorTab } from './ai-agent-inspector-tab';

export const updatePageTitle = (agentName?: string) => {
  runInAction(() => {
    uiState.pageTitle = agentName ? `AI Agent - ${agentName}` : 'AI Agent Details';
    uiState.pageBreadcrumbs = [
      { title: 'AI Agents', linkTo: '/agents' },
      { title: agentName || 'Details', linkTo: '', heading: agentName || 'AI Agent Details' },
    ];
  });
};

export const AIAgentDetailsPage = () => {
  const isAiAgentsInspectorFeatureEnabled = isFeatureFlagEnabled('enableAiAgentsInspectorInConsole');

  const { id } = routeApi.useParams();
  const navigate = useNavigate({ from: '/agents/$id' });
  // Use fine-grained selector to only re-render when tab changes
  const tab = routeApi.useSearch({ select: (s) => s.tab });

  const [activeTab, setActiveTab] = useState(tab || 'configuration');

  const { data: aiAgentData, isLoading, error } = useGetAIAgentQuery({ id: id || '' }, { enabled: !!id });

  useEffect(() => {
    if (aiAgentData?.aiAgent) {
      updatePageTitle(aiAgentData.aiAgent.displayName);
    }
  }, [aiAgentData]);

  useEffect(() => {
    if (tab) {
      setActiveTab(tab);
    } else {
      setActiveTab('configuration');
    }
  }, [tab]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    navigate({ search: { tab: value } });
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
        <TabsList>
          <TabsTrigger className="gap-2" value="configuration">
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Configuration
            </div>
          </TabsTrigger>
          <TabsTrigger className="gap-2" value="agent-card">
            <div className="flex items-center gap-2">
              <Network className="h-4 w-4" />
              A2A
            </div>
          </TabsTrigger>
          {Boolean(isAiAgentsInspectorFeatureEnabled) && (
            <TabsTrigger className="gap-2" value="inspector">
              <Search className="h-4 w-4" />
              Inspector
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="configuration">
          <AIAgentConfigurationTab />
        </TabsContent>
        <TabsContent value="agent-card">
          <AIAgentCardTab />
        </TabsContent>
        {Boolean(isAiAgentsInspectorFeatureEnabled) && (
          <TabsContent className="flex h-full flex-col" value="inspector">
            <AIAgentInspectorTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};
