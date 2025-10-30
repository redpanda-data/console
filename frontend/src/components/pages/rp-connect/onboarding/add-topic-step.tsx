import { create } from '@bufbuild/protobuf';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from 'components/redpanda-ui/components/collapsible';
import { Combobox, type ComboboxOption } from 'components/redpanda-ui/components/combobox';
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
import type { MotionProps } from 'motion/react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { isFalsy } from 'utils/falsy';

import { AdvancedTopicSettings } from './advanced-topic-settings';
import {
  CreateTopicRequest_Topic_ConfigSchema,
  CreateTopicRequest_TopicSchema,
  CreateTopicRequestSchema,
  ListTopicsRequestSchema,
} from '../../../../protogen/redpanda/api/dataplane/v1/topic_pb';
import {
  useCreateTopicMutation,
  useLegacyListTopicsQuery,
  useTopicConfigQuery,
} from '../../../../react-query/api/topic';
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

interface AddTopicStepProps {
  defaultTopicName?: string;
}

export const AddTopicStep = forwardRef<BaseStepRef<AddTopicFormData>, AddTopicStepProps & MotionProps>(
  ({ defaultTopicName, ...motionProps }, ref) => {
    const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

    const { data: topicList, refetch: refetchTopics } = useLegacyListTopicsQuery(create(ListTopicsRequestSchema, {}), {
      hideInternalTopics: true,
    });

    const initialTopicOptions = useMemo(
      () =>
        topicList?.topics?.map((topic) => ({
          value: topic.topicName,
          label: topic.topicName,
        })) ?? [],
      [topicList]
    );

    const [topicOptions, setTopicOptions] = useState<ComboboxOption[]>(initialTopicOptions);
    const [topicSelectionType, setTopicSelectionType] = useState<CreatableSelectionType>(
      topicOptions.length === 0 ? CreatableSelectionOptions.CREATE : CreatableSelectionOptions.EXISTING
    );

    const createTopicMutation = useCreateTopicMutation();

    const isLoading = createTopicMutation.isPending;

    // Sync topicOptions when topicList updates
    useEffect(() => {
      setTopicOptions(initialTopicOptions);
    }, [initialTopicOptions]);

    const defaultValues = useMemo(
      () => ({
        ...TOPIC_FORM_DEFAULTS,
        topicName: defaultTopicName || TOPIC_FORM_DEFAULTS.topicName,
      }),
      [defaultTopicName]
    );

    const form = useForm<AddTopicFormData>({
      resolver: zodResolver(addTopicFormSchema),
      mode: 'onChange',
      defaultValues,
    });

    const watchedTopicName = form.watch('topicName');

    const existingTopicSelected = useMemo(() => {
      // Only check if the CURRENT form topic name matches an existing topic
      if (!watchedTopicName) {
        return undefined;
      }
      return topicList?.topics?.find((topic) => topic.topicName === watchedTopicName);
    }, [watchedTopicName, topicList]);

    const { data: topicConfig } = useTopicConfigQuery(
      existingTopicSelected?.topicName || '',
      !isFalsy(existingTopicSelected?.topicName)
    );

    useEffect(() => {
      if (existingTopicSelected) {
        if (topicConfig && !topicConfig.error) {
          const allTopicValues = parseTopicConfigFromExisting(existingTopicSelected, topicConfig);
          form.reset(allTopicValues, { keepDefaultValues: false });
        } else {
          form.setValue('topicName', existingTopicSelected.topicName, {
            shouldDirty: false,
          });
        }
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

          return {
            success: true,
            message: `Created topic "${data.topicName}" successfully!`,
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
      [existingTopicSelected, createTopicMutation]
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
      triggerSubmit: async () => {
        const isValid = await form.trigger();
        if (isValid) {
          const data = form.getValues();
          return handleSubmit(data);
        }
        return {
          success: false,
          message: 'Please fix the form errors before proceeding',
          error: 'Form validation failed',
        };
      },
      isLoading,
    }));

    return (
      <Card size="full" {...motionProps} animated>
        <CardHeader className="max-w-2xl">
          <CardTitle>
            <Heading level={2}>Read or write data from a topic</Heading>
          </CardTitle>
          <CardDescription className="mt-4">
            Select or create a topic to store data for this streaming pipeline. A topic can have multiple clients
            writing data to it (producers) and reading data from it (consumers).
          </CardDescription>
        </CardHeader>
        <CardContent className="min-h-[300px]">
          <Form {...form}>
            <div className="mt-4 max-w-2xl space-y-6">
              <div className="flex flex-col gap-2">
                <FormLabel>Topic name</FormLabel>
                <FormDescription>
                  Choose an existing topic to read or write data from, or create a new topic.
                </FormDescription>
                <div className="flex flex-col items-start gap-2">
                  <ToggleGroup
                    defaultValue={topicSelectionType}
                    disabled={isLoading}
                    onValueChange={(value) => handleTopicSelectionTypeChange(value as CreatableSelectionType)}
                    type="single"
                    variant="outline"
                  >
                    <ToggleGroupItem
                      disabled={topicOptions.length === 0}
                      id={CreatableSelectionOptions.EXISTING}
                      value={CreatableSelectionOptions.EXISTING}
                    >
                      Existing
                    </ToggleGroupItem>
                    <ToggleGroupItem id={CreatableSelectionOptions.CREATE} value={CreatableSelectionOptions.CREATE}>
                      New
                    </ToggleGroupItem>
                  </ToggleGroup>

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
                                disabled={isLoading}
                                onOpen={() => refetchTopics()}
                                options={topicOptions}
                                placeholder="Select a topic"
                              />
                            ) : (
                              <Input
                                {...field}
                                className="w-[300px]"
                                disabled={isLoading}
                                placeholder="Enter a topic name"
                              />
                            )}
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {watchedTopicName !== '' && watchedTopicName.length > 0 && (
                      <Button disabled={isLoading} onClick={handleClearTopicName} size="icon" variant="ghost">
                        <XIcon size={16} />
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {topicSelectionType === CreatableSelectionOptions.EXISTING && !existingTopicSelected ? null : (
                <Collapsible onOpenChange={setShowAdvancedSettings} open={showAdvancedSettings}>
                  <CollapsibleTrigger asChild>
                    <Button className="w-fit p-0" disabled={isLoading} size="sm" variant="ghost">
                      <ChevronDown className="h-4 w-4" />
                      Show advanced settings
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-4 space-y-6">
                    <AdvancedTopicSettings
                      disabled={isLoading}
                      form={form}
                      isExistingTopic={Boolean(existingTopicSelected)}
                    />
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          </Form>
        </CardContent>
      </Card>
    );
  }
);
