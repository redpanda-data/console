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

'use client';

import { create } from '@bufbuild/protobuf';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from 'components/redpanda-ui/components/button';
import { Form } from 'components/redpanda-ui/components/form';
import { defineStepper } from 'components/redpanda-ui/components/stepper';
import { Heading, Text } from 'components/redpanda-ui/components/typography';
import { ArrowLeft, Link2, Loader2, Settings, Shield, Users } from 'lucide-react';
import { runInAction } from 'mobx';
import {
  ACLAccessFilterSchema,
  ACLFilterSchema,
  ACLResourceFilterSchema,
  AuthenticationConfigurationSchema,
  ConsumerOffsetSyncOptionsSchema,
  CreateShadowLinkRequestSchema,
  FilterType,
  NameFilterSchema,
  PatternType,
  ScramConfigSchema,
  ScramMechanism,
  SecuritySettingsSyncOptionsSchema,
  ShadowLinkClientOptionsSchema,
  ShadowLinkConfigurationsSchema,
  ShadowLinkSchema,
  TLSFileSettingsSchema,
  TLSPEMSettingsSchema,
  TopicMetadataSyncOptionsSchema,
} from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { ACLOperation, ACLPattern, ACLPermissionType, ACLResource } from 'protogen/redpanda/core/common/acl_pb';
import React, { useEffect, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useCreateShadowLinkMutation } from 'react-query/api/shadowlink';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { uiState } from 'state/ui-state';

import { AclsStep } from './acls-step';
import { ConnectionStep } from './connection-step';
import { ConsumerOffsetStep } from './consumer-offset-step';
import { FormSchema, type FormValues, initialValues, TLS_MODE } from './schemas';
import { TopicsStep } from './topics-step';

// Stepper definition
const { Stepper } = defineStepper(
  {
    id: 'connection',
    title: 'Connection',
    description: 'Configure source cluster',
    icon: <Link2 className="h-4 w-4" />,
  },
  {
    id: 'topics',
    title: 'Topics',
    description: 'Select topics to mirror',
    icon: <Settings className="h-4 w-4" />,
  },
  {
    id: 'acls',
    title: 'ACLs',
    description: 'Select ACLs to mirror',
    icon: <Shield className="h-4 w-4" />,
  },
  {
    id: 'consumer-offsets',
    title: 'Consumer Groups',
    description: 'Sync consumer groups',
    icon: <Users className="h-4 w-4" />,
  }
);

// Update page title using uiState pattern
export const updatePageTitle = () => {
  runInAction(() => {
    uiState.pageTitle = 'Create Shadow Link';
    uiState.pageBreadcrumbs = [
      { title: 'Shadow Links', linkTo: '/shadowlinks' },
      { title: 'Create', linkTo: '/shadowlinks/create' },
    ];
  });
};

