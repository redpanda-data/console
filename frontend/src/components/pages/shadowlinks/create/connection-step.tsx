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

import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import {
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
import { Text } from 'components/redpanda-ui/components/typography';
import { Plus, X } from 'lucide-react';
import { ScramMechanism } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import type { UseFieldArrayReturn, UseFormReturn } from 'react-hook-form';

import type { FormValues } from './schemas';
import { TLS_MODE } from './schemas';

interface ConnectionStepProps {
  form: UseFormReturn<FormValues>;
  bootstrapServerFields: UseFieldArrayReturn<FormValues, 'bootstrapServers', 'id'>['fields'];
  appendBootstrapServer: UseFieldArrayReturn<FormValues, 'bootstrapServers', 'id'>['append'];
  removeBootstrapServer: UseFieldArrayReturn<FormValues, 'bootstrapServers', 'id'>['remove'];
  showPemPaste: boolean;
  setShowPemPaste: (show: boolean) => void;
}

export const ConnectionStep = ({
  form,
  bootstrapServerFields,
  appendBootstrapServer,
  removeBootstrapServer,
  showPemPaste,
  setShowPemPaste,
}: ConnectionStepProps) => {
  const useTls = form.watch('useTls');
  const tlsMode = form.watch('tlsMode');
  const useScram = form.watch('useScram');

  return (
    <>
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
                    <Button onClick={() => removeBootstrapServer(index)} size="icon" type="button" variant="outline">
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
                <Plus className="mr-2 h-4 w-4" />
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
              <div className="space-y-4 border-t pt-4">
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
              <div className="space-y-4 border-t pt-4">
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
                      <div className="rounded-lg border-2 border-dashed p-6 text-center">
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
    </>
  );
};
