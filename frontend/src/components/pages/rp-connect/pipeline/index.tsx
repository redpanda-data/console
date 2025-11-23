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
import { useToast } from '@redpanda-data/ui';
import { Alert, AlertDescription } from 'components/redpanda-ui/components/alert';
import { Form } from 'components/redpanda-ui/components/form';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { LintHintList } from 'components/ui/lint-hint/lint-hint-list';
import { YamlEditorCard } from 'components/ui/yaml/yaml-editor-card';
import { useDebounce } from 'hooks/use-debounce';
import type { editor } from 'monaco-editor';
import type { LintHint } from 'protogen/redpanda/api/common/v1/linthint_pb';
import {
  CreatePipelineRequestSchema,
  UpdatePipelineRequestSchema,
} from 'protogen/redpanda/api/console/v1alpha1/pipeline_pb';
import {
  CreatePipelineRequestSchema as CreatePipelineRequestSchemaDataPlane,
  LintPipelineConfigRequestSchema,
  PipelineCreateSchema,
  PipelineUpdateSchema,
  UpdatePipelineRequestSchema as UpdatePipelineRequestSchemaDataPlane,
} from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useLintPipelineConfigMutation, useListComponentsQuery } from 'react-query/api/connect';
import { useCreatePipelineMutation, useGetPipelineQuery, useUpdatePipelineMutation } from 'react-query/api/pipeline';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useOnboardingWizardDataStore, useOnboardingYamlContentStore } from 'state/onboarding-wizard-store';
import { z } from 'zod';

import { Details } from './details';
import { Footer } from './footer';
import { Toolbar } from './toolbar';
import { usePipelineMode } from './use-pipeline-mode';
import { extractLintHintsFromError, formatPipelineError } from '../errors';
import { CreatePipelineSidebar } from '../onboarding/create-pipeline-sidebar';
import { cpuToTasks, MIN_TASKS, tasksToCPU } from '../tasks';
import { parseSchema } from '../utils/schema';
import { getConnectTemplate } from '../utils/yaml';

const pipelineFormSchema = z.object({
  name: z.string().min(1, 'Pipeline name is required').max(100, 'Pipeline name must be less than 100 characters'),
  description: z.string().optional(),
  computeUnits: z.number().min(MIN_TASKS).int(),
});

type PipelineFormValues = z.infer<typeof pipelineFormSchema>;

