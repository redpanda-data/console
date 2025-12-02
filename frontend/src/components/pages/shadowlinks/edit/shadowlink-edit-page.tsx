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
import { type FieldMask, FieldMaskSchema } from '@bufbuild/protobuf/wkt';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from 'components/redpanda-ui/components/button';
import { Form } from 'components/redpanda-ui/components/form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from 'components/redpanda-ui/components/tabs';
import { Heading, Text } from 'components/redpanda-ui/components/typography';
import type { ShadowLink } from 'protogen/redpanda/api/dataplane/v1alpha3/shadowlink_pb';
import {
  ShadowLinkConfigurationsSchema,
  ShadowLinkSchema,
  UpdateShadowLinkRequestSchema,
} from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { useEffect, useState } from 'react';
import { type FieldErrors, useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { uiState } from 'state/ui-state';

import { ShadowingTab } from './shadowing-tab';
import {
  buildDefaultACLsValues,
  buildDefaultConnectionValues,
  buildDefaultConsumerGroupsValues,
  buildDefaultTopicsValues,
  getUpdateValuesForACLs,
  getUpdateValuesForConnection,
  getUpdateValuesForConsumerGroups,
  getUpdateValuesForSchemaRegistry,
  getUpdateValuesForTopics,
} from './shadowlink-edit-utils';
import { SourceTab } from './source-tab';
import { TopicConfigTab } from './topic-config-tab';
import { useGetShadowLinkQuery, useUpdateShadowLinkMutation } from '../../../../react-query/api/shadowlink';
import { FormSchema, type FormValues } from '../create/model';

/**
 * Transform form values to UpdateShadowLinkRequest protobuf message
 * Only includes fields that have changed from the original shadow link
 */
const buildUpdateShadowLinkRequest = (
  name: string,
  values: FormValues,
  originalShadowLink: Exclude<NonNullable<ReturnType<typeof useGetShadowLinkQuery>['data']>['shadowLink'], undefined>
) => {
  // Build original form values for comparison
  const originalValues = buildDefaultFormValues(originalShadowLink);

  // Get update values for all categories
  const connectionUpdate = getUpdateValuesForConnection(values, originalValues);
  const topicsUpdate = getUpdateValuesForTopics(values, originalValues);
  const consumerGroupsUpdate = getUpdateValuesForConsumerGroups(values, originalValues);
  const aclsUpdate = getUpdateValuesForACLs(values, originalValues);
  const schemaRegistryUpdate = getUpdateValuesForSchemaRegistry(values, originalValues);

  // Build configurations with all category values
  const configurations = create(ShadowLinkConfigurationsSchema, {
    clientOptions: connectionUpdate.value,
    topicMetadataSyncOptions: topicsUpdate.value,
    consumerOffsetSyncOptions: consumerGroupsUpdate.value,
    securitySyncOptions: aclsUpdate.value,
    schemaRegistrySyncOptions: schemaRegistryUpdate.value,
  });

  // Build shadow link
  const shadowLink = create(ShadowLinkSchema, {
    name,
    configurations,
  });

  // Build field mask with all changed field paths from all categories
  const updateMask: FieldMask = create(FieldMaskSchema, {
    paths: [
      ...connectionUpdate.fieldMaskPaths,
      ...topicsUpdate.fieldMaskPaths,
      ...consumerGroupsUpdate.fieldMaskPaths,
      ...aclsUpdate.fieldMaskPaths,
      ...schemaRegistryUpdate.fieldMaskPaths,
    ],
  });

  // Build final request
  return create(UpdateShadowLinkRequestSchema, {
    shadowLink,
    updateMask,
  });
};

/**
 * Build default form values from existing shadow link data
 * Orchestrates category-specific builders
 */
const buildDefaultFormValues = (shadowLink: ShadowLink): FormValues => {
  const connectionValues = buildDefaultConnectionValues(shadowLink);
  const topicsValues = buildDefaultTopicsValues(shadowLink);
  const consumerGroupsValues = buildDefaultConsumerGroupsValues(shadowLink);
  const aclsValues = buildDefaultACLsValues(shadowLink);

  // Check if schema registry sync is enabled
  const schemaRegistrySyncOptions = shadowLink.configurations?.schemaRegistrySyncOptions;
  const enableSchemaRegistrySync =
    schemaRegistrySyncOptions?.schemaRegistryShadowingMode?.case === 'shadowSchemaRegistryTopic';

  return {
    name: shadowLink.name || '',
    ...connectionValues,
    ...topicsValues,
    ...consumerGroupsValues,
    ...aclsValues,
    enableSchemaRegistrySync,
  };
};

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
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();

  if (!name) {
    throw new Error('Shadow link name is required');
  }

  const { data: shadowLinkData, isLoading } = useGetShadowLinkQuery({ name });
  const shadowLink = shadowLinkData?.shadowLink;

  const { mutateAsync: updateShadowLink, isPending: isUpdating } = useUpdateShadowLinkMutation({
    onSuccess: () => {
      toast.success('Shadow link updated successfully');
      navigate(`/shadowlinks/${name}`);
    },
    onError: (error) => {
      toast.error('Shadow link update failed', {
        description: error.message,
      });
    },
  });

  // Track current active tab
  const [currentTab, setCurrentTab] = useState<string>('source');

  // Initialize form with values that automatically update when shadowLink data changes
  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    values: shadowLink ? buildDefaultFormValues(shadowLink) : undefined,
    mode: 'onChange',
  });

  const onSubmit = (values: FormValues) => {
    if (!shadowLink) {
      return; // Guard clause - should never happen since form is only rendered when shadowLink exists
    }
    const request = buildUpdateShadowLinkRequest(name, values, shadowLink);
    void updateShadowLink(request);
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

  if (!(isLoading || shadowLink)) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8">
        <Text variant="large">Shadow link not found</Text>
        <Button onClick={() => navigate('/shadowlinks')} variant="secondary">
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
            <Button disabled={isUpdating} type="submit" variant="default">
              Save
            </Button>
            <Button onClick={() => navigate(`/shadowlinks/${name}`)} type="button" variant="outline">
              Cancel
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
};
