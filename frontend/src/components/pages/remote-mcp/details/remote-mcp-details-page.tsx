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
import { AlertCircle, Loader2 } from 'lucide-react';
import { runInAction } from 'mobx';
import { useEffect, useState } from 'react';
import { useGetMCPServerQuery } from 'react-query/api/remote-mcp';
import { useParams, useSearchParams } from 'react-router-dom';
import { uiState } from 'state/uiState';
import { RemoteMCPInspectorTab } from './inspector/remote-mcp-inspector-tab';
import { RemoteMCPConfigurationTab } from './remote-mcp-configuration-tab';
import { RemoteMCPConnectionTab } from './remote-mcp-connection-tab';
import { RemoteMCPDetailsHeader } from './remote-mcp-details-header';
import { RemoteMCPLogsTab } from './remote-mcp-logs-tab';

export const updatePageTitle = (serverName?: string) => {
  runInAction(() => {
    uiState.pageTitle = serverName ? `Remote MCP - ${serverName}` : 'Remote MCP Details';
    uiState.pageBreadcrumbs = [
      { title: 'Remote MCP', linkTo: '/remote-mcp' },
      { title: serverName || 'Details', linkTo: '', heading: serverName || 'Remote MCP Details' },
    ];
  });
};

export const RemoteMCPDetailsPage = () => {
  const isRemoteMcpInspectorFeatureEnabled = isFeatureFlagEnabled('enableRemoteMcpInspectorInConsole');

  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const tabFromUrl = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(tabFromUrl || 'configuration');

  const { data: mcpServerData, isLoading, error } = useGetMCPServerQuery({ id: id || '' }, { enabled: !!id });

  useEffect(() => {
    if (mcpServerData?.mcpServer) {
      updatePageTitle(mcpServerData.mcpServer.displayName);
    }
  }, [mcpServerData]);

  useEffect(() => {
    const tabFromUrl = searchParams.get('tab');
    if (!tabFromUrl) {
      setActiveTab('configuration');
    } else {
      setActiveTab(tabFromUrl);
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
          Loading MCP server details...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-2 text-red-600">
          <AlertCircle className="h-4 w-4" />
          Error loading MCP server: {error.message}
        </div>
      </div>
    );
  }

  if (!mcpServerData?.mcpServer) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4">
      <RemoteMCPDetailsHeader />

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="configuration">Configuration</TabsTrigger>
          <TabsTrigger value="connection">Connection</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          {isRemoteMcpInspectorFeatureEnabled && <TabsTrigger value="inspector">MCP Inspector</TabsTrigger>}
        </TabsList>

        <TabsContent value="configuration">
          <RemoteMCPConfigurationTab />
        </TabsContent>
        <TabsContent value="connection">
          <RemoteMCPConnectionTab />
        </TabsContent>
        <TabsContent value="logs">
          <RemoteMCPLogsTab />
        </TabsContent>
        {isRemoteMcpInspectorFeatureEnabled && (
          <TabsContent value="inspector">
            <RemoteMCPInspectorTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};
