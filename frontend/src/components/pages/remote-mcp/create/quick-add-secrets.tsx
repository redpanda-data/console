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
import type { ConnectError } from '@connectrpc/connect';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, AlertDescription } from 'components/redpanda-ui/components/alert';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from 'components/redpanda-ui/components/form';
import { Input } from 'components/redpanda-ui/components/input';
import { Text } from 'components/redpanda-ui/components/typography';
import { AlertTriangle, Key, Loader2, Plus } from 'lucide-react';
import { CreateSecretRequestSchema } from 'protogen/redpanda/api/console/v1alpha1/secret_pb';
import {
  CreateSecretRequestSchema as CreateSecretRequestSchemaDataPlane,
  Scope,
} from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useCreateSecretMutation } from 'react-query/api/secret';
import { toast } from 'sonner';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';
import { base64ToUInt8Array, encodeBase64 } from 'utils/utils';
import { z } from 'zod';

interface QuickAddSecretsProps {
  requiredSecrets: string[];
  existingSecrets: string[];
}

const SecretFormSchema = z.record(
  z.string(),
  z.object({
    value: z.string().min(1, 'Secret value is required'),
  }),
);

type SecretFormData = z.infer<typeof SecretFormSchema>;

export const QuickAddSecrets: React.FC<QuickAddSecretsProps> = ({ requiredSecrets, existingSecrets }) => {
  const { mutateAsync: createSecret, isPending: isCreateSecretPending } = useCreateSecretMutation();
  const [createdSecrets, setCreatedSecrets] = useState<string[]>([]);

  const missingSecrets = requiredSecrets.filter(
    (secret) => !existingSecrets.includes(secret) && !createdSecrets.includes(secret),
  );

  const form = useForm<SecretFormData>({
    resolver: zodResolver(SecretFormSchema),
    defaultValues: Object.fromEntries(missingSecrets.map((secretName) => [secretName, { value: '' }])),
  });

  const handleCreateSecrets = async (data: SecretFormData) => {
    const secretEntries = Object.entries(data);
    const errors: Array<{ secretName: string; error: ConnectError }> = [];
    const successfulSecrets: string[] = [];

    await Promise.allSettled(
      secretEntries.map(([secretName, { value }]) => {
        const dataPlaneRequest = create(CreateSecretRequestSchemaDataPlane, {
          id: secretName,
          secretData: base64ToUInt8Array(encodeBase64(value)),
          scopes: [Scope.MCP_SERVER], // Automatically set scope to Remote MCP
          labels: {}, // Default to no labels for quick add
        });

        return createSecret(
          create(CreateSecretRequestSchema, {
            request: dataPlaneRequest,
          }),
          {
            onSuccess: () => {
              successfulSecrets.push(secretName);
            },
            onError: (error) => {
              errors.push({ secretName, error });
            },
          },
        );
      }),
    );

    // Update created secrets state
    if (successfulSecrets.length > 0) {
      setCreatedSecrets((prev) => [...prev, ...successfulSecrets]);
    }

    // Display error toasts for failed secrets
    errors.forEach(({ secretName, error }) => {
      toast.error(formatToastErrorMessageGRPC({ error, action: 'create', entity: `secret ${secretName}` }));
    });
  };

  if (requiredSecrets.length === 0) {
    return null;
  }

  return (
    <Card size="full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="h-4 w-4" />
          Required Secrets
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert className="border-amber-200 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800">
            The tool requires secrets to function properly. Create them below before proceeding.
          </AlertDescription>
        </Alert>

        <div className="space-y-4">
          {missingSecrets.length > 0 && (
            <div className="flex flex-col gap-2">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleCreateSecrets)} className="space-y-3">
                  {missingSecrets.map((secretName) => (
                    <FormField
                      key={secretName}
                      control={form.control}
                      name={`${secretName}.value` as keyof SecretFormData}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-sm font-medium">{secretName}</FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              placeholder={`Enter value for ${secretName}...`}
                              value={typeof field.value === 'string' ? field.value : field.value?.value || ''}
                              onChange={field.onChange}
                              onBlur={field.onBlur}
                              name={field.name}
                              ref={field.ref}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ))}

                  <Button
                    type="submit"
                    variant="dashed"
                    disabled={isCreateSecretPending || !form.formState.isValid}
                    className="w-full"
                  >
                    {isCreateSecretPending ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <Text as="span">Creating...</Text>
                      </div>
                    ) : (
                      <>
                        <Plus className="h-4 w-4" />
                        Create {missingSecrets.length} Secret{missingSecrets.length > 1 ? 's' : ''}
                      </>
                    )}
                  </Button>
                </form>
              </Form>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
