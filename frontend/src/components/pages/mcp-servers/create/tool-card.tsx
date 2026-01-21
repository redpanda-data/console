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
import { Card, CardContent } from 'components/redpanda-ui/components/card';
import { Field, FieldDescription, FieldError, FieldLabel } from 'components/redpanda-ui/components/field';
import { Input } from 'components/redpanda-ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import { Text } from 'components/redpanda-ui/components/typography';
import { RedpandaConnectComponentTypeBadge } from 'components/ui/connect/redpanda-connect-component-type-badge';
import { LintHintList } from 'components/ui/lint-hint/lint-hint-list';
import { YamlEditorCard } from 'components/ui/yaml/yaml-editor-card';
import { Trash2 } from 'lucide-react';
import type { LintHint } from 'protogen/redpanda/api/common/v1/linthint_pb';
import { MCPServer_Tool_ComponentType } from 'protogen/redpanda/api/dataplane/v1alpha3/mcp_pb';
import { Controller, type UseFormReturn } from 'react-hook-form';

import { applyTemplateToTool } from './form-helpers';
import type { FormValues } from './schemas';
import { RemoteMCPComponentTypeDescription } from '../remote-mcp-component-type-description';
import { templates } from '../templates/remote-mcp-templates';

type ToolCardProps = {
  form: UseFormReturn<FormValues>;
  toolIndex: number;
  canRemove: boolean;
  lintHints: Record<string, LintHint>;
  isLintConfigPending: boolean;
  onRemove: () => void;
  onExpand: () => void;
  onLint: () => void;
};

export const ToolCard: React.FC<ToolCardProps> = ({
  form,
  toolIndex,
  canRemove,
  lintHints,
  isLintConfigPending,
  onRemove,
  onExpand,
  onLint,
}) => {
  const selectedComponentType = form.watch(`tools.${toolIndex}.componentType`);
  const templateSelectionValue = form.watch(`tools.${toolIndex}.selectedTemplate`) || '';
  const componentTypeError = form.formState.errors.tools?.[toolIndex]?.componentType;
  const nameError = form.formState.errors.tools?.[toolIndex]?.name;

  // Sort templates: matching component type first, then by component type and name
  const templateOptions = [...templates].sort((a, b) => {
    const aMatches = a.componentType === selectedComponentType;
    const bMatches = b.componentType === selectedComponentType;
    if (aMatches === bMatches) {
      // Secondary sort by component type, then by name
      if (a.componentType === b.componentType) {
        return a.name.localeCompare(b.name);
      }
      return a.componentType - b.componentType;
    }
    return bMatches ? 1 : -1;
  });

  return (
    <Card size="full">
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Text>Tool {toolIndex + 1}</Text>
            {Boolean(canRemove) && (
              <Button onClick={onRemove} type="button" variant="outline">
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
            <Field data-invalid={!!componentTypeError}>
              <FieldLabel htmlFor={`tool-${toolIndex}-componentType`}>Component Type</FieldLabel>
              <Controller
                control={form.control}
                name={`tools.${toolIndex}.componentType` as const}
                render={({ field }) => (
                  <Select
                    onValueChange={(v) => {
                      const numericValue = Number(v);
                      field.onChange(numericValue);
                      // Always clear the selected template when component type changes
                      form.setValue(`tools.${toolIndex}.selectedTemplate`, '', {
                        shouldDirty: true,
                        shouldValidate: false,
                      });
                    }}
                    value={String(field.value)}
                  >
                    <SelectTrigger id={`tool-${toolIndex}-componentType`}>
                      <SelectValue placeholder="Select component type" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(MCPServer_Tool_ComponentType)
                        .filter(
                          (type): type is MCPServer_Tool_ComponentType =>
                            typeof type === 'number' && type !== MCPServer_Tool_ComponentType.UNSPECIFIED
                        )
                        .map((componentType) => (
                          <SelectItem key={componentType} value={String(componentType)}>
                            <RedpandaConnectComponentTypeBadge componentType={componentType} />
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldDescription>
                <RemoteMCPComponentTypeDescription componentType={selectedComponentType} />
              </FieldDescription>
              {!!componentTypeError && <FieldError>{componentTypeError.message}</FieldError>}
            </Field>

            <Field data-invalid={!!nameError}>
              <FieldLabel htmlFor={`tool-${toolIndex}-name`}>Tool Name</FieldLabel>
              <Input
                id={`tool-${toolIndex}-name`}
                placeholder="my_tool"
                {...form.register(`tools.${toolIndex}.name` as const)}
                aria-describedby={nameError ? `tool-${toolIndex}-name-error` : undefined}
                aria-invalid={!!nameError}
              />
              {!!nameError && <FieldError id={`tool-${toolIndex}-name-error`}>{nameError.message}</FieldError>}
            </Field>

            <Field>
              <FieldLabel htmlFor={`tool-${toolIndex}-template`}>Template (Optional)</FieldLabel>
              <Select
                onValueChange={(value) => {
                  const tpl = templates.find((x) => x.name === value);
                  if (tpl) {
                    applyTemplateToTool(form, toolIndex, tpl);
                  } else {
                    form.setValue(`tools.${toolIndex}.selectedTemplate`, undefined, {
                      shouldDirty: true,
                      shouldValidate: false,
                    });
                  }
                }}
                value={templateSelectionValue}
              >
                <SelectTrigger id={`tool-${toolIndex}-template`}>
                  <SelectValue placeholder="Choose template (optional)">
                    {templateSelectionValue &&
                      templateSelectionValue.length > 0 &&
                      (() => {
                        const selectedTemplate = templates.find((t) => t.name === templateSelectionValue);
                        if (!selectedTemplate || selectedTemplate.componentType !== selectedComponentType) {
                          return null;
                        }
                        return (
                          <div className="flex items-center gap-2">
                            <RedpandaConnectComponentTypeBadge componentType={selectedTemplate.componentType} />
                            <span>{selectedTemplate.name}</span>
                          </div>
                        );
                      })()}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  {templateOptions.map((tpl) => (
                    <SelectItem key={`${tpl.name}-${tpl.componentType}`} value={tpl.name}>
                      <div className="flex flex-col gap-1 py-1">
                        <div className="flex items-center gap-2">
                          <RedpandaConnectComponentTypeBadge componentType={tpl.componentType} />
                          <span className="font-medium text-sm">{tpl.name}</span>
                        </div>
                        <Text className="text-xs leading-tight" variant="muted">
                          {tpl.description}
                        </Text>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>
                {(() => {
                  if (!templateSelectionValue || templateSelectionValue.length === 0) {
                    return 'Select a template to prefill configuration';
                  }
                  const selectedTemplate = templates.find((t) => t.name === templateSelectionValue);
                  if (!selectedTemplate || selectedTemplate.componentType !== selectedComponentType) {
                    return 'Select a template to prefill configuration';
                  }
                  return selectedTemplate.description;
                })()}
              </FieldDescription>
            </Field>
          </div>

          <div className="space-y-2">
            <YamlEditorCard
              height="500px"
              isLinting={isLintConfigPending}
              onChange={(val) => form.setValue(`tools.${toolIndex}.config`, val, { shouldDirty: true })}
              onExpand={onExpand}
              onLint={onLint}
              showExpand
              showLint
              value={form.watch(`tools.${toolIndex}.config`)}
            />
            <LintHintList lintHints={lintHints} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
