import { zodResolver } from '@hookform/resolvers/zod';
import { Choicebox, ChoiceboxItem, ChoiceboxItemIndicator } from 'components/redpanda-ui/components/choicebox';
import { Form, FormControl, FormField, FormItem, FormMessage } from 'components/redpanda-ui/components/form';
import { Input } from 'components/redpanda-ui/components/input';
import { Tabs, TabsContent, TabsContents, TabsList, TabsTrigger } from 'components/redpanda-ui/components/tabs';
import { Heading, Text } from 'components/redpanda-ui/components/typography';
import { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { useAddDataFormData } from '../../../../state/onboarding-wizard/state';
import type { DataType, StepSubmissionResult } from '../types';
import { type ConnectionType, getConnections } from '../utils/connect';

const tabOptions = [
  { value: 'all', label: 'All' },
  { value: 'databases', label: 'Databases' },
  { value: 'services', label: 'Services' },
  { value: 'ai', label: 'AI' },
  { value: 'apps', label: 'Apps' },
];
type TabOption = (typeof tabOptions)[number]['value'];

const formSchema = z.object({
  connection: z.string().min(1, { message: 'Please select a connection method.' }),
});

export type AddDataFormData = z.infer<typeof formSchema>;

export interface AddDataStepRef {
  triggerSubmit: () => Promise<StepSubmissionResult>;
  isLoading: boolean;
}

export const AddDataStep = forwardRef<AddDataStepRef, { dataType: DataType; additionalConnections?: ConnectionType[] }>(
  ({ dataType, additionalConnections }, ref) => {
    const [filter, setFilter] = useState<string>('');
    const [selectedTab, setSelectedTab] = useState<TabOption>('all');
    const { data: persistedDataFormData, setData: setConnectionData } = useAddDataFormData();

    const form = useForm<AddDataFormData>({
      resolver: zodResolver(formSchema),
      mode: 'onChange',
      defaultValues: {
        connection: persistedDataFormData?.connection || '',
      },
    });

    // Form submission handler
    const handleSubmit = (data: AddDataFormData): StepSubmissionResult => {
      try {
        // Persist connection data to Zustand store
        setConnectionData(data);
        return {
          success: true,
          message: `Connected to ${data.connection} successfully!`,
        };
      } catch (error) {
        return {
          success: false,
          message: 'Failed to save connection data',
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    };

    // Expose methods to parent wizard
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
      isLoading: false, // No async operations with localStorage
    }));

    const connections = useMemo(
      () => [...(additionalConnections?.map((connection) => connection.name) || []), ...getConnections(dataType)],
      [dataType, additionalConnections],
    );

    const filteredConnections = useMemo(
      () => connections.filter((connection) => connection.toLowerCase().includes(filter.toLowerCase())),
      [filter, connections],
    );

    return (
      <Form {...form}>
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-4">
            <Heading level={2}>{dataType === 'source' ? 'Send data to a topic' : 'Read data from a topic'}</Heading>
            <Text>
              {dataType === 'source'
                ? 'Send data to a topic in this cluster from external databases, client applications and other services.'
                : 'Send data from a topic to external databases, client applications and other services.'}
            </Text>
          </div>
          <Input
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setSelectedTab('all');
            }}
            placeholder="Search"
          />
          <FormField
            control={form.control}
            name="connection"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Tabs value={selectedTab} onValueChange={setSelectedTab}>
                    <TabsList variant="underline">
                      {tabOptions.map((option) => (
                        <TabsTrigger variant="underline" value={option.value} key={option.value}>
                          {option.label}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                    <TabsContents>
                      {/* TODO: filter by category */}
                      {tabOptions.map((option) => (
                        <TabsContent value={option.value} key={option.value} className="max-w-full">
                          <Choicebox className="grid-cols-4" value={field.value} onValueChange={field.onChange}>
                            {filteredConnections.map((connection) => (
                              <ChoiceboxItem value={connection} key={connection} className="w-40">
                                <Text className="truncate">{connection}</Text>
                                {field.value === connection && <ChoiceboxItemIndicator />}
                              </ChoiceboxItem>
                            ))}
                          </Choicebox>
                        </TabsContent>
                      ))}
                    </TabsContents>
                  </Tabs>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </Form>
    );
  },
);
