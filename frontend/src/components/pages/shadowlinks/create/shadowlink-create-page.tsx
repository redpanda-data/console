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
import { DevTool } from '@hookform/devtools';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from 'components/redpanda-ui/components/button';
import { Form } from 'components/redpanda-ui/components/form';
import { defineStepper } from 'components/redpanda-ui/components/stepper';
import { Heading, Text } from 'components/redpanda-ui/components/typography';
import { runInAction } from 'mobx';
import {
  ACLFilterSchema,
  AuthenticationConfigurationSchema,
  ConsumerOffsetSyncOptionsSchema,
  CreateShadowLinkRequestSchema,
  FilterType,
  NameFilterSchema,
  PatternType,
  ScramConfigSchema,
  SecuritySettingsSyncOptionsSchema,
  ShadowLinkClientOptionsSchema,
  ShadowLinkConfigurationsSchema,
  ShadowLinkSchema,
  TLSSettingsSchema,
  TopicMetadataSyncOptionsSchema,
} from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { uiState } from 'state/ui-state';

import { ConfigurationStep } from './configuration/configuration-step';
import { ConnectionStep } from './connection/connection-step';
import { FormSchema, type FormValues, initialValues } from './model';
import {
  ACLOperation,
  ACLPattern,
  ACLPermissionType,
  ACLResource,
} from '../../../../protogen/redpanda/core/common/acl_pb';
import { useCreateShadowLinkMutation } from '../../../../react-query/api/shadowlink';
import { buildTLSSettings } from '../edit/shadowlink-edit-utils';

// Stepper definition
const { Stepper } = defineStepper(
  {
    id: 'shadow-connection',
    title: 'Connection',
  },
  {
    id: 'shadow-configuration',
    title: 'Configuration',
  }
);

// Update page title using uiState pattern
export const updatePageTitle = () => {
  runInAction(() => {
    uiState.pageTitle = 'Create shadow link';
    uiState.pageBreadcrumbs = [
      { title: 'Shadow Links', linkTo: '/shadowlinks' },
      { title: 'Create', linkTo: '/shadowlinks/create' },
    ];
  });
};

/**
 * Transform form values to CreateShadowLinkRequest protobuf message
 */
const buildCreateShadowLinkRequest = (values: FormValues) => {
  // Build TLS settings from certificate configuration
  const tlsSettings = buildTLSSettings(values);

  // Build client options
  const clientOptions = create(ShadowLinkClientOptionsSchema, {
    bootstrapServers: values.bootstrapServers.map((s) => s.value),
    tlsSettings: values.useTls
      ? create(TLSSettingsSchema, {
          enabled: true,
          tlsSettings,
        })
      : undefined,
    authenticationConfiguration: values.useScram
      ? create(AuthenticationConfigurationSchema, {
          authentication: {
            case: 'scramConfiguration',
            value: create(ScramConfigSchema, {
              username: values.scramCredentials?.username,
              password: values.scramCredentials?.password,
              scramMechanism: values.scramCredentials?.mechanism,
            }),
          },
        })
      : undefined,
    metadataMaxAgeMs: values.advanceClientOptions.metadataMaxAgeMs,
    connectionTimeoutMs: values.advanceClientOptions.connectionTimeoutMs,
    retryBackoffMs: values.advanceClientOptions.retryBackoffMs,
    fetchWaitMaxMs: values.advanceClientOptions.fetchWaitMaxMs,
    fetchMinBytes: values.advanceClientOptions.fetchMinBytes,
    fetchMaxBytes: values.advanceClientOptions.fetchMaxBytes,
    fetchPartitionMaxBytes: values.advanceClientOptions.fetchPartitionMaxBytes,
  });

  const allNameFilter = [
    create(NameFilterSchema, {
      patternType: PatternType.LITERAL,
      filterType: FilterType.INCLUDE,
      name: '*',
    }),
  ];

  const allACLs = [
    create(ACLFilterSchema, {
      resourceFilter: {
        resourceType: ACLResource.ACL_RESOURCE_ANY,
        patternType: ACLPattern.ACL_PATTERN_ANY,
        name: '',
      },
      accessFilter: {
        principal: '',
        operation: ACLOperation.ACL_OPERATION_ANY,
        permissionType: ACLPermissionType.ACL_PERMISSION_TYPE_ANY,
        host: '',
      },
    }),
  ];

  // Build topic metadata sync options
  const topicMetadataSyncOptions = create(TopicMetadataSyncOptionsSchema, {
    autoCreateShadowTopicFilters:
      values.topicsMode === 'all'
        ? allNameFilter
        : values.topics.map((topic) =>
            create(NameFilterSchema, {
              patternType: topic.patterType,
              filterType: topic.filterType,
              name: topic.name,
            })
          ),
    syncedShadowTopicProperties: values.topicProperties || [],
  });

  // Build consumer offset sync options (ignore enabled field)
  const consumerOffsetSyncOptions = create(ConsumerOffsetSyncOptionsSchema, {
    groupFilters:
      values.consumersMode === 'all'
        ? allNameFilter
        : values.consumers.map((consumer) =>
            create(NameFilterSchema, {
              patternType: consumer.patterType,
              filterType: consumer.filterType,
              name: consumer.name,
            })
          ),
  });

  // Build security sync options (ACL filters, ignore enabled field)
  const securitySyncOptions = create(SecuritySettingsSyncOptionsSchema, {
    aclFilters: values.aclsMode
      ? allACLs
      : values.aclFilters?.map((acl) =>
          create(ACLFilterSchema, {
            resourceFilter: {
              resourceType: acl.resourceType,
              patternType: acl.resourcePattern,
              name: acl.resourceName || '',
            },
            accessFilter: {
              principal: acl.principal || '',
              operation: acl.operation,
              permissionType: acl.permissionType,
              host: acl.host || '',
            },
          })
        ),
  });

  // Build configurations
  const configurations = create(ShadowLinkConfigurationsSchema, {
    clientOptions,
    topicMetadataSyncOptions,
    consumerOffsetSyncOptions,
    securitySyncOptions,
  });

  // Build shadow link
  const shadowLink = create(ShadowLinkSchema, {
    name: values.name,
    configurations,
  });

  // Build final request
  return create(CreateShadowLinkRequestSchema, {
    shadowLink,
  });
};

