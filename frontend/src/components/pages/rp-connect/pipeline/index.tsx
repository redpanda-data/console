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

import type { LintHint } from '@buf/redpandadata_common.bufbuild_es/redpanda/api/common/v1/linthint_pb';
import { create } from '@bufbuild/protobuf';
import { ConnectError } from '@connectrpc/connect';
import { zodResolver } from '@hookform/resolvers/zod';
import { useBlocker, useNavigate, useRouter, useSearch } from '@tanstack/react-router';
import { isSystemTag } from 'components/constants';
import { Alert, AlertDescription, AlertTitle } from 'components/redpanda-ui/components/alert';
import { Banner, BannerClose, BannerContent } from 'components/redpanda-ui/components/banner';
import { Button } from 'components/redpanda-ui/components/button';
import { CopyButton } from 'components/redpanda-ui/components/copy-button';
import { CountDot } from 'components/redpanda-ui/components/count-dot';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'components/redpanda-ui/components/dialog';
import { Kbd } from 'components/redpanda-ui/components/kbd';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from 'components/redpanda-ui/components/resizable';
import { Separator } from 'components/redpanda-ui/components/separator';
import { Skeleton } from 'components/redpanda-ui/components/skeleton';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { Heading, Text } from 'components/redpanda-ui/components/typography';
import { cn } from 'components/redpanda-ui/lib/utils';
import { LogExplorer } from 'components/ui/connect/log-explorer';
import { DeleteResourceAlertDialog } from 'components/ui/delete-resource-alert-dialog';
import { LintHintList } from 'components/ui/lint-hint/lint-hint-list';
import { YamlEditor } from 'components/ui/yaml/yaml-editor';
import { isEmbedded, isFeatureFlagEnabled, isServerless } from 'config';
import { useDebouncedValue } from 'hooks/use-debounced-value';
import { useRefFormDialog } from 'hooks/use-ref-form-dialog';
import { KeyRound, LayoutGrid, Plus, Settings, User, Zap } from 'lucide-react';
import type { editor } from 'monaco-editor';
import type { JSONSchema } from 'monaco-yaml';
import {
  CreatePipelineRequestSchema,
  DeletePipelineRequestSchema,
  UpdatePipelineRequestSchema,
} from 'protogen/redpanda/api/console/v1alpha1/pipeline_pb';
import {
  type ComponentList,
  CreatePipelineRequestSchema as CreatePipelineRequestSchemaDataPlane,
  type Pipeline,
  Pipeline_ServiceAccountSchema,
  Pipeline_State,
  PipelineCreateSchema,
  PipelineUpdateSchema,
  UpdatePipelineRequestSchema as UpdatePipelineRequestSchemaDataPlane,
} from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type Resolver, type UseFormReturn, useForm, useWatch } from 'react-hook-form';
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
import { toast } from 'sonner';
import {
  useOnboardingUserDataStore,
  useOnboardingWizardDataStore,
  useOnboardingYamlContentStore,
} from 'state/onboarding-wizard-store';
import { addServiceAccountTags } from 'utils/service-account.utils';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';
import { z } from 'zod';

import { ConfigDialog } from './config-dialog';
import { DetailsDialog } from './details-dialog';
import { PipelineCommandMenu } from './pipeline-command-menu';
import { PipelineFlowDiagram } from './pipeline-flow-diagram';
import { PipelineThroughputCard } from './pipeline-throughput-card';
import { PipelineRunControl, PipelineStatusBadge, Toolbar } from './toolbar';
import { useSlashCommand } from './use-slash-command';
import { extractLintHintsFromError } from '../errors';
import { AddConnectorDialog } from '../onboarding/add-connector-dialog';
import { AddConnectorsCard } from '../onboarding/add-connectors-card';
import { AddTopicStep } from '../onboarding/add-topic-step';
import { AddUserStep } from '../onboarding/add-user-step';
import { LogsTab } from '../pipelines-details';
import { cpuToTasks, MIN_TASKS, tasksToCPU } from '../tasks';
import { TemplateGalleryDialog } from '../template-gallery/template-gallery-dialog';
import type { ConnectComponentType } from '../types/schema';
import type {
  AddTopicFormData,
  AddUserFormData,
  BaseStepRef,
  ServiceAccountSubmissionData,
  UserStepRef,
} from '../types/wizard';
import { parseSchema } from '../utils/schema';
import { useCreateModeInitialYaml } from '../utils/use-create-mode-initial-yaml';
import { usePipelineMode } from '../utils/use-pipeline-mode';
import {
  extractConnectorTopics,
  getConnectTemplate,
  type RedpandaSetupResultLike,
  tryPatchRedpandaYaml,
} from '../utils/yaml';

