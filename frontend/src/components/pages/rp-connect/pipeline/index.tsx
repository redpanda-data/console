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

import { create } from '@bufbuild/protobuf';
import { ConnectError } from '@connectrpc/connect';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useRouter, useSearch } from '@tanstack/react-router';
import { isSystemTag } from 'components/constants';
import { Button } from 'components/redpanda-ui/components/button';
import { CountDot } from 'components/redpanda-ui/components/count-dot';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from 'components/redpanda-ui/components/dialog';
import { Form } from 'components/redpanda-ui/components/form';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from 'components/redpanda-ui/components/resizable';
import { Heading } from 'components/redpanda-ui/components/typography';
import { cn } from 'components/redpanda-ui/lib/utils';
import { LintHintList } from 'components/ui/lint-hint/lint-hint-list';
import { YamlEditor } from 'components/ui/yaml/yaml-editor';
import { isFeatureFlagEnabled } from 'config';
import { useDebouncedValue } from 'hooks/use-debounced-value';
import type { LintHint } from 'protogen/redpanda/api/common/v1/linthint_pb';
import {
  CreatePipelineRequestSchema,
  DeletePipelineRequestSchema,
  UpdatePipelineRequestSchema,
} from 'protogen/redpanda/api/console/v1alpha1/pipeline_pb';
import {
  CreatePipelineRequestSchema as CreatePipelineRequestSchemaDataPlane,
  Pipeline_ServiceAccountSchema,
  PipelineCreateSchema,
  PipelineUpdateSchema,
  UpdatePipelineRequestSchema as UpdatePipelineRequestSchemaDataPlane,
} from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useLintPipelineConfigQuery, useListComponentsQuery } from 'react-query/api/connect';
import {
  useCreatePipelineMutation,
  useDeletePipelineMutation,
  useGetPipelineQuery,
  useUpdatePipelineMutation,
} from 'react-query/api/pipeline';
import type { ImperativePanelHandle } from 'react-resizable-panels';
import { toast } from 'sonner';
import {
  useOnboardingTopicDataStore,
  useOnboardingUserDataStore,
  useOnboardingWizardDataStore,
  useOnboardingYamlContentStore,
} from 'state/onboarding-wizard-store';
import { addServiceAccountTags } from 'utils/service-account.utils';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';
import { z } from 'zod';

