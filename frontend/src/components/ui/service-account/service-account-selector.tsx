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

import {
  RoleBinding_ScopeResourceType,
  RoleBinding_ScopeSchema,
} from '@buf/redpandadata_cloud.bufbuild_es/redpanda/api/iam/v1/role_binding_pb';
import {
  CreateServiceAccountRequestSchema,
  ServiceAccountCreate_RoleBindingSchema,
  ServiceAccountCreateSchema,
} from '@buf/redpandadata_cloud.bufbuild_es/redpanda/api/iam/v1/service_account_pb';
import { create } from '@bufbuild/protobuf';
import { ConnectError } from '@connectrpc/connect';
import { TransportProvider } from '@connectrpc/connect-query';
import { createConnectTransport } from '@connectrpc/connect-web';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from 'components/redpanda-ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'components/redpanda-ui/components/dialog';
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
import { InlineCode, Text } from 'components/redpanda-ui/components/typography';
import { addBearerTokenInterceptor, config } from 'config';
import { Loader2, Plus, Users } from 'lucide-react';
import { protobufRegistry } from 'protobuf-registry';
import {
  type CreateSecretRequest,
  CreateSecretRequestSchema as CreateSecretRequestSchemaConsole,
  type CreateSecretResponse,
} from 'protogen/redpanda/api/console/v1alpha1/secret_pb';
import { CreateSecretRequestSchema, Scope, type Secret } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useCreateServiceAccountMutation } from 'react-query/api/controlplane/service-account';
import type { MessageInit } from 'react-query/react-query.utils';
import { toast } from 'sonner';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';
import { base64ToUInt8Array, encodeBase64 } from 'utils/utils';
import { z } from 'zod';

type ServiceAccountSelectorProps = {
  value: string;
  placeholder?: string;
  onServiceAccountCreated?: (serviceAccountId: string) => void; // TODO: Use when creation is implemented
  existingSecrets: Secret[];
  // We need these callbacks because we talk to dataplane API to create secrets and this component is wrapped in a controlplane transport
  createSecret: (request: MessageInit<CreateSecretRequest>) => Promise<CreateSecretResponse>;
  isCreateSecretPending: boolean;
};

const NewServiceAccountFormSchema = z.object({
  name: z
    .string()
    .min(1, 'Service account name is required')
    .max(255, 'Service account name must be fewer than 255 characters')
    .regex(
      /^[A-Za-z][A-Za-z0-9_-]*$/,
      'Service account name must start with a letter and contain only letters, numbers, hyphens, and underscores'
    ),
  description: z.string().optional(),
});

type NewServiceAccountFormData = z.infer<typeof NewServiceAccountFormSchema>;

const DEFAULT_SCOPES = [Scope.AI_AGENT, Scope.MCP_SERVER];

export const ServiceAccountSelector = ({
  value,
  placeholder,
  onServiceAccountCreated,
  existingSecrets,
  createSecret,
  isCreateSecretPending,
}: ServiceAccountSelectorProps) => {
  const controlplaneTransport = createConnectTransport({
    baseUrl: config.controlplaneUrl,
    interceptors: [addBearerTokenInterceptor],
    jsonOptions: {
      registry: protobufRegistry,
    },
  });
  return (
    <TransportProvider transport={controlplaneTransport}>
      <ServiceAccountSelectorComponent
        createSecret={createSecret}
        existingSecrets={existingSecrets}
        isCreateSecretPending={isCreateSecretPending}
        onServiceAccountCreated={onServiceAccountCreated}
        placeholder={placeholder}
        value={value}
      />
    </TransportProvider>
  );
};