function getConnectorDialogTitle(type: ConnectComponentType | 'resource' | null): string | undefined {
  if (type === 'input') {
    return 'Add an input';
  }
  if (type === 'output') {
    return 'Add an output';
  }
  if (type) {
    return `Add a ${type}`;
  }
  return;
}

function getConnectorDialogPlaceholder(type: ConnectComponentType | 'resource' | null): string | undefined {
  if (type) {
    return `Search ${type}s...`;
  }
  return;
}

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

function warnIfResized(form: UseFormReturn<PipelineFormValues>, cpuShares: string | undefined) {
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

function parseYamlEditorSchema(configSchema: string | undefined) {
  if (!configSchema) {
    return;
  }
  try {
    const parsed = JSON.parse(configSchema);
    return {
      definitions: parsed.definitions as Record<string, JSONSchema> | undefined,
      properties: parsed.properties as Record<string, JSONSchema> | undefined,
    };
  } catch {
    return;
  }
}

function usePipelineLint(yamlContent: string, errorLintHints: Record<string, LintHint>, enabled: boolean) {
  const debouncedYamlContent = useDebouncedValue(yamlContent, 500);
  const { data: lintResponse, isPending: isLintPending } = useLintPipelineConfigQuery(debouncedYamlContent, {
    enabled,
  });

  const lintHints = useMemo(() => {
    const merged: Record<string, LintHint> = {};
    for (const [key, hint] of Object.entries(errorLintHints)) {
      merged[`error_${key}`] = hint;
    }
    if (lintResponse) {
      for (const [idx, hint] of Object.entries(lintResponse.lintHints || [])) {
        merged[`lint_hint_${idx}`] = hint;
      }
    }
    return merged;
  }, [errorLintHints, lintResponse]);

  return { lintHints, isLintPending };
}

function usePipelineSave({
  form,
  yamlContent,
  mode,
  pipelineId,
  pipeline,
  isPipelineDiagramsEnabled,
  onBeforeSaveNavigate,
}: {
  form: UseFormReturn<PipelineFormValues>;
  yamlContent: string;
  mode: string;
  pipelineId: string | undefined;
  pipeline: Pipeline | undefined;
  isPipelineDiagramsEnabled: boolean;
  // Called right before a successful save navigates away, so the unsaved-changes
  // guard doesn't block the post-save navigation.
  onBeforeSaveNavigate?: () => void;
}) {
  const navigate = useNavigate();
  const { mutate: createMutation, isPending: isCreatePending } = useCreatePipelineMutation();
  const { mutate: updateMutation, isPending: isUpdatePending } = useUpdatePipelineMutation();
  const { mutate: deleteMutation, isPending: isDeletePending } = useDeletePipelineMutation();
  const [errorLintHints, setErrorLintHints] = useState<Record<string, LintHint>>({});

  const clearErrorLintHints = useCallback(() => setErrorLintHints({}), []);

  const clearWizardStore = useCallback(() => {
    if (!isPipelineDiagramsEnabled) {
      useOnboardingYamlContentStore.getState().setYamlContent({ yamlContent: '' });
    }
    useOnboardingWizardDataStore.getState().setWizardData({ input: undefined, output: undefined });
  }, [isPipelineDiagramsEnabled]);

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
          onBeforeSaveNavigate?.();
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
          onBeforeSaveNavigate?.();
          navigate({ to: `/rp-connect/${pipelineId}` });
        },
        onError: (err) => onError(err, 'update'),
      });
    }
  }, [
    form,
    yamlContent,
    mode,
    pipelineId,
    createMutation,
    updateMutation,
    navigate,
    clearWizardStore,
    pipeline,
    onBeforeSaveNavigate,
  ]);

  const handleDelete = useCallback(
    (id: string) => {
      const deleteRequest = create(DeletePipelineRequestSchema, { request: { id } });
      deleteMutation(deleteRequest, {
        onSuccess: () => {
          toast.success('Pipeline deleted');
          navigate({ to: '/connect-clusters', search: {} as never });
        },
        onError: (err) => {
          toast.error(
            formatToastErrorMessageGRPC({ error: ConnectError.from(err), action: 'delete', entity: 'pipeline' })
          );
        },
      });
    },
    [deleteMutation, navigate]
  );

  return {
    handleSave,
    handleDelete,
    clearWizardStore,
    errorLintHints,
    clearErrorLintHints,
    isSaving: isCreatePending || isUpdatePending,
    isDeleting: isDeletePending,
  };
}

type DiagramDialogTarget = { section: 'input' | 'output'; componentName: string };

