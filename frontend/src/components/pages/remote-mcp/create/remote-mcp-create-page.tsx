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

'use client';

import { create } from '@bufbuild/protobuf';
import type { ConnectError } from '@connectrpc/connect';
import { Code as ConnectCode } from '@connectrpc/connect';
import { zodResolver } from '@hookform/resolvers/zod';
// YAML editor
import { YamlEditor } from 'components/misc/yaml-editor';
// UI components
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent } from 'components/redpanda-ui/components/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'components/redpanda-ui/components/dialog';
import {
  Form,
  FormContainer,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from 'components/redpanda-ui/components/form';
import { Input } from 'components/redpanda-ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import { defineStepper } from 'components/redpanda-ui/components/stepper';
import { Textarea } from 'components/redpanda-ui/components/textarea';
import { Heading, Text } from 'components/redpanda-ui/components/typography';
import { ArrowLeft, Code, FileText, Hammer, Loader2, Maximize2, PencilRuler, Plus, Trash2 } from 'lucide-react';
import type { LintHint } from 'protogen/redpanda/api/common/v1/linthint_pb';
// API and types
import {
  CreateMCPServerRequestSchema,
  LintMCPConfigRequestSchema,
  MCPServer_Tool_ComponentType,
} from 'protogen/redpanda/api/dataplane/v1alpha3/mcp_pb';
import React, { useEffect } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useCreateMCPServerMutation, useLintMCPConfigMutation } from 'react-query/api/remote-mcp';
import { useListSecretsQuery } from 'react-query/api/secret';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';
import { parse, stringify } from 'yaml';
import { z } from 'zod';
import { RemoteMCPBackButton } from '../remote-mcp-back-button';
import { RemoteMCPComponentTypeDescription } from '../remote-mcp-component-type-description';
// Helpers
import { RESOURCE_TIERS } from '../remote-mcp-constants';
import { type Template, templates } from '../remote-mcp-templates';
import { RemoteMCPToolTypeBadge } from '../remote-mcp-tool-type-badge';
import { extractSecretReferences, getUniqueSecretNames } from '../utils/secret-detection';
import { QuickAddSecrets } from './quick-add-secrets';

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

// Zod schema for the create form
const TagSchema = z.object({
  key: z.string().trim().min(0).max(64, { message: 'Key must be at most 64 characters' }),
  value: z.string().trim().min(0).max(256, { message: 'Value must be at most 256 characters' }),
});

const ToolSchema = z
  .object({
    name: z
      .string({ required_error: 'Tool name is required' })
      .trim()
      .min(1, { message: 'Tool name is required' })
      .max(100, { message: 'Tool name must be at most 100 characters' }),
    componentType: z.nativeEnum(MCPServer_Tool_ComponentType, {
      required_error: 'Component type is required',
    }),
    config: z.string({ required_error: 'YAML configuration is required' }).refine((val) => {
      try {
        parse(val);
        return true;
      } catch {
        return false;
      }
    }, 'Invalid YAML configuration'),
    selectedTemplate: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    // Ensure YAML label matches the tool name if YAML parses
    try {
      const doc = parse(val.config);
      if (doc && typeof doc === 'object' && 'label' in doc) {
        const label = (doc as any).label;
        if (typeof label === 'string' && label !== val.name) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'YAML label must match Tool Name',
            path: ['name'],
          });
        }
      }
    } catch {
      // handled above by YAML validation
    }
  });

const FormSchema = z
  .object({
    displayName: z
      .string({ required_error: 'Display name is required' })
      .trim()
      .min(1, { message: 'Display name is required' }),
    description: z.string().trim().optional().default(''),
    tags: z.array(TagSchema).refine(
      (arr) => {
        const keys = arr.map((t) => t.key.trim()).filter((k) => k.length > 0);
        return keys.length === new Set(keys).size;
      },
      { message: 'Tags must have unique keys' },
    ),
    resourcesTier: z.string().min(1, { message: 'Resource tier selection is required' }),
    tools: z
      .array(ToolSchema)
      .min(1, { message: 'At least one tool is required' })
      .refine(
        (arr) => {
          const names = arr.map((t) => t.name.trim()).filter((n) => n.length > 0);
          return names.length === new Set(names).size;
        },
        { message: 'Tool names must be unique' },
      ),
  })
  .strict();

