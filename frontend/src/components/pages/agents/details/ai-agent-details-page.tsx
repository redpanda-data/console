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

import { Tabs, TabsContent, TabsList, TabsTrigger } from 'components/redpanda-ui/components/tabs';
import { isFeatureFlagEnabled } from 'config';
import { AlertCircle, Loader2, Search, Settings } from 'lucide-react';
import { runInAction } from 'mobx';
import { useEffect, useState } from 'react';
import { useGetAIAgentQuery } from 'react-query/api/ai-agent';
import { useParams, useSearchParams } from 'react-router-dom';
import { uiState } from 'state/ui-state';

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

  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const tabFromUrl = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(tabFromUrl || 'configuration');

  const { data: aiAgentData, isLoading, error } = useGetAIAgentQuery({ id: id || '' }, { enabled: !!id });

  useEffect(() => {
    if (aiAgentData?.aiAgent) {
      updatePageTitle(aiAgentData.aiAgent.displayName);
    }
  }, [aiAgentData]);

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam) {
      setActiveTab(tabParam);
    } else {
      setActiveTab('configuration');
    }
  }, [searchParams]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setSearchParams({ tab: value });
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
    <div className="flex max-h-[calc(100vh-120px)] flex-col gap-4 overflow-hidden pb-1">
      <AIAgentDetailsHeader />

      <Tabs className="min-h-0 flex-1" onValueChange={handleTabChange} value={activeTab}>
        <TabsList>
          <TabsTrigger className="gap-2" value="configuration">
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Configuration
            </div>
          </TabsTrigger>
          {isAiAgentsInspectorFeatureEnabled && (
            <TabsTrigger className="gap-2" value="inspector">
              <Search className="h-4 w-4" />
              Inspector
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="configuration">
          <AIAgentConfigurationTab />
        </TabsContent>
        {isAiAgentsInspectorFeatureEnabled && (
          <TabsContent className="flex h-full flex-col" value="inspector">
            <AIAgentInspectorTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};
