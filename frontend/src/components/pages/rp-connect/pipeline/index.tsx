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

'use no memo';

import type { LintHint } from '@buf/redpandadata_common.bufbuild_es/redpanda/api/common/v1/linthint_pb';
import { create } from '@bufbuild/protobuf';
import { ConnectError } from '@connectrpc/connect';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useRouter, useSearch } from '@tanstack/react-router';
import { isSystemTag } from 'components/constants';
import { ArrowBigUpIcon, CommandIcon } from 'components/icons';
import { isMacOS } from 'utils/platform';
import { Banner, BannerClose, BannerContent } from 'components/redpanda-ui/components/banner';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent } from 'components/redpanda-ui/components/card';
import { CountDot } from 'components/redpanda-ui/components/count-dot';
import { Kbd } from 'components/redpanda-ui/components/kbd';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from 'components/redpanda-ui/components/resizable';
import { Separator } from 'components/redpanda-ui/components/separator';
import { Heading } from 'components/redpanda-ui/components/typography';
import { cn } from 'components/redpanda-ui/lib/utils';
import { LogExplorer } from 'components/ui/connect/log-explorer';
import { LintHintList } from 'components/ui/lint-hint/lint-hint-list';
import { YamlEditor } from 'components/ui/yaml/yaml-editor';
import { isFeatureFlagEnabled, isServerless } from 'config';
import { useDebouncedValue } from 'hooks/use-debounced-value';
import type { editor } from 'monaco-editor';
import type { JSONSchema } from 'monaco-yaml';
import {
  CreatePipelineRequestSchema,
  DeletePipelineRequestSchema,
  UpdatePipelineRequestSchema,
} from 'protogen/redpanda/api/console/v1alpha1/pipeline_pb';
import {
  CreatePipelineRequestSchema as CreatePipelineRequestSchemaDataPlane,
  Pipeline_ServiceAccountSchema,
  Pipeline_State,
  PipelineCreateSchema,
  PipelineUpdateSchema,
  UpdatePipelineRequestSchema as UpdatePipelineRequestSchemaDataPlane,
} from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import {
  useGetPipelineServiceConfigSchemaQuery,
  useLintPipelineConfigQuery,
  useListComponentsQuery,
} from 'react-query/api/connect';
import {
  useCreatePipelineMutation,
  useDeletePipelineMutation,
  useGetPipelineQuery,
  useUpdatePipelineMutation,
} from 'react-query/api/pipeline';
import type { ImperativePanelHandle } from 'react-resizable-panels';
import { toast } from 'sonner';
import {
  getWizardConnectionData,
  useOnboardingUserDataStore,
  useOnboardingWizardDataStore,
  useOnboardingYamlContentStore,
} from 'state/onboarding-wizard-store';
import { addServiceAccountTags } from 'utils/service-account.utils';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';
import { z } from 'zod';

import { ConfigDialog } from './config-dialog';
import { ConnectorWizard } from './connector-wizard';
import { DetailsDialog } from './details-dialog';
import { PipelineCommandMenu } from './pipeline-command-menu';
import { PipelineFlowDiagram } from './pipeline-flow-diagram';
import { PipelineThroughputCard } from './pipeline-throughput-card';
import { Toolbar } from './toolbar';
import { useSlashCommand } from './use-slash-command';
import { extractLintHintsFromError } from '../errors';
import { AddConnectorsCard } from '../onboarding/add-connectors-card';
import { LogsTab } from '../pipelines-details';
import { cpuToTasks, MIN_TASKS, tasksToCPU } from '../tasks';
import type { ConnectComponentType } from '../types/schema';
import { parseSchema } from '../utils/schema';
import { usePipelineMode } from '../utils/use-pipeline-mode';
import { getConnectTemplate } from '../utils/yaml';

const pipelineFormSchema = z.object({
  name: z
    .string()
    .min(3, 'Pipeline name must be at least 3 characters')
    .max(100, 'Pipeline name must be less than 100 characters'),
  description: z.string().optional(),
  computeUnits: z.number().min(MIN_TASKS).int(),
  tags: z
    .array(
      z.object({
        key: z.string().min(1, 'Key is required'),
        value: z.string().min(1, 'Value is required'),
      })
    )
    .default([])
    .refine((tags) => {
      const keys = tags.map((t) => t.key).filter(Boolean);
      return new Set(keys).size === keys.length;
    }, 'Duplicate tag keys are not allowed'),
});

