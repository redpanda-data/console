import { create } from '@bufbuild/protobuf';
import { createConnectQueryKey } from '@connectrpc/connect-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, AlertDescription } from 'components/redpanda-ui/components/alert';
import { Button } from 'components/redpanda-ui/components/button';
import { Combobox } from 'components/redpanda-ui/components/combobox';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from 'components/redpanda-ui/components/form';
import { Input } from 'components/redpanda-ui/components/input';
import { ToggleGroup, ToggleGroupItem } from 'components/redpanda-ui/components/toggle-group';
import { ChevronDown, XIcon } from 'lucide-react';
import { type MotionProps, motion } from 'motion/react';
import { listACLs } from 'protogen/redpanda/api/dataplane/v1/acl-ACLService_connectquery';
import { ListTopicsRequestSchema } from 'protogen/redpanda/api/dataplane/v1/topic_pb';
import { listTopics } from 'protogen/redpanda/api/dataplane/v1/topic-TopicService_connectquery';
import {
  type Dispatch,
  forwardRef,
  type SetStateAction,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react';
import { type UseFormReturn, useForm, useWatch } from 'react-hook-form';
import { useGetKafkaInfoQuery } from 'react-query/api/cluster-status';
import { useLegacyListTopicsQuery } from 'react-query/api/topic';
import { LONG_LIVED_CACHE_STALE_TIME } from 'react-query/react-query.utils';
import { toast } from 'sonner';
import { isFalsy } from 'utils/falsy';

import { AdvancedTopicSettings } from './advanced-topic-settings';
import { StepSurface } from './step-surface';
import {
  CreateTopicRequest_Topic_ConfigSchema,
  CreateTopicRequest_TopicSchema,
  CreateTopicRequestSchema,
} from '../../../../protogen/redpanda/api/dataplane/v1/topic_pb';
import { useCreateTopicMutation, useTopicConfigQuery } from '../../../../react-query/api/topic';
import { convertRetentionSizeToBytes, convertRetentionTimeToMs } from '../../../../utils/topic-utils';
import {
  type AddTopicFormData,
  addTopicFormSchema,
  type BaseStepRef,
  CreatableSelectionOptions,
  type CreatableSelectionType,
  type StepSubmissionResult,
} from '../types/wizard';
import { isUsingDefaultRetentionSettings, parseTopicConfigFromExisting, TOPIC_FORM_DEFAULTS } from '../utils/topic';

// Only describe what the mode can actually do — "create a new topic" with no input reads as broken.
const TOPIC_NAME_DESCRIPTIONS: Record<'new' | 'existing' | 'both', string> = {
  new: 'Enter a name for the new topic.',
  existing: 'Choose an existing topic to read or write data from.',
  both: 'Choose an existing topic to read or write data from, or create a new topic.',
};

type AddTopicStepProps = {
  defaultTopicName?: string;
  hideInternal?: boolean;
  onValidityChange?: (isValid: boolean) => void;
  selectionMode?: 'existing' | 'new' | 'both';
  hideTitle?: boolean;
  className?: string;
  // Renders the form bare (no Card chrome/min-height/margin) so it can sit
  // inside a host surface like a dialog body. Defaults to false for the wizard.
  inline?: boolean;
};

type SelectionMode = NonNullable<AddTopicStepProps['selectionMode']>;
type TopicForm = UseFormReturn<AddTopicFormData>;
type TopicList = ReturnType<typeof useLegacyListTopicsQuery>['data'];
type ListedTopic = NonNullable<NonNullable<TopicList>['topics']>[number];

// ── Hooks ──────────────────────────────────────────────────────────────────────

function useTopicOptions(hideInternal: boolean) {
  const { data: topicList } = useLegacyListTopicsQuery(create(ListTopicsRequestSchema, {}), {
    hideInternalTopics: true,
    staleTime: LONG_LIVED_CACHE_STALE_TIME,
    refetchOnWindowFocus: false,
  });

  const topicOptions = useMemo(
    () =>
      topicList?.topics
        ?.filter((topic) => !(hideInternal && topic.topicName.startsWith('__')))
        .map((topic) => ({
          value: topic.topicName,
          label: topic.topicName,
        })) ?? [],
    [topicList, hideInternal]
  );
  return { topicList, topicOptions };
}

function useAddTopicForm(defaultTopicName?: string) {
  // The RF field is readOnly in advanced-topic-settings, so the default is
  // also the final value. Clamp to broker count so single-broker clusters
  // (e.g. local-byoc) don't hit "not enough replicas" on CreateTopic.
  const { data: kafkaInfo } = useGetKafkaInfoQuery();
  const brokersOnline = kafkaInfo?.brokersOnline ?? 0;
  const defaultReplicationFactor =
    brokersOnline > 0
      ? Math.min(TOPIC_FORM_DEFAULTS.replicationFactor, brokersOnline)
      : TOPIC_FORM_DEFAULTS.replicationFactor;

  const defaultValues = useMemo(
    () => ({
      ...TOPIC_FORM_DEFAULTS,
      replicationFactor: defaultReplicationFactor,
      topicName: defaultTopicName || TOPIC_FORM_DEFAULTS.topicName,
    }),
    [defaultTopicName, defaultReplicationFactor]
  );

  // Pass defaultValues AND values so react-hook-form reactively updates
  // replicationFactor when the KafkaInfo query resolves after mount. The
  // `values` prop is rhf's built-in mechanism for external reactive state;
  // `keepDirtyValues` prevents fields the user has already touched from
  // being overwritten when kafkaInfo lands late.
  return useForm<AddTopicFormData>({
    resolver: zodResolver(addTopicFormSchema),
    mode: 'onChange',
    defaultValues,
    values: defaultValues,
    resetOptions: { keepDirtyValues: true },
  });
}

// The existing topic the typed name refers to, whose config then replaces the form's values.
function useExistingTopicSync(form: TopicForm, topicList: TopicList) {
  const watchedTopicName = useWatch({
    control: form.control,
    name: 'topicName',
  });

  const existingTopicSelected = useMemo(() => {
    // Only check if the CURRENT form topic name matches an existing topic
    if (!watchedTopicName) {
      return;
    }
    return topicList?.topics?.find((topic) => topic.topicName === watchedTopicName);
  }, [watchedTopicName, topicList]);

  const { data: topicConfig } = useTopicConfigQuery(
    existingTopicSelected?.topicName || '',
    !isFalsy(existingTopicSelected?.topicName)
  );

  useEffect(
    function syncExistingTopicValues() {
      if (!existingTopicSelected) {
        return;
      }
      if (topicConfig && !topicConfig.error) {
        const allTopicValues = parseTopicConfigFromExisting(existingTopicSelected, topicConfig);
        // Override the form-level `keepDirtyValues: true` default — when a user
        // selects an existing topic, its config must fully replace any partial
        // input they've made.
        form.reset(allTopicValues, { keepDefaultValues: false, keepDirtyValues: false });
      } else {
        form.setValue('topicName', existingTopicSelected.topicName, {
          shouldDirty: false,
        });
      }
    },
    [existingTopicSelected, topicConfig, form]
  );
  return { watchedTopicName, existingTopicSelected };
}

function initialTopicSelectionType(selectionMode: SelectionMode, topicList: TopicList): CreatableSelectionType {
  if (selectionMode === 'new') {
    return CreatableSelectionOptions.CREATE;
  }
  if (selectionMode === 'existing') {
    return CreatableSelectionOptions.EXISTING;
  }
  return topicList?.topics?.length === 0 ? CreatableSelectionOptions.CREATE : CreatableSelectionOptions.EXISTING;
}

function useTopicSelectionType({
  form,
  selectionMode,
  topicList,
}: {
  form: TopicForm;
  selectionMode: SelectionMode;
  topicList: TopicList;
}) {
  const [topicSelectionType, setTopicSelectionType] = useState<CreatableSelectionType>(() =>
    initialTopicSelectionType(selectionMode, topicList)
  );

  const handleTopicSelectionTypeChange = useCallback(
    (value: string) => {
      setTopicSelectionType(value as CreatableSelectionType);
      form.setValue('topicName', '', { shouldDirty: true });
    },
    [form]
  );
  return { topicSelectionType, handleTopicSelectionTypeChange };
}

// ── Submission ─────────────────────────────────────────────────────────────────

function buildCreateTopicRequest(data: AddTopicFormData) {
  const configs = [
    create(CreateTopicRequest_Topic_ConfigSchema, {
      name: 'cleanup.policy',
      value: 'delete',
    }),
  ];

  // Add retention configs if they differ from defaults
  if (!isUsingDefaultRetentionSettings(data)) {
    const retentionMs = convertRetentionTimeToMs(data.retentionTimeMs, data.retentionTimeUnit);
    const retentionBytes = convertRetentionSizeToBytes(data.retentionSize, data.retentionSizeUnit);

    configs.push(
      create(CreateTopicRequest_Topic_ConfigSchema, {
        name: 'retention.ms',
        value: retentionMs.toString(),
      }),
      create(CreateTopicRequest_Topic_ConfigSchema, {
        name: 'retention.bytes',
        value: retentionBytes.toString(),
      })
    );
  }

  return create(CreateTopicRequestSchema, {
    topic: create(CreateTopicRequest_TopicSchema, {
      name: data.topicName,
      partitionCount: data.partitions,
      replicationFactor: data.replicationFactor,
      configs,
    }),
  });
}

function useAddTopicSubmit(existingTopicSelected?: ListedTopic) {
  const queryClient = useQueryClient();
  const createTopicMutation = useCreateTopicMutation();

  const handleSubmit = useCallback(
    async (data: AddTopicFormData): Promise<StepSubmissionResult<AddTopicFormData>> => {
      try {
        if (existingTopicSelected) {
          return {
            success: true,
            message: `Using existing topic "${data.topicName}"`,
            data,
          };
        }

        await createTopicMutation.mutateAsync(buildCreateTopicRequest(data));

        await queryClient.invalidateQueries({
          queryKey: createConnectQueryKey({
            schema: listTopics,
            cardinality: 'finite',
          }),
        });

        return {
          success: true,
          message: `Topic "${data.topicName}" created`,
          data,
        };
      } catch (error) {
        return {
          success: false,
          message: 'Failed to save topic configuration',
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
    [existingTopicSelected, createTopicMutation, queryClient]
  );
  return { handleSubmit, isPending: createTopicMutation.isPending };
}

// ── Form sections ──────────────────────────────────────────────────────────────

type TopicNameSectionProps = {
  form: TopicForm;
  selectionMode: SelectionMode;
  isPending: boolean;
  topicSelectionType: CreatableSelectionType;
  onTopicSelectionTypeChange: (value: string) => void;
  topicOptions: { value: string; label: string }[];
  watchedTopicName: string;
  existingTopicSelected?: ListedTopic;
};

function TopicNameInput({
  form,
  isPending,
  topicSelectionType,
  topicOptions,
}: Pick<TopicNameSectionProps, 'form' | 'isPending' | 'topicSelectionType' | 'topicOptions'>) {
  const queryClient = useQueryClient();
  return (
    <FormField
      control={form.control}
      name="topicName"
      render={({ field }) => (
        <FormItem>
          <FormControl>
            {topicSelectionType === CreatableSelectionOptions.EXISTING ? (
              <Combobox
                {...field}
                className="w-[300px]"
                disabled={isPending}
                onOpen={() => {
                  Promise.all([
                    queryClient.invalidateQueries({
                      queryKey: createConnectQueryKey({
                        schema: listTopics,
                        cardinality: 'infinite',
                      }),
                    }),
                    queryClient.invalidateQueries({
                      queryKey: createConnectQueryKey({
                        schema: listACLs,
                        cardinality: 'finite',
                      }),
                    }),
                  ]).catch((error: unknown) => {
                    toast.error('Failed to refresh topics', { description: String(error) });
                  });
                }}
                options={topicOptions}
                placeholder="Select a topic"
              />
            ) : (
              <Input {...field} className="w-[300px]" disabled={isPending} placeholder="Enter a topic name" />
            )}
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function TopicNameSection({
  form,
  selectionMode,
  isPending,
  topicSelectionType,
  onTopicSelectionTypeChange,
  topicOptions,
  watchedTopicName,
  existingTopicSelected,
}: TopicNameSectionProps) {
  // Show info alert when user types a name that matches an existing topic in "new" mode
  const showExistingTopicAlert =
    topicSelectionType === CreatableSelectionOptions.CREATE && Boolean(existingTopicSelected);

  return (
    <div className="flex flex-col gap-2">
      <FormLabel>Topic name</FormLabel>
      <FormDescription>{TOPIC_NAME_DESCRIPTIONS[selectionMode]}</FormDescription>
      <div className="flex flex-col items-start gap-2">
        {selectionMode === 'both' && (
          <ToggleGroup
            disabled={isPending}
            onValueChange={([value]) => {
              // Prevent deselection - ToggleGroup emits empty string when trying to deselect
              if (!value) {
                return;
              }
              onTopicSelectionTypeChange(value as CreatableSelectionType);
            }}
            value={[topicSelectionType]}
            variant="outline"
          >
            <ToggleGroupItem id={CreatableSelectionOptions.EXISTING} value={CreatableSelectionOptions.EXISTING}>
              Existing
            </ToggleGroupItem>
            <ToggleGroupItem id={CreatableSelectionOptions.CREATE} value={CreatableSelectionOptions.CREATE}>
              New
            </ToggleGroupItem>
          </ToggleGroup>
        )}

        <div className="flex gap-2">
          <TopicNameInput
            form={form}
            isPending={isPending}
            topicOptions={topicOptions}
            topicSelectionType={topicSelectionType}
          />

          {watchedTopicName ? (
            <Button
              disabled={isPending}
              onClick={() => form.setValue('topicName', '', { shouldDirty: true })}
              size="icon"
              variant="ghost"
            >
              <XIcon size={16} />
            </Button>
          ) : null}
        </div>

        {showExistingTopicAlert ? (
          <Alert variant="informative">
            <AlertDescription>
              A topic named <b>{watchedTopicName}</b> already exists. A reference to the existing topic will be used.
            </AlertDescription>
          </Alert>
        ) : null}
      </div>
    </div>
  );
}

function AdvancedSettingsDisclosure({
  form,
  isPending,
  isExistingTopic,
  open,
  onOpenChange,
}: {
  form: TopicForm;
  isPending: boolean;
  isExistingTopic: boolean;
  open: boolean;
  onOpenChange: Dispatch<SetStateAction<boolean>>;
}) {
  return (
    <div className="flex flex-col">
      {/* The negative margin sets the toggle's label flush with the fields above it. */}
      <Button
        aria-controls="add-topic-advanced-settings"
        aria-expanded={open}
        className="-ml-3 self-start"
        disabled={isPending}
        onClick={() => onOpenChange((prev) => !prev)}
        size="sm"
        type="button"
        variant="ghost"
      >
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          className="flex h-4 w-4 items-center justify-center"
          transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
        >
          <ChevronDown className="h-4 w-4" />
        </motion.span>
        Show advanced settings
      </Button>

      {/* The panel snaps in/out instantly so DialogContent's
          useAnimatedAutoHeight observes one clean before→after height
          delta and runs the visible transition. Animating both at once
          causes the panel's tween to fight the dialog's resize. */}
      {open ? (
        <div className="space-y-6 pt-4" id="add-topic-advanced-settings">
          <AdvancedTopicSettings disabled={isPending} form={form} isExistingTopic={isExistingTopic} />
        </div>
      ) : null}
    </div>
  );
}

// ── Step ───────────────────────────────────────────────────────────────────────

export const AddTopicStep = forwardRef<BaseStepRef<AddTopicFormData>, AddTopicStepProps & MotionProps>(
  (
    {
      defaultTopicName,
      hideInternal = true,
      onValidityChange,
      selectionMode = 'both',
      hideTitle,
      className,
      inline = false,
    },
    ref
  ) => {
    const { topicList, topicOptions } = useTopicOptions(hideInternal);
    const form = useAddTopicForm(defaultTopicName);
    const { watchedTopicName, existingTopicSelected } = useExistingTopicSync(form, topicList);
    const { handleSubmit, isPending } = useAddTopicSubmit(existingTopicSelected);
    const { topicSelectionType, handleTopicSelectionTypeChange } = useTopicSelectionType({
      form,
      selectionMode,
      topicList,
    });
    const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

    useEffect(
      function reportValidity() {
        onValidityChange?.(form.formState.isValid);
      },
      [form.formState.isValid, onValidityChange]
    );

    useImperativeHandle(ref, () => ({
      triggerSubmit: async (signal?: AbortSignal) => {
        if (signal?.aborted) {
          return { success: false };
        }
        const isValid = await form.trigger();
        if (signal?.aborted) {
          return { success: false };
        }
        if (isValid) {
          const data = form.getValues();
          return handleSubmit(data);
        }
        return {
          success: false,
          message: 'Fix the form errors before proceeding',
          error: 'Form validation failed',
        };
      },
      isPending,
    }));

    return (
      <StepSurface
        className={className}
        description="Select or create a topic to store data for this streaming pipeline. A topic can have multiple clients writing data to it (producers) and reading data from it (consumers)."
        hideTitle={hideTitle}
        inline={inline}
        title="Read or write data from a topic"
      >
        <Form {...form}>
          <div className={inline ? 'flex flex-col gap-5' : 'mt-4 max-w-2xl space-y-6'}>
            <TopicNameSection
              existingTopicSelected={existingTopicSelected}
              form={form}
              isPending={isPending}
              onTopicSelectionTypeChange={handleTopicSelectionTypeChange}
              selectionMode={selectionMode}
              topicOptions={topicOptions}
              topicSelectionType={topicSelectionType}
              watchedTopicName={watchedTopicName}
            />

            {topicSelectionType === CreatableSelectionOptions.EXISTING && !existingTopicSelected ? null : (
              <AdvancedSettingsDisclosure
                form={form}
                isExistingTopic={Boolean(existingTopicSelected)}
                isPending={isPending}
                onOpenChange={setShowAdvancedSettings}
                open={showAdvancedSettings}
              />
            )}
          </div>
        </Form>
      </StepSurface>
    );
  }
);
