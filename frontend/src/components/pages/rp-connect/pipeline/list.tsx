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
import { Link as TanStackRouterLink, useNavigate } from '@tanstack/react-router';
import { Button } from 'components/redpanda-ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'components/redpanda-ui/components/dropdown-menu';
import { FacetedFilter } from 'components/redpanda-ui/components/faceted-filter';
import { Input } from 'components/redpanda-ui/components/input';
import {
  ListView,
  ListViewEnd,
  ListViewGroup,
  ListViewIntermediary,
  ListViewStart,
} from 'components/redpanda-ui/components/list-view';
import { Skeleton } from 'components/redpanda-ui/components/skeleton';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { Tabs, TabsContent, TabsContents, TabsList, TabsTrigger } from 'components/redpanda-ui/components/tabs';
import { Link, Text } from 'components/redpanda-ui/components/typography';
import { DeleteResourceAlertDialog } from 'components/ui/delete-resource-alert-dialog';
import { AlertCircle, MoreHorizontal, X } from 'lucide-react';
import {
  DeletePipelineRequestSchema,
  StartPipelineRequestSchema,
  StopPipelineRequestSchema,
} from 'protogen/redpanda/api/console/v1alpha1/pipeline_pb';
import type { Pipeline as APIPipeline, Pipeline_State } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { memo, useCallback, useMemo, useState } from 'react';
import { useKafkaConnectConnectorsQuery } from 'react-query/api/kafka-connect';
import {
  useDeletePipelineMutation,
  useListPipelinesQuery,
  useStartPipelineMutation,
  useStopPipelineMutation,
} from 'react-query/api/pipeline';
import { useStreamingPipelineLogCounts } from 'react-query/api/pipeline-messages';
import { toast } from 'sonner';
import { useResetOnboardingWizardStore } from 'state/onboarding-wizard-store';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';
import { parse as parseYaml } from 'yaml';

import { PIPELINE_STATE_OPTIONS, STARTABLE_STATES, STOPPABLE_STATES } from '../../../ui/pipeline/constants';
import { PipelineLogIndicator } from '../../../ui/pipeline/pipeline-log-indicator';
import { PipelineStatusBadge } from '../../../ui/pipeline/status-badge';
import { TabKafkaConnect } from '../../connect/overview';

type Pipeline = {
  id: string;
  name: string;
  description: string;
  state: Pipeline_State;
  configYaml: string;
  input?: string;
  output?: string;
};

type ParsedYamlConfig = {
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
};

const parseInputOutput = (configYaml: string): { input?: string; output?: string } => {
  if (!configYaml) {
    return {};
  }
  try {
    const config = parseYaml(configYaml) as ParsedYamlConfig | null;
    if (!config) {
      return {};
    }

    const inputObj = config.input;
    const outputObj = config.output;

    return {
      input: inputObj && typeof inputObj === 'object' ? Object.keys(inputObj)[0] : undefined,
      output: outputObj && typeof outputObj === 'object' ? Object.keys(outputObj)[0] : undefined,
    };
  } catch {
    return {};
  }
};

const transformAPIPipeline = (apiPipeline: APIPipeline): Pipeline => {
  const { input, output } = parseInputOutput(apiPipeline.configYaml);
  return {
    id: apiPipeline.id,
    name: apiPipeline.displayName,
    description: apiPipeline.description,
    state: apiPipeline.state,
    configYaml: apiPipeline.configYaml,
    input,
    output,
  };
};

// ============================================================================
// Pagination Constants
// ============================================================================

const PAGE_SIZE = 20;

// ============================================================================
// Filter Helpers
// ============================================================================

type FilterOptions = {
  nameSearch: string;
  inputFilter: string[];
  outputFilter: string[];
  stateFilter: string[];
};

const matchesNameSearch = (pipeline: Pipeline, search: string): boolean => {
  if (!search) {
    return true;
  }
  const searchLower = search.toLowerCase();
  return (
    pipeline.name.toLowerCase().includes(searchLower) ||
    pipeline.id.toLowerCase().includes(searchLower) ||
    pipeline.description.toLowerCase().includes(searchLower)
  );
};

const matchesInputFilter = (pipeline: Pipeline, filter: string[]): boolean => {
  if (filter.length === 0) {
    return true;
  }
  return Boolean(pipeline.input && filter.includes(pipeline.input));
};

