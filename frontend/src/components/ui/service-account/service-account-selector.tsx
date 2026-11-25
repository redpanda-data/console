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
import { create, type MessageShape } from '@bufbuild/protobuf';
import { ConnectError } from '@connectrpc/connect';
import { TransportProvider } from '@connectrpc/connect-query';
import { useControlplaneTransport } from 'hooks/use-controlplane-transport';
import { CreateSecretRequestSchema as CreateSecretRequestSchemaConsole } from 'protogen/redpanda/api/console/v1alpha1/secret_pb';
import { CreateSecretRequestSchema, Scope } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { type Ref, useEffect, useImperativeHandle } from 'react';
import { useCreateServiceAccountMutation } from 'react-query/api/controlplane/service-account';
import { toast } from 'sonner';
import { generateServiceAccountSecretId } from 'utils/secret.utils';
import { isNonEmptyString } from 'utils/string-utils';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';
import { base64ToUInt8Array, encodeBase64 } from 'utils/utils';

import { config } from '../../../runtime-config';

type ServiceAccountSelectorProps = {
  serviceAccountName: string;
  // Callback from parent to create secret using dataplane transport
  createSecret: (request: MessageShape<typeof CreateSecretRequestSchemaConsole>) => Promise<unknown>;
  // Callback to notify parent of pending state changes
  onPendingChange?: (isPending: boolean) => void;
  // Optional customization
  resourceType?: string;
  secretScopes?: Scope[];
  ref?: Ref<ServiceAccountSelectorRef>;
};

export type ServiceAccountSelectorRef = {
  createServiceAccount: (resourceName: string) => Promise<{ secretName: string; serviceAccountId: string } | null>;
  isPending: boolean;
};

const DEFAULT_SECRET_SCOPES = [Scope.REDPANDA_CONNECT];

function ServiceAccountSelectorComponent({
  serviceAccountName,
  createSecret,
  onPendingChange,
  resourceType = 'resource',
  secretScopes = DEFAULT_SECRET_SCOPES,
  ref,
}: ServiceAccountSelectorProps) {
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
      const response = await createServiceAccountMutation(
        buildServiceAccountRequest(serviceAccountName, resourceType, resourceName)
      );
      const { serviceAccountId, clientId, clientSecret } = serviceAccountCredentials(response);
      const secretName = generateServiceAccountSecretId(serviceAccountId);
      await createSecret(buildCredentialsSecret(secretName, serviceAccountId, clientId, clientSecret, secretScopes));
      return { secretName, serviceAccountId };
    } catch (error) {
      toast.error(
        formatToastErrorMessageGRPC({
          error: ConnectError.from(error),
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

function buildServiceAccountRequest(serviceAccountName: string, resourceType: string, resourceName: string) {
  return create(CreateServiceAccountRequestSchema, {
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
          roleName: 'Writer',
        }),
      ],
    }),
  });
}

type ServiceAccountResponse = Awaited<ReturnType<ReturnType<typeof useCreateServiceAccountMutation>['mutateAsync']>>;

function serviceAccountCredentials(response: ServiceAccountResponse) {
  const account = response.serviceAccount;
  if (!(account && isNonEmptyString(account.id))) {
    throw new Error('Service account creation failed - no ID returned');
  }
  const credentials = account.auth0ClientCredentials;
  if (!(credentials && isNonEmptyString(credentials.clientId) && isNonEmptyString(credentials.clientSecret))) {
    throw new Error('Service account credentials not provided');
  }
  return { serviceAccountId: account.id, clientId: credentials.clientId, clientSecret: credentials.clientSecret };
}

function buildCredentialsSecret(
  secretName: string,
  serviceAccountId: string,
  clientId: string,
  clientSecret: string,
  scopes: Scope[]
) {
  return create(CreateSecretRequestSchemaConsole, {
    request: create(CreateSecretRequestSchema, {
      id: secretName,
      secretData: base64ToUInt8Array(
        encodeBase64(JSON.stringify({ client_id: clientId, client_secret: clientSecret }))
      ),
      scopes,
      labels: { service_account_id: serviceAccountId },
    }),
  });
}

// The controlplane transport creates the account; the parent's callback owns dataplane secret creation.
export function ServiceAccountSelector(props: ServiceAccountSelectorProps) {
  const controlplaneTransport = useControlplaneTransport();
  return (
    <TransportProvider transport={controlplaneTransport}>
      <ServiceAccountSelectorComponent {...props} />
    </TransportProvider>
  );
}