function useDiagramDialogs(yamlContent: string, handleConnectorYamlChange: (yaml: string) => void) {
  const topicStepRef = useRef<BaseStepRef<AddTopicFormData>>(null);
  const userStepRef = useRef<UserStepRef>(null);

  const topicDialog = useRefFormDialog<AddTopicFormData, DiagramDialogTarget>({
    ref: topicStepRef,
    onSuccess: (data, target) => {
      if (data.topicName) {
        const patched = tryPatchRedpandaYaml(yamlContent, target.section, target.componentName, {
          topicName: data.topicName,
        });
        if (patched) {
          handleConnectorYamlChange(patched);
        }
      }
    },
  });

  const userDialog = useRefFormDialog<AddUserFormData | ServiceAccountSubmissionData, DiagramDialogTarget>({
    ref: userStepRef,
    onSuccess: (data, target) => {
      let setupResult: RedpandaSetupResultLike = {};
      if ('authMethod' in data && data.authMethod === 'service-account') {
        setupResult = {
          authMethod: 'service-account',
          serviceAccountSecretName: (data as ServiceAccountSubmissionData).serviceAccountSecretName,
        };
      } else if ('username' in data) {
        setupResult = {
          authMethod: 'sasl',
          username: (data as AddUserFormData).username,
          saslMechanism: (data as AddUserFormData).saslMechanism,
        };
      }
      const patched = tryPatchRedpandaYaml(yamlContent, target.section, target.componentName, setupResult);
      if (patched) {
        handleConnectorYamlChange(patched);
      }
    },
  });

  const [connectorTopics, setConnectorTopics] = useState<string[] | undefined>();

  const openTopicDialog = topicDialog.open;
  const openUserDialog = userDialog.open;

  return {
    topicDialog,
    userDialog,
    topicStepRef,
    userStepRef,
    connectorTopics,
    handleAddTopic: useCallback(
      (section: string, componentName: string) => {
        openTopicDialog({ section: section as 'input' | 'output', componentName });
      },
      [openTopicDialog]
    ),
    handleAddSasl: useCallback(
      (section: string, componentName: string) => {
        const { topics, parseError } = extractConnectorTopics(
          yamlContent,
          section as 'input' | 'output',
          componentName
        );
        if (parseError) {
          toast.error('Failed to parse pipeline YAML');
        }
        setConnectorTopics(topics);
        openUserDialog({ section: section as 'input' | 'output', componentName });
      },
      [openUserDialog, yamlContent]
    ),
  };
}

function EditorSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-4">
      <Skeleton variant="text" width="lg" />
      <Skeleton variant="text" width="md" />
      <Skeleton variant="text" width="lg" />
      <Skeleton variant="text" width="sm" />
      <Skeleton variant="text" width="md" />
      <Skeleton variant="text" width="lg" />
      <Skeleton variant="text" width="sm" />
    </div>
  );
}

const ConfigField = ({
  label,
  value,
  copyable = false,
  multiline = false,
}: {
  label: string;
  value: string;
  copyable?: boolean;
  multiline?: boolean;
}) => (
  <div className="group/field flex min-w-0 flex-col gap-1">
    <Text className="text-muted-foreground" variant="label">
      {label}
    </Text>
    <div className={cn('flex min-w-0 gap-1', multiline ? 'items-start' : 'items-center')}>
      <Text
        as={multiline ? 'p' : 'div'}
        className={cn(multiline ? 'whitespace-pre-wrap break-words' : 'truncate')}
        title={multiline ? undefined : value}
      >
        {value}
      </Text>
      {copyable && value ? (
        <CopyButton
          className="shrink-0 opacity-0 transition-opacity group-hover/field:opacity-100"
          content={value}
          size="sm"
          variant="ghost"
        />
      ) : null}
    </div>
  </div>
);

// Pipeline identity + metadata shown as a summary card above the main panel in
// view mode. The full set (including empty fields) lives in the details dialog.
const PipelineSummary = ({ pipeline }: { pipeline: Pipeline }) => {
  const tasks = cpuToTasks(pipeline.resources?.cpuShares) ?? 0;
  const description = pipeline.description?.trim();
  return (
    <div className="flex flex-col gap-5 rounded-lg border bg-muted/20 px-6 py-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <Text className="text-muted-foreground" variant="label">
            Name
          </Text>
          <Heading className="truncate" level={2} title={pipeline.displayName || pipeline.id}>
            {pipeline.displayName || pipeline.id}
          </Heading>
        </div>
        <PipelineStatusBadge state={pipeline.state} />
      </div>
      <Separator variant="subtle" />
      <div className="grid grid-cols-1 gap-x-10 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        <ConfigField copyable label="ID" value={pipeline.id} />
        <ConfigField label="Compute units" value={`${tasks}`} />
        {pipeline.serviceAccount ? (
          <ConfigField copyable label="Service account" value={pipeline.serviceAccount.clientId} />
        ) : null}
        {pipeline.url ? <ConfigField copyable label="URL" value={pipeline.url} /> : null}
      </div>
      {description ? (
        <div className="flex min-w-0 flex-col gap-1">
          <Text className="text-muted-foreground" variant="label">
            Description
          </Text>
          <Text className="line-clamp-3 whitespace-pre-wrap break-words text-sm" title={description}>
            {description}
          </Text>
        </div>
      ) : null}
      <Separator variant="subtle" />
      {/* Run control lives at the card footer, away from the header's Edit button. */}
      <div className="flex items-center justify-end">
        <PipelineRunControl pipelineId={pipeline.id} pipelineState={pipeline.state} />
      </div>
    </div>
  );
};