export const ShadowLinkCreatePage = () => {
  const navigate = useNavigate();

  const { mutateAsync: createShadowLink, isPending: isCreating } = useCreateShadowLinkMutation({
    onSuccess: () => {
      toast.success('Shadow link created successfully');
      navigate('/shadowlinks');
    },
    onError: (error) => {
      toast.error('Shadow link create failed', {
        description: error.message,
      });
    },
  });

  const onSubmit = (values: FormValues) => {
    const request = buildCreateShadowLinkRequest(values);
    void createShadowLink(request);
  };

  // Form setup
  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: initialValues,
    mode: 'onChange',
  });

  useEffect(() => {
    updatePageTitle();
  }, []);

  const next = async (methods: { next: () => void }) => {
    const valid = await form.trigger(['name', 'bootstrapServers', 'mtls', 'scramCredentials']);

    if (valid) {
      methods.next();
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="space-y-2">
        <Heading level={1}>Create shadow link</Heading>
        <Text variant="muted">
          Set up a shadow link to replicate topics from a source cluster for disaster recovery.
        </Text>
      </div>

      <Stepper.Provider className="flex flex-col space-y-4" variant="horizontal">
        {({ methods }) => (
          <>
            <div className="xl:w-1/3">
              <Stepper.Navigation>
                <Stepper.Step of="shadow-connection">
                  <Stepper.Title>Connection</Stepper.Title>
                </Stepper.Step>
                <Stepper.Step of="shadow-configuration">
                  <Stepper.Title>Configuration</Stepper.Title>
                </Stepper.Step>
              </Stepper.Navigation>
            </div>

            <div className="xl:w-2/3">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)}>
                  <DevTool control={form.control} />
                  {/* CONNECTION STEP */}
                  {methods.current.id === 'shadow-connection' && (
                    <Stepper.Panel>
                      <ConnectionStep />
                    </Stepper.Panel>
                  )}

                  {/* SHADOW CONFIGURATION STEP */}
                  {methods.current.id === 'shadow-configuration' && (
                    <Stepper.Panel>
                      <ConfigurationStep />
                    </Stepper.Panel>
                  )}
                </form>
              </Form>
            </div>

            <div className="w-1/2">
              <Stepper.Controls className="flex justify-start">
                {methods.isLast ? (
                  <Button disabled={isCreating} onClick={form.handleSubmit(onSubmit)} variant="secondary">
                    Create shadow link
                  </Button>
                ) : (
                  <Button onClick={() => next(methods)} type="button" variant="secondary">
                    Next
                  </Button>
                )}

                {methods.isFirst ? (
                  <Button onClick={() => navigate('/shadowlinks')} type="button" variant="outline">
                    Cancel
                  </Button>
                ) : (
                  <Button onClick={methods.prev} type="button" variant="outline">
                    Back
                  </Button>
                )}
              </Stepper.Controls>
            </div>
          </>
        )}
      </Stepper.Provider>
    </div>
  );
};