type PipelineFormValues = z.infer<typeof pipelineFormSchema>;

function buildUserTags(formTags: PipelineFormValues['tags']): Record<string, string> {
  const userTags: Record<string, string> = {};
  for (const { key, value } of formTags) {
    if (key) {
      userTags[key] = value;
    }
  }
  return userTags;
}

function warnIfResized(form: ReturnType<typeof useForm<PipelineFormValues>>, cpuShares: string | undefined) {
  const retUnits = cpuToTasks(cpuShares);
  const currentUnits = form.getValues('computeUnits');
  if (retUnits && currentUnits !== retUnits) {
    toast.warning(`Pipeline has been resized to use ${retUnits} compute units`);
  }
}

function buildCreateRequest(opts: {
  name: string;
  description: string | undefined;
  computeUnits: number;
  userTags: Record<string, string>;
  yamlContent: string;
}) {
  const userData = useOnboardingUserDataStore.getState();
  const tags: Record<string, string> = {
    __redpanda_cloud_pipeline_type: 'pipeline',
  };

  let serviceAccountConfig: ReturnType<typeof create<typeof Pipeline_ServiceAccountSchema>> | undefined;
  if (userData.authMethod === 'service-account' && userData.serviceAccountId && userData.serviceAccountSecretName) {
    addServiceAccountTags(tags, userData.serviceAccountId, userData.serviceAccountSecretName);
    serviceAccountConfig = create(Pipeline_ServiceAccountSchema, {
      clientId: `\${secrets.${userData.serviceAccountSecretName}.client_id}`,
      clientSecret: `\${secrets.${userData.serviceAccountSecretName}.client_secret}`,
    });
  }

  return create(CreatePipelineRequestSchema, {
    request: create(CreatePipelineRequestSchemaDataPlane, {
      pipeline: create(PipelineCreateSchema, {
        displayName: opts.name,
        configYaml: opts.yamlContent,
        description: opts.description || '',
        resources: { cpuShares: tasksToCPU(opts.computeUnits) || '0', memoryShares: '0' },
        tags: { ...tags, ...opts.userTags },
        serviceAccount: serviceAccountConfig,
      }),
    }),
  });
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: pipeline page orchestrates many features
export default function PipelinePage() {
  const { mode, pipelineId } = usePipelineMode();
  const navigate = useNavigate();
  const router = useRouter();
  const search = useSearch({ strict: false }) as { serverless?: string };
  const isSlashMenuEnabled = isFeatureFlagEnabled('enableConnectSlashMenu');

  // Zustand store for wizard persistence (CREATE mode only)
  const isServerlessMode = search.serverless === 'true';
  const hasInitializedServerless = useRef(false);
  const persistedYamlContent = useOnboardingYamlContentStore((state) => state.yamlContent);
  const [editorInstance, setEditorInstance] = useState<null | editor.IStandaloneCodeEditor>(null);

  const form = useForm<PipelineFormValues>({
    resolver: zodResolver(pipelineFormSchema),
    mode: 'onChange',
    defaultValues: {
      name: '',
      description: '',
      computeUnits: MIN_TASKS,
      tags: [],
    },
  });

  const [yamlContent, setYamlContent] = useState('');
  const [errorLintHints, setErrorLintHints] = useState<Record<string, LintHint>>({});
  const [isCommandMenuOpen, setIsCommandMenuOpen] = useState(false);
  const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false);
  const [isViewConfigDialogOpen, setIsViewConfigDialogOpen] = useState(false);
  const [addConnectorType, setAddConnectorType] = useState<ConnectComponentType | 'resource' | null>(null);

  // Slash command: inline command menu triggered by typing `/` in the editor
  const slashCommand = useSlashCommand(mode !== 'view' ? editorInstance : null, isSlashMenuEnabled);

  // Cmd+Shift+P keyboard shortcut for pipeline command menu
  useEffect(() => {
    if (mode === 'view') {
      return;
    }
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'p') {
        e.preventDefault();
        setIsCommandMenuOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [mode]);

  const { data: pipelineResponse, isLoading: isPipelineLoading } = useGetPipelineQuery(
    { id: pipelineId || '' },
    {
      enabled: mode !== 'create' && !!pipelineId,
    }
  );

  const pipeline = useMemo(() => pipelineResponse?.response?.pipeline, [pipelineResponse]);

  const { data: componentListResponse } = useListComponentsQuery();

  const components = useMemo(
    () => (componentListResponse?.components ? parseSchema(componentListResponse.components) : []),
    [componentListResponse]
  );

  // Fetch JSON Schema from backend for YAML editor
  const { data: schemaResponse } = useGetPipelineServiceConfigSchemaQuery();
  const yamlEditorSchema = useMemo(() => {
    if (!schemaResponse?.configSchema) {
      return;
    }

    try {
      const parsed = JSON.parse(schemaResponse.configSchema);
      return {
        definitions: parsed.definitions as Record<string, JSONSchema> | undefined,
        properties: parsed.properties as Record<string, JSONSchema> | undefined,
      };
    } catch {
      // Fallback to undefined if schema parsing fails - editor will use basic YAML schema
      return;
    }
  }, [schemaResponse]);

  const { mutate: createMutation, isPending: isCreatePending } = useCreatePipelineMutation();
  const { mutate: updateMutation, isPending: isUpdatePending } = useUpdatePipelineMutation();

  const lintPanelRef = useRef<ImperativePanelHandle>(null);
  const userLintOverrideRef = useRef<'expanded' | 'collapsed' | null>(null);

  const debouncedYamlContent = useDebouncedValue(yamlContent, 500);
  const { data: lintResponse, isPending: isLintPending } = useLintPipelineConfigQuery(debouncedYamlContent, {
    enabled: mode !== 'view',
  });

  // Derive lint hints from response (replaces useEffect + setState)
  const responseLintHints = useMemo(() => {
    if (!lintResponse) {
      return {};
    }
    const hints: Record<string, LintHint> = {};
    for (const [idx, hint] of Object.entries(lintResponse.lintHints || [])) {
      hints[`hint_${idx}`] = hint;
    }
    return hints;
  }, [lintResponse]);

  // Merge response-derived and error-derived lint hints (error hints cleared on next successful response)
  const lintHints = Object.keys(errorLintHints).length > 0 ? errorLintHints : responseLintHints;

  // Initialize form data from pipeline (edit/view)
  useEffect(() => {
    if (pipeline && mode !== 'create') {
      form.reset({
        name: pipeline.displayName,
        description: pipeline.description || '',
        computeUnits: cpuToTasks(pipeline.resources?.cpuShares) || MIN_TASKS,
        tags: Object.entries(pipeline.tags)
          .filter(([k]) => !isSystemTag(k))
          .map(([key, value]) => ({ key, value })),
      });
      queueMicrotask(() => setYamlContent(pipeline.configYaml));
    }
  }, [pipeline, mode, form]);

  // Load persisted YAML from Zustand (CREATE mode only)
  const hasLoadedPersistedYaml = useRef(false);
  useEffect(() => {
    if (mode === 'create' && persistedYamlContent && !hasLoadedPersistedYaml.current) {
      hasLoadedPersistedYaml.current = true;
      queueMicrotask(() => setYamlContent(persistedYamlContent));
    }
  }, [mode, persistedYamlContent]);

  // Serverless mode initialization - generate YAML from onboarding wizard store on mount.
  // Cloud UI populates useOnboardingWizardDataStore (sessionStorage) with the selected
  // connector, then navigates here via the wizard redirect. Wait for hydration before reading.
  const wizardStoreHydrated = useOnboardingWizardDataStore((state) => state.hasHydrated);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Only runs once after hydration, ref prevents re-initialization
  useEffect(() => {
    if (
      mode !== 'create' ||
      !isServerlessMode ||
      hasInitializedServerless.current ||
      components.length === 0 ||
      !wizardStoreHydrated
    ) {
      return;
    }

    const { input: inputData, output: outputData } = getWizardConnectionData();

    if (inputData?.connectionName && inputData?.connectionType) {
      let generatedYaml = '';

      // Generate input template
      generatedYaml =
        getConnectTemplate({
          connectionName: inputData.connectionName,
          connectionType: inputData.connectionType,
          components,
          existingYaml: generatedYaml,
        }) || generatedYaml;

      // Generate output template if exists
      if (outputData?.connectionName && outputData?.connectionType) {
        generatedYaml =
          getConnectTemplate({
            connectionName: outputData.connectionName,
            connectionType: outputData.connectionType,
            components,
            existingYaml: generatedYaml,
          }) || generatedYaml;
      }

      if (generatedYaml) {
        useOnboardingYamlContentStore.getState().setYamlContent({ yamlContent: generatedYaml });
      }
    }

    hasInitializedServerless.current = true;
  }, [components, wizardStoreHydrated]);

  // Auto-open redpanda setup dialog when arriving from serverless onboarding with a redpanda connector
  const wizardInput = useOnboardingWizardDataStore((state) => state.input);
  const wizardOutput = useOnboardingWizardDataStore((state) => state.output);
  const autoOpenRedpandaSetup = useMemo(() => {
    if (!isServerlessMode) {
      return;
    }
    if (wizardInput?.connectionName === 'redpanda') {
      return { connectionName: 'redpanda', connectionType: wizardInput.connectionType };
    }
    if (wizardOutput?.connectionName === 'redpanda') {
      return { connectionName: 'redpanda', connectionType: wizardOutput.connectionType };
    }
    return;
  }, [isServerlessMode, wizardInput, wizardOutput]);

  // Clear wizard store (CREATE mode)
  const clearWizardStore = useCallback(() => {
    useOnboardingYamlContentStore.getState().setYamlContent({ yamlContent: '' });
    useOnboardingWizardDataStore.getState().setWizardData({
      input: undefined,
      output: undefined,
    });
  }, []);

  const handleCancel = useCallback(() => {
    if (mode === 'create') {
      clearWizardStore();
    }
    if (mode === 'view') {
      navigate({ to: '/connect-clusters' });
    } else {
      router.history.back();
    }
  }, [mode, clearWizardStore, navigate, router]);

  const handleSave = useCallback(async () => {
    const isValid = await form.trigger();
    if (!isValid) {
      return;
    }

    const { name, description, computeUnits, tags: formTags } = form.getValues();
    const userTags = buildUserTags(formTags);

    const onError = (err: ConnectError, action: 'create' | 'update') => {
      setErrorLintHints(extractLintHintsFromError(err));
      toast.error(formatToastErrorMessageGRPC({ error: err, action, entity: 'pipeline' }));
    };

    if (mode === 'create') {
      const createRequest = buildCreateRequest({ name, description, computeUnits, userTags, yamlContent });

      createMutation(createRequest, {
        onSuccess: (response) => {
          setErrorLintHints({});
          clearWizardStore();
          toast.success('Pipeline created');
          warnIfResized(form, response.response?.pipeline?.resources?.cpuShares);
          const newPipelineId = response.response?.pipeline?.id;
          navigate({ to: newPipelineId ? `/rp-connect/${newPipelineId}` : '/connect-clusters' });
        },
        onError: (err) => onError(err, 'create'),
      });
    } else if (pipelineId) {
      const updateRequest = create(UpdatePipelineRequestSchema, {
        request: create(UpdatePipelineRequestSchemaDataPlane, {
          id: pipelineId,
          pipeline: create(PipelineUpdateSchema, {
            displayName: name,
            configYaml: yamlContent,
            description: description || '',
            resources: { cpuShares: tasksToCPU(computeUnits) || '0', memoryShares: '0' },
            tags: {
              ...Object.fromEntries(Object.entries(pipeline?.tags ?? {}).filter(([k]) => isSystemTag(k))),
              ...userTags,
            },
            serviceAccount: pipeline?.serviceAccount,
          }),
        }),
      });

      updateMutation(updateRequest, {
        onSuccess: (response) => {
          setErrorLintHints({});
          toast.success('Pipeline updated');
          warnIfResized(form, response.response?.pipeline?.resources?.cpuShares);
          navigate({ to: `/rp-connect/${pipelineId}` });
        },
        onError: (err) => onError(err, 'update'),
      });
    }
  }, [form, yamlContent, mode, pipelineId, createMutation, updateMutation, navigate, clearWizardStore, pipeline]);

  const { mutate: deleteMutation, isPending: isDeletePending } = useDeletePipelineMutation();
  const isSaving = isCreatePending || isUpdatePending;

  const handleDelete = useCallback(
    (id: string) => {
      const deleteRequest = create(DeletePipelineRequestSchema, {
        request: { id },
      });

      deleteMutation(deleteRequest, {
        onSuccess: () => {
          toast.success('Pipeline deleted');
          navigate({ to: '/connect-clusters' });
        },
        onError: (err) => {
          toast.error(
            formatToastErrorMessageGRPC({
              error: ConnectError.from(err),
              action: 'delete',
              entity: 'pipeline',
            })
          );
        },
      });
    },
    [deleteMutation, navigate]
  );

  const handleNameChange = useCallback(
    (name: string) => {
      form.setValue('name', name, { shouldValidate: true });
    },
    [form]
  );

  const handleYamlChange = useCallback(
    (value: string) => {
      setYamlContent(value);
      userLintOverrideRef.current = null;
      if (mode === 'create') {
        useOnboardingYamlContentStore.getState().setYamlContent({ yamlContent: value });
      }
    },
    [mode]
  );

  // After adding a connector via wizard, focus editor and move cursor to end of file
  const handleConnectorYamlChange = useCallback(
    (yaml: string) => {
      handleYamlChange(yaml);
      // Defer until after React render so the editor has the new content
      setTimeout(() => {
        if (editorInstance) {
          const model = editorInstance.getModel();
          if (model) {
            const lastLine = model.getLineCount();
            const lastColumn = model.getLineMaxColumn(lastLine);
            editorInstance.setPosition({ lineNumber: lastLine, column: lastColumn });
            editorInstance.revealLine(lastLine);
          }
          editorInstance.focus();
        }
      }, 0);
    },
    [handleYamlChange, editorInstance]
  );

  // Slash menu tip banner — dismissable
  const [slashTipVisible, setSlashTipVisible] = useState(isSlashMenuEnabled && mode !== 'view');

  const pipelineName = useWatch({ control: form.control, name: 'name' });

  return (
    <div
      className={cn(
        'flex flex-col gap-4',
        mode === 'view' ? 'h-full min-h-[calc(100dvh-10rem)]' : 'h-[calc(100dvh-10rem)]'
      )}
    >
      <Toolbar
        autoFocus={mode === 'create'}
        isLoading={isPipelineLoading}
        isSaving={isSaving}
        mode={mode}
        nameError={form.formState.errors.name?.message}
        onCancel={handleCancel}
        onEditConfig={() => setIsConfigDialogOpen(true)}
        onNameChange={handleNameChange}
        onSave={handleSave}
        onViewConfig={() => setIsViewConfigDialogOpen(true)}
        pipelineId={pipelineId}
        pipelineName={pipelineName}
        pipelineState={pipeline?.state}
      />
      <div className="flex min-h-0 flex-1 rounded-lg border">
        <div className="flex w-[300px] shrink-0 flex-col border-r">
          <div className="min-h-0 flex-1">
            {isFeatureFlagEnabled('enablePipelineDiagrams') && (
              <PipelineFlowDiagram
                configYaml={yamlContent}
                hideZoomControls
                onAddConnector={
                  mode !== 'view' ? (type) => setAddConnectorType(type as ConnectComponentType) : undefined
                }
              />
            )}
          </div>
          {mode !== 'view' && (
            <>
              <AddConnectorsCard
                editorContent={yamlContent}
                hasInput={yamlContent.includes('input:')}
                hasOutput={yamlContent.includes('output:')}
                hideInputOutput={isFeatureFlagEnabled('enablePipelineDiagrams')}
                onAddConnector={(type) => setAddConnectorType(type)}
              />
              <div className="px-4 pb-4">
                <Separator className="mb-3" />
                <div className="flex flex-col gap-2">
                  <Heading className="mb-2 text-muted-foreground" level={5}>
                    Variables
                  </Heading>
                  <Button
                    className="max-w-fit"
                    icon={
                      <Kbd variant="ghost">
                        {isMacOS() ? <CommandIcon /> : 'Ctrl'}
                        <ArrowBigUpIcon />P
                      </Kbd>
                    }
                    onClick={() => setIsCommandMenuOpen(true)}
                    size="xs"
                    variant="secondary-outline"
                  >
                    Insert
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
        <div className="min-w-0 flex-1">
          {mode === 'view' ? (
            <div className="flex h-full flex-col gap-4 overflow-auto p-4">
              {pipeline ? (
                <>
                  <PipelineThroughputCard pipelineId={pipeline.id} />
                  <Card size="full" variant="outlined">
                    <CardContent className="pt-6">
                      {isFeatureFlagEnabled('enableNewPipelineLogs') ? (
                        <LogExplorer
                          enableLiveView={pipeline.state === Pipeline_State.RUNNING}
                          pipeline={pipeline}
                          serverless={isServerless()}
                        />
                      ) : (
                        <LogsTab pipeline={pipeline} />
                      )}
                    </CardContent>
                  </Card>
                </>
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                  Loading pipeline...
                </div>
              )}
            </div>
          ) : (
            <ResizablePanelGroup direction="vertical">
              <ResizablePanel defaultSize={70} minSize={30}>
                <div className="relative h-full">
                  {slashTipVisible ? (
                    <div className="absolute inset-x-0 top-0 z-10">
                      <Banner className="absolute inset-x-0 top-0" height="2rem" variant="accent">
                        <BannerContent>
                          Tip: use{' '}
                          <Kbd size="xs" variant="filled">
                            /
                          </Kbd>{' '}
                          to insert variables
                        </BannerContent>
                        <BannerClose onClick={() => setSlashTipVisible(false)} variant="ghost" />
                      </Banner>
                    </div>
                  ) : null}
                  <YamlEditor
                    onChange={(val) => handleYamlChange(val || '')}
                    onEditorMount={(editorRef) => setEditorInstance(editorRef)}
                    options={slashTipVisible ? { padding: { top: 32 } } : undefined}
                    schema={yamlEditorSchema}
                    transparentBackground
                    value={yamlContent}
                  />
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel collapsible defaultSize={30} ref={lintPanelRef}>
                <div className="h-full overflow-auto p-4">
                  <div className="flex items-center gap-2">
                    <Heading className="text-muted-foreground" level={4}>
                      Lint issues
                    </Heading>
                    {Object.keys(lintHints).length > 0 ? (
                      <CountDot count={Object.keys(lintHints).length} variant="error" />
                    ) : null}
                  </div>
                  <LintHintList isPending={isLintPending} lintHints={lintHints} />
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          )}
        </div>
      </div>

      <ConfigDialog form={form} mode={mode} onOpenChange={setIsConfigDialogOpen} open={isConfigDialogOpen} />

      <DetailsDialog
        isDeleting={isDeletePending}
        onDelete={handleDelete}
        onOpenChange={setIsViewConfigDialogOpen}
        open={isViewConfigDialogOpen}
        pipeline={pipeline}
      />

      <PipelineCommandMenu
        editorInstance={editorInstance}
        onOpenChange={setIsCommandMenuOpen}
        open={isCommandMenuOpen}
        yamlContent={yamlContent}
      />

      {isSlashMenuEnabled ? (
        <PipelineCommandMenu
          editorInstance={editorInstance}
          onOpenChange={(open) => {
            if (!open) {
              slashCommand.close();
            }
          }}
          onSlashSelect={slashCommand.handleSlashSelect}
          open={slashCommand.isOpen}
          slashPosition={slashCommand.slashPosition}
          variant="popover"
          yamlContent={yamlContent}
        />
      ) : null}

      <ConnectorWizard
        addConnectorType={addConnectorType}
        autoOpenRedpandaSetup={autoOpenRedpandaSetup}
        componentList={componentListResponse?.components}
        components={components}
        onClose={() => setAddConnectorType(null)}
        onYamlChange={handleConnectorYamlChange}
        yamlContent={yamlContent}
      />
    </div>
  );
}
