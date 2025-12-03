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

import { GetServiceAccountRequestSchema } from '@buf/redpandadata_cloud.bufbuild_es/redpanda/api/iam/v1/service_account_pb';
import { create } from '@bufbuild/protobuf';
import { Code } from '@connectrpc/connect';
import { Alert, AlertDescription } from 'components/redpanda-ui/components/alert';
import { Label } from 'components/redpanda-ui/components/label';
import { Skeleton } from 'components/redpanda-ui/components/skeleton';
import { Text } from 'components/redpanda-ui/components/typography';
import { AlertTriangle } from 'lucide-react';
import { useGetServiceAccountQuery } from 'react-query/api/controlplane/service-account';

type ServiceAccountDisplayProps = {
  serviceAccountId: string;
};

const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <div className="space-y-2">
    <Label>{label}</Label>
    <div className="flex h-10 items-center rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
      <Text variant="default">{value}</Text>
    </div>
  </div>
);

export const ServiceAccountDisplay = ({ serviceAccountId }: ServiceAccountDisplayProps) => {
  // Fetch service account details from Cloud API
  const {
    data: serviceAccountData,
    error: serviceAccountError,
    isLoading,
  } = useGetServiceAccountQuery(
    create(GetServiceAccountRequestSchema, { id: serviceAccountId }),
    { enabled: !!serviceAccountId, retry: 1 }
  );

  // Handle error states
  if (serviceAccountError) {
    if (serviceAccountError.code === Code.PermissionDenied) {
      return (
        <Text variant="muted">
          You don&apos;t have permission to view service account details. Contact your administrator for access.
        </Text>
      );
    }

    return (
      <Alert variant="warning">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Service account not found in Cloud API. It may have been deleted.
        </AlertDescription>
      </Alert>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    );
  }

  const serviceAccount = serviceAccountData?.serviceAccount;

  return (
    <div className="space-y-4">
      <InfoRow label="ID" value={serviceAccountId} />
      <InfoRow label="Name" value={serviceAccount?.name || 'N/A'} />
    </div>
  );
};