type FormValues = z.infer<typeof FormSchema>;

const initialValues: FormValues = {
  displayName: '',
  description: '',
  tags: [],
  resourcesTier: RESOURCE_TIERS[0]?.id ?? 'XSmall',
  tools: [
    {
      name: '',
      componentType: MCPServer_Tool_ComponentType.PROCESSOR,
      config: '',
    },
  ],
};

function getTierById(id: string | undefined) {
  if (!id) return undefined;
  return RESOURCE_TIERS.find((t) => t.id === id || t.name === id);
}

export const RemoteMCPCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const { mutateAsync: createServer, isPending: isCreateMCPServerPending } = useCreateMCPServerMutation();
  const { mutateAsync: lintConfig, isPending: isLintConfigPending } = useLintMCPConfigMutation();

  // State to store lint results for each tool
  const [lintResults, setLintResults] = React.useState<Record<number, Record<string, LintHint>>>({});

  // State for expanded YAML dialog
  const [expandedTool, setExpandedTool] = React.useState<{ index: number; isOpen: boolean } | null>(null);

  // State for detected secrets
  const [detectedSecrets, setDetectedSecrets] = React.useState<string[]>([]);

  // Query existing secrets
  const { data: secretsData } = useListSecretsQuery();

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

  // Keep YAML label <-> Tool Name in sync
  useEffect(() => {
    const subscription = form.watch((_, info) => {
      const name = info.name ?? '';
      if (!name.startsWith('tools')) return;

      // tools.{index}.field
      const match = name.match(/^tools\.(\d+)\.(name|config)$/);
      if (!match) return;
      const index = Number(match[1]);
      const field = match[2] as 'name' | 'config';

      const tool = form.getValues(`tools.${index}`);
      if (!tool) return;

      if (field === 'name') {
        // Update YAML label when the tool name changes
        try {
          const doc = parse(tool.config) ?? {};
          if ((doc as any).label !== tool.name) {
            (doc as any).label = tool.name ?? '';
            const updated = stringify(doc);
            if (updated !== tool.config) {
              form.setValue(`tools.${index}.config`, updated, { shouldValidate: false, shouldDirty: true });
            }
          }
        } catch {
          // ignore YAML parse errors here; validation will handle it
        }
      }

      if (field === 'config') {
        // Update tool name from YAML label if present
        try {
          const doc = parse(tool.config);
          const label = (doc as any)?.label;
          if (typeof label === 'string' && label.length > 0 && label !== tool.name) {
            form.setValue(`tools.${index}.name`, label, { shouldValidate: false, shouldDirty: true });
          }
        } catch {
          // ignore
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [form]);

  // Clear lint results when tool config changes
  useEffect(() => {
    const subscription = form.watch((_, info) => {
      const name = info.name ?? '';
      if (name.startsWith('tools') && name.endsWith('config')) {
        const match = name.match(/^tools\.(\d+)\.config$/);
        if (match) {
          const index = Number(match[1]);
          setLintResults((prev) => ({
            ...prev,
            [index]: {},
          }));
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [form]);

  // Detect secrets in YAML configurations
  useEffect(() => {
    const subscription = form.watch(() => {
      const tools = form.getValues('tools');
      const allSecretReferences: string[] = [];

      tools.forEach((tool) => {
        if (tool.config) {
          try {
            const secretRefs = extractSecretReferences(tool.config);
            const secretNames = getUniqueSecretNames(secretRefs);
            allSecretReferences.push(...secretNames);
          } catch {
            // Ignore YAML parsing errors
          }
        }
      });

      // Get unique secret names
      const uniqueSecrets = Array.from(new Set(allSecretReferences)).sort();
      setDetectedSecrets(uniqueSecrets);
    });

    return () => subscription.unsubscribe();
  }, [form]);

  const applyTemplateToTool = (toolIndex: number, template: Template) => {
    const yamlString = stringify(template.yaml);
    const label = template.yaml.label as string | undefined;
    form.setValue(`tools.${toolIndex}.componentType`, template.componentType, {
      shouldValidate: true,
      shouldDirty: true,
    });
    form.setValue(`tools.${toolIndex}.config`, yamlString, { shouldValidate: true, shouldDirty: true });
    if (label && typeof label === 'string') {
      form.setValue(`tools.${toolIndex}.name`, label, { shouldValidate: true, shouldDirty: true });
    }
    form.setValue(`tools.${toolIndex}.selectedTemplate`, template.name, {
      shouldValidate: false,
      shouldDirty: true,
    });
  };

  const handleNext = async (isOnMetadataStep: boolean, goNext: () => void) => {
    if (isOnMetadataStep) {
      const valid = await form.trigger(['displayName', 'description', 'resourcesTier', 'tags']);
      if (!valid) return;
      goNext();
    }
  };

  // Check if there are any form errors
  const hasFormErrors = Object.keys(form.formState.errors).length > 0;

  // Check if there are any linting issues
  const hasLintingIssues = React.useMemo(() => {
    return Object.values(lintResults).some((toolLints) => Object.keys(toolLints).length > 0);
  }, [lintResults]);

  // Get existing secret names
  const existingSecrets = React.useMemo(() => {
    if (!secretsData?.secrets) return [];
    return secretsData.secrets.map((secret) => secret?.id).filter(Boolean);
  }, [secretsData]);

  // Check if any detected secrets are missing
  const hasSecretWarnings = React.useMemo(() => {
    if (detectedSecrets.length === 0) return false;
    return detectedSecrets.some((secretName) => !existingSecrets.includes(secretName));
  }, [detectedSecrets, existingSecrets]);

  // Dynamic validation for required metadata fields
  const formValues = form.watch();
  const isMetadataComplete = React.useMemo(() => {
    // Check displayName (required)
    if (!formValues.displayName?.trim()) return false;

    // Check resourcesTier (required)
    if (!formValues.resourcesTier?.trim()) return false;

    // Check for any validation errors in metadata fields
    const hasMetadataErrors = !!(
      form.formState.errors.displayName ||
      form.formState.errors.description ||
      form.formState.errors.resourcesTier ||
      form.formState.errors.tags
    );

    return !hasMetadataErrors;
  }, [
    formValues.displayName,
    formValues.resourcesTier,
    form.formState.errors.displayName,
    form.formState.errors.description,
    form.formState.errors.resourcesTier,
    form.formState.errors.tags,
  ]);

  const isMetadataInvalid = !isMetadataComplete;

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
            navigate(`/remote-mcp/${data.mcpServer.id}`);
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
                  <Card size="full">
                    <CardContent>
                      <div className="space-y-6">
                        <div className="flex flex-col gap-2">
                          <Heading level={2}>Server Metadata</Heading>
                          <Text variant="muted">
                            Configure the basic information and resources for your MCP server.
                          </Text>
                        </div>

                        <FormContainer
                          className="w-full"
                          onSubmit={form.handleSubmit(onSubmit)}
                          layout="default"
                          width="full"
                        >
                          <div className="space-y-6">
                            <FormField
                              control={form.control}
                              name="displayName"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel required>Display Name</FormLabel>
                                  <FormControl>
                                    <Input placeholder="My MCP Server" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="description"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Description</FormLabel>
                                  <FormControl>
                                    <Textarea placeholder="Describe what this MCP server does..." {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <div className="flex flex-col gap-2">
                              <Text variant="label">Tags</Text>
                              <Text variant="muted">Key-value pairs for organizing and categorizing</Text>
                              {tagFields.map((f, idx) => (
                                <div key={f.id} className="flex items-center gap-2">
                                  <FormField
                                    control={form.control}
                                    name={`tags.${idx}.key` as const}
                                    render={({ field }) => (
                                      <FormItem className="flex-1">
                                        <FormControl>
                                          <Input placeholder="Key" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                  <FormField
                                    control={form.control}
                                    name={`tags.${idx}.value` as const}
                                    render={({ field }) => (
                                      <FormItem className="flex-1">
                                        <FormControl>
                                          <Input placeholder="Value" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                  <Button type="button" variant="outline" size="icon" onClick={() => removeTag(idx)}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              ))}
                              <Button type="button" variant="dashed" onClick={() => appendTag({ key: '', value: '' })}>
                                <Plus className="h-4 w-4" /> Add Tag
                              </Button>
                              {/* Array-level message for duplicate keys */}
                              <FormField
                                control={form.control}
                                name="tags"
                                render={() => (
                                  <FormItem>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>

                            <FormField
                              control={form.control}
                              name="resourcesTier"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Resources</FormLabel>
                                  <Select value={field.value} onValueChange={field.onChange}>
                                    <FormControl>
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select resource tier" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      {RESOURCE_TIERS.map((tier) => (
                                        <SelectItem key={tier.id} value={tier.id}>
                                          {tier.displayName}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </FormContainer>
                      </div>
                    </CardContent>
                  </Card>
                </Stepper.Panel>
              )}

              {/* TOOLS STEP */}
              {methods.current.id === 'tools' && (
                <Stepper.Panel>
                  <div className="space-y-6">
                    <div className="flex flex-col gap-2">
                      <Heading level={2}>Tools Configuration</Heading>
                      <Text variant="muted">
                        Define the tools that your MCP server will provide. Each tool requires a name, component type,
                        and YAML configuration.
                      </Text>
                    </div>

                    <div className={`grid grid-cols-1 gap-6 ${hasSecretWarnings ? 'xl:grid-cols-3' : ''}`}>
                      {/* Main tools configuration - takes 2 columns on xl screens when secrets panel is shown, full width otherwise */}
                      <div className={hasSecretWarnings ? 'xl:col-span-2' : ''}>
                        <FormContainer onSubmit={form.handleSubmit(onSubmit)} layout="default" width="full">
                          <div className="space-y-4">
                            {toolFields.map((t, idx) => {
                              const selectedComponentType = form.watch(`tools.${idx}.componentType`);
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
                              const templateSelectionValue = form.watch(`tools.${idx}.selectedTemplate`) || '';
                              return (
                                <Card key={t.id} size="full">
                                  <CardContent>
                                    <div className="space-y-4">
                                      <div className="flex items-center justify-between">
                                        <Text>Tool {idx + 1}</Text>
                                        {toolFields.length > 1 && (
                                          <Button type="button" variant="outline" onClick={() => removeTool(idx)}>
                                            <Trash2 className="h-4 w-4" />
                                          </Button>
                                        )}
                                      </div>
                                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
                                        <FormField
                                          control={form.control}
                                          name={`tools.${idx}.componentType` as const}
                                          render={({ field }) => (
                                            <FormItem>
                                              <FormLabel>Component Type</FormLabel>
                                              <FormControl>
                                                <Select
                                                  value={String(field.value)}
                                                  onValueChange={(v) => {
                                                    const numericValue = Number(v);
                                                    field.onChange(numericValue);
                                                    // Always clear the selected template when component type changes
                                                    form.setValue(`tools.${idx}.selectedTemplate`, '', {
                                                      shouldDirty: true,
                                                      shouldValidate: false,
                                                    });
                                                  }}
                                                >
                                                  <SelectTrigger>
                                                    <SelectValue placeholder="Select component type" />
                                                  </SelectTrigger>
                                                  <SelectContent>
                                                    {Object.values(MCPServer_Tool_ComponentType)
                                                      .filter(
                                                        (type): type is MCPServer_Tool_ComponentType =>
                                                          typeof type === 'number' &&
                                                          type !== MCPServer_Tool_ComponentType.UNSPECIFIED,
                                                      )
                                                      .map((componentType) => (
                                                        <SelectItem key={componentType} value={String(componentType)}>
                                                          <RemoteMCPToolTypeBadge componentType={componentType} />
                                                        </SelectItem>
                                                      ))}
                                                  </SelectContent>
                                                </Select>
                                              </FormControl>
                                              <FormDescription>
                                                <RemoteMCPComponentTypeDescription
                                                  componentType={selectedComponentType}
                                                />
                                              </FormDescription>
                                              <FormMessage />
                                            </FormItem>
                                          )}
                                        />
                                        <FormField
                                          control={form.control}
                                          name={`tools.${idx}.name` as const}
                                          render={({ field }) => (
                                            <FormItem>
                                              <FormLabel>Tool Name</FormLabel>
                                              <FormControl>
                                                <Input placeholder="my_tool" {...field} />
                                              </FormControl>
                                              <FormMessage />
                                            </FormItem>
                                          )}
                                        />
                                        <FormItem>
                                          <FormLabel>Template (Optional)</FormLabel>
                                          <Select
                                            value={templateSelectionValue}
                                            onValueChange={(value) => {
                                              const tpl = templates.find((x) => x.name === value);
                                              if (tpl) {
                                                applyTemplateToTool(idx, tpl);
                                              } else {
                                                form.setValue(`tools.${idx}.selectedTemplate`, undefined, {
                                                  shouldDirty: true,
                                                  shouldValidate: false,
                                                });
                                              }
                                            }}
                                          >
                                            <SelectTrigger>
                                              <SelectValue placeholder="Choose template (optional)">
                                                {templateSelectionValue &&
                                                  templateSelectionValue.length > 0 &&
                                                  (() => {
                                                    const selectedTemplate = templates.find(
                                                      (t) => t.name === templateSelectionValue,
                                                    );
                                                    if (
                                                      !selectedTemplate ||
                                                      selectedTemplate.componentType !== selectedComponentType
                                                    ) {
                                                      return null;
                                                    }
                                                    return (
                                                      <div className="flex items-center gap-2">
                                                        <RemoteMCPToolTypeBadge
                                                          componentType={selectedTemplate.componentType}
                                                        />
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
                                                      <RemoteMCPToolTypeBadge componentType={tpl.componentType} />
                                                      <span className="font-medium text-sm">{tpl.name}</span>
                                                    </div>
                                                    <Text variant="muted" className="text-xs leading-tight">
                                                      {tpl.description}
                                                    </Text>
                                                  </div>
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                          <Text variant="muted">
                                            {(() => {
                                              if (!templateSelectionValue || templateSelectionValue.length === 0)
                                                return 'Select a template to prefill configuration';
                                              const selectedTemplate = templates.find(
                                                (t) => t.name === templateSelectionValue,
                                              );
                                              if (
                                                !selectedTemplate ||
                                                selectedTemplate.componentType !== selectedComponentType
                                              ) {
                                                return 'Select a template to prefill configuration';
                                              }
                                              return selectedTemplate.description;
                                            })()}
                                          </Text>
                                        </FormItem>
                                      </div>

                                      <div className="space-y-2">
                                        <div className="relative border rounded-lg">
                                          <div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50 rounded-t-lg">
                                            <div className="flex items-center gap-2 text-sm text-gray-600">
                                              <Code className="h-4 w-4" />
                                              YAML Configuration
                                            </div>
                                            <div className="flex gap-1">
                                              <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleLintTool(idx)}
                                                disabled={isLintConfigPending}
                                                className="h-7 px-2 text-xs gap-1"
                                              >
                                                <PencilRuler className="h-3 w-3" />
                                                {isLintConfigPending ? 'Linting...' : 'Lint'}
                                              </Button>
                                              <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="h-7 px-2 text-xs gap-1"
                                                onClick={() => setExpandedTool({ index: idx, isOpen: true })}
                                              >
                                                <Maximize2 className="h-3 w-3" />
                                                Expand
                                              </Button>
                                            </div>
                                          </div>
                                          <div className="h-[500px] border-0 rounded-t-none overflow-hidden">
                                            <YamlEditor
                                              value={form.watch(`tools.${idx}.config`)}
                                              onChange={(val) =>
                                                form.setValue(`tools.${idx}.config`, val || '', { shouldDirty: true })
                                              }
                                            />
                                          </div>
                                        </div>
                                        <FormMessage />
                                        {/* Display lint results */}
                                        {lintResults[idx] && Object.keys(lintResults[idx]).length > 0 && (
                                          <div className="space-y-3">
                                            <div className="flex items-center gap-2">
                                              <PencilRuler className="h-4 w-4" />
                                              <Text variant="label" className="font-medium">
                                                Linting Issues
                                              </Text>
                                            </div>
                                            <div className="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
                                              <div className="p-3 space-y-3">
                                                {Object.entries(lintResults[idx]).map(([toolName, hint]) => (
                                                  <div key={toolName} className="space-y-1">
                                                    {hint.line > 0 ? (
                                                      <div className="flex flex-col gap-1">
                                                        <Text className="text-xs font-medium text-gray-600">
                                                          Line {hint.line}, Col {hint.column}
                                                        </Text>
                                                        <Text className="text-sm font-mono leading-relaxed bg-white px-2 py-1 rounded border text-gray-800">
                                                          {hint.hint}
                                                        </Text>
                                                      </div>
                                                    ) : (
                                                      <Text className="text-sm font-mono leading-relaxed bg-white px-2 py-1 rounded border text-gray-800">
                                                        {hint.hint}
                                                      </Text>
                                                    )}
                                                    {hint.lintType && (
                                                      <Text className="text-xs font-medium uppercase tracking-wide text-gray-500">
                                                        {hint.lintType}
                                                      </Text>
                                                    )}
                                                  </div>
                                                ))}
                                              </div>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex justify-center">
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
                                    </div>
                                  </CardContent>
                                </Card>
                              );
                            })}

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
                            <QuickAddSecrets
                              requiredSecrets={detectedSecrets}
                              existingSecrets={existingSecrets.filter((id): id is string => Boolean(id))}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
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
              <Dialog open={expandedTool.isOpen} onOpenChange={(open) => setExpandedTool(open ? expandedTool : null)}>
                <DialogContent size="full" className="max-h-[95vh] h-[95vh] flex flex-col max-w-[95vw] w-[95vw]">
                  <DialogHeader className="flex-shrink-0">
                    <DialogTitle>
                      YAML Configuration - Tool {expandedTool.index + 1}
                      {form.watch(`tools.${expandedTool.index}.name`) &&
                        ` (${form.watch(`tools.${expandedTool.index}.name`)})`}
                    </DialogTitle>
                  </DialogHeader>

                  <div className="flex-1 min-h-0 flex flex-col">
                    <div className="relative border rounded-lg flex-1 flex flex-col min-h-0">
                      <div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50 rounded-t-lg flex-shrink-0">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Code className="h-4 w-4" />
                          YAML Configuration
                        </div>
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleLintTool(expandedTool.index)}
                            disabled={isLintConfigPending}
                            className="h-7 px-2 text-xs gap-1"
                          >
                            <PencilRuler className="h-3 w-3" />
                            {isLintConfigPending ? 'Linting...' : 'Lint'}
                          </Button>
                        </div>
                      </div>
                      <div className="flex-1 min-h-0 border-0 rounded-t-none overflow-hidden">
                        <YamlEditor
                          value={form.watch(`tools.${expandedTool.index}.config`)}
                          onChange={(val) =>
                            form.setValue(`tools.${expandedTool.index}.config`, val || '', {
                              shouldDirty: true,
                              shouldValidate: true,
                            })
                          }
                        />
                      </div>
                    </div>

                    {/* Display validation errors and lint results below the editor */}
                    <div className="flex-shrink-0 mt-4 space-y-2">
                      {form.formState.errors.tools?.[expandedTool.index]?.config && (
                        <div className="text-sm text-red-600">
                          {form.formState.errors.tools[expandedTool.index]?.config?.message}
                        </div>
                      )}

                      {lintResults[expandedTool.index] && Object.keys(lintResults[expandedTool.index]).length > 0 && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <PencilRuler className="h-4 w-4" />
                            <Text variant="label" className="font-medium">
                              Linting Issues
                            </Text>
                          </div>
                          <div className="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
                            <div className="p-3 space-y-3 max-h-40 overflow-y-auto">
                              {Object.entries(lintResults[expandedTool.index]).map(([toolName, hint]) => (
                                <div key={toolName} className="space-y-1">
                                  {hint.line > 0 ? (
                                    <div className="flex flex-col gap-1">
                                      <Text className="text-xs font-medium text-gray-600">
                                        Line {hint.line}, Col {hint.column}
                                      </Text>
                                      <Text className="text-sm font-mono leading-relaxed bg-white px-2 py-1 rounded border text-gray-800">
                                        {hint.hint}
                                      </Text>
                                    </div>
                                  ) : (
                                    <Text className="text-sm font-mono leading-relaxed bg-white px-2 py-1 rounded border text-gray-800">
                                      {hint.hint}
                                    </Text>
                                  )}
                                  {hint.lintType && (
                                    <Text className="text-xs font-medium uppercase tracking-wide text-gray-500">
                                      {hint.lintType}
                                    </Text>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <DialogFooter className="flex-shrink-0">
                    <Button variant="outline" onClick={() => setExpandedTool(null)}>
                      Close
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </>
        )}
      </Stepper.Provider>
    </div>
  );
};