const matchesOutputFilter = (pipeline: Pipeline, filter: string[]): boolean => {
  if (filter.length === 0) {
    return true;
  }
  return Boolean(pipeline.output && filter.includes(pipeline.output));
};

const matchesStateFilter = (pipeline: Pipeline, filter: string[]): boolean => {
  if (filter.length === 0) {
    return true;
  }
  return filter.includes(String(pipeline.state));
};

const filterPipeline = (pipeline: Pipeline, options: FilterOptions): boolean =>
  matchesNameSearch(pipeline, options.nameSearch) &&
  matchesInputFilter(pipeline, options.inputFilter) &&
  matchesOutputFilter(pipeline, options.outputFilter) &&
  matchesStateFilter(pipeline, options.stateFilter);

// ============================================================================
// Skeleton Component
// ============================================================================

const PipelineListSkeleton = () => (
  <div className="flex flex-col gap-4">
    <div className="flex items-center justify-between gap-4">
      <Skeleton className="h-8 w-[200px]" />
      <Skeleton className="h-8 w-20" />
    </div>
    <ListViewGroup>
      {Array.from({ length: 5 }).map(() => (
        <ListView key={crypto.randomUUID()} variant="grouped">
          <ListViewStart>
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-60" />
          </ListViewStart>
          <ListViewIntermediary>
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-6 w-20" />
          </ListViewIntermediary>
          <ListViewEnd>
            <Skeleton className="h-8 w-8" />
          </ListViewEnd>
        </ListView>
      ))}
    </ListViewGroup>
  </div>
);

// ============================================================================
// Actions Cell - Pipeline row actions dropdown
// ============================================================================

type ActionsCellProps = {
  pipeline: Pipeline;
  navigate: ReturnType<typeof useNavigate>;
  deleteMutation: ReturnType<typeof useDeletePipelineMutation>['mutate'];
  startMutation: ReturnType<typeof useStartPipelineMutation>['mutate'];
  stopMutation: ReturnType<typeof useStopPipelineMutation>['mutate'];
  isDeletingPipeline: boolean;
};

