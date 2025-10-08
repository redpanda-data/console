/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

'use client';

import { create } from '@bufbuild/protobuf';
import type { ConnectError } from '@connectrpc/connect';
import { Code as ConnectCode } from '@connectrpc/connect';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from 'components/redpanda-ui/components/button';
import { Form } from 'components/redpanda-ui/components/form';
import { defineStepper } from 'components/redpanda-ui/components/stepper';
import { Heading, Text } from 'components/redpanda-ui/components/typography';
import { useLintHints } from 'components/ui/lint-hint/use-lint-hints';
import { useSecretDetection } from 'components/ui/secret/use-secret-detection';
import { ExpandedYamlDialog } from 'components/ui/yaml/expanded-yaml-dialog';
import { useYamlLabelSync } from 'components/ui/yaml/use-yaml-label-sync';
import { ArrowLeft, FileText, Hammer, Loader2 } from 'lucide-react';
import {
  CreateMCPServerRequestSchema,
  LintMCPConfigRequestSchema,
} from 'protogen/redpanda/api/dataplane/v1alpha3/mcp_pb';
import React, { useMemo, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useCreateMCPServerMutation, useLintMCPConfigMutation } from 'react-query/api/remote-mcp';
import { useListSecretsQuery } from 'react-query/api/secret';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

import { getTierById } from './form-helpers';
import { MetadataStep } from './metadata-step';
import { FormSchema, type FormValues, initialValues } from './schemas';
import { ToolsStep } from './tools-step';
import { useMetadataValidation } from './use-metadata-validation';
import { RemoteMCPBackButton } from '../remote-mcp-back-button';

const TOOL_FIELD_REGEX = /mcp_server\.tools\.([^.]+)\.(.+)/;

// Stepper definition
const { Stepper } = defineStepper(
  {
    id: 'metadata',
    title: 'Metadata',
    description: 'Configure server information',
    icon: <FileText className="h-4 w-4" />,
  },
  {
    id: 'tools',
    title: 'Tools',
    description: 'Define with YAML config',
    icon: <Hammer className="h-4 w-4" />,
  }
);

