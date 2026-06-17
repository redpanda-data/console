import { create } from '@bufbuild/protobuf';
import { createConnectQueryKey } from '@connectrpc/connect-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, AlertDescription } from 'components/redpanda-ui/components/alert';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
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
import { Heading } from 'components/redpanda-ui/components/typography';
import { ChevronDown, XIcon } from 'lucide-react';
import { type MotionProps, motion } from 'motion/react';
import { listACLs } from 'protogen/redpanda/api/dataplane/v1/acl-ACLService_connectquery';
import { ListTopicsRequestSchema } from 'protogen/redpanda/api/dataplane/v1/topic_pb';
import { listTopics } from 'protogen/redpanda/api/dataplane/v1/topic-TopicService_connectquery';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useGetKafkaInfoQuery } from 'react-query/api/cluster-status';
import { LONG_LIVED_CACHE_STALE_TIME } from 'react-query/react-query.utils';
import { isFalsy } from 'utils/falsy';

import { AdvancedTopicSettings } from './advanced-topic-settings';
import {
  CreateTopicRequest_Topic_ConfigSchema,
  CreateTopicRequest_TopicSchema,
  CreateTopicRequestSchema,
} from '../../../../protogen/redpanda/api/dataplane/v1/topic_pb';
import { useCreateTopicMutation, useListTopicsQuery, useTopicConfigQuery } from '../../../../react-query/api/topic';
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
      ...motionProps
    },
    ref
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: form-state-machine component with inline vs card render branches, existing-topic detection, advanced-settings toggle, and ToggleGroup switching — extracting further would obscure the rendered tree.
  ) => {
    const queryClient = useQueryClient();

    const { data: topicList } = useListTopicsQuery(
      create(ListTopicsRequestSchema, { pageSize: -1 }),
      { staleTime: LONG_LIVED_CACHE_STALE_TIME, refetchOnWindowFocus: false },
      { hideInternalTopics: true }
    );

    const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

    const topicOptions = useMemo(
      () =>
        topicList?.topics
          ?.filter((topic) => !(hideInternal && topic.name.startsWith('__')))
          .map((topic) => ({
            value: topic.name,
            label: topic.name,
          })) ?? [],
      [topicList, hideInternal]
    );

    const [topicSelectionType, setTopicSelectionType] = useState<CreatableSelectionType>(() => {
      if (selectionMode === 'new') {
        return CreatableSelectionOptions.CREATE;
      }
      if (selectionMode === 'existing') {
        return CreatableSelectionOptions.EXISTING;
      }
      return topicList?.topics?.length === 0 ? CreatableSelectionOptions.CREATE : CreatableSelectionOptions.EXISTING;
    });

    const createTopicMutation = useCreateTopicMutation();

    const isPending = createTopicMutation.isPending;

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
    const form = useForm<AddTopicFormData>({
      resolver: zodResolver(addTopicFormSchema),
      mode: 'onChange',
      defaultValues,
      values: defaultValues,
      resetOptions: { keepDirtyValues: true },
    });

    const watchedTopicName = useWatch({
      control: form.control,
      name: 'topicName',
    });

    useEffect(() => {
      onValidityChange?.(form.formState.isValid);
    }, [form.formState.isValid, onValidityChange]);

    const existingTopicSelected = useMemo(() => {
      // Only check if the CURRENT form topic name matches an existing topic
      if (!watchedTopicName) {
        return;
      }
      return topicList?.topics?.find((topic) => topic.name === watchedTopicName);
    }, [watchedTopicName, topicList]);

    const { data: topicConfig } = useTopicConfigQuery(
      existingTopicSelected?.name || '',
      !isFalsy(existingTopicSelected?.name)
    );

    useEffect(() => {
      if (!existingTopicSelected) {
        return;
      }
      if (topicConfig && !topicConfig.error) {
        const allTopicValues = parseTopicConfigFromExisting(
          {
            topicName: existingTopicSelected.name,
            partitionCount: existingTopicSelected.partitionCount,
            replicationFactor: existingTopicSelected.replicationFactor,
          },
          topicConfig
        );
        // Override the form-level `keepDirtyValues: true` default — when a user
        // selects an existing topic, its config must fully replace any partial
        // input they've made.
        form.reset(allTopicValues, { keepDefaultValues: false, keepDirtyValues: false });
      } else {
        form.setValue('topicName', existingTopicSelected.name, {
          shouldDirty: false,
        });
      }
    }, [existingTopicSelected, topicConfig, form]);

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

          const request = create(CreateTopicRequestSchema, {
            topic: create(CreateTopicRequest_TopicSchema, {
              name: data.topicName,
              partitionCount: data.partitions,
              replicationFactor: data.replicationFactor,
              configs,
            }),
          });

          await createTopicMutation.mutateAsync(request);

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

    const handleTopicSelectionTypeChange = useCallback(
      (value: string) => {
        setTopicSelectionType(value as CreatableSelectionType);
        form.setValue('topicName', '', { shouldDirty: true });
      },
      [form]
    );

    const handleClearTopicName = useCallback(() => {
      form.setValue('topicName', '', { shouldDirty: true });
    }, [form]);

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

    // Show info alert when user types a name that matches an existing topic in "new" mode
    const showExistingTopicAlert =
      topicSelectionType === CreatableSelectionOptions.CREATE && Boolean(existingTopicSelected);

    const formBody = (
      <Form {...form}>
        <div className={inline ? 'flex flex-col gap-5' : 'mt-4 max-w-2xl space-y-6'}>
          <div className="flex flex-col gap-2">
            <FormLabel>Topic name</FormLabel>
            <FormDescription>
              Choose an existing topic to read or write data from, or create a new topic.
            </FormDescription>
            <div className="flex flex-col items-start gap-2">
              {selectionMode === 'both' && (
                <ToggleGroup
                  disabled={isPending}
                  onValueChange={(value) => {
                    // Prevent deselection - ToggleGroup emits empty string when trying to deselect
                    if (!value) {
                      return;
                    }
                    handleTopicSelectionTypeChange(value as CreatableSelectionType);
                  }}
                  type="single"
                  value={topicSelectionType}
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
                              queryClient.invalidateQueries({
                                queryKey: createConnectQueryKey({
                                  schema: listTopics,
                                  cardinality: 'infinite',
                                }),
                              });
                              queryClient.invalidateQueries({
                                queryKey: createConnectQueryKey({
                                  schema: listACLs,
                                  cardinality: 'finite',
                                }),
                              });
                            }}
                            options={topicOptions}
                            placeholder="Select a topic"
                          />
                        ) : (
                          <Input
                            {...field}
                            className="w-[300px]"
                            disabled={isPending}
                            placeholder="Enter a topic name"
                          />
                        )}
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {watchedTopicName && (
                  <Button disabled={isPending} onClick={handleClearTopicName} size="icon" variant="ghost">
                    <XIcon size={16} />
                  </Button>
                )}
              </div>

              {showExistingTopicAlert ? (
                <Alert variant="info">
                  <AlertDescription>
                    A topic named <b>{watchedTopicName}</b> already exists. A reference to the existing topic will be
                    used.
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>
          </div>

          {topicSelectionType === CreatableSelectionOptions.EXISTING && !existingTopicSelected ? null : (
            <div className="flex flex-col">
              <Button
                aria-controls="add-topic-advanced-settings"
                aria-expanded={showAdvancedSettings}
                className="self-start p-0!"
                disabled={isPending}
                onClick={() => setShowAdvancedSettings((prev) => !prev)}
                size="sm"
                type="button"
                variant="ghost"
              >
                <motion.span
                  animate={{ rotate: showAdvancedSettings ? 180 : 0 }}
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
              {showAdvancedSettings ? (
                <div className="space-y-6 pt-4" id="add-topic-advanced-settings">
                  <AdvancedTopicSettings
                    disabled={isPending}
                    form={form}
                    isExistingTopic={Boolean(existingTopicSelected)}
                  />
                </div>
              ) : null}
            </div>
          )}
        </div>
      </Form>
    );

    if (inline) {
      return <div className={className}>{formBody}</div>;
    }

    return (
      <Card size="full" {...motionProps} animated className={className} variant="ghost">
        {!hideTitle && (
          <CardHeader className="max-w-2xl">
            <CardTitle>
              <Heading level={2}>Read or write data from a topic</Heading>
            </CardTitle>
            <CardDescription className="mt-4">
              Select or create a topic to store data for this streaming pipeline. A topic can have multiple clients
              writing data to it (producers) and reading data from it (consumers).
            </CardDescription>
          </CardHeader>
        )}
        <CardContent className="min-h-[300px]">{formBody}</CardContent>
      </Card>
    );
  }
);
