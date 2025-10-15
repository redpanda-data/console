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
import type { ConnectError } from '@connectrpc/connect';
import { TransportProvider } from '@connectrpc/connect-query';
import { config } from 'config';
import { useControlplaneTransport } from 'hooks/use-controlplane-transport';
import { CreateSecretRequestSchema as CreateSecretRequestSchemaConsole } from 'protogen/redpanda/api/console/v1alpha1/secret_pb';
import { CreateSecretRequestSchema, Scope } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { forwardRef, useEffect, useImperativeHandle } from 'react';
import { useCreateServiceAccountMutation } from 'react-query/api/controlplane/service-account';
import { toast } from 'sonner';
import { generateServiceAccountSecretId } from 'utils/secret.utils';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';
import { base64ToUInt8Array, encodeBase64 } from 'utils/utils';

type ServiceAccountSelectorProps = {
  serviceAccountName: string;
  // Callback from parent to create secret using dataplane transport
  // biome-ignore lint/suspicious/noExplicitAny: Using any to accept the mutation function from parent
  createSecret: (request: any) => Promise<any>;
  // Callback to notify parent of pending state changes
  onPendingChange?: (isPending: boolean) => void;
  // Optional customization
  resourceType?: string; // e.g., "AI agent", "pipeline", etc.
  secretScopes?: Scope[];
};

export type ServiceAccountSelectorRef = {
  createServiceAccount: (resourceName: string) => Promise<{ secretName: string; serviceAccountId: string } | null>;
  isPending: boolean;
};

const ServiceAccountSelectorComponent = forwardRef<ServiceAccountSelectorRef, ServiceAccountSelectorProps>(
  (
    {
      serviceAccountName,
      createSecret,
      onPendingChange,
      resourceType = 'resource',
      secretScopes = [Scope.AI_AGENT, Scope.MCP_SERVER],
    },
    ref
  ) => {
    const { mutateAsync: createServiceAccountMutation, isPending } = useCreateServiceAccountMutation({
      skipInvalidation: true,
    });

    // Notify parent when pending state changes
    useEffect(() => {
      onPendingChange?.(isPending);
    }, [isPending, onPendingChange]);

    const createServiceAccount = async (
      resourceName: string
    ): Promise<{ secretName: string; serviceAccountId: string } | null> => {
      try {
        // Create service account with role bindings
        const request = create(CreateServiceAccountRequestSchema, {
          serviceAccount: create(ServiceAccountCreateSchema, {
            name: serviceAccountName,
            description: `Service account for ${resourceType}: ${resourceName}`,
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

        const response = await createServiceAccountMutation(request);

        if (!response?.serviceAccount?.id) {
          throw new Error('Service account creation failed - no ID returned');
        }

        const serviceAccountId = response.serviceAccount.id;
        const credentials = response.serviceAccount.auth0ClientCredentials;

        // Create a single JSON secret for client credentials using the callback
        if (credentials?.clientId && credentials?.clientSecret) {
          // Generate secret ID in format: SERVICE_ACCOUNT_{service_account_xid}
          const secretName = generateServiceAccountSecretId(serviceAccountId);

          // Create JSON object with client_id and client_secret
          const credentialsJson = JSON.stringify({
            client_id: credentials.clientId,
            client_secret: credentials.clientSecret,
          });

          // Use the callback to create secret (uses dataplane transport from parent)
          await createSecret(
            create(CreateSecretRequestSchemaConsole, {
              request: create(CreateSecretRequestSchema, {
                id: secretName,
                secretData: base64ToUInt8Array(encodeBase64(credentialsJson)),
                scopes: secretScopes,
                labels: {
                  service_account_id: serviceAccountId,
                },
              }),
            })
          );

          return { secretName, serviceAccountId };
        }

        throw new Error('Service account credentials not provided');
      } catch (error) {
        toast.error(
          formatToastErrorMessageGRPC({
            error: error as ConnectError,
            action: 'create',
            entity: 'service account',
          })
        );
        return null;
      }
    };

    // Expose methods to parent via ref
    useImperativeHandle(ref, () => ({
      createServiceAccount,
      isPending,
    }));

    return null;
  }
);

ServiceAccountSelectorComponent.displayName = 'ServiceAccountSelectorComponent';

// Wrapper component that provides controlplane transport
export const ServiceAccountSelector = forwardRef<ServiceAccountSelectorRef, ServiceAccountSelectorProps>(
  (props, ref) => {
    const controlplaneTransport = useControlplaneTransport();

    return (
      <TransportProvider transport={controlplaneTransport}>
        <ServiceAccountSelectorComponent ref={ref} {...props} />
      </TransportProvider>
    );
  }
);

ServiceAccountSelector.displayName = 'ServiceAccountSelector';
