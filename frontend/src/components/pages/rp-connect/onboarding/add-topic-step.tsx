import { create } from '@bufbuild/protobuf';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from 'components/redpanda-ui/components/collapsible';
import { Combobox, type ComboboxOption } from 'components/redpanda-ui/components/combobox';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from 'components/redpanda-ui/components/form';
import { Heading } from 'components/redpanda-ui/components/typography';
import { useSessionStorage } from 'hooks/use-session-storage';
import { ChevronDown } from 'lucide-react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { CONNECT_WIZARD_TOPIC_KEY } from 'state/connect/state';
import type { Topic } from 'state/rest-interfaces';
import { isFalsy } from 'utils/falsy';

import { AdvancedTopicSettings } from './advanced-topic-settings';
import {
  CreateTopicRequest_Topic_ConfigSchema,
  CreateTopicRequest_TopicSchema,
  CreateTopicRequestSchema,
} from '../../../../protogen/redpanda/api/dataplane/v1/topic_pb';
import {
  useCreateTopicMutation,
  useTopicConfigQuery,
  useUpdateTopicConfigMutation,
} from '../../../../react-query/api/topic';
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
}

export const AddTopicStep = forwardRef<BaseStepRef, AddTopicStepProps>(({ topicList }, ref) => {
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
  const updateTopicConfigMutation = useUpdateTopicConfigMutation();

  const isLoading = createTopicMutation.isPending || updateTopicConfigMutation.isPending;

  // Sync topicOptions when topicList updates
  useEffect(() => {
    setTopicOptions(initialTopicOptions);
  }, [initialTopicOptions]);

  // previous form values for topic within this wizard session
  const [persistedTopicData, setTopicFormData] = useSessionStorage<AddTopicFormData>(CONNECT_WIZARD_TOPIC_KEY);

  const defaultValues = useMemo(
    () => ({
      ...TOPIC_FORM_DEFAULTS,
      topicName: persistedTopicData?.topicName || TOPIC_FORM_DEFAULTS.topicName,
      partitions: persistedTopicData?.partitions || TOPIC_FORM_DEFAULTS.partitions,
      replicationFactor: persistedTopicData?.replicationFactor || TOPIC_FORM_DEFAULTS.replicationFactor,
      retentionTimeMs: persistedTopicData?.retentionTimeMs || TOPIC_FORM_DEFAULTS.retentionTimeMs,
      retentionTimeUnit: persistedTopicData?.retentionTimeUnit || TOPIC_FORM_DEFAULTS.retentionTimeUnit,
      retentionSize: persistedTopicData?.retentionSize || TOPIC_FORM_DEFAULTS.retentionSize,
      retentionSizeUnit: persistedTopicData?.retentionSizeUnit || TOPIC_FORM_DEFAULTS.retentionSizeUnit,
    }),
    [persistedTopicData]
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
        form.reset(allTopicValues);
      } else {
        form.setValue('topicName', existingTopicBeingEdited.topicName, {
          shouldDirty: false,
        });
      }
    }
  }, [existingTopicBeingEdited, topicConfig, form]);

  const handleSubmit = useCallback(
    async (data: AddTopicFormData): Promise<StepSubmissionResult> => {
      try {
        // Always persist form data for wizard navigation
        setTopicFormData(data);

        if (existingTopicBeingEdited) {
          // Topic already exists - check if advanced settings were modified
          const hasRetentionChanges = !isUsingDefaultRetentionSettings(data);

          if (hasRetentionChanges) {
            // Build configuration updates for React Query mutation
            const configs: Array<{ key: string; op: 'SET'; value: string }> = [];

            // Convert retention time
            const retentionMs = convertRetentionTimeToMs(data.retentionTimeMs, data.retentionTimeUnit);
            configs.push({
              key: 'retention.ms',
              op: 'SET' as const,
              value: retentionMs.toString(),
            });

            // Convert retention size
            const retentionBytes = convertRetentionSizeToBytes(data.retentionSize, data.retentionSizeUnit);
            configs.push({
              key: 'retention.bytes',
              op: 'SET' as const,
              value: retentionBytes.toString(),
            });

            // Use React Query mutation with optimistic updates
            await updateTopicConfigMutation.mutateAsync({
              topicName: data.topicName,
              configs,
            });

            return {
              success: true,
              message: `Updated topic "${data.topicName}" configuration successfully!`,
            };
          }

          return {
            success: true,
            message: `Using existing topic "${data.topicName}"`,
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
        };
      } catch (error) {
        return {
          success: false,
          message: 'Failed to save topic configuration',
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
    [existingTopicBeingEdited, setTopicFormData, updateTopicConfigMutation, createTopicMutation]
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
        <CardDescription>
          A topic is where data is sent and received in a Kafka-based system. Think of it as a streaming inbox for your
          data. Producers write data to a topic, and consumers read from it. You need to create a topic to organize and
          manage your real-time data streams, whether it's logs, events, or messages. Without a topic, there's nowhere
          for your data to go or be retrieved from.
        </CardDescription>
      </CardHeader>
      <CardContent>
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
});
