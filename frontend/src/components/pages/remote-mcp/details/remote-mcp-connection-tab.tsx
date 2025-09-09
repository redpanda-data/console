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

import { Markdown } from '@redpanda-data/ui';
import { Button } from 'components/redpanda-ui/components/button';
import { DynamicCodeBlock } from 'components/redpanda-ui/components/code-block-dynamic';
import { CodeTabs } from 'components/redpanda-ui/components/code-tabs';
import { Label } from 'components/redpanda-ui/components/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from 'components/redpanda-ui/components/sheet';
import { Heading, Text } from 'components/redpanda-ui/components/typography';
import { config } from 'config';
import { AlertCircle } from 'lucide-react';
import { useState } from 'react';
import { useGetMCPCodeSnippetQuery, useGetMCPServerQuery } from 'react-query/api/remote-mcp';
import { useParams } from 'react-router-dom';
import GoLogo from '../../../../assets/go.svg';
import JavaLogo from '../../../../assets/java.svg';
import NodeLogo from '../../../../assets/node.svg';
import PythonLogo from '../../../../assets/python.svg';

const getLanguageIcon = (language: string) => {
  switch (language) {
    case 'python':
      return PythonLogo;
    case 'javascript':
      return NodeLogo;
    case 'java':
      return JavaLogo;
    case 'go':
      return GoLogo;
    default:
      return null;
  }
};

const getRpkCloudEnvironment = () => {
  if (window.location.hostname.includes('main')) {
    return 'integration';
  }
  if (window.location.hostname.includes('preprod')) {
    return 'preprod';
  }
  if (window.location.hostname.includes('cloud.redpanda.com')) {
    return 'production';
  }

  return 'integration';
};

const getRpkCommand = ({
  clusterId,
  mcpServerId,
  clientType,
}: {
  clusterId?: string;
  mcpServerId?: string;
  clientType?: string;
}) => {
  return `rpk -X cloud_environment=${getRpkCloudEnvironment()} cloud mcp proxy \\
--cluster-id ${clusterId || 'YOUR_CLUSTER_ID'} \\
--mcp-server-id ${mcpServerId || 'YOUR_MCP_SERVER_ID'} \\
--install --client ${clientType || 'YOUR_CLIENT_TYPE'}`;
};

export const RemoteMCPConnectionTab = () => {
  const { id } = useParams<{ id: string }>();
  const { data: mcpServerData } = useGetMCPServerQuery({ id: id || '' }, { enabled: !!id });

  const availableLanguages = ['python', 'javascript'];
  const [selectedLanguage, setSelectedLanguage] = useState<string>('python');
  const { data: codeSnippetData, isLoading: isLoadingMCPCodeSnippet } = useGetMCPCodeSnippetQuery({
    language: selectedLanguage,
  });

  const getClientRpkCommands = () => {
    return {
      'Claude Desktop': `# Add to your Claude Desktop configuration
${getRpkCommand({ clusterId: config?.clusterId, mcpServerId: mcpServerData?.mcpServer?.id, clientType: 'claude' })}`,
      'Claude Code': `# Run this command in your terminal
${getRpkCommand({ clusterId: config?.clusterId, mcpServerId: mcpServerData?.mcpServer?.id, clientType: 'claude-code' })}`,
    };
  };

  if (!mcpServerData?.mcpServer) return null;

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        <div>
          <Heading level={3} className="mb-2">
            Connection Information
          </Heading>
          <Text variant="small" className="text-muted-foreground mb-6">
            Connect to this MCP server using various clients. The server supports both streamable HTTP and Server-Sent
            Events (SSE). The client will automatically select the preferred transport method.
          </Text>
        </div>
        <div className="space-y-3">
          <Label className="text-sm font-medium">Server URL</Label>
          <div className="w-full">
            <DynamicCodeBlock lang="text" code={mcpServerData?.mcpServer?.url || ''} />
          </div>
          <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="space-y-2 text-sm">
                <Text className="text-blue-800 dark:text-blue-200 font-medium">Authentication Required</Text>
                <Text className="text-blue-700 dark:text-blue-300">
                  This server requires a Redpanda Cloud M2M token for authentication.
                  <a href="/organization-iam?tab=service-accounts" className="underline hover:no-underline ml-1">
                    Create an M2M token here.
                  </a>
                  &nbsp;You can test the server directly using the MCP Inspector tab without setting up a client.
                </Text>
              </div>
            </div>
          </div>

          <div className="pt-6">
            <Label className="text-sm font-medium">RPK Commands by Client</Label>
            <div className="w-full mt-2">
              <CodeTabs lang="bash" codes={getClientRpkCommands()} />
            </div>
          </div>

          <div className="pt-10">
            <Heading level={4} className="mb-4">
              Code Examples
            </Heading>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {availableLanguages.map((language) => (
                <Sheet key={language}>
                  <SheetTrigger asChild>
                    <Button
                      variant="outline"
                      className="flex flex-col items-center justify-center mt-2 hover:bg-muted/50 flex-shrink-1 h-16"
                      onClick={() => setSelectedLanguage(language)}
                    >
                      <img src={getLanguageIcon(language)} alt={language} />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
                    <SheetHeader>
                      <SheetTitle>{language.charAt(0).toUpperCase() + language.slice(1)} Connection Code</SheetTitle>
                    </SheetHeader>
                    <div className="mt-6">
                      {isLoadingMCPCodeSnippet ? (
                        <div className="flex items-center justify-center p-8">
                          <div className="text-muted-foreground">Loading code snippet...</div>
                        </div>
                      ) : (
                        <Markdown>
                          {selectedLanguage === language && codeSnippetData
                            ? codeSnippetData.replaceAll(
                                '<mcp-server-url>',
                                mcpServerData?.mcpServer?.url || '<mcp-server-url>',
                              )
                            : `# ${language.charAt(0).toUpperCase() + language.slice(1)} connection code\n# Please select this language to load the snippet...`}
                        </Markdown>
                      )}
                    </div>
                  </SheetContent>
                </Sheet>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