const ActionsCell = memo(
  ({ pipeline, navigate, deleteMutation, startMutation, stopMutation, isDeletingPipeline }: ActionsCellProps) => {
    const canStart = (STARTABLE_STATES as readonly Pipeline_State[]).includes(pipeline.state);
    const canStop = (STOPPABLE_STATES as readonly Pipeline_State[]).includes(pipeline.state);

    const handleStart = () => {
      const startRequest = create(StartPipelineRequestSchema, {
        request: { id: pipeline.id },
      });
      startMutation(startRequest, {
        onSuccess: () => {
          toast.success('Pipeline started');
        },
        onError: (err) => {
          toast.error(
            formatToastErrorMessageGRPC({
              error: ConnectError.from(err),
              action: 'start',
              entity: 'pipeline',
            })
          );
        },
      });
    };

    const handleStop = () => {
      const stopRequest = create(StopPipelineRequestSchema, {
        request: { id: pipeline.id },
      });
      stopMutation(stopRequest, {
        onSuccess: () => {
          toast.success('Pipeline stopped');
        },
        onError: (err) => {
          toast.error(
            formatToastErrorMessageGRPC({
              error: ConnectError.from(err),
              action: 'stop',
              entity: 'pipeline',
            })
          );
        },
      });
    };

    const handleDelete = (id: string) => {
      const deleteRequest = create(DeletePipelineRequestSchema, {
        request: { id },
      });

      deleteMutation(deleteRequest, {
        onSuccess: () => {
          toast.success('Pipeline deleted');
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
    };

    return (
      <div className="flex justify-end" data-actions-column>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="size-8" size="icon" variant="secondary-ghost">
              <MoreHorizontal />
              <span className="sr-only">Open menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() =>
                navigate({
                  to: '/rp-connect/$pipelineId/edit',
                  params: { pipelineId: encodeURIComponent(pipeline.id) },
                })
              }
            >
              Edit
            </DropdownMenuItem>
            {canStart ? <DropdownMenuItem onClick={handleStart}>Start</DropdownMenuItem> : null}
            {canStop ? <DropdownMenuItem onClick={handleStop}>Stop</DropdownMenuItem> : null}
            <DropdownMenuSeparator />
            <DeleteResourceAlertDialog
              buttonIcon={undefined}
              buttonText="Delete"
              buttonVariant="destructive-ghost"
              isDeleting={isDeletingPipeline}
              onDelete={handleDelete}
              resourceId={pipeline.id}
              resourceName={pipeline.name}
              resourceType="Pipeline"
              triggerVariant="dropdown"
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }
);

ActionsCell.displayName = 'ActionsCell';

// ============================================================================
// Toolbar Component - Filters
// ============================================================================

type PipelineListToolbarProps = {
  nameSearch: string;
  onNameSearchChange: (value: string) => void;
  inputFilter: string[];
  onInputFilterToggle: (value: string) => void;
  onInputFilterClear: () => void;
  outputFilter: string[];
  onOutputFilterToggle: (value: string) => void;
  onOutputFilterClear: () => void;
  stateFilter: string[];
  onStateFilterToggle: (value: string) => void;
  onStateFilterClear: () => void;
  inputOptions: { label: string; value: string }[];
  outputOptions: { label: string; value: string }[];
  isFiltered: boolean;
  onClearAllFilters: () => void;
};

const PipelineListToolbar = ({
  nameSearch,
  onNameSearchChange,
  inputFilter,
  onInputFilterToggle,
  onInputFilterClear,
  outputFilter,
  onOutputFilterToggle,
  onOutputFilterClear,
  stateFilter,
  onStateFilterToggle,
  onStateFilterClear,
  inputOptions,
  outputOptions,
  isFiltered,
  onClearAllFilters,
}: PipelineListToolbarProps) => (
  <div className="flex items-center justify-between">
    <div className="flex flex-1 items-center gap-1">
      <Input
        className="h-8 w-[200px]"
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => onNameSearchChange(event.target.value)}
        placeholder="Filter pipelines..."
        value={nameSearch}
      />
      {inputOptions.length > 0 ? (
        <FacetedFilter
          onClear={onInputFilterClear}
          onToggle={onInputFilterToggle}
          options={inputOptions}
          selectedValues={inputFilter}
          title="Input"
        />
      ) : null}
      {outputOptions.length > 0 ? (
        <FacetedFilter
          onClear={onOutputFilterClear}
          onToggle={onOutputFilterToggle}
          options={outputOptions}
          selectedValues={outputFilter}
          title="Output"
        />
      ) : null}
      <FacetedFilter
        onClear={onStateFilterClear}
        onToggle={onStateFilterToggle}
        options={[...PIPELINE_STATE_OPTIONS]}
        selectedValues={stateFilter}
        title="State"
      />
      {isFiltered ? (
        <Button onClick={onClearAllFilters} size="sm" variant="ghost">
          Clear
          <X className="ml-2 h-4 w-4" />
        </Button>
      ) : null}
    </div>
  </div>
);

// ============================================================================
// Main Pipeline List Component
// ============================================================================

const PipelineListPageContent = () => {
  const navigate = useNavigate();
  const resetOnboardingWizardStore = useResetOnboardingWizardStore();

  // Filter state
  const [nameSearch, setNameSearch] = useState('');
  const [inputFilter, setInputFilter] = useState<string[]>([]);
  const [outputFilter, setOutputFilter] = useState<string[]>([]);
  const [stateFilter, setStateFilter] = useState<string[]>([]);

  // Pagination state
  const [pageIndex, setPageIndex] = useState(0);

  const { data: pipelinesData, isLoading, error } = useListPipelinesQuery();
  const { mutate: deleteMutation, isPending: isDeletingPipeline } = useDeletePipelineMutation();
  const { mutate: startMutation } = useStartPipelineMutation();
  const { mutate: stopMutation } = useStopPipelineMutation();

  const pipelines = useMemo(
    () =>
      (pipelinesData?.pipelines || [])
        .filter(
          (pipeline): pipeline is APIPipeline => !!pipeline && pipeline.tags?.__redpanda_cloud_pipeline_type !== 'agent'
        )
        .map(transformAPIPipeline),
    [pipelinesData]
  );

  // Filter pipelines client-side
  const filteredPipelines = useMemo(
    () => pipelines.filter((p) => filterPipeline(p, { nameSearch, inputFilter, outputFilter, stateFilter })),
    [pipelines, nameSearch, inputFilter, outputFilter, stateFilter]
  );

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredPipelines.length / PAGE_SIZE));
  const paginatedPipelines = useMemo(
    () => filteredPipelines.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE),
    [filteredPipelines, pageIndex]
  );

  // Reset page index when filters change
  const handleNameSearchChange = useCallback((value: string) => {
    setNameSearch(value);
    setPageIndex(0);
  }, []);

  const handleInputFilterToggle = useCallback((value: string) => {
    setInputFilter((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
    setPageIndex(0);
  }, []);

  const handleOutputFilterToggle = useCallback((value: string) => {
    setOutputFilter((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
    setPageIndex(0);
  }, []);

  const handleStateFilterToggle = useCallback((value: string) => {
    setStateFilter((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
    setPageIndex(0);
  }, []);

  const handleClearAllFilters = useCallback(() => {
    setNameSearch('');
    setInputFilter([]);
    setOutputFilter([]);
    setStateFilter([]);
    setPageIndex(0);
  }, []);

  const handleCreateClick = useCallback(() => {
    resetOnboardingWizardStore();
    navigate({
      to: '/rp-connect/wizard',
      search: { step: undefined, serverless: undefined },
    });
  }, [resetOnboardingWizardStore, navigate]);

  // Generate filter options from pipeline data
  const inputOptions = useMemo(() => {
    const uniqueInputs = new Set<string>();
    for (const pipeline of pipelines) {
      if (pipeline.input) {
        uniqueInputs.add(pipeline.input);
      }
    }
    return Array.from(uniqueInputs)
      .sort()
      .map((input) => ({ label: input, value: input }));
  }, [pipelines]);

  const outputOptions = useMemo(() => {
    const uniqueOutputs = new Set<string>();
    for (const pipeline of pipelines) {
      if (pipeline.output) {
        uniqueOutputs.add(pipeline.output);
      }
    }
    return Array.from(uniqueOutputs)
      .sort()
      .map((output) => ({ label: output, value: output }));
  }, [pipelines]);

  const isFiltered = nameSearch !== '' || inputFilter.length > 0 || outputFilter.length > 0 || stateFilter.length > 0;

  // Get visible pipeline IDs from current page for streaming log counts
  const visiblePipelineIds = useMemo(() => paginatedPipelines.map((p) => p.id), [paginatedPipelines]);
  const { counts } = useStreamingPipelineLogCounts(visiblePipelineIds);

  if (isLoading) {
    return <PipelineListSkeleton />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-red-600">
        <AlertCircle className="h-4 w-4" />
        Error loading pipelines: {error.message}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="mb-4">
        <Button onClick={handleCreateClick}>Create a pipeline</Button>
      </div>
      <PipelineListToolbar
        inputFilter={inputFilter}
        inputOptions={inputOptions}
        isFiltered={isFiltered}
        nameSearch={nameSearch}
        onClearAllFilters={handleClearAllFilters}
        onInputFilterClear={() => {
          setInputFilter([]);
          setPageIndex(0);
        }}
        onInputFilterToggle={handleInputFilterToggle}
        onNameSearchChange={handleNameSearchChange}
        onOutputFilterClear={() => {
          setOutputFilter([]);
          setPageIndex(0);
        }}
        onOutputFilterToggle={handleOutputFilterToggle}
        onStateFilterClear={() => {
          setStateFilter([]);
          setPageIndex(0);
        }}
        onStateFilterToggle={handleStateFilterToggle}
        outputFilter={outputFilter}
        outputOptions={outputOptions}
        stateFilter={stateFilter}
      />
      {filteredPipelines.length === 0 ? (
        <div className="flex h-24 items-center justify-center text-muted-foreground">
          {pipelines.length === 0 ? 'You have no Redpanda Connect pipelines' : 'No pipelines match your filters'}
        </div>
      ) : (
        <>
          <ListViewGroup>
            {paginatedPipelines.map((pipeline) => {
              const pipelineCounts = counts.get(pipeline.id);
              return (
                <ListView key={pipeline.id} variant="grouped">
                  <ListViewStart>
                    <TanStackRouterLink
                      className="text-[1rem] text-foreground underline decoration-dotted underline-offset-[3px]"
                      params={{ pipelineId: encodeURIComponent(pipeline.id) }}
                      to="/rp-connect/$pipelineId"
                    >
                      {pipeline.name}
                    </TanStackRouterLink>
                    {pipeline.description ? (
                      <Text className="truncate" variant="muted">
                        {pipeline.description}
                      </Text>
                    ) : null}
                  </ListViewStart>
                  <ListViewIntermediary gap="md">
                    <div className="flex min-w-[100px] items-center gap-2">
                      {pipeline.input ? <Text>{pipeline.input}</Text> : null}
                      <PipelineLogIndicator counts={pipelineCounts?.input} />
                    </div>
                    <div className="flex min-w-[100px] items-center gap-2">
                      {pipeline.output ? <Text>{pipeline.output}</Text> : null}
                      <PipelineLogIndicator counts={pipelineCounts?.output} />
                    </div>
                    <PipelineStatusBadge state={pipeline.state} />
                  </ListViewIntermediary>
                  <ListViewEnd>
                    <ActionsCell
                      deleteMutation={deleteMutation}
                      isDeletingPipeline={isDeletingPipeline}
                      navigate={navigate}
                      pipeline={pipeline}
                      startMutation={startMutation}
                      stopMutation={stopMutation}
                    />
                  </ListViewEnd>
                </ListView>
              );
            })}
          </ListViewGroup>
          {/* Pagination */}
          <div className="flex items-center justify-end gap-2">
            <Text variant="muted">
              Page {pageIndex + 1} of {totalPages}
            </Text>
            <Button disabled={pageIndex === 0} onClick={() => setPageIndex((p) => p - 1)} size="sm" variant="outline">
              Previous
            </Button>
            <Button
              disabled={pageIndex >= totalPages - 1}
              onClick={() => setPageIndex((p) => p + 1)}
              size="sm"
              variant="outline"
            >
              Next
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

// ============================================================================
// Page Wrapper Components
// ============================================================================

const RedpandaConnectContent = () => (
  <div className="flex flex-col gap-4">
    <Text>
      Redpanda Connect is a data streaming service for building scalable, high-performance data pipelines that drive
      real-time analytics and actionable business insights. Integrate data across systems with hundreds of prebuilt
      connectors, change data capture (CDC) capabilities, and YAML-configurable pipelines.{' '}
      <Link href="https://docs.redpanda.com/redpanda-connect/home/" target="_blank">
        Learn more
      </Link>
    </Text>
    <PipelineListPageContent />
  </div>
);

export const PipelineListPage = () => {
  const { data: kafkaConnectors, isLoading: isLoadingKafkaConnect } = useKafkaConnectConnectorsQuery();

  const isKafkaConnectEnabled = kafkaConnectors?.isConfigured === true;
  const showKafkaConnectLoadingHint = isLoadingKafkaConnect && !kafkaConnectors;

  if (!isKafkaConnectEnabled) {
    return (
      <div className="flex flex-col gap-4">
        {showKafkaConnectLoadingHint ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Spinner />
            <Text variant="muted">Checking for Kafka Connect availability...</Text>
          </div>
        ) : null}
        <RedpandaConnectContent />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Text>
        There are two ways to integrate your Redpanda data with data from external systems: Redpanda Connect and Kafka
        Connect.
      </Text>
      <Tabs defaultValue="redpanda-connect">
        <TabsList variant="underline">
          <TabsTrigger value="redpanda-connect" variant="underline">
            Redpanda Connect
          </TabsTrigger>
          <TabsTrigger value="kafka-connect" variant="underline">
            Kafka Connect
          </TabsTrigger>
        </TabsList>
        <TabsContents className="p-6">
          <TabsContent value="redpanda-connect">
            <RedpandaConnectContent />
          </TabsContent>
          <TabsContent value="kafka-connect">
            <div className="flex flex-col gap-6">
              <Text>
                Kafka Connect is our set of managed connectors. These provide a way to integrate your Redpanda data with
                different data systems.{' '}
                <Link href="https://docs.redpanda.com/redpanda-cloud/develop/managed-connectors/" target="_blank">
                  Learn more
                </Link>
              </Text>
              <TabKafkaConnect />
            </div>
          </TabsContent>
        </TabsContents>
      </Tabs>
    </div>
  );
};
