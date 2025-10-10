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

import { AlertCircle, Loader2 } from 'lucide-react';
import { runInAction } from 'mobx';
import { useEffect } from 'react';
import { useGetAIAgentQuery } from 'react-query/api/ai-agent';
import { useParams } from 'react-router-dom';
import { uiState } from 'state/ui-state';

import { AIAgentConfigurationPage } from './ai-agent-configuration-page';
import { AIAgentDetailsHeader } from './ai-agent-details-header';

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
  const { id } = useParams<{ id: string }>();

  const { data: aiAgentData, isLoading, error } = useGetAIAgentQuery({ id: id || '' }, { enabled: !!id });

  useEffect(() => {
    if (aiAgentData?.aiAgent) {
      updatePageTitle(aiAgentData.aiAgent.displayName);
    }
  }, [aiAgentData]);

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
    <div className="flex flex-col gap-4">
      <AIAgentDetailsHeader />

      <AIAgentConfigurationPage />
    </div>
  );
};