import { Config } from './config';
import { PipelineCommandMenu } from './pipeline-command-menu';
import { PipelineFlowDiagram } from './pipeline-flow-diagram';
import { type MiniWizardResult, RedpandaMiniWizard } from './redpanda-mini-wizard';
import { Toolbar } from './toolbar';
import { ViewDetails } from './view-details';
import { extractLintHintsFromError } from '../errors';
import { AddConnectorDialog } from '../onboarding/add-connector-dialog';
import { AddConnectorsCard } from '../onboarding/add-connectors-card';
import { AddSecretsDialog } from '../onboarding/add-secrets-dialog';
import { AddTopicStep } from '../onboarding/add-topic-step';
import { AddUserStep } from '../onboarding/add-user-step';
import { LogsTab } from '../pipelines-details';
import { cpuToTasks, MIN_TASKS, tasksToCPU } from '../tasks';
import { REDPANDA_TOPIC_AND_USER_COMPONENTS } from '../types/constants';
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

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: pipeline page orchestrates many features
export default function PipelinePage() {
  const { mode, pipelineId } = usePipelineMode();
  const navigate = useNavigate();
  const router = useRouter();
  const search = useSearch({ strict: false }) as { serverless?: string };

  // Zustand store for wizard persistence (CREATE mode only)
  const isServerlessMode = search.serverless === 'true';
  const hasInitializedServerless = useRef(false);
  const persistedYamlContent = useOnboardingYamlContentStore((state) => state.yamlContent);

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
  const [lintHints, setLintHints] = useState<Record<string, LintHint>>({});
  const editorInstanceRef = useRef<import('monaco-editor').editor.IStandaloneCodeEditor | null>(null);
  const [isCommandMenuOpen, setIsCommandMenuOpen] = useState(false);
  const [isSecretsDialogOpen, setIsSecretsDialogOpen] = useState(false);
  const [isTopicDialogOpen, setIsTopicDialogOpen] = useState(false);
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [pendingSecretSearch, setPendingSecretSearch] = useState('');

  const handleEditorMount = useCallback((editorInstance: import('monaco-editor').editor.IStandaloneCodeEditor) => {
    editorInstanceRef.current = editorInstance;
  }, []);

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

  const { mutate: createMutation, isPending: isCreatePending } = useCreatePipelineMutation();
  const { mutate: updateMutation, isPending: isUpdatePending } = useUpdatePipelineMutation();

  const lintPanelRef = useRef<ImperativePanelHandle>(null);
  const userLintOverrideRef = useRef<'expanded' | 'collapsed' | null>(null);

  const debouncedYamlContent = useDebouncedValue(yamlContent, 500);
  const { data: lintResponse, isPending: isLintPending } = useLintPipelineConfigQuery(debouncedYamlContent, {
    enabled: mode !== 'view',
  });

  const lintHintCount = Object.keys(lintHints).length;
  const hasLintHints = lintHintCount > 0;

  // Auto-collapse/expand lint panel, respecting manual user overrides
  useEffect(() => {
    if (mode === 'view') {
      return;
    }
    const override = userLintOverrideRef.current;
    if (override === 'expanded' || override === 'collapsed') {
      return;
    }
    if (hasLintHints) {
      lintPanelRef.current?.expand();
    } else {
      lintPanelRef.current?.collapse();
    }
  }, [hasLintHints, mode]);

  useEffect(() => {
    if (lintResponse) {
      try {
        const hints: Record<string, LintHint> = {};
        for (const [idx, hint] of Object.entries(lintResponse?.lintHints || [])) {
          hints[`hint_${idx}`] = hint;
        }
        setLintHints(hints);
      } catch (err) {
        setLintHints(extractLintHintsFromError(err));
      }
    }
  }, [lintResponse]);

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
      setYamlContent(pipeline.configYaml);
    }
  }, [pipeline, mode, form]);

  // Load persisted YAML from Zustand (CREATE mode only)
  useEffect(() => {
    if (mode === 'create' && persistedYamlContent) {
      setYamlContent(persistedYamlContent);
    }
  }, [mode, persistedYamlContent]);

  // Serverless mode initialization - generate YAML from wizard data on mount
  // biome-ignore lint/correctness/useExhaustiveDependencies: Only runs once after hydration, ref prevents re-initialization
  useEffect(() => {
    if (mode !== 'create' || !isServerlessMode || hasInitializedServerless.current || components.length === 0) {
      return;
    }

    const wizardData = useOnboardingWizardDataStore.getState();
    const inputData = wizardData.input;
    const outputData = wizardData.output;

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
  }, [components]);

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
    // Validate form
    const isValid = await form.trigger();
    if (!isValid) {
      return;
    }

    const { name, description, computeUnits, tags: formTags } = form.getValues();
    const userTags: Record<string, string> = {};
    for (const { key, value } of formTags) {
      if (key) {
        userTags[key] = value;
      }
    }

    if (mode === 'create') {
      const userData = useOnboardingUserDataStore.getState();
      const tags: Record<string, string> = {
        __redpanda_cloud_pipeline_type: 'pipeline',
      };

      let serviceAccountConfig: ReturnType<typeof create<typeof Pipeline_ServiceAccountSchema>> | undefined;
      if (userData.authMethod === 'service-account' && userData.serviceAccountId && userData.serviceAccountSecretName) {
        // Add cloud-managed tags for cleanup
        addServiceAccountTags(tags, userData.serviceAccountId, userData.serviceAccountSecretName);

        // Service account passed in proto spec, NOT in YAML
        serviceAccountConfig = create(Pipeline_ServiceAccountSchema, {
          clientId: `\${secrets.${userData.serviceAccountSecretName}.client_id}`,
          clientSecret: `\${secrets.${userData.serviceAccountSecretName}.client_secret}`,
        });
      }

      const pipelineCreate = create(PipelineCreateSchema, {
        displayName: name,
        configYaml: yamlContent,
        description: description || '',
        resources: {
          cpuShares: tasksToCPU(computeUnits) || '0',
          memoryShares: '0',
        },
        tags: { ...tags, ...userTags },
        serviceAccount: serviceAccountConfig,
      });

      const createRequestDataPlane = create(CreatePipelineRequestSchemaDataPlane, {
        pipeline: pipelineCreate,
      });

      const createRequest = create(CreatePipelineRequestSchema, {
        request: createRequestDataPlane,
      });

      createMutation(createRequest, {
        onSuccess: (response) => {
          setLintHints({});
          clearWizardStore();
          toast.success('Pipeline created');

          const retUnits = cpuToTasks(response.response?.pipeline?.resources?.cpuShares);
          const currentUnits = form.getValues('computeUnits');
          if (retUnits && currentUnits !== retUnits) {
            toast.warning(`Pipeline has been resized to use ${retUnits} compute units`);
          }
          const newPipelineId = response.response?.pipeline?.id;
          if (newPipelineId) {
            navigate({ to: `/rp-connect/${newPipelineId}` });
          } else {
            navigate({ to: '/connect-clusters' });
          }
        },
        onError: (err) => {
          setLintHints(extractLintHintsFromError(err));
          toast.error(
            formatToastErrorMessageGRPC({
              error: err,
              action: 'create',
              entity: 'pipeline',
            })
          );
        },
      });
    } else if (pipelineId) {
      const pipelineUpdate = create(PipelineUpdateSchema, {
        displayName: name,
        configYaml: yamlContent,
        description: description || '',
        resources: {
          cpuShares: tasksToCPU(computeUnits) || '0',
          memoryShares: '0',
        },
        tags: {
          ...Object.fromEntries(Object.entries(pipeline?.tags ?? {}).filter(([k]) => isSystemTag(k))),
          ...userTags,
        },
        serviceAccount: pipeline?.serviceAccount,
      });

      const updateRequestDataPlane = create(UpdatePipelineRequestSchemaDataPlane, {
        id: pipelineId,
        pipeline: pipelineUpdate,
      });

      const updateRequest = create(UpdatePipelineRequestSchema, {
        request: updateRequestDataPlane,
      });

      updateMutation(updateRequest, {
        onSuccess: (response) => {
          setLintHints({});
          toast.success('Pipeline updated');
          const retUnits = cpuToTasks(response.response?.pipeline?.resources?.cpuShares);
          const currentUnits = form.getValues('computeUnits');
          if (retUnits && currentUnits !== retUnits) {
            toast.warning(`Pipeline has been resized to use ${retUnits} compute units`);
          }
          navigate({ to: `/rp-connect/${pipelineId}` });
        },
        onError: (err) => {
          setLintHints(extractLintHintsFromError(err));
          toast.error(
            formatToastErrorMessageGRPC({
              error: err,
              action: 'update',
              entity: 'pipeline',
            })
          );
        },
      });
    }
  }, [form, yamlContent, mode, pipelineId, createMutation, updateMutation, navigate, clearWizardStore, pipeline]);

  const { mutate: deleteMutation, isPending: isDeletePending } = useDeletePipelineMutation();
  const isSaving = isCreatePending || isUpdatePending;
  const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false);
  const [addConnectorType, setAddConnectorType] = useState<ConnectComponentType | 'resource' | null>(null);

  const handleOpenConfigDialog = useCallback(() => {
    setIsConfigDialogOpen(true);
  }, []);

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

  const [miniWizardConfig, setMiniWizardConfig] = useState<{
    connectionName: string;
    connectionType: ConnectComponentType;
  } | null>(null);

  const handleConnectorSelected = useCallback(
    (connectionName: string, connectionType: ConnectComponentType) => {
      setAddConnectorType(null);

      // Redpanda components open the mini wizard instead of directly injecting
      if (REDPANDA_TOPIC_AND_USER_COMPONENTS.includes(connectionName)) {
        setMiniWizardConfig({ connectionName, connectionType });
        return;
      }

      const newYaml = getConnectTemplate({
        connectionName,
        connectionType,
        components,
        showAdvancedFields: false,
        existingYaml: yamlContent,
      });
      if (newYaml) {
        handleYamlChange(newYaml);
      }
    },
    [components, yamlContent, handleYamlChange]
  );

  const handleMiniWizardComplete = useCallback(
    (result: MiniWizardResult) => {
      if (!miniWizardConfig) {
        return;
      }

      // Populate onboarding stores so schemaToConfig can read topic/user data
      if (result.topicName) {
        useOnboardingTopicDataStore.getState().setTopicData({ topicName: result.topicName });
      }
      if (result.authMethod === 'service-account' && result.serviceAccountId) {
        useOnboardingUserDataStore.getState().setUserData({
          authMethod: 'service-account',
          serviceAccountName: result.serviceAccountName ?? '',
          serviceAccountId: result.serviceAccountId,
          serviceAccountSecretName: result.serviceAccountSecretName ?? '',
        });
      } else if (result.username) {
        useOnboardingUserDataStore.getState().setUserData({
          authMethod: 'sasl',
          username: result.username,
          saslMechanism: (result.saslMechanism as 'SCRAM-SHA-256' | 'SCRAM-SHA-512') ?? 'SCRAM-SHA-256',
          consumerGroup: result.consumerGroup ?? '',
        });
      }

      const newYaml = getConnectTemplate({
        connectionName: miniWizardConfig.connectionName,
        connectionType: miniWizardConfig.connectionType,
        components,
        showAdvancedFields: false,
        existingYaml: yamlContent,
      });

      // Clear stores immediately so they don't leak into other operations
      useOnboardingTopicDataStore.getState().reset();
      useOnboardingUserDataStore.getState().reset();

      if (newYaml) {
        handleYamlChange(newYaml);
      }
      setMiniWizardConfig(null);
    },
    [miniWizardConfig, components, yamlContent, handleYamlChange]
  );

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

  const pipelineName = useWatch({ control: form.control, name: 'name' });

  return (
    <div className={cn('flex h-[calc(100dvh-10rem)] flex-col gap-4')}>
      <Toolbar
        autoFocus={mode === 'create'}
        isLoading={isPipelineLoading}
        isSaving={isSaving}
        mode={mode}
        nameError={form.formState.errors.name?.message}
        onCancel={handleCancel}
        onCommandMenu={() => {
          setIsCommandMenuOpen(true);
        }}
        onEditConfig={handleOpenConfigDialog}
        onNameChange={handleNameChange}
        onSave={handleSave}
        pipelineId={pipelineId}
        pipelineName={pipelineName}
        pipelineState={pipeline?.state}
      />
      <div className="flex min-h-0 flex-1 rounded-lg border">
        <div className="flex w-[300px] shrink-0 flex-col border-r">
          <div className="min-h-0 flex-1">
            {isFeatureFlagEnabled('enablePipelineDiagrams') && <PipelineFlowDiagram configYaml={yamlContent} />}
          </div>
          {mode !== 'view' && (
            <AddConnectorsCard
              editorContent={yamlContent}
              hasInput={yamlContent.includes('input:')}
              hasOutput={yamlContent.includes('output:')}
              onAddConnector={(type) => setAddConnectorType(type)}
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <ResizablePanelGroup direction="vertical">
            <ResizablePanel defaultSize={mode === 'view' ? 40 : 70} minSize={mode === 'view' ? 10 : 30}>
              {mode === 'view' ? (
                <div className="flex h-full flex-col gap-4 overflow-auto bg-primary-alpha-subtle p-4">
                  <ViewDetails isDeleting={isDeletePending} onDelete={handleDelete} pipeline={pipeline} />
                </div>
              ) : (
                <YamlEditor
                  onChange={(value) => handleYamlChange(value || '')}
                  onEditorMount={handleEditorMount}
                  transparentBackground
                  value={yamlContent}
                />
              )}
            </ResizablePanel>
            <ResizableHandle withHandle />
            {mode === 'view' ? (
              <ResizablePanel collapsible defaultSize={60}>
                {pipeline ? (
                  <div className="h-full overflow-y-auto p-4">
                    <LogsTab pipeline={pipeline} />
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                    Logs will be available after the pipeline is created
                  </div>
                )}
              </ResizablePanel>
            ) : (
              <ResizablePanel collapsible defaultSize={30} ref={lintPanelRef}>
                <div className="h-full overflow-auto p-4">
                  <div className="flex items-center gap-2">
                    <Heading className="text-muted-foreground" level={4}>
                      Lint issues
                    </Heading>
                    {lintHintCount > 0 ? <CountDot count={lintHintCount} variant="error" /> : null}
                  </div>
                  <LintHintList isPending={isLintPending} lintHints={lintHints} />
                </div>
              </ResizablePanel>
            )}
          </ResizablePanelGroup>
        </div>
      </div>

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            const tags = form.getValues('tags').filter((t) => t.key !== '' || t.value !== '');
            form.setValue('tags', tags);
          }
          setIsConfigDialogOpen(open);
        }}
        open={isConfigDialogOpen}
      >
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{mode === 'create' ? 'Pipeline settings' : 'Edit pipeline settings'}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <Config />
            <div className="flex justify-end gap-2 pt-4">
              <Button onClick={() => setIsConfigDialogOpen(false)} variant="primary">
                Save
              </Button>
            </div>
          </Form>
        </DialogContent>
      </Dialog>

      <PipelineCommandMenu
        editorInstance={editorInstanceRef.current}
        initialSearch={pendingSecretSearch}
        onCreateSecret={() => {
          setIsCommandMenuOpen(false);
          setPendingSecretSearch('');
          setIsSecretsDialogOpen(true);
        }}
        onCreateTopic={() => {
          setIsCommandMenuOpen(false);
          setIsTopicDialogOpen(true);
        }}
        onCreateUser={() => {
          setIsCommandMenuOpen(false);
          setIsUserDialogOpen(true);
        }}
        onOpenChange={(open) => {
          setIsCommandMenuOpen(open);
          if (!open) {
            setPendingSecretSearch('');
          }
        }}
        open={isCommandMenuOpen}
        yamlContent={yamlContent}
      />

      <AddSecretsDialog
        existingSecrets={[]}
        isOpen={isSecretsDialogOpen}
        missingSecrets={[]}
        onClose={() => setIsSecretsDialogOpen(false)}
        onSecretsCreated={(secretNames) => {
          setIsSecretsDialogOpen(false);
          if (secretNames && secretNames.length > 0) {
            setPendingSecretSearch(secretNames[0]);
            setIsCommandMenuOpen(true);
          }
        }}
      />

      <Dialog onOpenChange={setIsTopicDialogOpen} open={isTopicDialogOpen}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>Create a topic</DialogTitle>
          </DialogHeader>
          <AddTopicStep hideTitle ref={null} selectionMode="new" />
          <div className="flex justify-end gap-2 pt-4">
            <Button onClick={() => setIsTopicDialogOpen(false)} variant="secondary-ghost">
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={setIsUserDialogOpen} open={isUserDialogOpen}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>Create a user</DialogTitle>
          </DialogHeader>
          <AddUserStep hideTitle ref={null} selectionMode="new" />
          <div className="flex justify-end gap-2 pt-4">
            <Button onClick={() => setIsUserDialogOpen(false)} variant="secondary-ghost">
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {componentListResponse?.components ? (
        <AddConnectorDialog
          components={componentListResponse.components}
          connectorType={
            addConnectorType === 'resource'
              ? (['cache', 'rate_limit', 'buffer', 'scanner', 'tracer', 'metrics'] satisfies ConnectComponentType[])
              : (addConnectorType ?? undefined)
          }
          isOpen={addConnectorType !== null}
          onAddConnector={handleConnectorSelected}
          onCloseAddConnector={() => setAddConnectorType(null)}
        />
      ) : null}

      {miniWizardConfig !== null && (
        <RedpandaMiniWizard
          connectionName={miniWizardConfig.connectionName}
          connectionType={miniWizardConfig.connectionType}
          isOpen
          onClose={() => setMiniWizardConfig(null)}
          onComplete={handleMiniWizardComplete}
        />
      )}
    </div>
  );
}