export const ServiceAccountSelectorComponent: React.FC<ServiceAccountSelectorProps> = ({
  onServiceAccountCreated,
  existingSecrets,
  createSecret,
  isCreateSecretPending,
}) => {
  const { mutateAsync: createServiceAccount, isPending: isCreateServiceAccountPending } =
    useCreateServiceAccountMutation();

  // Check if the hardcoded service account secrets exist
  const hasServiceAccountSecrets = useMemo(() => {
    const hasClientId = !!existingSecrets?.find((secret) => secret.id === 'SERVICE_ACCOUNT_CLIENT_ID');
    const hasClientSecret = !!existingSecrets?.find((secret) => secret.id === 'SERVICE_ACCOUNT_CLIENT_SECRET');
    return hasClientId && hasClientSecret;
  }, [existingSecrets]);

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  const form = useForm<NewServiceAccountFormData>({
    resolver: zodResolver(NewServiceAccountFormSchema),
    defaultValues: {
      name: '',
      description: '',
    },
  });

  const handleCreateServiceAccount = async (data: NewServiceAccountFormData) => {
    try {
      // Create service account with role bindings
      const request = create(CreateServiceAccountRequestSchema, {
        serviceAccount: create(ServiceAccountCreateSchema, {
          name: data.name,
          description: data.description || '',
          roleBindings: [
            create(ServiceAccountCreate_RoleBindingSchema, {
              scope: create(RoleBinding_ScopeSchema, {
                resourceType: config.isServerless
                  ? RoleBinding_ScopeResourceType.SERVERLESS_CLUSTER
                  : RoleBinding_ScopeResourceType.CLUSTER,
                resourceId: config.clusterId,
              }),
              roleName: 'Admin',
            }),
          ],
        }),
      });

      const response = await createServiceAccount(request);

      if (!response?.serviceAccount?.id) {
        throw new Error('Service account creation failed - no ID returned');
      }

      const serviceAccountId = response.serviceAccount.id;
      const credentials = response.serviceAccount.auth0ClientCredentials;

      // Create 2 separate hardcoded secrets for client credentials if provided
      if (credentials?.clientId && credentials?.clientSecret) {
        try {
          // Always use hardcoded secret names
          const clientIdSecretName = 'SERVICE_ACCOUNT_CLIENT_ID';
          const clientSecretSecretName = 'SERVICE_ACCOUNT_CLIENT_SECRET';

          await createSecret(
            create(CreateSecretRequestSchemaConsole, {
              request: create(CreateSecretRequestSchema, {
                id: clientIdSecretName,
                secretData: base64ToUInt8Array(encodeBase64(credentials.clientId)),
                scopes: DEFAULT_SCOPES,
                labels: {
                  service_account_id: serviceAccountId,
                  service_account_name: data.name,
                },
              }),
            })
          );

          await createSecret(
            create(CreateSecretRequestSchemaConsole, {
              request: create(CreateSecretRequestSchema, {
                id: clientSecretSecretName,
                secretData: base64ToUInt8Array(encodeBase64(credentials.clientSecret)),
                scopes: DEFAULT_SCOPES,
                labels: {
                  service_account_id: serviceAccountId,
                  service_account_name: data.name,
                },
              }),
            })
          );

          toast.success(
            `Service account "${data.name}" created successfully. Secrets ${clientIdSecretName} and ${clientSecretSecretName} created.`
          );

          // Call callback if provided
          onServiceAccountCreated?.(serviceAccountId);
        } catch (secretError) {
          const connectError = ConnectError.from(secretError);
          // Service account was created but secret operation failed
          toast.error(
            formatToastErrorMessageGRPC({
              error: connectError,
              action: 'create',
              entity: `secrets for service account ${data.name}`,
            })
          );
        }
      } else {
        toast.success('Service account created successfully');
      }

      // Close dialog and reset form
      setIsCreateDialogOpen(false);
      form.reset();
    } catch (error) {
      const errorMessage = formatToastErrorMessageGRPC({
        error: error as ConnectError,
        action: 'create',
        entity: `service account ${data.name}`,
      });
      toast.error(errorMessage);
    }
  };

  return (
    <>
      {hasServiceAccountSecrets ? (
        // Service account secrets exist - show notification
        <div className="rounded-lg border border-muted bg-muted/10 p-4">
          <Text className="mb-2 font-medium text-sm">Service account configured</Text>
          <Text className="mb-3 text-sm" variant="muted">
            The following secrets will be used for AI agent authentication:
          </Text>
          <div className="space-y-1">
            <Text className="text-sm" variant="muted">
              Client ID: <InlineCode>SERVICE_ACCOUNT_CLIENT_ID</InlineCode>
            </Text>
            <Text className="text-sm" variant="muted">
              Client Secret: <InlineCode>SERVICE_ACCOUNT_CLIENT_SECRET</InlineCode>
            </Text>
          </div>
        </div>
      ) : (
        // No service account secrets - show empty state
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-muted border-dashed bg-muted/10 py-12">
          <Users className="mb-4 h-12 w-12 text-muted-foreground opacity-50" />
          <Text className="mb-2 font-medium" variant="default">
            No Service Account
          </Text>
          <Text className="mb-4 max-w-md text-center" variant="muted">
            Service accounts provide authentication credentials for the AI agent. Role bindings will be automatically
            configured.
          </Text>
          <Button onClick={() => setIsCreateDialogOpen(true)} size="sm" type="button" variant="outline">
            <Plus className="h-4 w-4" />
            Create Service Account
          </Button>
        </div>
      )}

      <Dialog onOpenChange={setIsCreateDialogOpen} open={isCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Service Account</DialogTitle>
            <DialogDescription>
              Create a new service account for authentication. Role binding will be automatically set with the
              appropriate scope, resource, and role.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form className="space-y-4" onSubmit={form.handleSubmit(handleCreateServiceAccount)}>
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Service Account Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., my-ai-agent-sa" {...field} />
                    </FormControl>
                    <FormDescription>
                      Must start with a letter and contain only letters, numbers, hyphens, and underscores
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Service Account Description</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Service account for AI agent authentication" {...field} />
                    </FormControl>
                    <FormDescription>Optional description for the service account</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button onClick={() => setIsCreateDialogOpen(false)} type="button" variant="outline">
                  Cancel
                </Button>
                <Button
                  disabled={isCreateServiceAccountPending || isCreateSecretPending || !form.formState.isValid}
                  type="submit"
                >
                  {isCreateServiceAccountPending || isCreateSecretPending ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <Text as="span">Creating...</Text>
                    </div>
                  ) : (
                    'Create Service Account'
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
};
