import { create } from '@bufbuild/protobuf';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from 'components/redpanda-ui/components/collapsible';
import { Combobox, type ComboboxOption } from 'components/redpanda-ui/components/combobox';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from 'components/redpanda-ui/components/form';
import { Heading } from 'components/redpanda-ui/components/typography';
import { ChevronDown } from 'lucide-react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { Topic } from 'state/rest-interfaces';
import { isFalsy } from 'utils/falsy';

import { AdvancedTopicSettings } from './advanced-topic-settings';
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
  type StepSubmissionResult,
} from '../types/wizard';
import { isUsingDefaultRetentionSettings, parseTopicConfigFromExisting, TOPIC_FORM_DEFAULTS } from '../utils/topic';

interface AddTopicStepProps {
  topicList: Topic[] | undefined;
  defaultTopicName?: string;
}

export const AddTopicStep = forwardRef<BaseStepRef<AddTopicFormData>, AddTopicStepProps>(
  ({ topicList, defaultTopicName }, ref) => {
    const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

    const initialTopicOptions = useMemo(
      () =>
        topicList?.map((topic) => ({
          value: topic.topicName,
          label: topic.topicName,
        })) ?? [],
      [topicList]
    );

    const [topicOptions, setTopicOptions] = useState<ComboboxOption[]>(initialTopicOptions);

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

    const existingTopicBeingEdited = useMemo(() => {
      // Only check if the CURRENT form topic name matches an existing topic
      if (!watchedTopicName) {
        return undefined;
      }
      return topicList?.find((topic) => topic.topicName === watchedTopicName);
    }, [watchedTopicName, topicList]);

    const { data: topicConfig } = useTopicConfigQuery(
      existingTopicBeingEdited?.topicName || '',
      !isFalsy(existingTopicBeingEdited?.topicName)
    );

    useEffect(() => {
      if (existingTopicBeingEdited) {
        if (topicConfig && !topicConfig.error) {
          const allTopicValues = parseTopicConfigFromExisting(existingTopicBeingEdited, topicConfig);
          form.reset(allTopicValues, { keepDefaultValues: false });
        } else {
          form.setValue('topicName', existingTopicBeingEdited.topicName, {
            shouldDirty: false,
          });
        }
      }
    }, [existingTopicBeingEdited, topicConfig, form]);

    const handleSubmit = useCallback(
      async (data: AddTopicFormData): Promise<StepSubmissionResult<AddTopicFormData>> => {
        try {
          if (existingTopicBeingEdited) {
            // Topic already exists - fields are readonly so no backend changes needed
            // Just return success with data so parent can update session storage
            return {
              success: true,
              message: `Using existing topic "${data.topicName}"`,
              data,
            };
          }

          // This is a new topic, create it with React Query optimistic updates
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

          // React Query will handle optimistic updates automatically
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
      [existingTopicBeingEdited, createTopicMutation]
    );

    const handleCreateTopicOption = useCallback((value: string) => {
      setTopicOptions((prev) => [...prev, { value, label: value }]);
    }, []);

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
      <Card size="full">
        <CardHeader className="max-w-2xl">
          <CardTitle>
            <Heading level={2}>Select a topic to send data to</Heading>
          </CardTitle>
          <CardDescription className="mt-4">
            A topic is where data is sent and received in a Kafka-based system. Think of it as a streaming inbox for
            your data. Producers write data to a topic, and consumers read from it. You need to create a topic to
            organize and manage your real-time data streams, whether it's logs, events, or messages. Without a topic,
            there's nowhere for your data to go or be retrieved from.
          </CardDescription>
        </CardHeader>
        <CardContent className="max-h-[50vh] min-h-[400px] overflow-y-auto">
          <Form {...form}>
            <div className="max-w-2xl space-y-6">
              <FormField
                control={form.control}
                name="topicName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Topic Name</FormLabel>
                    <FormControl>
                      <Combobox
                        {...field}
                        className="max-w-[300px]"
                        creatable
                        disabled={isLoading}
                        onCreateOption={handleCreateTopicOption}
                        options={topicOptions}
                        placeholder="Select or create a topic..."
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Collapsible onOpenChange={setShowAdvancedSettings} open={showAdvancedSettings}>
                <CollapsibleTrigger asChild>
                  <Button className="w-fit p-0" disabled={isLoading} size="sm" variant="ghost">
                    <ChevronDown className="h-4 w-4" />
                    Show Advanced Settings
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-4 space-y-6">
                  <AdvancedTopicSettings
                    disabled={isLoading}
                    form={form}
                    isExistingTopic={Boolean(existingTopicBeingEdited)}
                  />
                </CollapsibleContent>
              </Collapsible>
            </div>
          </Form>
        </CardContent>
      </Card>
    );
  }
);
