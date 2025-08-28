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

import { DynamicCodeBlock } from 'components/redpanda-ui/components/code-block-dynamic';
import { Label } from 'components/redpanda-ui/components/label';
import { TabsContent, type TabsContentProps } from 'components/redpanda-ui/components/tabs';
import { AlertCircle } from 'lucide-react';
import type { MCPServer } from 'protogen/redpanda/api/dataplane/v1alpha3/mcp_pb';
import { useGetMCPServerQuery } from 'react-query/api/remote-mcp';
import { useParams } from 'react-router-dom';
import { CodeTabs } from '../../../redpanda-ui/components/code-tabs';

const getConnectionCodeSnippets = (displayData: MCPServer) => ({
  'Claude Desktop': `// Copy and paste the code into Claude/claude_desktop_config.json
  {
    "mcpServers": {
      "${displayData.displayName.toLowerCase().replace(/\s+/g, '-')}": {
        "command": "npx",
        "args": [
          "@modelcontextprotocol/server-fetch",
          "${displayData.url}"
        ],
        "env": {}
      }
    }
  }`,
  'cURL (Initialize + List Tools)': `# Step 1: Initialize MCP session
  INIT_RESPONSE=$(curl -s -D /tmp/headers -X POST "${displayData.url}" \\
    -H "Content-Type: application/json" \\
    -H "Authorization: Bearer YOUR_M2M_TOKEN" \\
    -d '{
      "jsonrpc": "2.0",
      "id": 1,
      "method": "initialize",
      "params": {
        "protocolVersion": "2025-06-18",
        "capabilities": { "elicitation": {} },
        "clientInfo": { "name": "test-client", "version": "1.0.0" }
      }
    }')

  # Step 2: Extract session ID and list tools
  SESSION_ID=$(grep -i "mcp-session-id" /tmp/headers | cut -d' ' -f2 | tr -d '\\r')
  curl -X POST "${displayData.url}" \\
    -H "Content-Type: application/json" \\
    -H "Authorization: Bearer YOUR_M2M_TOKEN" \\
    -H "Mcp-Session-Id: $SESSION_ID" \\
    -d '{
      "jsonrpc": "2.0",
      "id": 2,
      "method": "tools/list",
      "params": {}
    }'`,
  'cURL (Initialize + Call Tool)': `# Step 1: Initialize MCP session
  INIT_RESPONSE=$(curl -s -D /tmp/headers -X POST "${displayData.url}" \\
    -H "Content-Type: application/json" \\
    -H "Authorization: Bearer YOUR_M2M_TOKEN" \\
    -d '{
      "jsonrpc": "2.0",
      "id": 1,
      "method": "initialize",
      "params": {
        "protocolVersion": "2025-06-18",
        "capabilities": { "elicitation": {} },
        "clientInfo": { "name": "test-client", "version": "1.0.0" }
      }
    }')

  # Step 2: Extract session ID and call tool
  SESSION_ID=$(grep -i "mcp-session-id" /tmp/headers | cut -d' ' -f2 | tr -d '\\r')
  curl -X POST "${displayData.url}" \\
    -H "Content-Type: application/json" \\
    -H "Authorization: Bearer YOUR_M2M_TOKEN" \\
    -H "Mcp-Session-Id: $SESSION_ID" \\
    -d '{
      "jsonrpc": "2.0",
      "id": 3,
      "method": "tools/call",
      "params": {
        "name": "search-posts",
        "arguments": {
          "query": "machine learning",
          "limit": 5
        }
      }
    }'`,
  Python: `# Python client with session initialization
  import asyncio
  import httpx
  
  async def connect_to_mcp():
      async with httpx.AsyncClient() as client:
          # Step 1: Initialize MCP session
          init_response = await client.post(
              "${displayData.url}",
              headers={
                  "Content-Type": "application/json",
                  "Authorization": "Bearer YOUR_M2M_TOKEN"
              },
              json={
                  "jsonrpc": "2.0",
                  "id": 1,
                  "method": "initialize",
                  "params": {
                      "protocolVersion": "2025-06-18",
                      "capabilities": {"elicitation": {}},
                      "clientInfo": {"name": "test-client", "version": "1.0.0"}
                  }
              }
          )
          
          # Extract session ID from headers
          session_id = (init_response.headers.get('mcp-session-id') or 
                       init_response.headers.get('Mcp-Session-Id'))
          
          if not session_id:
              raise Exception("No MCP session ID received")
          
          # Step 2: List tools with session ID
          tools_response = await client.post(
              "${displayData.url}",
              headers={
                  "Content-Type": "application/json",
                  "Authorization": "Bearer YOUR_M2M_TOKEN",
                  "Mcp-Session-Id": session_id
              },
              json={
                  "jsonrpc": "2.0",
                  "id": 2,
                  "method": "tools/list",
                  "params": {}
              }
          )
          
          tools = tools_response.json()
          print(f"Available tools: {tools}")
  
  # Run the client
  asyncio.run(connect_to_mcp())`,
  JavaScript: `// Using fetch API with session initialization
  async function connectToMCP() {
    try {
      // Step 1: Initialize MCP session
      const initResponse = await fetch('${displayData.url}', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer YOUR_M2M_TOKEN'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-06-18',
            capabilities: { elicitation: {} },
            clientInfo: { name: 'test-client', version: '1.0.0' }
          }
        })
      });
      
      // Extract session ID from headers
      const sessionId = initResponse.headers.get('mcp-session-id') || 
                       initResponse.headers.get('Mcp-Session-Id');
      
      if (!sessionId) {
        throw new Error('No MCP session ID received');
      }
      
      // Step 2: List tools with session ID
      const toolsResponse = await fetch('${displayData.url}', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer YOUR_M2M_TOKEN',
          'Mcp-Session-Id': sessionId
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list',
          params: {}
        })
      });
      
      const tools = await toolsResponse.json();
      console.log('Available tools:', tools);
    } catch (error) {
      console.error('Connection failed:', error);
    }
  }
  
  connectToMCP();`,
});