export default function PipelinePage() {
  const { mode, pipelineId } = usePipelineMode();
  const navigate = useNavigate();
  const toast = useToast();

  // Zustand store for wizard persistence (CREATE mode only)
  const [searchParams] = useSearchParams();
  const isServerlessMode = searchParams.get('serverless') === 'true';
  const hasInitializedServerless = useRef(false);
  const persistedYamlContent = useOnboardingYamlContentStore((state) => state.yamlContent);
  const [editorInstance, setEditorInstance] = useState<null | editor.IStandaloneCodeEditor>(null);

  // Form state with validation
  const form = useForm<PipelineFormValues>({
    resolver: zodResolver(pipelineFormSchema),
    defaultValues: {
      name: '',
      description: '',
      computeUnits: MIN_TASKS,
    },
  });

  const [yamlContent, setYamlContent] = useState('');
  const [lintHints, setLintHints] = useState<Record<string, LintHint>>({});

  // Fetch pipeline data in view/edit modes
  const { data: pipelineResponse, isLoading: isPipelineLoading } = useGetPipelineQuery(
    { id: pipelineId || '' },
    {
      enabled: mode !== 'create' && !!pipelineId,
    }
  );

  const pipeline = useMemo(() => pipelineResponse?.response?.pipeline, [pipelineResponse]);

  // Fetch components for schema
  const { data: componentListResponse } = useListComponentsQuery();
  const components = useMemo(
    () => (componentListResponse?.components ? parseSchema(componentListResponse.components) : []),
    [componentListResponse]
  );

  // Mutations - only those used in this component
  const createMutation = useCreatePipelineMutation();
  const updateMutation = useUpdatePipelineMutation();

  // Linting
  const lintMutation = useLintPipelineConfigMutation();
  const handleLint = async (yaml: string) => {
    if (!yaml || mode === 'view') {
      return;
    }

    try {
      const response = await lintMutation.mutateAsync(create(LintPipelineConfigRequestSchema, { configYaml: yaml }));
      const hints: Record<string, LintHint> = {};
      for (const [idx, hint] of Object.entries(response.lintHints)) {
        hints[`hint_${idx}`] = hint;
      }
      setLintHints(hints);
    } catch (err) {
      setLintHints(extractLintHintsFromError(err));
    }
  };

  const debouncedLint = useDebounce(handleLint, 500);

  // Zustand store syncing (CREATE mode only)
  const debouncedSyncToStore = useDebounce(
    useCallback(
      (yaml: string) => {
        if (mode === 'create') {
          useOnboardingYamlContentStore.getState().setYamlContent({ yamlContent: yaml });
        }
      },
      [mode]
    ),
    500
  );

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

  const handleSave = useCallback(async () => {
    // Validate form
    const isValid = await form.trigger();
    if (!isValid) {
      return;
    }

    const { name, description, computeUnits } = form.getValues();

    if (mode === 'create') {
      const pipelineCreate = create(PipelineCreateSchema, {
        displayName: name,
        configYaml: yamlContent,
        description: description || '',
        resources: { cpuShares: tasksToCPU(computeUnits) || '0', memoryShares: '0' },
      });

      const createRequestDataPlane = create(CreatePipelineRequestSchemaDataPlane, {
        pipeline: pipelineCreate,
      });

      const createRequest = create(CreatePipelineRequestSchema, {
        request: createRequestDataPlane,
      });

      createMutation.mutate(createRequest, {
        onSuccess: (response) => {
          setLintHints({});
          clearWizardStore();
          toast({
            status: 'success',
            title: 'Pipeline created',
            duration: 4000,
            isClosable: false,
          });
          const retUnits = cpuToTasks(response.response?.pipeline?.resources?.cpuShares);
          const currentUnits = form.getValues('computeUnits');
          if (retUnits && currentUnits !== retUnits) {
            toast({
              status: 'warning',
              title: `Pipeline has been resized to use ${retUnits} compute units`,
              duration: 6000,
              isClosable: false,
            });
          }
          navigate('/connect-clusters');
        },
        onError: (err) => {
          setLintHints(extractLintHintsFromError(err));
          toast({
            status: 'error',
            title: 'Failed to create pipeline',
            description: formatPipelineError(err),
            duration: null,
            isClosable: true,
          });
        },
      });
    } else if (pipelineId) {
      const pipelineUpdate = create(PipelineUpdateSchema, {
        displayName: name,
        configYaml: yamlContent,
        description: description || '',
        resources: { cpuShares: tasksToCPU(computeUnits) || '0', memoryShares: '0' },
      });

      const updateRequestDataPlane = create(UpdatePipelineRequestSchemaDataPlane, {
        id: pipelineId,
        pipeline: pipelineUpdate,
      });

      const updateRequest = create(UpdatePipelineRequestSchema, {
        request: updateRequestDataPlane,
      });

      updateMutation.mutate(updateRequest, {
        onSuccess: (response) => {
          setLintHints({});
          toast({
            status: 'success',
            title: 'Pipeline updated',
            duration: 4000,
            isClosable: false,
          });
          const retUnits = cpuToTasks(response.response?.pipeline?.resources?.cpuShares);
          const currentUnits = form.getValues('computeUnits');
          if (retUnits && currentUnits !== retUnits) {
            toast({
              status: 'warning',
              title: `Pipeline has been resized to use ${retUnits} compute units`,
              duration: 6000,
              isClosable: false,
            });
          }
          navigate(`/rp-connect/${pipelineId}`);
        },
        onError: (err) => {
          setLintHints(extractLintHintsFromError(err));
          toast({
            status: 'error',
            title: 'Failed to update pipeline',
            description: formatPipelineError(err),
            duration: null,
            isClosable: true,
          });
        },
      });
    }
  }, [form, yamlContent, mode, pipelineId, createMutation, updateMutation, toast, navigate, clearWizardStore]);

  const handleSetYamlContent = useCallback((newYaml: string) => {
    setYamlContent(newYaml);
  }, []);

  const handleYamlChange = useCallback(
    (value: string | undefined) => {
      if (value) {
        setYamlContent(value);
        if (mode === 'create') {
          debouncedSyncToStore(value);
        }
        debouncedLint(value);
      }
    },
    [debouncedLint, debouncedSyncToStore, mode]
  );

  const isSaving = useMemo(
    () => createMutation.isPending || updateMutation.isPending,
    [createMutation.isPending, updateMutation.isPending]
  );

  if (isPipelineLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex w-full gap-4">
      <div className="flex flex-1 flex-col gap-4 overflow-auto">
        {/* Toolbar - only in view mode */}
        {mode === 'view' && pipelineId && (
          <Toolbar pipelineId={pipelineId} pipelineName={form.getValues('name')} pipelineState={pipeline?.state} />
        )}

        <Form {...form}>
          <Details readonly={mode === 'view'} />
        </Form>

        <YamlEditorCard
          onChange={handleYamlChange}
          onMount={(editorRef) => {
            setEditorInstance(editorRef);
          }}
          options={{
            readOnly: mode === 'view',
          }}
          value={yamlContent}
        />

        {/* Lint Hints - only in create/edit modes */}
        {mode !== 'view' && Object.keys(lintHints).length > 0 && (
          <div className="mt-4">
            <Alert variant="destructive">
              <AlertDescription>
                <LintHintList className="w-full" lintHints={lintHints} />
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* Footer - only in create/edit modes */}
        {mode !== 'view' && (
          <Footer
            isSaving={isSaving}
            mode={mode}
            onCancel={mode === 'create' ? clearWizardStore : undefined}
            onSave={handleSave}
          />
        )}
      </div>
      {(mode === 'create' || mode === 'edit') && (
        <CreatePipelineSidebar
          components={components}
          editorContent={yamlContent}
          editorInstance={editorInstance}
          setYamlContent={handleSetYamlContent}
        />
      )}
    </div>
  );
}
