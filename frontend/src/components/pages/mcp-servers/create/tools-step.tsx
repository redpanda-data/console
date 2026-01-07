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
import { Field, FieldError } from 'components/redpanda-ui/components/field';
import { Heading, Text } from 'components/redpanda-ui/components/typography';
import { QuickAddSecrets } from 'components/ui/secret/quick-add-secrets';
import { Plus } from 'lucide-react';
import type { LintHint } from 'protogen/redpanda/api/common/v1/linthint_pb';
import { Scope } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { MCPServer_Tool_ComponentType } from 'protogen/redpanda/api/dataplane/v1alpha3/mcp_pb';
import type { UseFieldArrayReturn, UseFormReturn } from 'react-hook-form';

import type { FormValues } from './schemas';
import { ToolCard } from './tool-card';

type ToolsStepProps = {
  form: UseFormReturn<FormValues>;
  toolFields: UseFieldArrayReturn<FormValues, 'tools', 'id'>['fields'];
  appendTool: UseFieldArrayReturn<FormValues, 'tools', 'id'>['append'];
  removeTool: UseFieldArrayReturn<FormValues, 'tools', 'id'>['remove'];
  lintHints: Record<number, Record<string, LintHint>>;
  isLintConfigPending: boolean;
  hasSecretWarnings: boolean;
  detectedSecrets: string[];
  existingSecrets: string[];
  onSubmit: (values: FormValues) => Promise<void>;
  onLintTool: (toolIndex: number) => Promise<void>;
  onExpandTool: (toolIndex: number) => void;
};

export const ToolsStep: React.FC<ToolsStepProps> = ({
  form,
  toolFields,
  appendTool,
  removeTool,
  lintHints,
  isLintConfigPending,
  hasSecretWarnings,
  detectedSecrets,
  existingSecrets,
  onSubmit,
  onLintTool,
  onExpandTool,
}) => {
  const toolsError = form.formState.errors.tools;

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
          <form className="w-full space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
            <div className="space-y-4">
              {toolFields.map((t, idx) => (
                <ToolCard
                  canRemove={toolFields.length > 1}
                  form={form}
                  isLintConfigPending={isLintConfigPending}
                  key={t.id}
                  lintHints={lintHints[idx] || {}}
                  onExpand={() => onExpandTool(idx)}
                  onLint={() => onLintTool(idx)}
                  onRemove={() => removeTool(idx)}
                  toolIndex={idx}
                />
              ))}

              {/* Add Tool Button */}
              <Button
                className="w-full"
                onClick={() =>
                  appendTool({
                    name: '',
                    componentType: MCPServer_Tool_ComponentType.PROCESSOR,
                    config: '',
                  })
                }
                type="button"
                variant="dashed"
              >
                <Plus className="h-4 w-4" /> Add Tool
              </Button>

              {/* Array-level message for tools errors (e.g., unique names) */}
              {!!toolsError && typeof toolsError.message === 'string' && (
                <Field>
                  <FieldError>{toolsError.message}</FieldError>
                </Field>
              )}
            </div>
          </form>
        </div>

        {/* Secrets panel - takes 1 column on xl screens, only shown when there are missing secrets */}
        {Boolean(hasSecretWarnings) && (
          <div className="xl:col-span-1">
            <div className="sticky top-4">
              <QuickAddSecrets
                existingSecrets={existingSecrets}
                requiredSecrets={detectedSecrets}
                scopes={[Scope.MCP_SERVER]}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
