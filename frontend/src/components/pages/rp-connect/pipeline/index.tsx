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
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useRouter, useSearch } from '@tanstack/react-router';
import { Alert, AlertDescription } from 'components/redpanda-ui/components/alert';
import { Button } from 'components/redpanda-ui/components/button';
import { Card } from 'components/redpanda-ui/components/card';
import { Form } from 'components/redpanda-ui/components/form';
import { Skeleton, SkeletonGroup } from 'components/redpanda-ui/components/skeleton';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { Tabs, TabsContent, TabsContents, TabsList, TabsTrigger } from 'components/redpanda-ui/components/tabs';
import { Heading } from 'components/redpanda-ui/components/typography';
import { cn } from 'components/redpanda-ui/lib/utils';
import { LintHintList } from 'components/ui/lint-hint/lint-hint-list';
import { YamlEditorCard } from 'components/ui/yaml/yaml-editor-card';
import { useDebounce } from 'hooks/use-debounce';
import { useDebouncedValue } from 'hooks/use-debounced-value';
import type { editor } from 'monaco-editor';
import type { JSONSchema } from 'monaco-yaml';
import type { LintHint } from 'protogen/redpanda/api/common/v1/linthint_pb';
import {
  CreatePipelineRequestSchema,
  UpdatePipelineRequestSchema,
} from 'protogen/redpanda/api/console/v1alpha1/pipeline_pb';
import {
  CreatePipelineRequestSchema as CreatePipelineRequestSchemaDataPlane,
  Pipeline_ServiceAccountSchema,
  PipelineCreateSchema,
  PipelineUpdateSchema,
  UpdatePipelineRequestSchema as UpdatePipelineRequestSchemaDataPlane,
} from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  useGetPipelineServiceConfigSchemaQuery,
  useLintPipelineConfigQuery,
  useListComponentsQuery,
} from 'react-query/api/connect';
import { useCreatePipelineMutation, useGetPipelineQuery, useUpdatePipelineMutation } from 'react-query/api/pipeline';
import { toast } from 'sonner';
import {
  useOnboardingUserDataStore,
  useOnboardingWizardDataStore,
  useOnboardingYamlContentStore,
} from 'state/onboarding-wizard-store';
import { addServiceAccountTags } from 'utils/service-account.utils';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';
import { z } from 'zod';

import { Details } from './details';
import { Toolbar } from './toolbar';
import { extractLintHintsFromError } from '../errors';
import { CreatePipelineSidebar } from '../onboarding/create-pipeline-sidebar';
import { LogsTab } from '../pipelines-details';
import { cpuToTasks, MIN_TASKS, tasksToCPU } from '../tasks';
import { parseSchema } from '../utils/schema';
import { type PipelineMode, usePipelineMode } from '../utils/use-pipeline-mode';
import { getConnectTemplate } from '../utils/yaml';

type FooterProps = {
  mode: PipelineMode;
  onSave?: () => void;
  onCancel: () => void;
  isSaving?: boolean;
  disabled?: boolean;
};

