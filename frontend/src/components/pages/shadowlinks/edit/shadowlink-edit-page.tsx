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

import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useParams } from '@tanstack/react-router';
import { Button } from 'components/redpanda-ui/components/button';
import { Form } from 'components/redpanda-ui/components/form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from 'components/redpanda-ui/components/tabs';
import { Heading, Text } from 'components/redpanda-ui/components/typography';
import { useEffect, useState } from 'react';
import { type FieldErrors, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { uiState } from 'state/ui-state';

import { ShadowingTab } from './shadowing-tab';
import { SourceTab } from './source-tab';
import { TopicConfigTab } from './topic-config-tab';
import { useEditShadowLink } from '../../../../react-query/api/shadowlink';
import { FormSchema, type FormValues } from '../create/model';

/**
 * Map form field to its corresponding tab
 */
const getTabForField = (fieldName: string): string => {
  const fieldToTabMap: Record<string, string> = {
    // Source tab fields
    name: 'source',
    bootstrapServers: 'source',
    useScram: 'source',
    scramCredentials: 'source',
    advanceClientOptions: 'source',
    useTls: 'source',
    mtls: 'source',
    mtlsMode: 'source',
    // Shadowing tab fields
    topicsMode: 'shadowing',
    topics: 'shadowing',
    consumersMode: 'shadowing',
    consumers: 'shadowing',
    aclsMode: 'shadowing',
    aclFilters: 'shadowing',
    enableSchemaRegistrySync: 'shadowing',
    // Topic config tab fields
    topicProperties: 'topic-config',
    excludeDefault: 'topic-config',
  };

  return fieldToTabMap[fieldName] || 'source';
};

/**
 * Display names for tabs used in error messages
 */
const tabDisplayNames: Record<string, string> = {
  source: 'Source',
  shadowing: 'Shadowing',
  'topic-config': 'Topic config',
  all: 'All',
};

export const ShadowLinkEditPage = () => {
  const { name } = useParams({ from: '/shadowlinks/$name/edit' });
  const navigate = useNavigate();

  if (!name) {
    throw new Error('Shadow link name is required');
  }

  // Use the unified edit hook that handles embedded/dataplane logic
  const { formValues, isLoading, isUpdating, hasData, updateShadowLink, dataplaneUpdate, controlplaneUpdate } =
    useEditShadowLink(name);

  // Set up mutation callbacks
  useEffect(() => {
    const unsubscribeDataplane = dataplaneUpdate.reset;
    const unsubscribeControlplane = controlplaneUpdate.reset;

    return () => {
      unsubscribeDataplane?.();
      unsubscribeControlplane?.();
    };
  }, [dataplaneUpdate.reset, controlplaneUpdate.reset]);

  // Handle success/error for mutations
  useEffect(() => {
    if (dataplaneUpdate.isSuccess || controlplaneUpdate.isSuccess) {
      toast.success('Shadow link updated successfully');
      navigate({ to: `/shadowlinks/${name}` });
    }
  }, [dataplaneUpdate.isSuccess, controlplaneUpdate.isSuccess, navigate, name]);

  useEffect(() => {
    const error = dataplaneUpdate.error || controlplaneUpdate.error;
    if (error) {
      toast.error('Shadow link update failed', {
        description: error.message,
      });
    }
  }, [dataplaneUpdate.error, controlplaneUpdate.error]);

  // Track current active tab
  const [currentTab, setCurrentTab] = useState<string>('source');

  // Initialize form with values that automatically update when shadowLink data changes
  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    values: formValues,
    mode: 'onChange',
  });

  const onSubmit = async (values: FormValues) => {
    await updateShadowLink(values);
  };

  /**
   * Handle validation errors on form submit
   * Navigate to the tab containing the first error
   */
  const onValidationError = (errors: FieldErrors<FormValues>) => {
    // Find the first field with an error
    const firstErrorField = Object.keys(errors)[0];

    if (firstErrorField) {
      // Get the tab that contains this field
      const errorTab = getTabForField(firstErrorField);

      // Navigate to that tab
      setCurrentTab(errorTab);

      // Get error count
      const errorCount = Object.keys(errors).length;

      // Format tab name for display
      const tabName = tabDisplayNames[errorTab] || errorTab;

      // Show toast notification with tab information
      toast.error(`Found ${errorCount} validation ${errorCount === 1 ? 'error' : 'errors'}`, {
        description: `Navigated to ${tabName} tab`,
        testId: 'validation-error-toast',
      });
    }
  };

  useEffect(() => {
    if (name) {
      uiState.pageTitle = `Edit Shadow Link: ${name}`;
      uiState.pageBreadcrumbs = [
        { title: 'Shadow Links', linkTo: '/shadowlinks' },
        { title: name, linkTo: `/shadowlinks/${name}` },
        { title: 'Edit', linkTo: `/shadowlinks/${name}/edit` },
      ];
    }
  }, [name]);

  if (!(isLoading || hasData)) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8">
        <Text variant="large">Shadow link not found</Text>
        <Button onClick={() => navigate({ to: '/shadowlinks' })} variant="secondary">
          Back to Shadow Links
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="space-y-2">
        <Heading level={1}>Edit shadow link</Heading>
        <Text variant="muted">Update shadow link configuration for disaster recovery replication.</Text>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit, onValidationError)}>
          <Tabs onValueChange={setCurrentTab} value={currentTab}>
            <TabsList>
              <TabsTrigger data-testid="tab-all" value="all">
                All
              </TabsTrigger>
              <TabsTrigger data-testid="tab-source" value="source">
                Source
              </TabsTrigger>
              <TabsTrigger data-testid="tab-shadowing" value="shadowing">
                Shadowing
              </TabsTrigger>
              <TabsTrigger data-testid="tab-topic-config" value="topic-config">
                Topic properties shadowed
              </TabsTrigger>
            </TabsList>

            <TabsContent value="all">
              <div className="space-y-4">
                <SourceTab />
                <ShadowingTab />
                <TopicConfigTab />
              </div>
            </TabsContent>

            <TabsContent value="source">
              <SourceTab />
            </TabsContent>

            <TabsContent value="shadowing">
              <ShadowingTab />
            </TabsContent>

            <TabsContent value="topic-config">
              <TopicConfigTab />
            </TabsContent>
          </Tabs>

          <div className="mt-6 flex gap-2">
            <Button disabled={isUpdating} type="submit">
              Save
            </Button>
            <Button onClick={() => navigate({ to: `/shadowlinks/${name}` })} type="button" variant="outline">
              Cancel
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
};
