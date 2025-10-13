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
import { Card, CardContent, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import { Switch } from 'components/redpanda-ui/components/switch';
import { Textarea } from 'components/redpanda-ui/components/textarea';
import { Heading, Text } from 'components/redpanda-ui/components/typography';
import { Loader2, Plus, X } from 'lucide-react';
import { runInAction } from 'mobx';
import {
  AuthenticationConfigurationSchema,
  CreateShadowLinkRequestSchema,
  ScramConfigSchema,
  ScramMechanism,
  ShadowLinkClientOptionsSchema,
  ShadowLinkConfigurationsSchema,
  ShadowLinkSchema,
  TLSFileSettingsSchema,
  TLSPEMSettingsSchema,
} from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import React, { useEffect, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useCreateShadowLinkMutation } from 'react-query/api/shadowlink';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { uiState } from 'state/ui-state';

import { FormSchema, type FormValues, initialValues, TLS_MODE } from './schemas';

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

  useEffect(() => {
    updatePageTitle();
  }, []);

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

      const configurations = create(ShadowLinkConfigurationsSchema, {
        clientOptions,
        authenticationConfiguration,
        tlsFileSettings,
        tlsPemSettings,
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
    } catch (error) {
      // Error handling is done by the mutation's onError
      console.error('Failed to create shadow link:', error);
    }
  };

  const useTls = form.watch('useTls');
  const tlsMode = form.watch('tlsMode');
  const useScram = form.watch('useScram');

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="space-y-2">
        <Heading level={1}>Create Shadow Link</Heading>
        <Text variant="muted">
          Set up a new shadow link to replicate topics from a source cluster for disaster recovery.
        </Text>
      </div>

      <Form {...form}>
        <form className="flex flex-col gap-4" onSubmit={form.handleSubmit(onSubmit)}>
          {/* Basic Information */}
          <Card size="full">
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Shadow Link Name</FormLabel>
                    <FormControl>
                      <Input placeholder="my-shadow-link" {...field} />
                    </FormControl>
                    <FormDescription>A unique name for this shadow link</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Source Cluster Connection */}
          <Card size="full">
            <CardHeader>
              <CardTitle>Source Cluster Connection</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <FormLabel required>Bootstrap Servers</FormLabel>
                  <FormDescription>
                    Kafka bootstrap server addresses for the source cluster (e.g., broker1:9092)
                  </FormDescription>
                  {bootstrapServerFields.map((field, index) => (
                    <div className="flex items-center gap-2" key={field.id}>
                      <FormField
                        control={form.control}
                        name={`bootstrapServers.${index}`}
                        render={({ field }) => (
                          <FormItem className="flex-1">
                            <FormControl>
                              <Input placeholder="broker1:9092" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      {bootstrapServerFields.length > 1 && (
                        <Button
                          onClick={() => removeBootstrapServer(index)}
                          size="icon"
                          type="button"
                          variant="outline"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button
                    className="mt-2"
                    onClick={() => appendBootstrapServer('')}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Server
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* SCRAM Credentials */}
          <Card size="full">
            <CardHeader>
              <CardTitle>SCRAM Credentials</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="useScram"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between">
                      <div>
                        <FormLabel>Enable SCRAM Authentication</FormLabel>
                        <FormDescription>Use SCRAM-SHA credentials to authenticate</FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {useScram && (
                  <div className="space-y-4 pt-4 border-t">
                    <FormField
                      control={form.control}
                      name="scramUsername"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel required>Username</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter SCRAM username" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="scramPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel required>Password</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter SCRAM password" type="password" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="scramMechanism"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel required>SCRAM Mechanism</FormLabel>
                          <Select onValueChange={(value) => field.onChange(Number(value))} value={String(field.value)}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select mechanism" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value={String(ScramMechanism.SCRAM_SHA_256)}>SCRAM-SHA-256</SelectItem>
                              <SelectItem value={String(ScramMechanism.SCRAM_SHA_512)}>SCRAM-SHA-512</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* TLS Configuration */}
          <Card size="full">
            <CardHeader>
              <CardTitle>TLS Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="useTls"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between">
                      <div>
                        <FormLabel>Enable TLS</FormLabel>
                        <FormDescription>Use TLS/SSL to secure the connection</FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {useTls && (
                  <div className="space-y-4 pt-4 border-t">
                    <FormField
                      control={form.control}
                      name="tlsMode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>TLS Mode</FormLabel>
                          <div className="flex gap-2">
                            <Button
                              onClick={() => field.onChange(TLS_MODE.FILE_PATH)}
                              size="sm"
                              type="button"
                              variant={field.value === TLS_MODE.FILE_PATH ? 'default' : 'outline'}
                            >
                              File Path on Node
                            </Button>
                            <Button
                              onClick={() => field.onChange(TLS_MODE.PEM)}
                              size="sm"
                              type="button"
                              variant={field.value === TLS_MODE.PEM ? 'default' : 'outline'}
                            >
                              Upload/Paste Certificate
                            </Button>
                          </div>
                        </FormItem>
                      )}
                    />

                    {tlsMode === TLS_MODE.FILE_PATH && (
                      <div className="space-y-4">
                        <FormField
                          control={form.control}
                          name="tlsCaPath"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel required>CA Certificate Path</FormLabel>
                              <FormControl>
                                <Input placeholder="/path/to/ca.crt" {...field} />
                              </FormControl>
                              <FormDescription>Path to CA certificate on the node</FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="tlsKeyPath"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Client Key Path</FormLabel>
                              <FormControl>
                                <Input placeholder="/path/to/client.key" {...field} />
                              </FormControl>
                              <FormDescription>Optional: Path to client key on the node</FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="tlsCertPath"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Client Certificate Path</FormLabel>
                              <FormControl>
                                <Input placeholder="/path/to/client.crt" {...field} />
                              </FormControl>
                              <FormDescription>Optional: Path to client certificate on the node</FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    )}

                    {tlsMode === TLS_MODE.PEM && (
                      <div className="space-y-4">
                        {showPemPaste ? (
                          <>
                            <FormField
                              control={form.control}
                              name="tlsCaPem"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel required>CA Certificate</FormLabel>
                                  <FormControl>
                                    <Textarea placeholder="-----BEGIN CERTIFICATE-----..." rows={6} {...field} />
                                  </FormControl>
                                  <FormDescription>Paste the CA certificate in PEM format</FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="tlsKeyPem"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Client Key</FormLabel>
                                  <FormControl>
                                    <Textarea placeholder="-----BEGIN PRIVATE KEY-----..." rows={6} {...field} />
                                  </FormControl>
                                  <FormDescription>Optional: Paste the client key in PEM format</FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="tlsCertPem"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Client Certificate</FormLabel>
                                  <FormControl>
                                    <Textarea placeholder="-----BEGIN CERTIFICATE-----..." rows={6} {...field} />
                                  </FormControl>
                                  <FormDescription>Optional: Paste the client certificate in PEM format</FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <div className="text-sm">
                              or{' '}
                              <Button onClick={() => setShowPemPaste(false)} type="button" variant="link">
                                upload file
                              </Button>
                            </div>
                          </>
                        ) : (
                          <div className="border-2 border-dashed rounded-lg p-6 text-center">
                            <Text className="mb-4" variant="muted">
                              File upload functionality coming soon
                            </Text>
                            <Button onClick={() => setShowPemPaste(true)} size="sm" type="button" variant="outline">
                              Paste certificate text
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Advanced Settings - TODO */}
          <Card size="full">
            <CardHeader>
              <CardTitle>Advanced Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <Text variant="muted">Advanced configuration options will be available here in a future update.</Text>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button onClick={() => navigate('/shadowlinks')} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={isCreating} type="submit">
              {isCreating ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <Text as="span">Creating...</Text>
                </div>
              ) : (
                'Create Shadow Link'
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
};
