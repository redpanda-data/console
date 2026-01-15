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

const routeApi = getRouteApi('/mcp-servers/$id');

import { Tabs, TabsContent, TabsList, TabsTrigger } from 'components/redpanda-ui/components/tabs';
import { isFeatureFlagEnabled } from 'config';
import { AlertCircle, Link, Loader2, Logs, Search, Settings } from 'lucide-react';
import { runInAction } from 'mobx';
import { useEffect, useState } from 'react';
import { useGetMCPServerQuery } from 'react-query/api/remote-mcp';
import { uiState } from 'state/ui-state';

import { RemoteMCPConfigurationTab } from './remote-mcp-configuration-tab';
import { RemoteMCPConnectionTab } from './remote-mcp-connection-tab';
import { RemoteMCPDetailsHeader } from './remote-mcp-details-header';
import { RemoteMCPInspectorTab } from './remote-mcp-inspector-tab';
import { RemoteMCPLogsTab } from './remote-mcp-logs-tab';

export const updatePageTitle = (serverName?: string) => {
  runInAction(() => {
    uiState.pageTitle = serverName ? `Remote MCP - ${serverName}` : 'Remote MCP Details';
    uiState.pageBreadcrumbs = [
      { title: 'Remote MCP', linkTo: '/mcp-servers' },
      { title: serverName || 'Details', linkTo: '', heading: serverName || 'Remote MCP Details' },
    ];
  });
};

export const RemoteMCPDetailsPage = () => {
  const isRemoteMcpInspectorFeatureEnabled = isFeatureFlagEnabled('enableRemoteMcpInspectorInConsole');

  const { id } = routeApi.useParams();
  const navigate = useNavigate({ from: '/mcp-servers/$id' });
  // Use fine-grained selector to only re-render when tab changes
  const tab = routeApi.useSearch({ select: (s) => s.tab });

  const [activeTab, setActiveTab] = useState(tab || 'configuration');

  const { data: mcpServerData, isLoading, error } = useGetMCPServerQuery({ id: id || '' }, { enabled: !!id });

  useEffect(() => {
    if (mcpServerData?.mcpServer) {
      updatePageTitle(mcpServerData.mcpServer.displayName);
    }
  }, [mcpServerData]);

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

      <Tabs onValueChange={handleTabChange} value={activeTab}>
        <TabsList>
          <TabsTrigger className="gap-2" value="configuration">
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Configuration
            </div>
          </TabsTrigger>
          <TabsTrigger className="gap-2" value="connection">
            <Link className="h-4 w-4" />
            Connection
          </TabsTrigger>
          <TabsTrigger className="gap-2" value="logs">
            <Logs className="h-4 w-4" />
            Logs
          </TabsTrigger>
          {Boolean(isRemoteMcpInspectorFeatureEnabled) && (
            <TabsTrigger className="gap-2" value="inspector">
              <Search className="h-4 w-4" />
              MCP Inspector
            </TabsTrigger>
          )}
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
        {Boolean(isRemoteMcpInspectorFeatureEnabled) && (
          <TabsContent value="inspector">
            <RemoteMCPInspectorTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};
