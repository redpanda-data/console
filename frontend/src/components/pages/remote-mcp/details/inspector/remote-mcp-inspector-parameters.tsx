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
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { Label } from 'components/redpanda-ui/components/label';
import { Text } from 'components/redpanda-ui/components/typography';
import { Plus, Trash2 } from 'lucide-react';

import { ParameterInput, type ToolParameter } from './remote-mcp-parameter-input';

interface RemoteMCPInspectorParametersProps {
  selectedTool: string;
  availableTools: Tool[];
  toolParameters: Record<string, unknown>;
  onParameterChange: (paramName: string, value: unknown) => void;
  arrayIndexes: Record<string, number>;
  onArrayAdd: (arrayName: string) => void;
  onArrayRemove: (arrayName: string, index: number) => void;
}

interface InputSchema {
  properties?: Record<string, unknown>;
  required?: string[];
}

const transformInputSchemaToParameters = (
  inputSchema?: InputSchema,
  arrayIndexes: Record<string, number> = {},
): ToolParameter[] => {
  if (!inputSchema?.properties) {
    return [];
  }

  const properties = inputSchema.properties;
  const required = inputSchema.required || [];
  const parameters: ToolParameter[] = [];

  const processProperties = (props: Record<string, unknown>, requiredFields: string[] = [], prefix = '') => {
    Object.entries(props).forEach(([paramName, paramSchema]) => {
      const schema = paramSchema as {
        type?: string;
        description?: string;
        enum?: unknown[];
        items?: {
          enum?: unknown[];
          type?: string;
          properties?: Record<string, unknown>;
          required?: string[];
        };
        properties?: Record<string, unknown>;
        required?: string[];
      };

      const fullName = prefix ? `${prefix}.${paramName}` : paramName;
      const isRequired = requiredFields.includes(paramName);

      // Check if this parameter has nested properties
      const hasNestedProperties =
        (schema.type === 'array' && schema.items?.properties) || (schema.type === 'object' && schema.properties);

      // Only add the current parameter if it doesn't have nested properties (i.e., it's a leaf parameter)
      if (!hasNestedProperties) {
        parameters.push({
          name: fullName,
          type: schema.type || 'string',
          description: schema.description,
          required: isRequired,
          enum: schema.enum,
          items: schema.items,
        });
      }

      // Recursively process nested properties
      if (schema.type === 'array' && schema.items?.properties) {
        // For arrays with object items, generate parameters for each array index
        const arrayCount = arrayIndexes[fullName] || 1;
        for (let i = 0; i < arrayCount; i++) {
          processProperties(schema.items.properties, schema.items.required || [], `${fullName}[${i}]`);
        }
      } else if (schema.type === 'object' && schema.properties) {
        // For objects, process the nested properties
        processProperties(schema.properties, schema.required || [], fullName);
      }
    });
  };

  processProperties(properties, required);
  return parameters;
};

interface ParameterListProps {
  parameters: ToolParameter[];
  toolParameters: Record<string, unknown>;
  onParameterChange: (paramName: string, value: unknown) => void;
  inputSchema?: InputSchema;
  arrayIndexes: Record<string, number>;
  onArrayAdd: (arrayName: string) => void;
  onArrayRemove: (arrayName: string, index: number) => void;
}

const ParameterList = ({
  parameters,
  toolParameters,
  onParameterChange,
  inputSchema,
  arrayIndexes,
  onArrayAdd,
  onArrayRemove,
}: ParameterListProps) => {
  if (parameters.length === 0) {
    return (
      <Text variant="small" className="text-muted-foreground py-4 text-center">
        No parameters required for this tool.
      </Text>
    );
  }

  // Group parameters by array and index
  const groupedParams: Record<string, { arrayName: string; index: number; params: ToolParameter[] }> = {};
  const standaloneParams: ToolParameter[] = [];

  parameters.forEach((param) => {
    const arrayMatch = param.name.match(/^(.+)\[(\d+)\]\.(.+)$/);
    if (arrayMatch) {
      const [, arrayName, indexStr] = arrayMatch;
      const index = Number.parseInt(indexStr, 10);
      const groupKey = `${arrayName}[${index}]`;

      if (!groupedParams[groupKey]) {
        groupedParams[groupKey] = { arrayName, index, params: [] };
      }
      groupedParams[groupKey].params.push(param);
    } else {
      standaloneParams.push(param);
    }
  });

  // Find array schemas for Add buttons
  const arraySchemas: Record<string, { description?: string }> = {};
  if (inputSchema?.properties) {
    Object.entries(inputSchema.properties).forEach(([key, schema]) => {
      const s = schema as { type?: string; description?: string; items?: { properties?: Record<string, unknown> } };
      if (s.type === 'array' && s.items?.properties) {
        arraySchemas[key] = { description: s.description };
      }
    });
  }

  return (
    <>
      {/* Render standalone parameters */}
      {standaloneParams.map((param) => (
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

      {/* Render grouped array parameters */}
      {Object.entries(arraySchemas).map(([arrayName, schema]) => {
        const arrayCount = arrayIndexes[arrayName] || 1;
        const arrayGroups = Object.entries(groupedParams).filter(([key]) => key.startsWith(`${arrayName}[`));

        return (
          <div key={arrayName} className="space-y-4 border rounded-lg p-4 bg-muted/20">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">
                  {arrayName}
                  <span className="text-destructive ml-1">*</span>
                </Label>
                {schema.description && (
                  <Text variant="small" className="text-muted-foreground mt-1">
                    {schema.description}
                  </Text>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={() => onArrayAdd(arrayName)} className="h-8">
                <Plus className="h-4 w-4 mr-1" />
                Add Message
              </Button>
            </div>

            {arrayGroups.map(([groupKey, group]) => (
              <div key={groupKey} className="space-y-3 border rounded-lg p-3 bg-background">
                <div className="flex items-center justify-between">
                  <Text variant="small" className="font-medium text-muted-foreground">
                    Message #{group.index + 1}
                  </Text>
                  {arrayCount > 1 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onArrayRemove(arrayName, group.index)}
                      className="h-7 w-7 p-0"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>

                {group.params.map((param) => (
                  <div key={param.name} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label className="text-sm font-medium">
                        {param.name.split('.').pop()}
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
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
};

export const RemoteMCPInspectorParameters = ({
  selectedTool,
  availableTools,
  toolParameters,
  onParameterChange,
  arrayIndexes,
  onArrayAdd,
  onArrayRemove,
}: RemoteMCPInspectorParametersProps) => {
  const selectedToolData = availableTools.find((t) => t.name === selectedTool);
  const inputSchema = selectedToolData?.inputSchema as InputSchema;

  const parameters = transformInputSchemaToParameters(inputSchema, arrayIndexes);

  return (
    <Card className="max-w-full px-8 py-6">
      <CardHeader>
        <CardTitle className="text-base">Parameters</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ParameterList
          parameters={parameters}
          toolParameters={toolParameters}
          onParameterChange={onParameterChange}
          inputSchema={inputSchema}
          arrayIndexes={arrayIndexes}
          onArrayAdd={onArrayAdd}
          onArrayRemove={onArrayRemove}
        />
      </CardContent>
    </Card>
  );
};