export const RemoteMCPCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const { mutateAsync: createServer, isPending: isCreateMCPServerPending } = useCreateMCPServerMutation();
  const { mutateAsync: lintConfig, isPending: isLintConfigPending } = useLintMCPConfigMutation();

  // State for expanded YAML dialog
  const [expandedTool, setExpandedTool] = useState<{ index: number; isOpen: boolean } | null>(null);

  // Query existing secrets
  const { data: secretsData } = useListSecretsQuery();

  // Form setup
  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: initialValues,
    mode: 'onChange',
  });

  const {
    fields: tagFields,
    append: appendTag,
    remove: removeTag,
  } = useFieldArray({
    control: form.control,
    name: 'tags',
  });

  const {
    fields: toolFields,
    append: appendTool,
    remove: removeTool,
  } = useFieldArray({
    control: form.control,
    name: 'tools',
  });

  // Custom hooks for form logic
  useYamlLabelSync(form);
  const { lintHints, setLintHints, hasLintingIssues } = useLintHints(form);

  // Get existing secret names
  const existingSecrets = useMemo(() => {
    if (!secretsData?.secrets) {
      return [];
    }
    return secretsData.secrets.map((secret) => secret?.id).filter(Boolean) as string[];
  }, [secretsData]);

  // Use the built-in hook which watches the form
  const { detectedSecrets, hasSecretWarnings } = useSecretDetection(form, existingSecrets);
  const { isMetadataInvalid } = useMetadataValidation(form);

  // Check if there are any form errors
  const hasFormErrors = Object.keys(form.formState.errors).length > 0;

  const handleNext = async (isOnMetadataStep: boolean, goNext: () => void) => {
    if (isOnMetadataStep) {
      const valid = await form.trigger(['displayName', 'description', 'resourcesTier', 'tags']);
      if (!valid) {
        return;
      }
      goNext();
    }
  };

  const handleLintTool = async (toolIndex: number) => {
    const tool = form.getValues(`tools.${toolIndex}`);
    if (!(tool?.name.trim() && tool.config.trim())) {
      toast.error('Tool name and configuration are required for linting');
      return;
    }

    const toolsMap: Record<string, { componentType: number; configYaml: string }> = {
      [tool.name.trim()]: {
        componentType: tool.componentType,
        configYaml: tool.config,
      },
    };

    const response = await lintConfig(
      create(LintMCPConfigRequestSchema, {
        tools: toolsMap,
      })
    );

    // Update lint hints for this tool
    setLintHints((prev) => ({
      ...prev,
      [toolIndex]: response.lintHints || {},
    }));
  };

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complexity 56, refactor later
  const handleValidationError = (error: ConnectError) => {
    if (error.code === ConnectCode.InvalidArgument && error.details) {
      // Find BadRequest details
      const badRequest = error.details.find((detail) => (detail as any).type === 'google.rpc.BadRequest') as any;
      if (badRequest?.debug?.fieldViolations) {
        // Set form errors for specific fields
        for (const violation of badRequest.debug.fieldViolations) {
          const { field, description } = violation;

          // Map server field names to form field names
          if (field === 'mcp_server.display_name') {
            form.setError('displayName', {
              type: 'server',
              message: description,
            });
            toast.error(`Display Name: ${description}`);
          } else if (field === 'mcp_server.description') {
            form.setError('description', {
              type: 'server',
              message: description,
            });
            toast.error(`Description: ${description}`);
          } else if (field.startsWith('mcp_server.tools.')) {
            // Handle tool-specific validation errors
            const toolFieldMatch = field.match(TOOL_FIELD_REGEX);
            if (toolFieldMatch) {
              const [, toolName, toolField] = toolFieldMatch;
              // Find the tool index by name
              const toolIndex = form.getValues('tools').findIndex((t) => t.name.trim() === toolName);
              if (toolIndex !== -1) {
                if (toolField === 'component_type') {
                  form.setError(`tools.${toolIndex}.componentType`, {
                    type: 'server',
                    message: description,
                  });
                } else if (toolField === 'config_yaml') {
                  form.setError(`tools.${toolIndex}.config`, {
                    type: 'server',
                    message: description,
                  });
                }
                toast.error(`Tool "${toolName}" - ${toolField.replace('_', ' ')}: ${description}`);
              }
            } else {
              toast.error(`Tools: ${description}`);
            }
          } else {
            // Generic field error
            toast.error(`${field}: ${description}`);
          }
        }
        return;
      }
    }

    // Fallback to generic error message
    toast.error(formatToastErrorMessageGRPC({ error, action: 'create', entity: 'MCP server' }));
  };

  const onSubmit = async (values: FormValues) => {
    const tier = getTierById(values.resourcesTier);
    const tagsMap: Record<string, string> = {};
    for (const t of values.tags) {
      const key = t.key?.trim();
      if (key) {
        tagsMap[key] = (t.value ?? '').trim();
      }
    }

    const toolsMap: Record<string, { componentType: number; configYaml: string }> = {};
    for (const t of values.tools) {
      if (!t.name.trim()) {
        continue;
      }
      toolsMap[t.name.trim()] = {
        componentType: t.componentType,
        configYaml: t.config,
      };
    }

    await createServer(
      create(CreateMCPServerRequestSchema, {
        mcpServer: {
          displayName: values.displayName.trim(),
          description: values.description?.trim() ?? '',
          tools: toolsMap,
          tags: tagsMap,
          resources: {
            cpuShares: tier?.cpu ?? '200m',
            memoryShares: tier?.memory ?? '800M',
          },
        },
      }),
      {
        onError: handleValidationError,
        onSuccess: (data) => {
          if (data?.mcpServer?.id) {
            toast.success('MCP server created');
            navigate(`/mcp-servers/${data.mcpServer.id}`);
          }
        },
      }
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="space-y-4">
        <RemoteMCPBackButton />
        <div className="space-y-2">
          <Heading level={1}>Create MCP Server</Heading>
          <Text variant="muted">Set up a new managed MCP server with custom tools and configurations.</Text>
        </div>
      </div>

      <Stepper.Provider className="space-y-4" variant="horizontal">
        {({ methods }) => (
          <>
            <Stepper.Navigation>
              <Stepper.Step
                disabled={hasFormErrors}
                of="metadata"
                onClick={hasFormErrors ? undefined : () => methods.goTo('metadata')}
              >
                <Stepper.Title>Metadata</Stepper.Title>
                <Stepper.Description>Configure server information</Stepper.Description>
              </Stepper.Step>
              <Stepper.Step
                disabled={!!isMetadataInvalid}
                of="tools"
                onClick={isMetadataInvalid ? undefined : () => methods.goTo('tools')}
              >
                <Stepper.Title>Tools</Stepper.Title>
                <Stepper.Description>Define with YAML config</Stepper.Description>
              </Stepper.Step>
            </Stepper.Navigation>

            <Form {...form}>
              {/* METADATA STEP */}
              {methods.current.id === 'metadata' && (
                <Stepper.Panel>
                  <MetadataStep
                    appendTag={appendTag}
                    form={form}
                    onSubmit={onSubmit}
                    removeTag={removeTag}
                    tagFields={tagFields}
                  />
                </Stepper.Panel>
              )}

              {/* TOOLS STEP */}
              {methods.current.id === 'tools' && (
                <Stepper.Panel>
                  <ToolsStep
                    appendTool={appendTool}
                    detectedSecrets={detectedSecrets}
                    existingSecrets={existingSecrets}
                    form={form}
                    hasSecretWarnings={hasSecretWarnings}
                    isLintConfigPending={isLintConfigPending}
                    lintHints={lintHints}
                    onExpandTool={(index) => setExpandedTool({ index, isOpen: true })}
                    onLintTool={handleLintTool}
                    onSubmit={onSubmit}
                    removeTool={removeTool}
                    toolFields={toolFields}
                  />
                </Stepper.Panel>
              )}

              <Stepper.Controls className={methods.isFirst ? 'flex justify-end' : 'flex justify-between'}>
                {!methods.isFirst && (
                  <Button disabled={isCreateMCPServerPending} onClick={methods.prev} variant="outline">
                    <ArrowLeft className="h-4 w-4" />
                    Previous
                  </Button>
                )}
                {methods.isLast ? (
                  <Button
                    disabled={isCreateMCPServerPending || hasFormErrors || hasLintingIssues || hasSecretWarnings}
                    onClick={form.handleSubmit(onSubmit)}
                  >
                    {isCreateMCPServerPending ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <Text as="span">Creating...</Text>
                      </div>
                    ) : (
                      'Create MCP Server'
                    )}
                  </Button>
                ) : (
                  <Button
                    disabled={methods.current.id === 'metadata' ? !!isMetadataInvalid : false}
                    onClick={() => handleNext(methods.current.id === 'metadata', methods.next)}
                  >
                    Next
                  </Button>
                )}
              </Stepper.Controls>
            </Form>

            {/* Expanded YAML Editor Dialog */}
            {expandedTool && (
              <ExpandedYamlDialog
                form={form}
                isLintConfigPending={isLintConfigPending}
                isOpen={expandedTool.isOpen}
                lintHints={lintHints[expandedTool.index] || {}}
                onClose={() => setExpandedTool(null)}
                onLint={() => handleLintTool(expandedTool.index)}
                toolIndex={expandedTool.index}
              />
            )}
          </>
        )}
      </Stepper.Provider>
    </div>
  );
};