export const RemoteMCPConnectionTab = (props: TabsContentProps) => {
  const { id } = useParams<{ id: string }>();
  const { data: mcpServerData } = useGetMCPServerQuery({ id: id || '' }, { enabled: !!id });

  if (!mcpServerData?.mcpServer) return null;

  return (
    <TabsContent {...props} className="space-y-4">
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold mb-2">Connection Information</h3>
          <p className="text-sm text-muted-foreground mb-6">
            Connect to this MCP server using various clients. The server supports both streamable HTTP and Server-Sent
            Events (SSE). The client will automatically select the preferred transport method.
          </p>
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
                <p className="text-blue-800 dark:text-blue-200 font-medium">Authentication Required</p>
                <p className="text-blue-700 dark:text-blue-300">
                  This server requires a Redpanda Cloud M2M token for authentication.
                  <a href="/organization-iam?tab=service-accounts" className="underline hover:no-underline ml-1">
                    Create an M2M token here.
                  </a>
                  &nbsp;You can test the server directly using the MCP Inspector tab without setting up a client.
                </p>
              </div>
            </div>
          </div>

          <div className="pt-10">
            <CodeTabs codes={getConnectionCodeSnippets(mcpServerData?.mcpServer)} />
          </div>

          <div className="space-y-3 pt-4 border-t">
            <Label className="text-sm font-medium">Supported Transport Methods</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 border rounded-lg">
                <h4 className="font-medium text-sm mb-2">HTTP/HTTPS</h4>
                <p className="text-sm text-muted-foreground">
                  Standard HTTP requests with JSON-RPC 2.0 protocol. Best for simple request/response patterns.
                </p>
              </div>
              <div className="p-4 border rounded-lg">
                <h4 className="font-medium text-sm mb-2">Server-Sent Events (SSE)</h4>
                <p className="text-sm text-muted-foreground">
                  Real-time streaming for long-running operations and live updates. Automatically selected when needed.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </TabsContent>
  );
};