// Read-only view of the editable pipeline settings (name, compute units,
// description), shown above the editor. All of these are edited in the dialog.
const EditSummary = ({ form, onEdit }: { form: UseFormReturn<PipelineFormValues>; onEdit: () => void }) => {
  const name = useWatch({ control: form.control, name: 'name' });
  const description = useWatch({ control: form.control, name: 'description' })?.trim();
  const computeUnits = useWatch({ control: form.control, name: 'computeUnits' });
  return (
    <div className="flex flex-col gap-5 rounded-lg border bg-muted/20 px-6 py-5">
      <div className="flex min-w-0 flex-col gap-1">
        <Text className="text-muted-foreground" variant="label">
          Name
        </Text>
        <Heading className="truncate" level={2} title={name}>
          {name || 'Untitled pipeline'}
        </Heading>
      </div>
      <Separator variant="subtle" />
      <div className="grid grid-cols-1 gap-x-10 gap-y-4 sm:grid-cols-3">
        <ConfigField label="Compute units" value={`${computeUnits}`} />
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <Text className="text-muted-foreground" variant="label">
          Description
        </Text>
        {description ? (
          <Text className="line-clamp-3 whitespace-pre-wrap break-words text-sm" title={description}>
            {description}
          </Text>
        ) : (
          <Text className="text-muted-foreground text-sm italic">No description</Text>
        )}
      </div>
      <Separator variant="subtle" />
      {/* Edit action at the card footer, away from the header's Save button. */}
      <div className="flex items-center justify-end">
        <Button icon={<Settings />} onClick={onEdit} size="sm" variant="outline">
          Edit settings
        </Button>
      </div>
    </div>
  );
};

function ViewModePanel({ pipeline }: { pipeline: Pipeline | undefined }) {
  if (!pipeline) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">Loading pipeline...</div>
    );
  }
  const showThroughput =
    isEmbedded() &&
    (isServerless()
      ? isFeatureFlagEnabled('enableDataplaneObservabilityServerless')
      : isFeatureFlagEnabled('enableDataplaneObservability'));
  return (
    <div className="flex h-full flex-col overflow-auto p-6">
      {showThroughput ? (
        <>
          <PipelineThroughputCard pipelineId={pipeline.id} />
          <Separator className="my-8" variant="subtle" />
        </>
      ) : null}
      <section className="flex min-h-0 flex-col gap-4">
        {isFeatureFlagEnabled('enableNewPipelineLogs') ? (
          // Title is rendered inline in the explorer's control row so it lines up with the table.
          <LogExplorer
            enableLiveView={pipeline.state === Pipeline_State.RUNNING}
            pipeline={pipeline}
            serverless={isServerless()}
            title="Logs"
          />
        ) : (
          <>
            <Heading level={3}>Logs</Heading>
            <LogsTab pipeline={pipeline} />
          </>
        )}
      </section>
    </div>
  );
}

