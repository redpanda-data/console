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

import { getRouteApi } from '@tanstack/react-router';

const routeApi = getRouteApi('/agents/$id');

import { Badge, type BadgeVariant } from 'components/redpanda-ui/components/badge';
import { AlertCircle, Check, Clock, Loader2, StopCircle } from 'lucide-react';
import { AIAgent_State } from 'protogen/redpanda/api/dataplane/v1alpha3/ai_agent_pb';
import { useGetAIAgentQuery } from 'react-query/api/ai-agent';

const getAIAgentStatus = (state: AIAgent_State): { icon: React.ReactNode; text: string; variant: BadgeVariant } => {
  switch (state) {
    case AIAgent_State.RUNNING:
      return {
        icon: <Check className="h-3 w-3" />,
        text: 'Running',
        variant: 'success-inverted',
      };
    case AIAgent_State.STARTING:
      return {
        icon: <Loader2 className="h-3 w-3 animate-spin" />,
        text: 'Starting',
        variant: 'info-inverted',
      };
    case AIAgent_State.ERROR:
      return {
        icon: <AlertCircle className="h-3 w-3" />,
        text: 'Error',
        variant: 'destructive-inverted',
      };
    case AIAgent_State.STOPPED:
      return {
        icon: <StopCircle className="h-3 w-3" />,
        text: 'Stopped',
        variant: 'neutral-inverted',
      };
    case AIAgent_State.STOPPING:
      return {
        icon: <Loader2 className="h-3 w-3 animate-spin" />,
        text: 'Stopping',
        variant: 'warning-inverted',
      };
    default:
      return {
        icon: <Clock className="h-3 w-3" />,
        text: 'Unknown',
        variant: 'neutral-inverted',
      };
  }
};

export const AIAgentStateBadge = () => {
  const { id } = routeApi.useParams();
  const { data: aiAgentData } = useGetAIAgentQuery({ id: id || '' }, { enabled: !!id });

  if (!aiAgentData?.aiAgent) {
    return null;
  }

  const config = getAIAgentStatus(aiAgentData?.aiAgent?.state);
  return (
    <Badge icon={config.icon} variant={config.variant}>
      {config.text}
    </Badge>
  );
};
