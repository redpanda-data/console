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

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

import { Badge } from 'components/redpanda-ui/components/badge';
import { Card, CardContent, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { Label } from 'components/redpanda-ui/components/label';
import { Text } from 'components/redpanda-ui/components/typography';

import { ParameterInput, type ToolParameter } from './remote-mcp-parameter-input';

interface RemoteMCPInspectorParametersProps {
  selectedTool: string;
  availableTools: Tool[];
  toolParameters: Record<string, unknown>;
  onParameterChange: (paramName: string, value: unknown) => void;
}

interface InputSchema {
  properties?: Record<string, unknown>;
  required?: string[];
}

const transformInputSchemaToParameters = (inputSchema?: InputSchema): ToolParameter[] => {
  if (!inputSchema?.properties) {
    return [];
  }

  const properties = inputSchema.properties;
  const required = inputSchema.required || [];

  return Object.entries(properties).map(([paramName, paramSchema]) => {
    const schema = paramSchema as {
      type?: string;
      description?: string;
      enum?: unknown[];
      items?: {
        enum?: unknown[];
      };
    };

    return {
      name: paramName,
      type: schema.type || 'string',
      description: schema.description,
      required: required.includes(paramName),
      enum: schema.enum,
      items: schema.items,
    };
  });
};

interface ParameterListProps {
  parameters: ToolParameter[];
  toolParameters: Record<string, unknown>;
  onParameterChange: (paramName: string, value: unknown) => void;
}

const ParameterList = ({ parameters, toolParameters, onParameterChange }: ParameterListProps) => {
  if (parameters.length === 0) {
    return (
      <Text variant="small" className="text-muted-foreground py-4 text-center">
        No parameters required for this tool.
      </Text>
    );
  }

  return (
    <>
      {parameters.map((param) => (
        <div key={param.name} className="space-y-2">
          <div className="flex items-center gap-2">
            <Label className="text-sm font-medium">
              {param.name}
              {param.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Badge variant="outline" className="text-xs px-1 py-0">
              {param.type}
            </Badge>
          </div>
          {param.description && (
            <Text variant="small" className="text-muted-foreground">
              {param.description}
            </Text>
          )}
          <ParameterInput
            param={param}
            value={toolParameters[param.name]}
            onChange={(value) => onParameterChange(param.name, value)}
          />
        </div>
      ))}
    </>
  );
};

export const RemoteMCPInspectorParameters = ({
  selectedTool,
  availableTools,
  toolParameters,
  onParameterChange,
}: RemoteMCPInspectorParametersProps) => {
  const selectedToolData = availableTools.find((t) => t.name === selectedTool);
  const inputSchema = selectedToolData?.inputSchema as InputSchema;

  const parameters = transformInputSchemaToParameters(inputSchema);

  return (
    <Card className="max-w-full px-8 py-6">
      <CardHeader>
        <CardTitle className="text-base">Parameters</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ParameterList parameters={parameters} toolParameters={toolParameters} onParameterChange={onParameterChange} />
      </CardContent>
    </Card>
  );
};