function EditorPanel({
  isServerlessInitializing,
  slashTipVisible,
  onDismissSlashTip,
  yamlContent,
  onYamlChange,
  onEditorMount,
  yamlEditorSchema,
  lintHints,
  isLintPending,
}: {
  isServerlessInitializing: boolean;
  slashTipVisible: boolean;
  onDismissSlashTip: () => void;
  yamlContent: string;
  onYamlChange: (val: string) => void;
  onEditorMount: (editorRef: editor.IStandaloneCodeEditor) => void;
  yamlEditorSchema: ReturnType<typeof parseYamlEditorSchema>;
  lintHints: Record<string, LintHint>;
  isLintPending: boolean;
}) {
  return (
    <ResizablePanelGroup direction="vertical">
      <ResizablePanel defaultSize={70} minSize={30}>
        <div className="relative h-full">
          {isServerlessInitializing ? (
            <EditorSkeleton />
          ) : (
            <>
              {slashTipVisible ? (
                <div className="absolute inset-x-0 top-0 z-10 rounded-t-lg">
                  <Banner className="absolute inset-x-0 top-0" height="2rem" variant="accent">
                    <BannerContent>
                      Tip: Use{' '}
                      <Kbd size="xs" variant="filled">
                        /
                      </Kbd>{' '}
                      to insert variables
                    </BannerContent>
                    <BannerClose onClick={onDismissSlashTip} variant="ghost" />
                  </Banner>
                </div>
              ) : null}
              <YamlEditor
                onChange={(val) => onYamlChange(val || '')}
                onEditorMount={onEditorMount}
                options={slashTipVisible ? { padding: { top: 32 } } : undefined}
                schema={yamlEditorSchema}
                transparentBackground
                value={yamlContent}
              />
            </>
          )}
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel collapsible defaultSize={30}>
        <div className="h-full overflow-auto p-4">
          <div className="flex items-center gap-2">
            <Heading className="mb-2 text-muted-foreground" level={5}>
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
  );
}

