/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { Button } from 'components/redpanda-ui/components/button';
import { FormContainer, FormField, FormItem, FormMessage } from 'components/redpanda-ui/components/form';
import { Heading, Text } from 'components/redpanda-ui/components/typography';
import { Plus } from 'lucide-react';
import type { LintHint } from 'protogen/redpanda/api/common/v1/linthint_pb';
import { MCPServer_Tool_ComponentType } from 'protogen/redpanda/api/dataplane/v1alpha3/mcp_pb';
import type { UseFieldArrayReturn, UseFormReturn } from 'react-hook-form';
import { QuickAddSecrets } from '../quick-add-secrets';
import type { FormValues } from '../schemas';
import { ToolCard } from './tool-card';

interface ToolsStepProps {
  form: UseFormReturn<FormValues>;
  toolFields: UseFieldArrayReturn<FormValues, 'tools', 'id'>['fields'];
  appendTool: UseFieldArrayReturn<FormValues, 'tools', 'id'>['append'];
  removeTool: UseFieldArrayReturn<FormValues, 'tools', 'id'>['remove'];
  lintResults: Record<number, Record<string, LintHint>>;
  isLintConfigPending: boolean;
  hasSecretWarnings: boolean;
  detectedSecrets: string[];
  existingSecrets: string[];
  onSubmit: (values: FormValues) => Promise<void>;
  onLintTool: (toolIndex: number) => Promise<void>;
  onExpandTool: (toolIndex: number) => void;
}

export const ToolsStep: React.FC<ToolsStepProps> = ({
  form,
  toolFields,
  appendTool,
  removeTool,
  lintResults,
  isLintConfigPending,
  hasSecretWarnings,
  detectedSecrets,
  existingSecrets,
  onSubmit,
  onLintTool,
  onExpandTool,
}) => {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <Heading level={2}>Tools Configuration</Heading>
        <Text variant="muted">
          Define the tools that your MCP server will provide. Each tool requires a name, component type, and YAML
          configuration.
        </Text>
      </div>

      <div className={`grid grid-cols-1 gap-6 ${hasSecretWarnings ? 'xl:grid-cols-3' : ''}`}>
        {/* Main tools configuration - takes 2 columns on xl screens when secrets panel is shown, full width otherwise */}
        <div className={hasSecretWarnings ? 'xl:col-span-2' : ''}>
          <FormContainer onSubmit={form.handleSubmit(onSubmit)} layout="default" width="full">
            <div className="space-y-4">
              {toolFields.map((t, idx) => (
                <ToolCard
                  key={t.id}
                  form={form}
                  toolIndex={idx}
                  canRemove={toolFields.length > 1}
                  lintResults={lintResults[idx] || {}}
                  isLintConfigPending={isLintConfigPending}
                  onRemove={() => removeTool(idx)}
                  onExpand={() => onExpandTool(idx)}
                  onLint={() => onLintTool(idx)}
                />
              ))}

              {/* Add Tool Button */}
              <Button
                type="button"
                variant="dashed"
                className="w-full"
                onClick={() =>
                  appendTool({
                    name: '',
                    componentType: MCPServer_Tool_ComponentType.PROCESSOR,
                    config: '',
                  })
                }
              >
                <Plus className="h-4 w-4" /> Add Tool
              </Button>

              {/* Array-level message for tools errors (e.g., unique names) */}
              <FormField
                control={form.control}
                name="tools"
                render={() => (
                  <FormItem>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </FormContainer>
        </div>

        {/* Secrets panel - takes 1 column on xl screens, only shown when there are missing secrets */}
        {hasSecretWarnings && (
          <div className="xl:col-span-1">
            <div className="sticky top-4">
              <QuickAddSecrets requiredSecrets={detectedSecrets} existingSecrets={existingSecrets} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
