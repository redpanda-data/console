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
import { MCPIcon } from 'components/redpanda-ui/components/icons';
import { Label } from 'components/redpanda-ui/components/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from 'components/redpanda-ui/components/sheet';
import { Text } from 'components/redpanda-ui/components/typography';
import { isFeatureFlagEnabled, isServerless } from 'config';
import { AlertCircle, Code, Link } from 'lucide-react';
import { useState } from 'react';
import { useGetMCPCodeSnippetQuery, useGetMCPServerQuery } from 'react-query/api/remote-mcp';
import { useParams } from 'react-router-dom';
import GoLogo from '../../../../assets/go.svg';
import JavaLogo from '../../../../assets/java.svg';
import NodeLogo from '../../../../assets/node.svg';
import PythonLogo from '../../../../assets/python.svg';
import { RemoteMCPConnectClientGuide } from '../connect-client-guide/remote-mcp-connect-client-guide';

const AVAILABLE_LANGUAGES = ['python', 'javascript', 'java', 'go'];

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

export const RemoteMCPConnectionTab = () => {
  const { id } = useParams<{ id: string }>();
  const { data: mcpServerData } = useGetMCPServerQuery({ id: id || '' }, { enabled: !!id });

  const [selectedLanguage, setSelectedLanguage] = useState<string>('python');
  const { data: codeSnippetData, isLoading: isLoadingMCPCodeSnippet } = useGetMCPCodeSnippetQuery({
    language: selectedLanguage,
  });

  if (!mcpServerData?.mcpServer) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Left Panel - Client Setup Guide */}
      <div className="bg-card border border-border rounded-lg shadow">
        <div className="p-4 border-b border-gray-200 dark:border-border">
          <h3 className="font-semibold dark:text-white flex items-center gap-2">
            <MCPIcon className="h-4 w-4" />
            Client Setup Guide
          </h3>
        </div>
        <div className="p-4">
          {(!isServerless() || isFeatureFlagEnabled('enableRemoteMcpConnectClientInConsoleServerless')) && (
            <RemoteMCPConnectClientGuide mcpServer={mcpServerData.mcpServer} />
          )}
        </div>
      </div>

      {/* Right Column */}
      <div className="space-y-4">
        {/* Connection Information Panel */}
        <div className="bg-card border border-border rounded-lg shadow">
          <div className="p-4 border-b border-gray-200 dark:border-border">
            <h3 className="font-semibold dark:text-white flex items-center gap-2">
              <Link className="h-4 w-4" />
              Connection Information
            </h3>
          </div>
          <div className="p-4">
            <div className="space-y-4">
              <div className="space-y-4">
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
              </div>
            </div>
          </div>
        </div>

        {/* Code Examples Panel */}
        <div className="bg-card border border-border rounded-lg shadow">
          <div className="p-4 border-b border-gray-200 dark:border-border">
            <h3 className="font-semibold dark:text-white flex items-center gap-2">
              <Code className="h-4 w-4" />
              Code Examples
            </h3>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-2 gap-2">
              {AVAILABLE_LANGUAGES.map((language) => (
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
                        <Markdown showLineNumbers>
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
