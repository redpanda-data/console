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

import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from 'components/redpanda-ui/components/dialog';
import { Text } from 'components/redpanda-ui/components/typography';
import { config } from 'config';
import { JSONView } from 'components/ui/json/json-view';
import { FileJson, Loader2 } from 'lucide-react';
import { AIAgent_State } from 'protogen/redpanda/api/dataplane/v1alpha3/ai_agent_pb';
import { useState } from 'react';
import { useGetAIAgentQuery } from 'react-query/api/ai-agent';
import { getAgentCardUrls } from 'utils/ai-agent.utils';

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
  const { id } = routeApi.useParams();
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

  const [liveAgentCard, setLiveAgentCard] = useState<unknown>(null);
  const [isLoadingCard, setIsLoadingCard] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [cardUrl, setCardUrl] = useState<string | null>(null);

  const fetchLiveAgentCard = async () => {
    setIsLoadingCard(true);
    setCardError(null);
    setCardUrl(null);
    try {
      const urls = getAgentCardUrls({ agentUrl: agent.url });
      const errors: Error[] = [];

      for (const url of urls) {
        try {
          const response = await fetch(url, {
            headers: config.jwt ? { Authorization: `Bearer ${config.jwt}` } : {},
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const cardData = await response.json();
          setLiveAgentCard(cardData);
          setCardUrl(url);
          return;
        } catch (error) {
          errors.push(error as Error);
        }
      }

      throw new Error(
        `Failed to fetch agent card from any URL. Tried: ${urls.join(', ')}. Errors: ${errors.map((e) => e.message).join('; ')}`
      );
    } catch (error) {
      setCardError((error as Error).message);
    } finally {
      setIsLoadingCard(false);
    }
  };

  return (
    <AIAgentChat
      agent={agent}
      headerActions={
        <Dialog>
          <DialogTrigger asChild>
            <Button onClick={fetchLiveAgentCard} size="sm" variant="ghost">
              <FileJson className="h-4 w-4" />
              View Agent Card
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] w-[70vw] max-w-[1200px] overflow-y-auto" onOpenAutoFocus={(e) => e.preventDefault()} size="full">
            <DialogHeader>
              <DialogTitle>Agent Card</DialogTitle>
              {cardUrl && <DialogDescription className="font-mono text-xs">{cardUrl}</DialogDescription>}
            </DialogHeader>
            <div className="mt-2">
              {isLoadingCard ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <Text className="ml-2">Fetching agent card from A2A endpoint...</Text>
                </div>
              ) : cardError ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/30">
                  <Text className="text-red-800 dark:text-red-200">{cardError}</Text>
                </div>
              ) : liveAgentCard ? (
                <JSONView data={liveAgentCard} initialExpandDepth={5} />
              ) : (
                <div className="flex items-center justify-center p-8">
                  <Text className="text-muted-foreground">Click the button to load agent card</Text>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      }
    />
  );
};
