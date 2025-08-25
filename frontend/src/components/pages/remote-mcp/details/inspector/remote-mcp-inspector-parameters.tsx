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

import type { MCPTool } from '../../../../../react-query/api/remote-mcp';
import { Badge } from '../../../../redpanda-ui/components/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../redpanda-ui/components/card';
import { Input } from '../../../../redpanda-ui/components/input';
import { Label } from '../../../../redpanda-ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../../redpanda-ui/components/select';
import { Textarea } from '../../../../redpanda-ui/components/textarea';

interface ParameterInputProps {
  param: {
    name: string;
    type: string;
    description?: string;
    required?: boolean;
  };
  value: unknown;
  onChange: (value: unknown) => void;
}

const ParameterInput = ({ param, value, onChange }: ParameterInputProps) => {
  if (param.type === 'string') {
    return (
      <Input
        placeholder={`Enter ${param.name}...`}
        value={String(value || '')}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  if (param.type === 'number') {
    return (
      <Input
        type="number"
        placeholder={`Enter ${param.name}...`}
        value={String(value || '')}
        onChange={(e) => onChange(Number.parseInt(e.target.value) || '')}
      />
    );
  }

  if (param.type === 'boolean') {
    return (
      <Select value={value?.toString() || ''} onValueChange={(val) => onChange(val === 'true')}>
        <SelectTrigger>
          <SelectValue placeholder="Select true or false" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="true">true</SelectItem>
          <SelectItem value="false">false</SelectItem>
        </SelectContent>
      </Select>
    );
  }

  return (
    <Textarea
      placeholder={`Enter ${param.name}...`}
      value={String(value || '')}
      onChange={(e) => onChange(e.target.value)}
      className="min-h-20"
    />
  );
};

interface RemoteMCPInspectorParametersProps {
  selectedTool: string;
  availableTools: MCPTool[];
  toolParameters: Record<string, unknown>;
  onParameterChange: (paramName: string, value: unknown) => void;
}

export const RemoteMCPInspectorParameters = ({
  selectedTool,
  availableTools,
  toolParameters,
  onParameterChange,
}: RemoteMCPInspectorParametersProps) => {
  return (
    <Card className="max-w-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Parameters</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {availableTools
          .find((t) => t.name === selectedTool)
          ?.parameters.map((param) => (
            <div key={param.name} className="space-y-2">
              <div className="flex items-center gap-2">
                <Label className="text-sm font-medium">{param.name}</Label>
                {param.required && (
                  <Badge variant="destructive" className="text-xs px-1 py-0">
                    required
                  </Badge>
                )}
                <Badge variant="outline" className="text-xs px-1 py-0">
                  {param.type}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">{param.description}</p>
              <ParameterInput
                param={param}
                value={toolParameters[param.name]}
                onChange={(value) => onParameterChange(param.name, value)}
              />
            </div>
          ))}
      </CardContent>
    </Card>
  );
};