function SidebarPanel({
  mode,
  yamlContent,
  isPipelineDiagramsEnabled,
  onAddConnector,
  onAddTopic,
  onAddSasl,
  onOpenCommandMenu,
  onBrowseTemplates,
}: {
  mode: string;
  yamlContent: string;
  isPipelineDiagramsEnabled: boolean;
  onAddConnector: (type: ConnectComponentType | 'resource') => void;
  onAddTopic: (section: string, componentName: string) => void;
  onAddSasl: (section: string, componentName: string) => void;
  onOpenCommandMenu: (filter?: 'all' | 'variables' | 'secrets' | 'topics' | 'users') => void;
  onBrowseTemplates?: () => void;
}) {
  return (
    <div className="flex w-[300px] shrink-0 flex-col overflow-hidden border-border! border-r">
      <div className="min-h-0 flex-1 overflow-hidden">
        {isPipelineDiagramsEnabled ? (
          <PipelineFlowDiagram
            configYaml={yamlContent}
            hideZoomControls
            onAddConnector={mode !== 'view' ? (type) => onAddConnector(type as ConnectComponentType) : undefined}
            onAddSasl={mode !== 'view' ? onAddSasl : undefined}
            onAddTopic={mode !== 'view' ? onAddTopic : undefined}
            onBrowseTemplates={mode !== 'view' ? onBrowseTemplates : undefined}
          />
        ) : null}
      </div>
      {mode !== 'view' && (
        <>
          <AddConnectorsCard
            editorContent={yamlContent}
            hasInput={yamlContent.includes('input:')}
            hasOutput={yamlContent.includes('output:')}
            hideInputOutput={isPipelineDiagramsEnabled}
            onAddConnector={onAddConnector}
          />
          <div className="px-4 pb-4">
            <Separator className="mb-3" variant="subtle" />
            <div className="flex flex-col gap-2">
              <Heading className="mb-2 text-muted-foreground" level={5}>
                Variables
              </Heading>
              <div className="flex flex-wrap gap-2">
                <Button
                  className="max-w-fit"
                  icon={<Plus />}
                  onClick={() => onOpenCommandMenu('variables')}
                  size="xs"
                  variant="outline"
                >
                  <Zap />
                  Variables
                </Button>
                <Button
                  className="max-w-fit"
                  icon={<Plus />}
                  onClick={() => onOpenCommandMenu('secrets')}
                  size="xs"
                  variant="outline"
                >
                  <KeyRound />
                  Secrets
                </Button>
                <Button
                  className="max-w-fit"
                  icon={<Plus />}
                  onClick={() => onOpenCommandMenu('topics')}
                  size="xs"
                  variant="outline"
                >
                  <LayoutGrid />
                  Topics
                </Button>
                <Button
                  className="max-w-fit"
                  icon={<Plus />}
                  onClick={() => onOpenCommandMenu('users')}
                  size="xs"
                  variant="outline"
                >
                  <User />
                  Users
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function PipelinePage() {
  const { mode, pipelineId } = usePipelineMode();
  const navigate = useNavigate();
  const router = useRouter();
  const search = useSearch({ strict: false }) as { serverless?: string };
  const isSlashMenuEnabled = isFeatureFlagEnabled('enableConnectSlashMenu');
  const isServerlessMode = search.serverless === 'true';
  const isPipelineDiagramsEnabled = isFeatureFlagEnabled('enablePipelineDiagrams') && isEmbedded();

  const [editorInstance, setEditorInstance] = useState<null | editor.IStandaloneCodeEditor>(null);
  const [yamlContent, setYamlContent] = useState('');
  const [commandMenuFilter, setCommandMenuFilter] = useState<
    'all' | 'variables' | 'secrets' | 'topics' | 'users' | null
  >(null);
  const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false);
  const [isViewConfigDialogOpen, setIsViewConfigDialogOpen] = useState(false);
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
  const [addConnectorType, setAddConnectorType] = useState<ConnectComponentType | 'resource' | null>(null);
  const [slashTipVisible, setSlashTipVisible] = useState(isSlashMenuEnabled && mode !== 'view');
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const isTemplateGalleryEnabled = isFeatureFlagEnabled('enableRpcnTemplateGallery');

  const form = useForm<PipelineFormValues>({
    resolver: zodResolver(pipelineFormSchema) as Resolver<PipelineFormValues>,
    mode: 'onSubmit',
    defaultValues: { name: '', description: '', computeUnits: MIN_TASKS, tags: [] },
  });

  const handleSlashOpen = useCallback(() => setCommandMenuFilter(null), []);
  const slashCommand = useSlashCommand(mode !== 'view' ? editorInstance : null, isSlashMenuEnabled, handleSlashOpen);

  const handleCommandMenuOpen = useCallback(
    (filter: 'all' | 'variables' | 'secrets' | 'topics' | 'users' = 'all') => {
      slashCommand.close();
      setCommandMenuFilter(filter);
    },
    [slashCommand]
  );

  const { data: pipelineResponse, isLoading: isPipelineLoading } = useGetPipelineQuery(
    { id: pipelineId || '' },
    { enabled: mode !== 'create' && !!pipelineId }
  );
  const pipeline = useMemo(() => pipelineResponse?.response?.pipeline, [pipelineResponse]);

  const { data: componentListResponse } = useListComponentsQuery();
  const components = useMemo(
    () => (componentListResponse?.components ? parseSchema(componentListResponse.components) : []),
    [componentListResponse]
  );

  const { data: schemaResponse } = useGetPipelineServiceConfigSchemaQuery();
  const yamlEditorSchema = useMemo(() => parseYamlEditorSchema(schemaResponse?.configSchema), [schemaResponse]);

  // Lets a successful save navigate away without tripping the unsaved-changes guard.
  const allowNavigationRef = useRef(false);
  const markNavigationAllowed = useCallback(() => {
    allowNavigationRef.current = true;
  }, []);
  // Baseline YAML to diff against for the unsaved-changes guard: the server config
  // in edit mode, or the first resolved template in create mode.
  const initialYamlRef = useRef<string | null>(null);

  const { handleSave, handleDelete, clearWizardStore, errorLintHints, clearErrorLintHints, isSaving, isDeleting } =
    usePipelineSave({
      form,
      yamlContent,
      mode,
      pipelineId,
      pipeline,
      isPipelineDiagramsEnabled,
      onBeforeSaveNavigate: markNavigationAllowed,
    });
  const { lintHints, isLintPending } = usePipelineLint(yamlContent, errorLintHints, mode !== 'view');

  // Guard against losing unsaved edits when navigating away from the editor (edit or create).
  const yamlDirty = initialYamlRef.current !== null && yamlContent !== initialYamlRef.current;
  const hasUnsavedChanges = mode !== 'view' && (form.formState.isDirty || yamlDirty);
  const blocker = useBlocker({
    shouldBlockFn: () => hasUnsavedChanges && !allowNavigationRef.current,
    enableBeforeUnload: () => hasUnsavedChanges,
    withResolver: true,
  });
  // Re-arm the guard whenever the mode changes (e.g. after the post-save nav to view).
  useEffect(() => {
    allowNavigationRef.current = false;
  }, [mode]);

  const handleYamlChange = useCallback(
    (value: string) => {
      clearErrorLintHints();
      setYamlContent(value);
      if (mode === 'create' && !isPipelineDiagramsEnabled) {
        useOnboardingYamlContentStore.getState().setYamlContent({ yamlContent: value });
      }
    },
    [mode, isPipelineDiagramsEnabled, clearErrorLintHints]
  );

  const handleConnectorYamlChange = useCallback(
    (yaml: string) => {
      handleYamlChange(yaml);
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

  const { topicDialog, userDialog, topicStepRef, userStepRef, connectorTopics, handleAddTopic, handleAddSasl } =
    useDiagramDialogs(yamlContent, handleConnectorYamlChange);

  const handleConnectorSelected = useCallback(
    (connectionName: string, connectionType: ConnectComponentType) => {
      setAddConnectorType(null);
      const newYaml = getConnectTemplate({
        connectionName,
        connectionType,
        components,
        showAdvancedFields: false,
        existingYaml: yamlContent,
      });
      if (newYaml) {
        handleConnectorYamlChange(newYaml);
      }
    },
    [components, yamlContent, handleConnectorYamlChange]
  );

  const [hydratedPipelineId, setHydratedPipelineId] = useState<string | null>(null);
  if (pipeline && mode !== 'create' && pipeline.id !== hydratedPipelineId) {
    setHydratedPipelineId(pipeline.id);
    setYamlContent(pipeline.configYaml);
    initialYamlRef.current = pipeline.configYaml;
  }

  useEffect(() => {
    if (pipeline && mode === 'edit') {
      form.reset({
        name: pipeline.displayName,
        description: pipeline.description || '',
        computeUnits: cpuToTasks(pipeline.resources?.cpuShares) || MIN_TASKS,
        tags: Object.entries(pipeline.tags)
          .filter(([k]) => !isSystemTag(k))
          .map(([key, value]) => ({ key, value })),
      });
    }
  }, [pipeline, mode, form]);

  const handleInitialYamlResolved = useCallback((yaml: string) => {
    setYamlContent(yaml);
    if (initialYamlRef.current === null) {
      initialYamlRef.current = yaml;
    }
  }, []);

  const { isInitializing: isServerlessInitializing } = useCreateModeInitialYaml({
    enabled: mode === 'create',
    isServerlessMode,
    components,
    isPipelineDiagramsEnabled,
    onResolved: handleInitialYamlResolved,
  });

  const handleCancel = useCallback(() => {
    if (mode === 'create') {
      clearWizardStore();
    }
    // Edit: go to the pipeline's view page. Routed through `navigate` (not
    // history.back) so the unsaved-changes blocker reliably intercepts it.
    if (mode === 'edit' && pipelineId) {
      navigate({ to: `/rp-connect/${pipelineId}` });
      return;
    }
    if (mode === 'view') {
      navigate({ to: '/connect-clusters', search: {} as never });
      return;
    }
    // Create: return to wherever the user came from.
    if (router.history.canGoBack()) {
      router.history.back();
    } else {
      navigate({ to: '/connect-clusters', search: {} as never });
    }
  }, [mode, clearWizardStore, navigate, pipelineId, router]);

  return (
    <div
      className={cn(
        'flex max-w-[calc(100dvw-(--sidebar-width))] flex-col gap-4',
        mode === 'view' ? 'h-full min-h-[calc(100dvh-10rem)]' : 'h-[calc(100dvh-10rem)]'
      )}
    >
      {/* Top framing border that lines up with the content edge, matching the
          listings page header. Negative margin cancels the layout's pt-8. */}
      <div className="-mt-8 border-divider-default border-b" />
      <Toolbar
        isLoading={isPipelineLoading}
        isSaving={isSaving}
        mode={mode}
        onCancel={handleCancel}
        onSave={handleSave}
        onViewConfig={() => setIsViewConfigDialogOpen(true)}
        pipelineId={pipelineId}
      />
      {mode === 'view' && pipeline ? <PipelineSummary pipeline={pipeline} /> : null}
      {mode !== 'view' ? <EditSummary form={form} onEdit={() => setIsConfigDialogOpen(true)} /> : null}
      <div className="flex min-h-0 flex-1 rounded-lg border border-border!">
        <SidebarPanel
          isPipelineDiagramsEnabled={isPipelineDiagramsEnabled}
          mode={mode}
          onAddConnector={(type) => setAddConnectorType(type)}
          onAddSasl={handleAddSasl}
          onAddTopic={handleAddTopic}
          onBrowseTemplates={
            isTemplateGalleryEnabled && mode !== 'view' ? () => setIsTemplateDialogOpen(true) : undefined
          }
          onOpenCommandMenu={handleCommandMenuOpen}
          yamlContent={yamlContent}
        />
        <div className="min-w-0 flex-1">
          {mode === 'view' ? (
            <ViewModePanel pipeline={pipeline} />
          ) : (
            <EditorPanel
              isLintPending={isLintPending}
              isServerlessInitializing={isServerlessInitializing}
              lintHints={lintHints}
              onDismissSlashTip={() => setSlashTipVisible(false)}
              onEditorMount={setEditorInstance}
              onYamlChange={handleYamlChange}
              slashTipVisible={slashTipVisible}
              yamlContent={yamlContent}
              yamlEditorSchema={yamlEditorSchema}
            />
          )}
        </div>
      </div>

      <ConfigDialog form={form} mode={mode} onOpenChange={setIsConfigDialogOpen} open={isConfigDialogOpen} />

      <DetailsDialog
        onOpenChange={setIsViewConfigDialogOpen}
        onRequestDelete={
          pipeline
            ? () => {
                // Close the details dialog first so the two don't stack.
                setIsViewConfigDialogOpen(false);
                setIsDeleteAlertOpen(true);
              }
            : undefined
        }
        open={isViewConfigDialogOpen}
        pipeline={pipeline}
      />

      {pipeline ? (
        <DeleteResourceAlertDialog
          isDeleting={isDeleting}
          onDelete={handleDelete}
          onOpenChange={setIsDeleteAlertOpen}
          open={isDeleteAlertOpen}
          resourceId={pipeline.id}
          resourceName={pipeline.displayName || 'this pipeline'}
          resourceType="Pipeline"
        />
      ) : null}

      <Dialog onOpenChange={(open) => (open ? undefined : blocker.reset?.())} open={blocker.status === 'blocked'}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard unsaved changes?</DialogTitle>
            <DialogDescription>
              You have unsaved changes to this pipeline. If you leave now, your changes will be lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => blocker.reset?.()} variant="ghost">
              Keep editing
            </Button>
            <Button onClick={() => blocker.proceed?.()} variant="destructive">
              Leave without saving
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PipelineCommandMenu
        editorInstance={editorInstance}
        initialFilter={commandMenuFilter ?? undefined}
        onOpenChange={(open) => {
          if (!open) {
            setCommandMenuFilter(null);
          }
        }}
        open={commandMenuFilter !== null}
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

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            topicDialog.close();
          }
        }}
        open={topicDialog.isOpen}
      >
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Add topic</DialogTitle>
            <DialogDescription>
              This component requires a Redpanda topic for logging the data. Select an existing topic, or create a new
              one.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <AddTopicStep hideTitle inline ref={topicStepRef} />
          </DialogBody>
          <DialogFooter>
            <Button onClick={topicDialog.close} variant="secondary-ghost">
              Cancel
            </Button>
            <Button
              disabled={topicDialog.isSubmitting}
              icon={topicDialog.isSubmitting ? <Spinner /> : undefined}
              onClick={topicDialog.submit}
            >
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            userDialog.close();
          }
        }}
        open={userDialog.isOpen}
      >
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Add user</DialogTitle>
            <DialogDescription>
              Select or create a user for this connector. ACLs will be configured automatically for the topic when
              creating a new user.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {connectorTopics && connectorTopics.length > 1 && (
              <Alert variant="warning">
                <AlertTitle>Multiple topics configured</AlertTitle>
                <AlertDescription>
                  This connector uses multiple topics ({connectorTopics.join(', ')}). You will need to configure topic
                  ACLs for this user manually in the Security settings.
                </AlertDescription>
              </Alert>
            )}
            <AddUserStep
              hideTitle
              inline
              ref={userStepRef}
              showConsumerGroupFields={userDialog.target?.section === 'input'}
              topicName={connectorTopics?.length === 1 ? connectorTopics[0] : undefined}
            />
          </DialogBody>
          <DialogFooter>
            <Button onClick={userDialog.close} variant="secondary-ghost">
              Cancel
            </Button>
            <Button
              disabled={userDialog.isSubmitting}
              icon={userDialog.isSubmitting ? <Spinner /> : undefined}
              onClick={userDialog.submit}
            >
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AddConnectorDialog
        components={componentListResponse?.components ?? ({} as ComponentList)}
        connectorType={
          addConnectorType === 'resource'
            ? (['cache', 'rate_limit', 'buffer', 'scanner', 'tracer', 'metrics'] satisfies ConnectComponentType[])
            : (addConnectorType ?? undefined)
        }
        isOpen={addConnectorType !== null}
        onAddConnector={handleConnectorSelected}
        onCloseAddConnector={() => setAddConnectorType(null)}
        searchPlaceholder={getConnectorDialogPlaceholder(addConnectorType)}
        title={getConnectorDialogTitle(addConnectorType)}
      />

      {isTemplateGalleryEnabled && mode !== 'view' ? (
        <TemplateGalleryDialog
          onClose={(stashedYaml) => {
            if (stashedYaml) {
              handleYamlChange(stashedYaml);
            }
            setIsTemplateDialogOpen(false);
          }}
          onSubmit={({ pipelineName: suggestedName, yaml }) => {
            handleYamlChange(yaml);
            if (!form.getValues('name')) {
              form.setValue('name', suggestedName, { shouldDirty: true, shouldValidate: true });
            }
            setIsTemplateDialogOpen(false);
            toast.success('Template applied — review the YAML and click Save to deploy.');
          }}
          open={isTemplateDialogOpen}
        />
      ) : null}
    </div>
  );
}