export const ShadowLinkCreatePage = () => {
  const navigate = useNavigate();
  const [showPemPaste, setShowPemPaste] = useState(false);

  const { mutateAsync: createShadowLink, isPending: isCreating } = useCreateShadowLinkMutation({
    onSuccess: () => {
      toast.success('Shadow link created successfully');
      navigate('/shadowlinks');
    },
  });

  // Form setup
  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: initialValues,
    mode: 'onChange',
  });

  const {
    fields: bootstrapServerFields,
    append: appendBootstrapServer,
    remove: removeBootstrapServer,
  } = useFieldArray({
    control: form.control,
    name: 'bootstrapServers',
  });

  const {
    fields: topicPropertiesFields,
    append: appendTopicProperty,
    remove: removeTopicProperty,
  } = useFieldArray({
    control: form.control,
    name: 'topicProperties',
  });

  const {
    fields: aclFiltersFields,
    append: appendAclFilter,
    remove: removeAclFilter,
  } = useFieldArray({
    control: form.control,
    name: 'aclFilters',
  });

  useEffect(() => {
    updatePageTitle();
  }, []);

  const handleNext = async (currentStep: string, goNext: () => void) => {
    if (currentStep === 'connection') {
      // Validate connection step fields
      const valid = await form.trigger([
        'name',
        'bootstrapServers',
        'useScram',
        'scramUsername',
        'scramPassword',
        'scramMechanism',
        'useTls',
        'tlsMode',
        'tlsCaPath',
        'tlsKeyPath',
        'tlsCertPath',
        'tlsCaPem',
        'tlsKeyPem',
        'tlsCertPem',
      ]);
      if (!valid) {
        return;
      }
      goNext();
    } else if (currentStep === 'topics') {
      // Validate topics step fields
      const valid = await form.trigger([
        'includeAllTopics',
        'listSpecificTopics',
        'specificTopicNames',
        'includeTopicPrefix',
        'includePrefix',
        'excludeTopicPrefix',
        'excludePrefix',
      ]);
      if (!valid) {
        return;
      }
      goNext();
    } else if (currentStep === 'acls') {
      // ACLs are optional, always allow next
      goNext();
    }
  };

  const onSubmit = async (values: FormValues) => {
    try {
      // Build the shadow link configuration
      const clientOptions = create(ShadowLinkClientOptionsSchema, {
        bootstrapServers: values.bootstrapServers.filter((s) => s.trim()),
        clientId: '', // Optional, can be added later
        sourceClusterId: '', // Optional, can be added later
      });

      // Build authentication configuration if SCRAM is enabled
      const authenticationConfiguration = values.useScram
        ? create(AuthenticationConfigurationSchema, {
            authentication: {
              case: 'scramConfiguration',
              value: create(ScramConfigSchema, {
                username: values.scramUsername || '',
                password: values.scramPassword || '',
                scramMechanism: values.scramMechanism || ScramMechanism.SCRAM_SHA_256,
                passwordSet: true,
              }),
            },
          })
        : undefined;

      // Build TLS configuration if enabled
      let tlsFileSettings;
      let tlsPemSettings;

      if (values.useTls) {
        if (values.tlsMode === TLS_MODE.FILE_PATH) {
          tlsFileSettings = create(TLSFileSettingsSchema, {
            caPath: values.tlsCaPath || '',
            keyPath: values.tlsKeyPath || '',
            certPath: values.tlsCertPath || '',
          });
        } else {
          tlsPemSettings = create(TLSPEMSettingsSchema, {
            ca: values.tlsCaPem || '',
            key: values.tlsKeyPem || '',
            cert: values.tlsCertPem || '',
          });
        }
      }

      // Build topic filters from form selections
      const topicFilters = [];
      if (values.includeAllTopics) {
        topicFilters.push(
          create(NameFilterSchema, {
            patternType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
            name: '*',
          })
        );
      }
      if (values.listSpecificTopics && values.specificTopicNames) {
        const topics = values.specificTopicNames
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);
        for (const topic of topics) {
          topicFilters.push(
            create(NameFilterSchema, {
              patternType: PatternType.LITERAL,
              filterType: FilterType.INCLUDE,
              name: topic,
            })
          );
        }
      }
      if (values.includeTopicPrefix && values.includePrefix) {
        topicFilters.push(
          create(NameFilterSchema, {
            patternType: PatternType.PREFIX,
            filterType: FilterType.INCLUDE,
            name: values.includePrefix,
          })
        );
      }
      if (values.excludeTopicPrefix && values.excludePrefix) {
        topicFilters.push(
          create(NameFilterSchema, {
            patternType: PatternType.PREFIX,
            filterType: FilterType.EXCLUDE,
            name: values.excludePrefix,
          })
        );
      }

      // Build topic metadata sync options
      const topicMetadataSyncOptions = create(TopicMetadataSyncOptionsSchema, {
        autoCreateShadowTopicFilters: topicFilters,
        shadowedTopicProperties: values.topicProperties?.filter((p) => p.trim()) || [],
        interval: { seconds: '30' },
      });

      // Build ACL filters from form
      const aclFilters = (values.aclFilters || []).map((filter) =>
        create(ACLFilterSchema, {
          resourceFilter: create(ACLResourceFilterSchema, {
            resourceType: filter.resourceType ?? ACLResource.ACL_RESOURCE_ANY,
            patternType: filter.resourcePattern ?? ACLPattern.ACL_PATTERN_ANY,
            name: filter.resourceName || '*',
          }),
          accessFilter: create(ACLAccessFilterSchema, {
            principal: filter.principal || '',
            operation: filter.operation ?? ACLOperation.ACL_OPERATION_ANY,
            permissionType: filter.permissionType ?? ACLPermissionType.ACL_PERMISSION_TYPE_ALLOW,
            host: filter.host || '*',
          }),
        })
      );

      // Build security sync options
      const securitySyncOptions = create(SecuritySettingsSyncOptionsSchema, {
        aclFilters,
        roleFilters: [],
        scramCredFilters: [],
        enabled: aclFilters.length > 0,
        interval: { seconds: '30' },
      });

      // Build consumer group filters from form selections
      const groupFilters = [];
      if (values.enableConsumerOffsetSync) {
        if (values.includeAllGroups) {
          groupFilters.push(
            create(NameFilterSchema, {
              patternType: PatternType.LITERAL,
              filterType: FilterType.INCLUDE,
              name: '*',
            })
          );
        }
        if (values.listSpecificGroups && values.specificGroupNames) {
          const groups = values.specificGroupNames
            .split(',')
            .map((g) => g.trim())
            .filter(Boolean);
          for (const group of groups) {
            groupFilters.push(
              create(NameFilterSchema, {
                patternType: PatternType.LITERAL,
                filterType: FilterType.INCLUDE,
                name: group,
              })
            );
          }
        }
        if (values.includeGroupPrefix && values.includeGroupPrefixValue) {
          groupFilters.push(
            create(NameFilterSchema, {
              patternType: PatternType.PREFIX,
              filterType: FilterType.INCLUDE,
              name: values.includeGroupPrefixValue,
            })
          );
        }
        if (values.excludeGroupPrefix && values.excludeGroupPrefixValue) {
          groupFilters.push(
            create(NameFilterSchema, {
              patternType: PatternType.PREFIX,
              filterType: FilterType.EXCLUDE,
              name: values.excludeGroupPrefixValue,
            })
          );
        }
      }

      // Build consumer offset sync options
      const consumerOffsetSyncOptions = create(ConsumerOffsetSyncOptionsSchema, {
        groupFilters,
        enabled: values.enableConsumerOffsetSync,
        interval: { seconds: String(values.consumerOffsetSyncInterval || 30) },
      });

      const configurations = create(ShadowLinkConfigurationsSchema, {
        clientOptions,
        authenticationConfiguration,
        tlsFileSettings,
        tlsPemSettings,
        topicMetadataSyncOptions,
        securitySyncOptions,
        consumerOffsetSyncOptions,
      });

      const shadowLink = create(ShadowLinkSchema, {
        name: values.name.trim(),
        configurations,
      });

      await createShadowLink(
        create(CreateShadowLinkRequestSchema, {
          shadowLink,
        })
      );
    } catch (_error) {}
  };

  // Check if connection step has errors
  const hasConnectionErrors =
    !!form.formState.errors.name ||
    !!form.formState.errors.bootstrapServers ||
    !!form.formState.errors.useScram ||
    !!form.formState.errors.scramUsername ||
    !!form.formState.errors.scramPassword ||
    !!form.formState.errors.scramMechanism ||
    !!form.formState.errors.useTls ||
    !!form.formState.errors.tlsCaPath ||
    !!form.formState.errors.tlsCaPem;

  // Check if topics step has errors
  const hasTopicErrors =
    !!form.formState.errors.topicSelection ||
    !!form.formState.errors.specificTopicNames ||
    !!form.formState.errors.includePrefix ||
    !!form.formState.errors.excludePrefix;

  // Check if ACLs step has errors
  const hasAclErrors = !!form.formState.errors.aclFilters;

  // Check if consumer offset step has errors
  const hasConsumerOffsetErrors =
    !!form.formState.errors.groupSelection ||
    !!form.formState.errors.specificGroupNames ||
    !!form.formState.errors.includeGroupPrefixValue ||
    !!form.formState.errors.excludeGroupPrefixValue ||
    !!form.formState.errors.consumerOffsetSyncInterval;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="space-y-2">
        <Heading level={1}>Create Shadow Link</Heading>
        <Text variant="muted">
          Set up a new shadow link to replicate topics from a source cluster for disaster recovery.
        </Text>
      </div>

      <Stepper.Provider className="space-y-4" variant="horizontal">
        {({ methods }) => (
          <>
            <Stepper.Navigation>
              <Stepper.Step of="connection">
                <Stepper.Title>Connection</Stepper.Title>
                <Stepper.Description>Configure source cluster</Stepper.Description>
              </Stepper.Step>
              <Stepper.Step disabled of="topics">
                <Stepper.Title>Topics</Stepper.Title>
                <Stepper.Description>Select topics to mirror</Stepper.Description>
              </Stepper.Step>
              <Stepper.Step disabled of="acls">
                <Stepper.Title>ACLs</Stepper.Title>
                <Stepper.Description>Select ACLs to mirror</Stepper.Description>
              </Stepper.Step>
              <Stepper.Step disabled of="consumer-offsets">
                <Stepper.Title>Consumer Groups</Stepper.Title>
                <Stepper.Description>Sync consumer groups</Stepper.Description>
              </Stepper.Step>
            </Stepper.Navigation>

            <Form {...form}>
              {/* CONNECTION STEP */}
              {methods.current.id === 'connection' && (
                <Stepper.Panel>
                  <div className="space-y-4">
                    <ConnectionStep
                      appendBootstrapServer={appendBootstrapServer}
                      bootstrapServerFields={bootstrapServerFields}
                      form={form}
                      removeBootstrapServer={removeBootstrapServer}
                      setShowPemPaste={setShowPemPaste}
                      showPemPaste={showPemPaste}
                    />
                  </div>
                </Stepper.Panel>
              )}

              {/* TOPICS STEP */}
              {methods.current.id === 'topics' && (
                <Stepper.Panel>
                  <TopicsStep
                    appendTopicProperty={appendTopicProperty}
                    form={form}
                    removeTopicProperty={removeTopicProperty}
                    topicPropertiesFields={topicPropertiesFields}
                  />
                </Stepper.Panel>
              )}

              {/* ACLS STEP */}
              {methods.current.id === 'acls' && (
                <Stepper.Panel>
                  <AclsStep
                    aclFiltersFields={aclFiltersFields}
                    appendAclFilter={appendAclFilter}
                    form={form}
                    removeAclFilter={removeAclFilter}
                  />
                </Stepper.Panel>
              )}

              {/* CONSUMER OFFSETS STEP */}
              {methods.current.id === 'consumer-offsets' && (
                <Stepper.Panel>
                  <ConsumerOffsetStep form={form} />
                </Stepper.Panel>
              )}

              <Stepper.Controls className="flex justify-between">
                {methods.isFirst ? (
                  <Button onClick={() => navigate('/shadowlinks')} type="button" variant="outline">
                    Cancel
                  </Button>
                ) : (
                  <Button disabled={isCreating} onClick={methods.prev} type="button" variant="outline">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                )}
                {methods.isLast ? (
                  <Button
                    disabled={isCreating || hasConsumerOffsetErrors}
                    onClick={form.handleSubmit(onSubmit)}
                    type="button"
                  >
                    {isCreating ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <Text as="span">Creating...</Text>
                      </div>
                    ) : (
                      'Create Shadow Link'
                    )}
                  </Button>
                ) : (
                  <Button
                    disabled={
                      methods.current.id === 'connection'
                        ? hasConnectionErrors
                        : methods.current.id === 'topics'
                          ? hasTopicErrors
                          : methods.current.id === 'acls'
                            ? hasAclErrors
                            : false
                    }
                    onClick={() => handleNext(methods.current.id, methods.next)}
                    type="button"
                  >
                    Next
                  </Button>
                )}
              </Stepper.Controls>
            </Form>
          </>
        )}
      </Stepper.Provider>
    </div>
  );
};
