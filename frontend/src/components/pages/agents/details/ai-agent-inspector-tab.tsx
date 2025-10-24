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

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { Text } from 'components/redpanda-ui/components/typography';
import { AIAgent_State } from 'protogen/redpanda/api/dataplane/v1alpha3/ai_agent_pb';
import { useGetAIAgentQuery } from 'react-query/api/ai-agent';
import { useParams } from 'react-router-dom';

import { AIAgentChat } from './a2a/chat/ai-agent-chat';

/**
 * Main tab component for inspecting AI agent details.
 *
 * This component displays the agent's status, loading state, and provides
 * access to the chat interface for interacting with the agent. It is used
 * within the agent details interface and conditionally renders content
 * based on the agent's state and availability.
 */
export const AIAgentInspectorTab = () => {
  const { id } = useParams<{ id: string }>();
  const { data: aiAgentData } = useGetAIAgentQuery({ id: id || '' }, { enabled: !!id });

  const agent = aiAgentData?.aiAgent;
  const isAgentRunning = agent?.state === AIAgent_State.RUNNING;

  if (!agent) {
    return (
      <Card size="full">
        <CardContent className="py-12">
          <div className="flex flex-col items-center justify-center text-center">
            <Text className="text-muted-foreground">Loading agent details...</Text>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!isAgentRunning) {
    return (
      <Card size="full">
        <CardHeader>
          <CardTitle>Agent Inspector</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center text-center">
            <Text className="text-muted-foreground">Agent is not running</Text>
            <Text className="text-muted-foreground" variant="small">
              Start the agent to begin testing
            </Text>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!agent.url) {
    return (
      <Card size="full">
        <CardHeader>
          <CardTitle>Agent Inspector</CardTitle>
          <CardDescription>Unable to connect to the agent</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Text className="text-muted-foreground">Agent URL not available</Text>
            <Text className="text-muted-foreground" variant="small">
              Please try restarting the agent
            </Text>
          </div>
        </CardContent>
      </Card>
    );
  }

  return <AIAgentChat agent={agent} />;
};
