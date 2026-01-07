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
import { Card, CardContent, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { DynamicCodeBlock } from 'components/redpanda-ui/components/code-block-dynamic';
import { MCPIcon } from 'components/redpanda-ui/components/icons';
import { Label } from 'components/redpanda-ui/components/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from 'components/redpanda-ui/components/sheet';
import { Link, Text } from 'components/redpanda-ui/components/typography';
import { isFeatureFlagEnabled, isServerless } from 'config';
import { AlertCircle, Code, Link as LinkIcon } from 'lucide-react';
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

  if (!mcpServerData?.mcpServer) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Left Panel - Client Setup Guide */}
      <Card className="px-0 py-0" size="full">
        <CardHeader className="border-b p-4 dark:border-border [.border-b]:pb-4">
          <CardTitle className="flex items-center gap-2">
            <MCPIcon className="h-4 w-4" />
            <Text className="font-semibold">Client Setup Guide</Text>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {(!isServerless() || isFeatureFlagEnabled('enableRemoteMcpConnectClientInConsoleServerless')) && (
            <RemoteMCPConnectClientGuide mcpServer={mcpServerData.mcpServer} />
          )}
        </CardContent>
      </Card>

      {/* Right Column */}
      <div className="space-y-4">
        {/* Connection Information Panel */}
        <Card className="px-0 py-0" size="full">
          <CardHeader className="border-b p-4 dark:border-border [.border-b]:pb-4">
            <CardTitle className="flex items-center gap-2">
              <LinkIcon className="h-4 w-4" />
              <Text className="font-semibold">Connection Information</Text>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-4">
              <div className="space-y-4">
                <Label className="font-medium text-sm">Server URL</Label>
                <div className="w-full">
                  <DynamicCodeBlock code={mcpServerData?.mcpServer?.url || ''} lang="text" />
                </div>
                <div className="rounded-md border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950/30">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600 dark:text-blue-400" />
                    <div className="space-y-2 text-sm">
                      <Text className="font-medium text-blue-800 dark:text-blue-200">Authentication Required</Text>
                      <Text className="text-blue-700 dark:text-blue-300">
                        This server requires a Redpanda Cloud M2M token for authentication.
                        <Link className="ml-1" href="/organization-iam?tab=service-accounts">
                          Create an M2M token here.
                        </Link>
                        &nbsp;You can test the server directly using the MCP Inspector tab without setting up a client.
                      </Text>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Code Examples Panel */}
        <Card className="px-0 py-0" size="full">
          <CardHeader className="border-b p-4 dark:border-border [.border-b]:pb-4">
            <CardTitle className="flex items-center gap-2">
              <Code className="h-4 w-4" />
              <Text className="font-semibold">Code Examples</Text>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="grid grid-cols-2 gap-2">
              {AVAILABLE_LANGUAGES.map((language) => (
                <Sheet key={language}>
                  <SheetTrigger asChild>
                    <Button
                      className="mt-2 flex h-16 flex-shrink-1 flex-col items-center justify-center hover:bg-muted/50"
                      onClick={() => setSelectedLanguage(language)}
                      variant="outline"
                    >
                      <img alt={language} src={getLanguageIcon(language)} />
                    </Button>
                  </SheetTrigger>
                  <SheetContent className="w-full overflow-y-auto sm:max-w-2xl" side="right">
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
                                mcpServerData?.mcpServer?.url || '<mcp-server-url>'
                              )
                            : `# ${language.charAt(0).toUpperCase() + language.slice(1)} connection code\n# Please select this language to load the snippet...`}
                        </Markdown>
                      )}
                    </div>
                  </SheetContent>
                </Sheet>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