const Footer = memo(({ mode, onSave, onCancel, isSaving, disabled }: FooterProps) => {
  if (mode === 'view') {
    return (
      <div className="flex items-center justify-between gap-2 border-t pt-4">
        <Button onClick={onCancel} variant="secondary-ghost">
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 border-t pt-4">
      <Button disabled={isSaving} onClick={onCancel} variant="secondary-ghost">
        Cancel
      </Button>
      <Button className="min-w-[70px]" disabled={isSaving || disabled} onClick={onSave}>
        {mode === 'create' ? 'Create Pipeline' : 'Update Pipeline'}
        {Boolean(isSaving) && <Spinner size="sm" />}
      </Button>
    </div>
  );
});

const PipelinePageSkeleton = memo(({ mode }: { mode: PipelineMode }) => {
  const content = (
    <div className="flex flex-1 flex-col gap-4 overflow-auto">
      {/* Toolbar for view mode */}
      {mode === 'view' && (
        <div className="mb-4 flex items-center justify-between border-b pb-4">
          <Skeleton className="h-9 w-24" />
          <SkeletonGroup direction="horizontal" spacing="sm">
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-9 w-16" />
            <Skeleton className="h-9 w-20" />
          </SkeletonGroup>
        </div>
      )}

      {/* Details section */}
      <div className="space-y-4 rounded-lg border p-4">
        <SkeletonGroup>
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-full" />
          </div>
        </SkeletonGroup>
      </div>

      {/* YAML Editor section */}
      <div className="flex-1 rounded-lg border">
        <div className="border-b p-3">
          <Skeleton className="h-5 w-48" />
        </div>
        <div className="p-4">
          <SkeletonGroup spacing="sm">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-[90%]" />
            <Skeleton className="h-4 w-[95%]" />
            <Skeleton className="h-4 w-[85%]" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-[92%]" />
          </SkeletonGroup>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t pt-4">
        <Skeleton className="h-9 w-20" />
        {(mode === 'create' || mode === 'edit') && <Skeleton className="h-9 w-32" />}
      </div>
    </div>
  );

  return (
    <div className="flex w-full gap-4">
      {mode === 'create' ? content : <Card size="full">{content}</Card>}

      {/* Sidebar for create/edit modes */}
      {(mode === 'create' || mode === 'edit') && (
        <div className="w-80 space-y-4 rounded-lg border p-4">
          <Skeleton className="h-6 w-48" />
          <SkeletonGroup>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-[90%]" />
          </SkeletonGroup>
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      )}
    </div>
  );
});

const pipelineFormSchema = z.object({
  name: z
    .string()
    .min(3, 'Pipeline name must be at least 3 characters')
    .max(100, 'Pipeline name must be less than 100 characters'),
  description: z.string().optional(),
  computeUnits: z.number().min(MIN_TASKS).int(),
});

type PipelineFormValues = z.infer<typeof pipelineFormSchema>;

export default function PipelinePage() {
  const { mode, pipelineId } = usePipelineMode();
  const navigate = useNavigate();
  const router = useRouter();
  const search = useSearch({ strict: false }) as { serverless?: string };

  // Zustand store for wizard persistence (CREATE mode only)
  const isServerlessMode = search.serverless === 'true';
  const hasInitializedServerless = useRef(false);
  const persistedYamlContent = useOnboardingYamlContentStore((state) => state.yamlContent);
  const setPersistedYamlContent = useOnboardingYamlContentStore((state) => state.setYamlContent);
  const [editorInstance, setEditorInstance] = useState<null | editor.IStandaloneCodeEditor>(null);

  const form = useForm<PipelineFormValues>({
    resolver: zodResolver(pipelineFormSchema),
    mode: 'onChange',
    defaultValues: {
      name: '',
      description: '',
      computeUnits: MIN_TASKS,
    },
  });

  const [yamlContent, setYamlContent] = useState('');
  const [lintHints, setLintHints] = useState<Record<string, LintHint>>({});

  const { data: pipelineResponse, isLoading: isPipelineLoading } = useGetPipelineQuery(
    { id: pipelineId || '' },
    {
      enabled: mode !== 'create' && !!pipelineId,
    }
  );

  const pipeline = useMemo(() => pipelineResponse?.response?.pipeline, [pipelineResponse]);

  const { data: componentListResponse, isLoading: isComponentListLoading } = useListComponentsQuery();

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

  const debouncedYamlContent = useDebouncedValue(yamlContent, 500);
  const { data: lintResponse, isPending: isLinting } = useLintPipelineConfigQuery(debouncedYamlContent, {
    enabled: mode !== 'view',
  });

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
    if (mode !== 'create' || !isServerlessMode || hasInitializedServerless.current) {
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
          showOptionalFields: false,
          existingYaml: generatedYaml,
        }) || generatedYaml;

      // Generate output template if exists
      if (outputData?.connectionName && outputData?.connectionType) {
        generatedYaml =
          getConnectTemplate({
            connectionName: outputData.connectionName,
            connectionType: outputData.connectionType,
            components,
            showOptionalFields: false,
            existingYaml: generatedYaml,
          }) || generatedYaml;
      }

      if (generatedYaml) {
        useOnboardingYamlContentStore.getState().setYamlContent({ yamlContent: generatedYaml });
      }
    }

    hasInitializedServerless.current = true;
  }, []);

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

    const { name, description, computeUnits } = form.getValues();

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
        tags,
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
          ...pipeline?.tags,
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

  const handleSetYamlContent = useCallback((newYaml: string) => {
    setYamlContent(newYaml);
  }, []);

  const handleYamlChange = useDebounce((value: string) => {
    setYamlContent(value);
    // only when we're in create mode (which is always embedded within the wizard) we sync to the zustand store
    if (mode === 'create') {
      setPersistedYamlContent({ yamlContent: value });
    }
  }, 500);

  const isSaving = isCreatePending || isUpdatePending;

  if (isPipelineLoading) {
    return <PipelinePageSkeleton mode={mode} />;
  }

  const content = (
    <>
      <Form {...form}>
        <Details pipeline={pipeline} readonly={mode === 'view'} />
      </Form>

      <YamlEditorCard
        onChange={handleYamlChange}
        onMount={(editorRef) => {
          setEditorInstance(editorRef);
        }}
        options={{
          readOnly: mode === 'view',
        }}
        schema={yamlEditorSchema}
        value={yamlContent}
      />

      {mode !== 'view' && Object.keys(lintHints).length > 0 && (
        <div className="mt-4">
          <Alert icon={undefined} variant="destructive">
            <AlertDescription>
              <LintHintList className="w-full" isPending={isLinting} lintHints={lintHints} />
            </AlertDescription>
          </Alert>
        </div>
      )}
      <Footer
        disabled={Object.keys(lintHints).length > 0}
        isSaving={isSaving}
        mode={mode}
        onCancel={handleCancel}
        onSave={handleSave}
      />
    </>
  );

  const renderContent = () => {
    if (mode === 'create') {
      return content;
    }

    if (mode === 'view' && pipeline) {
      return (
        <Card size="full">
          <Tabs defaultValue="configuration">
            <TabsList>
              <TabsTrigger value="configuration">Configuration</TabsTrigger>
              <TabsTrigger value="logs">Logs</TabsTrigger>
            </TabsList>
            <TabsContents>
              <TabsContent value="configuration">{content}</TabsContent>
              <TabsContent value="logs">
                <LogsTab pipeline={pipeline} />
              </TabsContent>
            </TabsContents>
          </Tabs>
        </Card>
      );
    }

    return <Card size="full">{content}</Card>;
  };

  return (
    <div>
      {mode === 'edit' && (
        <div className="mt-12 mb-4">
          <Heading level={1}>Edit pipeline</Heading>
        </div>
      )}
      <div className={cn((mode === 'create' || mode === 'edit') && 'grid grid-cols-[minmax(auto,950px)_260px] gap-4')}>
        <div className="flex flex-1 flex-col gap-4">
          {mode === 'view' && pipelineId && (
            <Toolbar pipelineId={pipelineId} pipelineName={form.getValues('name')} pipelineState={pipeline?.state} />
          )}

          {renderContent()}
        </div>
        {(mode === 'create' || mode === 'edit') && (
          <CreatePipelineSidebar
            componentList={componentListResponse?.components}
            editorContent={yamlContent}
            editorInstance={editorInstance}
            isComponentListLoading={isComponentListLoading}
            setYamlContent={handleSetYamlContent}
          />
        )}
      </div>
    </div>
  );
}
