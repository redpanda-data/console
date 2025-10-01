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
import { useSecretDetection } from 'hooks/use-secret-detection';
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
import { RemoteMCPBackButton } from '../remote-mcp-back-button';
import { ExpandedYamlDialog } from './components/expanded-yaml-dialog';
import { MetadataStep } from './components/metadata-step';
import { ToolsStep } from './components/tools-step';
import { useLintResults } from './hooks/use-lint-results';
import { useMetadataValidation } from './hooks/use-metadata-validation';
import { useYamlLabelSync } from './hooks/use-yaml-label-sync';
import { FormSchema, type FormValues, initialValues } from './schemas';
import { getTierById } from './utils/form-helpers';

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
  },
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
  const { lintResults, setLintResults, hasLintingIssues } = useLintResults(form);

  // Get existing secret names
  const existingSecrets = useMemo(() => {
    if (!secretsData?.secrets) return [];
    return secretsData.secrets.map((secret) => secret?.id).filter(Boolean) as string[];
  }, [secretsData]);

  // Watch form and extract all YAML configs for secret detection
  const tools = form.watch('tools');
  const allYamlContent = useMemo(() => {
    return tools.map((tool) => tool.config || '').join('\n');
  }, [tools]);

  const { detectedSecrets, hasSecretWarnings } = useSecretDetection(allYamlContent, existingSecrets);
  const { isMetadataInvalid } = useMetadataValidation(form);

  // Check if there are any form errors
  const hasFormErrors = Object.keys(form.formState.errors).length > 0;

  const handleNext = async (isOnMetadataStep: boolean, goNext: () => void) => {
    if (isOnMetadataStep) {
      const valid = await form.trigger(['displayName', 'description', 'resourcesTier', 'tags']);
      if (!valid) return;
      goNext();
    }
  };

  const handleLintTool = async (toolIndex: number) => {
    const tool = form.getValues(`tools.${toolIndex}`);
    if (!tool || !tool.name.trim() || !tool.config.trim()) {
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
      }),
    );

    // Update lint results for this tool
    setLintResults((prev) => ({
      ...prev,
      [toolIndex]: response.lintHints || {},
    }));
  };

  const handleValidationError = (error: ConnectError) => {
    if (error.code === ConnectCode.InvalidArgument && error.details) {
      // Find BadRequest details
      const badRequest = error.details.find((detail) => (detail as any).type === 'google.rpc.BadRequest') as any;
      if (badRequest?.debug?.fieldViolations) {
        // Set form errors for specific fields
        badRequest.debug.fieldViolations.forEach((violation: { field: string; description: string }) => {
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
            const toolFieldMatch = field.match(/mcp_server\.tools\.([^.]+)\.(.+)/);
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
        });
        return;
      }
    }

    // Fallback to generic error message
    toast.error(formatToastErrorMessageGRPC({ error, action: 'create', entity: 'MCP server' }));
  };

  const onSubmit = async (values: FormValues) => {
    const tier = getTierById(values.resourcesTier);
    const tagsMap: Record<string, string> = {};
    values.tags.forEach((t) => {
      const key = t.key?.trim();
      if (key) tagsMap[key] = (t.value ?? '').trim();
    });

    const toolsMap: Record<string, { componentType: number; configYaml: string }> = {};
    values.tools.forEach((t) => {
      if (!t.name.trim()) return;
      toolsMap[t.name.trim()] = {
        componentType: t.componentType,
        configYaml: t.config,
      };
    });

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
      },
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
                of="metadata"
                onClick={hasFormErrors ? undefined : () => methods.goTo('metadata')}
                disabled={hasFormErrors}
              >
                <Stepper.Title>Metadata</Stepper.Title>
                <Stepper.Description>Configure server information</Stepper.Description>
              </Stepper.Step>
              <Stepper.Step
                of="tools"
                onClick={isMetadataInvalid ? undefined : () => methods.goTo('tools')}
                disabled={!!isMetadataInvalid}
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
                    form={form}
                    tagFields={tagFields}
                    appendTag={appendTag}
                    removeTag={removeTag}
                    onSubmit={onSubmit}
                  />
                </Stepper.Panel>
              )}

              {/* TOOLS STEP */}
              {methods.current.id === 'tools' && (
                <Stepper.Panel>
                  <ToolsStep
                    form={form}
                    toolFields={toolFields}
                    appendTool={appendTool}
                    removeTool={removeTool}
                    lintResults={lintResults}
                    isLintConfigPending={isLintConfigPending}
                    hasSecretWarnings={hasSecretWarnings}
                    detectedSecrets={detectedSecrets}
                    existingSecrets={existingSecrets}
                    onSubmit={onSubmit}
                    onLintTool={handleLintTool}
                    onExpandTool={(index) => setExpandedTool({ index, isOpen: true })}
                  />
                </Stepper.Panel>
              )}

              <Stepper.Controls className={methods.isFirst ? 'flex justify-end' : 'flex justify-between'}>
                {!methods.isFirst && (
                  <Button variant="outline" onClick={methods.prev} disabled={isCreateMCPServerPending}>
                    <ArrowLeft className="h-4 w-4" />
                    Previous
                  </Button>
                )}
                {methods.isLast ? (
                  <Button
                    onClick={form.handleSubmit(onSubmit)}
                    disabled={isCreateMCPServerPending || hasFormErrors || hasLintingIssues || hasSecretWarnings}
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
                    onClick={() => handleNext(methods.current.id === 'metadata', methods.next)}
                    disabled={methods.current.id === 'metadata' ? !!isMetadataInvalid : false}
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
                toolIndex={expandedTool.index}
                isOpen={expandedTool.isOpen}
                lintResults={lintResults[expandedTool.index] || {}}
                isLintConfigPending={isLintConfigPending}
                onClose={() => setExpandedTool(null)}
                onLint={() => handleLintTool(expandedTool.index)}
              />
            )}
          </>
        )}
      </Stepper.Provider>
    </div>
  );
};
